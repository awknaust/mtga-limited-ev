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
  /**
   * Play-in points toward an Arena Open. Only the traditional events award
   * them, so this is optional and absent means none.
   */
  playInPoints?: number;
  /** Physical Play Booster boxes, shipped after the event. Arena Direct only. */
  playBoxes?: number;
  /** Physical Collector Booster boxes. */
  collectorBoxes?: number;
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
  /** Gold price, where the event takes gold. Absent means gems only. */
  entryCostGold?: number;
  /**
   * Packs' worth of cards you keep from the pool you played with. Zero for
   * phantom events, where the cards are borrowed for the event only.
   */
  draftPacks?: number;
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
  /** Gold price, or 0 where the event takes gems only. */
  entryCostGold: number;
  /**
   * Gold earned in a day from everything *except* this event's own wins —
   * quests, and games played outside it.
   *
   * A daily quest by default, so this is the day's *budget* toward entries
   * rather than what the entry itself earned back. Set it to 0 for the
   * stricter reading, where an event is credited only the gold its own wins
   * generate.
   *
   * Divided across `eventsPerDay`, since it does not repeat per event.
   */
  otherGoldPerDay: number;
  /**
   * Events played per day.
   *
   * Sets how far the day's wins get through the daily-win ladder before it
   * caps at fifteen, so playing more earns more in total but less per event.
   * Zero credits no gold at all, which is how you price an event in gems
   * alone.
   */
  eventsPerDay: number;
  /** Gold worth one gem, for valuing a leftover balance. */
  goldPerGem: number;
  /** Packs' worth of cards kept per entry; 0 for phantom events. */
  draftPacks: number;
  /** Gem value of one pack's worth of drafted cards. */
  draftPackValueGems: number;
  /** Gem value assigned to one booster pack (0 = packs counted but valued at nothing). */
  packValueGems: number;
  /** Gem value assigned to one play-in point. */
  playInPointValueGems: number;
  /** Gem value assigned to one physical Play Booster box. */
  playBoxValueGems: number;
  /** Gem value assigned to one physical Collector Booster box. */
  collectorBoxValueGems: number;
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
  playInPoints: number;
  playBoxes: number;
  collectorBoxes: number;
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
  /** Share of entries the simulated gold balance covered. */
  goldEntryFraction: number;
  /** Mean gems actually paid to enter, after gold-funded entries. */
  meanEntryGems: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
};
