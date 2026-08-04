/** Monte Carlo simulation and the expected-value figures derived from it. */

import { exactDistribution } from "./distribution";
import { goldPerEvent, grossValue, netValue, payoutFor } from "./payouts";
import { seededRandom } from "./rng";
import { bo3WinRate, matchWinRate, maxPossibleWins } from "./structure";
import type {
  EventConfig,
  EventStructure,
  SimResult,
  WinBucket,
} from "./types";

/**
 * Play one event. `pMatch` is the per-round win probability — already converted
 * from the game win rate for BO3.
 */
export function simulateEvent(
  structure: EventStructure,
  pMatch: number,
  rand: () => number,
): { wins: number; rounds: number } {
  if (structure.kind === "rounds") {
    let wins = 0;
    for (let i = 0; i < structure.rounds; i++) {
      if (rand() < pMatch) wins++;
    }
    return { wins, rounds: structure.rounds };
  }

  let wins = 0;
  let losses = 0;
  let rounds = 0;
  while (wins < structure.maxWins && losses < structure.maxLosses) {
    rounds++;
    if (rand() < pMatch) wins++;
    else losses++;
  }
  return { wins, rounds };
}

export function simulate(config: EventConfig, trials: number, seed = 1): SimResult {
  const rand = seededRandom(seed);
  const pMatch = matchWinRate(config);
  const topWins = maxPossibleWins(config.structure);
  const counts = new Array<number>(topWins + 1).fill(0);
  let totalRounds = 0;

  /*
   * Gold is a running balance, not a per-event discount: it accrues whether or
   * not it is spent, and an entry is free only once enough has piled up. That
   * makes the sequence path-dependent, so the events are played in order and
   * the balance carries between them. Starting from nothing understates the
   * first few entries, which washes out over any realistic trial count.
   */
  let gold = 0;
  let goldEntries = 0;
  const takesGold = config.entryCostGold > 0;
  const goldEarned = goldPerEvent(config);

  for (let i = 0; i < trials; i++) {
    gold += goldEarned;
    if (takesGold && gold >= config.entryCostGold) {
      gold -= config.entryCostGold;
      goldEntries++;
    }
    const { wins, rounds } = simulateEvent(config.structure, pMatch, rand);
    counts[wins]++;
    totalRounds += rounds;
  }

  const goldEntryFraction = trials > 0 ? goldEntries / trials : 0;
  const meanEntryGems = config.entryCostGems * (1 - goldEntryFraction);

  const exact = exactDistribution(pMatch, config.structure);

  const buckets: WinBucket[] = counts.map((count, wins) => {
    const tier = payoutFor(config, wins);
    return {
      wins,
      count,
      probability: trials > 0 ? count / trials : 0,
      exactProbability: exact[wins] ?? 0,
      grossGems: grossValue(config, wins),
      netGems: netValue(config, wins),
      packs: tier.packs,
      playInPoints: tier.playInPoints ?? 0,
      playBoxes: tier.playBoxes ?? 0,
      collectorBoxes: tier.collectorBoxes ?? 0,
    };
  });

  /*
   * Net result is a deterministic function of the win count, so the sample
   * mean and variance follow exactly from the bucket frequencies. Summing over
   * a handful of buckets avoids both a per-trial array and the sum-of-squares
   * shortcut, which loses precision to cancellation when the mean is large
   * relative to the spread.
   */
  const meanNet = buckets.reduce((acc, b) => acc + b.probability * b.netGems, 0);
  const variance = buckets.reduce(
    (acc, b) => acc + b.probability * (b.netGems - meanNet) ** 2,
    0,
  );
  const stdDevNet = Math.sqrt(Math.max(0, variance));
  const sumNet = meanNet * trials;
  const probProfit = buckets.reduce(
    (acc, b) => acc + (b.netGems > 0 ? b.probability : 0),
    0,
  );

  const exactMeanNet = exact.reduce(
    (acc, pr, wins) => acc + pr * netValue(config, wins),
    0,
  );

  const meanGross = buckets.reduce((acc, b) => acc + b.probability * b.grossGems, 0);
  const meanPacks = buckets.reduce((acc, b) => acc + b.probability * b.packs, 0);

  return {
    trials,
    buckets,
    meanNet,
    exactMeanNet,
    meanGross,
    meanPacks,
    meanRounds: trials > 0 ? totalRounds / trials : 0,
    stdDevNet,
    stdErrNet: trials > 0 ? stdDevNet / Math.sqrt(trials) : 0,
    probProfit,
    roi: meanEntryGems > 0 ? meanNet / meanEntryGems : 0,
    totalNet: sumNet,
    goldEntryFraction,
    meanEntryGems,
    percentiles: netPercentiles(buckets),
  };
}

/**
 * Percentiles of the per-event net result, read off the (discrete) outcome
 * distribution sorted by net value.
 */
function netPercentiles(buckets: WinBucket[]): SimResult["percentiles"] {
  const sorted = [...buckets].sort((a, b) => a.netGems - b.netGems);
  const at = (target: number): number => {
    let cum = 0;
    for (const b of sorted) {
      cum += b.probability;
      if (cum >= target) return b.netGems;
    }
    return sorted.length ? sorted[sorted.length - 1].netGems : 0;
  };
  return { p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95) };
}

/** Expected net gems per event at a given per-game win rate, closed form. */
export function expectedNetAt(config: EventConfig, winRate: number): number {
  const pMatch = config.format === "bo3" ? bo3WinRate(winRate) : winRate;
  const dist = exactDistribution(pMatch, config.structure);
  return dist.reduce((acc, p, wins) => acc + p * netValue(config, wins), 0);
}

/**
 * Per-game win rate at which the event breaks even, or null if it never does
 * within [0, 1]. Bisection — expected value is monotonic in win rate for any
 * sane (non-decreasing) payout table.
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
