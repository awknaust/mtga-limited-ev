/**
 * The backend in node, with its pacing made observable: `yieldToEvents` is a
 * counted macrotask — a real `setTimeout`, because cancellation rides on
 * messages being processed between chunks and a microtask would let nothing
 * through — and `pingIntervalMs: 0` pings at every chunk boundary, so what
 * happens at a boundary is deterministic instead of racing a clock.
 */

import { describe, expect, it } from "vitest";

import { simulateBankrolls } from "../lib/bankroll";
import { defaultConfig } from "../lib/presets";
import { simulate } from "../lib/simulate";
import type { EventConfig } from "../lib/types";
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
    await expect(backend.submit("a", sim(2000, 7))).resolves.toEqual(simulate(config, 2000, 7));
    await expect(backend.submit("b", bank(200, 7))).resolves.toEqual(
      simulateBankrolls(config, { startingGems: 3000, startingGold: 0, maxEvents: 20 }, 200, 7),
    );
  });

  it("serves a repeat of a settled request from cache, without recomputing", async () => {
    const { backend, pings } = testBackend();
    const first = await backend.submit("a", sim(3000));
    const computed = pings();
    expect(computed).toBeGreaterThan(0);
    const second = await backend.submit("b", sim(3000));
    // The same object, not an equal one: a recompute would have built afresh.
    expect(second).toBe(first);
    expect(pings()).toBe(computed);
  });

  it("serves the second of two identical back-to-back submits from cache", async () => {
    const { backend, pings } = testBackend();
    // Both miss the cache at submit time; the dequeue-time re-check is what
    // saves the second from running.
    const [first, second] = await Promise.all([
      backend.submit("a", sim(3000)),
      backend.submit("b", sim(3000)),
    ]);
    expect(second).toBe(first);
    expect(pings()).toBe(3);
  });

  it("resolves jobs in submission order", async () => {
    const { backend } = testBackend();
    const order: string[] = [];
    await Promise.all([
      backend.submit("a", sim(3000)).then(() => order.push("a")),
      backend.submit("b", sim(2000)).then(() => order.push("b")),
      backend.submit("c", sim(1000, 2)).then(() => order.push("c")),
    ]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("rejects a queued job on cancel and never runs it", async () => {
    const { backend, pings } = testBackend();
    const a = backend.submit("a", sim(3000));
    const b = backend.submit("b", sim(5000));
    const c = backend.submit("c", sim(2000));
    backend.cancel("b");
    await expect(b).rejects.toSatisfy(isAbortError);
    await expect(a).resolves.toEqual(simulate(config, 3000));
    await expect(c).resolves.toEqual(simulate(config, 2000));
    // a's three chunks and c's two; b would have added five more.
    expect(pings()).toBe(5);
  });

  it("stops a running job at the next chunk boundary, uncached", async () => {
    const { backend, pings } = testBackend((n, b) => {
      if (n === 2) b.cancel("a");
    });
    const a = backend.submit("a", sim(5000));
    const b = backend.submit("b", sim(1000, 2));
    await expect(a).rejects.toSatisfy(isAbortError);
    await expect(b).resolves.toEqual(simulate(config, 1000, 2));
    const afterCancel = pings();
    // A canceled run must not have been cached: the same request computes
    // afresh, which shows up as more pings.
    await expect(backend.submit("c", sim(5000))).resolves.toEqual(simulate(config, 5000));
    expect(pings()).toBeGreaterThan(afterCancel);
  });

  it("ignores a cancel for an unknown or settled id", async () => {
    const { backend } = testBackend();
    backend.cancel("never-submitted");
    const a = await backend.submit("a", sim(1000));
    backend.cancel("a");
    await expect(backend.submit("b", sim(1000))).resolves.toBe(a);
  });

  it("fails a broken job alone and keeps pumping", async () => {
    const { backend } = testBackend();
    // Keys fine, model not: an elimination event to zero wins or losses has
    // no records, and the trial loop throws on its first step.
    const broken = backend.submit("a", {
      kind: "simulate",
      config: { ...config, structure: { kind: "elimination", maxWins: 0, maxLosses: 0 } },
      trials: 1000,
      seed: 1,
    });
    const fine = backend.submit("b", sim(1000));
    await expect(broken).rejects.toThrow();
    await expect(fine).resolves.toEqual(simulate(config, 1000));
  });

  it("rejects rather than throws when the request itself is malformed", async () => {
    const { backend } = testBackend();
    const broken = backend.submit("a", {
      kind: "simulate",
      config: null as unknown as EventConfig,
      trials: 1000,
      seed: 1,
    });
    await expect(broken).rejects.toThrow();
    await expect(backend.submit("b", sim(1000))).resolves.toEqual(simulate(config, 1000));
  });
});
