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

import { payoutFor } from "./payouts";
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
};

export type BankrollResult = {
  trials: number;
  /** Mean events played before running dry, counting capped runs at the cap. */
  meanEvents: number;
  eventPercentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  /** Share of runs that hit `maxEvents` rather than running out of currency. */
  survivedFraction: number;
  meanFinalGems: number;
  meanFinalGold: number;
  meanPacks: number;
  /** Gems plus the gem value of everything won along the way. */
  meanFinalValue: number;
  /**
   * Median of the same. Worth reporting alongside the mean: a rare large prize
   * drags the mean far above any outcome a typical run actually sees.
   */
  medianFinalValue: number;
  /** Events played, bucketed for a histogram. */
  histogram: { events: number; count: number }[];
};

export type BankrollRun = {
  events: number;
  finalGems: number;
  finalGold: number;
  packs: number;
  playInPoints: number;
  playBoxes: number;
  collectorBoxes: number;
  /** True if the run was cut short by the cap rather than by going broke. */
  survived: boolean;
};

/** Play from a starting balance until it runs dry or the cap is reached. */
export function simulateBankroll(
  config: EventConfig,
  bankroll: BankrollConfig,
  rand: () => number,
): BankrollRun {
  const pMatch = matchWinRate(config);
  const takesGold = config.entryCostGold > 0;

  let gems = bankroll.startingGems;
  let gold = bankroll.startingGold;
  let events = 0;
  let packs = 0;
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
    packs += tier.packs;
    playInPoints += tier.playInPoints ?? 0;
    playBoxes += tier.playBoxes ?? 0;
    collectorBoxes += tier.collectorBoxes ?? 0;
    gold += config.goldPerEvent;
    events++;
  }

  return {
    events,
    finalGems: gems,
    finalGold: gold,
    packs,
    playInPoints,
    playBoxes,
    collectorBoxes,
    survived: events >= bankroll.maxEvents,
  };
}

/** Gem value of everything a run ends holding, winnings included. */
export function runValue(config: EventConfig, run: BankrollRun): number {
  return (
    run.finalGems +
    run.packs * config.packValueGems +
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
    meanFinalGems: mean((r) => r.finalGems),
    meanFinalGold: mean((r) => r.finalGold),
    meanPacks: mean((r) => r.packs),
    meanFinalValue: mean((r) => runValue(config, r)),
    medianFinalValue,
    histogram: [...counts.entries()]
      .map(([events, count]) => ({ events, count }))
      .sort((a, b) => a.events - b.events),
  };
}
