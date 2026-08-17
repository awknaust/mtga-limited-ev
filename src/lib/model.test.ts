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
  EMPTY_BOX_PRICES,
  GEMS_PER_USD,
  GEMS_PER_10K_GOLD,
  PICK_TWO_DRAFT,
  PREMIER_DRAFT,
  PRESETS,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_CUBE_DRAFT,
  TRADITIONAL_DRAFT,
  boxChancePerEvent,
  breakEvenWinRate,
  configFromPreset,
  defaultConfig,
  eventExpectation,
  meanRoundsPerEvent,
  exactDistribution,
  exactRecordDistribution,
  possibleRecords,
  expectedNet,
  expectedNetAt,
  effectiveEntryGems,
  goldFundedFraction,
  dailyWinGold,
  goldPerEvent,
  meanWinsPerEvent,
  grossCounts,
  grossSplit,
  grossValue,
  netValue,
  matchWinRate,
  RECORDED_EVENTS,
  netInterval,
  probProfitable,
  winRateInterval,
  winRatePosterior,
  CREDIBLE_LEVEL,
  PRIOR_ALPHA,
  PRIOR_BETA,
  ARENA_DIRECT_COLLECTOR,
  ARENA_DIRECT_PLAY,
  LATEST_SET,
  bankrollRoi,
  HOLDING_KEYS,
  boxHoldingKey,
  boxValueGems,
  isBoxHolding,
  ladderBoxes,
  maxPossibleWins,
  maxRounds,
  heldKeys,
  holdingRate,
  reportedKeys,
  paidRewards,
  paysBoxes,
  playInPointsFor,
  resizePayouts,
  simulateBankroll,
  simulateBankrolls,
  simulateEvent,
  runValue,
  startingValue,
  seededRandom,
  type EventConfig,
  type EventStructure,
  type RecordProbability,
} from "./index";

const ELIM: EventStructure = { kind: "elimination", maxWins: 7, maxLosses: 3 };

/** Collapse a record distribution back to one probability per win count. */
const byWins = (records: RecordProbability[]): number[] => {
  const out: number[] = [];
  for (const r of records) out[r.wins] = (out[r.wins] ?? 0) + r.probability;
  return out;
};

const label = (r: { wins: number; losses: number }) => `${r.wins}-${r.losses}`;

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

describe("exactRecordDistribution", () => {
  const ROUNDS: EventStructure = { kind: "rounds", rounds: 3 };

  it("sums to 1", () => {
    for (const structure of [ELIM, ROUNDS]) {
      for (const p of [0, 0.25, 0.5, 0.62, 0.9, 1]) {
        const total = exactRecordDistribution(p, structure).reduce(
          (a, r) => a + r.probability,
          0,
        );
        expect(total).toBeCloseTo(1, 12);
      }
    }
  });

  it("splits only the ceiling of an elimination ladder", () => {
    const records = exactRecordDistribution(0.6, ELIM);
    // Seven ways to bust out, then 7-0, 7-1 and 7-2.
    expect(records.map(label)).toEqual([
      "0-3",
      "1-3",
      "2-3",
      "3-3",
      "4-3",
      "5-3",
      "6-3",
      "7-0",
      "7-1",
      "7-2",
    ]);
  });

  it("matches hand-computed values at p=0.5", () => {
    const at = (wins: number, losses: number) =>
      exactRecordDistribution(0.5, ELIM).find(
        (r) => r.wins === wins && r.losses === losses,
      )!.probability;

    // A clean run: seven wins and nothing else.
    expect(at(7, 0)).toBeCloseTo(0.5 ** 7, 12);
    // 7-1: the loss falls anywhere among the seven rounds before the last win.
    expect(at(7, 1)).toBeCloseTo(7 * 0.5 ** 8, 12);
    // 7-2: two losses among the eight rounds before it, so C(8,2) = 28.
    expect(at(7, 2)).toBeCloseTo(28 * 0.5 ** 9, 12);
    // Busting out at 0 wins is losing the first three.
    expect(at(0, 3)).toBeCloseTo(0.125, 12);
  });

  it("collapses to the win-count distribution", () => {
    for (const structure of [ELIM, ROUNDS]) {
      for (const p of [0, 0.25, 0.5, 0.62, 0.9, 1]) {
        const grouped = byWins(exactRecordDistribution(p, structure));
        const direct = exactDistribution(p, structure);
        expect(grouped).toHaveLength(direct.length);
        grouped.forEach((mass, wins) => expect(mass).toBeCloseTo(direct[wins], 12));
      }
    }
  });

  it("puts all mass on one record at a certain win rate", () => {
    const busted = exactRecordDistribution(0, ELIM);
    expect(busted.find((r) => label(r) === "0-3")!.probability).toBe(1);
    const perfect = exactRecordDistribution(1, ELIM);
    expect(perfect.find((r) => label(r) === "7-0")!.probability).toBe(1);
    // Nothing else takes any: a certain run has exactly one way to go.
    for (const records of [busted, perfect]) {
      expect(records.filter((r) => r.probability > 0)).toHaveLength(1);
    }
  });

  it("leaves a fixed-rounds event one record per win count", () => {
    const records = exactRecordDistribution(0.55, ROUNDS);
    expect(records.map(label)).toEqual(["0-3", "1-2", "2-1", "3-0"]);
  });
});

describe("win rate uncertainty", () => {
  const at = (winRate: number, winRateMatches: number) => ({
    ...defaultConfig(),
    winRate,
    winRateMatches,
  });

  it("is switched off entirely when the rate is called certain", () => {
    const certain = at(0.55, 0);
    expect(winRatePosterior(certain)).toBeNull();
    expect(netInterval(certain)).toBeNull();
    expect(probProfitable(certain)).toBeNull();
  });

  it("reads the stated rate as a record against the prior", () => {
    // 20 matches at 55% is 11-9, on top of Beta(10, 10).
    expect(winRatePosterior(at(0.55, 20))).toEqual({
      alpha: PRIOR_ALPHA + 11,
      beta: PRIOR_BETA + 9,
    });
  });

  it("shrinks a short hot record toward the coin flip", () => {
    // 14-6 is a 70% record. The prior is worth as much as the data at this
    // length, so the posterior should land nearer 60% than 70%.
    const p = winRatePosterior(at(0.7, 20))!;
    const mean = p.alpha / (p.alpha + p.beta);
    expect(mean).toBeCloseTo(0.6, 10);
    expect(mean).toBeLessThan(0.7);
  });

  it("lets the data swamp the prior once there is enough of it", () => {
    const p = winRatePosterior(at(0.7, 2000))!;
    expect(p.alpha / (p.alpha + p.beta)).toBeGreaterThan(0.69);
  });

  it("narrows as the record lengthens", () => {
    const width = (matches: number) => {
      const [lo, hi] = winRateInterval(winRatePosterior(at(0.55, matches))!);
      return hi - lo;
    };
    expect(width(20)).toBeGreaterThan(width(100));
    expect(width(100)).toBeGreaterThan(width(500));
  });

  it("straddles break-even on a short record", () => {
    const [lo, hi] = netInterval(at(0.55, 20))!;
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(0);
  });

  it("stays ordered where expected net is not monotonic in the win rate", () => {
    /*
     * The reason the interval is read off sorted values rather than mapped
     * through the win rate's own quantiles. Arena Direct pays only boxes above
     * five wins, so zeroing the box values makes winning more actively worse:
     * the curve humps, worst at both ends. Mapping quantiles through that can
     * return hi below lo. This must not.
     */
    const humped = {
      ...configFromPreset(ARENA_DIRECT_COLLECTOR, defaultConfig()),
      winRate: 0.55,
      winRateMatches: 20,
      playBoxValueGems: 0,
      collectorBoxValueGems: 0,
    };
    // Confirm the shape really is non-monotonic before relying on it.
    const ends = [expectedNetAt(humped, 0), expectedNetAt(humped, 1)];
    const middle = expectedNetAt(humped, 0.55);
    expect(middle).toBeGreaterThan(Math.max(...ends));

    const [lo, hi] = netInterval(humped)!;
    expect(hi).toBeGreaterThanOrEqual(lo);
  });

  it("reports a profitable share that tracks the win rate", () => {
    const low = probProfitable(at(0.4, 100))!;
    const high = probProfitable(at(0.75, 100))!;
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
    expect(high).toBeGreaterThan(low);
  });
});

describe("eventExpectation", () => {
  it("sizes the outcome table to the structure", () => {
    const premier = eventExpectation(defaultConfig()).outcomes;
    expect(premier).toHaveLength(8);
    expect(premier.map((o) => o.wins)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(
      eventExpectation(configFromPreset(TRADITIONAL_DRAFT, defaultConfig())).outcomes,
    ).toHaveLength(4);
  });

  it("is the exact distribution, priced row by row", () => {
    const config = { ...defaultConfig(), winRate: 0.58 };
    const ev = eventExpectation(config);
    const dist = exactDistribution(0.58, ELIM);
    ev.outcomes.forEach((o, wins) => {
      expect(o.probability).toBe(dist[wins]);
      expect(o.grossGems).toBe(grossValue(config, wins));
      expect(o.netGems).toBe(netValue(config, wins));
    });
    expect(ev.outcomes.reduce((a, o) => a + o.probability, 0)).toBeCloseTo(1, 12);
  });

  it("puts one expected net on the tile and at the foot of the table", () => {
    for (const preset of PRESETS) {
      const config = configFromPreset(preset, defaultConfig());
      const ev = eventExpectation(config);
      expect(ev.meanNet).toBeCloseTo(expectedNet(config), 9);
      // The foot of the table is chance times net, summed over the rows shown.
      expect(
        ev.outcomes.reduce((a, o) => a + o.probability * o.netGems, 0),
      ).toBeCloseTo(ev.meanNet, 9);
      // Gross and net differ by exactly what an entry costs.
      expect(ev.meanGross - ev.meanNet).toBeCloseTo(effectiveEntryGems(config), 9);
    }
  });

  it("splits the event by record, and collapses back to win counts", () => {
    const ev = eventExpectation({ ...defaultConfig(), winRate: 0.58 });
    // Seven ways to bust out, then the three ways to reach seven.
    expect(ev.records.map(label)).toEqual([
      "0-3", "1-3", "2-3", "3-3", "4-3", "5-3", "6-3", "7-0", "7-1", "7-2",
    ]);
    const grouped = byWins(ev.records);
    expect(grouped).toHaveLength(ev.outcomes.length);
    grouped.forEach((mass, wins) =>
      expect(mass).toBeCloseTo(ev.outcomes[wins].probability, 12),
    );
    // Nothing to split in a fixed-rounds event: a win count is a record.
    const trad = eventExpectation(configFromPreset(TRADITIONAL_DRAFT, defaultConfig()));
    expect(trad.records.map(label)).toEqual(["0-3", "1-2", "2-1", "3-0"]);
    expect(trad.records.map((r) => r.probability)).toEqual(
      trad.outcomes.map((o) => o.probability),
    );
  });

  it("always plays every round of a fixed-rounds event", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    for (const winRate of [0, 0.4, 0.55, 1]) {
      expect(eventExpectation({ ...config, winRate }).meanRounds).toBeCloseTo(3, 12);
    }
  });

  it("stops early in an elimination event", () => {
    // A player who cannot win is out after exactly maxLosses matches; one who
    // cannot lose plays exactly maxWins. Both sit where the identity divides
    // by zero or by one, so they are the endpoints worth pinning by value.
    expect(eventExpectation({ ...defaultConfig(), winRate: 0 }).meanRounds).toBe(3);
    expect(eventExpectation({ ...defaultConfig(), winRate: 1 }).meanRounds).toBe(7);
    // By hand: to two wins or one loss at p = ½ finishes 0-1 half the time
    // after one match, and 1-1 or 2-0 a quarter each after two — 1½ matches.
    const short: EventConfig = {
      ...defaultConfig(),
      winRate: 0.5,
      structure: { kind: "elimination", maxWins: 2, maxLosses: 1 },
      payouts: resizePayouts(defaultConfig().payouts, 2),
    };
    expect(eventExpectation(short).meanRounds).toBeCloseTo(1.5, 12);
    const premier = eventExpectation(defaultConfig()).meanRounds;
    expect(premier).toBeGreaterThan(3);
    expect(premier).toBeLessThan(maxRounds(ELIM));
  });

  it("is Wald's identity, and agrees with the sum over the records", () => {
    /*
     * The tile divides expected wins by the win rate. The other closed form
     * — every record's length weighted by its chance, off the same array the
     * distribution chart draws — has to give the identical number, and it is
     * the derivation a reader can check row by row, so the two are held
     * together here rather than trusted to be one identity.
     */
    for (const preset of PRESETS) {
      for (const winRate of [0.005, 0.3, 0.55, 0.8, 0.995]) {
        const config = { ...configFromPreset(preset, defaultConfig()), winRate };
        const ev = eventExpectation(config);
        expect(ev.meanRounds).toBe(meanRoundsPerEvent(config));
        expect(ev.meanRounds).toBeCloseTo(meanWinsPerEvent(config) / winRate, 12);
        const overRecords = ev.records.reduce(
          (acc, r) => acc + r.probability * (r.wins + r.losses),
          0,
        );
        expect(ev.meanRounds).toBeCloseTo(overRecords, 12);
      }
    }
  });

  it("agrees with the dice on how long an event lasts", () => {
    /*
     * `simulateEvent` is the bankroll's kernel and the one place an event is
     * played by chance. Its mean length has to be the closed-form one, which
     * is the check that keeps the two halves of the model honest with each
     * other, nothing on screen drawing them side by side.
     */
    for (const config of [
      { ...defaultConfig(), winRate: 0.58 },
      configFromPreset(TRADITIONAL_DRAFT, defaultConfig()),
    ]) {
      const rand = seededRandom(3);
      const p = matchWinRate(config);
      const n = 100_000;
      let total = 0;
      for (let i = 0; i < n; i++) total += simulateEvent(config.structure, p, rand).rounds;
      // Rounds vary by a couple of matches, so the standard error at this
      // count is under a hundredth; the tolerance is many times that.
      expect(total / n).toBeCloseTo(eventExpectation(config).meanRounds, 1);
    }
  });

  it("counts expected boxes per event, doubles included", () => {
    /*
     * Arena Direct pays one box at six wins and two at seven. At p = ½ the
     * finishes land with probability 7 · p⁶q² = 7/256 on six wins and
     * p⁷(1 + 7q) = 9/256 on seven, so the mean is 7/256 + 2 · 9/256 = 25/256
     * of a box per entry.
     */
    const config = { ...configFromPreset(ARENA_DIRECT, defaultConfig()), winRate: 0.5 };
    expect(eventExpectation(config).meanBoxes).toBeCloseTo(25 / 256, 12);
    // A ladder with no boxes reports none.
    expect(eventExpectation(defaultConfig()).meanBoxes).toBe(0);
  });

  it("reads the chance of a profit off the rows that make one", () => {
    const config = defaultConfig();
    const ev = eventExpectation(config);
    const byHand = ev.outcomes
      .filter((o) => o.netGems > 0)
      .reduce((a, o) => a + o.probability, 0);
    expect(ev.probProfit).toBeCloseTo(byHand, 12);
    expect(ev.probProfit).toBeGreaterThan(0);
    expect(ev.probProfit).toBeLessThan(1);
    // A perfect run pays 2,200 gems and change against a 1,500 entry; a
    // winless one pays 50 gems and a pack.
    expect(eventExpectation({ ...config, winRate: 1 }).probProfit).toBe(1);
    expect(eventExpectation({ ...config, winRate: 0 }).probProfit).toBe(0);
  });

  it("returns the net on what an entry actually costs", () => {
    const config = defaultConfig();
    const ev = eventExpectation(config);
    expect(ev.entryGems).toBeCloseTo(effectiveEntryGems(config), 12);
    expect(ev.goldEntryFraction).toBeCloseTo(goldFundedFraction(config), 12);
    expect(ev.roi).toBeCloseTo(ev.meanNet / effectiveEntryGems(config), 12);
    // Priced in gems alone, ROI divides by the sticker price.
    const gemsOnly = eventExpectation({ ...config, eventsPerDay: 0 });
    expect(gemsOnly.entryGems).toBe(1500);
    expect(gemsOnly.goldEntryFraction).toBe(0);
    // Nothing paid, nothing to return on.
    expect(
      eventExpectation({ ...config, entryCostGems: 0, entryCostGold: 0 }).roi,
    ).toBe(0);
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

  it("enumerates the records an event can finish on", () => {
    expect(possibleRecords({ kind: "elimination", maxWins: 4, maxLosses: 2 }).map(label))
      .toEqual(["0-2", "1-2", "2-2", "3-2", "4-0", "4-1"]);
    expect(possibleRecords({ kind: "rounds", rounds: 3 }).map(label)).toEqual([
      "0-3",
      "1-2",
      "2-1",
      "3-0",
    ]);
  });

  it("gives every reachable record for each preset, and no unreachable one", () => {
    for (const preset of PRESETS) {
      const records = possibleRecords(preset.structure);
      // Distinct rows, none of them longer than the event can run.
      expect(new Set(records.map(label)).size).toBe(records.length);
      for (const r of records) {
        expect(r.wins + r.losses).toBeLessThanOrEqual(maxRounds(preset.structure));
      }
      expect(new Set(records.map((r) => r.wins)).size).toBe(
        maxPossibleWins(preset.structure) + 1,
      );
    }
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
      { startingGems: 10_000, startingGold: 0, maxEvents: 5 },
      seededRandom(21),
    );
    expect(run.draftPacks).toBe(run.events * 3);
  });
});

describe("splitting a gross", () => {
  // The bar under the Expected gross tile draws these segments beneath that
  // figure, so a split that does not add back up to it puts a chart under a
  // number it contradicts.
  it("adds back up to the mean gross it decomposes", () => {
    for (const preset of [PREMIER_DRAFT, SEALED, ARENA_DIRECT, CONTENDER_DRAFT]) {
      const config = configFromPreset(preset, defaultConfig());
      const parts = grossSplit(config);
      const summed = Object.values(parts).reduce((acc, v) => acc + v, 0);
      expect(summed).toBeCloseTo(eventExpectation(config).meanGross, 9);
    }
  });

  it("puts nothing in gold, which no ladder pays", () => {
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    expect(grossSplit(config).gold).toBe(0);
  });

  it("moves value between segments rather than creating it", () => {
    // Doubling what a pack is worth cannot change how many packs are won, so
    // the packs segment doubles and every other segment holds still.
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const base = grossSplit(config);
    const dearer = grossSplit({ ...config, packValueGems: config.packValueGems * 2 });
    expect(dearer.packs).toBeCloseTo(base.packs * 2, 9);
    expect(dearer.gems).toBeCloseTo(base.gems, 9);
    expect(dearer.draftPacks).toBeCloseTo(base.draftPacks, 9);
  });

  it("counts the rewards the split values", () => {
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const counts = grossCounts(config);
    const parts = grossSplit(config);
    // Packs per event, straight off the distribution and the ladder.
    const meanPacks = exactDistribution(matchWinRate(config), config.structure).reduce(
      (acc, p, wins) => acc + p * config.payouts[wins].packs,
      0,
    );
    expect(counts.packs).toBeCloseTo(meanPacks, 9);
    expect(counts.packs * config.packValueGems).toBeCloseTo(parts.packs, 9);
    expect(counts.draftPacks).toBe(config.draftPacks);
  });
});

describe("holdings", () => {
  it("lists what a ladder pays, and only that", () => {
    expect(paidRewards(PREMIER_DRAFT.payouts)).toEqual(["packs"]);
    expect(paidRewards(TRADITIONAL_DRAFT.payouts)).toEqual(["packs", "playInPoints"]);
    // Boxes are not among these: which exist depends on which the ladder
    // names, so they arrive as their own holdings rather than as a fixed pair.
    expect(paidRewards(ARENA_DIRECT.payouts)).toEqual(["packs"]);
    expect(ladderBoxes(ARENA_DIRECT.payouts)).toEqual([
      { kind: "play", set: "spm" },
      { kind: "play", set: "msh" },
    ]);
    // Zeroing the tiers retires the reward, whatever the conversion rate is.
    const gemsOnly = PREMIER_DRAFT.payouts.map((t) => ({ ...t, packs: 0 }));
    expect(paidRewards(gemsOnly)).toEqual([]);
  });

  it("shows the balances alongside whatever the event pays", () => {
    const premier = configFromPreset(PREMIER_DRAFT, defaultConfig());
    // Gems always, gold because it accrues daily whatever the event charges,
    // and drafted cards because the pool is yours to keep.
    expect(heldKeys(premier)).toEqual(["gems", "gold", "packs", "draftPacks"]);

    // Arena Direct is phantom and gem-priced, but gold still piles up. Its
    // two boxes are two holdings, since they are two different products.
    const direct = configFromPreset(ARENA_DIRECT, defaultConfig());
    expect(heldKeys(direct)).toEqual([
      "gems",
      "gold",
      "packs",
      "box:play.spm",
      "box:play.msh",
    ]);

    // No gold earned and none charged: nothing to report, unless a starting
    // balance the event cannot spend is sitting there. Zero events a day is
    // what stops the accrual now that daily-win gold comes off the ladder —
    // an event that is never played wins nothing to climb it with.
    const noGold = { ...direct, eventsPerDay: 0 };
    expect(heldKeys(noGold)).toEqual([
      "gems",
      "packs",
      "box:play.spm",
      "box:play.msh",
    ]);
    expect(heldKeys(noGold, true)).toContain("gold");
  });

  it("prices each holding off its own rate", () => {
    const config = defaultConfig();
    // Gems are the unit, so they are worth themselves.
    expect(holdingRate(config, "gems")).toBe(1);
    expect(holdingRate(config, "gold")).toBe(GEMS_PER_10K_GOLD / 10000);
    expect(holdingRate(config, "packs")).toBe(DEFAULT_PACK_VALUE_GEMS);
    expect(holdingRate(config, "playInPoints")).toBe(DEFAULT_PLAY_IN_POINT_VALUE_GEMS);
    expect(holdingRate(config, "draftPacks")).toBe(DEFAULT_DRAFT_PACK_VALUE_GEMS);
    /*
     * Boxes have no rate here at all, and that is the point of naming them:
     * what one is worth is that product's own price, which `boxValueGems`
     * answers and `heldValue` applies. The generic rates below are what a box
     * naming no set falls back to.
     */
    expect(boxValueGems(config, { kind: "play" })).toBe(DEFAULT_PLAY_BOX_VALUE_GEMS);
    expect(boxValueGems(config, { kind: "collector" })).toBe(
      DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
    );
    // Gold valued at nothing drops out, the same way runValue treats it.
    expect(holdingRate({ ...config, gemsPer10kGold: 0 }, "gold")).toBe(0);
  });
});

describe("bankroll", () => {
  const roll = {
    startingGems: 10_000,
    startingGold: 0,
    maxEvents: 500,
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

  it("cannot fund entries from packs, however they are priced", () => {
    /*
     * Packs and cards are not currency in Arena, so they pile up without
     * extending the run. Pricing one at a hundred entries is the sharpest way
     * to say it: what a reward is worth moves the ending value and must leave
     * the run length alone, since only the two balances buy an entry.
     */
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const dear = { ...config, packValueGems: 150_000 };
    const held = simulateBankrolls(config, roll, 400, 31);
    const priced = simulateBankrolls(dear, roll, 400, 31);
    expect(held.holdings.packs.mean).toBeGreaterThan(0);
    expect(priced.meanEvents).toBe(held.meanEvents);
    expect(priced.holdings.packs.mean).toBe(held.holdings.packs.mean);
    expect(priced.meanFinalValue).toBeGreaterThan(held.meanFinalValue);
  });

  it("breaks the ending total into what it is made of", () => {
    /*
     * The claim the breakdown rests on: itemising loses nothing. Every
     * holding's worth added up is the gem-equivalent figure shown beside it,
     * to the last gem.
     *
     * The cube is in the list twice over now. Its ladder pays two *different*
     * play boxes, priced apart by the feed below, which is exactly the case a
     * mean count times one rate gets wrong — the identity holds because each
     * holding carries the value the runs actually held.
     */
    const boxPrices = {
      sets: [
        { code: "spm", name: "Marvel's Spider-Man", releasedAt: "2025-09-26", boxes: { play: 25_538 } },
        { code: "msh", name: "Marvel Super Heroes", releasedAt: "2026-06-26", boxes: { play: 23_444 } },
      ],
      latest: { play: "msh" },
      generatedAt: "2026-08-16T00:00:00.000Z",
    };
    for (const preset of [PREMIER_DRAFT, TRADITIONAL_DRAFT, ARENA_DIRECT, SEALED]) {
      for (const prices of [defaultConfig().boxPrices, boxPrices]) {
        const config = { ...configFromPreset(preset, defaultConfig()), boxPrices: prices };
        const res = simulateBankrolls(config, { ...roll, startingGems: 20_000 }, 200, 23);
        // Every holding the result reports, which is what the breakdown
        // draws — the static ones plus one per box the ladder pays.
        const summed = Object.values(res.holdings).reduce((a, h) => a + h.worth, 0);
        expect(summed).toBeCloseTo(res.meanFinalValue, 6);
      }
    }
  });

  it("values a mixed-set ladder above what one rate would say", () => {
    /*
     * The cube's seven-win row pays a Spider-Man box and a Marvel Super
     * Heroes box. Priced apart they come to their two market prices; the
     * count-times-a-rate reading this replaced would have valued both at
     * whichever rate the config carried, and been wrong by the difference.
     */
    const config = {
      ...configFromPreset(ARENA_DIRECT, defaultConfig()),
      boxPrices: {
        sets: [
          { code: "spm", name: "Marvel's Spider-Man", releasedAt: "2025-09-26", boxes: { play: 25_538 } },
          { code: "msh", name: "Marvel Super Heroes", releasedAt: "2026-06-26", boxes: { play: 23_444 } },
        ],
        latest: { play: "msh" },
        generatedAt: "2026-08-16T00:00:00.000Z",
      },
    };
    const ev = eventExpectation(config);
    const split = grossSplit(config);
    // The split still adds up to the gross it decomposes, boxes and all.
    expect(Object.values(split).reduce((a, n) => a + n, 0)).toBeCloseTo(
      ev.meanGross,
      9,
    );
    /*
     * And each box is its own term at its own price. Six wins pays the
     * Spider-Man box alone; seven pays that and the Marvel Super Heroes box,
     * so the two rows weight the two products differently — which is what a
     * single "play boxes" figure could not say.
     */
    const p = ev.outcomes;
    expect(split[boxHoldingKey({ kind: "play", set: "spm" })]).toBeCloseTo(
      (p[6].probability + p[7].probability) * 25_538,
      9,
    );
    expect(split[boxHoldingKey({ kind: "play", set: "msh" })]).toBeCloseTo(
      p[7].probability * 23_444,
      9,
    );
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

  /*
   * Every static holding is reported whether or not the event pays it, which
   * is the contract every reader was written against: the packs tile reads
   * `holdings.packs.mean` without asking whether this ladder pays packs, and
   * a ladder that pays none should give it a zero rather than a crash. Only
   * the boxes are conditional, since which exist depends on the ladder.
   *
   * Pinned because filtering this list once shipped a blank page: the tests
   * all passed, because none of them simulated a ladder paying no packs.
   */
  it("reports every static holding, paid or not", () => {
    const config = {
      ...configFromPreset(ARENA_DIRECT, defaultConfig()),
      payouts: ARENA_DIRECT.payouts.map((t) => ({ ...t, packs: 0, gems: 0 })),
    };
    const res = simulateBankrolls(config, { ...roll, startingGems: 16_000 }, 50, 3);
    for (const key of HOLDING_KEYS) {
      expect(res.holdings[key], key).toBeDefined();
      expect(res.holdings[key].mean, key).toBeGreaterThanOrEqual(0);
    }
    // And it does not invent box holdings the ladder never pays.
    expect(Object.keys(res.holdings).filter(isBoxHolding)).toEqual([
      "box:play.spm",
      "box:play.msh",
    ]);
  });

  /*
   * A result outlives the config that produced it by one simulation: picking
   * a new event re-renders immediately and the old result stays on screen
   * until the new one lands. So every reader of `holdings` has to survive
   * being handed a config whose holdings it has never heard of — which
   * selecting Arena Direct from Premier Draft does, since the cube's two
   * boxes are keys no Premier result carries.
   */
  it("answers for a config its result has never seen", () => {
    const premier = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const stale = simulateBankrolls(premier, roll, 50, 7);
    const cube = configFromPreset(ARENA_DIRECT, defaultConfig());

    // The config wants two box holdings; the result has neither.
    expect(heldKeys(cube).filter(isBoxHolding)).toHaveLength(2);
    expect(reportedKeys(stale, cube).filter(isBoxHolding)).toHaveLength(0);
    // And every key it does report is one the result can answer for.
    for (const key of reportedKeys(stale, cube, true)) {
      expect(stale.holdings[key], key).toBeDefined();
    }
  });

  it("counts every reward a run wins, not just packs", () => {
    const config = configFromPreset(TRADITIONAL_DRAFT, defaultConfig());
    const res = simulateBankrolls(config, roll, 300, 19);
    expect(res.holdings.packs.mean).toBeGreaterThan(0);
    expect(res.holdings.playInPoints.mean).toBeGreaterThan(0);
    expect(res.holdings.draftPacks.mean).toBeGreaterThan(0);
    // Traditional Draft pays no physical product, so no box holding exists at
    // all — an absent row rather than a row of zeroes.
    expect(Object.keys(res.holdings).some(isBoxHolding)).toBe(false);
  });

  it("bins whole things on whole boundaries", () => {
    const config = configFromPreset(ARENA_DIRECT, defaultConfig());
    const res = simulateBankrolls(config, { ...roll, startingGems: 60_000 }, 300, 29);
    const boxes = res.holdings[boxHoldingKey({ kind: "play", set: "spm" })];
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
      // Capped: a long run keeps its opening events and stops recording, while
      // `events` goes on counting. Reachable now that a run can be dealt a win
      // rate well above the one on the slider.
      expect(log).toHaveLength(Math.min(run.events, RECORDED_EVENTS));
      expect(log.map((e) => e.event)).toEqual(log.map((_, i) => i + 1));
      // The last row's balances are where the run ended, which is what the
      // percentile beside it was computed from — but only where the log ran to
      // the end. A capped log stops mid-run and its last row is not the finish.
      if (log.length && run.events <= RECORDED_EVENTS) {
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
      // Only where the log is the whole run: past the cap it is an opening
      // extract, and an extract is not meant to add up to the totals.
      if (run.events > RECORDED_EVENTS) continue;
      const sum = (pick: (e: (typeof log)[number]) => number) =>
        log.reduce((a, e) => a + pick(e), 0);
      expect(sum((e) => e.packs)).toBe(run.packs);
      expect(sum((e) => e.playInPoints)).toBe(run.playInPoints);
      // The log names the boxes each event shipped; the run counts them per
      // product. Both have to describe the same run.
      expect(sum((e) => e.boxes.length)).toBe(
        run.boxes.reduce((a, n) => a + n, 0),
      );
      expect(sum((e) => e.wins)).toBe(run.wins);
      expect(sum((e) => e.rounds)).toBe(run.rounds);
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
    expect(run.rounds).toBeGreaterThan(
      (run.log ?? []).reduce((a, e) => a + e.rounds, 0),
    );
  });

  it("histograms every holding across every run", () => {
    const res = simulateBankrolls(defaultConfig(), roll, 200, 13);
    for (const totals of Object.values(res.holdings)) {
      const counted = totals.histogram.reduce((a, h) => a + h.count, 0);
      expect(counted).toBe(200);
    }
  });

  it("reports a median beside the mean for a rare physical prize", () => {
    // Two entries' worth of gems against a box that needs six wins from two
    // losses: the middle run wins none, and the mean sits above every outcome
    // the median run sees. Reporting one without the other would mislead.
    const config = configFromPreset(ARENA_DIRECT, defaultConfig());
    const res = simulateBankrolls(config, { ...roll, startingGems: 16_000 }, 400, 29);
    const boxes = res.holdings[boxHoldingKey({ kind: "play", set: "spm" })];
    expect(boxes.median).toBe(0);
    expect(boxes.mean).toBeGreaterThan(0);
    expect(boxes.probAny).toBeGreaterThan(0);
    expect(boxes.probAny).toBeLessThan(0.5);
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
    expect(GEMS_PER_10K_GOLD).toBe(1500);
    const config = { ...defaultConfig(), gemsPer10kGold: GEMS_PER_10K_GOLD };
    const run = {
      events: 0,
      wins: 0,
      rounds: 0,
      finalGems: 1000,
      finalGold: 10_000,
      packs: 0,
      draftPacks: 0,
      playInPoints: 0,
      boxes: [],
      survived: false,
    };
    expect(runValue(config, run)).toBe(1000 + 1500);
    // Valuing gold at nothing drops the term entirely.
    expect(runValue({ ...config, gemsPer10kGold: 0 }, run)).toBe(1000);
  });

  it("values the starting balance the way it values the ending one", () => {
    // The baseline ending values are judged against. Same rate, same zero-rate
    // behaviour as runValue — a run that begins with 10,000 gold has not
    // gained 1,500 gems of value by playing zero events.
    const config = { ...defaultConfig(), gemsPer10kGold: GEMS_PER_10K_GOLD };
    expect(startingValue(config, 1000, 10_000)).toBe(1000 + 1500);
    expect(startingValue(config, 1000, 0)).toBe(1000);
    expect(startingValue({ ...config, gemsPer10kGold: 0 }, 1000, 10_000)).toBe(1000);
  });

  it("reports the run's return against that same starting value", () => {
    // ROI on the bankroll tab is the ending value read once more, as a share
    // of what went in — so the two figures must be the one calculation.
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    const start = { ...roll, startingGems: 12_000, startingGold: 20_000 };
    const res = simulateBankrolls(config, start, 200, 41);
    const sv = startingValue(config, start.startingGems, start.startingGold);
    expect(bankrollRoi(res.meanFinalValue, sv)).toBeCloseTo(
      (res.meanFinalValue - sv) / sv,
      12,
    );
    // Doubling the bankroll is +100%; losing all of it is the floor at −100%.
    expect(bankrollRoi(2 * sv, sv)).toBeCloseTo(1, 12);
    expect(bankrollRoi(0, sv)).toBeCloseTo(-1, 12);
    // Nothing to divide by, so no answer rather than an enormous one.
    expect(bankrollRoi(res.meanFinalValue, 0)).toBeNull();
  });

  it("moves with the run length, where the per-event figure would not", () => {
    /*
     * What separates this from the per-event ROI, and the reason the tile's
     * popover says so: it covers a whole run rather than one entry, so how
     * long you intend to play is part of the answer.
     */
    const roiOver = (config: EventConfig, maxEvents: number): number => {
      const res = simulateBankrolls(config, { ...roll, maxEvents }, 200, 7);
      const value = bankrollRoi(
        res.meanFinalValue,
        startingValue(config, roll.startingGems, roll.startingGold),
      );
      if (value === null) throw new Error("a funded bankroll has a return");
      return value;
    };
    // A rate called certain and no daily gold, so the ladder is the only
    // income and every run plays at the stated rate.
    const base = { winRateMatches: 0, eventsPerDay: 0 };
    const winning = {
      ...configFromPreset(PREMIER_DRAFT, defaultConfig()),
      ...base,
      winRate: 0.75,
    };
    // Winnings go back in and buy further entries, so a longer run compounds.
    expect(roiOver(winning, 20)).toBeGreaterThan(0);
    expect(roiOver(winning, 100)).toBeGreaterThan(roiOver(winning, 20));

    // The other direction has a floor that is not the cap: a hopeless run
    // goes broke after six entries and then stops, so raising the limit
    // cannot take it any further down.
    const hopeless = { ...defaultConfig(), ...base, winRate: 0 };
    expect(roiOver(hopeless, 20)).toBeLessThan(0);
    expect(roiOver(hopeless, 100)).toBe(roiOver(hopeless, 20));
  });

  it("histogram accounts for every run", () => {
    const res = simulateBankrolls(defaultConfig(), roll, 200, 13);
    expect(res.histogram.reduce((a, h) => a + h.count, 0)).toBe(200);
  });
});

describe("the chance of a box", () => {
  /** Enough for one entry, and capped at one event, so a run is one event. */
  const oneEvent = {
    startingGems: 8_000,
    startingGold: 0,
    maxEvents: 1,
  };
  /** Room to keep entering, which is what makes the run-level chance differ. */
  const several = { ...oneEvent, startingGems: 40_000, maxEvents: 20 };
  const direct = () => configFromPreset(ARENA_DIRECT, defaultConfig());

  it("names the ladders that pay physical product", () => {
    expect(paysBoxes(ARENA_DIRECT.payouts)).toBe(true);
    expect(paysBoxes(ARENA_DIRECT_COLLECTOR.payouts)).toBe(true);
    expect(paysBoxes(PREMIER_DRAFT.payouts)).toBe(false);
    // Zeroing the tiers retires the reward, the way paidRewards reads it too.
    const noBoxes = ARENA_DIRECT.payouts.map((t) => ({ ...t, boxes: undefined }));
    expect(paysBoxes(noBoxes)).toBe(false);
  });

  it("prices one event's chance in closed form", () => {
    /*
     * Seven wins or two losses at an even rate. Finishing on k wins is k
     * wins before the second loss, which at p = ½ is (k + 1)/2^(k + 2), and
     * that sums to 15/16 over k = 0..5. So reaching six wins — where the play
     * boxes start — is the 1/16 left over.
     */
    expect(boxChancePerEvent(direct(), 0.5)).toBeCloseTo(1 / 16, 12);

    // Same structure, but the collector ladder pays only at seven. That is
    // 9/256 of the same distribution rather than the 16/256 above.
    const collector = configFromPreset(ARENA_DIRECT_COLLECTOR, defaultConfig());
    expect(boxChancePerEvent(collector, 0.5)).toBeCloseTo(9 / 256, 12);
  });

  it("counts both kinds of box as one thing", () => {
    // A collector box hung at five wins, below the play boxes at six and
    // seven: the chance is the three tiers together, not the larger of them.
    const base = direct();
    const config = {
      ...base,
      payouts: base.payouts.map((t) =>
        t.wins === 5 ? { ...t, boxes: [{ kind: "collector" as const }] } : t,
      ),
    };
    // 12/256 at five, on top of the 16/256 already at six and seven.
    expect(boxChancePerEvent(config, 0.5)).toBeCloseTo(28 / 256, 12);
  });

  it("rises with the win rate, and reaches both ends", () => {
    expect(boxChancePerEvent(direct(), 0.3)).toBeLessThan(
      boxChancePerEvent(direct(), 0.6),
    );
    // A player who cannot lose reaches seven wins every time; one who cannot
    // win is out at nought. Both sit outside the negative binomial's support,
    // so this is also the guard on exactDistribution's endpoints holding.
    expect(boxChancePerEvent(direct(), 1)).toBe(1);
    expect(boxChancePerEvent(direct(), 0)).toBe(0);
  });

  it("agrees with the closed form over a single event", () => {
    // The check the closed form is carried for. One entry, one event, and a
    // rate called certain so every run is played at the same one.
    const config = { ...direct(), winRate: 0.5, winRateMatches: 0 };
    const res = simulateBankrolls(config, oneEvent, 20_000, 7);
    expect(res.boxChance?.probAny).toBeCloseTo(boxChancePerEvent(config), 2);
  });

  it("is asked only of ladders that pay boxes", () => {
    const premier = configFromPreset(PREMIER_DRAFT, defaultConfig());
    expect(simulateBankrolls(premier, several, 200, 5).boxChance).toBeNull();
    expect(simulateBankrolls(direct(), several, 200, 5).boxChance).not.toBeNull();
  });

  it("counts a run's boxes whichever kind turned up", () => {
    const base = direct();
    // Play boxes at six and seven, and a collector box at five as well.
    const config = {
      ...base,
      payouts: base.payouts.map((t) =>
        t.wins === 5 ? { ...t, boxes: [{ kind: "collector" as const }] } : t,
      ),
    };
    const res = simulateBankrolls(config, several, 500, 17);
    const box = res.boxChance!;
    // Winning any counts, so the chance of one covers each product's own, and
    // strictly beats them where more than one kind actually turns up.
    const perBox = Object.entries(res.holdings)
      .filter(([key]) => isBoxHolding(key))
      .map(([, totals]) => totals.probAny);
    expect(perBox.length).toBeGreaterThan(1);
    for (const p of perBox) expect(box.probAny).toBeGreaterThan(p);
    // And no run holds a box the per-product counts have not also recorded.
    expect(box.probAny).toBeLessThanOrEqual(perBox.reduce((a, p) => a + p, 0));
  });

  it("improves with a bankroll that buys more entries", () => {
    const config = direct();
    const one = simulateBankrolls(config, several, 800, 3).boxChance!;
    const many = simulateBankrolls(
      config,
      { ...several, startingGems: 200_000 },
      800,
      3,
    ).boxChance!;
    expect(many.probAny).toBeGreaterThan(one.probAny);
    // Neither can beat the entry, and the closed form is what says so: one
    // event's chance is a property of the ladder, and a bankroll only ever
    // buys more attempts at it.
    expect(one.probAny).toBeGreaterThan(boxChancePerEvent(config));
  });

  it("widens the interval when the record behind the rate is short", () => {
    const base = direct();
    const width = (matches: number): number => {
      const res = simulateBankrolls(
        { ...base, winRateMatches: matches },
        several,
        1_000,
        11,
      );
      const [lo, hi] = res.boxChance!.interval!;
      // Ordered whichever way the win rate happens to help.
      expect(lo).toBeLessThanOrEqual(hi);
      return hi - lo;
    };
    // Twenty matches of record is a few drafts and leaves the rate wide open;
    // five hundred has all but settled it. The box chance inherits both.
    expect(width(20)).toBeGreaterThan(width(500));
  });

  it("drops the interval when the rate is called certain", () => {
    const config = { ...direct(), winRateMatches: 0 };
    const box = simulateBankrolls(config, several, 200, 13).boxChance!;
    expect(box.interval).toBeNull();
    // Still says what an interval would have covered, so the label need not
    // reach for the constant itself.
    expect(box.level).toBe(CREDIBLE_LEVEL);
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

  it("improves expected value without touching the outcome distribution", () => {
    const without = { ...defaultConfig(), eventsPerDay: 0 };
    const with_ = defaultConfig();
    const a = eventExpectation(without);
    const b = eventExpectation(with_);
    expect(b.meanNet).toBeGreaterThan(a.meanNet);
    // Gold pays the entry; it does not help you win.
    expect(b.outcomes.map((o) => o.probability)).toEqual(
      a.outcomes.map((o) => o.probability),
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

  it("names every event that awards play-in points", () => {
    // Three, and only at the top of each ladder. Traditional Draft pays 2 at
    // 3-0; both constructed events pay theirs at the ceiling too, 1 at 7-0
    // and 4 at 5-0. The cubes pay none despite being traditional, which is
    // why this is a list rather than a rule about the name.
    const awarding = PRESETS.filter((p) =>
      p.payouts.some((t) => (t.playInPoints ?? 0) > 0),
    ).map((p) => p.name);
    expect(awarding).toEqual([
      "Traditional Draft",
      "Constructed Event",
      "Traditional Constructed Event",
    ]);
    for (const name of awarding) {
      const preset = PRESETS.find((p) => p.name === name)!;
      const paying = preset.payouts.filter((t) => (t.playInPoints ?? 0) > 0);
      expect(paying).toEqual([preset.payouts[preset.payouts.length - 1]]);
    }
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
    expect(TRADITIONAL_DRAFT.structure).toEqual({ kind: "rounds", rounds: 3 });
    expect(TRADITIONAL_DRAFT.entryCostGems).toBe(1500);
    expect(TRADITIONAL_DRAFT.payouts).toHaveLength(4);
  });

  it("exposes all fourteen presets", () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      "Premier Draft",
      "Quick Draft",
      "Premier Cube Draft",
      "Traditional Draft",
      "Traditional Cube Draft",
      "Pick Two Draft",
      "Sealed",
      "Traditional Sealed",
      "Contender Draft",
      "Arena Direct (Cube)",
      "Arena Direct (Play)",
      "Arena Direct (Collector)",
      "Constructed Event",
      "Traditional Constructed Event",
    ]);
  });

  it("charges the same gold-to-gem rate everywhere both are priced", () => {
    // Arena sets GEMS_PER_10K_GOLD by what it charges, so an event that broke
    // the rate would make the constant a fiction. Constructed prices both
    // ways, at 2,500 gold against 375 gems, and lands on it exactly.
    const dual = PRESETS.filter((p) => (p.entryCostGold ?? 0) > 0);
    expect(dual.map((p) => p.name)).toContain("Constructed Event");
    for (const p of dual) {
      expect((p.entryCostGems / p.entryCostGold!) * 10_000).toBe(GEMS_PER_10K_GOLD);
    }
  });

  it("models Arena Direct as a two-loss run paying physical product", () => {
    // Quoted from the terms: "Entry is valid until 7 wins or 2 losses".
    expect(ARENA_DIRECT.structure).toEqual({
      kind: "elimination",
      maxWins: 7,
      maxLosses: 2,
    });
    expect(ARENA_DIRECT.entryCostGems).toBe(8000);
    // Gems and packs stop entirely once the prize becomes a box. The cube
    // names its sets, since its August 2026 run paid a Spider-Man box at six
    // and a Spider-Man and a Marvel Super Heroes box at seven.
    expect(ARENA_DIRECT.payouts[6]).toEqual({
      wins: 6,
      gems: 0,
      packs: 0,
      boxes: [{ kind: "play", set: "spm" }],
    });
    expect(ARENA_DIRECT.payouts[7].boxes).toEqual([
      { kind: "play", set: "spm" },
      { kind: "play", set: "msh" },
    ]);
  });

  it("prices boxes into the gross", () => {
    const config = configFromPreset(ARENA_DIRECT, defaultConfig());
    expect(config.playBoxValueGems).toBe(DEFAULT_PLAY_BOX_VALUE_GEMS);
    // A fresh config carries the feed the app shipped with, so the two boxes
    // on the seven-win row are each priced as the product they name — the sum
    // of two prices, not a count times a rate.
    const spm = boxValueGems(config, { kind: "play", set: "spm" });
    const msh = boxValueGems(config, { kind: "play", set: "msh" });
    expect(grossValue(config, 7)).toBe(spm + msh);
    expect(grossValue(config, 6)).toBe(spm);
    // With no table at all, both fall back to the generic rate.
    const bare = { ...config, boxPrices: EMPTY_BOX_PRICES };
    expect(grossValue(bare, 7)).toBe(2 * config.playBoxValueGems);
    expect(grossValue(bare, 6)).toBe(config.playBoxValueGems);
    // Valuing boxes at nothing strips the top two tiers back to zero, and it
    // has to do so for a box that names a set as much as for one that does not
    // — otherwise "zero these out" would leave an Arena Direct priced.
    const worthless = { ...config, playBoxValueGems: 0 };
    expect(grossValue(worthless, 6)).toBe(0);
    expect(grossValue(worthless, 7)).toBe(0);
  });

  it("prices a named box at its own set's market price", () => {
    const config = {
      ...configFromPreset(ARENA_DIRECT, defaultConfig()),
      boxPrices: {
        sets: [
          { code: "spm", name: "Marvel's Spider-Man", releasedAt: "2025-09-26", boxes: { play: 25_538 } },
          { code: "msh", name: "Marvel Super Heroes", releasedAt: "2026-06-26", boxes: { play: 23_444 } },
        ],
        latest: { play: "msh" },
        generatedAt: "2026-08-16T00:00:00.000Z",
      },
    };
    // Six wins is one Spider-Man box; seven is that and a Marvel Super Heroes
    // box, which are different prices — the thing a count times a rate cannot
    // express.
    expect(grossValue(config, 6)).toBe(25_538);
    expect(grossValue(config, 7)).toBe(25_538 + 23_444);
    // A set the feed does not carry falls back to the generic rate rather
    // than to nothing.
    const thin = { ...config, boxPrices: { ...config.boxPrices, sets: [config.boxPrices.sets[0]] } };
    expect(grossValue(thin, 7)).toBe(25_538 + DEFAULT_PLAY_BOX_VALUE_GEMS);
  });

  it("resolves the newest-set boxes the sealed Arena Directs pay", () => {
    const boxPrices = {
      sets: [
        { code: "hob", name: "The Hobbit", releasedAt: "2026-08-14", boxes: { play: 38_658, collector: 164_554 } },
        { code: "msh", name: "Marvel Super Heroes", releasedAt: "2026-06-26", boxes: { play: 23_444 } },
      ],
      latest: { play: "hob", collector: "hob" },
      generatedAt: "2026-08-16T00:00:00.000Z",
    };
    const play = { ...configFromPreset(ARENA_DIRECT_PLAY, defaultConfig()), boxPrices };
    expect(grossValue(play, 6) - grossValue(play, 5) + 10_800 + 24 * play.packValueGems).toBe(
      38_658,
    );
    expect(boxValueGems(play, { kind: "play", set: LATEST_SET })).toBe(38_658);

    const collector = {
      ...configFromPreset(ARENA_DIRECT_COLLECTOR, defaultConfig()),
      boxPrices,
    };
    expect(boxValueGems(collector, { kind: "collector", set: LATEST_SET })).toBe(164_554);

    // Nothing newest to resolve to — the feed has no collector price at all —
    // and the generic rate stands in.
    const noCollector = {
      ...collector,
      boxPrices: { ...boxPrices, latest: { play: "hob" } },
    };
    expect(boxValueGems(noCollector, { kind: "collector", set: LATEST_SET })).toBe(
      DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
    );
  });

  it("converts physical prizes at 200 gems to the dollar", () => {
    expect(GEMS_PER_USD).toBe(200);
    // 20,000 gems for $99.99 is the best rung on the store ladder, and so the
    // most generous rate — not the largest bundle, which is the 40,000 and is
    // fractionally worse per gem.
    // TCGplayer market prices averaged over The Hobbit, Marvel Super Heroes
    // and Secrets of Strixhaven, as of 2026-08-17.
    expect(DEFAULT_PLAY_BOX_VALUE_GEMS).toBe(
      Math.round(((193.29 + 117.22 + 137.48) / 3) * 200),
    );
    expect(DEFAULT_COLLECTOR_BOX_VALUE_GEMS).toBe(
      Math.round(((822.77 + 474.56 + 504.41) / 3) * 200),
    );
    /*
     * Pinned outright as well, because the two lines above re-derive the value
     * exactly as the source does and so agree with it whatever the rate says.
     * That is why this test passed throughout the period GEMS_PER_USD was 400
     * — double every other bundle on the ladder — and it is the hole these two
     * literals close.
     */
    expect(DEFAULT_PLAY_BOX_VALUE_GEMS).toBe(29_866);
    expect(DEFAULT_COLLECTOR_BOX_VALUE_GEMS).toBe(120_116);
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
    expect(pMatch).toBeCloseTo(0.55, 12);
    const d = exactDistribution(pMatch, structure);
    expect(d).toHaveLength(5);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (let k = 0; k < 4; k++) {
      expect(d[k]).toBeCloseTo((k + 1) * Math.pow(pMatch, k) * (1 - pMatch) ** 2, 12);
    }
  });

  it("models Pick Two Draft as 4 wins or 2 losses", () => {
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
