import { describe, expect, it } from "vitest";
import {
  ARENA_DIRECT,
  CONTENDER_DRAFT,
  CUBE_DRAFT,
  DEFAULT_PACK_VALUE_GEMS,
  DEFAULT_PLAY_IN_POINT_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  GEMS_PER_USD,
  PICK_TWO_DRAFT,
  PREMIER_DRAFT,
  PRESETS,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_DRAFT,
  bo3WinRate,
  breakEvenWinRate,
  configFromPreset,
  defaultConfig,
  exactDistribution,
  expectedNetAt,
  grossValue,
  matchWinRate,
  maxPossibleWins,
  maxRounds,
  playInPointsFor,
  resizePayouts,
  simulate,
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
    expect(grown[3]).toEqual({ wins: 3, gems: 3000, packs: 6, playInPoints: 2 });
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
    expect(grossValue(config, 3)).toBe(
      tier.gems + tier.packs * config.packValueGems + 2 * config.playInPointValueGems,
    );
    // Valuing them at nothing takes the whole term back out.
    expect(grossValue({ ...config, playInPointValueGems: 0 }, 3)).toBe(
      tier.gems + tier.packs * config.packValueGems,
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

  it("gives Cube the Premier structure", () => {
    expect(CUBE_DRAFT.payouts).toEqual(PREMIER_DRAFT.payouts);
    expect(CUBE_DRAFT.entryCostGems).toBe(PREMIER_DRAFT.entryCostGems);
    expect(CUBE_DRAFT.structure).toEqual(PREMIER_DRAFT.structure);
  });

  it("models Traditional Draft as three BO3 rounds", () => {
    expect(TRADITIONAL_DRAFT.format).toBe("bo3");
    expect(TRADITIONAL_DRAFT.structure).toEqual({ kind: "rounds", rounds: 3 });
    expect(TRADITIONAL_DRAFT.entryCostGems).toBe(1500);
    expect(TRADITIONAL_DRAFT.payouts).toHaveLength(4);
  });

  it("exposes all eight presets", () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      "Premier Draft",
      "Quick Draft",
      "Cube Draft",
      "Traditional Draft",
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
    expect(DEFAULT_PLAY_BOX_VALUE_GEMS).toBe(Math.round(209.7 * 400));
    expect(DEFAULT_COLLECTOR_BOX_VALUE_GEMS).toBe(Math.round(479.88 * 400));
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

  it("pays nothing at all for a Contender run under three wins", () => {
    const config = configFromPreset(CONTENDER_DRAFT, defaultConfig());
    for (const wins of [0, 1, 2]) {
      expect(grossValue(config, wins)).toBe(0);
      // The entry is a pure loss on those runs.
      expect(grossValue(config, wins) - config.entryCostGems).toBe(-3000);
    }
    expect(grossValue(config, 7)).toBe(7200 + 22 * config.packValueGems);
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
    );
    expect(expectedNetAt(config, 0.55)).toBeCloseTo(gross - 900, 6);
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
