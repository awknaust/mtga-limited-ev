import type { EventPreset } from "../../lib/types";

/**
 * Premier Cube Draft: Premier Draft's entry, structure and gem ladder, but
 * phantom — you draft the cube and play the deck, and keep none of it.
 *
 * Two things differ from Premier Draft. `draftPacks: 0`, since the pool is not
 * kept; and the pack column, which pays 5/6/7 from five wins up against
 * Premier's 4/5/6, in Cube Prize Packs rather than ordinary ones.
 *
 * That is why the two ladders are no longer asserted identical: they are not.
 * Only the gem column is shared, and a test pins that rather than the whole
 * table.
 *
 * `packs` is zero throughout rather than split: the cube drafts pay Cube Prize
 * Packs *instead of* ordinary packs, not alongside them, which is the opposite
 * of how Contender Draft pays its mythic packs.
 *
 * Ladder confirmed in game rather than from a published source — Wizards does
 * not document the evergreen events' rewards anywhere — and so is the fact
 * that these are Cube Prize Packs, though the set event schedules do say the
 * cube events pay them ("new cards will be featured in the Cube Prize Pack
 * rewards"), and the drop-rates page publishes what one contains.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/the-hobbit-event-schedule
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export const PREMIER_CUBE_DRAFT = {
  name: "Premier Cube Draft",
  entryCostGems: 1500,
  entryCostGold: 10000,
  draftPacks: 0,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 50, packs: 0, cubePacks: 1 },
    { wins: 1, gems: 100, packs: 0, cubePacks: 1 },
    { wins: 2, gems: 250, packs: 0, cubePacks: 2 },
    { wins: 3, gems: 1000, packs: 0, cubePacks: 2 },
    { wins: 4, gems: 1400, packs: 0, cubePacks: 3 },
    { wins: 5, gems: 1600, packs: 0, cubePacks: 5 },
    { wins: 6, gems: 1800, packs: 0, cubePacks: 6 },
    { wins: 7, gems: 2200, packs: 0, cubePacks: 7 },
  ],
} satisfies EventPreset;
