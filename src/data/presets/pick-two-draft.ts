import type { EventPreset } from "../../lib/types";

/**
 * Pick Two Draft: 900 gems (or 6,000 gold), BO1, to 4 wins or 2 losses.
 *
 * The only preset that is neither 7 wins nor 3 losses, and the reward curve
 * steps up sharply at the second win rather than climbing evenly.
 *
 * The two-win row pays one pack, confirmed on the in-game prize track for the
 * Marvel Super Heroes running of the event. That is worth recording because the
 * MTG Wiki says two, and it is the only cell where that page and this file
 * disagree — everything else, entry included, matches. The client wins: Wizards
 * documents the evergreen events there and nowhere else, so it is the primary
 * source and the wiki is a transcription of it.
 *
 * The likeliest reconciliation is that the wiki is stale rather than mistaken.
 * These rewards have been revised at least once already — the two-win prize was
 * announced at 250 gems and raised to 800 before the set shipped — so a pack
 * count that moved with it would leave exactly this trace.
 */
export const PICK_TWO_DRAFT = {
  name: "Pick Two Draft",
  group: "draft",
  bestOf: 1,
  entryCostGems: 900,
  entryCostGold: 6000,
  draftPacks: 3,
  structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 50, packs: 1 },
    { wins: 1, gems: 150, packs: 1 },
    { wins: 2, gems: 800, packs: 1 },
    { wins: 3, gems: 1000, packs: 2 },
    { wins: 4, gems: 1300, packs: 3 },
  ],
} satisfies EventPreset;
