import type { EventPreset } from "../../lib/types";

/**
 * Traditional Draft: 1,500 gems (or 10,000 gold), BO3 matches, three rounds
 * played out in full — a 0-2 start still plays round three.
 *
 * A 3-0 also awards 2 play-in points toward an Arena Open. Traditional Cube
 * shares this gem ladder but pays 5 packs at the top instead of 6, and no
 * points at all.
 *
 * Ladder confirmed in game rather than from a published source — Wizards does
 * not document the evergreen events' rewards anywhere. The previous version of
 * this table was wrong in three places: nothing at 1 win rather than 250, four
 * packs at 2 rather than three, and 3,000 gems at 3-0 rather than 2,500.
 */
export const TRADITIONAL_DRAFT = {
  name: "Traditional Draft",
  group: "draft",
  bestOf: 3,
  entryCostGems: 1500,
  entryCostGold: 10000,
  draftPacks: 3,
  structure: { kind: "rounds", rounds: 3 },
  payouts: [
    { wins: 0, gems: 0, packs: 1 },
    { wins: 1, gems: 250, packs: 1 },
    { wins: 2, gems: 1000, packs: 3 },
    { wins: 3, gems: 2500, packs: 6, playInPoints: 2 },
  ],
} satisfies EventPreset;
