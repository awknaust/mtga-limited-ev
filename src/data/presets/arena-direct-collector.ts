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
 * That makes it the steepest ladder here by some distance. Six wins is a real
 * prize you can bank, seven trades it for one object worth more than the rest
 * of the table combined, and the two losses that end the run are as likely to
 * arrive at six as anywhere else.
 *
 * The first preset to use `collectorBoxes`. The field, its column in the payout
 * editor and DEFAULT_COLLECTOR_BOX_VALUE_GEMS all existed before any event
 * exercised them.
 *
 * A caution on that default, because this preset makes it the largest single
 * number in the model. It is a street price, roughly $630 across three recent
 * sets, and Wizards' own substitution when supplies run out is $455.88 a box.
 * For Play boxes the two point the other way — street sits *below* Wizards'
 * $209.70 — so DEFAULT_PLAY_BOX_VALUE_GEMS is the conservative choice its doc
 * comment claims. Here the same rule gives the more generous figure, and it is
 * worth knowing which side of the cash alternative you are on before reading
 * anything off the seven-win row.
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
    { wins: 7, gems: 0, packs: 0, collectorBoxes: 1 },
  ],
} satisfies EventPreset;
