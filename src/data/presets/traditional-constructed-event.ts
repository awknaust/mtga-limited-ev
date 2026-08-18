import type { EventPreset } from "../../lib/types";

/**
 * Traditional Constructed Event: 750 gems (or 5,000 gold), BO3 matches, five
 * rounds played out in full — an 0-3 start still plays rounds four and five.
 *
 * The BO3 half of the constructed pair, and one preset for the same five
 * formats for the same reason; see `CONSTRUCTED_EVENT`, which carries the
 * argument and the sources.
 *
 * Two things separate it from Traditional Draft, the other fixed-rounds event
 * here. It runs five rounds rather than three, so the ladder has six rows and
 * the record at every one of them is fixed — 0-5 through 5-0, with nothing to
 * split. And 5-0 pays 4 play-in points where Traditional Draft's 3-0 pays 2,
 * the largest points award any preset carries.
 *
 * Wizards' Streets of New Capenna State of the Game prints this one alongside
 * the best-of-one table — "Entry fee: 5,000 gold or 750 gems", "Event length:
 * 5 matches" — and MTG Arena Zone's Traditional Standard and Traditional
 * Historic guides carry the identical ladder today.
 *
 * "5 matches" is the whole structure: there is no early exit, so a run that
 * cannot reach a higher tier still plays the rounds. That is why the 0-win row
 * pays 50 gems and a pack rather than nothing.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-streets-new-capenna-2022-04-21
 * @see https://mtgazone.com/traditional-standard-event-guide-and-decklists/
 * @see https://mtgazone.com/traditional-historic-event-guide-and-decklists/
 */
export const TRADITIONAL_CONSTRUCTED_EVENT = {
  name: "Traditional Constructed Event",
  group: "constructed",
  entryCostGems: 750,
  entryCostGold: 5000,
  draftPacks: 0,
  structure: { kind: "rounds", rounds: 5 },
  payouts: [
    { wins: 0, gems: 50, packs: 1 },
    { wins: 1, gems: 100, packs: 1 },
    { wins: 2, gems: 150, packs: 2 },
    { wins: 3, gems: 600, packs: 2 },
    { wins: 4, gems: 800, packs: 2 },
    { wins: 5, gems: 1000, packs: 3, playInPoints: 4 },
  ],
} satisfies EventPreset;
