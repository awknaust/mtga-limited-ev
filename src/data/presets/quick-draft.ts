import type { EventPreset } from "../../lib/types";

/**
 * Quick Draft (vs. bots): 750 gems (or 5,000 gold), BO1, to 7 wins or 3 losses.
 *
 * The pack column holds expectations rather than whole packs, and that needs
 * saying because it is the only preset where it does. Every tier below seven
 * wins awards one pack with a chance of a second instead, rising with the
 * record: 20% at no wins, then 22, 24, 26, 30, 35 and 40% at six. Seven wins
 * pays two flat, with no upgrade. So the expected count runs 1.2 to 1.4 and
 * the client, which can only show what it hands you, says "1".
 *
 * Carrying the expectation is what makes every figure downstream correct —
 * expected gross, the outcome table's contribution column, mean packs over a
 * bankroll run — since all of them integrate over outcomes anyway. What it
 * costs is that the payout editor shows 1.2 against a client that shows 1, and
 * that no single run can ever return 1.2 packs. The alternative was to write 1
 * and understate every tier by a fifth of a pack, which is worse in every
 * figure the app actually reports.
 *
 * It also puts a little variance in the packs that the model does not carry:
 * `packs` is a constant per win count, so the spread of a single event is
 * narrower here than in Arena. The means are right; the tails are slightly
 * tight.
 *
 * Both the ladder and the upgrade chances were confirmed against the client.
 *
 * @see https://mtg.wiki/page/Magic:_The_Gathering_Arena/Events
 */
export const QUICK_DRAFT = {
  name: "Quick Draft",
  entryCostGems: 750,
  entryCostGold: 5000,
  draftPacks: 3,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 50, packs: 1.2 },
    { wins: 1, gems: 100, packs: 1.22 },
    { wins: 2, gems: 200, packs: 1.24 },
    { wins: 3, gems: 300, packs: 1.26 },
    { wins: 4, gems: 450, packs: 1.3 },
    { wins: 5, gems: 650, packs: 1.35 },
    { wins: 6, gems: 850, packs: 1.4 },
    // Two flat, and the only tier with no upgrade chance behind it.
    { wins: 7, gems: 950, packs: 2 },
  ],
} satisfies EventPreset;
