import { describe, expect, it } from "vitest";
import {
  ARENA_DIRECT,
  CONTENDER_DRAFT,
  PREMIER_CUBE_DRAFT,
  DAILY_WIN_GOLD,
  DEFAULT_OTHER_GOLD_PER_DAY,
  DEFAULT_EVENTS_PER_DAY,
  DEFAULT_DRAFT_PACK_VALUE_GEMS,
  DEFAULT_PACK_VALUE_GEMS,
  DEFAULT_PLAY_IN_POINT_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  GEMS_PER_USD,
  GOLD_PER_GEM,
  PICK_TWO_DRAFT,
  PREMIER_DRAFT,
  PRESETS,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_CUBE_DRAFT,
  TRADITIONAL_DRAFT,
  bo3WinRate,
  gameWinRateForMatchRate,
  breakEvenWinRate,
  configFromPreset,
  defaultConfig,
  exactDistribution,
  expectedNet,
  expectedNetAt,
  effectiveEntryGems,
  goldFundedFraction,
  dailyWinGold,
  goldPerEvent,
  meanWinsPerEvent,
  grossValue,
  matchWinRate,
  maxPossibleWins,
  maxRounds,
  HOLDING_KEYS,
  heldKeys,
  holdingRate,
  paidRewards,
  playInPointsFor,
  resizePayouts,
  simulate,
  simulateBankroll,
  simulateBankrolls,
  runValue,
  seededRandom,
  type EventStructure,
} from "./index";

const ELIM: EventStructure = { kind: "elimination", maxWins: 7, maxLosses: 3 };

describe("exactDistribution — elimination", () => {
  it("sums to 1", () => {
    for (const p of [0, 0.25, 0.5, 0.62, 0.9, 1]) {
      const total = exactDistribution(p, ELIM).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("puts all mass on 0 wins at p=0 and on 7 wins at p=1", () => {
    expect(exactDistribution(0, ELIM)[0]).toBeCloseTo(1, 12);
    expect(exactDistribution(1, ELIM)[7]).toBeCloseTo(1, 12);
  });

  it("matches hand-computed values at p=0.5", () => {
    const d = exactDistribution(0.5, ELIM);
    // 0 wins: lose the first three games outright.
    expect(d[0]).toBeCloseTo(0.125, 12);
    // 1 win: C(3,1) orderings of (W,L,L) with the last game a loss = 3 * 0.5^4.
    expect(d[1]).toBeCloseTo(3 * 0.0625, 12);
    // 7 wins: sum over 0, 1, 2 losses.
    expect(d[7]).toBeCloseTo(1 * 0.5 ** 7 + 7 * 0.5 ** 8 + 28 * 0.5 ** 9, 12);
  });
});

describe("exactDistribution — fixed rounds", () => {
  const rounds: EventStructure = { kind: "rounds", rounds: 3 };

  it("sums to 1", () => {
    for (const p of [0, 0.3, 0.5, 0.77, 1]) {
      const total = exactDistribution(p, rounds).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("is binomial", () => {
    const d = exactDistribution(0.5, rounds);
    expect(d).toHaveLength(4);
    expect(d[0]).toBeCloseTo(0.125, 12);
    expect(d[1]).toBeCloseTo(0.375, 12);
    expect(d[2]).toBeCloseTo(0.375, 12);
    expect(d[3]).toBeCloseTo(0.125, 12);
  });

  it("gives every win count non-zero mass, unlike elimination", () => {
    // A 0-2 start still plays round three, so 1-2 and 2-1 stay reachable.
    for (const p of [0.4, 0.6]) {
      for (const mass of exactDistribution(p, rounds)) expect(mass).toBeGreaterThan(0);
    }
  });
});

describe("bo3WinRate", () => {
  it("keeps the fixed points 0, 0.5 and 1", () => {
    expect(bo3WinRate(0)).toBeCloseTo(0, 12);
    expect(bo3WinRate(0.5)).toBeCloseTo(0.5, 12);
    expect(bo3WinRate(1)).toBeCloseTo(1, 12);
  });

  it("amplifies an edge — the better deck wins more often over three games", () => {
    expect(bo3WinRate(0.55)).toBeCloseTo(0.57475, 10);
    expect(bo3WinRate(0.6)).toBeGreaterThan(0.6);
    expect(bo3WinRate(0.4)).toBeLessThan(0.4);
  });

  it("equals P(2-0) + P(2-1)", () => {
    const p = 0.62;
    const straight = p * p;
    const comeback = 2 * p * p * (1 - p);
    expect(bo3WinRate(p)).toBeCloseTo(straight + comeback, 12);
  });

  it("inverts back to the game rate", () => {
    for (const p of [0, 0.12, 0.4, 0.5, 0.55, 0.83, 1]) {
      expect(gameWinRateForMatchRate(bo3WinRate(p))).toBeCloseTo(p, 9);
    }
  });

  it("inverting a match rate reproduces it", () => {
    // The direction the match slider actually drives.
    for (const m of [0.05, 0.3, 0.5, 0.6, 0.95]) {
      expect(bo3WinRate(gameWinRateForMatchRate(m))).toBeCloseTo(m, 9);
    }
  });

  it("keeps the endpoints exact", () => {
    expect(gameWinRateForMatchRate(0)).toBe(0);
    expect(gameWinRateForMatchRate(1)).toBe(1);
    expect(gameWinRateForMatchRate(0.5)).toBeCloseTo(0.5, 9);
  });

  it("needs a lower game rate than the match rate it produces", () => {
    // Above 50% the format amplifies, so reaching a 60% match rate takes less
    // than 60% of games.
    expect(gameWinRateForMatchRate(0.6)).toBeLessThan(0.6);
    expect(gameWinRateForMatchRate(0.4)).toBeGreaterThan(0.4);
  });

  it("is applied only for bo3 configs", () => {
    const bo1 = { ...defaultConfig(), winRate: 0.55, format: "bo1" as const };
    expect(matchWinRate(bo1)).toBeCloseTo(0.55, 12);
    expect(matchWinRate({ ...bo1, format: "bo3" })).toBeCloseTo(0.57475, 10);
  });
});

describe("simulate", () => {
  it("converges to the closed-form distribution (elimination)", () => {
    const config = { ...defaultConfig(), winRate: 0.58 };
    const res = simulate(config, 200_000, 42);
    for (const b of res.buckets) {
      expect(Math.abs(b.probability - b.exactProbability)).toBeLessThan(0.005);
    }
    expect(Math.abs(res.meanNet - res.exactMeanNet)).toBeLessThan(150);
  });

  it("converges to the closed-form distribution (fixed rounds, BO3)", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    const res = simulate(config, 200_000, 7);
    for (const b of res.buckets) {
      expect(Math.abs(b.probability - b.exactProbability)).toBeLessThan(0.005);
    }
    expect(Math.abs(res.meanNet - res.exactMeanNet)).toBeLessThan(150);
  });

  it("always plays every round of a fixed-rounds event", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    expect(simulate(config, 20_000, 3).meanRounds).toBe(3);
    // Even a hopeless run plays all three.
    expect(simulate({ ...config, winRate: 0 }, 5_000, 3).meanRounds).toBe(3);
  });

  it("stops early in an elimination event", () => {
    const res = simulate(defaultConfig(), 20_000, 3);
    expect(res.meanRounds).toBeLessThanOrEqual(9);
    expect(res.meanRounds).toBeGreaterThan(0);
    // A 0% win rate busts out after exactly maxLosses games.
    expect(simulate({ ...defaultConfig(), winRate: 0 }, 1_000, 3).meanRounds).toBe(3);
  });

  it("sizes the outcome table to the structure", () => {
    expect(simulate(defaultConfig(), 100, 1).buckets).toHaveLength(8);
    expect(
      simulate(configFromPreset(TRADITIONAL_DRAFT, defaultConfig()), 100, 1).buckets,
    ).toHaveLength(4);
  });

  it("is deterministic for a given seed", () => {
    const config = defaultConfig();
    expect(simulate(config, 5_000, 7).meanNet).toBe(simulate(config, 5_000, 7).meanNet);
  });
});

describe("structure helpers", () => {
  it("reports the reachable win ceiling", () => {
    expect(maxPossibleWins(ELIM)).toBe(7);
    expect(maxPossibleWins({ kind: "rounds", rounds: 3 })).toBe(3);
  });

  it("reports the longest possible run", () => {
    // 6 wins and 2 losses, then a decider.
    expect(maxRounds(ELIM)).toBe(9);
    expect(maxRounds({ kind: "rounds", rounds: 3 })).toBe(3);
  });
});

describe("resizePayouts", () => {
  it("keeps overlapping rows and pads new ones with zeros", () => {
    const grown = resizePayouts(TRADITIONAL_DRAFT.payouts, 7);
    expect(grown).toHaveLength(8);
    // Play-in points survive the resize along with the rest of the row.
    expect(grown[3]).toEqual({ wins: 3, gems: 2500, packs: 6, playInPoints: 2 });
    expect(grown[7]).toEqual({ wins: 7, gems: 0, packs: 0 });
  });

  it("truncates when the ceiling drops", () => {
    const shrunk = resizePayouts(PREMIER_DRAFT.payouts, 3);
    expect(shrunk).toHaveLength(4);
    expect(shrunk[3]).toEqual({ wins: 3, gems: 1000, packs: 2 });
  });

  it("does not alias the source rows", () => {
    const resized = resizePayouts(PREMIER_DRAFT.payouts, 7);
    resized[0].gems = 99999;
    expect(PREMIER_DRAFT.payouts[0].gems).toBe(50);
  });
});

describe("breakEvenWinRate", () => {
  it("finds the rate where expected value crosses zero", () => {
    const config = defaultConfig();
    const be = breakEvenWinRate(config);
    expect(be).not.toBeNull();
    expect(expectedNetAt(config, be!)).toBeCloseTo(0, 4);
    expect(expectedNetAt(config, be! - 0.02)).toBeLessThan(0);
    expect(expectedNetAt(config, be! + 0.02)).toBeGreaterThan(0);
  });

  it("works for fixed-rounds BO3 events", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    const be = breakEvenWinRate(config);
    expect(be).not.toBeNull();
    expect(expectedNetAt(config, be!)).toBeCloseTo(0, 4);
  });

  it("returns null when the top payout can never cover the entry", () => {
    const config = { ...defaultConfig(), entryCostGems: 10000 };
    expect(breakEvenWinRate(config)).toBeNull();
    expect(expectedNetAt(config, 1)).toBeLessThan(0);
  });

  it("returns null when the event is profitable at any win rate", () => {
    expect(breakEvenWinRate({ ...defaultConfig(), entryCostGems: 0 })).toBeNull();
  });
});

describe("drafted cards", () => {
  it("values a pack of drafted cards off the rare slot", () => {
    // (6/7 x 20) + (1/7 x 40) = 160/7. Above the booster figure, which loses
    // some of its rare slots to wildcards.
    expect(DEFAULT_DRAFT_PACK_VALUE_GEMS).toBe(Math.round(160 / 7));
    expect(DEFAULT_DRAFT_PACK_VALUE_GEMS).toBeGreaterThan(DEFAULT_PACK_VALUE_GEMS);
  });

  it("keeps cards from drafts and sealed, none from phantom events", () => {
    expect(PREMIER_DRAFT.draftPacks).toBe(3);
    expect(SEALED.draftPacks).toBe(6);
    // Both cubes are phantom: you play with the cards, you do not keep them.
    expect(PREMIER_CUBE_DRAFT.draftPacks).toBe(0);
    expect(TRADITIONAL_CUBE_DRAFT.draftPacks).toBe(0);
    expect(ARENA_DIRECT.draftPacks).toBe(0);
  });

  it("adds the same card value at every win count", () => {
    // The pool is yours for entering, not for winning.
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const bare = { ...config, draftPacks: 0 };
    for (const wins of [0, 3, 7]) {
      expect(grossValue(config, wins) - grossValue(bare, wins)).toBeCloseTo(
        3 * config.draftPackValueGems,
        9,
      );
    }
  });

  it("leaves phantom events untouched by the card rate", () => {
    const cube = configFromPreset(PREMIER_CUBE_DRAFT, defaultConfig());
    expect(expectedNetAt(cube, 0.55)).toBeCloseTo(
      expectedNetAt({ ...cube, draftPackValueGems: 9999 }, 0.55),
      9,
    );
  });

  it("accumulates cards across a bankroll run", () => {
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const run = simulateBankroll(
      config,
      { startingGems: 10_000, startingGold: 0, maxEvents: 5, spendWinnings: false },
      seededRandom(21),
    );
    expect(run.draftPacks).toBe(run.events * 3);
  });
});

describe("holdings", () => {
  it("lists what a ladder pays, and only that", () => {
    expect(paidRewards(PREMIER_DRAFT.payouts)).toEqual(["packs"]);
    expect(paidRewards(TRADITIONAL_DRAFT.payouts)).toEqual(["packs", "playInPoints"]);
    expect(paidRewards(ARENA_DIRECT.payouts)).toEqual(["packs", "playBoxes"]);
    // Zeroing the tiers retires the reward, whatever the conversion rate is.
    const gemsOnly = PREMIER_DRAFT.payouts.map((t) => ({ ...t, packs: 0 }));
    expect(paidRewards(gemsOnly)).toEqual([]);
  });

  it("shows the balances alongside whatever the event pays", () => {
    const premier = configFromPreset(PREMIER_DRAFT, defaultConfig());
    // Gems always, gold because it accrues daily whatever the event charges,
    // and drafted cards because the pool is yours to keep.
    expect(heldKeys(premier)).toEqual(["gems", "gold", "packs", "draftPacks"]);

    // Arena Direct is phantom and gem-priced, but gold still piles up.
    const direct = configFromPreset(ARENA_DIRECT, defaultConfig());
    expect(heldKeys(direct)).toEqual(["gems", "gold", "packs", "playBoxes"]);

    // No gold earned and none charged: nothing to report, unless a starting
    // balance the event cannot spend is sitting there. Zero events a day is
    // what stops the accrual now that daily-win gold comes off the ladder —
    // an event that is never played wins nothing to climb it with.
    const noGold = { ...direct, eventsPerDay: 0 };
    expect(heldKeys(noGold)).toEqual(["gems", "packs", "playBoxes"]);
    expect(heldKeys(noGold, true)).toContain("gold");
  });

  it("prices each holding off its own rate", () => {
    const config = defaultConfig();
    // Gems are the unit, so they are worth themselves.
    expect(holdingRate(config, "gems")).toBe(1);
    expect(holdingRate(config, "gold")).toBeCloseTo(1 / GOLD_PER_GEM, 12);
    expect(holdingRate(config, "packs")).toBe(DEFAULT_PACK_VALUE_GEMS);
    expect(holdingRate(config, "playInPoints")).toBe(DEFAULT_PLAY_IN_POINT_VALUE_GEMS);
    expect(holdingRate(config, "playBoxes")).toBe(DEFAULT_PLAY_BOX_VALUE_GEMS);
    expect(holdingRate(config, "collectorBoxes")).toBe(DEFAULT_COLLECTOR_BOX_VALUE_GEMS);
    expect(holdingRate(config, "draftPacks")).toBe(DEFAULT_DRAFT_PACK_VALUE_GEMS);
    // Gold valued at nothing drops out rather than blowing up, the same way
    // runValue treats it.
    expect(holdingRate({ ...config, goldPerGem: Infinity }, "gold")).toBe(0);
  });
});

describe("bankroll", () => {
  const roll = {
    startingGems: 10_000,
    startingGold: 0,
    maxEvents: 500,
    spendWinnings: false,
  };

  it("stops when neither currency covers another entry", () => {
    // No gold income and a hopeless win rate: entries come only from the
    // starting gems, so the run length is exactly what they buy.
    const config = { ...defaultConfig(), winRate: 0, eventsPerDay: 0 };
    const run = simulateBankroll(config, roll, seededRandom(1));
    // Fully determined: 1,500 out and 50 back each time, so 10,000 buys six
    // entries and leaves 1,300 — short of a seventh.
    expect(run.events).toBe(6);
    expect(run.finalGems).toBe(10_000 - 6 * 1500 + 6 * 50);
    expect(run.finalGems).toBeLessThan(config.entryCostGems);
    expect(run.survived).toBe(false);
  });

  it("plays longer when winnings feed back in", () => {
    const poor = { ...defaultConfig(), winRate: 0.2, eventsPerDay: 0 };
    const good = { ...defaultConfig(), winRate: 0.7, eventsPerDay: 0 };
    const a = simulateBankrolls(poor, roll, 300, 3);
    const b = simulateBankrolls(good, roll, 300, 3);
    expect(b.meanEvents).toBeGreaterThan(a.meanEvents);
  });

  it("spends gold before gems where the event takes it", () => {
    // Gold alone covers every entry, so the gems are never touched.
    const config = { ...defaultConfig(), eventsPerDay: 0 };
    const golden = {
      startingGems: 10_000,
      startingGold: 100_000,
      maxEvents: 10,
      spendWinnings: false,
    };
    const run = simulateBankroll(config, golden, seededRandom(2));
    expect(run.events).toBe(10);
    expect(run.finalGems).toBeGreaterThanOrEqual(10_000);
  });

  it("runs to the cap when the event cannot lose money", () => {
    const config = { ...defaultConfig(), winRate: 1 };
    const res = simulateBankrolls(config, { ...roll, maxEvents: 40 }, 50, 4);
    expect(res.meanEvents).toBe(40);
    expect(res.survivedFraction).toBe(1);
  });

  it("cannot fund entries from packs unless told to", () => {
    // Packs and cards are not currency in Arena, so by default they pile up
    // without extending the run.
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const held = simulateBankrolls(config, roll, 400, 31);
    const spent = simulateBankrolls(config, { ...roll, spendWinnings: true }, 400, 31);
    expect(spent.meanEvents).toBeGreaterThan(held.meanEvents);
    expect(held.holdings.packs.mean).toBeGreaterThan(0);
    /*
     * And the extra entries win extra packs, which is half of why the
     * breakdown refuses to itemise a liquidated run: the count is not what
     * this event pays, it is that plus what the entries it funded paid. The
     * other half is that their value already sits in the gem balance.
     */
    expect(spent.holdings.packs.mean).toBeGreaterThan(held.holdings.packs.mean);
  });

  it("breaks the ending total into what it is made of", () => {
    /*
     * The claim the breakdown rests on: itemising loses nothing. Every
     * holding valued at its own rate and added up is the gem-equivalent
     * figure shown beside it, to the last gem.
     */
    for (const preset of [PREMIER_DRAFT, TRADITIONAL_DRAFT, ARENA_DIRECT, SEALED]) {
      const config = configFromPreset(preset, defaultConfig());
      const res = simulateBankrolls(config, { ...roll, startingGems: 20_000 }, 200, 23);
      const summed = HOLDING_KEYS.reduce(
        (acc, key) => acc + res.holdings[key].mean * holdingRate(config, key),
        0,
      );
      expect(summed).toBeCloseTo(res.meanFinalValue, 6);
    }
  });

  it("holds gems and gold as balances, not as counts", () => {
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const res = simulateBankrolls(config, roll, 300, 19);
    // Gold accrues every event and buys entries at 10,000 a time, so a run
    // ends holding some of both.
    expect(res.holdings.gems.mean).toBeGreaterThan(0);
    expect(res.holdings.gold.mean).toBeGreaterThan(0);
    // A balance is binned rather than tallied, so its bars need not be whole.
    expect(res.holdings.gems.histogram.length).toBeGreaterThan(1);
    expect(res.holdings.gems.min).toBeLessThanOrEqual(res.holdings.gems.median);
    expect(res.holdings.gems.median).toBeLessThanOrEqual(res.holdings.gems.max);
  });

  it("counts every reward a run wins, not just packs", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    const res = simulateBankrolls(config, roll, 300, 19);
    expect(res.holdings.packs.mean).toBeGreaterThan(0);
    expect(res.holdings.playInPoints.mean).toBeGreaterThan(0);
    expect(res.holdings.draftPacks.mean).toBeGreaterThan(0);
    // Traditional Draft pays no physical product, so there is nothing to show.
    expect(res.holdings.playBoxes.mean).toBe(0);
    expect(res.holdings.playBoxes.probAny).toBe(0);
  });

  it("bins whole things on whole boundaries", () => {
    const config = configFromPreset(ARENA_DIRECT, defaultConfig());
    const res = simulateBankrolls(config, { ...roll, startingGems: 60_000 }, 300, 29);
    const boxes = res.holdings.playBoxes;
    // Nobody wins half a box, so no bar may start or end at one.
    for (const bin of boxes.histogram) {
      expect(Number.isInteger(bin.from)).toBe(true);
      expect(Number.isInteger(bin.to)).toBe(true);
    }
    expect(boxes.histogram[0].from).toBe(boxes.min);
    expect(boxes.histogram.at(-1)!.to).toBeGreaterThan(boxes.max);
  });

  it("keeps a sample of runs in full, ordered by what they came to", () => {
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const res = simulateBankrolls(config, roll, 400, 19);

    // A hundred kept out of four hundred played, and the rest carry no log.
    expect(res.samples).toHaveLength(100);
    // Drawn across the whole sequence rather than off the front.
    expect(simulateBankrolls(config, roll, 20, 19).samples).toHaveLength(20);
    expect(res.samples.every((s) => s.run.log !== undefined)).toBe(true);

    const values = res.samples.map((s) => s.value);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    // Landmarks in the same order, so stepping between them goes one way.
    const labelled = res.samples.filter((s) => s.label !== undefined);
    expect(labelled.map((s) => s.label)).toEqual(["p5", "p25", "median", "p75", "p95"]);
  });

  it("logs an event per event, and the balances it left behind", () => {
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const res = simulateBankrolls(config, roll, 200, 23);
    for (const { run, value } of res.samples) {
      const log = run.log ?? [];
      expect(log).toHaveLength(run.events);
      expect(log.map((e) => e.event)).toEqual(log.map((_, i) => i + 1));
      // The last row's balances are where the run ended, which is what the
      // percentile beside it was computed from.
      if (log.length) {
        expect(log[log.length - 1].gemBalance).toBe(run.finalGems);
        expect(log[log.length - 1].goldBalance).toBe(run.finalGold);
      }
      expect(value).toBeCloseTo(runValue(config, run), 9);
      // Rounds bound the wins: you cannot win five of three matches.
      for (const e of log) {
        expect(e.wins).toBeLessThanOrEqual(e.rounds);
        expect(e.rounds).toBeGreaterThan(0);
      }
    }
  });

  it("logged payouts add up to the totals the run reports", () => {
    // The log is a second telling of the same run, so it has to agree with the
    // counters — a log that drifted would illustrate a run nobody played.
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    const res = simulateBankrolls(config, { ...roll, startingGems: 30_000 }, 120, 29);
    for (const { run } of res.samples) {
      const log = run.log ?? [];
      const sum = (pick: (e: (typeof log)[number]) => number) =>
        log.reduce((a, e) => a + pick(e), 0);
      expect(sum((e) => e.packs)).toBe(run.packs);
      expect(sum((e) => e.playInPoints)).toBe(run.playInPoints);
      expect(sum((e) => e.playBoxes)).toBe(run.playBoxes);
    }
  });

  it("records nothing unless asked", () => {
    // Thousands of runs each holding an object per event, for five to be read.
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const run = simulateBankroll(config, roll, seededRandom(3));
    expect(run.log).toBeUndefined();
    expect(simulateBankroll(config, roll, seededRandom(3), true).log).toBeDefined();
  });

  it("stops recording a run long enough to bury the page", () => {
    // Two hundred and fifty events kept; the run itself plays on, and every
    // total still counts all of it.
    const config = { ...configFromPreset(PREMIER_DRAFT, defaultConfig()), winRate: 1 };
    const long = { ...roll, startingGems: 100_000, maxEvents: 400 };
    const run = simulateBankroll(config, long, seededRandom(5), true);
    expect(run.events).toBe(400);
    expect(run.log).toHaveLength(250);
    expect(run.packs).toBeGreaterThan(
      (run.log ?? []).reduce((a, e) => a + e.packs, 0),
    );
  });

  it("histograms every holding across every run", () => {
    const res = simulateBankrolls(defaultConfig(), roll, 200, 13);
    for (const key of HOLDING_KEYS) {
      const counted = res.holdings[key].histogram.reduce((a, h) => a + h.count, 0);
      expect(counted).toBe(200);
    }
  });

  it("reports a median beside the mean for a rare physical prize", () => {
    // Two entries' worth of gems against a box that needs six wins from two
    // losses: the middle run wins none, and the mean sits above every outcome
    // the median run sees. Reporting one without the other would mislead.
    const config = configFromPreset(ARENA_DIRECT, defaultConfig());
    const res = simulateBankrolls(config, { ...roll, startingGems: 16_000 }, 400, 29);
    const boxes = res.holdings.playBoxes;
    expect(boxes.median).toBe(0);
    expect(boxes.mean).toBeGreaterThan(0);
    expect(boxes.probAny).toBeGreaterThan(0);
    expect(boxes.probAny).toBeLessThan(0.5);
  });

  it("does not count banked winnings twice", () => {
    // With spending on, a pack's value is already in the gem balance, so the
    // ending total must not add it again.
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const run = simulateBankroll(
      config,
      { startingGems: 10_000, startingGold: 0, maxEvents: 3, spendWinnings: true },
      seededRandom(41),
    );
    expect(run.packs).toBeGreaterThan(0);
    expect(run.winningsBanked).toBe(true);
    expect(runValue(config, run)).toBeCloseTo(
      run.finalGems + run.finalGold / config.goldPerGem,
      9,
    );
  });

  it("is deterministic for a seed", () => {
    const config = defaultConfig();
    expect(simulateBankrolls(config, roll, 200, 7).meanEvents).toBe(
      simulateBankrolls(config, roll, 200, 7).meanEvents,
    );
  });

  it("counts winnings that are not currency toward final value", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    const run = simulateBankroll(config, roll, seededRandom(11));
    // Packs and play-in points are won but cannot pay an entry, so they land
    // in the gem-equivalent value rather than the gem balance.
    expect(run.packs).toBeGreaterThan(0);
    expect(runValue(config, run)).toBeGreaterThan(run.finalGems);
  });

  it("reports a median beside the mean, since a rare prize skews it", () => {
    const config = configFromPreset(ARENA_DIRECT, defaultConfig());
    const res = simulateBankrolls(config, { ...roll, startingGems: 10_000 }, 400, 17);
    // Most runs buy one entry and lose it; a few win a box worth more than
    // sixty thousand gems, so the mean sits far above the middle.
    expect(res.meanFinalValue).toBeGreaterThan(res.medianFinalValue);
  });

  it("values leftover gold at the configured rate", () => {
    // 10,000 gold for 1,500 gems is what every dual-priced event charges.
    expect(GOLD_PER_GEM).toBeCloseTo(10000 / 1500, 12);
    const config = { ...defaultConfig(), goldPerGem: GOLD_PER_GEM };
    const run = {
      events: 0,
      finalGems: 1000,
      finalGold: 10_000,
      packs: 0,
      draftPacks: 0,
      playInPoints: 0,
      playBoxes: 0,
      collectorBoxes: 0,
      survived: false,
      winningsBanked: false,
    };
    expect(runValue(config, run)).toBeCloseTo(1000 + 1500, 6);
    // Valuing gold at nothing drops the term entirely.
    expect(runValue({ ...config, goldPerGem: Infinity }, run)).toBe(1000);
  });

  it("histogram accounts for every run", () => {
    const res = simulateBankrolls(defaultConfig(), roll, 200, 13);
    expect(res.histogram.reduce((a, h) => a + h.count, 0)).toBe(200);
  });
});

describe("the daily-win ladder", () => {
  it("pays the published amounts, and stops", () => {
    // 250 for the first, 100 for each of the next three, 50 at the sixth,
    // eighth and tenth, 25 at the twelfth and fourteenth.
    expect(dailyWinGold(0)).toBe(0);
    expect(dailyWinGold(1)).toBe(250);
    expect(dailyWinGold(4)).toBe(550);
    expect(dailyWinGold(15)).toBe(750);
    expect(DAILY_WIN_GOLD.reduce((a, b) => a + b, 0)).toBe(750);
    // A sixteenth win pays nothing, and so does the hundredth.
    expect(dailyWinGold(16)).toBe(750);
    expect(dailyWinGold(100)).toBe(750);
  });

  it("front-loads, which is why one event is not a fifth of five", () => {
    // The first win alone is a third of a full day's gold.
    expect(dailyWinGold(1) / dailyWinGold(15)).toBeCloseTo(1 / 3, 2);
  });

  it("interpolates a fractional win count", () => {
    // Mean wins is an expectation, not a whole number of games. Rounding it
    // would put a stair-step in the EV curve where the model has none.
    expect(dailyWinGold(1.5)).toBe(300);
    expect(dailyWinGold(4.5)).toBe(550);
  });

  it("never runs backwards", () => {
    for (let w = 0; w < 20; w += 0.25) {
      expect(dailyWinGold(w + 0.25)).toBeGreaterThanOrEqual(dailyWinGold(w));
    }
  });
});

describe("gold entries", () => {
  it("credits an event the gold its own wins generate", () => {
    // Isolated from the daily quest, which is a budget rather than something
    // the event earns — see the default below.
    const config = { ...configFromPreset(PREMIER_DRAFT, defaultConfig()), otherGoldPerDay: 0 };
    expect(config.entryCostGold).toBe(10000);
    expect(config.eventsPerDay).toBe(DEFAULT_EVENTS_PER_DAY);
    // A 55% win rate averages 3.39 wins, which is 489 gold off the ladder —
    // not the 750 a full day pays, and not the 1,350 the model used to credit.
    expect(meanWinsPerEvent(config)).toBeCloseTo(3.39, 2);
    expect(goldPerEvent(config)).toBeCloseTo(489, 0);
    expect(goldFundedFraction(config)).toBeCloseTo(489 / 10000, 2);
  });

  it("adds a daily quest on top by default", () => {
    // The default treats the day's quest as budget toward entries. It is the
    // softer of the two figures — not on the drop-rates page, and it varies
    // with the quest drawn — so it is pinned on its own rather than buried in
    // a total.
    expect(DEFAULT_OTHER_GOLD_PER_DAY).toBe(600);
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    expect(config.otherGoldPerDay).toBe(600);
    expect(goldPerEvent(config)).toBeCloseTo(489 + 600, 0);
    expect(goldPerEvent({ ...config, otherGoldPerDay: 0 })).toBeCloseTo(489, 0);
  });

  it("charges the full gem price when the event takes no gold", () => {
    const config = configFromPreset(SEALED, defaultConfig());
    expect(config.entryCostGold).toBe(0);
    expect(goldFundedFraction(config)).toBe(0);
    expect(effectiveEntryGems(config)).toBe(2000);
  });

  it("earns more gold in total from more events, and less from each", () => {
    const base = defaultConfig();
    const total = (n: number) => goldPerEvent({ ...base, eventsPerDay: n }) * n;
    // More events means more of the day's ladder is climbed...
    expect(total(2)).toBeGreaterThan(total(1));
    expect(total(5)).toBeGreaterThan(total(2));
    // ...but each one earns less than the first did, because the ladder
    // front-loads and then stops.
    expect(goldPerEvent({ ...base, eventsPerDay: 2 })).toBeLessThan(
      goldPerEvent({ ...base, eventsPerDay: 1 }),
    );
    expect(goldPerEvent({ ...base, eventsPerDay: 5 })).toBeLessThan(
      goldPerEvent({ ...base, eventsPerDay: 2 }),
    );
  });

  it("saturates at the cap however many events are played", () => {
    const base = { ...defaultConfig(), otherGoldPerDay: 0 };
    // Five events at 3.39 wins each already reach fifteen, so the day's total
    // is pinned at 750 from there on. The quest is held out: it is a flat
    // daily figure and would mask the ladder's own ceiling.
    for (const n of [5, 10, 50]) {
      expect(goldPerEvent({ ...base, eventsPerDay: n }) * n).toBeCloseTo(750, 6);
    }
  });

  it("credits nothing at all when no events are played", () => {
    // The switch for pricing an event in gems alone.
    const config = { ...defaultConfig(), eventsPerDay: 0, otherGoldPerDay: 5000 };
    expect(goldPerEvent(config)).toBe(0);
    expect(goldFundedFraction(config)).toBe(0);
    expect(effectiveEntryGems(config)).toBe(1500);
  });

  it("adds gold earned outside the event on top, divided across the day", () => {
    const base = { ...defaultConfig(), otherGoldPerDay: 0 };
    const wins = goldPerEvent(base);
    expect(goldPerEvent({ ...base, otherGoldPerDay: 600 })).toBeCloseTo(wins + 600, 6);
    // Divided across the day, because a quest does not come back per event.
    expect(goldPerEvent({ ...base, otherGoldPerDay: 600, eventsPerDay: 2 })).toBeCloseTo(
      goldPerEvent({ ...base, eventsPerDay: 2 }) + 300,
      6,
    );
  });

  it("caps at every entry once accrual outpaces the gold price", () => {
    const config = { ...defaultConfig(), otherGoldPerDay: 50_000 };
    expect(goldFundedFraction(config)).toBe(1);
    expect(effectiveEntryGems(config)).toBe(0);
  });

  it("rises with the win rate, since winning climbs the ladder", () => {
    const base = { ...defaultConfig(), otherGoldPerDay: 0 };
    const at = (winRate: number) => goldPerEvent({ ...base, winRate });
    expect(at(0)).toBe(0);
    expect(at(0.4)).toBeLessThan(at(0.55));
    expect(at(0.55)).toBeLessThan(at(0.7));
    // The quest is flat, so it shifts the curve without tilting it.
    const withQuest = (winRate: number) =>
      goldPerEvent({ ...base, otherGoldPerDay: 600, winRate });
    expect(withQuest(0)).toBe(600);
    expect(withQuest(0.7) - withQuest(0.4)).toBeCloseTo(at(0.7) - at(0.4), 9);
  });

  it("makes the simulated bankroll converge to the closed-form share", () => {
    // The bankroll runs a path — gold piles up and is spent when it suffices —
    // while the closed form is its long-run limit. They have to agree.
    for (const otherGoldPerDay of [0, 500, 1350, 4000]) {
      const config = { ...defaultConfig(), otherGoldPerDay };
      const res = simulate(config, 100_000, 5);
      expect(res.goldEntryFraction).toBeCloseTo(goldFundedFraction(config), 3);
      expect(res.meanEntryGems).toBeCloseTo(effectiveEntryGems(config), 1);
    }
  });

  it("improves expected value without touching the outcome distribution", () => {
    const without = { ...defaultConfig(), eventsPerDay: 0 };
    const with_ = defaultConfig();
    const a = simulate(without, 50_000, 9);
    const b = simulate(with_, 50_000, 9);
    expect(b.meanNet).toBeGreaterThan(a.meanNet);
    // Gold pays the entry; it does not help you win.
    expect(b.buckets.map((x) => x.exactProbability)).toEqual(
      a.buckets.map((x) => x.exactProbability),
    );
    // The gap is exactly the entry the gold covers, derived rather than
    // restated so that retuning the quest default cannot silently pass here.
    expect(b.meanNet - a.meanNet).toBeCloseTo(
      1500 * goldFundedFraction(with_),
      6,
    );
  });

  it("prices the EV curve at each point's own gold, not the config's", () => {
    // The curve sweeps win rate. Gold moves with it, so a point on the curve
    // has to be the same number as configuring that rate outright.
    const base = defaultConfig();
    for (const winRate of [0.3, 0.5, 0.75]) {
      expect(expectedNetAt(base, winRate)).toBeCloseTo(
        expectedNet({ ...base, winRate }),
        9,
      );
    }
  });
});

describe("presets", () => {
  it("defaults to Premier Draft at a 1,500 gem entry", () => {
    expect(defaultConfig().entryCostGems).toBe(1500);
    expect(defaultConfig().payouts).toEqual(PREMIER_DRAFT.payouts);
  });

  it("defaults a play-in point to 200 gems", () => {
    // 20 points buy a 4,000 gem Arena Open play-in.
    expect(DEFAULT_PLAY_IN_POINT_VALUE_GEMS).toBe(200);
    expect(DEFAULT_PLAY_IN_POINT_VALUE_GEMS * 20).toBe(4000);
    expect(defaultConfig().playInPointValueGems).toBe(
      DEFAULT_PLAY_IN_POINT_VALUE_GEMS,
    );
  });

  it("awards play-in points only on the traditional events", () => {
    const awarding = PRESETS.filter((p) =>
      p.payouts.some((t) => (t.playInPoints ?? 0) > 0),
    ).map((p) => p.name);
    expect(awarding).toEqual(["Traditional Draft"]);
  });

  it("prices play-in points into the gross", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    const tier = TRADITIONAL_DRAFT.payouts[3];
    expect(tier.playInPoints).toBe(2);
    expect(playInPointsFor(config, 3)).toBe(2);
    const cards = config.draftPacks * config.draftPackValueGems;
    expect(grossValue(config, 3)).toBe(
      cards +
        tier.gems +
        tier.packs * config.packValueGems +
        2 * config.playInPointValueGems,
    );
    // Valuing them at nothing takes the whole term back out.
    expect(grossValue({ ...config, playInPointValueGems: 0 }, 3)).toBe(
      cards + tier.gems + tier.packs * config.packValueGems,
    );
  });

  it("leaves events without points untouched by their value", () => {
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const at = (v: number) => expectedNetAt({ ...config, playInPointValueGems: v }, 0.55);
    expect(at(0)).toBeCloseTo(at(5000), 9);
  });

  it("defaults packs to 22 gems each", () => {
    // Packs carry real value by default, so the headline figures are no longer
    // gems-only. Several EV expectations move with this number — see the
    // derivation on DEFAULT_PACK_VALUE_GEMS before changing it.
    expect(DEFAULT_PACK_VALUE_GEMS).toBe(22);
    expect(defaultConfig().packValueGems).toBe(DEFAULT_PACK_VALUE_GEMS);
  });

  it("gives Premier Cube the Premier structure and gem ladder, but not its packs", () => {
    expect(PREMIER_CUBE_DRAFT.entryCostGems).toBe(PREMIER_DRAFT.entryCostGems);
    expect(PREMIER_CUBE_DRAFT.structure).toEqual(PREMIER_DRAFT.structure);
    expect(PREMIER_CUBE_DRAFT.payouts.map((t) => t.gems)).toEqual(
      PREMIER_DRAFT.payouts.map((t) => t.gems),
    );
    // Packs diverge from five wins up, paying more to offset the phantom pool.
    expect(PREMIER_CUBE_DRAFT.payouts.map((t) => t.packs)).toEqual([
      1, 1, 2, 2, 3, 5, 6, 7,
    ]);
  });

  it("gives both cubes the same gem ladder as their non-cube twin", () => {
    expect(TRADITIONAL_CUBE_DRAFT.payouts.map((t) => t.gems)).toEqual(
      TRADITIONAL_DRAFT.payouts.map((t) => t.gems),
    );
    // ...but one pack fewer at 3-0, and no play-in points at all.
    expect(TRADITIONAL_CUBE_DRAFT.payouts.map((t) => t.packs)).toEqual([1, 1, 3, 5]);
    expect(TRADITIONAL_DRAFT.payouts.map((t) => t.packs)).toEqual([1, 1, 3, 6]);
  });

  it("models Traditional Draft as three BO3 rounds", () => {
    expect(TRADITIONAL_DRAFT.format).toBe("bo3");
    expect(TRADITIONAL_DRAFT.structure).toEqual({ kind: "rounds", rounds: 3 });
    expect(TRADITIONAL_DRAFT.entryCostGems).toBe(1500);
    expect(TRADITIONAL_DRAFT.payouts).toHaveLength(4);
  });

  it("exposes all nine presets", () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      "Premier Draft",
      "Quick Draft",
      "Premier Cube Draft",
      "Traditional Draft",
      "Traditional Cube Draft",
      "Pick Two Draft",
      "Sealed",
      "Contender Draft",
      "Arena Direct (Cube)",
    ]);
  });

  it("models Arena Direct as a two-loss run paying physical product", () => {
    // Quoted from the terms: "Entry is valid until 7 wins or 2 losses".
    expect(ARENA_DIRECT.structure).toEqual({
      kind: "elimination",
      maxWins: 7,
      maxLosses: 2,
    });
    expect(ARENA_DIRECT.entryCostGems).toBe(8000);
    // Gems and packs stop entirely once the prize becomes a box.
    expect(ARENA_DIRECT.payouts[6]).toEqual({
      wins: 6,
      gems: 0,
      packs: 0,
      playBoxes: 1,
    });
    expect(ARENA_DIRECT.payouts[7].playBoxes).toBe(2);
  });

  it("prices boxes into the gross", () => {
    const config = configFromPreset(ARENA_DIRECT, defaultConfig());
    expect(config.playBoxValueGems).toBe(DEFAULT_PLAY_BOX_VALUE_GEMS);
    expect(grossValue(config, 7)).toBe(2 * config.playBoxValueGems);
    expect(grossValue(config, 6)).toBe(config.playBoxValueGems);
    // Valuing boxes at nothing strips the top two tiers back to zero.
    const worthless = { ...config, playBoxValueGems: 0 };
    expect(grossValue(worthless, 6)).toBe(0);
    expect(grossValue(worthless, 7)).toBe(0);
  });

  it("converts physical prizes at 400 gems to the dollar", () => {
    expect(GEMS_PER_USD).toBe(400);
    // 20,000 gems for $49.99 is the largest bundle, so the most generous rate.
    // Averaged over Marvel Super Heroes, Edge of Eternities and Aetherdrift.
    expect(DEFAULT_PLAY_BOX_VALUE_GEMS).toBe(Math.round(((147 + 187 + 130) / 3) * 400));
    expect(DEFAULT_COLLECTOR_BOX_VALUE_GEMS).toBe(
      Math.round(((599 + 914 + 378) / 3) * 400),
    );
  });

  it("models Contender Draft as paying nothing below three wins", () => {
    expect(CONTENDER_DRAFT.entryCostGems).toBe(3000);
    expect(CONTENDER_DRAFT.structure).toEqual({
      kind: "elimination",
      maxWins: 7,
      maxLosses: 3,
    });
    for (const t of CONTENDER_DRAFT.payouts.slice(0, 3)) {
      expect(t.gems).toBe(0);
      expect(t.packs).toBe(0);
    }
    // Mythic packs are folded into the pack count at the top two tiers:
    // 10 + 4 at six wins, 12 + 10 at seven.
    expect(CONTENDER_DRAFT.payouts[6].packs).toBe(14);
    expect(CONTENDER_DRAFT.payouts[7].packs).toBe(22);
  });

  it("pays only the drafted cards for a Contender run under three wins", () => {
    const config = configFromPreset(CONTENDER_DRAFT, defaultConfig());
    const cards = config.draftPacks * config.draftPackValueGems;
    expect(cards).toBeGreaterThan(0);
    for (const wins of [0, 1, 2]) {
      // The reward table pays nothing, but the pool is still yours.
      expect(grossValue(config, wins)).toBe(cards);
    }
    expect(grossValue(config, 7)).toBe(cards + 7200 + 22 * config.packValueGems);
  });

  it("models Sealed as BO1 to 7 wins or 3 losses", () => {
    expect(SEALED.format).toBe("bo1");
    expect(SEALED.structure).toEqual({
      kind: "elimination",
      maxWins: 7,
      maxLosses: 3,
    });
    expect(SEALED.entryCostGems).toBe(2000);
    // Packs are flat, so only the gem ladder varies with the record.
    expect(new Set(SEALED.payouts.map((t) => t.packs))).toEqual(new Set([3]));
  });


  it("converts the win rate for BO3 elimination, not just BO3 rounds", () => {
    // No preset currently pairs best-of-three with elimination, but the model
    // supports it: elimination reads the structure, bo3 reads the format, and
    // both have to apply at once.
    const structure: EventStructure = { kind: "elimination", maxWins: 4, maxLosses: 2 };
    const config = { ...defaultConfig(), format: "bo3" as const, structure };
    const pMatch = matchWinRate({ ...config, winRate: 0.55 });
    expect(pMatch).toBeCloseTo(bo3WinRate(0.55), 12);
    const d = exactDistribution(pMatch, structure);
    expect(d).toHaveLength(5);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (let k = 0; k < 4; k++) {
      expect(d[k]).toBeCloseTo((k + 1) * Math.pow(pMatch, k) * (1 - pMatch) ** 2, 12);
    }
  });

  it("models Pick Two Draft as 4 wins or 2 losses", () => {
    expect(PICK_TWO_DRAFT.format).toBe("bo1");
    expect(PICK_TWO_DRAFT.structure).toEqual({
      kind: "elimination",
      maxWins: 4,
      maxLosses: 2,
    });
    expect(PICK_TWO_DRAFT.entryCostGems).toBe(900);
    expect(PICK_TWO_DRAFT.payouts).toHaveLength(5);
    // A run can go at most 3-2 before the decider.
    expect(maxRounds(PICK_TWO_DRAFT.structure)).toBe(5);
  });

  it("matches a hand-computed distribution for Pick Two Draft", () => {
    // maxLosses of 2 changes the shape: P(k<4) = (k+1)·p^k·q², and the top
    // tier is p⁴(1 + 4q) rather than the three-loss form.
    const p = 0.55;
    const q = 1 - p;
    const d = exactDistribution(p, PICK_TWO_DRAFT.structure);
    expect(d).toHaveLength(5);
    for (let k = 0; k < 4; k++) {
      expect(d[k]).toBeCloseTo((k + 1) * Math.pow(p, k) * q * q, 12);
    }
    expect(d[4]).toBeCloseTo(Math.pow(p, 4) * (1 + 4 * q), 12);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("prices Pick Two Draft at the hand-computed EV", () => {
    const config = configFromPreset(PICK_TWO_DRAFT, defaultConfig());
    const d = exactDistribution(0.55, PICK_TWO_DRAFT.structure);
    // Packs are priced at config.packValueGems rather than assumed free, so
    // this stays honest if the default pack value moves again.
    const gross = d.reduce(
      (acc, pr, k) =>
        acc +
        pr *
          (PICK_TWO_DRAFT.payouts[k].gems +
            PICK_TWO_DRAFT.payouts[k].packs * config.packValueGems),
      0,
    ) + config.draftPacks * config.draftPackValueGems;
    // Priced against the effective entry: Pick Two takes gold, so part of the
    // 900 gem price is covered by the accrued balance.
    expect(expectedNetAt(config, 0.55)).toBeCloseTo(
      gross - effectiveEntryGems(config),
      6,
    );
  });

  it("has a payout row for every reachable win count", () => {
    for (const preset of PRESETS) {
      const top = maxPossibleWins(preset.structure);
      expect(preset.payouts).toHaveLength(top + 1);
      expect(preset.payouts.map((t) => t.wins)).toEqual(
        Array.from({ length: top + 1 }, (_, i) => i),
      );
    }
  });

  it("does not share payout arrays between config and preset", () => {
    // configFromPreset must deep-copy, or editing the table would mutate the
    // preset and silently corrupt every later switch.
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    config.payouts[0].gems = 99999;
    expect(PREMIER_DRAFT.payouts[0].gems).toBe(50);
  });

  it("does not share structure objects between config and preset", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    (config.structure as { rounds: number }).rounds = 99;
    expect(TRADITIONAL_DRAFT.structure).toEqual({ kind: "rounds", rounds: 3 });
  });



  it("keeps win rate and pack value when switching preset", () => {
    const base = { ...defaultConfig(), winRate: 0.61, packValueGems: 200 };
    const next = configFromPreset(QUICK_DRAFT, base);
    expect(next.winRate).toBe(0.61);
    expect(next.packValueGems).toBe(200);
    expect(next.entryCostGems).toBe(750);
  });
});
