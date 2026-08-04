/** Turning a win count into gems, via the config's payout table. */

import { exactDistribution } from "./distribution";
import { DAILY_WIN_CAP, DAILY_WIN_GOLD } from "./presets";
import { matchWinRate } from "./structure";
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
 * Gross value in gems for a given win count.
 *
 * Includes the cards kept from the pool, which are not a payout tier reward —
 * you get them for entering, however the event goes — so they are flat across
 * every win count.
 */
export function grossValue(config: EventConfig, wins: number): number {
  const tier = payoutFor(config, wins);
  return (
    config.draftPacks * config.draftPackValueGems +
    tier.gems +
    tier.packs * config.packValueGems +
    (tier.playInPoints ?? 0) * config.playInPointValueGems +
    (tier.playBoxes ?? 0) * config.playBoxValueGems +
    (tier.collectorBoxes ?? 0) * config.collectorBoxValueGems
  );
}

/**
 * Gold from the daily-win ladder for a number of wins in a day.
 *
 * Fractional wins are interpolated within the step they fall in. A win count is
 * an expectation rather than a whole number of games, and rounding it would put
 * a visible stair-step in the EV curve where the model has no real
 * discontinuity.
 */
export function dailyWinGold(wins: number): number {
  const capped = Math.min(Math.max(wins, 0), DAILY_WIN_CAP);
  const whole = Math.floor(capped);
  let total = 0;
  for (let i = 0; i < whole; i++) total += DAILY_WIN_GOLD[i];
  if (whole < DAILY_WIN_CAP) total += (capped - whole) * DAILY_WIN_GOLD[whole];
  return total;
}

/** Expected match wins from one run of the event, at its configured win rate. */
export function meanWinsPerEvent(config: EventConfig): number {
  return exactDistribution(matchWinRate(config), config.structure).reduce(
    (acc, p, wins) => acc + p * wins,
    0,
  );
}

/**
 * Gold credited to one event.
 *
 * Two sources, and they behave differently enough that lumping them into a
 * flat daily figure was the whole problem. Daily-win gold is *caused by* the
 * event — it comes from the event's own wins, and it saturates once the day's
 * wins reach the ladder's cap. Everything else arrives whether or not you
 * entered, so it is divided across the day's events rather than earned by any
 * of them.
 *
 * A day's wins are `eventsPerDay × meanWins`, which is what climbs the ladder;
 * dividing the result back out gives one event's share. So playing more earns
 * more in total and less each, and the second effect only bites near the cap
 * rather than immediately — which a flat figure divided by `eventsPerDay` got
 * backwards.
 */
export function goldPerEvent(config: EventConfig): number {
  if (config.eventsPerDay <= 0) return 0;
  const dailyWins = config.eventsPerDay * meanWinsPerEvent(config);
  return (dailyWinGold(dailyWins) + config.otherGoldPerDay) / config.eventsPerDay;
}

/**
 * Long-run share of entries that gold covers.
 *
 * Gold accrues at its long-run average rate, so over many entries it funds
 * `goldPerEvent / entryCostGold` of them and gems cover the rest. This is the
 * limit the bankroll simulation converges to, and the two are checked against
 * each other.
 *
 * That rate now moves with the win rate, since a better player wins more of
 * the daily ladder. It is still an average over runs rather than a function of
 * any one run's result, which is what keeps `netValue` a function of the win
 * count alone.
 */
export function goldFundedFraction(config: EventConfig): number {
  const perEvent = goldPerEvent(config);
  if (config.entryCostGold <= 0 || perEvent <= 0) return 0;
  return Math.min(1, perEvent / config.entryCostGold);
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
