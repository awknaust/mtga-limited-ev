/** Helpers for reasoning about an event's shape and win-rate conversion. */

import type {
  EventConfig,
  EventStructure,
  OutcomeRecord,
  PayoutTier,
} from "./types";

/** Highest win count reachable, i.e. the last row of the payout table. */
export function maxPossibleWins(structure: EventStructure): number {
  return structure.kind === "rounds" ? structure.rounds : structure.maxWins;
}

/**
 * Every record the structure can finish on, ordered by wins ascending and then
 * by losses ascending.
 *
 * One place decides that order, because three others depend on it: the exact
 * distribution and the simulation both return rows in it, and the chart draws
 * them top to bottom in it.
 *
 * A `rounds` event has one record per win count. An elimination event has one
 * per win count below the ceiling — reaching `k < maxWins` wins means being
 * eliminated, so the losses are pinned at `maxLosses` — and then `maxLosses` of
 * them at the ceiling itself, one for each number of losses a completed run can
 * have picked up on the way.
 */
export function possibleRecords(structure: EventStructure): OutcomeRecord[] {
  if (structure.kind === "rounds") {
    return Array.from({ length: structure.rounds + 1 }, (_, wins) => ({
      wins,
      losses: structure.rounds - wins,
    }));
  }

  const { maxWins, maxLosses } = structure;
  return [
    ...Array.from({ length: maxWins }, (_, wins) => ({ wins, losses: maxLosses })),
    ...Array.from({ length: maxLosses }, (_, losses) => ({ wins: maxWins, losses })),
  ];
}

/** Most rounds that can be played before the event necessarily ends. */
export function maxRounds(structure: EventStructure): number {
  return structure.kind === "rounds"
    ? structure.rounds
    : structure.maxWins + structure.maxLosses - 1;
}

/**
 * Per-round win probability, which is what the model runs on.
 *
 * A round is a match in every event here — a single game in best-of-one, up to
 * three in best-of-three — and the configured rate is the chance of taking one.
 * So this is `config.winRate`, and the indirection is kept only because three
 * modules read better saying what the number means than restating the field.
 *
 * It used to convert. The rate was stored per *game* and best-of-three configs
 * were run through p²(3 − 2p) to get a match rate, on the reasoning that
 * best-of-three amplifies an edge: 55% of games is 57.5% of matches. Two things
 * were wrong with that. The slider already asked for a match rate, so the value
 * was inverted to a game rate on the way in and converted straight back on the
 * way out — a round trip that computed nothing. And the formula assumes the
 * games in a match are independent draws at one rate, which sideboarding
 * breaks: games two and three are not the game that preceded them.
 *
 * Best-of-three does still favour the better player. That is now the player's
 * observation to make when they set the number, rather than something the model
 * applies on their behalf to a figure they entered as a match rate.
 */
export function matchWinRate(config: EventConfig): number {
  return config.winRate;
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
