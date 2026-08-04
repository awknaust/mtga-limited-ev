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

import { CUBE_DRAFT } from "../data/presets/cube-draft";
import { PICK_TWO_DRAFT } from "../data/presets/pick-two-draft";
import { PREMIER_DRAFT } from "../data/presets/premier-draft";
import { QUICK_DRAFT } from "../data/presets/quick-draft";
import { SEALED } from "../data/presets/sealed";
import { TRADITIONAL_DRAFT } from "../data/presets/traditional-draft";
import { TRADITIONAL_SEALED } from "../data/presets/traditional-sealed";
import type { EventConfig, EventPreset, EventStructure } from "./types";

export {
  CUBE_DRAFT,
  PICK_TWO_DRAFT,
  PREMIER_DRAFT,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_DRAFT,
  TRADITIONAL_SEALED,
};

export const PRESETS: EventPreset[] = [
  PREMIER_DRAFT,
  QUICK_DRAFT,
  CUBE_DRAFT,
  TRADITIONAL_DRAFT,
  PICK_TWO_DRAFT,
  SEALED,
  TRADITIONAL_SEALED,
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

function sameStructure(a: EventStructure, b: EventStructure): boolean {
  if (a.kind === "rounds" && b.kind === "rounds") return a.rounds === b.rounds;
  if (a.kind === "elimination" && b.kind === "elimination") {
    return a.maxWins === b.maxWins && a.maxLosses === b.maxLosses;
  }
  return false;
}

/**
 * Whether a config still matches a preset's entry cost, format, structure and
 * payout schedule.
 *
 * Premier and Cube are structurally identical, so this can't be used to *derive*
 * which preset is selected — only to check whether an edit has moved the config
 * off the one the user picked.
 */
export function matchesPreset(config: EventConfig, presetName: string): boolean {
  const p = PRESETS.find((x) => x.name === presetName);
  if (!p) return false;
  return (
    p.entryCostGems === config.entryCostGems &&
    p.format === config.format &&
    sameStructure(p.structure, config.structure) &&
    p.payouts.length === config.payouts.length &&
    p.payouts.every((t, i) => {
      const c = config.payouts[i];
      return c && c.wins === t.wins && c.gems === t.gems && c.packs === t.packs;
    })
  );
}

export function defaultConfig(): EventConfig {
  return configFromPreset(PREMIER_DRAFT, {
    winRate: 0.55,
    packValueGems: DEFAULT_PACK_VALUE_GEMS,
  } as EventConfig);
}
