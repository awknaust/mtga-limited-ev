/**
 * Closed-form outcome distributions: what one event's win count and finishing
 * record are, exactly, at a given match win rate. Everything the Per event
 * tab shows is a sum over one of these; the bankroll simulation is held to
 * them in its tests.
 */

import binomialPMF from "@stdlib/stats-base-dists-binomial-pmf";
import negativeBinomialPMF from "@stdlib/stats-base-dists-negative-binomial-pmf";

import { possibleRecords } from "./structure";
import type { EventStructure, RecordProbability } from "./types";

/**
 * Exact probability of finishing with each win count, index 0..maxPossibleWins.
 *
 * `p` is the per-round win rate, and a round is a match.
 *
 * Both shapes are standard distributions rather than anything bespoke:
 *
 * **Fixed rounds** — every round is played, so the win count is binomial in
 * the number of rounds.
 *
 * **Elimination** — the run ends on the deciding round. Finishing below the
 * ceiling means busting out, which is the negative binomial: the wins are the
 * failures accumulated before the `maxLosses`-th loss. stdlib parameterises it
 * as `pmf(x, r, p)` = x failures before the r-th success, so "success" here is
 * a *loss* and its probability is `1 - p`. Reaching the ceiling is whatever
 * probability is left over, which avoids a second summation and guarantees the
 * distribution sums to exactly 1.
 */
export function exactDistribution(p: number, structure: EventStructure): number[] {
  if (structure.kind === "rounds") {
    const n = structure.rounds;
    return Array.from({ length: n + 1 }, (_, k) => binomialPMF(k, n, p));
  }

  const { maxWins, maxLosses } = structure;
  const dist = new Array<number>(maxWins + 1).fill(0);

  /*
   * A certain win rate makes the run deterministic, and those endpoints sit
   * outside the negative binomial's support — stdlib returns 0 for a loss
   * probability of 1 and NaN for 0, neither of which is the answer.
   */
  if (p <= 0) {
    dist[0] = 1;
    return dist;
  }
  if (p >= 1) {
    dist[maxWins] = 1;
    return dist;
  }

  let busted = 0;
  for (let k = 0; k < maxWins; k++) {
    dist[k] = negativeBinomialPMF(k, maxLosses, 1 - p);
    busted += dist[k];
  }
  dist[maxWins] = 1 - busted;

  return dist;
}

/**
 * Exact probability of each finishing *record*, in `possibleRecords` order.
 *
 * Grouping these by win count gives `exactDistribution` back. The split only
 * bites at the top of an elimination ladder, where one win count covers several
 * records, and the two shapes there are the same distribution with the roles
 * swapped:
 *
 * **Eliminated** — `k < maxWins` wins accumulated before the `maxLosses`-th
 * loss, which is the negative binomial on losses, exactly as above.
 *
 * **Ceiling** — `l` losses accumulated before the `maxWins`-th win, which is
 * the same distribution counting the other side: `pmf(l, maxWins, p)`. Written
 * out, a 7-2 finish is `C(8, 2) · p⁷ · (1 − p)²` — the deciding win is fixed at
 * the end, so the two losses fall anywhere among the eight rounds before it.
 *
 * Each ceiling row is its own closed form here, rather than the leftover
 * `1 − busted` that `exactDistribution` hands the top bucket. The two therefore
 * agree to floating point rather than to the bit, which the tests pin.
 */
export function exactRecordDistribution(
  p: number,
  structure: EventStructure,
): RecordProbability[] {
  const records = possibleRecords(structure);

  if (structure.kind === "rounds") {
    const n = structure.rounds;
    return records.map((r) => ({ ...r, probability: binomialPMF(r.wins, n, p) }));
  }

  const { maxWins, maxLosses } = structure;

  /* The same deterministic endpoints as above: one record takes everything. */
  if (p <= 0 || p >= 1) {
    const certain = p <= 0 ? { wins: 0, losses: maxLosses } : { wins: maxWins, losses: 0 };
    return records.map((r) => ({
      ...r,
      probability: r.wins === certain.wins && r.losses === certain.losses ? 1 : 0,
    }));
  }

  return records.map((r) => ({
    ...r,
    probability:
      r.wins < maxWins
        ? negativeBinomialPMF(r.wins, maxLosses, 1 - p)
        : negativeBinomialPMF(r.losses, maxWins, p),
  }));
}
