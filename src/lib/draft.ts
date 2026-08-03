/**
 * Core model for an MTG Arena limited event.
 *
 * Event structure (BO1 / Premier Draft rules): you keep playing single games
 * until you reach `maxWins` wins or `maxLosses` losses, whichever comes first.
 * Each game is an independent Bernoulli trial with probability `winRate`.
 */

export type PayoutTier = {
  /** Number of match wins this tier pays out for. */
  wins: number;
  gems: number;
  packs: number;
};

export type EventConfig = {
  /** Per-game win probability, 0..1. */
  winRate: number;
  /** Entry cost in gems. */
  entryCostGems: number;
  /** Gem value assigned to one booster pack (0 = packs counted but valued at nothing). */
  packValueGems: number;
  /** Payout table, one entry per possible win count (0..maxWins). */
  payouts: PayoutTier[];
  maxWins: number;
  maxLosses: number;
};

export type EventPreset = {
  name: string;
  entryCostGems: number;
  maxWins: number;
  maxLosses: number;
  payouts: PayoutTier[];
};

/**
 * Payout ladder shared by Premier Draft and Arena Cube Draft.
 *
 * Kept as one array so the two presets can't drift apart by accident — Cube
 * runs on the Premier structure.
 */
const PREMIER_PAYOUTS: PayoutTier[] = [
  { wins: 0, gems: 50, packs: 1 },
  { wins: 1, gems: 100, packs: 1 },
  { wins: 2, gems: 250, packs: 2 },
  { wins: 3, gems: 1000, packs: 2 },
  { wins: 4, gems: 1400, packs: 3 },
  { wins: 5, gems: 1600, packs: 4 },
  { wins: 6, gems: 1800, packs: 5 },
  { wins: 7, gems: 2200, packs: 6 },
];

/** Arena Premier Draft (BO1): play to 7 wins or 3 losses. */
export const PREMIER_DRAFT: EventPreset = {
  name: "Premier Draft",
  entryCostGems: 1500,
  maxWins: 7,
  maxLosses: 3,
  payouts: PREMIER_PAYOUTS,
};

/** Arena Cube Draft (BO1): same structure and payouts as Premier Draft. */
export const CUBE_DRAFT: EventPreset = {
  name: "Cube Draft",
  entryCostGems: 1500,
  maxWins: 7,
  maxLosses: 3,
  payouts: PREMIER_PAYOUTS,
};

/** Arena Quick Draft (BO1, vs. bots): play to 7 wins or 3 losses. */
export const QUICK_DRAFT: EventPreset = {
  name: "Quick Draft",
  entryCostGems: 750,
  maxWins: 7,
  maxLosses: 3,
  payouts: [
    { wins: 0, gems: 50, packs: 1 },
    { wins: 1, gems: 100, packs: 1 },
    { wins: 2, gems: 200, packs: 1 },
    { wins: 3, gems: 300, packs: 1 },
    { wins: 4, gems: 450, packs: 1 },
    { wins: 5, gems: 650, packs: 1 },
    { wins: 6, gems: 850, packs: 1 },
    { wins: 7, gems: 950, packs: 2 },
  ],
};

export const PRESETS: EventPreset[] = [PREMIER_DRAFT, QUICK_DRAFT, CUBE_DRAFT];

/** Selector value for a hand-edited schedule that matches no preset. */
export const CUSTOM_PRESET = "Custom";

/** Config built from a preset, leaving win rate and pack value untouched. */
export function configFromPreset(preset: EventPreset, base: EventConfig): EventConfig {
  return {
    ...base,
    entryCostGems: preset.entryCostGems,
    maxWins: preset.maxWins,
    maxLosses: preset.maxLosses,
    payouts: preset.payouts.map((t) => ({ ...t })),
  };
}

/**
 * Whether a config still matches a preset's entry cost and payout schedule.
 *
 * Premier and Cube are structurally identical, so this can't be used to *derive*
 * which preset is selected — only to check whether an edit has moved the config
 * off the one the user picked.
 */
export function matchesPreset(config: EventConfig, presetName: string): boolean {
  const p = PRESETS.find((x) => x.name === presetName);
  if (!p) return false;
  return (
    p.entryCostGems === config.entryCostGems &&
    p.maxWins === config.maxWins &&
    p.maxLosses === config.maxLosses &&
    p.payouts.length === config.payouts.length &&
    p.payouts.every((t, i) => {
      const c = config.payouts[i];
      return c && c.wins === t.wins && c.gems === t.gems && c.packs === t.packs;
    })
  );
}

export function defaultConfig(): EventConfig {
  return configFromPreset(PREMIER_DRAFT, {
    winRate: 0.55,
    packValueGems: 0,
  } as EventConfig);
}

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

/** Small deterministic PRNG so a given seed reproduces a given run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Exact distribution
// ---------------------------------------------------------------------------

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
 * Exact probability of finishing the event with each win count, index 0..maxWins.
 *
 * The run ends on the deciding game, so:
 *  - Finishing with k < maxWins wins means the last game was the final loss:
 *    the preceding k + (maxLosses-1) games contain exactly k wins.
 *  - Finishing with maxWins wins means the last game was the final win, with
 *    l = 0..maxLosses-1 losses scattered through the preceding games.
 */
export function exactDistribution(
  winRate: number,
  maxWins: number,
  maxLosses: number,
): number[] {
  const p = winRate;
  const q = 1 - p;
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

// ---------------------------------------------------------------------------
// Payout helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export type WinBucket = {
  wins: number;
  count: number;
  /** Empirical frequency from the simulation. */
  probability: number;
  /** Closed-form probability, for comparison. */
  exactProbability: number;
  grossGems: number;
  netGems: number;
  packs: number;
};

export type SimResult = {
  trials: number;
  buckets: WinBucket[];
  /** Mean net gems per event (simulated). */
  meanNet: number;
  /** Mean net gems per event (closed form). */
  exactMeanNet: number;
  meanGross: number;
  meanPacks: number;
  meanGames: number;
  /** Standard deviation of net gems across events. */
  stdDevNet: number;
  /** Standard error of meanNet. */
  stdErrNet: number;
  /** Fraction of events with a positive net result. */
  probProfit: number;
  /** Mean net / entry cost. */
  roi: number;
  /** Total net gems across all simulated events. */
  totalNet: number;
  /** Net gems, sorted — used for percentiles of the running bankroll. */
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
};

export function simulateEvent(
  config: EventConfig,
  rand: () => number,
): { wins: number; games: number } {
  let wins = 0;
  let losses = 0;
  let games = 0;
  while (wins < config.maxWins && losses < config.maxLosses) {
    games++;
    if (rand() < config.winRate) wins++;
    else losses++;
  }
  return { wins, games };
}

export function simulate(config: EventConfig, trials: number, seed = 1): SimResult {
  const rand = mulberry32(seed);
  const counts = new Array<number>(config.maxWins + 1).fill(0);
  let totalGames = 0;
  let sumNet = 0;
  let sumSqNet = 0;
  let profitable = 0;

  for (let i = 0; i < trials; i++) {
    const { wins, games } = simulateEvent(config, rand);
    counts[wins]++;
    totalGames += games;
    const net = netValue(config, wins);
    sumNet += net;
    sumSqNet += net * net;
    if (net > 0) profitable++;
  }

  const exact = exactDistribution(config.winRate, config.maxWins, config.maxLosses);

  const buckets: WinBucket[] = counts.map((count, wins) => {
    const tier = payoutFor(config, wins);
    return {
      wins,
      count,
      probability: trials > 0 ? count / trials : 0,
      exactProbability: exact[wins],
      grossGems: grossValue(config, wins),
      netGems: netValue(config, wins),
      packs: tier.packs,
    };
  });

  const meanNet = trials > 0 ? sumNet / trials : 0;
  const variance = trials > 1 ? sumSqNet / trials - meanNet * meanNet : 0;
  const stdDevNet = Math.sqrt(Math.max(0, variance));

  const exactMeanNet = exact.reduce((acc, pr, wins) => acc + pr * netValue(config, wins), 0);

  const meanGross = buckets.reduce((acc, b) => acc + b.probability * b.grossGems, 0);
  const meanPacks = buckets.reduce((acc, b) => acc + b.probability * b.packs, 0);

  return {
    trials,
    buckets,
    meanNet,
    exactMeanNet,
    meanGross,
    meanPacks,
    meanGames: trials > 0 ? totalGames / trials : 0,
    stdDevNet,
    stdErrNet: trials > 0 ? stdDevNet / Math.sqrt(trials) : 0,
    probProfit: trials > 0 ? profitable / trials : 0,
    roi: config.entryCostGems > 0 ? meanNet / config.entryCostGems : 0,
    totalNet: sumNet,
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

/** Expected net gems per event at a given win rate, closed form. */
export function expectedNetAt(config: EventConfig, winRate: number): number {
  const dist = exactDistribution(winRate, config.maxWins, config.maxLosses);
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
