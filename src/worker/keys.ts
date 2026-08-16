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
 *
 * Boxes carry the same idea one step further. A row's boxes are a list, and a
 * list has an order the model does not read: two play boxes swapped in the
 * editor pay exactly what they paid before. They are sorted here so that
 * rearranging them is free, and an absent list and an empty one agree.
 */

import stringify from "fast-json-stable-stringify";

import type { PayoutBox, PayoutTier } from "../lib/types";
import type { SimulationRequest } from "./protocol";

/** Sortable identity of a box: its kind, then the set it names. */
const boxId = (b: PayoutBox): string => `${b.kind}.${b.set ?? ""}`;

/** A tier with nothing optional left in it, ready to serialize. */
type NormalTier = Omit<Required<PayoutTier>, "boxes"> & { boxes: string[] };

const normalizeTier = (t: PayoutTier): NormalTier => ({
  wins: t.wins,
  gems: t.gems,
  packs: t.packs,
  playInPoints: t.playInPoints ?? 0,
  boxes: (t.boxes ?? []).map(boxId).sort(),
});

/** The whole request as one key; `kind` keeps the two shapes apart. */
export function requestKey(req: SimulationRequest): string {
  return stringify({
    ...req,
    config: { ...req.config, payouts: req.config.payouts.map(normalizeTier) },
  });
}
