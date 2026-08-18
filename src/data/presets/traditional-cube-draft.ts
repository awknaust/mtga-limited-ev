import type { EventPreset } from "../../lib/types";

/**
 * Traditional Cube Draft: 1,500 gems (or 10,000 gold), BO3 matches, three
 * rounds played out in full — a 0-2 start still plays round three.
 *
 * Phantom, like Premier Cube: `draftPacks: 0`, so the drafted pool adds
 * nothing. The BO3 ladder pays no gems at all below two wins.
 *
 * Three things differ from Traditional Draft: the top tier pays 5 packs rather
 * than 6, no play-in points are awarded at 3-0, and the packs are Cube Prize
 * Packs. `packs` is zero throughout — these are paid instead of ordinary
 * packs, not alongside them. See PREMIER_CUBE_DRAFT for the sourcing.
 *
 * Ladder confirmed in game rather than from a published source — Wizards does
 * not document the evergreen events' rewards anywhere.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const TRADITIONAL_CUBE_DRAFT = {
  name: "Traditional Cube Draft",
  group: "draft",
  entryCostGems: 1500,
  entryCostGold: 10000,
  draftPacks: 0,
  structure: { kind: "rounds", rounds: 3 },
  payouts: [
    { wins: 0, gems: 0, packs: 0, cubePacks: 1 },
    { wins: 1, gems: 250, packs: 0, cubePacks: 1 },
    { wins: 2, gems: 1000, packs: 0, cubePacks: 3 },
    { wins: 3, gems: 2500, packs: 0, cubePacks: 5 },
  ],
} satisfies EventPreset;
