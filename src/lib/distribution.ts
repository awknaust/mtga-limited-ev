/** Closed-form outcome distributions, used to check the simulation. */

import type { EventStructure } from "./types";

function logFactorial(n: number): number {
  let acc = 0;
  for (let i = 2; i <= n; i++) acc += Math.log(i);
  return acc;
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return Math.round(Math.exp(logFactorial(n) - logFactorial(k) - logFactorial(n - k)));
}

/**
 * Exact probability of finishing with each win count, index 0..maxPossibleWins.
 *
 * `p` is the per-round (match) win rate, not the per-game rate.
 *
 * Fixed-rounds events are plain binomial. Elimination events end on the
 * deciding round, so:
 *  - finishing with k < maxWins wins means the last round was the final loss:
 *    the preceding k + (maxLosses-1) rounds contain exactly k wins.
 *  - finishing with maxWins wins means the last round was the final win, with
 *    l = 0..maxLosses-1 losses scattered through the preceding rounds.
 */
export function exactDistribution(p: number, structure: EventStructure): number[] {
  const q = 1 - p;

  if (structure.kind === "rounds") {
    const n = structure.rounds;
    return Array.from(
      { length: n + 1 },
      (_, k) => choose(n, k) * Math.pow(p, k) * Math.pow(q, n - k),
    );
  }

  const { maxWins, maxLosses } = structure;
  const dist = new Array<number>(maxWins + 1).fill(0);

  for (let k = 0; k < maxWins; k++) {
    dist[k] = choose(k + maxLosses - 1, k) * Math.pow(p, k) * Math.pow(q, maxLosses);
  }

  let top = 0;
  for (let l = 0; l < maxLosses; l++) {
    top += choose(maxWins + l - 1, l) * Math.pow(p, maxWins) * Math.pow(q, l);
  }
  dist[maxWins] = top;

  return dist;
}
