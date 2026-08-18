/**
 * Main-thread client: a small worker pool per request kind, in the shape
 * piscina and tinypool use (tinypool itself is node-only, so the shape is
 * borrowed rather than the library) — the dispatcher owns the queue, the
 * cache and the dedupe, and workers are stateless one-job executors that
 * stay warm between dispatches.
 *
 * Two kinds, and the pool is keyed by them because two kinds must never queue
 * behind each other: the Compare tab's grid is sixteen bankrolls' worth of
 * work at its widest, and the Bankroll tab's own run has its own lane and does
 * not wait behind it. Within a pool, workers spawn lazily up to
 * `maxWorkersPerKind` — capacity above the first worker costs nothing until
 * two jobs of the *same* kind actually overlap. The default is 1, which is
 * still the workload exactly: every parameter change supersedes the previous
 * request of its kind, so a queue is never deeper than the run being
 * canceled, and the grid is one job rather than N.
 *
 * A submission returns a handle rather than a promise alone. `cancel()`
 * settles the caller's promise immediately and tells the worker fire-and-
 * forget; the worker stops at its next chunk boundary (~10 ms) and only
 * then returns to service — a superseding request at cap 1 waits out that
 * boundary, never a respawn. The only terminate path is a worker-level
 * error, which fails that pool's jobs, drops its workers, and lets the next
 * submit rebuild — the other kind's pool is untouched.
 */

import { LRUCache } from "lru-cache";
import { wrap } from "comlink";
import type { Endpoint, Remote } from "comlink";

import type { BankrollConfig, BankrollResult } from "../lib/bankroll";
import type { BankrollSummary } from "../lib/bankrollGrid";
import type { EventConfig } from "../lib/types";
import { requestKey } from "./keys";
import { abortError } from "./protocol";
import type {
  ResultOf,
  SimulationApi,
  SimulationHandle,
  SimulationRequest,
  SimulationResult,
} from "./protocol";

type Kind = SimulationRequest["kind"];

/** What the pool needs from a worker; a seam the tests fill with ports. */
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

/** A job whose settle functions fire at most once, whoever calls them. */
type Job = {
  id: string;
  request: SimulationRequest;
  key: string;
  settled: boolean;
  resolve(result: SimulationResult): void;
  reject(e: unknown): void;
};

type Lane = {
  remote: Remote<SimulationApi>;
  port: WorkerPort;
  current: Job | null;
};

/**
 * Sized per result shape, which is why it is a figure per kind rather than
 * one number. A worst-case BankrollResult is ~4.3 MB of example-run logs, so
 * four entries bound that cache near 17 MB while covering the
 * switch-away-and-back the cache exists for. A grid carries no logs at all —
 * sixteen summaries is a few kilobytes — so its cache is sized by how many
 * selections a reader passes through rather than by memory, and sixteen holds
 * a whole session of adding and removing events. Settled successes only;
 * errors and canceled runs are never cached.
 */
const CACHE_MAX: Record<Kind, number> = { bankrolls: 4, compare: 16 };

class KindPool {
  private readonly lanes: Lane[] = [];
  private readonly queue: Job[] = [];
  private readonly cache: LRUCache<string, SimulationResult>;

  constructor(
    private readonly factory: WorkerFactory,
    private readonly maxWorkers: number,
    kind: Kind,
  ) {
    this.cache = new LRUCache({ max: CACHE_MAX[kind] });
  }

  enqueue(job: Job): void {
    const hit = this.cache.get(job.key);
    if (hit !== undefined) {
      job.resolve(hit);
      return;
    }
    this.queue.push(job);
    this.dispatch();
  }

  /**
   * Reject the caller now, tell the worker when it gets to it. The lane
   * stays busy until the worker actually stops — its comlink promise
   * settling (with the abort) is what frees it — so a job dispatched next
   * never overlaps the canceled run.
   */
  cancel(id: string): boolean {
    const queued = this.queue.findIndex((j) => j.id === id);
    if (queued !== -1) {
      const [job] = this.queue.splice(queued, 1);
      job.reject(abortError());
      return true;
    }
    const lane = this.lanes.find((l) => l.current?.id === id);
    if (lane?.current) {
      const job = lane.current;
      job.reject(abortError());
      void lane.remote.cancel(id).catch(() => {});
      return true;
    }
    return false;
  }

  /** Fail everything, drop every worker; the next submit rebuilds. */
  crash(error: unknown): void {
    for (const lane of this.lanes.splice(0)) {
      lane.port.terminate();
      lane.current?.reject(error);
      lane.current = null;
    }
    for (const job of this.queue.splice(0)) job.reject(error);
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      // Re-checked at dispatch: identical requests submitted back-to-back
      // both miss at enqueue time, and the second should ride the first's
      // result rather than recompute.
      const head = this.queue[0];
      const hit = this.cache.get(head.key);
      if (hit !== undefined) {
        this.queue.shift();
        head.resolve(hit);
        continue;
      }
      const lane = this.idleLane();
      if (!lane) return;
      this.queue.shift();
      this.start(lane, head);
    }
  }

  private idleLane(): Lane | null {
    const idle = this.lanes.find((l) => l.current === null);
    if (idle) return idle;
    if (this.lanes.length >= this.maxWorkers) return null;
    const port = this.factory();
    const lane: Lane = { remote: wrap<SimulationApi>(port.endpoint), port, current: null };
    port.onError((e) => this.crash(e));
    this.lanes.push(lane);
    return lane;
  }

  private start(lane: Lane, job: Job): void {
    lane.current = job;
    lane.remote.run(job.id, job.request).then(
      (result) => {
        this.cache.set(job.key, result);
        job.resolve(result);
        this.release(lane, job);
      },
      (e: unknown) => {
        // The abort settle of a canceled run lands here too; the job is
        // already rejected and this is only the lane coming free.
        job.reject(e);
        this.release(lane, job);
      },
    );
  }

  private release(lane: Lane, job: Job): void {
    // A crash may have retired the lane while the settle was in flight.
    if (lane.current !== job || !this.lanes.includes(lane)) return;
    lane.current = null;
    this.dispatch();
  }

  dispose(): void {
    this.crash(abortError());
  }
}

export class SimulationClient {
  private readonly factory: WorkerFactory;
  private readonly maxWorkersPerKind: number;
  private readonly pools = new Map<Kind, KindPool>();
  private counter = 0;

  constructor(factory: WorkerFactory = defaultFactory, opts?: { maxWorkersPerKind?: number }) {
    this.factory = factory;
    this.maxWorkersPerKind = opts?.maxWorkersPerKind ?? 1;
  }

  simulateBankrolls(
    config: EventConfig,
    bankroll: BankrollConfig,
    runs: number,
    seed: number,
  ): SimulationHandle<BankrollResult> {
    return this.submit({ kind: "bankrolls", config, bankroll, runs, seed });
  }

  /**
   * Several events under one balance and one seed, as one job.
   *
   * `configs` order is the result's order and part of the cache key; the
   * caller keeps the names.
   */
  simulateCompare(
    configs: EventConfig[],
    bankroll: BankrollConfig,
    runs: number,
    seed: number,
  ): SimulationHandle<BankrollSummary[]> {
    return this.submit({ kind: "compare", configs, bankroll, runs, seed });
  }

  cancel(id: string): void {
    for (const pool of this.pools.values()) {
      if (pool.cancel(id)) return;
    }
  }

  /** Drop every worker and reject anything in flight. */
  dispose(): void {
    for (const pool of this.pools.values()) pool.dispose();
    this.pools.clear();
  }

  private pool(kind: Kind): KindPool {
    let pool = this.pools.get(kind);
    if (!pool) {
      pool = new KindPool(this.factory, this.maxWorkersPerKind, kind);
      this.pools.set(kind, pool);
    }
    return pool;
  }

  private submit<R extends SimulationRequest>(
    request: R,
  ): SimulationHandle<ResultOf[R["kind"]]> {
    const id = `sim-${this.counter++}`;
    // The declared contract is a rejection, never a sync throw — a
    // malformed request fails key computation before any promise exists.
    let key: string;
    try {
      key = requestKey(request);
    } catch (e) {
      return { id, promise: Promise.reject(e as Error), cancel: () => {} };
    }
    const pool = this.pool(request.kind);
    const promise = new Promise<SimulationResult>((resolve, reject) => {
      const job: Job = {
        id,
        request,
        key,
        settled: false,
        resolve(result) {
          if (!job.settled) {
            job.settled = true;
            resolve(result);
          }
        },
        reject(e) {
          if (!job.settled) {
            job.settled = true;
            reject(e);
          }
        },
      };
      pool.enqueue(job);
    });
    /*
     * The one narrowing in the pool, and it is the tag that makes it true: a
     * request enters exactly one kind's lane, and the backend's `generatorOf`
     * switches on the same tag. Below this line everything — the queue, the
     * cache, the lanes — holds the union, which is what lets one dispatcher
     * serve both kinds without being generic all the way down.
     */
    return {
      id,
      promise: promise as Promise<ResultOf[R["kind"]]>,
      cancel: () => this.cancel(id),
    };
  }
}

/** The instance the hook uses; one client, so one set of pools. */
export const simulationClient = new SimulationClient();

// A Vite hot update of this module would otherwise strand the old instance's
// workers alive with nothing referencing them. Dev only; builds strip it.
import.meta.hot?.dispose(() => simulationClient.dispose());
