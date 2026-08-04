import type { EventPreset } from "../../lib/types";

/**
 * Traditional Sealed: 2,000 gems, BO3 matches, to 4 match wins or 2 match
 * losses. Winning a single game does not advance the track — the match does.
 *
 * The only preset that is both best-of-three and elimination; Traditional
 * Draft is best-of-three but plays a fixed three rounds.
 *
 * Nearly all the gem value sits on the 4-win run: the ladder is flat at 200
 * until then. Packs scale with wins, so a losing run still returns something.
 */
export const TRADITIONAL_SEALED = {
  name: "Traditional Sealed",
  entryCostGems: 2000,
  format: "bo3",
  structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 200, packs: 1 },
    { wins: 1, gems: 200, packs: 2 },
    { wins: 2, gems: 200, packs: 3 },
    { wins: 3, gems: 200, packs: 4 },
    { wins: 4, gems: 2200, packs: 5 },
  ],
} satisfies EventPreset;
