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

import { ARENA_DIRECT } from "../data/presets/arena-direct";
import { CONTENDER_DRAFT } from "../data/presets/contender-draft";
import { CUBE_DRAFT } from "../data/presets/cube-draft";
import { PICK_TWO_DRAFT } from "../data/presets/pick-two-draft";
import { PREMIER_DRAFT } from "../data/presets/premier-draft";
import { QUICK_DRAFT } from "../data/presets/quick-draft";
import { SEALED } from "../data/presets/sealed";
import { TRADITIONAL_DRAFT } from "../data/presets/traditional-draft";
import type { EventConfig, EventPreset } from "./types";

export {
  ARENA_DIRECT,
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
  ARENA_DIRECT,
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

/**
 * Gems per US dollar, for pricing physical prizes.
 *
 * From the largest gem bundle: 20,000 gems for $49.99, so 400 gems a dollar.
 * Smaller bundles are worse, which makes this the most generous conversion and
 * therefore the most conservative way to value a physical prize in gems.
 */
export const GEMS_PER_USD = 400;

/**
 * Gold per gem, for valuing a leftover gold balance.
 *
 * Every event that prices both ways uses the same ratio — Premier 10,000 gold
 * against 1,500 gems, Quick 5,000 against 750, Pick Two 6,000 against 900,
 * Contender 20,000 against 3,000 — all exactly 20/3. Arena sets the rate by
 * what it charges, so this is read off rather than invented.
 *
 * It only holds while you have something to spend gold on. Gold you never use
 * is worth nothing, and it cannot be bought or sold, so this overstates a
 * balance you are sitting on.
 */
export const GOLD_PER_GEM = 20 / 3;

/**
 * Default gem value of one pack's worth of drafted cards.
 *
 * The cards you keep are the largest reward most of these events pay, and
 * until now none of it was counted.
 *
 * Valued the same way as a booster's rare slot, since that is where nearly all
 * of it sits. Assuming a complete collection, a rare converts to 20 gems and a
 * mythic to 40, and the mythic upgrade runs about 1:7 on recent sets:
 *
 *     (6/7 × 20) + (1/7 × 40) = 160/7 ≈ 22.9 gems per pack
 *
 * Slightly *above* DEFAULT_PACK_VALUE_GEMS rather than equal to it: a booster
 * sometimes pays a wildcard in place of the rare, which costs it the gems,
 * whereas drafted cards have no such slot.
 *
 * Excludes the commons and uncommons, which only feed vault progress, and
 * assumes a complete set — without one you keep cards rather than gems, and
 * what they are worth to you is a different question this does not answer.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DEFAULT_DRAFT_PACK_VALUE_GEMS = Math.round(160 / 7);

/**
 * Default gold earned in the time it takes to play one event.
 *
 * A full day of daily wins pays exactly 750 gold — 250 for the first, 100 for
 * each of the next three, 50 at the sixth, eighth and tenth, 25 at the twelfth
 * and fourteenth — and a daily quest adds roughly 600 more. This credits all of
 * it to a single event, which fits drafting about once a day.
 *
 * Play more events in a day and the real figure per event is lower, since the
 * win rewards cap at fifteen and the quest does not repeat. The quest figure is
 * not on Wizards' drop-rates page and is the softer half of this number.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DEFAULT_GOLD_PER_EVENT = 1350;

/**
 * Street prices in USD from MTGGoldfish's sealed product list, averaged over
 * three released, Standard-legal sets:
 *
 *     Marvel Super Heroes   play $147   collector $599
 *     Edge of Eternities    play $187   collector $914
 *     Aetherdrift           play $130   collector $378
 *
 * Only released sets are used — the newest entries on that page are preorders,
 * whose prices are speculative. Final Fantasy is excluded as an outlier: at
 * $260 a play box and $2,399 a collector box it would roughly double the
 * collector average on its own.
 *
 * One caveat on the source: for older sets it prints two columns, EV and
 * Retail, while recent sets show a single figure. These are the single values.
 *
 * @see https://www.mtggoldfish.com/prices/paper/boosters
 */
const PLAY_BOX_USD = [147, 187, 130];
const COLLECTOR_BOX_USD = [599, 914, 378];

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Default gem value of a physical Play Booster box, converted at GEMS_PER_USD.
 *
 * Street price rather than sticker. Wizards' own figure is higher — the Arena
 * Direct terms offer "a $209.70 cash prize per Play Booster box" if physical
 * supplies run out — but that cash is taxed (the terms mention 30% withholding
 * in most cases), and what a box is worth to you is what you could get for it.
 */
export const DEFAULT_PLAY_BOX_VALUE_GEMS = Math.round(
  mean(PLAY_BOX_USD) * GEMS_PER_USD,
);

/**
 * Default gem value of a physical Collector Booster box, same basis.
 *
 * These run far above MSRP — a 12-pack display lists at 12 × $39.99 = $479.88
 * — because the price tracks the singles inside. It is also the most volatile
 * number here: recent sets have ranged from under $400 to over $900.
 */
export const DEFAULT_COLLECTOR_BOX_VALUE_GEMS = Math.round(
  mean(COLLECTOR_BOX_USD) * GEMS_PER_USD,
);

/** Config built from a preset, leaving win rate and pack value untouched. */
export function configFromPreset(preset: EventPreset, base: EventConfig): EventConfig {
  return {
    ...base,
    entryCostGems: preset.entryCostGems,
    entryCostGold: preset.entryCostGold ?? 0,
    draftPacks: preset.draftPacks ?? 0,
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
    goldPerEvent: DEFAULT_GOLD_PER_EVENT,
    goldPerGem: GOLD_PER_GEM,
    draftPackValueGems: DEFAULT_DRAFT_PACK_VALUE_GEMS,
    playBoxValueGems: DEFAULT_PLAY_BOX_VALUE_GEMS,
    collectorBoxValueGems: DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  } as EventConfig);
}
