import type { EventPreset } from "../../lib/types";

/**
 * Contender Draft: 3,000 gems (or 20,000 gold), to 7 wins or 3 losses.
 *
 * The steepest ladder here — nothing at all below three wins, then rewards
 * that climb past double the entry. Almost all of it sits on the 7-win run.
 *
 * The top two tiers pay mythic packs on top of regular ones (4 at six wins,
 * 10 at seven). They are folded into `packs` for now: 10 + 4 = 14, 12 + 10 =
 * 22. That understates those tiers, since a mythic pack is worth more than a
 * regular one, and the model has no way to say so yet.
 *
 * Payouts from the set event schedule on magic.wizards.com. The best-of-one
 * format is inferred from the 7 wins / 3 losses structure it shares with
 * Premier Draft — the schedule gives the structure but not the match format.
 */
export const CONTENDER_DRAFT = {
  name: "Contender Draft",
  entryCostGems: 3000,
  format: "bo1",
  structure: { kind: "elimination", maxWins: 7, maxLosses: 3 },
  payouts: [
    { wins: 0, gems: 0, packs: 0 },
    { wins: 1, gems: 0, packs: 0 },
    { wins: 2, gems: 0, packs: 0 },
    { wins: 3, gems: 1400, packs: 3 },
    { wins: 4, gems: 2800, packs: 6 },
    { wins: 5, gems: 3200, packs: 8 },
    { wins: 6, gems: 4200, packs: 14 },
    { wins: 7, gems: 7200, packs: 22 },
  ],
} satisfies EventPreset;
