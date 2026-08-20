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

import { bankrollConfigFor, simulateBankrolls } from "../lib/bankroll";
import { simulateBankrollGrid } from "../lib/bankrollGrid";
import { PRESETS, configFromPreset, defaultConfig } from "../lib/presets";
import type { PayoutTier } from "../lib/types";
import { SimulationBackend } from "./backend";
import { isAbortError } from "./protocol";
import type { BankrollsRequest, CompareRequest } from "./protocol";

const config = defaultConfig();
const roll = { startingGems: 3000, startingGold: 0, startingPlayInPoints: 0, maxGames: 120 };
// What the backend resolves the plan to for this config, so the expected side
// speaks the model's own unit.
const resolved = bankrollConfigFor(config, roll);

const bank = (runs: number, seed = 1): BankrollsRequest => ({
  kind: "bankrolls",
  config,
  bankroll: roll,
  runs,
  seed,
});

/** Three real ladders, so a grid's rows differ from one another. */
const grid3 = PRESETS.slice(0, 3).map((p) => configFromPreset(p, config));

const grid = (runs: number, seed = 1, configs = grid3): CompareRequest => ({
  kind: "compare",
  configs,
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
      simulateBankrolls(config, resolved, 200, 7),
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
      simulateBankrolls(config, resolved, 200, 2),
    );
  });

  it("ignores a cancel for an unknown or finished id", async () => {
    const { backend } = testBackend();
    backend.cancel("never-submitted");
    await expect(backend.run("a", bank(200))).resolves.toEqual(
      simulateBankrolls(config, resolved, 200),
    );
    backend.cancel("a");
    await expect(backend.run("b", bank(200, 2))).resolves.toEqual(
      simulateBankrolls(config, resolved, 200, 2),
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
      simulateBankrolls(config, resolved, 200),
    );
  });

  it("rejects a second concurrent run instead of interleaving it", async () => {
    const { backend } = testBackend();
    const first = backend.run("a", bank(3000));
    await expect(backend.run("b", bank(200))).rejects.toThrow(/already running/);
    // The dispatcher bug is reported without harming the job in flight.
    await expect(first).resolves.toEqual(simulateBankrolls(config, resolved, 3000));
  });

  it("resolves a grid to exactly what the model computes", async () => {
    const { backend } = testBackend();
    await expect(backend.run("a", grid(200, 7))).resolves.toEqual(
      simulateBankrollGrid(grid3, roll, 200, 7),
    );
  });

  /*
   * The reason the grid is one job rather than three: a cancel lands at a
   * chunk boundary wherever in the grid the run happens to be, so a
   * sixteen-event grid stops as promptly as a one-event bankroll does.
   */
  it("stops a canceled grid at the next chunk boundary, then serves again", async () => {
    const { backend, pings } = testBackend((n, b) => {
      if (n === 2) b.cancel("a");
    });
    await expect(backend.run("a", grid(5000))).rejects.toSatisfy(isAbortError);
    expect(pings()).toBe(2);
    await expect(backend.run("b", grid(200, 2))).resolves.toEqual(
      simulateBankrollGrid(grid3, roll, 200, 2),
    );
  });

  it("runs the two kinds through one backend without either learning of the other", async () => {
    const { backend } = testBackend();
    await expect(backend.run("a", grid(200, 7))).resolves.toEqual(
      simulateBankrollGrid(grid3, roll, 200, 7),
    );
    await expect(backend.run("b", bank(200, 7))).resolves.toEqual(
      simulateBankrolls(config, resolved, 200, 7),
    );
  });
});
