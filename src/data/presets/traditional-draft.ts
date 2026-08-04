import type { EventPreset } from "../../lib/types";

/**
 * Traditional Draft: 1,500 gems (or 10,000 gold), BO3 matches, three rounds
 * played out in full — a 0-2 start still plays round three.
 *
 * A 3-0 also awards 2 play-in points toward an Arena Open.
 */
export const TRADITIONAL_DRAFT = {
  name: "Traditional Draft",
  entryCostGems: 1500,
  entryCostGold: 10000,
  format: "bo3",
  structure: { kind: "rounds", rounds: 3 },
  payouts: [
    { wins: 0, gems: 0, packs: 1 },
    { wins: 1, gems: 0, packs: 1 },
    { wins: 2, gems: 1000, packs: 4 },
    { wins: 3, gems: 3000, packs: 6, playInPoints: 2 },
  ],
} satisfies EventPreset;
