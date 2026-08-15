/**
 * The client against a real comlink boundary, without a real Worker: each
 * "worker" is a backend exposed on one end of a `MessageChannel`, which node
 * provides as a global. Everything crosses the same structured clone and
 * message ordering a browser worker would impose; only the thread is shared.
 */

import { afterEach, describe, expect, it } from "vitest";

import { expose } from "comlink";

import { simulateBankrolls } from "../lib/bankroll";
import { defaultConfig } from "../lib/presets";
import { simulate } from "../lib/simulate";
import { SimulationBackend } from "./backend";
import { SimulationClient } from "./client";
import { isAbortError } from "./protocol";

const config = defaultConfig();
const roll = { startingGems: 3000, startingGold: 0, maxEvents: 20 };

/**
 * A factory that spawns backend-on-a-channel "workers", and the levers the
 * tests pull: how many spawns happened, and each lane's error callback.
 */
function harness() {
  const channels: MessageChannel[] = [];
  const errorCbs: ((e: unknown) => void)[] = [];
  const client = new SimulationClient(() => {
    const channel = new MessageChannel();
    channels.push(channel);
    expose(
      new SimulationBackend({
        pingIntervalMs: 0,
        yieldToEvents: () => new Promise((resolve) => setTimeout(resolve, 0)),
      }),
      channel.port1,
    );
    return {
      endpoint: channel.port2,
      terminate: () => {
        channel.port1.close();
        channel.port2.close();
      },
      onError: (cb: (e: unknown) => void) => errorCbs.push(cb),
    };
  });
  return {
    client,
    spawns: () => channels.length,
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
const openHarness = () => (open = harness());

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
    // Rejection is local: no macrotask has run, so the backend cannot have
    // finished — this settles before the worker would have answered.
    await expect(handle.promise).rejects.toSatisfy(isAbortError);
  });

  it("carries the cancel to the backend, so a queued job never runs", async () => {
    const { client } = openHarness();
    const a = client.simulate(config, 3000, 1);
    const b = client.simulate(config, 5000, 1);
    b.cancel();
    await expect(b.promise).rejects.toSatisfy(isAbortError);
    await expect(a.promise).resolves.toEqual(simulate(config, 3000));
    // The proof b never ran: an identical submit computes rather than being
    // served from cache — observable as a result, not a hang.
    await expect(client.simulate(config, 5000, 1).promise).resolves.toEqual(
      simulate(config, 5000),
    );
  });

  it("routes each kind to its own worker, spawned once", async () => {
    const { client, spawns } = openHarness();
    const event = client.simulate(config, 2000, 1);
    const bankroll = client.simulateBankrolls(config, roll, 200, 1);
    expect(spawns()).toBe(2);
    await expect(event.promise).resolves.toEqual(simulate(config, 2000));
    await expect(bankroll.promise).resolves.toEqual(simulateBankrolls(config, roll, 200));
    const third = client.simulate(config, 1000, 1);
    expect(spawns()).toBe(2);
    await expect(third.promise).resolves.toEqual(simulate(config, 1000));
  });

  it("fails only the crashed kind's handles, and respawns on next submit", async () => {
    const { client, spawns, errorCbs } = openHarness();
    const event = client.simulate(config, 20_000, 1);
    const bankroll = client.simulateBankrolls(config, roll, 200, 1);
    expect(spawns()).toBe(2);
    // The simulate lane's worker dies mid-flight.
    errorCbs[0](new Error("worker crashed"));
    await expect(event.promise).rejects.toThrow("worker crashed");
    // The other lane is untouched.
    await expect(bankroll.promise).resolves.toEqual(simulateBankrolls(config, roll, 200));
    // The next submit of the crashed kind gets a fresh worker.
    const retry = client.simulate(config, 2000, 1);
    expect(spawns()).toBe(3);
    await expect(retry.promise).resolves.toEqual(simulate(config, 2000));
  });
});
