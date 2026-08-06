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

import { exactDistribution } from "./distribution";
import { BOX_KEYS, HOLDING_KEYS, holding, paysBoxes, type HoldingKey } from "./holdings";
import { goldPerEvent, payoutFor } from "./payouts";
import { seededRandom } from "./rng";
import { matchWinRate } from "./structure";
import {
  CREDIBLE_LEVEL,
  drawWinRate,
  winRateInterval,
  winRatePosterior,
} from "./uncertainty";
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
  /**
   * The ending total broken into what it is actually made of — the two
   * balances and each reward, counted rather than valued.
   *
   * Valued at the config's rates these add back up to `meanFinalValue`
   * exactly, which is the point: the breakdown decomposes the total rather
   * than sitting beside it.
   */
  holdings: Record<HoldingKey, HoldingTotals>;
  /**
   * The chance of coming away with a box, where the ladder pays one at all.
   *
   * Null when it does not, which is every event here but the Arena Directs.
   */
  boxChance: BoxChance | null;
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
  /**
   * A handful of runs kept whole, one per percentile of ending value, so the
   * summaries above have something you can actually look at underneath them.
   */
  samples: SampleRun[];
};

/**
 * How often a run comes away with a box, and how far that answer moves with
 * the win rate.
 *
 * A box is the only reason to enter an Arena Direct, and it is the one reward
 * a mean cannot describe. `holdings.playBoxes.mean` of 0.21 is not an outcome
 * anybody has: nobody is shipped a fifth of a box. The question people arrive
 * with is whether they get one, which is a probability, and how much that
 * probability leans on a win rate they are guessing at, which is an interval.
 *
 * Both kinds count together here, for the reason `BOX_KEYS` gives. `holdings`
 * still reports them apart, and it should — a collector box is worth several
 * play boxes.
 */
export type BoxChance = {
  /** Share of runs ending with at least one box, of either kind. */
  probAny: number;
  /**
   * The same chance at each end of the win rate's credible interval, or null
   * when the rate is called certain and there is no range left to report.
   *
   * The reading is "if my true rate is at the bad end of what my record
   * supports, my chance is this" — not a margin of error on the simulation.
   * That one is sampling noise and shrinks with more runs; this one does not,
   * because it is uncertainty about the player rather than about the model.
   */
  interval: [lo: number, hi: number] | null;
  /** What `interval` covers, so a caller labelling it need not assume. */
  level: number;
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

/** One event of a run, kept only for the runs that get shown. */
export type EventLog = {
  /** Position in the run, from one. */
  event: number;
  wins: number;
  /** Matches played, whether each was one game or up to three. */
  rounds: number;
  /** True when gold covered the entry, so no gems were spent on it. */
  paidWithGold: boolean;
  /** What the tier paid. */
  gems: number;
  packs: number;
  playInPoints: number;
  playBoxes: number;
  collectorBoxes: number;
  /** Balances once the event is settled. */
  gemBalance: number;
  goldBalance: number;
};

export type BankrollRun = {
  events: number;
  /** Match wins across the whole run, counting past where the log stops. */
  wins: number;
  /** Matches played across the whole run. */
  rounds: number;
  finalGems: number;
  finalGold: number;
  packs: number;
  draftPacks: number;
  playInPoints: number;
  playBoxes: number;
  collectorBoxes: number;
  /** True if the run was cut short by the cap rather than by going broke. */
  survived: boolean;
  /** Present only when the run was asked to record itself. */
  log?: EventLog[];
};

/**
 * Play from a starting balance until it runs dry or the cap is reached.
 *
 * `record` keeps an entry per event. Off by default: every other caller only
 * wants the totals, and thousands of runs each holding an object per event is
 * a great deal of rubbish to make for five of them to be read.
 */
export function simulateBankroll(
  config: EventConfig,
  bankroll: BankrollConfig,
  rand: () => number,
  record = false,
  /**
   * The win rate this run is played at, where the caller is varying it across
   * runs. Defaults to the configured rate, which is the right reading for a
   * single run asked for on its own.
   */
  pMatch = matchWinRate(config),
): BankrollRun {
  const takesGold = config.entryCostGold > 0;
  /*
   * Gold follows the drawn rate rather than the configured one, since the
   * daily-win ladder is climbed by this run's wins. A run dealt a poor rate
   * earns less gold as well as fewer gems, which is the correlation that makes
   * the bad tail as bad as it should be.
   */
  const goldEarned = goldPerEvent({ ...config, winRate: pMatch });

  let gems = bankroll.startingGems;
  let gold = bankroll.startingGold;
  let events = 0;
  let totalWins = 0;
  let totalRounds = 0;
  let packs = 0;
  let draftPacks = 0;
  let playInPoints = 0;
  let playBoxes = 0;
  let collectorBoxes = 0;
  const log: EventLog[] = [];

  while (events < bankroll.maxEvents) {
    const payWithGold = takesGold && gold >= config.entryCostGold;
    if (payWithGold) gold -= config.entryCostGold;
    else if (gems >= config.entryCostGems) gems -= config.entryCostGems;
    else break;

    const { wins, rounds } = simulateEvent(config.structure, pMatch, rand);
    totalWins += wins;
    totalRounds += rounds;
    const tier = payoutFor(config, wins);
    gems += tier.gems;
    // Tallied but never spent: none of these buys an entry in Arena, so they
    // count toward the ending value without extending the run.
    packs += tier.packs;
    draftPacks += config.draftPacks;
    playInPoints += tier.playInPoints ?? 0;
    playBoxes += tier.playBoxes ?? 0;
    collectorBoxes += tier.collectorBoxes ?? 0;
    gold += goldEarned;
    events++;
    // After the gold accrual, so a row's balances are what you would hold
    // sitting down to the next event rather than mid-settlement. A run longer
    // than the ceiling keeps its opening events and stops recording; the run
    // itself plays on, and `events` still counts all of it.
    if (record && log.length < RECORDED_EVENTS) {
      log.push({
        event: events,
        wins,
        rounds,
        paidWithGold: payWithGold,
        gems: tier.gems,
        packs: tier.packs,
        playInPoints: tier.playInPoints ?? 0,
        playBoxes: tier.playBoxes ?? 0,
        collectorBoxes: tier.collectorBoxes ?? 0,
        gemBalance: gems,
        goldBalance: gold,
      });
    }
  }

  return {
    events,
    wins: totalWins,
    rounds: totalRounds,
    finalGems: gems,
    finalGold: gold,
    packs,
    draftPacks,
    playInPoints,
    playBoxes,
    collectorBoxes,
    survived: events >= bankroll.maxEvents,
    log: record ? log : undefined,
  };
}

/**
 * How many runs are kept in full, and how much of each.
 *
 * Recording every run would be simpler and, at ordinary settings, cheaper than
 * any alternative — ten thousand short runs cost a few megabytes. It is the
 * corner that rules it out: `maxEvents` goes to two thousand, and an event that
 * cannot lose money reaches it every time, so recording everything at those
 * settings is millions of rows and hundreds of megabytes, rebuilt from scratch
 * on every keystroke. A hundred runs of two hundred and fifty events is the
 * same feature with a ceiling on it.
 */
const RECORDED_RUNS = 100;
export const RECORDED_EVENTS = 250;

/** A run kept in full, so the summaries have something underneath them. */
export type SampleRun = {
  /** Ending value, the same figure the percentiles are drawn from. */
  value: number;
  run: BankrollRun;
  /** Set on the runs standing at a percentile of the recorded sample. */
  label?: string;
};

/** Where the shortcuts point, as fractions of the recorded sample. */
const SAMPLE_AT: { label: string; q: number }[] = [
  { label: "p5", q: 0.05 },
  { label: "p25", q: 0.25 },
  { label: "median", q: 0.5 },
  { label: "p75", q: 0.75 },
  { label: "p95", q: 0.95 },
];

/**
 * Sort the kept runs by what they came to and label the landmarks.
 *
 * Ordered by ending value rather than by when they were played, so stepping
 * from one to the next walks the distribution the histogram draws instead of
 * jumping about inside it.
 */
function labelSamples(config: EventConfig, kept: BankrollRun[]): SampleRun[] {
  const samples: SampleRun[] = kept
    .map((run) => ({ value: runValue(config, run), run }))
    .sort((a, b) => a.value - b.value);

  for (const { label, q } of SAMPLE_AT) {
    const at = samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
    // Two landmarks can land on one run when few were kept; the first keeps it.
    if (at && at.label === undefined) at.label = label;
  }
  return samples;
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
  return (
    currency +
    run.packs * config.packValueGems +
    run.draftPacks * config.draftPackValueGems +
    run.playInPoints * config.playInPointValueGems +
    run.playBoxes * config.playBoxValueGems +
    run.collectorBoxes * config.collectorBoxValueGems
  );
}

/**
 * Gem-equivalent value of what a run starts holding: the gem balance plus the
 * starting gold at the config's exchange rate.
 *
 * The baseline `runValue` is judged against. Bare starting gems are the wrong
 * one wherever gold is in play — the ending value counts leftover gold, so a
 * run that began with gold would read as ahead the moment it converted. As in
 * `runValue`, a rate of Infinity drops the gold term to zero.
 */
export function startingValue(
  config: EventConfig,
  startingGems: number,
  startingGold: number,
): number {
  return startingGems + startingGold / config.goldPerGem;
}

/** Boxes a run came away with, both kinds together. */
const boxesWon = (run: BankrollRun): number => run.playBoxes + run.collectorBoxes;

/**
 * Chance that a single event pays at least one box, at a given win rate.
 *
 * Closed form, off the exact win-count distribution: a win count either pays a
 * box or it does not, so the answer is the weight the distribution puts on the
 * counts that do. No runs, no seed and no bankroll, which is what makes it
 * worth carrying beside the simulated figure — a run of one event has to agree
 * with it, and that is a check the simulation cannot perform on itself.
 */
export function boxChancePerEvent(config: EventConfig, p = matchWinRate(config)): number {
  const dist = exactDistribution(p, config.structure);
  return config.payouts.reduce(
    (acc, t) => (BOX_KEYS.some((key) => (t[key] ?? 0) > 0) ? acc + (dist[t.wins] ?? 0) : acc),
    0,
  );
}

/**
 * How many runs each end of the box interval is read off.
 *
 * Capped rather than matched to the main sample, because these are two extra
 * passes over work that already reruns on every keystroke, and a proportion
 * settles far sooner than a mean does: two thousand runs put the standard
 * error near a single point, which is finer than a figure printed to one
 * decimal place can honestly claim. Tripling a simulation that takes a second
 * at its heaviest settings, to sharpen a number nobody can read to that
 * precision, is the wrong trade.
 */
const INTERVAL_RUNS = 2000;

/**
 * Chance of a box over a run played at one fixed win rate.
 *
 * Fixed, rather than drawn per run the way the main sample is: the interval
 * asks what the chance would be *if* the true rate were this, so the rate is
 * the one thing that must not vary between the runs answering it.
 */
function probBoxAt(
  config: EventConfig,
  bankroll: BankrollConfig,
  pMatch: number,
  trials: number,
  seed: number,
): number {
  const rand = seededRandom(seed);
  let hits = 0;
  for (let i = 0; i < trials; i++) {
    if (boxesWon(simulateBankroll(config, bankroll, rand, false, pMatch)) > 0) hits++;
  }
  return trials ? hits / trials : 0;
}

/**
 * Summarise the box question, or return null where the ladder pays no boxes.
 *
 * The point estimate comes off the main sample, which already draws a rate per
 * run and so has the uncertainty folded through it. The interval cannot: it
 * has to hold the rate still at each end, so it costs two further passes. They
 * are only paid for on a ladder that pays boxes, which in practice means the
 * Arena Directs — the events whose entry is steep enough that runs are a few
 * events long and the passes are cheap.
 *
 * The two ends share a seed deliberately. Common random numbers make the gap
 * between them the work of the win rate rather than of sampling noise, which
 * is what stops a genuinely narrow interval from coming out inverted.
 *
 * Only the ends are evaluated, so this is the chance at each end of the
 * plausible rate range rather than the range of the chance. The two agree
 * whenever a box gets easier as the win rate rises, which is every ladder here
 * — boxes sit at the top of them. A custom ladder paying a box at exactly six
 * wins and nothing at seven would break it, since winning more would then step
 * straight past the prize, so the pair is sorted rather than assumed ordered.
 */
function boxChanceOf(
  config: EventConfig,
  bankroll: BankrollConfig,
  runs: BankrollRun[],
  seed: number,
): BoxChance | null {
  if (!paysBoxes(config.payouts)) return null;

  const boxes = runs.map(boxesWon);
  const posterior = winRatePosterior(config);
  const trials = Math.min(runs.length, INTERVAL_RUNS);

  let interval: [number, number] | null = null;
  if (posterior && trials > 0) {
    /*
     * A stream of its own rather than the main sample's, which by here has
     * been advanced a variable number of times and would make the ends depend
     * on how long the runs before them happened to be.
     */
    const ends = winRateInterval(posterior).map((p) =>
      probBoxAt(config, bankroll, p, trials, seed + 1),
    );
    interval = [Math.min(...ends), Math.max(...ends)];
  }

  return {
    probAny: runs.length ? boxes.filter((n) => n > 0).length / runs.length : 0,
    interval,
    level: CREDIBLE_LEVEL,
  };
}

export function simulateBankrolls(
  config: EventConfig,
  bankroll: BankrollConfig,
  trials: number,
  seed = 1,
): BankrollResult {
  const rand = seededRandom(seed);
  /*
   * Which runs to keep, spread across the whole sequence rather than taken off
   * the front. A stride rather than a coin flip: the flip would have to come
   * from somewhere, and drawing it from `rand` would shift every number the
   * simulation produces, while a second generator buys nothing a stride does
   * not already give — an even spread, exactly the intended count, and the
   * same runs every time for a seed.
   */
  const stride = Math.max(1, Math.ceil(trials / RECORDED_RUNS));
  /*
   * Drawn once per run, not once per event. A player has one true win rate they
   * do not know, so it is fixed for the whole of a possible future and varies
   * between futures — which is what puts the uncertainty about the rate into
   * the spread of where a bankroll ends up, alongside the luck within it.
   *
   * Null when the rate is called certain, and every run is then played at it.
   */
  const posterior = winRatePosterior(config);
  const runs: BankrollRun[] = [];
  for (let i = 0; i < trials; i++) {
    const pMatch = drawWinRate(config, posterior, rand());
    runs.push(simulateBankroll(config, bankroll, rand, i % stride === 0, pMatch));
  }

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
    boxChance: boxChanceOf(config, bankroll, runs, seed),
    meanFinalValue: mean((r) => runValue(config, r)),
    medianFinalValue,
    histogram: [...counts.entries()]
      .map(([events, count]) => ({ events, count }))
      .sort((a, b) => a.events - b.events),
    valuePercentiles: percentilesOf(sortedValue),
    valueHistogram: binned(sortedValue),
    samples: labelSamples(config, runs.filter((r) => r.log !== undefined)),
  };
}
