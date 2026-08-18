/**
 * One starting balance, played out in several events.
 *
 * The bankroll simulation answers "how far does this balance go" for one
 * event. Asked of several under one balance it answers a different question —
 * which event this much money buys the most of — and that comparison is only
 * honest if the answers are commensurable. Two things make them so, and both
 * are the reason this module exists rather than the caller looping.
 *
 * **One seed for every event.** Common random numbers: each event replays the
 * same stream of draws, so the difference between two rows is the events and
 * not the seed. `bankroll.ts` already shares one stream between the two ends
 * of a prize interval for exactly this reason. It costs nothing — a fresh
 * `seededRandom(seed)` per event is what a loop would do anyway — and it is
 * the whole reason the grid is a function rather than a `map`.
 *
 * **A summary, not a result.** A `BankrollResult` is up to ~4.3 MB, nearly all
 * of it the example runs the Bankroll tab draws. None of that is comparable
 * across events and none of it is wanted here, so each event's result is
 * projected to `BankrollSummary` — a few hundred bytes — and dropped. That is
 * what keeps a sixteen-event grid crossing the worker boundary at all, and
 * what lets its cache hold many more entries than the bankroll's four.
 *
 * Nothing here derives a new figure. Every field is one `simulateBankrolls`
 * already reports, which is what ties this path to the six closed forms
 * `bankroll.validation.test.ts` holds that simulation to: the grid is the same
 * simulation, seeded the same way, with most of the answer thrown away.
 */

import { simulateBankrollsSteps, type BankrollConfig, type BankrollResult } from "./bankroll";
import type { EventConfig } from "./types";

/**
 * What one event's bankroll comes to, in the fields a comparison can use.
 *
 * Deliberately a projection of `BankrollResult` and not a subtype of it: the
 * holdings, the prize chances, the histograms and the example runs are all
 * about one event in isolation, and the tab that shows them is the Bankroll
 * tab. What survives is how long the balance lasted and what it was worth at
 * the end.
 */
export type BankrollSummary = {
  trials: number;
  /** Mean events played before running dry, counting capped runs at the cap. */
  meanEvents: number;
  eventPercentiles: BankrollResult["eventPercentiles"];
  /** Share of runs that hit `maxEvents` rather than running out of currency. */
  survivedFraction: number;
  /** Gems plus the gem value of everything won along the way. */
  meanFinalValue: number;
  /** Median of the same; the figure that answers for a typical run. */
  medianFinalValue: number;
  /** Where a run ends up, in gem-equivalent terms. */
  valuePercentiles: BankrollResult["valuePercentiles"];
};

/**
 * The comparable part of a settled result.
 *
 * Spelled field by field rather than destructured with a rest, so that a field
 * added to `BankrollResult` — another megabyte of samples, say — cannot arrive
 * here by accident. `bankrollGrid.test.ts` pins the key set for the same
 * reason: an extra property on the object is invisible to the compiler once it
 * is assigned to the declared type.
 */
export const bankrollSummary = (r: BankrollResult): BankrollSummary => ({
  trials: r.trials,
  meanEvents: r.meanEvents,
  eventPercentiles: r.eventPercentiles,
  survivedFraction: r.survivedFraction,
  meanFinalValue: r.meanFinalValue,
  medianFinalValue: r.medianFinalValue,
  valuePercentiles: r.valuePercentiles,
});

/**
 * The grid, resumable: one `simulateBankrollsSteps` per config, drained in
 * order, yielding the count of runs finished across the whole grid.
 *
 * Sequential rather than interleaved, because the point of the yields is
 * cancellation and a grid that stops halfway has nothing to show either way.
 * What sequencing buys is that the yields keep coming at the same rate they do
 * for a single event, so a grid of sixteen cancels as promptly as a grid of
 * one — the worker's ~10 ms boundary is measured in chunks, not in events.
 *
 * The result is positional: `summaries[i]` is `configs[i]`, and no name
 * crosses this boundary. Which event a config came from is the caller's
 * business, and the model has never known event names.
 */
export function* simulateBankrollGridSteps(
  configs: readonly EventConfig[],
  bankroll: BankrollConfig,
  trials: number,
  seed = 1,
): Generator<number, BankrollSummary[]> {
  const summaries: BankrollSummary[] = [];
  let finished = 0;
  for (const config of configs) {
    const gen = simulateBankrollsSteps(config, bankroll, trials, seed);
    for (;;) {
      const step = gen.next();
      if (step.done) {
        // The full result is live only until this line; the grid holds
        // summaries, so no event's samples outlast the event.
        summaries.push(bankrollSummary(step.value));
        break;
      }
      yield finished + step.value;
    }
    finished += trials;
  }
  return summaries;
}

/** The grid drained in one go, for the tests and anything synchronous. */
export function simulateBankrollGrid(
  configs: readonly EventConfig[],
  bankroll: BankrollConfig,
  trials: number,
  seed = 1,
): BankrollSummary[] {
  const gen = simulateBankrollGridSteps(configs, bankroll, trials, seed);
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
  }
}
