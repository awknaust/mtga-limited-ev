import { LATEST_SET } from "../../lib/boxes";
import type { EventPreset } from "../../lib/types";

/**
 * Arena Direct (Play): 8,000 gems, six-pack sealed, best-of-one, 7 wins or 2
 * losses.
 *
 * Named for what it pays rather than what it is played from, because the pool
 * does not tell the two sealed events apart — both are sealed, and the prize at
 * the top of the ladder is the whole difference. Here gems and packs stop at
 * five wins, the prize becomes a Play Booster box at six, and seven pays a
 * second. ARENA_DIRECT_COLLECTOR is the other half of that pair.
 *
 * ARENA_DIRECT keeps its own name from the pool, since being phantom is what
 * makes it different from both of these; it pays Play boxes on the same ladder
 * as this one.
 *
 * Arena Direct is a family rather than one event, and the entry price is one of
 * its axes: in-universe sets run at 6,000 gems and Universes Beyond sets at
 * 8,000. The gem rewards scale exactly with the entry — 2,700/5,400/8,100 at
 * 6,000 against 3,600/7,200/10,800 here, which is 4/3 of each — while the pack
 * counts do not move at all. That is a useful cross-check on any ladder read
 * off a new announcement, but it is a habit of Wizards' rather than a promise,
 * so it stays in this comment instead of being computed.
 *
 * This is the 8,000 tier. The 6,000 one is deliberately absent: two extractions
 * of the terms page disagreed about its pack counts, and an absent preset beats
 * a confidently wrong one.
 *
 * Ladder confirmed across three runs of the event on magic.wizards.com — Avatar:
 * The Last Airbender, 31 July to 2 August 2026, and Marvel Super Heroes, 17–26
 * July 2026, both in the Arena Direct terms, which agree with each other and
 * with the cube event's table.
 *
 * The boxes name `LATEST_SET` rather than a set, because that is the standing
 * arrangement: a sealed Arena Direct is run alongside a release and pays boxes
 * of it. Naming the set a particular run paid would be wrong by the next one,
 * and would age every link that carried it. The cube variant is the exception
 * and says why in its own comment.
 *
 * `draftPacks: 6` is the one figure here that is assumed rather than sourced.
 * The terms give the pool as six packs but never say whether the cards are kept,
 * so this follows SEALED, where they are. If Arena Direct Sealed turns out to be
 * phantom it should be 0, which is worth about 138 gems an entry.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/arena-direct-terms-and-conditions
 */
export const ARENA_DIRECT_PLAY = {
  name: "Arena Direct (Play)",
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
    { wins: 6, gems: 0, packs: 0, boxes: [{ kind: "play", set: LATEST_SET }] },
    {
      wins: 7,
      gems: 0,
      packs: 0,
      boxes: [
        { kind: "play", set: LATEST_SET },
        { kind: "play", set: LATEST_SET },
      ],
    },
  ],
} satisfies EventPreset;
