/**
 * The one-job executor in node, with its pacing made observable:
 * `yieldToEvents` is a counted macrotask — a real `setTimeout`, because
 * cancellation rides on messages being processed between chunks and a
 * microtask would let nothing through — and `pingIntervalMs: 0` pings at
 * every chunk boundary, so what happens at a boundary is deterministic
 * instead of racing a clock. Queueing, caching and dedupe are the client
 * pool's business and are tested there.
 */

import { describe, expect, it } from "vitest";

import { simulateBankrolls } from "../lib/bankroll";
import { defaultConfig } from "../lib/presets";
import type { PayoutTier } from "../lib/types";
import { SimulationBackend } from "./backend";
import { isAbortError } from "./protocol";
import type { BankrollsRequest } from "./protocol";

const config = defaultConfig();
const roll = { startingGems: 3000, startingGold: 0, startingPlayInPoints: 0, maxEvents: 20 };

const bank = (runs: number, seed = 1): BankrollsRequest => ({
  kind: "bankrolls",
  config,
  bankroll: roll,
  runs,
  seed,
});

/** A backend whose every event-loop touch is counted, and can be hooked. */
function testBackend(onPing?: (pings: number, backend: SimulationBackend) => void) {
  let pings = 0;
  const backend: SimulationBackend = new SimulationBackend({
    pingIntervalMs: 0,
    yieldToEvents: async () => {
      pings++;
      onPing?.(pings, backend);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    },
  });
  return { backend, pings: () => pings };
}

describe("SimulationBackend", () => {
  it("resolves to exactly what the model computes", async () => {
    const { backend } = testBackend();
    await expect(backend.run("a", bank(200, 7))).resolves.toEqual(
      simulateBankrolls(config, roll, 200, 7),
    );
  });

  it("stops a canceled run at the next chunk boundary, then serves again", async () => {
    const { backend, pings } = testBackend((n, b) => {
      if (n === 2) b.cancel("a");
    });
    // Enough runs to cross several chunk boundaries before it could finish.
    await expect(backend.run("a", bank(5000))).rejects.toSatisfy(isAbortError);
    expect(pings()).toBe(2);
    // The worker stays warm and healthy after a cancellation.
    await expect(backend.run("b", bank(200, 2))).resolves.toEqual(
      simulateBankrolls(config, roll, 200, 2),
    );
  });

  it("ignores a cancel for an unknown or finished id", async () => {
    const { backend } = testBackend();
    backend.cancel("never-submitted");
    await expect(backend.run("a", bank(200))).resolves.toEqual(
      simulateBankrolls(config, roll, 200),
    );
    backend.cancel("a");
    await expect(backend.run("b", bank(200, 2))).resolves.toEqual(
      simulateBankrolls(config, roll, 200, 2),
    );
  });

  it("rejects a model error and stays healthy", async () => {
    const { backend } = testBackend();
    // A ladder that is not a list: the generator throws pricing it, on its
    // first step, before a single run is played.
    await expect(
      backend.run("a", {
        ...bank(200),
        config: { ...config, payouts: null as unknown as PayoutTier[] },
      }),
    ).rejects.toThrow();
    await expect(backend.run("b", bank(200))).resolves.toEqual(
      simulateBankrolls(config, roll, 200),
    );
  });

  it("rejects a second concurrent run instead of interleaving it", async () => {
    const { backend } = testBackend();
    const first = backend.run("a", bank(3000));
    await expect(backend.run("b", bank(200))).rejects.toThrow(/already running/);
    // The dispatcher bug is reported without harming the job in flight.
    await expect(first).resolves.toEqual(simulateBankrolls(config, roll, 3000));
  });
});
