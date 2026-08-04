/**
 * The model layer: everything needed to price an Arena limited event, and
 * nothing that knows the UI exists.
 *
 *   types.ts         domain types
 *   structure.ts     event shape helpers, BO3 conversion, payout resizing
 *   payouts.ts       win count → gems
 *   currency.ts      the rewards paid in counts, and their distributions
 *   distribution.ts  closed-form outcome distributions
 *   rng.ts           seeded PRNG
 *   simulate.ts      Monte Carlo run, expected value, break-even
 *   bankroll.ts      how far a starting balance goes
 *   presets.ts       named events, loaded from src/data/presets
 */

export * from "./types";
export * from "./structure";
export * from "./payouts";
export * from "./currency";
export * from "./distribution";
export * from "./rng";
export * from "./simulate";
export * from "./bankroll";
export * from "./presets";
