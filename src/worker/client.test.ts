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
import { simulate } from "../lib/simulate";
import type { EventConfig } from "../lib/types";
import { SimulationBackend } from "./backend";
import { SimulationClient } from "./client";
import { isAbortError } from "./protocol";

const config = defaultConfig();
const roll = { startingGems: 3000, startingGold: 0, maxEvents: 20 };

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
    const handle = client.simulate(config, 2000, 7);
    expect(handle.id).toMatch(/^sim-/);
    expect(typeof handle.cancel).toBe("function");
    await expect(handle.promise).resolves.toEqual(simulate(config, 2000, 7));
  });

  it("rejects a canceled handle immediately, without the round trip", async () => {
    const { client } = openHarness();
    const handle = client.simulate(config, 50_000, 1);
    handle.cancel();
    // Rejection is local: no macrotask has run, so the worker cannot have
    // finished — this settles before it would have answered.
    await expect(handle.promise).rejects.toSatisfy(isAbortError);
  });

  it("never dispatches a queued job that was canceled", async () => {
    const { client, runs } = openHarness();
    const a = client.simulate(config, 3000, 1);
    const b = client.simulate(config, 5000, 1);
    b.cancel();
    await expect(b.promise).rejects.toSatisfy(isAbortError);
    await expect(a.promise).resolves.toEqual(simulate(config, 3000));
    expect(runs()).toBe(1);
    // And b was never cached: the same request computes when asked again.
    await expect(client.simulate(config, 5000, 1).promise).resolves.toEqual(
      simulate(config, 5000),
    );
    expect(runs()).toBe(2);
  });

  it("serves a repeat of a settled request from cache, without a dispatch", async () => {
    const { client, runs } = openHarness();
    const first = await client.simulate(config, 2000, 1).promise;
    expect(runs()).toBe(1);
    await expect(client.simulate(config, 2000, 1).promise).resolves.toEqual(first);
    expect(runs()).toBe(1);
  });

  it("rides the second of two identical back-to-back submits on the first", async () => {
    const { client, runs } = openHarness();
    // Both miss the cache at enqueue; the dispatch-time re-check is what
    // saves the second from computing.
    const [first, second] = await Promise.all([
      client.simulate(config, 2000, 1).promise,
      client.simulate(config, 2000, 1).promise,
    ]);
    expect(second).toEqual(first);
    expect(runs()).toBe(1);
  });

  it("gives each kind its own pool", async () => {
    const { client, spawns } = openHarness();
    const event = client.simulate(config, 2000, 1);
    const bankroll = client.simulateBankrolls(config, roll, 200, 1);
    expect(spawns()).toBe(2);
    await expect(event.promise).resolves.toEqual(simulate(config, 2000));
    await expect(bankroll.promise).resolves.toEqual(simulateBankrolls(config, roll, 200));
  });

  it("runs same-kind jobs concurrently up to the cap, queueing beyond it", async () => {
    const { client, spawns, peak } = openHarness(2);
    const a = client.simulate(config, 3000, 1);
    const b = client.simulate(config, 3000, 2);
    const c = client.simulate(config, 3000, 3);
    // Two lanes spawned for a and b; c found the pool at its cap and queued.
    expect(spawns()).toBe(2);
    await expect(a.promise).resolves.toEqual(simulate(config, 3000, 1));
    await expect(b.promise).resolves.toEqual(simulate(config, 3000, 2));
    await expect(c.promise).resolves.toEqual(simulate(config, 3000, 3));
    // a and b really overlapped — this is the property the pool exists for.
    expect(peak()).toBe(2);
    expect(spawns()).toBe(2);
  });

  it("frees the lane after a cancellation, for the next job", async () => {
    const { client, spawns } = openHarness();
    const a = client.simulate(config, 50_000, 1);
    a.cancel();
    const b = client.simulate(config, 2000, 1);
    await expect(a.promise).rejects.toSatisfy(isAbortError);
    await expect(b.promise).resolves.toEqual(simulate(config, 2000));
    // The canceled run stopped cooperatively; nothing was respawned.
    expect(spawns()).toBe(1);
  });

  it("fails only the crashed kind's pool, and rebuilds on next submit", async () => {
    const { client, spawns, errorCbs } = openHarness();
    const event = client.simulate(config, 20_000, 1);
    const bankroll = client.simulateBankrolls(config, roll, 200, 1);
    expect(spawns()).toBe(2);
    // The event pool's worker dies mid-flight.
    errorCbs[0](new Error("worker crashed"));
    await expect(event.promise).rejects.toThrow("worker crashed");
    // The other kind's pool is untouched.
    await expect(bankroll.promise).resolves.toEqual(simulateBankrolls(config, roll, 200));
    // The next submit of the crashed kind gets a fresh worker.
    const retry = client.simulate(config, 2000, 1);
    expect(spawns()).toBe(3);
    await expect(retry.promise).resolves.toEqual(simulate(config, 2000));
  });

  it("rejects rather than throws when the request itself is malformed", async () => {
    const { client } = openHarness();
    const broken = client.simulate(null as unknown as EventConfig, 1000, 1);
    await expect(broken.promise).rejects.toThrow();
    await expect(client.simulate(config, 1000, 1).promise).resolves.toEqual(
      simulate(config, 1000),
    );
  });
});
