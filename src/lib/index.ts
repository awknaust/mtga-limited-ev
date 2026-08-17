/**
 * The model layer: everything needed to price an Arena limited event, and
 * nothing that knows the UI exists.
 *
 *   types.ts         domain types
 *   structure.ts     event shape helpers, payout resizing
 *   boxes.ts         the boxes a payout names, and what each is worth
 *   payouts.ts       win count → gems
 *   holdings.ts      what a run ends up holding, and what it is worth
 *   distribution.ts  closed-form outcome distributions
 *   rng.ts           seeded PRNG
 *   simulate.ts      Monte Carlo run, expected value, break-even
 *   uncertainty.ts   the win rate as a posterior, not a point
 *   bankroll.ts      how far a starting balance goes
 *   presets.ts       named events, loaded from src/data/presets
 *   boxPrices.ts     the box-price feed, the copy the app ships, and the
 *                    price table read from either
 *   mastery.ts       what a Set Mastery Pass returns against what it costs
 */

export * from "./types";
export * from "./structure";
export * from "./boxes";
export * from "./payouts";
export * from "./holdings";
export * from "./distribution";
export * from "./rng";
export * from "./simulate";
export * from "./uncertainty";
export * from "./bankroll";
export * from "./presets";
export * from "./boxPrices";
export * from "./mastery";
