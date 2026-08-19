/**
 * What one entry to an event is worth, in closed form.
 *
 * A single event's outcome is a named distribution — binomial in the rounds
 * for a fixed-rounds event, negative binomial in the losses for an
 * elimination one — and every figure the Long-term value tab shows is a sum
 * over that PMF and the payout table: expected net, gross, boxes, matches, the
 * chance of a profit, and the outcome table itself. Nothing here rolls a die.
 *
 * The bankroll is the one thing that does. A run is a stopped random walk
 * whose length has no PMF in a library, so `bankroll.ts` simulates it, and
 * `simulateEvent` there is the only place an event is ever played out by
 * chance.
 */

import { exactDistribution, exactRecordDistribution } from "./distribution";
import { grossValue, meanRoundsPerEvent, netValue, payoutFor } from "./payouts";
import { matchWinRate } from "./structure";
import type { EventConfig, PayoutTier, RecordProbability } from "./types";

/** One row of the outcome table: a win count, how likely it is, what it pays. */
export type WinOutcome = {
  wins: number;
  probability: number;
  grossGems: number;
  netGems: number;
  packs: number;
  mythicPacks: number;
  cubePacks: number;
  playInPoints: number;
  /** Qualifier Weekend tokens paid at this win count; at most one, in practice. */
  qualifierTokens: number;
  /**
   * Boxes paid at this win count, all products together.
   *
   * A total rather than a count per product, because what a row is asked is
   * how often a box turns up at all — the breakdown that cares *which* box
   * prices them one at a time, off the ladder rather than off a row.
   */
  boxes: number;
};

/** The per-event figures, computed once for the config's own win rate. */
export type EventExpectation = {
  /** One per win count, 0..maxPossibleWins. */
  outcomes: WinOutcome[];
  /**
   * The same event split by finishing record rather than by win count, in
   * `possibleRecords` order.
   *
   * Payouts read off the win count alone, so this carries no money — it
   * exists because "7 wins" hides how the run got there, and the chart says
   * so. Group it by wins and it collapses back to `outcomes`.
   */
  records: RecordProbability[];
  /** Expected net gems per event: the gross less the gem price of the entry. */
  meanNet: number;
  /** Expected gross gems per event: everything an entry brings back. */
  meanGross: number;
  /** Mean boxes per event, both kinds together; a double-box finish counts as two. */
  meanBoxes: number;
  /** Mean matches played per event. */
  meanRounds: number;
  /** Chance one event ends net positive. */
  probProfit: number;
  /** Mean net over the gem price of the entry; 0 for a free event. */
  roi: number;
};

/**
 * Everything the Long-term value tab shows, from the exact outcome
 * distribution.
 *
 * `meanNet` is the same sum `expectedNet` takes, written over the rows so the
 * tile and the foot of the outcome table are one number by construction
 * rather than two that happen to agree.
 */
export function eventExpectation(config: EventConfig): EventExpectation {
  const pMatch = matchWinRate(config);
  const dist = exactDistribution(pMatch, config.structure);

  const outcomes: WinOutcome[] = dist.map((probability, wins) => {
    const tier = payoutFor(config, wins);
    return {
      wins,
      probability,
      grossGems: grossValue(config, wins),
      netGems: netValue(config, wins),
      packs: tier.packs,
      mythicPacks: tier.mythicPacks ?? 0,
      cubePacks: tier.cubePacks ?? 0,
      playInPoints: tier.playInPoints ?? 0,
      qualifierTokens: tier.qualifierTokens ?? 0,
      boxes: tier.boxes?.length ?? 0,
    };
  });

  const mean = (of: (o: WinOutcome) => number): number =>
    outcomes.reduce((acc, o) => acc + o.probability * of(o), 0);

  const meanNet = mean((o) => o.netGems);

  return {
    outcomes,
    records: exactRecordDistribution(pMatch, config.structure),
    meanNet,
    meanGross: mean((o) => o.grossGems),
    meanBoxes: mean((o) => o.boxes),
    meanRounds: meanRoundsPerEvent(config),
    probProfit: mean((o) => (o.netGems > 0 ? 1 : 0)),
    // Against the gem price as quoted: gold is on the other side of the
    // ledger, in the numerator with the packs. Zero where the event names no
    // gem price, which is a sentinel and not a rate — every reader of this
    // checks the price itself and prints an em dash for that case.
    roi: config.entryCostGems ? meanNet / config.entryCostGems : 0,
  };
}

/** Expected net gems per event at the config's own win rate, closed form. */
export function expectedNet(config: EventConfig): number {
  const dist = exactDistribution(matchWinRate(config), config.structure);
  return dist.reduce((acc, p, wins) => acc + p * netValue(config, wins), 0);
}

/**
 * Expected net gems per event at a given match win rate.
 *
 * Substitutes the rate into the config rather than only into the outcome
 * distribution. Gold comes off the daily-win ladder, so it moves with the win
 * rate too — sweeping the curve without carrying the rate through would price
 * every point on it at the gold the *configured* rate happens to earn.
 */
export function expectedNetAt(config: EventConfig, winRate: number): number {
  return expectedNet({ ...config, winRate });
}

/**
 * Chance that a single event pays a prize at all, at a given win rate.
 *
 * A win count either pays the thing or it does not, so the answer is the weight
 * the distribution puts on the counts that do. It is what holds the bankroll
 * simulation to account: a run of one event has to agree with it, and that is a
 * check the simulation cannot perform on itself.
 *
 * Parameterised rather than written twice because the box and token versions
 * differ in one predicate and nothing else, and two copies of this reasoning is
 * how the two would come to disagree.
 */
export function chancePerEvent(
  config: EventConfig,
  pays: (tier: PayoutTier) => boolean,
  p = matchWinRate(config),
): number {
  const dist = exactDistribution(p, config.structure);
  return config.payouts.reduce(
    (acc, t) => (pays(t) ? acc + (dist[t.wins] ?? 0) : acc),
    0,
  );
}

/** Chance one event pays at least one box. The share under "Expected boxes". */
export function boxChancePerEvent(config: EventConfig, p = matchWinRate(config)): number {
  return chancePerEvent(config, (t) => (t.boxes?.length ?? 0) > 0, p);
}

/**
 * Chance one event pays a Qualifier Weekend token.
 *
 * Only the top of a Play-In ladder pays one, so in practice this is the chance
 * of reaching the ceiling — but it is written as the same fold so a custom
 * ladder paying a token somewhere else still gets the right answer.
 *
 * There is no expected-tokens counterpart on purpose. A second token is
 * redundant, so a mean would count something nobody receives; see
 * `PayoutTier.qualifierTokens`.
 */
export function tokenChancePerEvent(
  config: EventConfig,
  p = matchWinRate(config),
): number {
  return chancePerEvent(config, (t) => (t.qualifierTokens ?? 0) > 0, p);
}

/**
 * Match win rate at which the event breaks even, or null if it never does
 * within [0, 1]. Bisection — expected value is monotonic in win rate for any
 * sane (non-decreasing) payout table.
 *
 * Gold moving with the win rate does not threaten that for any event here:
 * winning more climbs the daily ladder, and a longer run takes a larger share
 * of the day's gold, so both terms push the same way. A custom structure that
 * ends *faster* the more you win — fewer wins to finish than losses to bust —
 * bends the share the other way, and the day's capped total bounds how far;
 * the bisection still lands on a crossing there, just not a provably unique
 * one.
 */
export function breakEvenWinRate(config: EventConfig): number | null {
  const lo0 = expectedNetAt(config, 0);
  const hi0 = expectedNetAt(config, 1);
  if (lo0 > 0 || hi0 < 0) return null;

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (expectedNetAt(config, mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
