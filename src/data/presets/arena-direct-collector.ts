import { LATEST_SET } from "../../lib/boxes";
import type { EventPreset } from "../../lib/types";

/**
 * Arena Direct (Collector): 8,000 gems, six-pack sealed, best-of-one, 7 wins or
 * 2 losses.
 *
 * Same pool, same entry and same structure as ARENA_DIRECT_PLAY — both are
 * sealed, and the prize is the whole difference, which is why the pair is named
 * for what it pays. The Play variant stops paying gems at five wins and hands
 * over a box at six; this one keeps paying — 14,400 gems and 32 packs at six —
 * and puts everything else on a single Collector Booster box at seven.
 *
 * The only preset paying a collector box, and so the only thing exercising
 * the collector side of the box pricing. Like the Play variant it names
 * `LATEST_SET` rather than a set: the event runs alongside a release and pays
 * that release's box.
 *
 * A caution on what that box is worth, because this preset makes it the
 * largest single number in the model. Priced from the feed it is that set's
 * own market price; a set the feed does not carry falls back to
 * DEFAULT_COLLECTOR_BOX_VALUE_GEMS, the street average of the three newest
 * released expansions — several hundred dollars, against Wizards' substitution
 * of $455.88 a box when supplies run out, and on which side of that figure it
 * sits depends on the sets of the day. For Play boxes street has sat *below*
 * Wizards' $209.70, so the play figure is the conservative choice its doc
 * comment claims and this one is the less certain. Either way it is worth
 * knowing which side of the cash alternative you are on before reading
 * anything off the seven-win row, and the spread between sets is wide: the
 * feed has had collector boxes from $328 to $1,728.
 *
 * Six and seven wins are quoted from the Marvel Super Heroes run of 30 June to
 * 5 July 2026, in the Arena Direct terms. Three to five wins are *inferred*
 * rather than quoted: the April 2025 update says the Collector variant matches
 * the Play one below six wins, and the pack counts recorded for that event —
 * 8, 16, 24 — agree with the Play ladder, so the gems are taken to agree too.
 * Confirm against a live event before treating those three rows as sourced.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/arena-direct-terms-and-conditions
 * @see https://magic.wizards.com/en/news/mtg-arena/updates-to-arena-direct-events-april-2025
 */
export const ARENA_DIRECT_COLLECTOR = {
  name: "Arena Direct (Collector)",
  group: "direct",
  bestOf: 1,
  entryCostGems: 8000,
  draftPacks: 6,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 0, packs: 0 },
    { wins: 1, gems: 0, packs: 0 },
    { wins: 2, gems: 0, packs: 0 },
    { wins: 3, gems: 3600, packs: 8 },
    { wins: 4, gems: 7200, packs: 16 },
    { wins: 5, gems: 10800, packs: 24 },
    { wins: 6, gems: 14400, packs: 32 },
    { wins: 7, gems: 0, packs: 0, boxes: [{ kind: "collector", set: LATEST_SET }] },
  ],
} satisfies EventPreset;
