/**
 * Cache keys for simulation requests: the request, canonically serialized.
 *
 * `fast-json-stable-stringify` sorts keys recursively, so structurally equal
 * requests share a key no matter what order their properties were assembled
 * in — the promise plain `JSON.stringify` cannot make, and the reason a
 * hand-ordered field list used to live here. Serializing the whole request
 * also makes a field added to `EventConfig` part of the key automatically,
 * which retires the staleness hazard that list had to be tested against.
 * JSON's `Infinity → null` trap is unreachable: no config field can be
 * non-finite since the gold rate became gems-per-10k.
 *
 * One semantic the serializer cannot know about: the model prices a payout
 * tier's optional fields through `?? 0`, so a tier without `playInPoints`
 * and one carrying an explicit 0 are the same simulation. Tiers are
 * normalized before serializing so the two share a key — the payout editor
 * writes explicit zeroes where presets omit the field, and without this the
 * same ladder would recompute once after every touch of the editor.
 */

import stringify from "fast-json-stable-stringify";

import type { PayoutTier } from "../lib/types";
import type { SimulationRequest } from "./protocol";

const normalizeTier = (t: PayoutTier): Required<PayoutTier> => ({
  wins: t.wins,
  gems: t.gems,
  packs: t.packs,
  playInPoints: t.playInPoints ?? 0,
  playBoxes: t.playBoxes ?? 0,
  collectorBoxes: t.collectorBoxes ?? 0,
});

/** The whole request as one key; `kind` keeps the two shapes apart. */
export function requestKey(req: SimulationRequest): string {
  return stringify({
    ...req,
    config: { ...req.config, payouts: req.config.payouts.map(normalizeTier) },
  });
}
