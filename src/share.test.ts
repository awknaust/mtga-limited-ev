import { describe, expect, it } from "vitest";

import {
  decodePayouts,
  decodeShareState,
  defaultShareState,
  encodePayouts,
  encodeShareState,
  presetSlug,
  type ShareState,
} from "./share";
import {
  CUSTOM_PRESET,
  PRESETS,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_DRAFT,
  configFromPreset,
  defaultConfig,
  maxPossibleWins,
} from "./lib";

/** The default state with one thing changed, which is the case links are for. */
const withState = (patch: Partial<ShareState>): ShareState => ({
  ...defaultShareState(),
  ...patch,
});

const roundTrip = (state: ShareState): ShareState =>
  decodeShareState(encodeShareState(state));

describe("preset slugs", () => {
  it("are unique across every preset and Custom", () => {
    const slugs = [...PRESETS.map((p) => p.name), CUSTOM_PRESET].map(presetSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("read as the event does", () => {
    expect(presetSlug("Premier Draft")).toBe("premier-draft");
    expect(presetSlug("Arena Direct (Cube)")).toBe("arena-direct-cube");
    expect(presetSlug(CUSTOM_PRESET)).toBe("custom");
  });
});

describe("encoding only what was touched", () => {
  it("writes nothing at all for an untouched load", () => {
    expect(encodeShareState(defaultShareState())).toBe("");
  });

  it("writes one parameter for one changed field", () => {
    const state = withState({
      config: { ...defaultConfig(), winRate: 0.62 },
    });
    expect(encodeShareState(state)).toBe("wr=0.62");
  });

  it("names a preset without restating the ladder it implies", () => {
    const state = withState({
      presetName: QUICK_DRAFT.name,
      config: configFromPreset(QUICK_DRAFT, defaultConfig()),
    });
    // Entry cost, payouts and draft packs all differ from Premier's, and none
    // of them belongs in the URL — the preset already says what they are.
    expect(encodeShareState(state)).toBe("preset=quick-draft");
  });

  it("writes the delta from the preset, not from the model default", () => {
    const state = withState({
      presetName: SEALED.name,
      config: { ...configFromPreset(SEALED, defaultConfig()), entryCostGems: 2500 },
    });
    expect(encodeShareState(state)).toBe("preset=sealed&entry=2500");
  });

  it("keeps a bankroll setting out until it moves", () => {
    // Read off the defaults rather than written out: this asserts that an
    // untouched field stays out of the URL, which is a different claim from
    // what the default happens to be. share.compat.test.ts pins the value.
    const { startingGems } = defaultShareState();
    expect(encodeShareState(withState({ startingGems }))).toBe("");
    expect(encodeShareState(withState({ startingGems: 10000 }))).toBe("startGems=10000");
  });

  it("spells the flags only when they are off their default", () => {
    expect(encodeShareState(withState({ tab: "event", unit: "usd" }))).toBe(
      "tab=event&unit=usd",
    );
  });
});

describe("round trips", () => {
  it("restores an untouched load from an empty query", () => {
    expect(decodeShareState("")).toEqual(defaultShareState());
  });

  it("restores every preset unchanged", () => {
    for (const preset of PRESETS) {
      const state = withState({
        presetName: preset.name,
        config: configFromPreset(preset, defaultConfig()),
      });
      expect(roundTrip(state)).toEqual(state);
    }
  });

  it("restores a fully hand-edited custom event", () => {
    const state = withState({
      presetName: CUSTOM_PRESET,
      config: {
        ...defaultConfig(),
        winRate: 0.6125,
        structure: { kind: "rounds", rounds: 4 },
        entryCostGems: 1234,
        entryCostGold: 9000,
        otherGoldPerDay: 900,
        eventsPerDay: 2,
        goldPerGem: 5,
        draftPacks: 4,
        draftPackValueGems: 110,
        packValueGems: 132,
        playInPointValueGems: 250,
        playBoxValueGems: 60000,
        collectorBoxValueGems: 250000,
        payouts: [
          { wins: 0, gems: 10, packs: 1 },
          { wins: 1, gems: 20, packs: 1 },
          { wins: 2, gems: 30, packs: 2, playInPoints: 1 },
          { wins: 3, gems: 40, packs: 3, playBoxes: 1 },
          { wins: 4, gems: 50, packs: 4, collectorBoxes: 2 },
        ],
      },
      trials: 25_000,
      seed: 7,
      startingGems: 12_000,
      startingGold: 5_000,
      maxEvents: 50,
      tab: "event",
      unit: "usd",
      gemsPerUsd: 350,
    });
    expect(roundTrip(state)).toEqual(state);
  });

  it("restores a best-of-three win rate, which comes off a bisection", () => {
    // The per-game rate behind a 57.5% match rate is not a round number, and
    // six decimal places is well below anything the screen resolves.
    const state = withState({
      presetName: TRADITIONAL_DRAFT.name,
      config: { ...configFromPreset(TRADITIONAL_DRAFT, defaultConfig()), winRate: 0.5500001 },
    });
    expect(roundTrip(state).config.winRate).toBeCloseTo(0.5500001, 6);
  });

  it("restores gold counted as worthless", () => {
    const state = withState({
      config: { ...defaultConfig(), goldPerGem: Number.POSITIVE_INFINITY },
    });
    expect(encodeShareState(state)).toBe("goldPer10k=0");
    expect(roundTrip(state).config.goldPerGem).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("payout table codec", () => {
  it("drops the trailing columns an event does not award", () => {
    expect(encodePayouts([{ wins: 0, gems: 50, packs: 1 }])).toBe("50-1");
  });

  it("keeps a zero that sits before a column that is used", () => {
    expect(
      encodePayouts([{ wins: 0, gems: 0, packs: 0, collectorBoxes: 2 }]),
    ).toBe("0-0-0-0-2");
  });

  it("round-trips a ladder with points and boxes", () => {
    const payouts = [
      { wins: 0, gems: 0, packs: 1 },
      { wins: 1, gems: 250, packs: 1 },
      { wins: 2, gems: 1000, packs: 3, playInPoints: 2 },
      { wins: 3, gems: 2500, packs: 6, playBoxes: 1, collectorBoxes: 3 },
    ];
    expect(decodePayouts(encodePayouts(payouts))).toEqual(payouts);
  });

  it("survives form encoding untouched", () => {
    const encoded = encodePayouts([
      { wins: 0, gems: 50, packs: 1 },
      { wins: 1, gems: 100, packs: 2 },
    ]);
    expect(new URLSearchParams({ payouts: encoded }).toString()).toBe(
      `payouts=${encoded}`,
    );
  });

  it.each([
    ["", "empty"],
    ["50", "a row missing its pack count"],
    ["50-1-0-0-0-0", "a row with more columns than exist"],
    ["50-x", "a row that is not numeric"],
    ["50-1_", "a trailing separator"],
  ])("rejects %s (%s)", (raw) => {
    expect(decodePayouts(raw)).toBeNull();
  });
});

describe("input from a URL is not trusted", () => {
  it("falls back to the default preset for an unknown one", () => {
    expect(decodeShareState("preset=not-an-event").presetName).toBe(
      defaultShareState().presetName,
    );
  });

  it("clamps a win rate above 1", () => {
    expect(decodeShareState("wr=42").config.winRate).toBe(1);
  });

  it("drops values that are not numbers", () => {
    const fallback = defaultShareState();
    expect(decodeShareState("wr=banana").config.winRate).toBe(fallback.config.winRate);
    expect(decodeShareState("trials=NaN").trials).toBe(fallback.trials);
    expect(decodeShareState("seed=").seed).toBe(fallback.seed);
  });

  it("holds the trial and event ceilings the inputs hold", () => {
    expect(decodeShareState("trials=99999999").trials).toBe(5_000_000);
    expect(decodeShareState("trials=0").trials).toBe(1);
    expect(decodeShareState("maxEvents=99999").maxEvents).toBe(2000);
  });

  it("keeps the preset's ladder when the payout table is malformed", () => {
    const config = decodeShareState("preset=quick-draft&payouts=nonsense").config;
    expect(config.payouts).toEqual(configFromPreset(QUICK_DRAFT, defaultConfig()).payouts);
  });

  it("rejects a negative amount rather than feeding it to the model", () => {
    expect(decodePayouts("50--1")).toBeNull();
    expect(decodeShareState("entry=-500").config.entryCostGems).toBe(0);
  });

  it("keeps a row per reachable win count however the two disagree", () => {
    // A hand-edited URL naming a four-round event and a two-row ladder.
    const config = decodeShareState("rounds=4&payouts=50-1_100-2").config;
    expect(config.payouts).toHaveLength(maxPossibleWins(config.structure) + 1);
    expect(config.payouts.map((t) => t.wins)).toEqual([0, 1, 2, 3, 4]);
  });

  it("ignores a structure field for the kind it did not name", () => {
    const config = decodeShareState("rounds=3&maxWins=99").config;
    expect(config.structure).toEqual({ kind: "rounds", rounds: 3 });
  });

  it("falls back to a sane elimination shape from a rounds preset", () => {
    const config = decodeShareState("preset=traditional-draft&maxWins=5").config;
    expect(config.structure).toEqual({ kind: "elimination", maxWins: 5, maxLosses: 3 });
  });
});
