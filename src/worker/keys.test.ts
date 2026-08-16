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
import type { BankrollsRequest, SimulateRequest } from "./protocol";

const simRequest = (config: EventConfig = defaultConfig()): SimulateRequest => ({
  kind: "simulate",
  config,
  trials: 1000,
  seed: 1,
});

const bankRequest = (config: EventConfig = defaultConfig()): BankrollsRequest => ({
  kind: "bankrolls",
  config,
  bankroll: { startingGems: 3000, startingGold: 0, maxEvents: 20 },
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
  otherGoldPerDay: 601,
  eventsPerDay: 3,
  gemsPer10kGold: 1501,
  draftPacks: 4,
  draftPackValueGems: 24,
  packValueGems: 23,
  playInPointValueGems: 201,
  playBoxValueGems: 1,
  collectorBoxValueGems: 2,
  /*
   * The mastery rates. Nothing the workers simulate reads them — they price a
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
  orbValueGems: 1,
  cardStyleValueGems: 2,
  sleeveValueGems: 3,
  avatarValueGems: 4,
  companionValueGems: 5,
  payouts: [{ wins: 0, gems: 999, packs: 0 }],
};

describe("requestKey", () => {
  it("is identical for structurally equal requests", () => {
    expect(requestKey(simRequest())).toBe(requestKey(simRequest()));
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
    expect(requestKey(simRequest(reversed))).toBe(requestKey(simRequest(config)));
  });

  it.each(Object.keys(MUTATED) as (keyof EventConfig)[])(
    "moves when config.%s moves",
    (field) => {
      const mutated = { ...defaultConfig(), [field]: MUTATED[field] };
      expect(requestKey(simRequest(mutated))).not.toBe(requestKey(simRequest()));
      expect(requestKey(bankRequest(mutated))).not.toBe(requestKey(bankRequest()));
    },
  );

  it("distinguishes structures within and across kinds", () => {
    const at = (structure: EventConfig["structure"]) =>
      requestKey(simRequest({ ...defaultConfig(), structure }));
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
      requestKey(simRequest({ ...defaultConfig(), payouts: [tier] }));
    const bare = withTier({ wins: 0, gems: 10, packs: 1 });
    // Absent and explicit 0 are the same simulation, so the same key.
    expect(withTier({ wins: 0, gems: 10, packs: 1, playInPoints: 0, playBoxes: 0 })).toBe(bare);
    // A real value is a different simulation.
    expect(withTier({ wins: 0, gems: 10, packs: 1, playInPoints: 1 })).not.toBe(bare);
    expect(withTier({ wins: 0, gems: 10, packs: 1, playBoxes: 1 })).not.toBe(bare);
    expect(withTier({ wins: 0, gems: 10, packs: 1, collectorBoxes: 1 })).not.toBe(bare);
  });

  it("moves with the request's own numbers, and never across kinds", () => {
    expect(requestKey({ ...simRequest(), trials: 1001 })).not.toBe(requestKey(simRequest()));
    expect(requestKey({ ...simRequest(), seed: 2 })).not.toBe(requestKey(simRequest()));
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
    expect(requestKey(simRequest())).not.toBe(requestKey(bankRequest()));
  });
});
