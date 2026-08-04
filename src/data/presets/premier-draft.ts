import type { EventPreset } from "../../lib/types";

/** Premier Draft: 1,500 gems (or 10,000 gold), BO1, to 7 wins or 3 losses. */
export const PREMIER_DRAFT = {
  name: "Premier Draft",
  entryCostGems: 1500,
  format: "bo1",
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 50, packs: 1 },
    { wins: 1, gems: 100, packs: 1 },
    { wins: 2, gems: 250, packs: 2 },
    { wins: 3, gems: 1000, packs: 2 },
    { wins: 4, gems: 1400, packs: 3 },
    { wins: 5, gems: 1600, packs: 4 },
    { wins: 6, gems: 1800, packs: 5 },
    { wins: 7, gems: 2200, packs: 6 },
  ],
} satisfies EventPreset;
