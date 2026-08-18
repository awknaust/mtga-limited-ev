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
 *   expectation.ts   what one entry is worth: expected value, break-even, the outcome table
 *   uncertainty.ts   the win rate as a posterior, not a point
 *   bankroll.ts      how far a starting balance goes, simulated
 *   bankrollGrid.ts  the same, asked of several events under one balance
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
export * from "./expectation";
export * from "./uncertainty";
export * from "./bankroll";
export * from "./bankrollGrid";
export * from "./presets";
export * from "./boxPrices";
export * from "./mastery";
