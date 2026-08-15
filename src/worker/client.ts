/**
 * Main-thread client for the simulation workers.
 *
 * One worker per request kind, spawned lazily from the same entry file: the
 * event and bankroll simulations run on separate threads, so neither ever
 * queues behind the other. The caches never overlap between kinds — keys
 * are kind-prefixed — so the split costs nothing but a worker's baseline
 * memory.
 *
 * A submission returns a handle rather than a promise alone. `cancel()`
 * rejects the local promise immediately and tells the worker fire-and-
 * forget; the worker stops at its next chunk boundary. Cancellation never
 * terminates a worker — the only terminate path is a worker-level error,
 * where the crashed kind's handles reject, the worker is dropped, and the
 * next submit of that kind respawns one (its cache lost, accepted as rare).
 */

import { wrap } from "comlink";
import type { Endpoint, Remote } from "comlink";

import type { BankrollConfig, BankrollResult } from "../lib/bankroll";
import type { EventConfig, SimResult } from "../lib/types";
import { abortError } from "./protocol";
import type { SimulationApi, SimulationHandle, SimulationRequest } from "./protocol";

type SimulationResult = SimResult | BankrollResult;
type Kind = SimulationRequest["kind"];

/** What the client needs from a worker; a seam the tests fill with ports. */
export type WorkerPort = {
  endpoint: Endpoint;
  terminate(): void;
  onError(cb: (e: unknown) => void): void;
};

export type WorkerFactory = () => WorkerPort;

const defaultFactory: WorkerFactory = () => {
  const worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
    type: "module",
  });
  return {
    endpoint: worker,
    terminate: () => worker.terminate(),
    onError: (cb) => worker.addEventListener("error", cb),
  };
};

type Lane = {
  remote: Remote<SimulationApi>;
  port: WorkerPort;
  /** Rejectors of unsettled handles; deleting one is winning the settle race. */
  outstanding: Map<string, (e: unknown) => void>;
};

export class SimulationClient {
  private readonly factory: WorkerFactory;
  private readonly lanes = new Map<Kind, Lane>();
  private counter = 0;

  constructor(factory: WorkerFactory = defaultFactory) {
    this.factory = factory;
  }

  simulate(config: EventConfig, trials: number, seed: number): SimulationHandle<SimResult> {
    return this.submit({ kind: "simulate", config, trials, seed }) as SimulationHandle<SimResult>;
  }

  simulateBankrolls(
    config: EventConfig,
    bankroll: BankrollConfig,
    runs: number,
    seed: number,
  ): SimulationHandle<BankrollResult> {
    return this.submit({
      kind: "bankrolls",
      config,
      bankroll,
      runs,
      seed,
    }) as SimulationHandle<BankrollResult>;
  }

  /**
   * Reject the handle now, tell the worker when it gets to it. The comlink
   * promise settles later against an already-settled wrapper, which the
   * outstanding map turns into a no-op — no unhandled rejection either way.
   */
  cancel(id: string): void {
    for (const lane of this.lanes.values()) {
      const reject = lane.outstanding.get(id);
      if (!reject) continue;
      lane.outstanding.delete(id);
      reject(abortError());
      void lane.remote.cancel(id).catch(() => {});
      return;
    }
  }

  /** Drop every worker and reject anything in flight. */
  dispose(): void {
    for (const kind of [...this.lanes.keys()]) this.crash(kind, abortError());
  }

  private lane(kind: Kind): Lane {
    let lane = this.lanes.get(kind);
    if (!lane) {
      const port = this.factory();
      lane = { remote: wrap<SimulationApi>(port.endpoint), port, outstanding: new Map() };
      port.onError((e) => this.crash(kind, e));
      this.lanes.set(kind, lane);
    }
    return lane;
  }

  private submit(request: SimulationRequest): SimulationHandle<SimulationResult> {
    const id = `sim-${this.counter++}`;
    const lane = this.lane(request.kind);
    const promise = new Promise<SimulationResult>((resolve, reject) => {
      lane.outstanding.set(id, reject);
      lane.remote.submit(id, request).then(
        (result) => {
          if (lane.outstanding.delete(id)) resolve(result);
        },
        (e: unknown) => {
          if (lane.outstanding.delete(id)) reject(e);
        },
      );
    });
    return { id, promise, cancel: () => this.cancel(id) };
  }

  private crash(kind: Kind, error: unknown): void {
    const lane = this.lanes.get(kind);
    if (!lane) return;
    this.lanes.delete(kind);
    lane.port.terminate();
    for (const reject of lane.outstanding.values()) reject(error);
    lane.outstanding.clear();
  }
}

/** The instance the hooks share, so both tabs talk to the same two workers. */
export const simulationClient = new SimulationClient();

// A Vite hot update of this module would otherwise strand the old instance's
// workers alive with nothing referencing them. Dev only; builds strip it.
import.meta.hot?.dispose(() => simulationClient.dispose());
