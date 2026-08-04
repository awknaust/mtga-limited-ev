/** Turning a win count into gems, via the config's payout table. */

import type { EventConfig, PayoutTier } from "./types";

export function payoutFor(config: EventConfig, wins: number): PayoutTier {
  const tier = config.payouts.find((t) => t.wins === wins);
  return tier ?? { wins, gems: 0, packs: 0 };
}

/** Gross payout in gems for a given win count (packs converted at packValueGems). */
export function grossValue(config: EventConfig, wins: number): number {
  const tier = payoutFor(config, wins);
  return tier.gems + tier.packs * config.packValueGems;
}

/** Net result in gems for a given win count, after the entry fee. */
export function netValue(config: EventConfig, wins: number): number {
  return grossValue(config, wins) - config.entryCostGems;
}
