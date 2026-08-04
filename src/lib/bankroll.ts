/**
 * Bankroll simulation: how far a starting balance goes.
 *
 * The per-event view prices one entry in isolation. This plays a sequence
 * instead — entries are paid from real balances, winnings go back into the
 * pot and fund further events, and the run ends when neither currency covers
 * another entry. That feedback is invisible to a per-event expectation, and it
 * is what decides how long you actually get to play.
 *
 * Gold is spent first wherever the event takes it. Gems can be bought with
 * money and gold cannot, so gold is the cheaper currency to burn.
 */

import { HOLDING_KEYS, holding, type HoldingKey } from "./holdings";
import { goldPerEvent, payoutFor } from "./payouts";
import { seededRandom } from "./rng";
import { matchWinRate } from "./structure";
import { simulateEvent } from "./simulate";
import type { EventConfig } from "./types";

export type BankrollConfig = {
  startingGems: number;
  startingGold: number;
  /**
   * Events after which a run is cut short. A profitable event never busts, so
   * without a ceiling those runs would not terminate.
   */
  maxEvents: number;
  /**
   * Whether packs, cards, points and boxes are converted to gems as they are
   * won and can fund further entries.
   *
   * They cannot in Arena — none of them buys an entry — so this is off by
   * default and winnings only count toward the ending total. Turning it on
   * asks a different question: how long could you keep playing if everything
   * you won were liquid at the rates you have set.
   */
  spendWinnings: boolean;
};

export type BankrollResult = {
  trials: number;
  /** Mean events played before running dry, counting capped runs at the cap. */
  meanEvents: number;
  eventPercentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  /** Share of runs that hit `maxEvents` rather than running out of currency. */
  survivedFraction: number;
  /**
   * The ending total broken into what it is actually made of — the two
   * balances and each reward, counted rather than valued.
   *
   * Valued at the config's rates these add back up to `meanFinalValue`
   * exactly, which is the point: the breakdown decomposes the total rather
   * than sitting beside it. That holds with `spendWinnings` off. With it on,
   * every reward is converted to gems as it is won, so their value is already
   * inside the gem balance and adding it again would count it twice — the
   * counts stay reportable, but only as a record of what passed through.
   */
  holdings: Record<HoldingKey, HoldingTotals>;
  /** Gems plus the gem value of everything won along the way. */
  meanFinalValue: number;
  /**
   * Median of the same. Worth reporting alongside the mean: a rare large prize
   * drags the mean far above any outcome a typical run actually sees.
   */
  medianFinalValue: number;
  /** Events played, bucketed for a histogram. */
  histogram: { events: number; count: number }[];
  /** Where a run ends up, in gem-equivalent terms. */
  valuePercentiles: Percentiles;
  /** Ending value binned for a histogram. */
  valueHistogram: { from: number; to: number; count: number }[];
};

export type Percentiles = { p5: number; p25: number; p50: number; p75: number; p95: number };

export type Bin = { from: number; to: number; count: number };

/** How much of one holding a run ends up with, across runs. */
export type HoldingTotals = {
  mean: number;
  /**
   * Worth reporting beside the mean for the same reason ending value is: one
   * run in fifty winning a box pulls the mean off every outcome anyone sees.
   */
  median: number;
  /** Share of runs holding any at all. */
  probAny: number;
  /** Lowest and highest across runs, which is what a bare chart cannot say. */
  min: number;
  max: number;
  histogram: Bin[];
};

/** Summarise one holding's run totals. Takes the sample already sorted. */
function totalsOf(sorted: number[], whole: boolean): HoldingTotals {
  return {
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    probAny: sorted.length ? sorted.filter((v) => v > 0).length / sorted.length : 0,
    min: sorted.length ? sorted[0] : 0,
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    histogram: whole ? binnedWhole(sorted) : binned(sorted, 16),
  };
}

/** Percentiles of an already-sorted sample. */
function percentilesOf(sorted: number[]): Percentiles {
  const at = (q: number): number =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return { p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) };
}

/**
 * Bin a sample for display. Ending value spans orders of magnitude between
 * events, so the range comes from the data rather than a fixed scale.
 */
function binned(sorted: number[], bins = 24): Bin[] {
  if (!sorted.length) return [];
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (hi === lo) return [{ from: lo, to: lo, count: sorted.length }];
  const width = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({
    from: lo + i * width,
    to: lo + (i + 1) * width,
    count: 0,
  }));
  for (const v of sorted) {
    out[Math.min(bins - 1, Math.floor((v - lo) / width))].count++;
  }
  return out;
}

/**
 * Bin a sample of whole things — packs, boxes, points.
 *
 * Bin edges land on whole numbers, and stay one wide until there are more
 * distinct values than bars to give them. Splitting the range evenly the way
 * `binned` does would put a bar boundary at four and a half boxes, and comb
 * the counts into alternating full and empty bars when the range is short.
 */
function binnedWhole(sorted: number[], bins = 16): Bin[] {
  if (!sorted.length) return [];
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const width = Math.max(1, Math.ceil((hi - lo + 1) / bins));
  const out: Bin[] = [];
  for (let from = lo; from <= hi; from += width) {
    out.push({ from, to: from + width, count: 0 });
  }
  for (const v of sorted) {
    out[Math.min(out.length - 1, Math.floor((v - lo) / width))].count++;
  }
  return out;
}

export type BankrollRun = {
  events: number;
  finalGems: number;
  finalGold: number;
  packs: number;
  draftPacks: number;
  playInPoints: number;
  playBoxes: number;
  collectorBoxes: number;
  /** True if the run was cut short by the cap rather than by going broke. */
  survived: boolean;
  /**
   * True when winnings were converted to gems as they were won, so their value
   * already sits in `finalGems` and must not be counted again.
   */
  winningsBanked: boolean;
};

/** Play from a starting balance until it runs dry or the cap is reached. */
export function simulateBankroll(
  config: EventConfig,
  bankroll: BankrollConfig,
  rand: () => number,
): BankrollRun {
  const pMatch = matchWinRate(config);
  const takesGold = config.entryCostGold > 0;
  const goldEarned = goldPerEvent(config);

  let gems = bankroll.startingGems;
  let gold = bankroll.startingGold;
  let events = 0;
  let packs = 0;
  let draftPacks = 0;
  let playInPoints = 0;
  let playBoxes = 0;
  let collectorBoxes = 0;

  while (events < bankroll.maxEvents) {
    const payWithGold = takesGold && gold >= config.entryCostGold;
    if (payWithGold) gold -= config.entryCostGold;
    else if (gems >= config.entryCostGems) gems -= config.entryCostGems;
    else break;

    const { wins } = simulateEvent(config.structure, pMatch, rand);
    const tier = payoutFor(config, wins);
    gems += tier.gems;
    // Tallied either way, so the counts stay reportable; whether their value
    // also lands in the gem balance is what the option decides.
    packs += tier.packs;
    draftPacks += config.draftPacks;
    playInPoints += tier.playInPoints ?? 0;
    playBoxes += tier.playBoxes ?? 0;
    collectorBoxes += tier.collectorBoxes ?? 0;
    if (bankroll.spendWinnings) {
      gems +=
        tier.packs * config.packValueGems +
        config.draftPacks * config.draftPackValueGems +
        (tier.playInPoints ?? 0) * config.playInPointValueGems +
        (tier.playBoxes ?? 0) * config.playBoxValueGems +
        (tier.collectorBoxes ?? 0) * config.collectorBoxValueGems;
    }
    gold += goldEarned;
    events++;
  }

  return {
    events,
    finalGems: gems,
    finalGold: gold,
    packs,
    draftPacks,
    playInPoints,
    playBoxes,
    collectorBoxes,
    survived: events >= bankroll.maxEvents,
    winningsBanked: bankroll.spendWinnings,
  };
}

/** How much of one holding a run ended with. The two balances are named. */
function heldBy(run: BankrollRun, key: HoldingKey): number {
  if (key === "gems") return run.finalGems;
  if (key === "gold") return run.finalGold;
  return run[key];
}

/**
 * Gem-equivalent value of everything a run ends holding.
 *
 * Gems, the leftover gold at the config's exchange rate, and every
 * non-currency reward at the rate the config carries. A rate of Infinity — set
 * by valuing gold at nothing — drops the gold term to zero.
 */
export function runValue(config: EventConfig, run: BankrollRun): number {
  const currency = run.finalGems + run.finalGold / config.goldPerGem;
  // Already folded into the gem balance as they were won.
  if (run.winningsBanked) return currency;
  return (
    currency +
    run.packs * config.packValueGems +
    run.draftPacks * config.draftPackValueGems +
    run.playInPoints * config.playInPointValueGems +
    run.playBoxes * config.playBoxValueGems +
    run.collectorBoxes * config.collectorBoxValueGems
  );
}

export function simulateBankrolls(
  config: EventConfig,
  bankroll: BankrollConfig,
  trials: number,
  seed = 1,
): BankrollResult {
  const rand = seededRandom(seed);
  const runs: BankrollRun[] = [];
  for (let i = 0; i < trials; i++) runs.push(simulateBankroll(config, bankroll, rand));

  const mean = (pick: (r: BankrollRun) => number): number =>
    runs.length ? runs.reduce((acc, r) => acc + pick(r), 0) / runs.length : 0;

  const sortedEvents = runs.map((r) => r.events).sort((a, b) => a - b);
  const at = (q: number): number =>
    sortedEvents.length
      ? sortedEvents[Math.min(sortedEvents.length - 1, Math.floor(q * sortedEvents.length))]
      : 0;

  const sortedValue = runs.map((r) => runValue(config, r)).sort((a, b) => a - b);
  const medianFinalValue = sortedValue.length
    ? sortedValue[Math.floor(sortedValue.length / 2)]
    : 0;


  const counts = new Map<number, number>();
  for (const e of sortedEvents) counts.set(e, (counts.get(e) ?? 0) + 1);

  return {
    trials,
    meanEvents: mean((r) => r.events),
    eventPercentiles: { p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) },
    survivedFraction: runs.length
      ? runs.filter((r) => r.survived).length / runs.length
      : 0,
    holdings: Object.fromEntries(
      HOLDING_KEYS.map((key) => [
        key,
        totalsOf(
          runs.map((r) => heldBy(r, key)).sort((a, b) => a - b),
          holding(key).whole,
        ),
      ]),
    ) as Record<HoldingKey, HoldingTotals>,
    meanFinalValue: mean((r) => runValue(config, r)),
    medianFinalValue,
    histogram: [...counts.entries()]
      .map(([events, count]) => ({ events, count }))
      .sort((a, b) => a.events - b.events),
    valuePercentiles: percentilesOf(sortedValue),
    valueHistogram: binned(sortedValue),
  };
}
