import { describe, expect, it } from "vitest";
import {
  CUBE_DRAFT,
  PREMIER_DRAFT,
  PRESETS,
  QUICK_DRAFT,
  breakEvenWinRate,
  configFromPreset,
  defaultConfig,
  exactDistribution,
  expectedNetAt,
  matchesPreset,
  simulate,
} from "./draft";

describe("exactDistribution", () => {
  it("sums to 1", () => {
    for (const p of [0, 0.25, 0.5, 0.62, 0.9, 1]) {
      const total = exactDistribution(p, 7, 3).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("puts all mass on 0 wins at p=0 and on 7 wins at p=1", () => {
    expect(exactDistribution(0, 7, 3)[0]).toBeCloseTo(1, 12);
    expect(exactDistribution(1, 7, 3)[7]).toBeCloseTo(1, 12);
  });

  it("matches hand-computed values at p=0.5", () => {
    const d = exactDistribution(0.5, 7, 3);
    // 0 wins: lose the first three games outright.
    expect(d[0]).toBeCloseTo(0.125, 12);
    // 1 win: C(3,1) orderings of (W,L,L) with the last game a loss = 3 * 0.5^4.
    expect(d[1]).toBeCloseTo(3 * 0.0625, 12);
    // 7 wins: sum over 0,1,2 losses.
    expect(d[7]).toBeCloseTo(
      (1 * 0.5 ** 7 + 7 * 0.5 ** 8 + 28 * 0.5 ** 9),
      12,
    );
  });
});

describe("simulate", () => {
  it("converges to the closed-form distribution", () => {
    const config = { ...defaultConfig(), winRate: 0.58 };
    const res = simulate(config, 200_000, 42);
    for (const b of res.buckets) {
      expect(Math.abs(b.probability - b.exactProbability)).toBeLessThan(0.005);
    }
    expect(Math.abs(res.meanNet - res.exactMeanNet)).toBeLessThan(150);
  });

  it("is deterministic for a given seed", () => {
    const config = defaultConfig();
    expect(simulate(config, 5_000, 7).meanNet).toBe(simulate(config, 5_000, 7).meanNet);
  });

  it("never exceeds 9 games per event under 7-wins/3-losses", () => {
    const res = simulate(defaultConfig(), 20_000, 3);
    expect(res.meanGames).toBeLessThanOrEqual(9);
    expect(res.meanGames).toBeGreaterThan(0);
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

  it("returns null when the top payout can never cover the entry", () => {
    // Premier's gem payout tops out at 2,200, so a 10,000 gem entry with packs
    // valued at 0 is negative at every win rate.
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

  it("gives Cube the Premier structure", () => {
    expect(CUBE_DRAFT.payouts).toEqual(PREMIER_DRAFT.payouts);
    expect(CUBE_DRAFT.entryCostGems).toBe(PREMIER_DRAFT.entryCostGems);
    expect(CUBE_DRAFT.maxWins).toBe(PREMIER_DRAFT.maxWins);
    expect(CUBE_DRAFT.maxLosses).toBe(PREMIER_DRAFT.maxLosses);
  });

  it("exposes Premier, Quick and Cube", () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      "Premier Draft",
      "Quick Draft",
      "Cube Draft",
    ]);
  });

  it("does not share payout arrays between config and preset", () => {
    // configFromPreset must deep-copy, or editing the table would mutate the
    // preset and silently corrupt every later switch.
    const config = configFromPreset(PREMIER_DRAFT, defaultConfig());
    config.payouts[0].gems = 99999;
    expect(PREMIER_DRAFT.payouts[0].gems).toBe(50);
  });

  it("tracks whether a config still matches the selected preset", () => {
    const config = defaultConfig();
    expect(matchesPreset(config, "Premier Draft")).toBe(true);
    // Cube is structurally identical, so it matches too — which is why the UI
    // remembers the selection rather than deriving it.
    expect(matchesPreset(config, "Cube Draft")).toBe(true);
    expect(matchesPreset(config, "Quick Draft")).toBe(false);
    expect(matchesPreset({ ...config, entryCostGems: 1600 }, "Premier Draft")).toBe(
      false,
    );
  });

  it("keeps win rate and pack value when switching preset", () => {
    const base = { ...defaultConfig(), winRate: 0.61, packValueGems: 200 };
    const next = configFromPreset(QUICK_DRAFT, base);
    expect(next.winRate).toBe(0.61);
    expect(next.packValueGems).toBe(200);
    expect(next.entryCostGems).toBe(750);
  });
});
