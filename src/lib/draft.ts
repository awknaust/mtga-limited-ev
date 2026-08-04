/**
 * Core model for an MTG Arena limited event.
 *
 * Two event shapes are supported:
 *
 *  - `elimination` — keep playing until `maxWins` wins or `maxLosses` losses,
 *    whichever lands first (Premier, Quick, Cube).
 *  - `rounds` — play a fixed number of rounds regardless of record, with no
 *    early exit (Traditional Draft).
 *
 * Each round is decided at the *match* level. In a BO1 event a match is a
 * single game, so the match win rate is the game win rate; in a BO3 event the
 * game win rate is converted first (see `matchWinRate`).
 */

export type PayoutTier = {
  /** Number of match wins this tier pays out for. */
  wins: number;
  gems: number;
  packs: number;
};

/** Whether one round is a single game or a best-of-three match. */
export type EventFormat = "bo1" | "bo3";

/** Play until a win or loss threshold is hit. */
export type EliminationStructure = {
  kind: "elimination";
  maxWins: number;
  maxLosses: number;
};

/** Play a fixed number of rounds; record never ends the event early. */
export type RoundsStructure = {
  kind: "rounds";
  rounds: number;
};

export type EventStructure = EliminationStructure | RoundsStructure;

export type EventConfig = {
  /** Per-game win probability, 0..1. Converted to a match rate for BO3. */
  winRate: number;
  format: EventFormat;
  structure: EventStructure;
  /** Entry cost in gems. */
  entryCostGems: number;
  /** Gem value assigned to one booster pack (0 = packs counted but valued at nothing). */
  packValueGems: number;
  /** Payout table, one entry per possible win count (0..maxPossibleWins). */
  payouts: PayoutTier[];
};

export type EventPreset = {
  name: string;
  entryCostGems: number;
  format: EventFormat;
  structure: EventStructure;
  payouts: PayoutTier[];
};

// ---------------------------------------------------------------------------
// Structure helpers
// ---------------------------------------------------------------------------

/** Highest win count reachable, i.e. the last row of the payout table. */
export function maxPossibleWins(structure: EventStructure): number {
  return structure.kind === "rounds" ? structure.rounds : structure.maxWins;
}

/** Most rounds that can be played before the event necessarily ends. */
export function maxRounds(structure: EventStructure): number {
  return structure.kind === "rounds"
    ? structure.rounds
    : structure.maxWins + structure.maxLosses - 1;
}

/**
 * Probability of taking a best-of-three match given a per-game win rate:
 * win 2-0, or win 2-1 in either order.
 */
export function bo3WinRate(gameWinRate: number): number {
  const p = gameWinRate;
  return p * p * (3 - 2 * p);
}

/** Per-round (match) win probability implied by the config. */
export function matchWinRate(config: EventConfig): number {
  return config.format === "bo3" ? bo3WinRate(config.winRate) : config.winRate;
}

/**
 * Grow or shrink a payout table to cover 0..maxWins, preserving rows that
 * already exist so changing the structure doesn't discard entered values.
 */
export function resizePayouts(payouts: PayoutTier[], maxWins: number): PayoutTier[] {
  return Array.from({ length: maxWins + 1 }, (_, wins) => {
    const existing = payouts.find((t) => t.wins === wins);
    return existing ? { ...existing } : { wins, gems: 0, packs: 0 };
  });
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

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

const PREMIER_STRUCTURE: EventStructure = {
  kind: "elimination",
  maxWins: 7,
  maxLosses: 3,
};

/** Premier Draft: 1,500 gems (or 10,000 gold), BO1, to 7 wins or 3 losses. */
export const PREMIER_DRAFT: EventPreset = {
  name: "Premier Draft",
  entryCostGems: 1500,
  format: "bo1",
  structure: PREMIER_STRUCTURE,
  payouts: PREMIER_PAYOUTS,
};

/** Arena Cube Draft: same structure and payouts as Premier Draft. */
export const CUBE_DRAFT: EventPreset = {
  name: "Cube Draft",
  entryCostGems: 1500,
  format: "bo1",
  structure: PREMIER_STRUCTURE,
  payouts: PREMIER_PAYOUTS,
};

/** Quick Draft: 750 gems (or 5,000 gold), BO1, to 7 wins or 3 losses. */
export const QUICK_DRAFT: EventPreset = {
  name: "Quick Draft",
  entryCostGems: 750,
  format: "bo1",
  structure: PREMIER_STRUCTURE,
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

/**
 * Traditional Draft: 1,500 gems (or 10,000 gold), BO3 matches, three rounds
 * played out in full — a 0-2 start still plays round three.
 */
export const TRADITIONAL_DRAFT: EventPreset = {
  name: "Traditional Draft",
  entryCostGems: 1500,
  format: "bo3",
  structure: { kind: "rounds", rounds: 3 },
  payouts: [
    { wins: 0, gems: 0, packs: 1 },
    { wins: 1, gems: 0, packs: 1 },
    { wins: 2, gems: 1000, packs: 4 },
    { wins: 3, gems: 3000, packs: 6 },
  ],
};

/**
 * Pick Two Draft: 900 gems (or 6,000 gold), BO1, to 4 wins or 2 losses.
 *
 * The only preset that is neither 7 wins nor 3 losses, and the reward curve
 * has a step change at the second win rather than climbing evenly.
 */
export const PICK_TWO_DRAFT: EventPreset = {
  name: "Pick Two Draft",
  entryCostGems: 900,
  format: "bo1",
  structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 50, packs: 1 },
    { wins: 1, gems: 150, packs: 1 },
    { wins: 2, gems: 800, packs: 1 },
    { wins: 3, gems: 1000, packs: 2 },
    { wins: 4, gems: 1300, packs: 3 },
  ],
};

export const PRESETS: EventPreset[] = [
  PREMIER_DRAFT,
  QUICK_DRAFT,
  CUBE_DRAFT,
  TRADITIONAL_DRAFT,
  PICK_TWO_DRAFT,
];

/** Selector value for a hand-edited schedule that matches no preset. */
export const CUSTOM_PRESET = "Custom";

/** Config built from a preset, leaving win rate and pack value untouched. */
export function configFromPreset(preset: EventPreset, base: EventConfig): EventConfig {
  return {
    ...base,
    entryCostGems: preset.entryCostGems,
    format: preset.format,
    structure: { ...preset.structure },
    payouts: preset.payouts.map((t) => ({ ...t })),
  };
}

function sameStructure(a: EventStructure, b: EventStructure): boolean {
  if (a.kind === "rounds" && b.kind === "rounds") return a.rounds === b.rounds;
  if (a.kind === "elimination" && b.kind === "elimination") {
    return a.maxWins === b.maxWins && a.maxLosses === b.maxLosses;
  }
  return false;
}

/**
 * Whether a config still matches a preset's entry cost, format, structure and
 * payout schedule.
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
    p.format === config.format &&
    sameStructure(p.structure, config.structure) &&
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
    packValueGems: 22,
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
  /** Mean rounds (matches) played per event. */
  meanRounds: number;
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
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
};

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
  const rand = mulberry32(seed);
  const pMatch = matchWinRate(config);
  const topWins = maxPossibleWins(config.structure);
  const counts = new Array<number>(topWins + 1).fill(0);
  let totalRounds = 0;
  let sumNet = 0;
  let sumSqNet = 0;
  let profitable = 0;

  for (let i = 0; i < trials; i++) {
    const { wins, rounds } = simulateEvent(config.structure, pMatch, rand);
    counts[wins]++;
    totalRounds += rounds;
    const net = netValue(config, wins);
    sumNet += net;
    sumSqNet += net * net;
    if (net > 0) profitable++;
  }

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
    meanRounds: trials > 0 ? totalRounds / trials : 0,
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
