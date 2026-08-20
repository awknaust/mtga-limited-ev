/**
 * The cache key must move when any input the model reads moves, and must not
 * move when the request means the same simulation. Canonical serialization
 * makes the first property nearly automatic — every field is in the key
 * unless the normalization in keys.ts drops it — so the typed mutation
 * table below now guards the normalizer: it fails to compile when
 * `EventConfig` grows a field, as a prompt to decide whether the new field
 * needs the same absent-means-zero treatment the payout tiers get.
 */

import { describe, expect, it } from "vitest";

import { defaultConfig } from "../lib/presets";
import type { EventConfig } from "../lib/types";
import { requestKey } from "./keys";
import type { BankrollsRequest, CompareRequest } from "./protocol";

const bankRequest = (config: EventConfig = defaultConfig()): BankrollsRequest => ({
  kind: "bankrolls",
  config,
  bankroll: { startingGems: 3000, startingGold: 0, startingPlayInPoints: 0, maxEvents: 20 },
  runs: 1000,
  seed: 1,
});

/** One changed value per field, each different from `defaultConfig()`'s. */
const MUTATED: { [K in keyof EventConfig]: EventConfig[K] } = {
  winRateMatches: 7,
  winRate: 0.61,
  structure: { kind: "rounds", rounds: 9 },
  entryCostGems: 1501,
  entryCostGold: 10001,
  entryCostPlayInPoints: 21,
  otherGoldPerDay: 601,
  gamesPerDay: 13,
  gamesPerMatch: 2.5,
  gemsPer10kGold: 1501,
  draftPacks: 4,
  draftPackValueGems: 24,
  packValueGems: 23,
  mythicPackValueGems: 38,
  cubePackValueGems: 52,
  playInPointValueGems: 201,
  qualifierTokenValueGems: 4831,
  playBoxValueGems: 1,
  collectorBoxValueGems: 2,
  /*
   * Not a setting anyone edits — it is what the live feed said — but it is in
   * the key for the reason everything else is: a box repriced overnight is a
   * different answer, and a cached one would go on quoting yesterday's.
   */
  boxPrices: {
    sets: [
      {
        code: "msh",
        name: "Marvel Super Heroes",
        releasedAt: "2026-06-26",
        boxes: { play: 23_444 },
      },
    ],
    latest: { play: "msh" },
    generatedAt: "2026-08-16T00:00:00.000Z",
  },
  /*
   * The mastery rates. Nothing the worker simulates reads them — they price a
   * season's pass, not an event — so they are in the key only because the key is
   * the whole config, and the cost of that is a cache miss on a change that
   * could not have moved the result. Cheap next to the alternative, which is a
   * field silently absent from the key and two different configs sharing an
   * answer.
   */
  draftTokenValueGems: 1501,
  mythicIcrValueGems: 41,
  rareCardValueGems: 21,
  uncommonIcrValueGems: 2,
  dailyWinIcrValueGems: 3.5,
  orbValueGems: 1,
  cardStyleValueGems: 2,
  sleeveValueGems: 3,
  avatarValueGems: 4,
  companionValueGems: 5,
  payouts: [{ wins: 0, gems: 999, packs: 0 }],
};

const gridRequest = (configs: EventConfig[]): CompareRequest => ({
  kind: "compare",
  configs,
  bankroll: bankRequest().bankroll,
  runs: 1000,
  seed: 1,
});

describe("requestKey", () => {
  it("is identical for structurally equal requests", () => {
    expect(requestKey(bankRequest())).toBe(requestKey(bankRequest()));
  });

  it("ignores property insertion order", () => {
    // Configs reach the key from different builders — URL decode, preset
    // application, hand edits — and nothing guarantees they assemble their
    // properties in the same order. Deep-equal must mean same key anyway.
    const config = defaultConfig();
    const reversed = Object.fromEntries(Object.entries(config).reverse()) as EventConfig;
    reversed.structure = Object.fromEntries(
      Object.entries(config.structure).reverse(),
    ) as EventConfig["structure"];
    expect(requestKey(bankRequest(reversed))).toBe(requestKey(bankRequest(config)));
  });

  it.each(Object.keys(MUTATED) as (keyof EventConfig)[])(
    "moves when config.%s moves",
    (field) => {
      const mutated = { ...defaultConfig(), [field]: MUTATED[field] };
      expect(requestKey(bankRequest(mutated))).not.toBe(requestKey(bankRequest()));
    },
  );

  it("distinguishes structures within and across kinds", () => {
    const at = (structure: EventConfig["structure"]) =>
      requestKey(bankRequest({ ...defaultConfig(), structure }));
    const keys = [
      at({ kind: "elimination", maxWins: 7, maxLosses: 3 }),
      at({ kind: "elimination", maxWins: 7, maxLosses: 4 }),
      at({ kind: "elimination", maxWins: 8, maxLosses: 3 }),
      at({ kind: "rounds", rounds: 3 }),
      at({ kind: "rounds", rounds: 4 }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reads absent payout options as the 0 the model prices them at", () => {
    const withTier = (tier: EventConfig["payouts"][number]) =>
      requestKey(bankRequest({ ...defaultConfig(), payouts: [tier] }));
    const bare = withTier({ wins: 0, gems: 10, packs: 1 });
    // Absent and explicit 0 are the same simulation, so the same key.
    expect(withTier({ wins: 0, gems: 10, packs: 1, playInPoints: 0, boxes: [] })).toBe(bare);
    // A real value is a different simulation.
    expect(withTier({ wins: 0, gems: 10, packs: 1, playInPoints: 1 })).not.toBe(bare);
    expect(
      withTier({ wins: 0, gems: 10, packs: 1, boxes: [{ kind: "play" }] }),
    ).not.toBe(bare);
    expect(
      withTier({ wins: 0, gems: 10, packs: 1, boxes: [{ kind: "collector" }] }),
    ).not.toBe(bare);
  });

  it("prices a named box apart from a generic one, and from another set's", () => {
    const withTier = (tier: EventConfig["payouts"][number]) =>
      requestKey(bankRequest({ ...defaultConfig(), payouts: [tier] }));
    const generic = withTier({ wins: 0, gems: 0, packs: 0, boxes: [{ kind: "play" }] });
    const msh = withTier({
      wins: 0,
      gems: 0,
      packs: 0,
      boxes: [{ kind: "play", set: "msh" }],
    });
    const spm = withTier({
      wins: 0,
      gems: 0,
      packs: 0,
      boxes: [{ kind: "play", set: "spm" }],
    });
    expect(new Set([generic, msh, spm]).size).toBe(3);
  });

  it("ignores the order two boxes were listed in, since the model does", () => {
    const withBoxes = (boxes: EventConfig["payouts"][number]["boxes"]) =>
      requestKey(
        bankRequest({ ...defaultConfig(), payouts: [{ wins: 0, gems: 0, packs: 0, boxes }] }),
      );
    expect(
      withBoxes([
        { kind: "play", set: "spm" },
        { kind: "play", set: "msh" },
      ]),
    ).toBe(
      withBoxes([
        { kind: "play", set: "msh" },
        { kind: "play", set: "spm" },
      ]),
    );
    // Two of the same box is not one of them, though.
    expect(withBoxes([{ kind: "play" }, { kind: "play" }])).not.toBe(
      withBoxes([{ kind: "play" }]),
    );
  });

  it("moves when a box's price moves, so a refreshed feed is not served stale", () => {
    const config = {
      ...defaultConfig(),
      payouts: [{ wins: 0, gems: 0, packs: 0, boxes: [{ kind: "play" as const, set: "msh" }] }],
    };
    const priced = (gems: number): EventConfig => ({
      ...config,
      boxPrices: {
        sets: [{ code: "msh", name: "Marvel Super Heroes", releasedAt: "2026-06-26", boxes: { play: gems } }],
        latest: { play: "msh" },
        generatedAt: "2026-08-16T00:00:00.000Z",
      },
    });
    expect(requestKey(bankRequest(priced(23_444)))).not.toBe(
      requestKey(bankRequest(priced(25_000))),
    );
  });

  it("moves with the request's own numbers", () => {
    expect(requestKey({ ...bankRequest(), runs: 1001 })).not.toBe(requestKey(bankRequest()));
    expect(requestKey({ ...bankRequest(), seed: 2 })).not.toBe(requestKey(bankRequest()));
    const roll = bankRequest();
    for (const patch of [
      { startingGems: 3001 },
      { startingGold: 1 },
      { maxEvents: 21 },
    ]) {
      expect(
        requestKey({ ...roll, bankroll: { ...roll.bankroll, ...patch } }),
      ).not.toBe(requestKey(roll));
    }
  });

  it("keeps a grid's key apart from a single event's", () => {
    // Same numbers, same lone config, different question. The two shapes
    // already serialize apart on `config` versus `configs`, so this is not
    // what the `kind` tag is carrying — it is here because the day the pools
    // are ever merged, this is the assertion that has to still hold.
    expect(requestKey(gridRequest([defaultConfig()]))).not.toBe(requestKey(bankRequest()));
  });

  it("normalizes every config in a grid, not just the first", () => {
    const bare = { ...defaultConfig(), payouts: [{ wins: 0, gems: 10, packs: 1 }] };
    const spelled = {
      ...defaultConfig(),
      payouts: [{ wins: 0, gems: 10, packs: 1, playInPoints: 0, boxes: [] }],
    };
    // Absent and explicit-zero are the same simulation wherever in the grid
    // they sit; a normalizer applied to configs[0] alone would miss this.
    expect(requestKey(gridRequest([bare, spelled]))).toBe(requestKey(gridRequest([bare, bare])));
    expect(requestKey(gridRequest([spelled, bare]))).toBe(requestKey(gridRequest([bare, bare])));
  });

  it("keeps two orders of the same grid apart, since the answer is positional", () => {
    const a = defaultConfig();
    const b = { ...defaultConfig(), entryCostGems: 750 };
    expect(requestKey(gridRequest([a, b]))).not.toBe(requestKey(gridRequest([b, a])));
  });

  it("moves when any one config in the grid moves", () => {
    const a = defaultConfig();
    const b = { ...defaultConfig(), entryCostGems: 750 };
    const moved = { ...b, entryCostGems: 751 };
    expect(requestKey(gridRequest([a, moved]))).not.toBe(requestKey(gridRequest([a, b])));
  });

  it("keeps a grid of one apart from a grid of two", () => {
    const a = defaultConfig();
    expect(requestKey(gridRequest([a]))).not.toBe(requestKey(gridRequest([a, a])));
    expect(requestKey(gridRequest([]))).not.toBe(requestKey(gridRequest([a])));
  });
});
