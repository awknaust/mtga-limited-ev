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

import {
  boxHoldingKey,
  isBoxHolding,
  ladderBoxes,
  priceTiers,
  tierBoxesAt,
  type LadderBoxes,
} from "./boxes";
import {
  HOLDING_KEYS,
  heldKeys,
  holding,
  holdingRate,
  paysBoxes,
  paysTokens,
  type HoldingKey,
} from "./holdings";
import { goldPerEvent, payoutFor } from "./payouts";
import { entryPrice } from "./presets";
import { seededRandom } from "./rng";
import { matchWinRate } from "./structure";
import {
  CREDIBLE_LEVEL,
  drawWinRate,
  winRateInterval,
  winRatePosterior,
} from "./uncertainty";
import type { EventConfig, EventStructure, PayoutBox } from "./types";

/**
 * Play one event. `pMatch` is the per-round win probability, and a round is a
 * match whether it is one game or up to three.
 *
 * The one place an event is played out by chance. Everything the Per event
 * tab shows is a sum over the exact outcome distribution instead
 * (`expectation.ts`); this exists because a bankroll is a *sequence* of
 * events whose entries come out of a real balance, and that walk has no
 * closed form to sum over.
 */
export function simulateEvent(
  structure: EventStructure,
  pMatch: number,
  rand: () => number,
): { wins: number; rounds: number } {
  if (structure.kind === "rounds") {
    let wins = 0;
    for (let i = 0; i < structure.rounds; i++) {
      if (rand() < pMatch) wins++;
    }
    return { wins, rounds: structure.rounds };
  }

  let wins = 0;
  let losses = 0;
  let rounds = 0;
  while (wins < structure.maxWins && losses < structure.maxLosses) {
    rounds++;
    if (rand() < pMatch) wins++;
    else losses++;
  }
  return { wins, rounds };
}

export type BankrollConfig = {
  startingGems: number;
  startingGold: number;
  /**
   * Play-in points banked before the run starts.
   *
   * The one starting balance that only ever goes down. Points are paid by a
   * couple of ladders and charged by the Qualifier Play-Ins, and no event does
   * both — so within a single run this is a stock that drains. It is why the
   * Play-In tab answers "how far do my banked points get me" rather than
   * anything about a steady state.
   */
  startingPlayInPoints: number;
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
  boxChance: PrizeChance | null;
  /**
   * The chance of coming away with a Qualifier Weekend token, where the ladder
   * pays one at all.
   *
   * Null when it does not, which is every event here but the two Play-Ins. It
   * is the only figure the app reports about tokens, and deliberately: a second
   * token is redundant, so a mean would count something nobody receives.
   */
  tokenChance: PrizeChance | null;
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
 * How often a run comes away with the prize it was played for, and how far that
 * answer moves with the win rate.
 *
 * Two prizes are asked this and both are the kind a mean cannot describe. A box
 * holding's mean of 0.21 is not an outcome anybody has: nobody is shipped a
 * fifth of a box. A token's mean fails from the other end — Wizards says every
 * token past the first is redundant, so 1.4 tokens is not 1.4 of anything
 * usable. What people arrive wanting to know is whether they get one, which is
 * a probability, and how much that probability leans on a win rate they are
 * guessing at, which is an interval.
 *
 * Every box counts together here, for the reason `boxesWon` gives. `holdings`
 * still reports them one product at a time, and it should — a collector box is
 * worth several play boxes, and two sets' play boxes are not worth the same.
 */
export type PrizeChance = {
  /** Share of runs ending with at least one of them. */
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
  /**
   * Mean gem-equivalent value of this holding across runs.
   *
   * Reported rather than left to the caller because the caller would need the
   * ladder's prices to work it out — a box holding's rate is that product's
   * own market price, not anything on the config. These sum to
   * `meanFinalValue` by construction, since `runValue` is the same sum taken
   * one run at a time.
   */
  worth: number;
};

/** Summarise one holding's run totals. Takes the sample already sorted. */
function totalsOf(sorted: number[], whole: boolean, worth: number): HoldingTotals {
  return {
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    probAny: sorted.length ? sorted.filter((v) => v > 0).length / sorted.length : 0,
    min: sorted.length ? sorted[0] : 0,
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    histogram: whole ? binnedWhole(sorted) : binned(sorted, 16),
    worth,
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

/** Shared by every logged event that paid no box, so none allocates one. */
const NO_BOXES: readonly PayoutBox[] = [];

/** One event of a run, kept only for the runs that get shown. */
export type EventLog = {
  /** Position in the run, from one. */
  event: number;
  wins: number;
  /** Matches played, whether each was one game or up to three. */
  rounds: number;
  /**
   * Which currency covered the entry.
   *
   * A three-way answer rather than the boolean it was, because the Play-Ins
   * take points as well — and which door a run went through is most of what
   * the log is for on those, where the first few entries are free in gems and
   * the rest are not.
   */
  paidWith: EntryCurrency;
  /** What the tier paid. */
  gems: number;
  packs: number;
  mythicPacks: number;
  cubePacks: number;
  playInPoints: number;
  qualifierTokens: number;
  /**
   * The boxes it paid, named — the tier's own list, not a copy.
   *
   * A count would say "two play boxes" where the ladder pays a Spider-Man box
   * and a Marvel Super Heroes box, which is the thing this log exists to show:
   * what one run actually came away with.
   */
  boxes: readonly PayoutBox[];
  /** Balances once the event is settled. */
  gemBalance: number;
  goldBalance: number;
  pointBalance: number;
};

/**
 * The three doors into an entry.
 *
 * Ordered as the simulation spends them, which is not the order they are worth:
 * points go first because they buy nothing else in Arena, so spending a banked
 * point costs nothing you could have spent elsewhere. Gold before gems is the
 * older rule and unchanged.
 */
export type EntryCurrency = "points" | "gold" | "gems";

export type BankrollRun = {
  events: number;
  /** Match wins across the whole run, counting past where the log stops. */
  wins: number;
  /** Matches played across the whole run. */
  rounds: number;
  finalGems: number;
  finalGold: number;
  packs: number;
  mythicPacks: number;
  cubePacks: number;
  draftPacks: number;
  /**
   * Play-in points held at the end — a *balance*, not a tally.
   *
   * The odd one out among these fields: the rest count what a run was paid,
   * and this is what it was paid plus what it started with less what it spent
   * on entries. It has to be, since the Play-Ins charge them; a tally would
   * report a Play-In run as gaining points it was actually burning through.
   */
  playInPoints: number;
  /** Qualifier Weekend tokens won. Redundant past the first; see the tile. */
  qualifierTokens: number;
  /**
   * Boxes won, one count per product the ladder pays, in `LadderBoxes.products`
   * order.
   *
   * Per product rather than per kind because that is what a run holds and what
   * it is worth: a Spider-Man play box and a Marvel Super Heroes play box are
   * two different objects at two different prices, and a single "2 play boxes"
   * can be priced only by picking one of them. An array rather than a map
   * because this is allocated once per run across a million of them.
   */
  boxes: number[];
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
  /**
   * The ladder's boxes counted and priced per win count, where the caller is
   * playing many runs off one config. Pricing a box is a lookup by set code,
   * and the loop below runs once per event across every run.
   */
  priced = priceTiers(config),
): BankrollRun {
  /*
   * Normalised here as well as at every way into the model, because a config
   * can also be assembled by hand — and a zero read as a price is the one
   * mistake this loop cannot survive: `gold >= 0` holds forever, so a run
   * that should have busted would play out its whole ceiling for free.
   */
  const goldPrice = entryPrice(config.entryCostGold);
  const pointPrice = entryPrice(config.entryCostPlayInPoints);
  /*
   * The gem price, and the one place "free" and "cannot be entered" come
   * apart. A `null` price is a door that does not take the currency, so an
   * event naming no price anywhere takes nothing at all, and read strictly
   * that would end every run before its first entry — a page of zeroes for a
   * config whose plain reading is that the event costs nothing. It is read as
   * free instead, paid in gems at nothing, which is also what a link written
   * back when a cleared price was spelled `0` meant by it.
   */
  const gemPrice =
    goldPrice === null && pointPrice === null
      ? (entryPrice(config.entryCostGems) ?? 0)
      : entryPrice(config.entryCostGems);
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
  let mythicPacks = 0;
  let cubePacks = 0;
  let draftPacks = 0;
  // A balance, so it opens at what was banked rather than at nothing.
  let playInPoints = bankroll.startingPlayInPoints;
  let qualifierTokens = 0;
  // One running count per box the ladder pays, in the order `priceTiers` put
  // them; zero-length when it pays none, which is every event but two.
  const boxes = new Array<number>(priced.products.length).fill(0);
  const log: EventLog[] = [];

  while (events < bankroll.maxEvents) {
    /*
     * Cheapest-to-hold first, falling through on each: a banked point buys
     * nothing else in Arena, so spending it forgoes nothing, where a gem or a
     * gold piece always could have gone somewhere else. The run busts only when
     * none of the three covers the entry, and a currency the event does not
     * take never covers it however much of it is held.
     */
    let paidWith: EntryCurrency;
    if (pointPrice !== null && playInPoints >= pointPrice) {
      playInPoints -= pointPrice;
      paidWith = "points";
    } else if (goldPrice !== null && gold >= goldPrice) {
      gold -= goldPrice;
      paidWith = "gold";
    } else if (gemPrice !== null && gems >= gemPrice) {
      gems -= gemPrice;
      paidWith = "gems";
    } else break;

    const { wins, rounds } = simulateEvent(config.structure, pMatch, rand);
    totalWins += wins;
    totalRounds += rounds;
    const tier = payoutFor(config, wins);
    gems += tier.gems;
    // Tallied but never spent: none of these buys an entry in Arena, so they
    // count toward the ending value without extending the run.
    packs += tier.packs;
    mythicPacks += tier.mythicPacks ?? 0;
    cubePacks += tier.cubePacks ?? 0;
    draftPacks += config.draftPacks;
    // Points are the exception to that: they were just spent above, and a
    // ladder that pays them puts them back into the same balance.
    playInPoints += tier.playInPoints ?? 0;
    qualifierTokens += tier.qualifierTokens ?? 0;
    const won = tierBoxesAt(priced, wins);
    for (let i = 0; i < won.length; i++) boxes[i] += won[i];
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
        paidWith,
        gems: tier.gems,
        packs: tier.packs,
        mythicPacks: tier.mythicPacks ?? 0,
        cubePacks: tier.cubePacks ?? 0,
        playInPoints: tier.playInPoints ?? 0,
        qualifierTokens: tier.qualifierTokens ?? 0,
        boxes: tier.boxes ?? NO_BOXES,
        gemBalance: gems,
        goldBalance: gold,
        pointBalance: playInPoints,
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
    mythicPacks,
    cubePacks,
    draftPacks,
    playInPoints,
    qualifierTokens,
    boxes,
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

/**
 * Which holdings a *result* can be asked about, in display order.
 *
 * `heldKeys` answers from the config, and the two can disagree for a moment:
 * a result stays on screen while the next one is simulated, so picking Arena
 * Direct hands the old result a config whose boxes it has never heard of.
 * Every reader of `holdings` goes through here rather than trusting the two
 * to agree — the stale bars simply lose their box segments until the new
 * result lands, which is what they showed a moment earlier anyway.
 */
export function reportedKeys(
  bankroll: BankrollResult,
  config: EventConfig,
  holdingGold = false,
  holdingPoints = false,
): HoldingKey[] {
  return heldKeys(config, holdingGold, holdingPoints).filter(
    (key) => key in bankroll.holdings,
  );
}

/**
 * How much of one holding a run ended with.
 *
 * The two balances are named; a box is looked up by which product it is; the
 * rest are counts the run carries under the holding's own name.
 */
export function heldBy(
  run: BankrollRun,
  key: HoldingKey,
  priced: LadderBoxes,
): number {
  if (key === "gems") return run.finalGems;
  if (key === "gold") return run.finalGold;
  if (isBoxHolding(key)) {
    const at = priced.products.findIndex((box) => boxHoldingKey(box) === key);
    return at === -1 ? 0 : (run.boxes[at] ?? 0);
  }
  return run[
    key as
      | "packs"
      | "mythicPacks"
      | "cubePacks"
      | "draftPacks"
      | "playInPoints"
      | "qualifierTokens"
  ];
}

/**
 * Gem-equivalent value of one holding at the end of a run.
 *
 * An amount times a rate throughout, boxes included — which is only true
 * because a box holding is one *product*. "Play boxes" had no rate once a
 * ladder could pay two sets of them; "Marvel Super Heroes Play boxes" has
 * exactly one.
 */
export function heldValue(
  config: EventConfig,
  run: BankrollRun,
  key: HoldingKey,
  priced: LadderBoxes,
): number {
  const amount = heldBy(run, key, priced);
  if (!isBoxHolding(key)) return amount * holdingRate(config, key);
  const at = priced.products.findIndex((box) => boxHoldingKey(box) === key);
  return at === -1 ? 0 : amount * priced.prices[at];
}

/**
 * Gem-equivalent value of everything a run ends holding.
 *
 * Gems, the leftover gold at the config's exchange rate, and every
 * non-currency reward at the rate the config carries — each box at what that
 * box is worth. A rate of 0 — valuing gold at nothing — drops the gold term
 * to zero.
 *
 * Written as a fold over the holdings rather than a sum of named terms, so
 * that the breakdown drawn beneath this total is the same arithmetic rather
 * than a second copy of it that has to be kept in step.
 */
export function runValue(
  config: EventConfig,
  run: BankrollRun,
  priced = priceTiers(config),
): number {
  let total = 0;
  for (const key of HOLDING_KEYS) total += heldValue(config, run, key, priced);
  for (let i = 0; i < priced.products.length; i++) {
    total += (run.boxes[i] ?? 0) * priced.prices[i];
  }
  return total;
}

/**
 * Gem-equivalent value of what a run starts holding: the gem balance, the
 * starting gold at the config's exchange rate, and the banked points at theirs.
 *
 * The baseline `runValue` is judged against, and every starting balance has to
 * appear in it for the same reason. Bare starting gems are the wrong one
 * wherever gold is in play — the ending value counts leftover gold, so a run
 * that began with gold would read as ahead the moment it converted — and points
 * are the sharper case, since a Play-In run *spends* them: omitting them here
 * would have twenty points turn into a 4,000-gem entry out of nowhere and call
 * it profit. As in `runValue`, a rate of 0 drops that term to zero.
 */
export function startingValue(
  config: EventConfig,
  startingGems: number,
  startingGold: number,
  startingPlayInPoints = 0,
): number {
  return (
    startingGems +
    (startingGold * config.gemsPer10kGold) / 10000 +
    startingPlayInPoints * config.playInPointValueGems
  );
}

/**
 * What the average run returned on the bankroll it started with.
 *
 * The bankroll counterpart to the per-event ROI, and it is worth being clear
 * that the two divide by different things. Per event, ROI is the net of one
 * entry over what that entry cost, and it does not care how many you play.
 * This is the whole run's gain over the whole stake, so the run length is part
 * of the answer: a profitable event compounds toward a larger number the longer
 * `maxEvents` lets it run, and a losing one grinds down toward −100%, which is
 * the floor — a run can lose the bankroll and no more.
 *
 * It is a mean return, and exactly that rather than a ratio of means standing
 * in for one: every run stakes the same bankroll, so the denominator does not
 * vary and dividing the mean ending value is identically averaging each run's
 * own return. No test pins the equality because none could fail — it is an
 * identity given a constant stake, not a property of this arithmetic.
 *
 * Which leaves the usual caveat about means, and it is a large one here. The
 * average run is not the typical one: at Arena Direct's rates a mean return of
 * −13% sits beside a median of −79%, because the runs that win a box carry the
 * average and most runs never see one. `medianFinalValue` is the figure that
 * answers for the typical run, and the value tile's percentiles are where a
 * reader meets it.
 *
 * Null when there is no bankroll to return on. Nothing sensible divides by an
 * empty wallet, and a run that starts with nothing plays no events, so the
 * figure would be 0/0 rather than large.
 */
export function bankrollRoi(meanFinalValue: number, startValue: number): number | null {
  if (startValue <= 0) return null;
  return (meanFinalValue - startValue) / startValue;
}

/**
 * Boxes a run came away with, both kinds together.
 *
 * Taken as a pair rather than one at a time because what a player is asking is
 * whether a box turns up, not which kind: a run that won a collector box and a
 * run that won a play box both came away with a box. The two are still counted
 * and priced separately everywhere else, since they are worth very different
 * amounts.
 */
const boxesWon = (run: BankrollRun): number =>
  run.boxes.reduce((acc, n) => acc + n, 0);

/** Qualifier tokens a run came away with. Redundant past the first; see below. */
const tokensWon = (run: BankrollRun): number => run.qualifierTokens;

/**
 * How many runs each end of the interval is read off.
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
 * Chance of winning a prize over a run played at one fixed win rate.
 *
 * Fixed, rather than drawn per run the way the main sample is: the interval
 * asks what the chance would be *if* the true rate were this, so the rate is
 * the one thing that must not vary between the runs answering it.
 */
function probPrizeAt(
  config: EventConfig,
  bankroll: BankrollConfig,
  won: (run: BankrollRun) => number,
  pMatch: number,
  trials: number,
  seed: number,
): number {
  const rand = seededRandom(seed);
  const priced = priceTiers(config);
  let hits = 0;
  for (let i = 0; i < trials; i++) {
    if (won(simulateBankroll(config, bankroll, rand, false, pMatch, priced)) > 0) {
      hits++;
    }
  }
  return trials ? hits / trials : 0;
}

/**
 * Summarise a prize question, or return null where the ladder never pays it.
 *
 * The point estimate comes off the main sample, which already draws a rate per
 * run and so has the uncertainty folded through it. The interval cannot: it
 * has to hold the rate still at each end, so it costs two further passes. They
 * are only paid for on a ladder that pays the thing — the Arena Directs for
 * boxes, the Play-Ins for tokens — which are the events whose entry is steep
 * enough that runs are a few events long and the passes are cheap. No preset
 * pays both, so in practice at most one prize is ever paid for.
 *
 * The two ends share a seed deliberately. Common random numbers make the gap
 * between them the work of the win rate rather than of sampling noise, which
 * is what stops a genuinely narrow interval from coming out inverted.
 *
 * Only the ends are evaluated, so this is the chance at each end of the
 * plausible rate range rather than the range of the chance. The two agree
 * whenever the prize gets easier as the win rate rises, which is every ladder
 * here — boxes and tokens both sit at the top of them. A custom ladder paying
 * a box at exactly six wins and nothing at seven would break it, since winning
 * more would then step straight past the prize, so the pair is sorted rather
 * than assumed ordered.
 *
 * Parameterised over the two rather than written twice: they differ in a
 * predicate and a counter, and everything subtle here — the shared seed, the
 * separate stream, the sort — is the part that would drift between copies.
 */
function prizeChanceOf(
  config: EventConfig,
  bankroll: BankrollConfig,
  runs: BankrollRun[],
  seed: number,
  pays: (payouts: EventConfig["payouts"]) => boolean,
  won: (run: BankrollRun) => number,
): PrizeChance | null {
  if (!pays(config.payouts)) return null;

  const counts = runs.map(won);
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
      probPrizeAt(config, bankroll, won, p, trials, seed + 1),
    );
    interval = [Math.min(...ends), Math.max(...ends)];
  }

  return {
    probAny: runs.length ? counts.filter((n) => n > 0).length / runs.length : 0,
    interval,
    level: CREDIBLE_LEVEL,
  };
}

/**
 * How many events the resumable simulation plays between yields.
 *
 * Small enough that a cancel lands within a chunk, large enough that the
 * yield itself is noise. The exact figure is not load-bearing — a yield
 * touches no simulation state — and how often a yield actually reaches the
 * event loop is the worker's decision, not this one.
 */
const CHUNK_EVENTS = 1000;

/**
 * `simulateBankrolls`, resumable: yields the completed-run count roughly
 * every `chunkEvents` simulated events, then returns the full result.
 *
 * Chunking counts events rather than runs because a run's length is a
 * setting — one run can play a single event or two thousand — and the point
 * of a chunk is a roughly even slice of work. A run is atomic: the yield
 * lands between runs, never inside one.
 *
 * The yield points touch no RNG or accumulator state, so a drain in chunks
 * of any size is bit-identical to `simulateBankrolls` — the contract that
 * lets the worker pause for cancellation without the sync tests noticing a
 * thing.
 */
export function* simulateBankrollsSteps(
  config: EventConfig,
  bankroll: BankrollConfig,
  trials: number,
  seed = 1,
  chunkEvents = CHUNK_EVENTS,
): Generator<number, BankrollResult> {
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
  const priced = priceTiers(config);
  const runs: BankrollRun[] = [];
  let eventsSinceYield = 0;
  for (let i = 0; i < trials; i++) {
    const pMatch = drawWinRate(config, posterior, rand());
    const run = simulateBankroll(config, bankroll, rand, i % stride === 0, pMatch, priced);
    runs.push(run);
    eventsSinceYield += run.events;
    if (eventsSinceYield >= chunkEvents) {
      eventsSinceYield = 0;
      yield i + 1;
    }
  }

  const mean = (pick: (r: BankrollRun) => number): number =>
    runs.length ? runs.reduce((acc, r) => acc + pick(r), 0) / runs.length : 0;

  const sortedEvents = runs.map((r) => r.events).sort((a, b) => a - b);
  const at = (q: number): number =>
    sortedEvents.length
      ? sortedEvents[Math.min(sortedEvents.length - 1, Math.floor(q * sortedEvents.length))]
      : 0;

  const sortedValue = runs.map((r) => runValue(config, r, priced)).sort((a, b) => a - b);
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
    /*
     * Every static holding, always, plus one per box the ladder pays.
     *
     * The static ones are reported whether or not the event pays them — a
     * caller reading `holdings.packs` on a ladder that pays none should get a
     * row of zeroes rather than nothing, which is the contract every reader
     * here was written against. Which *boxes* exist is genuinely a property
     * of the ladder, so those are the only conditional keys; `heldKeys`
     * decides which of the lot are worth drawing.
     */
    holdings: Object.fromEntries(
      [...HOLDING_KEYS, ...ladderBoxes(config.payouts).map(boxHoldingKey)].map((key) => [
        key,
        totalsOf(
          runs.map((r) => heldBy(r, key, priced)).sort((a, b) => a - b),
          holding(key).whole,
          mean((r) => heldValue(config, r, key, priced)),
        ),
      ]),
    ) as Record<HoldingKey, HoldingTotals>,
    boxChance: prizeChanceOf(config, bankroll, runs, seed, paysBoxes, boxesWon),
    tokenChance: prizeChanceOf(config, bankroll, runs, seed, paysTokens, tokensWon),
    meanFinalValue: mean((r) => runValue(config, r, priced)),
    medianFinalValue,
    histogram: [...counts.entries()]
      .map(([events, count]) => ({ events, count }))
      .sort((a, b) => a.events - b.events),
    valuePercentiles: percentilesOf(sortedValue),
    valueHistogram: binned(sortedValue),
    samples: labelSamples(config, runs.filter((r) => r.log !== undefined)),
  };
}

/** Monte Carlo bankroll results: `simulateBankrollsSteps` drained in one go. */
export function simulateBankrolls(
  config: EventConfig,
  bankroll: BankrollConfig,
  trials: number,
  seed = 1,
): BankrollResult {
  const gen = simulateBankrollsSteps(config, bankroll, trials, seed);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}
