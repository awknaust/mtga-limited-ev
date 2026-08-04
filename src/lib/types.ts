/**
 * Domain types for an MTG Arena limited event.
 *
 * Two event shapes are supported:
 *
 *  - `elimination` — keep playing until `maxWins` wins or `maxLosses` losses,
 *    whichever lands first (Premier, Quick, Cube, Pick Two).
 *  - `rounds` — play a fixed number of rounds regardless of record, with no
 *    early exit (Traditional Draft).
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

/** A named event definition, as stored in src/data/presets. */
export type EventPreset = {
  name: string;
  entryCostGems: number;
  format: EventFormat;
  structure: EventStructure;
  payouts: PayoutTier[];
};

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
