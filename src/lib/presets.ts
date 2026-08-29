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
import { CONSTRUCTED_EVENT } from "../data/presets/constructed-event";
import { CONTENDER_DRAFT } from "../data/presets/contender-draft";
import { PICK_TWO_DRAFT } from "../data/presets/pick-two-draft";
import { PREMIER_CUBE_DRAFT } from "../data/presets/premier-cube-draft";
import { PREMIER_DRAFT } from "../data/presets/premier-draft";
import { QUALIFIER_PLAY_IN_BO1 } from "../data/presets/qualifier-play-in-bo1";
import { QUALIFIER_PLAY_IN_BO3 } from "../data/presets/qualifier-play-in-bo3";
import { QUICK_DRAFT } from "../data/presets/quick-draft";
import { SEALED } from "../data/presets/sealed";
import { TRADITIONAL_CONSTRUCTED_EVENT } from "../data/presets/traditional-constructed-event";
import { TRADITIONAL_CUBE_DRAFT } from "../data/presets/traditional-cube-draft";
import { TRADITIONAL_DRAFT } from "../data/presets/traditional-draft";
import { TRADITIONAL_SEALED } from "../data/presets/traditional-sealed";
import { GEMS_PER_USD } from "./boxes";
import { FALLBACK_BOX_PRICES } from "./boxPrices";
import { copyTier } from "./structure";
import type { EventConfig, EventPreset } from "./types";

export {
  ARENA_DIRECT,
  ARENA_DIRECT_COLLECTOR,
  ARENA_DIRECT_PLAY,
  CONSTRUCTED_EVENT,
  CONTENDER_DRAFT,
  PICK_TWO_DRAFT,
  PREMIER_CUBE_DRAFT,
  PREMIER_DRAFT,
  QUALIFIER_PLAY_IN_BO1,
  QUALIFIER_PLAY_IN_BO3,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_CONSTRUCTED_EVENT,
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
  // The Arena Directs sit together: same entry and same structure, differing
  // only in pool and prize. The cube is the phantom one, so it is named for
  // its pool; the other two are both sealed, so they are named for what the
  // top of the ladder pays.
  ARENA_DIRECT,
  ARENA_DIRECT_PLAY,
  ARENA_DIRECT_COLLECTOR,
  // The two constructed events, because they are the only entries that are
  // not limited at all — you bring a deck rather than build one, so there is
  // no pool to keep and `draftPacks` is 0. They are here because they are
  // what the same gems buy instead, which is the comparison someone deciding
  // what to queue is making.
  CONSTRUCTED_EVENT,
  TRADITIONAL_CONSTRUCTED_EVENT,
  // Then the Play-Ins, for the same reason the Directs sit together: they
  // share an entry and differ only in structure. They are the odd ones out
  // twice over — the only events that take play-in points, and the only ones
  // whose real prize is a tournament seat rather than anything model can price.
  QUALIFIER_PLAY_IN_BO1,
  QUALIFIER_PLAY_IN_BO3,
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
 * Default gem value of one mythic pack.
 *
 * A mythic pack is an ordinary booster in every slot but one: "Each Mythic
 * Booster always has a Mythic Rare in the Rare slot, unless it's replaced with
 * a Rare Wildcard." So the whole difference from DEFAULT_PACK_VALUE_GEMS is
 * that the rare/mythic slot stops being a 6:1 mix and becomes a certainty.
 *
 * On a complete collection that slot converts to 40 gems rather than the 22.9
 * a regular booster's does. It is displaced by a wildcard at the same rate as
 * any other pack's — roughly 1:30 rare and 1:30 mythic, so ~6.7% — which
 * leaves
 *
 *     40 × (1 − 2/30) ≈ 37.3 gems
 *
 * and 37 is that rounded. The regular pack figure is rounded the other way,
 * 21.3 up to 22, because the mythic upgrade rate moves set to set and the raw
 * slot spans 22.1 to 23.5 across the rates Arena has shipped. There is no such
 * band here: a mythic pack pays a mythic whatever the set's upgrade rate is,
 * so the only adjustment left is the wildcard one and it is taken in full.
 *
 * Everything DEFAULT_PACK_VALUE_GEMS excludes is excluded here for the same
 * reasons — vault progress from the commons and uncommons, which are identical
 * in both packs, and bonus sheets. The displaced wildcard is valued at nothing,
 * which is the same convention and, if anything, understates a mythic pack: a
 * wildcard from this slot is worth rather more than the 40 gems it costs you.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DEFAULT_MYTHIC_PACK_VALUE_GEMS = Math.round(40 * (1 - 2 / 30));

/**
 * Default gem value of one Cube Prize Pack — what the cube drafts pay instead
 * of ordinary packs.
 *
 * The one pack here whose contents Wizards publishes in full, so this is
 * summed slot by slot off the drop-rates page rather than reasoned from a
 * single rate. A Cube Prize Pack holds nine cards:
 *
 *     1 Timeless rare or mythic       mythic ~1:6.5
 *     1 Cube bonus sheet rare/mythic  mythic ~1:5
 *     1 flex card                     Timeless rare 20%, uncommon 30%,
 *                                     a bonus sheet card 50%
 *     2 uncommons
 *     4 commons
 *
 * Priced on the same footing as DEFAULT_PACK_VALUE_GEMS — a complete
 * collection, where a duplicate rare converts to 20 gems and a mythic to 40,
 * and the commons and uncommons are worth nothing because all they feed is
 * vault progress. Three slots pay, and the first two are the bulk of it:
 *
 *     (5.5/6.5 × 20) + (1/6.5 × 40) = 150/6.5 ≈ 23.1   Timeless slot
 *     (4/5   × 20) + (1/5   × 40) =              24     bonus sheet slot
 *      0.2 × 20                    =               4     flex, rare part only
 *
 * for ≈ 51. Two known omissions, and they pull opposite ways, which is why
 * the figure is left where the arithmetic puts it rather than nudged:
 *
 *  - **The flex slot's bonus-sheet half is counted as nothing.** Half of that
 *    slot is "a card from the bonus sheet", every card equally likely, and the
 *    sheet's rarity mix is not published. Guessing it would be inventing a
 *    number; leaving it at zero makes 51 a floor.
 *  - **No wildcard displacement is deducted.** An ordinary pack loses its rare
 *    slot to a wildcard about 1:30 of the time, which is what takes
 *    DEFAULT_PACK_VALUE_GEMS from 22.9 down toward 21.3. Whether these packs
 *    feed the wildcard tracks at all is not published, so nothing is taken off
 *    — which overstates by a little where the bullet above understates.
 *
 * Worth checking against Wizards' own claim for these, that they carry "over
 * twice the value of a normal Store pack": 51 against 22 is 2.3×, arrived at
 * from the contents alone and agreeing with a sentence that had no part in
 * the sum.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DEFAULT_CUBE_PACK_VALUE_GEMS = Math.round(150 / 6.5 + 24 + 0.2 * 20);

/**
 * Default gem value of one play-in point.
 *
 * Priced off what the points are for: 20 of them buy a Qualifier Play-In, which
 * otherwise costs 4,000 gems. Derived from the preset rather than written out,
 * so it follows the ladder data if that entry ever moves — the same arrangement
 * DEFAULT_DRAFT_TOKEN_VALUE_GEMS has with Premier Draft.
 *
 * Unlike the pack figure this is not derived from Wizards' published drop
 * rates; it comes from the Play-In's advertised entry price.
 *
 * That is a replacement-cost figure, not a market one, and it takes the larger
 * of the two available readings. It holds only if you would have entered a
 * Play-In anyway; points you never spend are worth nothing, and points beyond a
 * multiple of 20 are stranded until you collect enough to redeem. It also
 * prices the seat at the *gem* door — the gold door is 20,000, which at
 * GEMS_PER_10K_GOLD is 3,000 gems-equivalent, so someone who would have paid
 * gold saves 150 a point rather than 200. Set the field to 0 to ignore them.
 */
export const DEFAULT_PLAY_IN_POINT_VALUE_GEMS =
  QUALIFIER_PLAY_IN_BO1.entryCostGems / QUALIFIER_PLAY_IN_BO1.entryCostPlayInPoints;

/**
 * Default gem value of one Qualifier Weekend token.
 *
 * Zero, and for the same reason DEFAULT_COSMETIC_VALUE_GEMS is: there is
 * nothing to derive a price from. A token is not sold, not bought, and converts
 * to nothing Arena will pay out. It is a seat at a tournament, and what a seat
 * is worth depends on what you would do with it.
 *
 * Zero is the default, not a claim. The token is still *counted* — it shows in
 * the breakdown and drives the "Chance of a qualifier token" tile — so what is
 * being ignored stays on screen, and anyone who wants it priced has the
 * arithmetic here to do it with.
 *
 * What a seat returns, if you want a figure: Qualifier Weekend Day One is seven
 * wins or three losses, paying 500 / 1,000 / 2,000 / 3,000 / 5,000 / 7,500 /
 * 10,000 / 12,000 gems at 0..7 wins. Weighted by the exact distribution at a
 * 55% match rate that is ≈4,830 gems, and it moves a long way with the rate.
 * Excluded from that figure: the Day Two token a 7-0 also pays, which leads to
 * an Arena Championship invite — the one prize in this repo that genuinely has
 * no gem value, rather than merely lacking a published one.
 *
 * One caveat on setting it. Tokens value linearly like every holding, and a
 * second token is redundant — Wizards says so outright. A long bankroll run
 * that won two is counted as twice one.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/qualifier-play-ins-and-qualifier-weekend-information
 */
export const DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS = 0;

/**
 * Gems 10,000 gold is worth — the rate the gold an event is credited converts
 * at in the per-event gross, and the rate a leftover balance is priced at on
 * the Bankroll tab.
 *
 * Nearly every event that prices both ways uses the same ratio — Premier
 * 10,000 gold against 1,500 gems, Quick 5,000 against 750, Pick Two 6,000
 * against 900, Contender 20,000 against 3,000, Constructed 2,500 against 375 —
 * all exactly 1,500 per 10,000. Arena sets the rate by what it charges, so this
 * is read off rather than invented, and at this rate the gold credited to a
 * Premier entry is worth exactly the share of the gem price it would have
 * paid.
 *
 * The Qualifier Play-Ins are the one exception: 20,000 gold against 4,000 gems
 * implies 2,000 per 10,000, so gold buys more entry there than it does
 * anywhere else — 20,000 gold is 3,000 gems' worth at the rate below, against
 * a 4,000-gem price, which makes gold the cheaper door by a quarter. The
 * figure stays at what every other event charges — one competitive entry does
 * not reprice a rate the whole draft queue agrees on — but it is no longer
 * universal, and a reader pricing a Play-In in gold should know the model
 * values the gold it credits them, and any balance they hold, at less than
 * Arena lets it buy there. The test that holds every preset to this ratio
 * names that exemption, so a *new* event breaking it stays loud.
 *
 * It only holds while you have something to spend gold on. Gold you never use
 * is worth nothing, and it cannot be bought or sold, so this overstates a
 * balance you are sitting on; a rate of 0 is the honest price for that case,
 * and the model reads 0 as exactly that — everywhere, so an event's gold
 * credit goes to nothing along with the balance.
 */
export const GEMS_PER_10K_GOLD = 1500;

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
 * A win here is a *game*, not a match: each game taken inside a best-of-three
 * counts on its own, so a 2–1 match climbs two rungs. Wizards' page publishes
 * the amounts without spelling out what counts; the per-game counting is the
 * community-documented behaviour (MTG Arena Zone's daily-wins guide, Draftsim's
 * daily-rewards page), and it is why `goldPerEvent` climbs this ladder by the
 * day's game wins rather than its match wins.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DAILY_WIN_GOLD: readonly number[] = [
  250, 100, 100, 100, 0, 50, 0, 50, 0, 50, 0, 25, 0, 25, 0,
];

/** Wins after which the daily ladder pays nothing more. */
export const DAILY_WIN_CAP = DAILY_WIN_GOLD.length;

/**
 * Individual card rewards paid at each daily win, alongside the gold.
 *
 * The same table on Wizards' drop-rates page that DAILY_WIN_GOLD comes from
 * has a second column, and until now the model read only the first — so a
 * day's play was credited its gold and none of the cards. Six ICRs across the
 * fifteen wins, one at each win the gold column pays nothing for: the fifth,
 * seventh, ninth, eleventh, thirteenth and fifteenth. The two columns
 * interleave rather than overlap, which is why the gold ladder has zeroes in
 * it at all.
 *
 * **Corroborated, not read.** The page is unreachable from this network
 * (HTTP 403), so the positions were first inferred here from the gold
 * column's zeroes — a reward table does not print rows that pay nothing — and
 * then checked against two community sources, which agree: MTG Arena Zone's
 * ICR page puts the cards on "the 5th, 7th, 9th, 11th, 13th and 15th daily
 * win", and Draftsim's daily-rewards page says ten wins pays three ICRs and
 * 150 gold, which is only true if the cards sit at 5, 7 and 9 and the fifty-
 * gold rungs at 6, 8 and 10. Both agree on six cards at fifteen wins.
 *
 * That is two transcriptions of one page rather than the page, which is why
 * this comment says so. `npm run refresh:constants -- DAILY_WIN_ICR
 * --verbose` prints the real column from any network that can reach Wizards,
 * and the parser reads it off the same table as the gold in one pass.
 *
 * @see https://mtgazone.com/individual-card-rewards-icrs/
 * @see https://draftsim.com/mtg-arena-daily-rewards/
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DAILY_WIN_ICR: readonly number[] = [
  0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
];

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
 * Worth knowing what it costs, because it is not neutral between events: a
 * flat daily credit covers a larger share of a cheaper entry than of a dearer
 * one, and the gold prices here run from 5,000 to 20,000. So this field is an
 * input every comparison rests on rather than a constant beside them. Set it
 * to 0 for the attribution reading.
 *
 * The quest figure is not on Wizards' drop-rates page, unlike DAILY_WIN_GOLD,
 * and it varies with which quest you draw — it is the softer number of the two.
 */
export const DEFAULT_OTHER_GOLD_PER_DAY = 600;

/**
 * Games played per day.
 *
 * The day is counted in games rather than events because games are what take
 * the time: one runs about ten minutes, so twelve is roughly two hours of
 * play — about two Premier Drafts' worth at the default win rate, which is
 * what the two-events-a-day default this replaces said (set 2026-08-19).
 * Decides how far the day's wins climb DAILY_WIN_GOLD before it caps, and
 * how many events split the day's other gold; `goldPerEvent` turns games
 * into events at the event's own length, so a best-of-three event fills the
 * same day with fewer entries than a best-of-one. Twelve games at a 55% win
 * rate is about 6.6 wins and the full 600 the ladder pays by then; playing
 * on past twenty-seven reaches the fifteen-win cap and its 750. Set 0 to
 * price an event in gems alone.
 *
 * A modelling choice, not a sourced figure — nothing on Wizards' pages says
 * how much anyone plays. Changing it moves the meaning of every link that
 * omits `gamesPerDay`, which is what `share.compat.test.ts` fires for.
 */
export const DEFAULT_GAMES_PER_DAY = 12;

/**
 * Games a best-of-three match is counted as.
 *
 * A match ends 2–0 in two games or goes the distance in three, so the count
 * sits between 2 and 3, and 2.5 is the midpoint. It is also where the
 * arithmetic lands for close rates: independent games at rate g run a match
 * to 2 + 2g(1 − g) games, which is 2.5 at an even rate and 2.49 at 55%.
 * Sideboarding breaks the independence, which is why the convention is a
 * typed constant rather than something derived per rate — the same refusal
 * `matchWinRate` records for the rate itself.
 *
 * Read once, in `configFromPreset`, to fill `gamesPerMatch` for the presets
 * that declare `bestOf: 3`; a custom event edits the field directly.
 */
export const BO3_GAMES_PER_MATCH = 2.5;

/**
 * TCGplayer market prices in USD (read via tcgcsv.com) of the three newest
 * released, Standard-legal sets as of 2026-08-17, newest first:
 *
 *     The Hobbit             play $193.29   collector $822.77
 *     Marvel Super Heroes    play $117.22   collector $474.56
 *     Secrets of Strixhaven  play $137.48   collector $504.41
 *
 * These set the two *generic* box values below — what a box is worth when a
 * payout names no set, which only a custom ladder does, and what a named set
 * falls back to when the price table cannot price it. Every preset box names
 * a set or `latest` and is priced from the table, so these are constants in
 * the plain sense: typed here, never recomputed by the app, and moved only
 * by a person editing this file or by the reader in Advanced settings.
 *
 * The rule they follow: market price (derived from actual sales; the listing
 * spread runs 15–25% higher and is a hope rather than a price), released sets
 * only (presale boxes trade at hype prices that settle after release),
 * Standard-legal expansions only, the newest three, with anything priced past
 * twice the median of the newest eight set aside — the rule that kept Final
 * Fantasy's $1,700 collector box out. It is written down in
 * `scripts/constants/derive.ts` (`genericBoxValues`), so refreshing these is
 * the same motion as any other constant:
 *
 *     npm run refresh:constants -- DEFAULT_PLAY_BOX_VALUE_GEMS DEFAULT_COLLECTOR_BOX_VALUE_GEMS --verbose
 *
 * prints today's two values, the sets behind them, and the two arrays below
 * ready to paste. Whether to paste them is the usual judgement. The per-set
 * price table is *not* refreshed this way — the app ships a copy of the feed
 * for that, and CI refreshes it on every build; see `boxPrices.ts`.
 *
 * @see https://tcgcsv.com — a public JSON mirror of TCGplayer's API
 */
const PLAY_BOX_USD = [193.29, 117.22, 137.48];
const COLLECTOR_BOX_USD = [822.77, 474.56, 504.41];

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Gem value of a generic Play Booster box, converted at GEMS_PER_USD.
 *
 * Street price rather than sticker. Wizards' own figure is higher — the Arena
 * Direct terms offer "a $209.70 cash prize per Play Booster box" if physical
 * supplies run out — but that cash is taxed (the terms mention 30% withholding
 * in most cases), and what a box is worth to you is what you could get for it.
 */
export const DEFAULT_PLAY_BOX_VALUE_GEMS = Math.round(mean(PLAY_BOX_USD) * GEMS_PER_USD);

/**
 * Gem value of a generic Collector Booster box, same basis.
 *
 * These run far above MSRP — a 12-pack display lists at 12 × $39.99 = $479.88
 * — because the price tracks the singles inside. It is also the most volatile
 * number here: the feed has carried collector boxes from $328 to $1,682. A
 * payout that names its set is priced from the live table and never sees
 * this; it is what a custom ladder's unnamed box is worth, and a round
 * figure a few months old is fine for that.
 */
export const DEFAULT_COLLECTOR_BOX_VALUE_GEMS = Math.round(
  mean(COLLECTOR_BOX_USD) * GEMS_PER_USD,
);

/**
 * Default share of a box's price lost in actually selling it.
 *
 * The two constants above and the live feed's per-set figures are market
 * prices — what a box trades at — and nobody selling one pockets the trading
 * price: a buylist pays below market outright, and a marketplace sale gives
 * up commission, payment fees and shipping. This is that haircut, applied to
 * *every* box the model prices — named set and generic alike, in
 * `boxValueGems`. Set the field to 0 to count boxes at their full market
 * figure.
 *
 * Estimated once, on 2026-08-28, by pricing the same twenty boxes — seven
 * Play, thirteen Collector, the sets both sides carried — three ways against
 * this repo's feed of TCGplayer market prices (copy of 2026-08-17):
 *
 *  - **Card Kingdom's buylist, in cash**: a median 23% under market
 *    (5%–36%). The floor, since it is selling today — and the newest sets,
 *    which are the boxes Arena Direct actually pays, were not on the buylist
 *    at any price.
 *  - **Card Kingdom's buylist, in store credit**: exactly cash × 1.3, a
 *    median 0% under market and on some boxes above it. Rejected as the
 *    default: credit spends only at Card Kingdom, whose retail runs above
 *    TCGplayer market, so credit at or over market measures their margin
 *    rather than the box — the same face-value trap
 *    DEFAULT_PLAY_IN_POINT_VALUE_GEMS documents for points.
 *  - **Selling it yourself on TCGplayer**: 10.75% marketplace commission
 *    (capped at $75 an order since 2026-02-10, which is why the dearest
 *    Collector boxes fee out under 10%) plus 2.5% + $0.30 processing plus
 *    roughly $12 of shipping — a median 16% under market (8%–22%), assuming
 *    a patient sale at the market price.
 *
 * 15% is the marketplace reading rounded down a point (chosen 2026-08-28): a
 * prize box arrives unbidden and there is no hurry to move it, so the
 * patient route is the natural default, and the cash buylist is then the
 * price of impatience rather than the value of the box. `npm run
 * refresh:constants -- DEFAULT_BOX_MARKDOWN --verbose` prints the same
 * derivation.
 *
 * @see https://www.cardkingdom.com/purchasing/mtg_sealed
 * @see https://seller.tcgplayer.com/blog/important-changes-to-tcgplayer-direct-minimum-pricing-and-marketplace-fees
 */
export const DEFAULT_BOX_MARKDOWN = 0.15;

/**
 * Default gem value of one Player Draft token.
 *
 * Wizards describes it as "redeemable for a Premier or Traditional Draft entry",
 * and both of those cost 1,500 gems — so the token is priced at the entry it
 * replaces, and derived from the preset rather than written out, so it follows
 * the ladder data if that entry ever moves.
 *
 * Replacement cost, on the same footing as DEFAULT_PLAY_IN_POINT_VALUE_GEMS and
 * with the same caveat: it holds only for someone who would have paid 1,500 for
 * a draft anyway. A player who would not is better served by what the entry
 * *returns*, which at most win rates is the smaller figure — draft is EV-negative
 * below break-even, and a free entry into a losing proposition is not worth its
 * sticker. This takes the larger, simpler reading, and it is the reason nothing
 * on the Mastery tab moves with the win rate.
 */
export const DEFAULT_DRAFT_TOKEN_VALUE_GEMS = PREMIER_DRAFT.entryCostGems;

/**
 * Default gem value of one mythic rare individual card reward.
 *
 * The published duplicate-protection figure, unmodified: on a complete
 * collection a mythic you already hold four of converts to 40 gems.
 *
 * Flat 40 where DEFAULT_PACK_VALUE_GEMS is 22, and the gap is not an
 * inconsistency. A booster's rare slot is sometimes a wildcard instead, which
 * costs it the gems; an ICR is a card award with no slot to lose, so nothing
 * displaces it.
 *
 * A floor rather than a fair value — a mythic you actually want to play is worth
 * more than its buyout, and this model has no way to know which those are.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DEFAULT_MYTHIC_ICR_VALUE_GEMS = 40;

/** Default gem value of one rare card award. The published rare buyout. */
export const DEFAULT_RARE_CARD_VALUE_GEMS = 20;

/**
 * Default gem value of one uncommon individual card reward — the reward every
 * mastery level past the cap repeats.
 *
 * Almost nothing, and deliberately so. An uncommon has no duplicate-protection
 * gem value at all; it feeds vault progress, which DEFAULT_PACK_VALUE_GEMS
 * already excludes on purpose. All that is left is the 5% chance it upgrades to
 * a rare, and an upgraded card is worth the rare/mythic mix at the usual ~1:8:
 *
 *     0.05 × ((7/8 × 20) + (1/8 × 40)) = 0.05 × 22.5 = 1.125 gems
 *
 * Left unrounded, against the `Math.round(160/7)` precedent. Rounding 22.9 to 23
 * is a 0.4% error; rounding 1.125 to 1 is 11%, and unlike the pack figure this
 * is never a number anyone types into a field.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DEFAULT_UNCOMMON_ICR_VALUE_GEMS = 0.05 * ((7 / 8) * 20 + (1 / 8) * 40);

/**
 * Default gem value of one individual card reward from the daily-win ladder.
 *
 * Zero, and a modelling choice rather than a missing figure. Every gem value
 * in this file converts through duplicate protection: a card is worth 20 or
 * 40 gems only once you already hold four of it. That is a fair assumption
 * for a draft's rewards, which come from the set you are drafting and which
 * DEFAULT_PACK_VALUE_GEMS prices on "a complete collection of the set". It is
 * not a fair one here. These cards are drawn from any Standard-legal set, so
 * the collection that would have to be complete is the whole of Standard, and
 * what you almost always get is a card rather than gems.
 *
 * Pricing that properly would mean a per-set completion term — how much of
 * each Standard set the reader holds — which is a input nobody has and a
 * shape the rest of the model does not carry. So the cards are counted and
 * valued at nothing, and the model stays the size it is. The counting is the
 * part that matters: DAILY_WIN_ICR is which wins pay them, they appear in the
 * breakdown and a bankroll run holds them, so what is being left out is on
 * screen rather than hidden in an assumption.
 *
 * What the field would take, for anyone whose Standard collection *is*
 * complete. The daily wins pay an uncommon ICR that upgrades to a rare about
 * 1:10, and an upgraded card is a rare that is itself a mythic about 1:8 —
 * the page's "Standard ICRs that upgrade from Rare to Mythic Rare are
 * approximately at a rate of 1:8", which `scripts/constants/` parses. So
 *
 *     0.1 × ((7/8 × 20) + (1/8 × 40)) = 0.1 × 22.5 = 2.25 gems
 *
 * and that is a ceiling on this reward rather than the floor it first looks
 * like: it already assumes every upgraded rare converts. The 1:10 behind it
 * is corroborated but unread — `DAILY_WIN_ICR_UPGRADE` in
 * `scripts/constants/by-hand.ts` carries the sources and the trap that
 * catches people checking it.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const DEFAULT_DAILY_WIN_ICR_VALUE_GEMS = 0;

/**
 * Default gem value of a Mastery Orb, and of the cosmetics it buys.
 *
 * Zero, for want of anything to derive a figure from. Orbs redeem in the Mastery
 * Emporium for card styles, sleeves and avatars — one orb a style, two an avatar
 * — and none of those has a gem price, a duplicate-protection value or any other
 * conversion Arena will perform. There is no number here to be wrong about, and
 * inventing one would be the thing this repo has spent its whole design refusing
 * to do; the settled "fun is inert" decision is the same call.
 *
 * Zero is the default, not a claim. Each cosmetic gets its own field so anyone
 * who values a sleeve can say so without also repricing orbs, and the Mastery
 * tab counts them all whatever they are priced at, so what is being ignored
 * stays on screen.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/the-hobbit-mastery-details
 */
export const DEFAULT_COSMETIC_VALUE_GEMS = 0;

/**
 * An amount as the model holds an entry price: what it charges, or `null` for
 * a currency it does not take at all.
 *
 * Absent, zero and anything below it all come out `null` — a price of nothing
 * is not a price, and `EventConfig` has the reasoning. This is here rather
 * than inside any one caller because every way into the model has to agree
 * about it: a preset's optional field, a number out of a link, a field
 * cleared in the editor.
 */
export const entryPrice = (amount: number | null | undefined): number | null =>
  amount != null && amount > 0 ? amount : null;

/** Config built from a preset, leaving win rate and pack value untouched. */
export function configFromPreset(preset: EventPreset, base: EventConfig): EventConfig {
  return {
    ...base,
    entryCostGems: entryPrice(preset.entryCostGems),
    entryCostGold: entryPrice(preset.entryCostGold),
    entryCostPlayInPoints: entryPrice(preset.entryCostPlayInPoints),
    draftPacks: preset.draftPacks ?? 0,
    structure: { ...preset.structure },
    gamesPerMatch: preset.bestOf === 3 ? BO3_GAMES_PER_MATCH : 1,
    payouts: preset.payouts.map(copyTier),
  };
}

export function defaultConfig(): EventConfig {
  return configFromPreset(PREMIER_DRAFT, {
    winRate: 0.55,
    winRateMatches: DEFAULT_WIN_RATE_MATCHES,
    packValueGems: DEFAULT_PACK_VALUE_GEMS,
    mythicPackValueGems: DEFAULT_MYTHIC_PACK_VALUE_GEMS,
    cubePackValueGems: DEFAULT_CUBE_PACK_VALUE_GEMS,
    playInPointValueGems: DEFAULT_PLAY_IN_POINT_VALUE_GEMS,
    qualifierTokenValueGems: DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS,
    otherGoldPerDay: DEFAULT_OTHER_GOLD_PER_DAY,
    gamesPerDay: DEFAULT_GAMES_PER_DAY,
    // Overwritten by `configFromPreset` from the preset's `bestOf`.
    gamesPerMatch: 1,
    gemsPer10kGold: GEMS_PER_10K_GOLD,
    draftPackValueGems: DEFAULT_DRAFT_PACK_VALUE_GEMS,
    playBoxValueGems: DEFAULT_PLAY_BOX_VALUE_GEMS,
    collectorBoxValueGems: DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
    boxMarkdown: DEFAULT_BOX_MARKDOWN,
    // Replaced when the live feed lands. Until then the boxes are named and
    // priced from the feed the app shipped with, which is the same answer,
    // older.
    boxPrices: FALLBACK_BOX_PRICES,
    draftTokenValueGems: DEFAULT_DRAFT_TOKEN_VALUE_GEMS,
    mythicIcrValueGems: DEFAULT_MYTHIC_ICR_VALUE_GEMS,
    rareCardValueGems: DEFAULT_RARE_CARD_VALUE_GEMS,
    uncommonIcrValueGems: DEFAULT_UNCOMMON_ICR_VALUE_GEMS,
    dailyWinIcrValueGems: DEFAULT_DAILY_WIN_ICR_VALUE_GEMS,
    orbValueGems: DEFAULT_COSMETIC_VALUE_GEMS,
    cardStyleValueGems: DEFAULT_COSMETIC_VALUE_GEMS,
    sleeveValueGems: DEFAULT_COSMETIC_VALUE_GEMS,
    avatarValueGems: DEFAULT_COSMETIC_VALUE_GEMS,
    companionValueGems: DEFAULT_COSMETIC_VALUE_GEMS,
  } as EventConfig);
}
