import type { EventPreset } from "../../lib/types";

/**
 * Constructed Event: 375 gems (or 2,500 gold), BO1, to 7 wins or 3 losses.
 *
 * One preset for every format Arena runs this in. Standard, Alchemy, Historic,
 * Explorer and Timeless each get their own queue and their own pack pool — the
 * newest Standard set, the newest Alchemy set, something already rotated — but
 * the entry, the structure and the ladder are the same table in all of them,
 * and this model prices a pack at one rate whatever set it came from. Naming
 * the format would therefore have shipped five identical presets, so the
 * preset is named for the family, which is what Wizards calls it too.
 *
 * The only preset here that is not a limited event. `draftPacks` is 0 because
 * you bring a deck you already own and keep nothing new — the same field value
 * as the phantom cubes, for an entirely different reason.
 *
 * Unusually for an evergreen event, Wizards publishes this ladder. The limited
 * ones are documented in the client and nowhere else, but the Streets of New
 * Capenna State of the Game prints the constructed tables in full: "Entry fee:
 * 2,500 gold or 375 gems", "Event length: 7 wins or 3 losses", and the eight
 * rows below. That article is four years old, so what says it is still current
 * is MTG Arena Zone's per-format guides — and they say it three times over,
 * since the Standard, Historic and Alchemy pages each carry this identical
 * table. That agreement is also the evidence for collapsing the formats into
 * one preset rather than the assumption behind it.
 *
 * Every row is gems, packs and play-in points, so nothing on this ladder needs
 * a reward kind the model does not already have. The gold entry is exactly
 * 1,500 gems per 10,000 gold, the same rate every dual-priced event charges.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-streets-new-capenna-2022-04-21
 * @see https://mtgazone.com/standard-event-guide-and-decklists/
 * @see https://mtgazone.com/historic-event-guide-and-decklists/
 */
export const CONSTRUCTED_EVENT = {
  name: "Constructed Event",
  group: "constructed",
  entryCostGems: 375,
  entryCostGold: 2500,
  draftPacks: 0,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 25, packs: 0 },
    { wins: 1, gems: 50, packs: 0 },
    { wins: 2, gems: 75, packs: 1 },
    { wins: 3, gems: 200, packs: 1 },
    { wins: 4, gems: 300, packs: 1 },
    { wins: 5, gems: 400, packs: 2 },
    { wins: 6, gems: 450, packs: 2 },
    // The only elimination event that pays a play-in point at the ceiling.
    { wins: 7, gems: 500, packs: 3, playInPoints: 1 },
  ],
} satisfies EventPreset;
