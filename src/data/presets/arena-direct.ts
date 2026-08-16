import type { EventPreset } from "../../lib/types";

/**
 * Arena Direct (Powered Cube): 8,000 gems, best-of-one, to 7 wins or 2 losses.
 *
 * The tightest leash of any event here — two losses ends it, against a seven
 * win track — and the only one paying physical product. Gems and packs stop
 * entirely at six wins, where the prize becomes a Play Booster box, and seven
 * pays a second box.
 *
 * Structure is quoted from the Arena Direct terms: "Entry is valid until 7
 * wins or 2 losses, whichever comes first." The ladder is from the event
 * announcement, both on magic.wizards.com.
 *
 * Alone among the three, this one names its sets rather than saying "newest".
 * The August 4–8 2026 run paid a *Marvel's Spider-Man* box at six wins, and a
 * Spider-Man box **and** a *Marvel Super Heroes* box at seven — two different
 * products on one row, and neither of them the set current that week. The
 * cube is drafted from its own card pool, so nothing ties its prizes to a
 * release the way the two sealed variants are tied; what it pays is whatever
 * that run announced, and the only honest way to carry it is by name.
 *
 * Both were priced by the live feed when this was written. As they age out of
 * its twenty-set window the boxes fall back to the generic Play Booster
 * average, which is the right direction to fail in — an old event priced at a
 * typical box rather than at nothing.
 *
 * The boxes are real product shipped after the event, so their gem value is a
 * conversion rather than a game figure — see DEFAULT_PLAY_BOX_VALUE_GEMS for
 * the generic case, and `boxValueGems` for how a named one is priced.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/announcements-august-3-2026
 */
export const ARENA_DIRECT = {
  name: "Arena Direct (Cube)",
  entryCostGems: 8000,
  draftPacks: 0,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 0, packs: 0 },
    { wins: 1, gems: 0, packs: 0 },
    { wins: 2, gems: 0, packs: 0 },
    { wins: 3, gems: 3600, packs: 8 },
    { wins: 4, gems: 7200, packs: 16 },
    { wins: 5, gems: 10800, packs: 24 },
    { wins: 6, gems: 0, packs: 0, boxes: [{ kind: "play", set: "spm" }] },
    {
      wins: 7,
      gems: 0,
      packs: 0,
      boxes: [
        { kind: "play", set: "spm" },
        { kind: "play", set: "msh" },
      ],
    },
  ],
} satisfies EventPreset;
