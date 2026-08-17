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
import { defaultConfig } from "../lib/presets";
import type { EventConfig } from "../lib/types";
import { SimulationBackend } from "./backend";
import { SimulationClient } from "./client";
import { isAbortError } from "./protocol";

const config = defaultConfig();
const roll = { startingGems: 3000, startingGold: 0, startingPlayInPoints: 0, maxEvents: 20 };

/** The model's own answer, for a submission to be compared against. */
const expected = (runs: number, seed = 1) => simulateBankrolls(config, roll, runs, seed);

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
});
