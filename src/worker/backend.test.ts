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
import { simulate } from "../lib/simulate";
import { SimulationBackend } from "./backend";
import { isAbortError } from "./protocol";
import type { BankrollsRequest, SimulateRequest } from "./protocol";

const config = defaultConfig();

const sim = (trials: number, seed = 1): SimulateRequest => ({
  kind: "simulate",
  config,
  trials,
  seed,
});

const bank = (runs: number, seed = 1): BankrollsRequest => ({
  kind: "bankrolls",
  config,
  bankroll: { startingGems: 3000, startingGold: 0, maxEvents: 20 },
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
    await expect(backend.run("a", sim(2000, 7))).resolves.toEqual(simulate(config, 2000, 7));
    await expect(backend.run("b", bank(200, 7))).resolves.toEqual(
      simulateBankrolls(config, { startingGems: 3000, startingGold: 0, maxEvents: 20 }, 200, 7),
    );
  });

  it("stops a canceled run at the next chunk boundary, then serves again", async () => {
    const { backend, pings } = testBackend((n, b) => {
      if (n === 2) b.cancel("a");
    });
    await expect(backend.run("a", sim(5000))).rejects.toSatisfy(isAbortError);
    expect(pings()).toBe(2);
    // The worker stays warm and healthy after a cancellation.
    await expect(backend.run("b", sim(1000, 2))).resolves.toEqual(simulate(config, 1000, 2));
  });

  it("ignores a cancel for an unknown or finished id", async () => {
    const { backend } = testBackend();
    backend.cancel("never-submitted");
    await expect(backend.run("a", sim(1000))).resolves.toEqual(simulate(config, 1000));
    backend.cancel("a");
    await expect(backend.run("b", sim(1000, 2))).resolves.toEqual(simulate(config, 1000, 2));
  });

  it("rejects a model error and stays healthy", async () => {
    const { backend } = testBackend();
    // Keys fine, model not: an elimination event to zero wins or losses has
    // no records, and the trial loop throws on its first step.
    await expect(
      backend.run("a", {
        kind: "simulate",
        config: { ...config, structure: { kind: "elimination", maxWins: 0, maxLosses: 0 } },
        trials: 1000,
        seed: 1,
      }),
    ).rejects.toThrow();
    await expect(backend.run("b", sim(1000))).resolves.toEqual(simulate(config, 1000));
  });

  it("rejects a second concurrent run instead of interleaving it", async () => {
    const { backend } = testBackend();
    const first = backend.run("a", sim(3000));
    await expect(backend.run("b", sim(1000))).rejects.toThrow(/already running/);
    // The dispatcher bug is reported without harming the job in flight.
    await expect(first).resolves.toEqual(simulate(config, 3000));
  });
});
