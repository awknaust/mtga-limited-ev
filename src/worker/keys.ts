/**
 * Cache keys for simulation requests.
 *
 * An explicit field list rather than `JSON.stringify`: JSON depends on
 * property insertion order, which nothing guarantees across call sites, and
 * a cache key has to be identical for requests that mean the same thing.
 * The cost of the explicit list is that it can go stale — a field added to
 * `EventConfig` but not here would let two different configs share a key —
 * so keys.test.ts perturbs every field and fails on any that the key
 * ignores.
 */

import type { EventConfig, EventStructure, PayoutTier } from "../lib/types";
import type { SimulationRequest } from "./protocol";

const structureKey = (s: EventStructure): string =>
  s.kind === "rounds" ? `r:${s.rounds}` : `e:${s.maxWins}:${s.maxLosses}`;

// Absent optional fields collapse to 0, exactly as the model reads them —
// simulate.ts prices tiers via `?? 0` — so a tier with `playInPoints: 0` and
// one without the field mean the same simulation and share a key.
const tierKey = (t: PayoutTier): string =>
  [t.wins, t.gems, t.packs, t.playInPoints ?? 0, t.playBoxes ?? 0, t.collectorBoxes ?? 0].join(":");

// Every field of EventConfig (src/lib/types.ts), in declaration order.
const configKey = (c: EventConfig): string =>
  [
    c.winRateMatches,
    c.winRate,
    structureKey(c.structure),
    c.entryCostGems,
    c.entryCostGold,
    c.otherGoldPerDay,
    c.eventsPerDay,
    c.gemsPer10kGold,
    c.draftPacks,
    c.draftPackValueGems,
    c.packValueGems,
    c.playInPointValueGems,
    c.playBoxValueGems,
    c.collectorBoxValueGems,
    c.payouts.map(tierKey).join("|"),
  ].join(";");

/** The whole request as a key; the kind prefix keeps the two shapes apart. */
export function requestKey(req: SimulationRequest): string {
  return req.kind === "simulate"
    ? ["sim", req.trials, req.seed, configKey(req.config)].join(";")
    : [
        "bank",
        req.runs,
        req.seed,
        req.bankroll.startingGems,
        req.bankroll.startingGold,
        req.bankroll.maxEvents,
        configKey(req.config),
      ].join(";");
}
