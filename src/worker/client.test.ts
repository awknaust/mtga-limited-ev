/**
 * The pool against a real comlink boundary, without real Workers: each
 * "worker" is a backend exposed on one end of a `MessageChannel`, which
 * node provides as a global. Everything crosses the same structured clone
 * and message ordering a browser worker would impose; only the thread is
 * shared, which is why the harness counts dispatches and peak concurrency
 * instead of measuring time.
 */

import { afterEach, describe, expect, it } from "vitest";

import { expose } from "comlink";

import { simulateBankrolls } from "../lib/bankroll";
import { simulateBankrollGrid } from "../lib/bankrollGrid";
import { PRESETS, configFromPreset, defaultConfig } from "../lib/presets";
import type { EventConfig } from "../lib/types";
import { SimulationBackend } from "./backend";
import { SimulationClient } from "./client";
import { isAbortError } from "./protocol";

const config = defaultConfig();
const roll = { startingGems: 3000, startingGold: 0, startingPlayInPoints: 0, maxEvents: 20 };

/** The model's own answer, for a submission to be compared against. */
const expected = (runs: number, seed = 1) => simulateBankrolls(config, roll, runs, seed);

/** Three real ladders, and the grid the model makes of them. */
const grid3 = PRESETS.slice(0, 3).map((p) => configFromPreset(p, config));
const expectedGrid = (runs: number, seed = 1, configs = grid3) =>
  simulateBankrollGrid(configs, roll, runs, seed);

/**
 * A factory spawning backend-on-a-channel "workers", instrumented: how many
 * spawned, how many jobs actually ran, how many ran at once, and each
 * lane's error callback for injecting crashes.
 */
function harness(maxWorkersPerKind = 1) {
  const channels: MessageChannel[] = [];
  const errorCbs: ((e: unknown) => void)[] = [];
  let runCalls = 0;
  let active = 0;
  let peak = 0;
  const client = new SimulationClient(
    () => {
      const channel = new MessageChannel();
      channels.push(channel);
      const backend = new SimulationBackend({
        pingIntervalMs: 0,
        yieldToEvents: () => new Promise((resolve) => setTimeout(resolve, 0)),
      });
      const inner = backend.run.bind(backend);
      backend.run = (id, request) => {
        runCalls++;
        active++;
        peak = Math.max(peak, active);
        const p = inner(id, request);
        p.then(
          () => active--,
          () => active--,
        );
        return p;
      };
      expose(backend, channel.port1);
      return {
        endpoint: channel.port2,
        terminate: () => {
          channel.port1.close();
          channel.port2.close();
        },
        onError: (cb: (e: unknown) => void) => errorCbs.push(cb),
      };
    },
    { maxWorkersPerKind },
  );
  return {
    client,
    spawns: () => channels.length,
    runs: () => runCalls,
    peak: () => peak,
    errorCbs,
    close: () => {
      client.dispose();
      for (const c of channels) {
        c.port1.close();
        c.port2.close();
      }
    },
  };
}

let open: ReturnType<typeof harness> | null = null;
const openHarness = (maxWorkersPerKind = 1) => (open = harness(maxWorkersPerKind));

afterEach(() => {
  // Open ports are live handles; leaking one hangs the runner.
  open?.close();
  open = null;
});

describe("SimulationClient", () => {
  it("returns a handle whose result crosses the boundary intact", async () => {
    const { client } = openHarness();
    const handle = client.simulateBankrolls(config, roll, 200, 7);
    expect(handle.id).toMatch(/^sim-/);
    expect(typeof handle.cancel).toBe("function");
    await expect(handle.promise).resolves.toEqual(expected(200, 7));
  });

  it("rejects a canceled handle immediately, without the round trip", async () => {
    const { client } = openHarness();
    const handle = client.simulateBankrolls(config, roll, 5000, 1);
    handle.cancel();
    // Rejection is local: no macrotask has run, so the worker cannot have
    // finished — this settles before it would have answered.
    await expect(handle.promise).rejects.toSatisfy(isAbortError);
  });

  it("never dispatches a queued job that was canceled", async () => {
    const { client, runs } = openHarness();
    const a = client.simulateBankrolls(config, roll, 300, 1);
    const b = client.simulateBankrolls(config, roll, 500, 1);
    b.cancel();
    await expect(b.promise).rejects.toSatisfy(isAbortError);
    await expect(a.promise).resolves.toEqual(expected(300));
    expect(runs()).toBe(1);
    // And b was never cached: the same request computes when asked again.
    await expect(client.simulateBankrolls(config, roll, 500, 1).promise).resolves.toEqual(
      expected(500),
    );
    expect(runs()).toBe(2);
  });

  it("serves a repeat of a settled request from cache, without a dispatch", async () => {
    const { client, runs } = openHarness();
    const first = await client.simulateBankrolls(config, roll, 200, 1).promise;
    expect(runs()).toBe(1);
    await expect(client.simulateBankrolls(config, roll, 200, 1).promise).resolves.toEqual(first);
    expect(runs()).toBe(1);
  });

  it("rides the second of two identical back-to-back submits on the first", async () => {
    const { client, runs } = openHarness();
    // Both miss the cache at enqueue; the dispatch-time re-check is what
    // saves the second from computing.
    const [first, second] = await Promise.all([
      client.simulateBankrolls(config, roll, 200, 1).promise,
      client.simulateBankrolls(config, roll, 200, 1).promise,
    ]);
    expect(second).toEqual(first);
    expect(runs()).toBe(1);
  });

  it("runs same-kind jobs concurrently up to the cap, queueing beyond it", async () => {
    const { client, spawns, peak } = openHarness(2);
    const a = client.simulateBankrolls(config, roll, 300, 1);
    const b = client.simulateBankrolls(config, roll, 300, 2);
    const c = client.simulateBankrolls(config, roll, 300, 3);
    // Two lanes spawned for a and b; c found the pool at its cap and queued.
    expect(spawns()).toBe(2);
    await expect(a.promise).resolves.toEqual(expected(300, 1));
    await expect(b.promise).resolves.toEqual(expected(300, 2));
    await expect(c.promise).resolves.toEqual(expected(300, 3));
    // a and b really overlapped — this is the property the pool exists for.
    expect(peak()).toBe(2);
    expect(spawns()).toBe(2);
  });

  it("frees the lane after a cancellation, for the next job", async () => {
    const { client, spawns } = openHarness();
    const a = client.simulateBankrolls(config, roll, 5000, 1);
    a.cancel();
    const b = client.simulateBankrolls(config, roll, 200, 1);
    await expect(a.promise).rejects.toSatisfy(isAbortError);
    await expect(b.promise).resolves.toEqual(expected(200));
    // The canceled run stopped cooperatively; nothing was respawned.
    expect(spawns()).toBe(1);
  });

  it("fails the pool's jobs on a worker crash, and rebuilds on next submit", async () => {
    const { client, spawns, errorCbs } = openHarness();
    const doomed = client.simulateBankrolls(config, roll, 5000, 1);
    expect(spawns()).toBe(1);
    // The pool's worker dies mid-flight.
    errorCbs[0](new Error("worker crashed"));
    await expect(doomed.promise).rejects.toThrow("worker crashed");
    // The next submit gets a fresh worker.
    const retry = client.simulateBankrolls(config, roll, 200, 1);
    expect(spawns()).toBe(2);
    await expect(retry.promise).resolves.toEqual(expected(200));
  });

  it("rejects rather than throws when the request itself is malformed", async () => {
    const { client } = openHarness();
    const broken = client.simulateBankrolls(null as unknown as EventConfig, roll, 200, 1);
    await expect(broken.promise).rejects.toThrow();
    await expect(client.simulateBankrolls(config, roll, 200, 1).promise).resolves.toEqual(
      expected(200),
    );
  });

  it("returns a grid whose rows cross the boundary intact", async () => {
    const { client } = openHarness();
    const handle = client.simulateCompare(grid3, roll, 200, 7);
    await expect(handle.promise).resolves.toEqual(expectedGrid(200, 7));
  });

  /*
   * The property the per-kind lanes exist for, and the reason the grid is a
   * second kind rather than N bankrolls: at a cap of one worker per kind, the
   * Compare tab's grid and the Bankroll tab's own run still overlap. Queued
   * behind each other, whichever arrived second would wait out the first.
   */
  it("does not queue a grid behind a bankroll, or the reverse", async () => {
    const { client, spawns, peak } = openHarness();
    const bank = client.simulateBankrolls(config, roll, 300, 1);
    const compare = client.simulateCompare(grid3, roll, 300, 1);
    // One lane each, spawned on submit rather than after the other settles.
    expect(spawns()).toBe(2);
    await expect(bank.promise).resolves.toEqual(expected(300));
    await expect(compare.promise).resolves.toEqual(expectedGrid(300));
    expect(peak()).toBe(2);
  });

  it("serves a repeat of a settled grid from cache, without a dispatch", async () => {
    const { client, runs } = openHarness();
    const first = await client.simulateCompare(grid3, roll, 200, 1).promise;
    expect(runs()).toBe(1);
    await expect(client.simulateCompare(grid3, roll, 200, 1).promise).resolves.toEqual(first);
    expect(runs()).toBe(1);
  });

  /*
   * Sixteen entries, against the bankroll's four: a grid carries no example
   * runs, so the cache is sized by how many selections a reader passes through
   * rather than by megabytes. Adding events one at a time — the ordinary way a
   * selection is built — must find the earlier ones still cached.
   */
  it("keeps every step of a widening selection cached", async () => {
    const { client, runs } = openHarness();
    const widths = grid3.map((_, i) => grid3.slice(0, i + 1));
    for (const configs of widths) await client.simulateCompare(configs, roll, 200, 1).promise;
    expect(runs()).toBe(widths.length);
    // Every width back, in reverse, with nothing recomputed.
    for (const configs of [...widths].reverse()) {
      await expect(client.simulateCompare(configs, roll, 200, 1).promise).resolves.toEqual(
        expectedGrid(200, 1, configs),
      );
    }
    expect(runs()).toBe(widths.length);
  });

  it("cancels a grid without touching the bankroll lane's run", async () => {
    const { client } = openHarness();
    const bank = client.simulateBankrolls(config, roll, 300, 1);
    const compare = client.simulateCompare(grid3, roll, 5000, 1);
    // Leaving the Compare tab mid-grid, with the other tab's run in flight.
    compare.cancel();
    await expect(compare.promise).rejects.toSatisfy(isAbortError);
    await expect(bank.promise).resolves.toEqual(expected(300));
  });

  it("does not serve a grid of one from the bankroll it already ran", async () => {
    const { client, runs } = openHarness();
    // Same numbers, same lone config, different question — and two answers of
    // different shapes, so one standing in for the other is not a stale figure
    // but a render against fields that are not there.
    await client.simulateBankrolls(config, roll, 200, 1).promise;
    await expect(client.simulateCompare([config], roll, 200, 1).promise).resolves.toEqual(
      expectedGrid(200, 1, [config]),
    );
    expect(runs()).toBe(2);
  });
});
