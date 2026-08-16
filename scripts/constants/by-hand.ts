/**
 * The figures no page publishes.
 *
 * Entry prices, the gem bundle ladder and the daily quest payout are in the
 * client and nowhere else, so they are recorded here with the date each was
 * last confirmed. Update the date when you check one, whether or not it moved:
 * the date is the whole point of the field, because an unchecked number and an
 * unchanged number look identical from the outside.
 *
 * A community wiki could supply these, and would trade a known gap for an
 * unknown error. That is the wrong direction for this repo — see the data
 * provenance notes in CLAUDE.md.
 *
 * This file going stale is not hypothetical. The ladder below carried a 7,000
 * for $39.99 bundle long after the store replaced it with the 9,200 and 1,600
 * tiers, and nothing surfaced it because only the rate derived from it was ever
 * printed. Everything recorded here is shown in full under `--verbose`.
 */

/**
 * The MTG Arena store's gem bundles, largest first.
 *
 * Note that the best rate is not the largest bundle: the 40,000 and the 20,000
 * are the same price per gem to within a rounding error, and the 40,000 is
 * fractionally the worse of the two.
 */
export const GEM_BUNDLES = {
  checkedOn: "2026-08-06",
  where: "MTG Arena store, Gems tab",
  rungs: [
    { gems: 40_000, usd: 199.99 },
    { gems: 20_000, usd: 99.99 },
    { gems: 9_200, usd: 49.99 },
    { gems: 3_400, usd: 19.99 },
    { gems: 1_600, usd: 9.99 },
    { gems: 750, usd: 4.99 },
  ],
} as const;

/**
 * Events that take both currencies, which is what sets the gold-to-gem rate.
 *
 * Arena fixes the rate by what it charges, so this is read off rather than
 * invented. The constant only holds while these all agree — two of them
 * disagreeing means the rate has become per-event and the model needs to change
 * shape, not just take a new number.
 */
export const DUAL_PRICED_EVENTS = {
  checkedOn: "2026-08-06",
  where: "MTG Arena, Play menu",
  events: [
    { name: "Premier Draft", gems: 1_500, gold: 10_000 },
    { name: "Quick Draft", gems: 750, gold: 5_000 },
    { name: "Pick Two Draft", gems: 900, gold: 6_000 },
    { name: "Contender Draft", gems: 3_000, gold: 20_000 },
  ],
} as const;

/**
 * What a play-in point is worth, priced off what the points are for.
 *
 * A replacement-cost figure, not a market one: it holds only if you would have
 * entered the Open anyway. Points you never spend are worth nothing, and points
 * beyond a multiple of the entry are stranded until you collect enough.
 */
export const PLAY_IN_ENTRY = {
  checkedOn: "2026-08-06",
  where: "https://magic.wizards.com/en/news/mtg-arena/arena-open-terms-and-conditions",
  pointsPerEntry: 20,
  gemsPerEntry: 4_000,
} as const;

/**
 * Gold from a daily quest, which is the softest number in the model.
 *
 * It varies with which quest you draw, so this is the middle of the range
 * rather than a published figure.
 */
export const DAILY_QUEST = {
  checkedOn: "2026-08-06",
  where: "MTG Arena, daily quest",
  gold: 600,
  range: [500, 750],
} as const;
