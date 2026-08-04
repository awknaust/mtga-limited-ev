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
 * The boxes are real product shipped after the event, so their gem value is a
 * conversion rather than a game figure — see DEFAULT_PLAY_BOX_VALUE_GEMS.
 */
export const ARENA_DIRECT = {
  name: "Arena Direct (Cube)",
  entryCostGems: 8000,
  draftPacks: 0,
  format: "bo1",
  structure: { kind: "elimination", maxWins: 7, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 0, packs: 0 },
    { wins: 1, gems: 0, packs: 0 },
    { wins: 2, gems: 0, packs: 0 },
    { wins: 3, gems: 3600, packs: 8 },
    { wins: 4, gems: 7200, packs: 16 },
    { wins: 5, gems: 10800, packs: 24 },
    { wins: 6, gems: 0, packs: 0, playBoxes: 1 },
    { wins: 7, gems: 0, packs: 0, playBoxes: 2 },
  ],
} satisfies EventPreset;
