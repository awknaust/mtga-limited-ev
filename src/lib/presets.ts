/**
 * Event presets and the helpers for applying them.
 *
 * Each event is a data-only module under `src/data/presets` — one exported
 * object, no logic, checked against `EventPreset` with `satisfies` so a wrong
 * field or a bad structure kind is a compile error rather than a runtime
 * surprise. This module only re-exports and operates on them. The shape
 * invariants that types can't express (a payout row per reachable win count,
 * contiguous from 0) are covered by tests.
 */

import { CONTENDER_DRAFT } from "../data/presets/contender-draft";
import { CUBE_DRAFT } from "../data/presets/cube-draft";
import { PICK_TWO_DRAFT } from "../data/presets/pick-two-draft";
import { PREMIER_DRAFT } from "../data/presets/premier-draft";
import { QUICK_DRAFT } from "../data/presets/quick-draft";
import { SEALED } from "../data/presets/sealed";
import { TRADITIONAL_DRAFT } from "../data/presets/traditional-draft";
import type { EventConfig, EventPreset } from "./types";

export {
  CONTENDER_DRAFT,
  CUBE_DRAFT,
  PICK_TWO_DRAFT,
  PREMIER_DRAFT,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_DRAFT,
};

export const PRESETS: EventPreset[] = [
  PREMIER_DRAFT,
  QUICK_DRAFT,
  CUBE_DRAFT,
  TRADITIONAL_DRAFT,
  PICK_TWO_DRAFT,
  SEALED,
  CONTENDER_DRAFT,
];

/** Selector value for a hand-edited schedule that matches no preset. */
export const CUSTOM_PRESET = "Custom";

/**
 * Default gem value of a booster pack — what one is worth, not the 200 gems it
 * costs.
 *
 * Assumes a complete collection of the set. Once you hold playsets of every
 * rare and mythic, the rare/mythic slot pays gems instead of a card: 20 for a
 * rare, 40 for a mythic. At the ~1:7 mythic upgrade rate common to recent sets,
 *
 *     (6/7 × 20) + (1/7 × 40) ≈ 22.9 gems per slot
 *
 * That slot is occasionally a wildcard rather than gems (roughly 1:30 rare and
 * 1:30 mythic, so ~6.7% of packs), which brings the expectation down to ≈21.3.
 * Across the mythic rates Arena has shipped the raw slot value stays in a tight
 * band — 22.1 at 1:9.4, 23.5 at 1:5.8 — so 22 is a fair round figure.
 *
 * Deliberately excluded: vault progress from commons and uncommons (~10 points
 * a pack, a full vault every ~100 packs), and bonus sheets, which add ~3.5 gems
 * a pack on the sets that have them and would push this nearer 25.
 *
 * Estimated from Arena's published drop rates rather than measured, and the
 * most subjective input in the model — a ±10 gem error moves expected net by
 * roughly 30 gems an event, though break-even win rates are far less sensitive
 * to it. Set the field to 0 to price events in gems alone.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DEFAULT_PACK_VALUE_GEMS = 22;

/**
 * Default gem value of one play-in point.
 *
 * Priced off what the points are for: 20 of them buy an Arena Open play-in,
 * which otherwise costs 4,000 gems — so 4000 / 20 = 200 gems a point.
 *
 * Unlike the pack figure this is not derived from Wizards' published drop
 * rates; it comes from the Open's advertised entry price.
 *
 * That is a replacement-cost figure, not a market one. It holds only if you
 * would have entered the Open anyway; points you never spend are worth
 * nothing, and points beyond a multiple of 20 are stranded until you collect
 * enough to redeem. Set the field to 0 to ignore them.
 */
export const DEFAULT_PLAY_IN_POINT_VALUE_GEMS = 200;

/** Config built from a preset, leaving win rate and pack value untouched. */
export function configFromPreset(preset: EventPreset, base: EventConfig): EventConfig {
  return {
    ...base,
    entryCostGems: preset.entryCostGems,
    format: preset.format,
    structure: { ...preset.structure },
    payouts: preset.payouts.map((t) => ({ ...t })),
  };
}

export function defaultConfig(): EventConfig {
  return configFromPreset(PREMIER_DRAFT, {
    winRate: 0.55,
    packValueGems: DEFAULT_PACK_VALUE_GEMS,
    playInPointValueGems: DEFAULT_PLAY_IN_POINT_VALUE_GEMS,
  } as EventConfig);
}
