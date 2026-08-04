import type { EventPreset } from "../../lib/types";

/** Quick Draft (vs. bots): 750 gems (or 5,000 gold), BO1, to 7 wins or 3 losses. */
export const QUICK_DRAFT = {
  name: "Quick Draft",
  entryCostGems: 750,
  format: "bo1",
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 50, packs: 1 },
    { wins: 1, gems: 100, packs: 1 },
    { wins: 2, gems: 200, packs: 1 },
    { wins: 3, gems: 300, packs: 1 },
    { wins: 4, gems: 450, packs: 1 },
    { wins: 5, gems: 650, packs: 1 },
    { wins: 6, gems: 850, packs: 1 },
    { wins: 7, gems: 950, packs: 2 },
  ],
} satisfies EventPreset;
