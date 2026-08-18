import type { EventPreset } from "../../lib/types";

/**
 * Qualifier Play-In, Best-of-One: 4,000 gems, 20,000 gold or 20 play-in points,
 * six wins before two losses. The event that feeds a Qualifier Weekend, and the
 * only one in this file that takes points.
 *
 * Three things about it are unlike every other event here.
 *
 * It is the first to take a third currency, and the first whose gold price
 * breaks the 1,500-per-10,000 ratio every dual-priced event had held to —
 * 20,000 gold against 4,000 gems implies 2,000, so gold stretches further
 * here than anywhere else. See `GEMS_PER_10K_GOLD`.
 *
 * It is phantom. The Sealed months hand you six packs' worth of pool and take
 * it back afterwards, so `draftPacks: 0`, spelled out as the cube events spell
 * it: "Cards opened will not be added to players' collections."
 *
 * And what it is played for cannot be priced. The final win pays no more gems
 * than the one before it; what it pays is a Qualifier Weekend token, valued at
 * zero by default because nothing sells one. `DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS`
 * carries the figure to type in for anyone who wants the seat priced at what it
 * returns.
 *
 * The format rotates month to month — Sealed, Standard, Timeless — while the
 * entry and the structure never do, which is why this is named for its
 * structure rather than its pool.
 *
 * **The gem ladder is not confirmed.** Entry and structure come from Wizards
 * (below), who publish no Play-In prize table at all. The gems come from MTG
 * Wiki <https://mtg.fandom.com/wiki/Qualifier_Play-In>, which traces them to an
 * April 2022 Wizards article that now 404s. The shape is self-consistent — the
 * gem prize caps one win below the advance threshold in both the Bo1 and Bo3
 * ladders, so the last win buys the token and nothing else — but it is four
 * years old against a dead source. Before trusting a figure off this table, see
 * https://github.com/awknaust/mtga-limited-ev/issues/72, which says what to
 * check in the client and why this shape is believed in the meantime.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/qualifier-play-ins-and-qualifier-weekend-information
 */
export const QUALIFIER_PLAY_IN_BO1 = {
  name: "Qualifier Play-In (Bo1)",
  group: "play-in",
  entryCostGems: 4000,
  entryCostGold: 20000,
  entryCostPlayInPoints: 20,
  draftPacks: 0,
  structure: { kind: "elimination", maxWins: 6, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 500, packs: 0 },
    { wins: 1, gems: 1000, packs: 0 },
    { wins: 2, gems: 1500, packs: 0 },
    { wins: 3, gems: 3000, packs: 0 },
    { wins: 4, gems: 4500, packs: 0 },
    { wins: 5, gems: 6000, packs: 0 },
    { wins: 6, gems: 6000, packs: 0, qualifierTokens: 1 },
  ],
} satisfies EventPreset;
