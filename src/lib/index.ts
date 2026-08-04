/**
 * The model layer: everything needed to price an Arena limited event, and
 * nothing that knows the UI exists.
 *
 *   types.ts         domain types
 *   structure.ts     event shape helpers, BO3 conversion, payout resizing
 *   payouts.ts       win count → gems
 *   distribution.ts  closed-form outcome distributions
 *   rng.ts           seeded PRNG
 *   simulate.ts      Monte Carlo run, expected value, break-even
 *   presets.ts       named events, loaded from src/data/presets
 */

export * from "./types";
export * from "./structure";
export * from "./payouts";
export * from "./distribution";
export * from "./rng";
export * from "./simulate";
export * from "./presets";
