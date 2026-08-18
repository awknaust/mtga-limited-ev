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
      "What one entry wins or loses on average, after the entry fee. Marked ≈ because packs and other rewards are priced at your rates, not paid as gems.",
  },
  gross: {
    label: "What expected gross means",
    content:
      "What one event pays back on average, before the entry fee. Packs and other rewards are counted at your rates.",
  },
  roi: {
    label: "What ROI means",
    content:
      "Expected net as a share of the entry fee. At −10%, an average entry gives back 90 for every 100 paid; positive means it more than pays for itself.",
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
} as const satisfies Record<string, StatHelp>;
