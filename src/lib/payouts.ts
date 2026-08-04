/** Turning a win count into gems, via the config's payout table. */

import type { EventConfig, PayoutTier } from "./types";

export function payoutFor(config: EventConfig, wins: number): PayoutTier {
  const tier = config.payouts.find((t) => t.wins === wins);
  return tier ?? { wins, gems: 0, packs: 0 };
}

/** Play-in points awarded at a win count; absent means none. */
export function playInPointsFor(config: EventConfig, wins: number): number {
  return payoutFor(config, wins).playInPoints ?? 0;
}

/**
 * Gross payout in gems for a given win count, with packs and play-in points
 * converted at the rates the config carries.
 */
export function grossValue(config: EventConfig, wins: number): number {
  const tier = payoutFor(config, wins);
  return (
    tier.gems +
    tier.packs * config.packValueGems +
    (tier.playInPoints ?? 0) * config.playInPointValueGems +
    (tier.playBoxes ?? 0) * config.playBoxValueGems +
    (tier.collectorBoxes ?? 0) * config.collectorBoxValueGems
  );
}

/**
 * Long-run share of entries that gold covers.
 *
 * Gold accrues at a fixed rate whatever happens in the event, so over many
 * entries it funds `goldPerEvent / entryCostGold` of them and gems cover the
 * rest. This is the limit the bankroll simulation converges to, and the two
 * are checked against each other.
 */
export function goldFundedFraction(config: EventConfig): number {
  if (config.entryCostGold <= 0 || config.goldPerEvent <= 0) return 0;
  return Math.min(1, config.goldPerEvent / config.entryCostGold);
}

/** Gems actually paid per entry on average, once gold has covered its share. */
export function effectiveEntryGems(config: EventConfig): number {
  return config.entryCostGems * (1 - goldFundedFraction(config));
}

/**
 * Net result in gems for a given win count, against the effective entry.
 *
 * Whether an entry is gold-funded is independent of how the event goes, so
 * charging every outcome the average entry leaves the expectation unchanged
 * and keeps net a function of the win count alone.
 */
export function netValue(config: EventConfig, wins: number): number {
  return grossValue(config, wins) - effectiveEntryGems(config);
}
