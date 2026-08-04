import type { EventPreset } from "../../lib/types";

/**
 * Arena Cube Draft: same entry, structure and payouts as Premier Draft.
 *
 * The ladder is repeated here rather than imported from Premier so this file
 * stays a plain description of one event. A test asserts the two remain
 * identical, so drift is caught rather than prevented.
 */
export const CUBE_DRAFT = {
  name: "Cube Draft",
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
