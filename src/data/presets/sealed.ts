import type { EventPreset } from "../../lib/types";

/**
 * Sealed: 2,000 gems, BO1, to 7 wins or 3 losses. Gems only — unlike the draft
 * events, there is no gold entry.
 *
 * The gem ladder plateaus rather than climbing evenly: flat to 1 win, then
 * steps at 2, 3 and 6. Pack rewards are flat at 3 regardless of record, so
 * every run returns the same packs and only the gems vary.
 */
export const SEALED = {
  name: "Sealed",
  entryCostGems: 2000,
  draftPacks: 6,
  format: "bo1",
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 200, packs: 3 },
    { wins: 1, gems: 200, packs: 3 },
    { wins: 2, gems: 600, packs: 3 },
    { wins: 3, gems: 1200, packs: 3 },
    { wins: 4, gems: 1200, packs: 3 },
    { wins: 5, gems: 1200, packs: 3 },
    { wins: 6, gems: 2200, packs: 3 },
    { wins: 7, gems: 2200, packs: 3 },
  ],
} satisfies EventPreset;
