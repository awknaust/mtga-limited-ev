import type { EventPreset } from "../../lib/types";

/**
 * Traditional Cube Draft: 1,500 gems (or 10,000 gold), BO3 matches, three
 * rounds played out in full — a 0-2 start still plays round three.
 *
 * Phantom, like Premier Cube: `draftPacks: 0`, so the drafted pool adds
 * nothing. It is the sharper version of the same trade, because a BO3 ladder
 * pays nothing at all below two wins.
 *
 * Two things separate it from Traditional Draft, and both cost you: the top
 * tier pays 5 packs rather than 6, and no play-in points are awarded at 3-0.
 * Traditional Draft's 2 points are worth 400 gems at the default rate, so the
 * 3-0 row is materially poorer here than the shared gem ladder suggests.
 *
 * Ladder confirmed in game rather than from a published source — Wizards does
 * not document the evergreen events' rewards anywhere.
 */
export const TRADITIONAL_CUBE_DRAFT = {
  name: "Traditional Cube Draft",
  entryCostGems: 1500,
  entryCostGold: 10000,
  draftPacks: 0,
  structure: { kind: "rounds", rounds: 3 },
  payouts: [
    { wins: 0, gems: 0, packs: 1 },
    { wins: 1, gems: 250, packs: 1 },
    { wins: 2, gems: 1000, packs: 3 },
    { wins: 3, gems: 2500, packs: 5 },
  ],
} satisfies EventPreset;
