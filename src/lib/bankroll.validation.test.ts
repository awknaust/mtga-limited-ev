/**
 * Closed-form checks on the bankroll simulation.
 *
 * The per-event figures need no such thing: one event's outcome distribution
 * is a named distribution with a PMF you can look up, so `expectation.ts` sums
 * over it and simulates nothing. The bankroll is harder. It is a stopped random
 * walk — the entry comes out of a real balance, the payout goes back in, and
 * the run ends when the balance cannot cover another entry — so its run length
 * has no PMF in a library.
 *
 * It does have closed forms, though, and this file is seven of them. The trick
 * throughout is to *design an event* whose walk is analysable rather than to
 * find an analysis for Premier Draft:
 *
 *  1. A ±1 event reduces the balance to a gambler's-ruin walk, where the mean
 *     run length is `k / (q − p)` — no simulation, no approximation.
 *  2. Any gem-only event has an exactly computable run-length *distribution*,
 *     by pushing the balance distribution forward one event at a time. That
 *     pins the mean, the percentiles and every bar of the histogram.
 *  3. The same pass carries ending *value* alongside the balance, which pins
 *     the other histogram — the one the results panel actually leads with.
 *  4. Wald's identity ties mean ending value to mean run length for *any*
 *     event, including ones too large for (3) to enumerate.
 *  5. Gold accrues at a fixed rate per event, so which entries it pays for is
 *     arithmetic rather than chance — the one part of the loop that (1) to (4)
 *     leave untested.
 *  6. A run's length in games is a stopped sum of per-event match counts, so
 *     Wald ties its mean to the run length for any event — and where nothing
 *     can bust, the whole distribution is an exact convolution.
 *  7. An uncertain win rate makes the run length a mixture of (2) over the
 *     posterior, which is still closed form: the forward pass at a grid of
 *     Beta quantiles, averaged.
 *
 * The tolerances are derived, not tuned. Each is a stated multiple of the
 * standard error implied by the reference distribution's own variance, so
 * raising the trial count tightens them automatically and passing means the
 * simulation agrees to within sampling noise rather than to within whatever
 * happened to pass on the day. They hold across seeds, not just the ones
 * written here: every bound below was swept over 120 seeds with no failures,
 * and the closest call came in at 1.60 times its own noise floor against a
 * bound of 3. Sweeping is the only way to know that — the first draft of this
 * file carried a threshold that passed 120 seeds out of 120 and was still
 * three percent from being a coin flip, because it had been read off the one
 * seed that was written down.
 */

import { describe, expect, it } from "vitest";

import {
  ARENA_DIRECT,
  LATEST_SET,
  PREMIER_DRAFT,
  PRIOR_ALPHA,
  PRIOR_BETA,
  configFromPreset,
  defaultConfig,
  exactDistribution,
  simulateBankroll,
  simulateBankrolls,
  seededRandom,
  winRatePosterior,
  type BankrollConfig,
  type EventConfig,
  type EventStructure,
  type PayoutBox,
  type PayoutTier,
} from "./index";
import betaQuantile from "@stdlib/stats-base-dists-beta-quantile";

/* ────────────────────────────────────────────────────────────────────────
 * The reference side
 *
 * Nothing in this section calls the model's own maths. That is the point of
 * it, and it is worth being explicit about why: a reference built on
 * `exactDistribution` would be wrong in exactly the same way the simulation
 * was if `exactDistribution` were wrong, and the two would agree beautifully
 * while both were broken. A check that shares its derivation with the thing it
 * checks is not independent, whatever its tolerance says.
 *
 * So the outcome distribution here comes from walking the game tree and adding
 * up the leaves, which assumes nothing beyond "a match is won with probability
 * p, independently of the others" — no binomial, no negative binomial, no
 * stdlib. Payouts are read straight off the config's own table rather than
 * through `payoutFor`, and value is assembled from the config's rates and its
 * price table rather than through `grossValue`.
 *
 * What is still shared is the input — the configs and presets being priced —
 * and stdlib's Beta quantile, which is third-party rather than ours. Sharing
 * the question is fine; it is sharing the answer that would not be.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Probability of each final win count, by exhaustive enumeration.
 *
 * Recurses over every match that could be played, splitting at each into a win
 * and a loss and carrying the probability of the path, then collects the leaves
 * by their win count. That is a transcription of the event's *rules* — play on
 * until the ceiling or the loss limit — rather than of any formula for their
 * consequence, which is what makes it an independent answer.
 *
 * Exponential in the event's length, which is affordable here and nowhere else:
 * the longest structure in the repo is seven wins or three losses, so nine
 * matches and at most 512 paths.
 */
function outcomeDistribution(structure: EventStructure, p: number): number[] {
  const top = structure.kind === "rounds" ? structure.rounds : structure.maxWins;
  const dist = new Array<number>(top + 1).fill(0);

  const walk = (wins: number, losses: number, prob: number): void => {
    const finished =
      structure.kind === "rounds"
        ? wins + losses === structure.rounds
        : wins === structure.maxWins || losses === structure.maxLosses;
    if (finished) {
      dist[wins] += prob;
      return;
    }
    if (p > 0) walk(wins + 1, losses, prob * p);
    if (p < 1) walk(wins, losses + 1, prob * (1 - p));
  };
  walk(0, 0, 1);

  return dist;
}

/** The payout row for a win count, read off the table directly. */
const rowAt = (payouts: PayoutTier[], wins: number): PayoutTier =>
  payouts.find((t) => t.wins === wins) ?? { wins, gems: 0, packs: 0 };

/** Gems a win count pays. */
const gemsAt = (config: EventConfig, wins: number): number =>
  rowAt(config.payouts, wins).gems;

/**
 * Gems one box is worth, re-derived rather than through `boxValueGems`:
 * nothing if the generic rate for its kind is zero; otherwise the price the
 * config's own table carries for the set it names, `latest` resolved through
 * that table too; the generic rate where the table has none; and the markdown
 * off whichever of those it was, since every one is a market price and
 * selling returns less. The rule is four lines and the table is input rather
 * than the model's answer, so reading it keeps this file's promise. It has to
 * be read: a `defaultConfig()` carries the feed the app shipped with, so a
 * fresh Arena Direct really is priced set by set here, and pricing its two
 * boxes at one generic rate put the reference 6,000 gems from the simulation
 * — seven times its own noise — the day the table stopped being empty.
 */
function boxAt(config: EventConfig, box: PayoutBox): number {
  const generic =
    box.kind === "play" ? config.playBoxValueGems : config.collectorBoxValueGems;
  if (generic === 0) return 0;
  const code = box.set === LATEST_SET ? config.boxPrices.latest[box.kind] : box.set;
  const table = config.boxPrices.sets.find((s) => s.code === code)?.boxes[box.kind];
  return (table ?? generic) * (1 - config.boxMarkdown);
}

/**
 * Gem-equivalent value a win count is worth: the gems, everything the tier
 * pays as a count at the config's rate for it, each box at its own price, and
 * the cards kept from the pool, which come with the entry rather than the
 * result.
 */
function valueAt(config: EventConfig, wins: number): number {
  const row = rowAt(config.payouts, wins);
  return (
    row.gems +
    row.packs * config.packValueGems +
    (row.playInPoints ?? 0) * config.playInPointValueGems +
    (row.qualifierTokens ?? 0) * config.qualifierTokenValueGems +
    (row.boxes ?? []).reduce((acc, box) => acc + boxAt(config, box), 0) +
    config.draftPacks * config.draftPackValueGems
  );
}

const expectationOf = (dist: number[], f: (wins: number) => number): number =>
  dist.reduce((acc, p, wins) => acc + p * f(wins), 0);

const varianceOfF = (dist: number[], f: (wins: number) => number): number => {
  const mean = expectationOf(dist, f);
  return dist.reduce((acc, p, wins) => acc + p * (f(wins) - mean) ** 2, 0);
};

describe("the reference agrees with the model, by a different route", () => {
  /*
   * The section above is only worth having if it really is a second derivation,
   * so here it is held against the first. Enumeration and the named
   * distributions are not the same argument — one adds up paths, the other
   * looks up a PMF — and they land on the same numbers.
   *
   * Two things follow. The checks below this point rest on a reference that has
   * been tested rather than merely asserted, and `distribution.ts` gains an
   * independent witness it did not have.
   */
  it.each([
    ["elimination, Premier", { kind: "elimination", maxWins: 7, maxLosses: 3 }],
    ["elimination, Arena Direct", { kind: "elimination", maxWins: 7, maxLosses: 2 }],
    ["elimination, Pick Two", { kind: "elimination", maxWins: 4, maxLosses: 2 }],
    ["fixed rounds, Traditional", { kind: "rounds", rounds: 3 }],
  ] as [string, EventStructure][])("on %s", (_name, structure) => {
    for (const p of [0, 0.25, 0.45, 0.5, 0.7, 1]) {
      const walked = outcomeDistribution(structure, p);
      const named = exactDistribution(p, structure);
      expect(walked).toHaveLength(named.length);
      for (let wins = 0; wins < walked.length; wins++) {
        expect(walked[wins]).toBeCloseTo(named[wins], 12);
      }
      expect(walked.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
  });

  it("derives the same posterior the model does", () => {
    // The mixture below is built on Beta(30, 30), which the tests state
    // outright rather than ask for. This is where that number is justified: a
    // record of forty matches at an even rate, against the prior.
    const config = { ...defaultConfig(), winRate: 0.5, winRateMatches: 40 };
    expect(winRatePosterior(config)).toEqual({ alpha: 30, beta: 30 });
    expect(PRIOR_ALPHA).toBe(10);
    expect(PRIOR_BETA).toBe(10);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Shared setup
 * ──────────────────────────────────────────────────────────────────────── */

/** A config with every source of gold switched off, so entries cost gems. */
function gemsOnly(over: Partial<EventConfig> = {}): EventConfig {
  return {
    ...defaultConfig(),
    entryCostGold: null,
    gamesPerDay: 0,
    otherGoldPerDay: 0,
    draftPacks: 0,
    // The rate is a number the player knows, so every run is played at it. The
    // posterior section turns this back on deliberately.
    winRateMatches: 0,
    ...over,
  };
}

const NO_GOLD: BankrollConfig = {
  startingGems: 0,
  startingGold: 0,
  startingPlayInPoints: 0,
  maxEvents: 0,
};

/** Total variation distance between two distributions on the same support. */
const tvDistance = (a: number[], b: number[]): number =>
  a.reduce((acc, p, n) => acc + Math.abs(p - b[n]), 0) / 2;

/**
 * How far from its parent a sample of `trials` lands in total variation, on
 * average, purely from being a sample.
 *
 * Each bar's error is asymptotically normal with standard deviation
 * `√(p(1−p)/n)`, so its absolute value is half-normal with mean `√2/√π` of
 * that, and total variation is half their sum. This is the noise floor: a
 * simulation drawing from exactly the right distribution still lands here, and
 * a threshold below it is measuring the seed rather than the model.
 *
 * Worth computing rather than eyeballing. The first draft of this file used a
 * flat 0.01 against a distribution whose floor is 0.0074 — it passed on 120
 * seeds out of 120, but with the worst of them at 0.0097 it was three percent
 * from being a coin flip.
 */
const expectedTvDistance = (pmf: number[], trials: number): number =>
  pmf.reduce((acc, p) => acc + Math.sqrt((2 * p * (1 - p)) / (Math.PI * trials)), 0) / 2;

/**
 * How many noise floors a total-variation comparison is allowed.
 *
 * Three, from measurement rather than taste. Swept over 120 seeds the three
 * comparisons in this file peak at 1.30, 1.39 and 1.60 floors — the last is the
 * binned value histogram, which is noisiest because only ten of its
 * twenty-four bars carry any mass, so its total variation is a sum of few terms
 * and wanders further. Three clears all of them.
 *
 * It costs nothing in sensitivity. A real defect does not land at 1.6 floors or
 * at 3; mutating the elimination loop puts the run-length comparison at 17.
 */
const TV_FLOORS = 3;

const meanOf = (pmf: number[]): number => pmf.reduce((acc, p, n) => acc + p * n, 0);

const varianceOf = (pmf: number[]): number => {
  const mean = meanOf(pmf);
  return pmf.reduce((acc, p, n) => acc + p * (n - mean) ** 2, 0);
};

/** Exact CDF of a PMF over `0..n`, `cdf[n] = P(X ≤ n)`. */
function cdfOf(pmf: number[]): number[] {
  const out: number[] = [];
  let cum = 0;
  for (const p of pmf) {
    cum += p;
    out.push(cum);
  }
  return out;
}

/**
 * Whether a reported percentile is one the exact distribution can account for.
 *
 * Not an equality, and it is worth saying why rather than quietly widening a
 * tolerance. These are discrete quantities with fat atoms — a tenth of runs end
 * after six events — so a percentile is whichever atom the CDF happens to cross
 * q inside. One distribution here crosses 0.5 by 0.0015, a *smaller* margin
 * than a hundred thousand runs can resolve, so which side a sample lands on is
 * itself a coin flip. Demanding equality there would demand the simulation be
 * luckier than it can be.
 *
 * What can be demanded is that q lies inside the step the reported value sits
 * on, give or take the sampling error on a CDF at that level. A percentile off
 * by a whole atom fails this; one on a knife edge does not.
 */
function accountsFor(
  cdf: number[],
  support: number[],
  reported: number,
  q: number,
  trials: number,
): boolean {
  const i = support.indexOf(reported);
  if (i < 0) return false;
  const se = Math.sqrt((q * (1 - q)) / trials);
  return cdf[i] > q - 4 * se && (i === 0 ? 0 : cdf[i - 1]) < q + 4 * se;
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. Gambler's ruin
 * ──────────────────────────────────────────────────────────────────────── */

describe("gambler's ruin", () => {
  /*
   * An event built to make the balance a ±1 walk: one round, nothing for a
   * loss, twice the entry for a win. Each event moves the balance by exactly
   * one entry in one direction or the other, so a run is the textbook problem —
   * a walk from k, absorbed at 0, with no upper barrier — and its mean length
   * is k / (q − p) exactly.
   *
   * Nothing here is a plausible Arena event, which is the point twice over. The
   * simulation cannot tell it is being handed a coin flip, so agreeing with the
   * coin flip's answer is evidence about the machinery rather than about this
   * event. And the answer comes from outside the repository altogether — no
   * distribution, no forward pass, nothing this file computes — which makes it
   * the one check that a mistake shared between model and reference could not
   * survive.
   */
  const ENTRY = 1000;
  const coinFlip = (p: number): EventConfig =>
    gemsOnly({
      winRate: p,
      entryCostGems: ENTRY,
      structure: { kind: "rounds", rounds: 1 },
      payouts: [
        { wins: 0, gems: 0, packs: 0 },
        { wins: 1, gems: 2 * ENTRY, packs: 0 },
      ],
    });

  /** Mean events before ruin, from k entries' worth of balance, for p < ½. */
  const meanRuinTime = (k: number, p: number): number => k / (1 - 2 * p);

  /**
   * Variance of the same. The run is k independent first passages from one
   * unit to zero, each with variance 4pq/(q − p)³, so the variances add.
   */
  const varRuinTime = (k: number, p: number): number =>
    (k * 4 * p * (1 - p)) / (1 - 2 * p) ** 3;

  /**
   * What the two heavy walks below are allowed to take.
   *
   * They are the most expensive checks in the suite by an order of magnitude —
   * 200,000 runs over three configs, and 20,000 runs to a 20,000-event ceiling —
   * because the bounds they assert are four standard errors wide and a standard
   * error shrinks with the square root of the trial count. Cutting the trials to
   * fit a budget would widen the bounds and cost the test its teeth.
   *
   * Vitest's bare 5s default was never a budget chosen for that. It was ~94% spent
   * on CI before anything here changed, so any edit to the simulation — by anyone,
   * for any reason — tipped it over and failed a test that had found no defect.
   * This says what the tests actually need, so a real hang still fails and an
   * ordinary 5% slowdown does not.
   */
  const WALK_TIMEOUT_MS = 30_000;

  it("plays k / (q − p) events before going broke", () => {
    const trials = 200_000;
    for (const [k, p] of [
      [4, 0.4],
      [3, 0.45],
      [10, 0.25],
    ] as const) {
      const res = simulateBankrolls(
        coinFlip(p),
        {
          ...NO_GOLD,
          startingGems: k * ENTRY,
          // Far past any run this walk produces; a downward-drifting walk hits
          // zero with probability one, so nothing should reach the ceiling.
          maxEvents: 20_000,
        },
        trials,
        7,
      );

      const se = Math.sqrt(varRuinTime(k, p) / trials);
      expect(res.meanEvents).toBeGreaterThan(meanRuinTime(k, p) - 4 * se);
      expect(res.meanEvents).toBeLessThan(meanRuinTime(k, p) + 4 * se);
      // Ruin is certain, so the cap must never be what ended a run.
      expect(res.survivedFraction).toBe(0);
    }
  }, WALK_TIMEOUT_MS);

  it("never busts when the walk drifts upward, so the cap is what stops it", () => {
    // p > ½ leaves a positive chance of never hitting zero. The survivors are
    // the run-forever ones, and 1 − (q/p)^k is the classic escape probability.
    const p = 0.6;
    const k = 3;
    const trials = 20_000;
    const res = simulateBankrolls(
      coinFlip(p),
      { ...NO_GOLD, startingGems: k * ENTRY, maxEvents: 4_000 },
      trials,
      11,
    );
    const escapes = 1 - ((1 - p) / p) ** k;
    const se = Math.sqrt((escapes * (1 - escapes)) / trials);
    expect(res.survivedFraction).toBeGreaterThan(escapes - 4 * se);
    expect(res.survivedFraction).toBeLessThan(escapes + 4 * se);
  }, WALK_TIMEOUT_MS);
});

/* ────────────────────────────────────────────────────────────────────────
 * 2 and 3. The forward pass: run length and ending value
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Exact distributions of run length and ending value, by pushing the state of
 * a run forward one event at a time.
 *
 * The balance is what decides whether a run continues, and the accumulated
 * value is what it comes to, so between them they are the whole state — with no
 * gold in play, nothing else the future depends on carries between events.
 * So the joint distribution over the two can be
 * advanced by a step, with the mass that can no longer pay an entry read off as
 * it falls out. Everything still standing after `maxEvents` stopped at the cap.
 *
 * Value is tracked rather than reconstructed because it is not a function of
 * the balance: two runs holding the same gems can have won different numbers of
 * packs on the way. Carrying it is what lets this pin the *value* histogram,
 * which is the figure the results panel leads with and the one Wald's identity
 * can only reach the mean of.
 *
 * Exact rather than approximate — no discretisation, and no truncation beyond
 * the cap the simulation itself applies. The cost is the reachable state count,
 * which grows with the horizon, so the events checked with it are small.
 *
 * Only valid where the entry is gems and no gold is earned; anything else would
 * put a third dimension in the state.
 */
function exactRun(
  config: EventConfig,
  bankroll: BankrollConfig,
): { runLengths: number[]; values: Map<number, number> } {
  const wins = outcomeDistribution(config.structure, config.winRate);
  // Gems are the only door in every config this walk is run against.
  const entry = config.entryCostGems!;
  const runLengths = new Array<number>(bankroll.maxEvents + 1).fill(0);
  const values = new Map<number, number>();

  const bank = (byValue: Map<number, number>, at: number): void => {
    for (const [value, mass] of byValue) {
      runLengths[at] += mass;
      values.set(value, (values.get(value) ?? 0) + mass);
    }
  };

  // gems → accumulated value → probability.
  let live = new Map<number, Map<number, number>>([
    [bankroll.startingGems, new Map([[bankroll.startingGems, 1]])],
  ]);

  for (let n = 0; n < bankroll.maxEvents; n++) {
    const next = new Map<number, Map<number, number>>();
    for (const [gems, byValue] of live) {
      if (gems < entry) {
        bank(byValue, n);
        continue;
      }
      for (let w = 0; w < wins.length; w++) {
        if (wins[w] === 0) continue;
        const gemsAfter = gems - entry + gemsAt(config, w);
        const gained = valueAt(config, w) - entry;
        let bucket = next.get(gemsAfter);
        if (!bucket) next.set(gemsAfter, (bucket = new Map()));
        for (const [value, mass] of byValue) {
          const to = value + gained;
          bucket.set(to, (bucket.get(to) ?? 0) + mass * wins[w]);
        }
      }
    }
    live = next;
  }
  for (const byValue of live.values()) bank(byValue, bankroll.maxEvents);

  return { runLengths, values };
}

/** A value distribution as a sorted support with matching probabilities. */
function sortedValues(values: Map<number, number>): {
  support: number[];
  pmf: number[];
} {
  const support = [...values.keys()].sort((a, b) => a - b);
  return { support, pmf: support.map((v) => values.get(v) as number) };
}

const weightedMean = (support: number[], pmf: number[]): number =>
  support.reduce((acc, v, i) => acc + v * pmf[i], 0);

const weightedVariance = (support: number[], pmf: number[]): number => {
  const mean = weightedMean(support, pmf);
  return support.reduce((acc, v, i) => acc + pmf[i] * (v - mean) ** 2, 0);
};

describe("exact run-length distribution", () => {
  /*
   * A gem-only event with a real shape to it — five reachable win counts on an
   * elimination structure, a ladder that pays nothing for the first two wins
   * and better than the entry at the top. Rich enough that agreeing with it is
   * worth something, small enough that the forward pass stays cheap.
   */
  const ladder = gemsOnly({
    winRate: 0.45,
    entryCostGems: 1000,
    structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
    payouts: [
      { wins: 0, gems: 0, packs: 0 },
      { wins: 1, gems: 0, packs: 0 },
      { wins: 2, gems: 1000, packs: 0 },
      { wins: 3, gems: 1500, packs: 0 },
      { wins: 4, gems: 2500, packs: 0 },
    ],
  });
  const roll: BankrollConfig = {
    ...NO_GOLD,
    startingGems: 5_000,
    maxEvents: 60,
  };
  const trials = 100_000;

  const pmf = exactRun(ladder, roll).runLengths;
  const res = simulateBankrolls(ladder, roll, trials, 13);

  it("is a distribution", () => {
    expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("agrees with the simulated mean run length", () => {
    const se = Math.sqrt(varianceOf(pmf) / trials);
    expect(res.meanEvents).toBeGreaterThan(meanOf(pmf) - 4 * se);
    expect(res.meanEvents).toBeLessThan(meanOf(pmf) + 4 * se);
  });

  it("agrees bar for bar with the simulated histogram", () => {
    const empirical = new Array<number>(pmf.length).fill(0);
    for (const { events, count } of res.histogram) empirical[events] = count / trials;

    /*
     * Total variation distance: the largest disagreement about the probability
     * of *any* set of run lengths, which is the strongest single summary of
     * "these are the same distribution".
     *
     * Measured against the sampling floor rather than a round number picked to
     * pass: the floor is what a *correct* simulation scores, and the multiple
     * is set where 120 seeds say it has to be. See TV_FLOORS.
     */
    expect(tvDistance(empirical, pmf)).toBeLessThan(
      TV_FLOORS * expectedTvDistance(pmf, trials),
    );

    // And no single bar is off, which total variation could hide if the mass
    // were spread thin enough.
    for (let n = 0; n < pmf.length; n++) {
      const se = Math.sqrt((pmf[n] * (1 - pmf[n])) / trials);
      expect(Math.abs(empirical[n] - pmf[n])).toBeLessThan(5 * se + 1e-9);
    }
  });

  it("reports percentiles the exact CDF can account for", () => {
    const cdf = cdfOf(pmf);
    const support = pmf.map((_, n) => n);
    for (const [key, q] of [
      ["p5", 0.05],
      ["p25", 0.25],
      ["p50", 0.5],
      ["p75", 0.75],
      ["p95", 0.95],
    ] as const) {
      expect(
        accountsFor(cdf, support, res.eventPercentiles[key], q, trials),
      ).toBe(true);
    }
  });

  it("puts the whole run inside the cap where the cap is what binds", () => {
    // Same event, but the ladder pays enough that the balance drifts upward and
    // the cap is what ends most runs. The forward pass handles that case by
    // construction, so it is worth checking the simulation does too.
    const rich = { ...ladder, winRate: 0.75 };
    const exact = exactRun(rich, roll).runLengths;
    const sim = simulateBankrolls(rich, roll, 20_000, 17);
    expect(sim.survivedFraction).toBeGreaterThan(0.5);
    const se = Math.sqrt(varianceOf(exact) / 20_000);
    expect(sim.meanEvents).toBeGreaterThan(meanOf(exact) - 4 * se);
    expect(sim.meanEvents).toBeLessThan(meanOf(exact) + 4 * se);
    expect(exact[roll.maxEvents]).toBeGreaterThan(0.5);
  });
});

describe("exact ending-value distribution", () => {
  /*
   * The figure the results panel leads with, and the one Wald's identity can
   * only reach the mean of. The forward pass carries it, so the whole
   * distribution is available: mean, median, every percentile, the extremes,
   * and — since the support is small and bounded — every bar of the histogram.
   *
   * Two events, because the two halves of "ending value" fail differently.
   */

  describe("where value is the gem balance", () => {
    /*
     * A ladder whose top prize is still short of the entry, so the balance
     * strictly decreases every event and the run is finite with certainty. That
     * is what makes the ending-value support *completely* enumerable rather
     * than merely mostly: every run ends holding less than one entry, on the
     * hundred-gem lattice the payouts imply, so there are exactly ten places to
     * finish and each carries at least five percent of the mass.
     *
     * The first draft used a ladder that could pay above the entry, and it does
     * not work here. Reaching the two-hundredth event has a probability like
     * 10⁻⁶⁰ but not zero, so the exact support ran to 325,000 gems while no
     * sample ever went past 900 — and an assertion that the simulation found
     * the ends of the distribution was then asking for the impossible. Designing
     * the tail away is better than tolerating it, because it leaves the strong
     * assertions available.
     */
    const ladder = gemsOnly({
      winRate: 0.45,
      entryCostGems: 1000,
      structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
      payouts: [
        { wins: 0, gems: 0, packs: 0 },
        { wins: 1, gems: 0, packs: 0 },
        { wins: 2, gems: 300, packs: 0 },
        { wins: 3, gems: 600, packs: 0 },
        { wins: 4, gems: 900, packs: 0 },
      ],
    });
    const roll: BankrollConfig = { ...NO_GOLD, startingGems: 5_000, maxEvents: 200 };
    const trials = 100_000;

    const { support, pmf } = sortedValues(exactRun(ladder, roll).values);
    const res = simulateBankrolls(ladder, roll, trials, 41);

    it("ends below one entry, on a lattice the ladder decides", () => {
      // The support is the whole of it, not the part that happened to be
      // sampled: no run can reach the cap, so there is no tail to neglect.
      expect(res.survivedFraction).toBe(0);
      expect(support).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
      expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      // Every place is a real possibility rather than a rounding artefact,
      // which is what lets the assertions below reach the extremes.
      expect(Math.min(...pmf)).toBeGreaterThan(0.01);
    });

    it("agrees on the mean and the median ending value", () => {
      const se = Math.sqrt(weightedVariance(support, pmf) / trials);
      expect(res.meanFinalValue).toBeGreaterThan(
        weightedMean(support, pmf) - 4 * se,
      );
      expect(res.meanFinalValue).toBeLessThan(weightedMean(support, pmf) + 4 * se);
      expect(
        accountsFor(cdfOf(pmf), support, res.medianFinalValue, 0.5, trials),
      ).toBe(true);
    });

    it("agrees on every reported percentile of ending value", () => {
      const cdf = cdfOf(pmf);
      for (const [key, q] of [
        ["p5", 0.05],
        ["p25", 0.25],
        ["p50", 0.5],
        ["p75", 0.75],
        ["p95", 0.95],
      ] as const) {
        expect(accountsFor(cdf, support, res.valuePercentiles[key], q, trials)).toBe(
          true,
        );
      }
    });

    it("agrees on the whole shape, bar for bar", () => {
      /*
       * The value histogram bins on edges taken from the sample's own range, so
       * comparing it needs the reference put through the same bins rather than
       * bins of its own. The simulation reports those edges, so the exact mass
       * is assigned with the identical arithmetic and the comparison is about
       * the distribution rather than about two binning conventions.
       */
      const bins = res.valueHistogram;
      const lo = bins[0].from;
      const hi = bins[bins.length - 1].to;
      const width = (hi - lo) / bins.length;
      // The sample found the ends of the support, so nothing falls outside the
      // bins and no mass has to be clamped into them.
      expect(lo).toBe(support[0]);
      expect(hi).toBe(support[support.length - 1]);

      const exact = new Array<number>(bins.length).fill(0);
      for (let i = 0; i < support.length; i++) {
        const at = Math.min(bins.length - 1, Math.floor((support[i] - lo) / width));
        exact[at] += pmf[i];
      }
      const empirical = bins.map((b) => b.count / trials);

      expect(tvDistance(empirical, exact)).toBeLessThan(
        TV_FLOORS * expectedTvDistance(exact, trials),
      );
      for (let i = 0; i < exact.length; i++) {
        const se = Math.sqrt((exact[i] * (1 - exact[i])) / trials);
        expect(Math.abs(empirical[i] - exact[i])).toBeLessThan(5 * se + 1e-9);
      }
    });

    it("reports the same balance as a holding and as a value", () => {
      // With no gold and nothing but gems paid, the two are the same number
      // arriving by different routes — `runValue` and the holdings breakdown.
      expect(res.holdings.gems.mean).toBeCloseTo(res.meanFinalValue, 9);
      expect(res.holdings.gems.median).toBe(res.medianFinalValue);
      expect(res.holdings.gems.min).toBe(support[0]);
      expect(res.holdings.gems.max).toBe(support[support.length - 1]);
      const zero = support.indexOf(0);
      expect(res.holdings.gems.probAny).toBeCloseTo(
        zero < 0 ? 1 : 1 - pmf[zero],
        2,
      );
    });
  });

  describe("where value is gems plus what the packs are worth", () => {
    /*
     * The case the gem-only event cannot reach: two runs holding the same gems
     * can have won different numbers of packs, so ending value is not a
     * function of the ending balance. The forward pass carries both, which is
     * the only reason this is checkable at all.
     *
     * Small deliberately — three outcomes, a twelve-event cap — because the
     * reachable state count grows with the horizon once value stops tracking
     * the balance. The pack payouts are 0, 1 and 3 rather than 0, 1 and 2 so
     * that value does not collapse back into a function of the balance and the
     * event count, which a proportional ladder would let it do.
     */
    const withPacks = gemsOnly({
      winRate: 0.4,
      entryCostGems: 1000,
      packValueGems: 500,
      structure: { kind: "rounds", rounds: 2 },
      payouts: [
        { wins: 0, gems: 0, packs: 0 },
        { wins: 1, gems: 1000, packs: 1 },
        { wins: 2, gems: 2000, packs: 3 },
      ],
    });
    const roll: BankrollConfig = { ...NO_GOLD, startingGems: 4_000, maxEvents: 12 };
    const trials = 100_000;

    const { support, pmf } = sortedValues(exactRun(withPacks, roll).values);
    const res = simulateBankrolls(withPacks, roll, trials, 43);

    it("values packs into the total rather than beside it", () => {
      // Packs are won, so value must exceed the gems left over. If `runValue`
      // dropped the pack term these would be equal.
      expect(res.holdings.packs.mean).toBeGreaterThan(0);
      expect(res.meanFinalValue).toBeGreaterThan(res.holdings.gems.mean);
      expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    });

    it("agrees on the mean and the median ending value", () => {
      const se = Math.sqrt(weightedVariance(support, pmf) / trials);
      expect(res.meanFinalValue).toBeGreaterThan(
        weightedMean(support, pmf) - 4 * se,
      );
      expect(res.meanFinalValue).toBeLessThan(weightedMean(support, pmf) + 4 * se);
      expect(
        accountsFor(cdfOf(pmf), support, res.medianFinalValue, 0.5, trials),
      ).toBe(true);
    });

    it("agrees on every reported percentile of ending value", () => {
      const cdf = cdfOf(pmf);
      for (const [key, q] of [
        ["p5", 0.05],
        ["p25", 0.25],
        ["p50", 0.5],
        ["p75", 0.75],
        ["p95", 0.95],
      ] as const) {
        expect(accountsFor(cdf, support, res.valuePercentiles[key], q, trials)).toBe(
          true,
        );
      }
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 4. Wald's identity
 * ──────────────────────────────────────────────────────────────────────── */

describe("Wald's identity", () => {
  /*
   * The identity that reaches the events the forward pass cannot.
   *
   * A run's ending value is its starting balance plus the sum of per-event net
   * results, and the number of terms in that sum is a stopping time: whether
   * you sit down to event n + 1 depends on events 1..n and nothing later. Wald
   * then gives
   *
   *     E[ending value] = starting balance + E[events] · E[net per event]
   *
   * exactly — cap or no cap. It only pins the mean, which is why the forward
   * pass above exists; what it buys in exchange is reach. Premier Draft's seven
   * wins and Arena Direct's boxes are far past a state space anyone wants to
   * enumerate, and this prices them anyway.
   *
   * It is also a genuinely independent check in a second sense: the two sides
   * come from different parts of the simulation — run length from the loop and
   * the stopping rule, ending value from the payout tally and `runValue`.
   */
  it.each([
    ["Premier Draft", PREMIER_DRAFT, 20_000],
    // Pays boxes and nothing else at the top of the ladder, so its ending value
    // is not a gem balance at all.
    ["Arena Direct", ARENA_DIRECT, 80_000],
  ])("holds for %s", (_name, preset, startingGems) => {
    const config = {
      ...configFromPreset(preset, defaultConfig()),
      entryCostGold: null,
      gamesPerDay: 0,
      otherGoldPerDay: 0,
      winRateMatches: 0,
      winRate: 0.5,
    };
    const roll: BankrollConfig = { ...NO_GOLD, startingGems, maxEvents: 500 };
    const trials = 40_000;
    const res = simulateBankrolls(config, roll, trials, 23);

    const dist = outcomeDistribution(config.structure, config.winRate);
    const value = (wins: number) => valueAt(config, wins);
    const perEvent = expectationOf(dist, value) - config.entryCostGems!;
    const predicted = startingGems + res.meanEvents * perEvent;

    /*
     * The residual is the gap between the run's realised gross and its length
     * times the mean, which Wald's second identity puts a variance on:
     * E[events] · Var(gross). So the tolerance comes from the event's own
     * spread rather than from taste.
     */
    const se = Math.sqrt((res.meanEvents * varianceOfF(dist, value)) / trials);
    expect(Math.abs(res.meanFinalValue - predicted)).toBeLessThan(4 * se);
  });

  it("holds when the cap rather than the balance ends most runs", () => {
    // A ceiling low enough that few runs reach the end of their money changes
    // what the stopping time is — but not the identity, which never assumed
    // anything about how it arises.
    const config = {
      ...configFromPreset(PREMIER_DRAFT, defaultConfig()),
      entryCostGold: null,
      gamesPerDay: 0,
      otherGoldPerDay: 0,
      winRateMatches: 0,
      winRate: 0.5,
    };
    const roll: BankrollConfig = {
      ...NO_GOLD,
      startingGems: 20_000,
      maxEvents: 5,
    };
    const trials = 40_000;
    const res = simulateBankrolls(config, roll, trials, 29);
    // The premise of the case: the cap is what stops most of them.
    expect(res.survivedFraction).toBeGreaterThan(0.5);

    const dist = outcomeDistribution(config.structure, config.winRate);
    const value = (wins: number) => valueAt(config, wins);
    const predicted =
      roll.startingGems +
      res.meanEvents * (expectationOf(dist, value) - config.entryCostGems!);
    const se = Math.sqrt((res.meanEvents * varianceOfF(dist, value)) / trials);
    expect(Math.abs(res.meanFinalValue - predicted)).toBeLessThan(4 * se);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 5. Gold
 * ──────────────────────────────────────────────────────────────────────── */

describe("gold-funded entries", () => {
  /*
   * The one part of a run that is not random at all.
   *
   * Gold accrues at a fixed rate per event — the ladder is climbed by the run's
   * *expected* wins, not its actual ones — so the gold balance after n events
   * is n·g minus the entries it has paid for, whatever the cards did. Which
   * entries those are is therefore arithmetic:
   *
   *     A(n) = ⌊(n − 1)·g / G⌋
   *
   * gold-funded entries among the first n, where G is the gold price. (Gold is
   * credited after the event, which is where the −1 comes from; the step holds
   * as long as one event's gold cannot cover a whole entry.)
   *
   * Pinning it needs the rest of the run to be deterministic too, so the win
   * rate is zero and every run is the same run. No sampling error, no
   * tolerance: the assertions below are equalities, and like gambler's ruin
   * they are derived by hand rather than by anything else in this file.
   */
  const GOLD_PRICE = 5_000;
  const GOLD_PER_EVENT = 1_000;
  const ENTRY_GEMS = 750;
  const LOSS_GEMS = 50;

  const config: EventConfig = {
    ...defaultConfig(),
    winRate: 0,
    winRateMatches: 0,
    draftPacks: 0,
    entryCostGems: ENTRY_GEMS,
    entryCostGold: GOLD_PRICE,
    // One event's worth of games a day: at a win rate of zero a run is three
    // straight best-of-one losses, so three games is exactly one event and
    // the whole of `otherGoldPerDay` lands on it.
    gamesPerDay: 3,
    // At a win rate of zero the daily-win ladder pays nothing, so this is the
    // whole of the gold income and it is flat.
    otherGoldPerDay: GOLD_PER_EVENT,
    structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
    payouts: [
      { wins: 0, gems: LOSS_GEMS, packs: 0 },
      ...Array.from({ length: 7 }, (_, i) => ({ wins: i + 1, gems: 0, packs: 0 })),
    ],
  };
  const roll: BankrollConfig = {
    startingGems: 10_000,
    startingGold: 0,
    startingPlayInPoints: 0,
    maxEvents: 500,
  };

  /** Gold-funded entries among the first n. */
  const goldEntries = (n: number): number =>
    n === 0 ? 0 : Math.floor(((n - 1) * GOLD_PER_EVENT) / GOLD_PRICE);

  const gemsAfter = (n: number): number =>
    roll.startingGems + n * LOSS_GEMS - ENTRY_GEMS * (n - goldEntries(n));

  const goldAfter = (n: number): number =>
    n * GOLD_PER_EVENT - GOLD_PRICE * goldEntries(n);

  const run = simulateBankroll(config, roll, seededRandom(1));

  it("plays until neither balance covers an entry, on the closed form", () => {
    let expected = 0;
    while (
      expected < roll.maxEvents &&
      (goldAfter(expected) >= GOLD_PRICE || gemsAfter(expected) >= ENTRY_GEMS)
    ) {
      expected++;
    }
    expect(run.events).toBe(expected);
    // Pinned by hand as well, so a wrong formula and a wrong loop would have to
    // agree with each other to slip through.
    expect(run.events).toBe(17);
  });

  it("ends on the balances the arithmetic predicts", () => {
    expect(run.finalGems).toBe(gemsAfter(run.events));
    expect(run.finalGold).toBe(goldAfter(run.events));
    expect(run.finalGems).toBe(350);
    expect(run.finalGold).toBe(2_000);
  });

  it("spends gold on exactly the entries the step function names", () => {
    /*
     * The assertion that separates the currency priority from its consequences.
     * Spending gems first happens to end this run on the same event with the
     * same balances — the same three entries get paid in gold either way, just
     * later — so nothing above would notice. Which entries they were is the
     * only place the difference shows.
     */
    const logged = simulateBankroll(config, roll, seededRandom(1), true);
    const paidWithGold = logged.log!
      .filter((e) => e.paidWith === "gold")
      .map((e) => e.event);
    expect(paidWithGold).toEqual([6, 11, 16]);
    expect(paidWithGold).toHaveLength(goldEntries(run.events));
  });

  /*
   * The three-way order, derived the same way: a stock of points that drains
   * before anything else is touched.
   *
   * Points are not a flow — nothing on this ladder pays them — so the
   * arithmetic is simpler than the gold case and can be pinned exactly.
   * Sixty points at twenty an entry is three entries, and only then does the
   * run fall through to the gold-and-gems behaviour above.
   */
  const POINT_PRICE = 20;
  const pointed: EventConfig = { ...config, entryCostPlayInPoints: POINT_PRICE };

  it("drains banked points before it touches gold or gems", () => {
    const banked = { ...roll, startingPlayInPoints: 3 * POINT_PRICE };
    const logged = simulateBankroll(pointed, banked, seededRandom(1), true);
    const paidWith = logged.log!.map((e) => e.paidWith);
    // The first three entries are free in both currencies, and nothing after
    // them is paid in points, because none come back.
    expect(paidWith.slice(0, 3)).toEqual(["points", "points", "points"]);
    expect(paidWith.filter((c) => c === "points")).toHaveLength(3);
    expect(logged.log![2].pointBalance).toBe(0);
    // Gems are untouched across those three, which is the whole claim.
    expect(logged.log![2].gemBalance).toBe(roll.startingGems + 3 * LOSS_GEMS);
  });

  it("buys more than the three events the points paid for", () => {
    const banked = { ...roll, startingPlayInPoints: 3 * POINT_PRICE };
    const withPoints = simulateBankroll(pointed, banked, seededRandom(1));
    /*
     * Four more events, not three, and the extra one is the interesting part:
     * gold accrues per *event* rather than per gem spent, so the three
     * points-funded events earn their 1,000 apiece just like any other. That
     * is 3,000 gold the run would not otherwise have had, which is most of a
     * fourth entry.
     *
     * Derived rather than observed. Gold reaches the 5,000 price on events 6,
     * 11, 16 and 21 — the same five-event cadence as without points, since
     * the free entries neither spend gold nor stop it accruing — so those
     * four are gold-funded, three are points-funded, and the remaining
     * fourteen come out of gems:
     *
     *     gems = 10,000 + 21 × 50 − 750 × 14 = 550
     *     gold = 21 × 1,000 − 5,000 × 4      = 1,000
     *
     * and a twenty-second entry can be paid by none of the three.
     */
    expect(withPoints.events).toBe(21);
    expect(withPoints.events).toBe(run.events + 4);
    expect(withPoints.finalGems).toBe(550);
    expect(withPoints.finalGold).toBe(1_000);
    expect(withPoints.playInPoints).toBe(0);

    const logged = simulateBankroll(pointed, banked, seededRandom(1), true);
    expect(
      logged.log!.filter((e) => e.paidWith === "gold").map((e) => e.event),
    ).toEqual([6, 11, 16, 21]);
  });

  it("busts only when none of the three covers an entry", () => {
    // Points alone, and not enough for a second entry: the run plays exactly
    // one event and stops, because gems and gold are both empty too.
    const brokeButPointed = {
      startingGems: 0,
      startingGold: 0,
      startingPlayInPoints: POINT_PRICE,
      maxEvents: 500,
    };
    const one = simulateBankroll(pointed, brokeButPointed, seededRandom(1));
    expect(one.events).toBe(1);
    // A stray point short of the entry buys nothing at all.
    const short = simulateBankroll(
      pointed,
      { ...brokeButPointed, startingPlayInPoints: POINT_PRICE - 1 },
      seededRandom(1),
    );
    expect(short.events).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 6. Games played
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Probability of each number of matches one event lasts, by the same
 * exhaustive walk `outcomeDistribution` takes. A leaf's matches are its wins
 * plus its losses — a transcription of "the event ends when you have played
 * them" rather than of any formula for the count, which keeps this section's
 * reference independent of `meanRoundsPerEvent` and everything else in
 * `payouts.ts`.
 */
function matchesDistribution(structure: EventStructure, p: number): number[] {
  const most =
    structure.kind === "rounds"
      ? structure.rounds
      : structure.maxWins + structure.maxLosses - 1;
  const dist = new Array<number>(most + 1).fill(0);

  const walk = (wins: number, losses: number, prob: number): void => {
    const finished =
      structure.kind === "rounds"
        ? wins + losses === structure.rounds
        : wins === structure.maxWins || losses === structure.maxLosses;
    if (finished) {
      dist[wins + losses] += prob;
      return;
    }
    if (p > 0) walk(wins + 1, losses, prob * p);
    if (p < 1) walk(wins, losses + 1, prob * (1 - p));
  };
  walk(0, 0, 1);

  return dist;
}

describe("games played", () => {
  /*
   * The games figures are the run lengths again, read off each run's own match
   * count at `gamesPerMatch` games apiece. Three claims pin them. Where an
   * event is a single best-of-one match, games and events are the same number,
   * exactly. Where an event is a fixed number of matches, games are an exact
   * multiple of events — the budget conversion run backwards with no averaging
   * in it. And on an elimination event, where the match count genuinely
   * varies, the total is a stopped sum: an exact convolution pins the whole
   * distribution when nothing can bust, and Wald pins the mean when runs do.
   */

  it("counts one game per event where an event is one best-of-one match", () => {
    const flip = gemsOnly({
      winRate: 0.4,
      entryCostGems: 1000,
      structure: { kind: "rounds", rounds: 1 },
      payouts: [
        { wins: 0, gems: 0, packs: 0 },
        { wins: 1, gems: 1800, packs: 0 },
      ],
    });
    const trials = 20_000;
    const res = simulateBankrolls(
      flip,
      { ...NO_GOLD, startingGems: 3_000, maxEvents: 200 },
      trials,
      47,
    );
    // One round of one game per event, so the identity is exact — the same
    // integers summed in the same order, not two figures that happen to agree.
    expect(res.meanGames).toBe(res.meanEvents);
    expect(res.gamePercentiles).toEqual(res.eventPercentiles);
    // And the histogram is a partition of the runs, none dropped or doubled.
    expect(res.gamesHistogram.reduce((acc, b) => acc + b.count, 0)).toBe(trials);
  });

  it("scales exactly with the games a match is worth on a fixed-rounds event", () => {
    const rounds2 = gemsOnly({
      winRate: 0.4,
      entryCostGems: 1000,
      gamesPerMatch: 2.5,
      structure: { kind: "rounds", rounds: 2 },
      payouts: [
        { wins: 0, gems: 0, packs: 0 },
        { wins: 1, gems: 1000, packs: 0 },
        { wins: 2, gems: 2200, packs: 0 },
      ],
    });
    const res = simulateBankrolls(
      rounds2,
      { ...NO_GOLD, startingGems: 4_000, maxEvents: 200 },
      20_000,
      53,
    );
    // Every event is exactly two matches at two and a half games, so a run's
    // games are five times its events — percentile by percentile, since a
    // monotone scaling cannot reorder the sample.
    expect(res.meanGames).toBeCloseTo(5 * res.meanEvents, 9);
    for (const key of ["p5", "p25", "p50", "p75", "p95"] as const) {
      expect(res.gamePercentiles[key]).toBeCloseTo(5 * res.eventPercentiles[key], 12);
    }
    // The bin edges sit on the best-of-three lattice: the histogram is binned
    // in whole matches and scaled, never binned in fractional games.
    for (const bin of res.gamesHistogram) {
      expect(Number.isInteger(bin.from / 2.5)).toBe(true);
      expect(Number.isInteger(bin.to / 2.5)).toBe(true);
    }
  });

  describe("as an exact sum where the cap is the only stop", () => {
    /*
     * An event that charges nothing cannot bust, so every run plays exactly
     * `maxEvents` events — and its total match count is then a sum of that
     * many independent draws from the per-event distribution, whose exact pmf
     * is a convolution.
     *
     * This is the case that separates the true figure from its plausible
     * wrong derivation. Games *could* have been reported as the event count
     * times the event's mean length — the same conversion the budget knob
     * makes — and every mean-level check in this section would pass, because
     * the means agree. The distributions do not: here the event count is a
     * constant, so that derivation collapses to a point mass while the real
     * total spreads with every run's own eliminations. The percentile and
     * histogram checks below are where that difference is unmissable.
     */
    const EVENTS = 50;
    const trials = 20_000;
    const free = gemsOnly({
      winRate: 0.5,
      entryCostGems: null,
      structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
      payouts: [
        { wins: 0, gems: 0, packs: 0 },
        { wins: 1, gems: 0, packs: 0 },
        { wins: 2, gems: 0, packs: 0 },
        { wins: 3, gems: 0, packs: 0 },
        { wins: 4, gems: 0, packs: 0 },
      ],
    });

    /** Exact pmf of the sum of `EVENTS` independent per-event match counts. */
    const pmf = (() => {
      const per = matchesDistribution(free.structure, free.winRate);
      let sum = [1];
      for (let i = 0; i < EVENTS; i++) {
        const next = new Array<number>(sum.length + per.length - 1).fill(0);
        for (let a = 0; a < sum.length; a++) {
          if (sum[a] === 0) continue;
          for (let b = 0; b < per.length; b++) next[a + b] += sum[a] * per[b];
        }
        sum = next;
      }
      return sum;
    })();

    const res = simulateBankrolls(
      free,
      { ...NO_GOLD, startingGems: 0, maxEvents: EVENTS },
      trials,
      61,
    );

    it("is the case it claims to be: every run reaches the cap", () => {
      expect(res.survivedFraction).toBe(1);
      expect(res.eventPercentiles).toEqual({
        p5: EVENTS,
        p25: EVENTS,
        p50: EVENTS,
        p75: EVENTS,
        p95: EVENTS,
      });
      // While the games spread stays real — the point-mass derivation above
      // would put these two on the same number.
      expect(res.gamePercentiles.p95).toBeGreaterThan(res.gamePercentiles.p5);
      expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    });

    it("agrees with the simulated mean games", () => {
      const se = Math.sqrt(varianceOf(pmf) / trials);
      expect(res.meanGames).toBeGreaterThan(meanOf(pmf) - 4 * se);
      expect(res.meanGames).toBeLessThan(meanOf(pmf) + 4 * se);
    });

    it("reports percentiles the exact CDF can account for", () => {
      const cdf = cdfOf(pmf);
      const support = pmf.map((_, n) => n);
      for (const [key, q] of [
        ["p5", 0.05],
        ["p25", 0.25],
        ["p50", 0.5],
        ["p75", 0.75],
        ["p95", 0.95],
      ] as const) {
        expect(accountsFor(cdf, support, res.gamePercentiles[key], q, trials)).toBe(
          true,
        );
      }
    });

    it("agrees with the games histogram, bar for bar", () => {
      /*
       * As with the value histogram: the bins' edges come from the sample, so
       * the exact mass is assigned with the identical arithmetic and the
       * comparison is about the distribution rather than two binning
       * conventions. The clamp at both ends covers the tails the sample
       * cannot reach — fifty straight 4–0s is a possibility of the pmf and
       * not of twenty thousand runs.
       */
      const bins = res.gamesHistogram;
      const lo = bins[0].from;
      const width = bins[0].to - bins[0].from;
      const exact = new Array<number>(bins.length).fill(0);
      for (let n = 0; n < pmf.length; n++) {
        if (pmf[n] === 0) continue;
        const at = Math.min(bins.length - 1, Math.max(0, Math.floor((n - lo) / width)));
        exact[at] += pmf[n];
      }
      const empirical = bins.map((b) => b.count / trials);
      expect(tvDistance(empirical, exact)).toBeLessThan(
        TV_FLOORS * expectedTvDistance(exact, trials),
      );
    });
  });

  it.each([[1], [2.5]])(
    "ties mean games to mean events by Wald, at %s games a match",
    (perMatch) => {
      /*
       * The reach the convolution lacks, exactly as the money Wald above: with
       * busts ending runs the event count is a stopping time on the sequence
       * of events, so E[games] = E[events] · E[matches per event] · g holds
       * whatever mixture of bust and cap does the stopping, and the residual's
       * variance is Wald's second identity again — E[events] times the
       * per-event match count's own variance.
       */
      const ladder = gemsOnly({
        winRate: 0.45,
        entryCostGems: 1000,
        gamesPerMatch: perMatch,
        structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
        payouts: [
          { wins: 0, gems: 0, packs: 0 },
          { wins: 1, gems: 0, packs: 0 },
          { wins: 2, gems: 1000, packs: 0 },
          { wins: 3, gems: 1500, packs: 0 },
          { wins: 4, gems: 2500, packs: 0 },
        ],
      });
      const trials = 40_000;
      const res = simulateBankrolls(
        ladder,
        { ...NO_GOLD, startingGems: 5_000, maxEvents: 60 },
        trials,
        59,
      );

      const per = matchesDistribution(ladder.structure, ladder.winRate);
      const predicted = res.meanEvents * meanOf(per) * perMatch;
      const se = perMatch * Math.sqrt((res.meanEvents * varianceOf(per)) / trials);
      expect(Math.abs(res.meanGames - predicted)).toBeLessThan(4 * se);
    },
  );
});

/* ────────────────────────────────────────────────────────────────────────
 * 7. The win-rate posterior
 * ──────────────────────────────────────────────────────────────────────── */

describe("the win-rate posterior, inside a run", () => {
  /*
   * With the rate uncertain, a run is played at a rate drawn from the posterior
   * and held for the whole run — so the run length is a *mixture* of the
   * fixed-rate distributions, one per possible rate. The forward pass gives
   * each of those exactly, and the mixture is an integral over the Beta, so the
   * whole thing is still closed form: evaluate the pass at a fine grid of
   * posterior quantiles and average.
   *
   * This is the check that the uncertainty is wired into the bankroll at all,
   * and wired in per run rather than per event. Averaging the run length over
   * rates is not the run length at the average rate — the mixture is wider, and
   * skewed by the rates that never bust — so a simulation that drew a fresh
   * rate each event, or ignored the posterior, would land on the point
   * estimate's distribution instead.
   *
   * The mean alone does not separate those two, which is the reason the tests
   * below compare distributions. Redrawing the rate every event moves the mean
   * by under three standard errors at forty thousand runs — inside any tolerance
   * worth writing — while moving the share of runs that reach the cap by more
   * than thirty. Where a mistake hides, the assertion has to look.
   */
  const ladder = gemsOnly({
    winRate: 0.5,
    winRateMatches: 40,
    entryCostGems: 1000,
    structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
    payouts: [
      { wins: 0, gems: 0, packs: 0 },
      { wins: 1, gems: 0, packs: 0 },
      { wins: 2, gems: 1000, packs: 0 },
      { wins: 3, gems: 1500, packs: 0 },
      { wins: 4, gems: 2500, packs: 0 },
    ],
  });
  const roll: BankrollConfig = { ...NO_GOLD, startingGems: 5_000, maxEvents: 40 };

  /**
   * The run-length PMF under the posterior: the fixed-rate pass evaluated at
   * `nodes` posterior quantiles and averaged.
   *
   * Beta(30, 30) stated outright rather than asked for, so the mixture does not
   * inherit the model's own reading of the record — forty matches at an even
   * rate against a Beta(10, 10) prior. That the model agrees is asserted
   * separately, up at the top of the file.
   *
   * Stratified rather than sampled, the same trick `uncertainty.ts` uses for
   * its credible intervals: deterministic, no seed, and no Monte Carlo error on
   * the reference side of a comparison meant to measure it on the other.
   */
  function mixturePmf(nodes = 200): number[] {
    const out = new Array<number>(roll.maxEvents + 1).fill(0);
    for (let i = 0; i < nodes; i++) {
      const p = betaQuantile((i + 0.5) / nodes, 30, 30);
      const pmf = exactRun({ ...ladder, winRate: p }, roll).runLengths;
      for (let n = 0; n < out.length; n++) out[n] += pmf[n] / nodes;
    }
    return out;
  }

  const trials = 40_000;
  const mixture = mixturePmf();
  // The same event with the rate called certain: what the bankroll would
  // produce if the posterior were not reaching it. Every test below is really
  // asking which of these two the simulation matched.
  const point = exactRun({ ...ladder, winRateMatches: 0 }, roll).runLengths;
  const res = simulateBankrolls(ladder, roll, trials, 31);

  const empirical = (): number[] => {
    const out = new Array<number>(mixture.length).fill(0);
    for (const { events, count } of res.histogram) out[events] = count / trials;
    return out;
  };

  it("mixes the fixed-rate distributions over the posterior", () => {
    const se = Math.sqrt(varianceOf(mixture) / trials);
    expect(res.meanEvents).toBeGreaterThan(meanOf(mixture) - 4 * se);
    expect(res.meanEvents).toBeLessThan(meanOf(mixture) + 4 * se);
  });

  it("matches the mixture and not the point estimate", () => {
    /*
     * The two references are 0.13 apart in total variation, so this is a
     * question with a wide gap between its answers rather than a tolerance
     * being asked to adjudicate. The simulation should be a sampling error away
     * from one of them and nowhere near the other.
     */
    expect(tvDistance(mixture, point)).toBeGreaterThan(0.1);
    expect(tvDistance(empirical(), mixture)).toBeLessThan(
      TV_FLOORS * expectedTvDistance(mixture, trials),
    );
    expect(tvDistance(empirical(), mixture)).toBeLessThan(
      tvDistance(empirical(), point) / 4,
    );
  });

  it("carries the posterior into the share of runs that never go broke", () => {
    /*
     * The sharpest of the three. A rate held for a whole run means some runs are
     * played at a rate that simply cannot lose money, and those reach the cap —
     * so surviving is about a third more common than the point estimate says.
     * Averaging fresh rates within a run destroys exactly that, since no single
     * run is ever played at a lucky rate throughout.
     */
    const se = Math.sqrt(
      (mixture[roll.maxEvents] * (1 - mixture[roll.maxEvents])) / trials,
    );
    expect(res.survivedFraction).toBeGreaterThan(mixture[roll.maxEvents] - 4 * se);
    expect(res.survivedFraction).toBeLessThan(mixture[roll.maxEvents] + 4 * se);
    // And that figure is a long way from the one a certain rate would give.
    expect(mixture[roll.maxEvents]).toBeGreaterThan(point[roll.maxEvents] + 20 * se);
  });
});
