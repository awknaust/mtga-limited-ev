import type { EventPreset } from "../../lib/types";

/**
 * Pick Two Draft: 900 gems (or 6,000 gold), BO1, to 4 wins or 2 losses.
 *
 * The only preset that is neither 7 wins nor 3 losses, and the reward curve
 * steps up sharply at the second win rather than climbing evenly.
 */
export const PICK_TWO_DRAFT = {
  name: "Pick Two Draft",
  entryCostGems: 900,
  entryCostGold: 6000,
  format: "bo1",
  structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 50, packs: 1 },
    { wins: 1, gems: 150, packs: 1 },
    { wins: 2, gems: 800, packs: 1 },
    { wins: 3, gems: 1000, packs: 2 },
    { wins: 4, gems: 1300, packs: 3 },
  ],
} satisfies EventPreset;
