import type { EventPreset } from "../../lib/types";

/**
 * Premier Cube Draft: Premier Draft's entry, structure and gem ladder, but
 * phantom — you draft the cube and play the deck, and keep none of it.
 *
 * The two differences pull against each other. `draftPacks: 0` removes the
 * three kept packs, roughly 69 gems at every win count including 0-3. The pack
 * ladder then pays more at the top than Premier's, 5/6/7 against 4/5/6 from
 * five wins up, which reads as compensation for the phantom pool — but it is
 * compensation you only collect by winning, while what was removed applied
 * however the run went.
 *
 * That is why the two ladders are no longer asserted identical: they are not.
 * Only the gem column is shared, and a test pins that rather than the whole
 * table.
 *
 * Ladder confirmed in game rather than from a published source — Wizards does
 * not document the evergreen events' rewards anywhere.
 */
export const PREMIER_CUBE_DRAFT = {
  name: "Premier Cube Draft",
  entryCostGems: 1500,
  entryCostGold: 10000,
  draftPacks: 0,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 50, packs: 1 },
    { wins: 1, gems: 100, packs: 1 },
    { wins: 2, gems: 250, packs: 2 },
    { wins: 3, gems: 1000, packs: 2 },
    { wins: 4, gems: 1400, packs: 3 },
    { wins: 5, gems: 1600, packs: 5 },
    { wins: 6, gems: 1800, packs: 6 },
    { wins: 7, gems: 2200, packs: 7 },
  ],
} satisfies EventPreset;
