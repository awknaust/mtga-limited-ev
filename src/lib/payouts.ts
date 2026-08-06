/** Turning a win count into gems, via the config's payout table. */

import { exactDistribution } from "./distribution";
import { DAILY_WIN_CAP, DAILY_WIN_GOLD } from "./presets";
import { matchWinRate } from "./structure";
import type { HoldingKey } from "./holdings";
import type { EventConfig, PayoutTier, WinBucket } from "./types";

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
 * Expected gross per event, split into what it is made of.
 *
 * `grossValue` folds six terms into one number, and by the time it reaches the
 * screen there is no telling whether a gross of 1,128 is mostly gems or mostly
 * packs — outcomes that feel nothing alike to whoever has to open the packs to
 * realise the value. This takes the same six terms and reports them
 * separately, weighted by how often each win count happens.
 *
 * Keyed by holding so it lines up with the bankroll breakdown, which means
 * gold appears and is always zero: gold accrues daily rather than being paid
 * by a ladder, so no part of an event's gross is gold. Callers drop the empty
 * entries.
 *
 * These sum to `SimResult.meanGross` by construction, since they are that same
 * sum with the bucket weights distributed over its terms and the probabilities
 * summing to one. `payouts.test.ts` pins that rather than trusting it, because
 * a figure drawn under a total has to add up to the total.
 */
export function grossSplit(
  config: EventConfig,
  buckets: readonly WinBucket[],
): Record<HoldingKey, number> {
  const mean = (of: (b: WinBucket) => number): number =>
    buckets.reduce((acc, b) => acc + b.probability * of(b), 0);

  return {
    gems: mean((b) => payoutFor(config, b.wins).gems),
    // Never part of a gross: nothing on a payout ladder pays gold.
    gold: 0,
    packs: mean((b) => b.packs) * config.packValueGems,
    playInPoints: mean((b) => b.playInPoints) * config.playInPointValueGems,
    playBoxes: mean((b) => b.playBoxes) * config.playBoxValueGems,
    collectorBoxes: mean((b) => b.collectorBoxes) * config.collectorBoxValueGems,
    // Flat across win counts: the pool is kept for entering, however it goes.
    draftPacks: config.draftPacks * config.draftPackValueGems,
  };
}

/**
 * How many of each reward an event pays on average, alongside what they came
 * to. The bar built from `grossSplit` names both — "6.2 packs" and what they
 * are worth answer different questions, and neither implies the other.
 */
export function grossCounts(
  config: EventConfig,
  buckets: readonly WinBucket[],
): Record<HoldingKey, number> {
  const mean = (of: (b: WinBucket) => number): number =>
    buckets.reduce((acc, b) => acc + b.probability * of(b), 0);

  return {
    gems: mean((b) => payoutFor(config, b.wins).gems),
    gold: 0,
    packs: mean((b) => b.packs),
    playInPoints: mean((b) => b.playInPoints),
    playBoxes: mean((b) => b.playBoxes),
    collectorBoxes: mean((b) => b.collectorBoxes),
    draftPacks: config.draftPacks,
  };
}

/**
 * Gold from the daily-win ladder for a number of wins in a day.
 *
 * Fractional wins are interpolated within the step they fall in. A win count is
 * an expectation rather than a whole number of matches, and rounding it would put
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
