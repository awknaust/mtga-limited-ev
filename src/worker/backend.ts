/**
 * The simulation worker's backend: a FIFO queue drained one job at a time,
 * an LRU cache per result shape, and cooperative cancellation.
 *
 * A pure module on purpose — nothing here touches a worker global, so the
 * whole thing unit-tests in node, and `simulation.worker.ts` is only the
 * lines that put an instance behind comlink. At runtime each worker serves
 * a single request kind (the client routes by kind), so one of the two
 * caches simply stays empty; the backend does not need to know which.
 *
 * Cancellation is cooperative rather than terminate-and-respawn: the model's
 * loops are generators that yield between chunks, the pump lets the event
 * loop breathe between chunks, and a pending cancel lands at the next
 * boundary. The worker, its queue and its cache all survive.
 */

import { LRUCache } from "lru-cache";

import { simulateBankrollsSteps, type BankrollResult } from "../lib/bankroll";
import { simulateSteps } from "../lib/simulate";
import type { SimResult } from "../lib/types";
import { requestKey } from "./keys";
import { abortError, type SimulationApi, type SimulationRequest } from "./protocol";

type SimulationResult = SimResult | BankrollResult;

type Job = {
  id: string;
  request: SimulationRequest;
  key: string;
  resolve: (r: SimulationResult) => void;
  reject: (e: unknown) => void;
};

/**
 * How long the pump may compute between event-loop pings.
 *
 * The generators yield every ~thousand events, which is far more often than
 * the event loop needs to hear about: a ping is a macrotask round trip, and
 * a five-million-trial run would pay for thousands of them. Gating pings on
 * elapsed time keeps cancel latency around this figure while the run pays
 * for dozens.
 */
const PING_INTERVAL_MS = 10;

/**
 * A macrotask that lets pending messages deliver, without `setTimeout`'s
 * 4 ms nested-timer clamp: message events do not clamp, and a cancel posted
 * before the ping is delivered before it, which is exactly the ordering
 * cancellation needs. One channel, created on first use — constructing a
 * backend must not open ports, or every node test that forgets to close
 * them hangs the runner.
 */
function messageChannelPing(): () => Promise<void> {
  let channel: MessageChannel | null = null;
  let pending: (() => void) | null = null;
  return () =>
    new Promise((resolve) => {
      if (!channel) {
        channel = new MessageChannel();
        channel.port1.onmessage = () => {
          const settle = pending;
          pending = null;
          settle?.();
        };
      }
      pending = resolve;
      channel.port2.postMessage(null);
    });
}

export class SimulationBackend implements SimulationApi {
  /*
   * Settled successes only; errors and canceled runs are never cached.
   *
   * A SimResult is small at any trial count — a dozen buckets and their
   * summaries — so its cache is sized by generosity. A BankrollResult is
   * not: the example-run logs grow with the event cap, and a measured worst
   * case (2,000-event runs) is ~4.3 MB, so four entries bound the cache
   * near 17 MB while still covering the switch-away-and-back the cache
   * exists for.
   */
  private readonly simCache = new LRUCache<string, SimResult>({ max: 64 });
  private readonly bankCache = new LRUCache<string, BankrollResult>({ max: 4 });
  private readonly queue: Job[] = [];
  private readonly canceled = new Set<string>();
  private running: string | null = null;
  private pumping = false;
  private readonly yieldToEvents: () => Promise<void>;
  private readonly pingIntervalMs: number;

  /**
   * Both knobs exist for the tests: an injected `yieldToEvents` makes the
   * pacing observable, and `pingIntervalMs: 0` pings at every chunk boundary
   * so cancellation tests are deterministic instead of racing a clock.
   */
  constructor(opts?: { yieldToEvents?: () => Promise<void>; pingIntervalMs?: number }) {
    this.yieldToEvents = opts?.yieldToEvents ?? messageChannelPing();
    this.pingIntervalMs = opts?.pingIntervalMs ?? PING_INTERVAL_MS;
  }

  submit(id: string, request: SimulationRequest): Promise<SimulationResult> {
    // A malformed request can fail key computation before any promise
    // exists; the declared contract is a rejection, never a sync throw.
    let key: string;
    try {
      key = requestKey(request);
    } catch (e) {
      return Promise.reject(e as Error);
    }
    const hit = this.cached(request.kind, key);
    if (hit !== undefined) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      this.queue.push({ id, request, key, resolve, reject });
      void this.pump();
    });
  }

  /**
   * Queued → removed and rejected now. Running → rejected at the next chunk
   * boundary. Unknown or already settled → no-op, because a cancel racing a
   * completion is normal and neither side should have to care who won.
   */
  cancel(id: string): void {
    const queued = this.queue.findIndex((j) => j.id === id);
    if (queued !== -1) {
      const [job] = this.queue.splice(queued, 1);
      job.reject(abortError());
      return;
    }
    if (this.running === id) this.canceled.add(id);
  }

  private cached(kind: SimulationRequest["kind"], key: string): SimulationResult | undefined {
    return kind === "simulate" ? this.simCache.get(key) : this.bankCache.get(key);
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const job = this.queue.shift();
        if (!job) return;
        await this.run(job);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async run(job: Job): Promise<void> {
    // Re-checked at dequeue: identical requests submitted back-to-back both
    // miss at submit time, and the second should ride the first's result.
    const hit = this.cached(job.request.kind, job.key);
    if (hit !== undefined) {
      job.resolve(hit);
      return;
    }
    this.running = job.id;
    try {
      const gen = generatorOf(job.request);
      let lastPing = performance.now();
      for (;;) {
        let r: IteratorResult<number, SimulationResult>;
        try {
          r = gen.next();
        } catch (e) {
          // A model error fails this job alone; the pump moves on.
          job.reject(e);
          return;
        }
        if (r.done) {
          this.store(job.request.kind, job.key, r.value);
          job.resolve(r.value);
          return;
        }
        if (performance.now() - lastPing >= this.pingIntervalMs) {
          await this.yieldToEvents();
          lastPing = performance.now();
          if (this.canceled.delete(job.id)) {
            job.reject(abortError());
            return;
          }
        }
      }
    } finally {
      this.running = null;
      // A cancel that lost the race to completion must not linger.
      this.canceled.delete(job.id);
    }
  }

  private store(kind: SimulationRequest["kind"], key: string, value: SimulationResult): void {
    if (kind === "simulate") this.simCache.set(key, value as SimResult);
    else this.bankCache.set(key, value as BankrollResult);
  }
}

// Direct imports from the two model modules, never the src/lib barrel: the
// barrel re-exports presets, and presets would drag src/data into the worker
// chunk for nothing.
function generatorOf(request: SimulationRequest): Generator<number, SimulationResult> {
  return request.kind === "simulate"
    ? simulateSteps(request.config, request.trials, request.seed)
    : simulateBankrollsSteps(request.config, request.bankroll, request.runs, request.seed);
}
