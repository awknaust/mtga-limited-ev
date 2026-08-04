/** Helpers for reasoning about an event's shape and win-rate conversion. */

import type { EventConfig, EventStructure, PayoutTier } from "./types";

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
