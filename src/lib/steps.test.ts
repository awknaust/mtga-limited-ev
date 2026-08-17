/**
 * The resumable generator against its sync drain.
 *
 * `simulateBankrollsSteps` promises that a yield touches no RNG or
 * accumulator state, so a drain in chunks of any size is bit-identical to
 * the sync export. Worker cancellation stands on that contract, and it is
 * exactly what a refactor breaks silently: one reordered draw changes every
 * number downstream while each still looks plausible. Deep equality across
 * chunk sizes is the alarm.
 */

import { describe, expect, it } from "vitest";

import { simulateBankrolls, simulateBankrollsSteps } from "./bankroll";
import { defaultConfig } from "./presets";

/** Run a generator to completion, counting the yields along the way. */
function drain<T>(gen: Generator<number, T>): { value: T; yields: number } {
  let yields = 0;
  for (;;) {
    const r = gen.next();
    if (r.done) return { value: r.value, yields };
    yields++;
  }
}

const CHUNKS = [1, 7, 1000] as const;

describe("simulateBankrollsSteps", () => {
  const config = defaultConfig();
  const bankroll = { startingGems: 3_000, startingGold: 0, startingPlayInPoints: 0, maxEvents: 20 };

  it("drains chunked to the sync result", () => {
    for (const seed of [1, 42]) {
      const sync = simulateBankrolls(config, bankroll, 300, seed);
      for (const chunk of CHUNKS) {
        const { value, yields } = drain(
          simulateBankrollsSteps(config, bankroll, 300, seed, chunk),
        );
        expect(value).toEqual(sync);
        // A generator that never yields would pass the equality vacuously.
        expect(yields).toBeGreaterThan(0);
      }
    }
  });
});
