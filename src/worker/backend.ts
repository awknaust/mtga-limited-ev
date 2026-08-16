/**
 * The worker side of the simulation pool: run one job, cooperatively
 * cancelable, and nothing else.
 *
 * The queue and the caches live in the client's per-kind pool — a queue
 * inside one worker cannot be drained by a sibling, and a cache inside one
 * worker is invisible to the others — so what remains here is only the part
 * that must sit next to the compute: drain the model's generator chunk by
 * chunk, let the event loop breathe between chunks so a cancel message can
 * land, and stop at the first boundary after one does. Cancellation never
 * terminates the worker; it stays warm for the next dispatch.
 *
 * The pool guarantees one run at a time per worker. A second concurrent run
 * is a broken dispatcher, and is rejected as such rather than queued.
 */

import { simulateBankrollsSteps, type BankrollResult } from "../lib/bankroll";
import { simulateSteps } from "../lib/simulate";
import type { SimResult } from "../lib/types";
import { abortError, type SimulationApi, type SimulationRequest } from "./protocol";

type SimulationResult = SimResult | BankrollResult;

/**
 * How long a run may compute between event-loop pings.
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
  private running: string | null = null;
  private canceled = false;
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

  async run(id: string, request: SimulationRequest): Promise<SimulationResult> {
    if (this.running !== null) {
      throw new Error(`backend already running ${this.running}; dispatcher sent ${id}`);
    }
    this.running = id;
    this.canceled = false;
    try {
      // A model error thrown by the generator rejects this run and nothing
      // else — the worker stays healthy for the next dispatch.
      const gen = generatorOf(request);
      let lastPing = performance.now();
      for (;;) {
        const r = gen.next();
        if (r.done) return r.value;
        if (performance.now() - lastPing >= this.pingIntervalMs) {
          await this.yieldToEvents();
          lastPing = performance.now();
          if (this.canceled) throw abortError();
        }
      }
    } finally {
      this.running = null;
      this.canceled = false;
    }
  }

  /**
   * Takes effect at the next chunk boundary. Unknown or already settled id →
   * no-op, because a cancel racing a completion is normal and neither side
   * should have to care who won.
   */
  cancel(id: string): void {
    if (this.running === id) this.canceled = true;
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
