/**
 * What each per-event figure means, in one place.
 *
 * The Long-term value tab's tiles and the Compare tab's column headings ask the
 * reader to understand the same statistics, so they explain them in the same
 * words — and the only way two explanations stay the same is by being one. Two
 * copies would drift on the first edit, and the wrong one would be the one
 * nobody was looking at.
 *
 * Per the house rule these say what the figure is and stop. Caveats, sourcing
 * and derivations belong in doc comments, where length is free; a popover the
 * reader has to dismiss is not the place for a paragraph.
 */

export type StatHelp = { label: string; content: string };

export const STAT_HELP = {
  net: {
    label: "What expected net means",
    content:
      "What one entry wins or loses on average: the expected gross, less the gem entry fee. Marked ≈ because packs, gold and other rewards are priced at your rates, not paid as gems.",
  },
  gross: {
    label: "What expected gross means",
    content:
      "What one event pays back on average, before the entry fee: the ladder's rewards, the cards kept from the pool, and the gold a day's play earns, all counted at your rates. The cards and the gold come with the entry rather than the finish, so every outcome row carries the same amount of each.",
  },
  roi: {
    label: "What ROI means",
    content:
      "Expected net as a share of the gem entry fee. At −10%, an average entry gives back 90 for every 100 paid; positive means it more than pays for itself. Gold earned counts toward the return, not as a discount on the fee.",
  },
  breakEven: {
    label: "What break-even win rate means",
    content:
      "The match win rate at which the average event exactly pays back its entry. Win more often and the event makes money on average; less often and it loses.",
  },
  probProfit: {
    label: "What P(profit) means",
    content:
      "The chance one event ends worth more than its entry. It can be under 50% even when the event is profitable on average, because a few big finishes carry the average.",
  },
  matches: {
    label: "What matches per event means",
    content: "How many matches one event lasts on average.",
  },
  games: {
    label: "What games per event means",
    content:
      "How many games one event lasts on average — the unit the games budget and the day of play are counted in. A best-of-one match is one game; a best-of-three is counted at about two and a half.",
  },
} as const satisfies Record<string, StatHelp>;
