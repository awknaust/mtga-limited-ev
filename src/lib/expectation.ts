/**
 * What one entry to an event is worth, in closed form.
 *
 * A single event's outcome is a named distribution — binomial in the rounds
 * for a fixed-rounds event, negative binomial in the losses for an
 * elimination one — and every figure the Per event tab shows is a sum over
 * that PMF and the payout table: expected net, gross, boxes, matches, the
 * chance of a profit, and the outcome table itself. Nothing here rolls a die.
 *
 * The bankroll is the one thing that does. A run is a stopped random walk
 * whose length has no PMF in a library, so `bankroll.ts` simulates it, and
 * `simulateEvent` there is the only place an event is ever played out by
 * chance. The per-event Monte Carlo that used to sit beside these figures
 * answered, to two decimal places at a hundred thousand trials, the question
 * these answer exactly, and carried a trial count and a sampling error that
 * said nothing about the event.
 */

import { exactDistribution, exactRecordDistribution } from "./distribution";
import {
  effectiveEntryGems,
  goldFundedFraction,
  grossValue,
  netValue,
  payoutFor,
} from "./payouts";
import { matchWinRate } from "./structure";
import type { EventConfig, RecordProbability } from "./types";

/** One row of the outcome table: a win count, how likely it is, what it pays. */
export type WinOutcome = {
  wins: number;
  probability: number;
  grossGems: number;
  netGems: number;
  packs: number;
  playInPoints: number;
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
  /** Expected net gems per event, after the effective entry. */
  meanNet: number;
  /** Expected gross gems per event: everything an entry brings back. */
  meanGross: number;
  /** Mean boxes per event, both kinds together; a double-box finish counts as two. */
  meanBoxes: number;
  /** Mean matches played per event. */
  meanRounds: number;
  /** Chance one event ends net positive. */
  probProfit: number;
  /** Mean net over the gems actually paid to enter. */
  roi: number;
  /** Long-run share of entries gold covers. */
  goldEntryFraction: number;
  /** Gems paid per entry on average, once gold has covered its share. */
  entryGems: number;
};

/**
 * Everything the Per event tab shows, from the exact outcome distribution.
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
      playInPoints: tier.playInPoints ?? 0,
      boxes: tier.boxes?.length ?? 0,
    };
  });

  const mean = (of: (o: WinOutcome) => number): number =>
    outcomes.reduce((acc, o) => acc + o.probability * of(o), 0);

  /*
   * Matches are read off the records rather than the win counts, because a
   * win count does not fix them: 7-0 and 7-2 are one row of the outcome table
   * and seven or nine matches. Every record's length is its wins plus its
   * losses, so the mean is one weighted sum. A fixed-rounds event comes out at
   * exactly its round count, every record summing to it.
   */
  const records = exactRecordDistribution(pMatch, config.structure);
  const meanRounds = records.reduce(
    (acc, r) => acc + r.probability * (r.wins + r.losses),
    0,
  );

  const meanNet = mean((o) => o.netGems);
  const entryGems = effectiveEntryGems(config);

  return {
    outcomes,
    records,
    meanNet,
    meanGross: mean((o) => o.grossGems),
    meanBoxes: mean((o) => o.boxes),
    meanRounds,
    probProfit: mean((o) => (o.netGems > 0 ? 1 : 0)),
    roi: entryGems > 0 ? meanNet / entryGems : 0,
    goldEntryFraction: goldFundedFraction(config),
    entryGems,
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
 * distribution. Gold comes off the daily-win ladder now, so it moves with the
 * win rate too — sweeping the curve without carrying the rate through would
 * price every point on it at the gold the *configured* rate happens to earn.
 */
export function expectedNetAt(config: EventConfig, winRate: number): number {
  return expectedNet({ ...config, winRate });
}

/**
 * Chance that a single event pays at least one box, at a given win rate.
 *
 * A win count either pays a box or it does not, so the answer is the weight
 * the distribution puts on the counts that do. It is the share under the
 * "Expected boxes" tile, and it is also what holds the bankroll simulation to
 * account: a run of one event has to agree with it, and that is a check the
 * simulation cannot perform on itself.
 */
export function boxChancePerEvent(config: EventConfig, p = matchWinRate(config)): number {
  const dist = exactDistribution(p, config.structure);
  return config.payouts.reduce(
    (acc, t) => (t.boxes?.length ? acc + (dist[t.wins] ?? 0) : acc),
    0,
  );
}

/**
 * Match win rate at which the event breaks even, or null if it never does
 * within [0, 1]. Bisection — expected value is monotonic in win rate for any
 * sane (non-decreasing) payout table.
 *
 * Gold moving with the win rate does not threaten that: winning more climbs
 * the daily ladder, which lowers the effective entry, which raises net. Both
 * terms push the same way, so the function stays monotonic and the bisection
 * stays well founded.
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
