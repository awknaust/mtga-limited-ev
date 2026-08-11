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
import { ARENA_DIRECT_COLLECTOR } from "../data/presets/arena-direct-collector";
import { ARENA_DIRECT_PLAY } from "../data/presets/arena-direct-play";
import { CONTENDER_DRAFT } from "../data/presets/contender-draft";
import { PICK_TWO_DRAFT } from "../data/presets/pick-two-draft";
import { PREMIER_CUBE_DRAFT } from "../data/presets/premier-cube-draft";
import { PREMIER_DRAFT } from "../data/presets/premier-draft";
import { QUICK_DRAFT } from "../data/presets/quick-draft";
import { SEALED } from "../data/presets/sealed";
import { TRADITIONAL_CUBE_DRAFT } from "../data/presets/traditional-cube-draft";
import { TRADITIONAL_DRAFT } from "../data/presets/traditional-draft";
import { TRADITIONAL_SEALED } from "../data/presets/traditional-sealed";
import type { EventConfig, EventPreset } from "./types";

export {
  ARENA_DIRECT,
  ARENA_DIRECT_COLLECTOR,
  ARENA_DIRECT_PLAY,
  CONTENDER_DRAFT,
  PICK_TWO_DRAFT,
  PREMIER_CUBE_DRAFT,
  PREMIER_DRAFT,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_CUBE_DRAFT,
  TRADITIONAL_DRAFT,
  TRADITIONAL_SEALED,
};

export const PRESETS: EventPreset[] = [
  PREMIER_DRAFT,
  QUICK_DRAFT,
  PREMIER_CUBE_DRAFT,
  TRADITIONAL_DRAFT,
  TRADITIONAL_CUBE_DRAFT,
  PICK_TWO_DRAFT,
  SEALED,
  TRADITIONAL_SEALED,
  CONTENDER_DRAFT,
  // The Arena Directs sit together at the end: same entry and same structure,
  // differing only in pool and prize. The cube is the phantom one, so it is
  // named for its pool; the other two are both sealed, so they are named for
  // what the top of the ladder pays.
  ARENA_DIRECT,
  ARENA_DIRECT_PLAY,
  ARENA_DIRECT_COLLECTOR,
];

/**
 * Matches the default win rate is taken to rest on.
 *
 * A hundred, which is a season of fairly regular play and enough that the prior
 * has stopped doing much of the work. It still leaves a range wide enough to
 * straddle break-even on Premier Draft, which is the honest answer — a hundred
 * matches pins a win rate to within a few points, not to the decimal the slider
 * displays.
 *
 * Set the field to 0 to treat the rate as exact and report point estimates.
 */
export const DEFAULT_WIN_RATE_MATCHES = 100;

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
 * The best rate on the store's ladder, which is 20,000 gems for $99.99 — 200.02
 * a dollar. The whole ladder, largest first:
 *
 *     40,000  $199.99   200.01
 *     20,000   $99.99   200.02
 *      9,200   $49.99   184.04
 *      3,400   $19.99   170.09
 *      1,600    $9.99   160.16
 *        750    $4.99   150.30
 *
 * The best rate is *not* the largest bundle. The top two are the same price per
 * gem to within a rounding error, and the 40,000 is fractionally the worse of
 * them, so buying bigger stops paying at $99.99. Taking the best rate is what
 * makes this the most conservative way to value a physical prize in gems: it
 * assumes the cheapest gems you could have bought instead.
 *
 * The ladder is written out because this constant was wrong once, at 400 from a
 * misremembered $49.99, and nothing flagged it: a rate double every other
 * bundle's should not have survived a reading. Anyone changing it should check
 * the new figure sits at or above the neighbours and not far above.
 *
 * The ladder itself is only in the client, so `npm run refresh:constants`
 * cannot fetch it — the script prints these rungs from its own copy and asks
 * for a look at the store. That copy went stale unnoticed, carrying a 7,000 for
 * $39.99 bundle that had been replaced by the 9,200 and 1,600 tiers.
 */
export const GEMS_PER_USD = 200;

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
 * Gold paid at each daily win, first through fifteenth.
 *
 * 250 for the first, 100 for each of the next three, 50 at the sixth, eighth
 * and tenth, 25 at the twelfth and fourteenth. It sums to 750, and it stops:
 * a sixteenth win pays nothing.
 *
 * This ladder is why gold is not a flat daily figure. It front-loads hard —
 * the first win alone is a third of the day's total — so the gold a single
 * event generates is far closer to its own few wins than to the 750 a full day
 * of grinding pays.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DAILY_WIN_GOLD: readonly number[] = [
  250, 100, 100, 100, 0, 50, 0, 50, 0, 50, 0, 25, 0, 25, 0,
];

/** Wins after which the daily ladder pays nothing more. */
export const DAILY_WIN_CAP = DAILY_WIN_GOLD.length;

/**
 * Default gold earned per day from everything other than the event's wins.
 *
 * A daily quest, which pays roughly 600 gold and is not hard to clear.
 *
 * This makes the field a *budget* rather than an attribution: what a day of
 * playing puts toward entries, whoever earned it. The stricter reading — only
 * gold the entry itself caused — would put this at 0, because a quest can be
 * cleared in a free format and pays whether or not you draft. That reading
 * answers "what did this entry return"; this one answers "how far does a day
 * of playing get me", which is the question someone deciding what to queue is
 * actually asking.
 *
 * Worth knowing what it costs, because it is not neutral between events. At
 * 10,000 gold for Premier against 5,000 for Quick, a flat daily credit covers
 * twice as much of the cheaper event, so raising it moves Quick's break-even
 * further than Premier's and shifts where the two cross. Set it to 0 for the
 * attribution reading.
 *
 * The quest figure is not on Wizards' drop-rates page, unlike DAILY_WIN_GOLD,
 * and it varies with which quest you draw — it is the softer number of the two.
 */
export const DEFAULT_OTHER_GOLD_PER_DAY = 600;

/**
 * Events played per day.
 *
 * Decides how far a day's wins climb DAILY_WIN_GOLD before it caps. One event
 * a day at a 55% win rate is about 3.4 wins and 489 gold; five events reach
 * the fifteen-win cap and split 750 between them, so each earns less than the
 * first did. Set 0 to price an event in gems alone.
 */
export const DEFAULT_EVENTS_PER_DAY = 1;

/**
 * TCGplayer market prices in USD (read via tcgcsv.com), averaged over the
 * three newest released, Standard-legal sets as of 2026-08-10.
 *
 * These are the *fallback* behind the two box constants below. On the
 * production origin the app fetches `/api/box-prices` — a Worker-published
 * feed of the newest twenty draftable paper sets (see `worker/`) — and
 * derives the same average from live prices in `src/lib/boxPrices.ts`; these
 * figures only govern when that feed is unreachable: preview deployments,
 * dev without the proxy, or an outage. Refresh the snapshot with
 * `npm run refresh:constants`.
 *
 * The three sets used:
 *
 *     Marvel Super Heroes    play $116.26   collector $440.45
 *     Secrets of Strixhaven  play $135.34   collector $494.36
 *     TMNT                   play $112.72   collector $440.56
 *
 * Market price is derived from actual sales on TCGplayer — the same
 * marketplace Scryfall's USD card prices come from — and runs 15–25% under
 * the listing-style figures these constants once carried; the change of
 * basis was deliberate. Only released sets are used, since a presale has no
 * sales to derive a market price from. Final Fantasy is excluded as an
 * outlier by the twice-the-pool-median rule: $1,728 a collector box at
 * market against a median near $450.
 *
 * @see https://tcgcsv.com — a public JSON mirror of TCGplayer's API
 */
const PLAY_BOX_USD = [116.26, 135.34, 112.72];
const COLLECTOR_BOX_USD = [440.45, 494.36, 440.56];

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Fallback gem value of a physical Play Booster box, converted at
 * GEMS_PER_USD. Live prices normally replace it — see the note on
 * PLAY_BOX_USD above.
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
 * Fallback gem value of a physical Collector Booster box, same basis.
 *
 * These run far above MSRP — a 12-pack display lists at 12 × $39.99 = $479.88
 * — because the price tracks the singles inside. It is also the most volatile
 * number here — recent sets have ranged from under $400 to over $900 — which
 * is exactly why the live feed exists: this snapshot is the figure that goes
 * stale fastest.
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
    structure: { ...preset.structure },
    payouts: preset.payouts.map((t) => ({ ...t })),
  };
}

export function defaultConfig(): EventConfig {
  return configFromPreset(PREMIER_DRAFT, {
    winRate: 0.55,
    winRateMatches: DEFAULT_WIN_RATE_MATCHES,
    packValueGems: DEFAULT_PACK_VALUE_GEMS,
    playInPointValueGems: DEFAULT_PLAY_IN_POINT_VALUE_GEMS,
    otherGoldPerDay: DEFAULT_OTHER_GOLD_PER_DAY,
    eventsPerDay: DEFAULT_EVENTS_PER_DAY,
    goldPerGem: GOLD_PER_GEM,
    draftPackValueGems: DEFAULT_DRAFT_PACK_VALUE_GEMS,
    playBoxValueGems: DEFAULT_PLAY_BOX_VALUE_GEMS,
    collectorBoxValueGems: DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  } as EventConfig);
}
