/** Closed-form outcome distributions, used to check the simulation. */

import binomialPMF from "@stdlib/stats-base-dists-binomial-pmf";
import negativeBinomialPMF from "@stdlib/stats-base-dists-negative-binomial-pmf";

import type { EventStructure } from "./types";

/**
 * Exact probability of finishing with each win count, index 0..maxPossibleWins.
 *
 * `p` is the per-round (match) win rate, not the per-game rate.
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
