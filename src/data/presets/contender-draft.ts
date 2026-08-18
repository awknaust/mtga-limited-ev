import type { EventPreset } from "../../lib/types";

/**
 * Contender Draft: 3,000 gems (or 20,000 gold), to 7 wins or 3 losses.
 *
 * Nothing at all is paid below three wins.
 *
 * The top two tiers pay mythic packs on top of regular ones — 4 at six wins,
 * 10 at seven — and they are the only ladder here that does. The two were
 * folded into `packs` until the model could price them apart (10 + 4 = 14,
 * 12 + 10 = 22), which is why `mythicPacks` exists: a mythic pack's rare slot
 * is a mythic every time rather than the 6:1 mix a regular booster pays, so
 * the two are separate products on separate rates.
 *
 * Seven wins also pays a "Draft Contender" player title, which is cosmetic and
 * so has no row here.
 *
 * Payouts from the set event schedule on magic.wizards.com, and confirmed
 * against two further runs of the event — Marvel Super Heroes, 7–13 July 2026,
 * in the announcements post of 6 July 2026, and The Hobbit in the post of 17
 * August 2026. Entry, structure and all five paying tiers agree across all
 * three, the regular/mythic split included.
 *
 * The best-of-one format is still inferred rather than sourced, from the 7 wins
 * / 3 losses structure it shares with Premier Draft. Neither the schedule nor
 * the announcements state a match format, so this is the one field here that a
 * second source has not settled.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/announcements-august-17-2026
 * @see https://magic.wizards.com/en/news/mtg-arena/announcements-july-6-2026
 */
export const CONTENDER_DRAFT = {
  name: "Contender Draft",
  group: "draft",
  entryCostGems: 3000,
  entryCostGold: 20000,
  draftPacks: 3,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 0, packs: 0 },
    { wins: 1, gems: 0, packs: 0 },
    { wins: 2, gems: 0, packs: 0 },
    { wins: 3, gems: 1400, packs: 3 },
    { wins: 4, gems: 2800, packs: 6 },
    { wins: 5, gems: 3200, packs: 8 },
    { wins: 6, gems: 4200, packs: 10, mythicPacks: 4 },
    { wins: 7, gems: 7200, packs: 12, mythicPacks: 10 },
  ],
} satisfies EventPreset;
