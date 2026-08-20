import type { EventPreset } from "../../lib/types";

/**
 * Sealed: 2,000 gems, BO1, to 7 wins or 3 losses. Gems only — unlike the draft
 * events, there is no gold entry.
 *
 * The gem ladder climbs at every win, with one step out of line: 600 to 1,200
 * between two wins and three, twice the size of any other jump on the table.
 * Six wins returns exactly the 2,000 the entry cost, so that is the row where a
 * run has paid for itself in gems alone. Pack rewards are flat at 3 whatever
 * the record, so every run returns the same packs and only the gems vary.
 *
 * Wizards documents the evergreen events in the client and nowhere else, so
 * this ladder cannot be quoted from magic.wizards.com the way a premium event's
 * can. It is instead agreed by three independent community sources: the MTG
 * Wiki's events page, MTG Arena Zone's sealed guide, and a Kaldheim-era table.
 * Tap & Sac matches on the two rows it quotes, and Draftsim's prose agrees
 * structurally — it says six wins earns enough to enter again, and six wins
 * pays exactly the 2,000 entry.
 *
 * Four rows were wrong before this, and the shape of the error is worth
 * recording because it is the failure this repo keeps meeting. Every wrong
 * value was a copy of an adjacent correct one — 1 win carried 0's 200, 4 and 5
 * carried 3's 1,200, and 6 carried 7's 2,200 — which is a table extracted with
 * rows duplicated over their neighbours rather than numbers misread. It
 * survived this long because the two rows anyone checks first, 0 and 7, were
 * the two the corruption happened to leave intact.
 *
 * @see https://mtg.wiki/page/Magic:_The_Gathering_Arena/Events
 * @see https://mtgazone.com/throne-of-eldraine-sealed-guide/
 */
export const SEALED = {
  name: "Sealed",
  group: "sealed",
  bestOf: 1,
  entryCostGems: 2000,
  draftPacks: 6,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 200, packs: 3 },
    { wins: 1, gems: 400, packs: 3 },
    { wins: 2, gems: 600, packs: 3 },
    { wins: 3, gems: 1200, packs: 3 },
    { wins: 4, gems: 1400, packs: 3 },
    { wins: 5, gems: 1600, packs: 3 },
    { wins: 6, gems: 2000, packs: 3 },
    { wins: 7, gems: 2200, packs: 3 },
  ],
} satisfies EventPreset;
