import type { EventPreset } from "../../lib/types";

/**
 * Qualifier Play-In, Best-of-Three: the same 4,000 gems, 20,000 gold or 20
 * play-in points as the Bo1, run to four wins without a loss.
 *
 * `maxLosses: 1` is the only one in the file, and it makes the ladder short and
 * the ceiling steep: reaching it is `p⁴` flat, with no second chance to fall
 * back on. At a 55% match rate that is 9.2%, against 10.2% for the Bo1's six
 * wins before two losses — the two structures land close together, which is
 * presumably the point of offering both.
 *
 * Everything else matches its sibling, including the parts that are unusual:
 * the third entry currency, the gold price that breaks the 1,500-per-10,000
 * ratio, the phantom pool, and a top row whose only reward over the row beneath
 * it is a Qualifier Weekend token nothing can price.
 *
 * **The gem ladder is not confirmed** — same provenance as the Bo1, and the
 * same caveat. Entry and structure are Wizards'; the gems are MTG Wiki's, via a
 * 2022 article that now 404s. See `qualifier-play-in-bo1.ts` for the full note,
 * and https://github.com/awknaust/mtga-limited-ev/issues/72 to reverify.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/qualifier-play-ins-and-qualifier-weekend-information
 */
export const QUALIFIER_PLAY_IN_BO3 = {
  name: "Qualifier Play-In (Bo3)",
  group: "play-in",
  entryCostGems: 4000,
  entryCostGold: 20000,
  entryCostPlayInPoints: 20,
  draftPacks: 0,
  structure: { kind: "elimination", maxWins: 4, maxLosses: 1 },
  payouts: [
    { wins: 0, gems: 500, packs: 0 },
    { wins: 1, gems: 2000, packs: 0 },
    { wins: 2, gems: 4500, packs: 0 },
    { wins: 3, gems: 6000, packs: 0 },
    { wins: 4, gems: 6000, packs: 0, qualifierTokens: 1 },
  ],
} satisfies EventPreset;
