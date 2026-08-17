/**
 * The contract between the app and the simulation worker.
 *
 * Requests are plain data — a kind tag and the numbers the model needs — so
 * they survive the structured clone across the worker boundary unchanged.
 * The client hands back a handle rather than a bare promise: cancellation is
 * by id, REST-style, and the id lives on the handle so cancelling needs no
 * round trip.
 *
 * One kind: the bankroll is the only simulation there is, since the per-event
 * figures are closed form and never leave the main thread. The tag stays on
 * the request because it costs nothing, keeps a cache key self-describing,
 * and is where a second kind would announce itself.
 */

import type { BankrollConfig, BankrollResult } from "../lib/bankroll";
import type { EventConfig } from "../lib/types";

export type BankrollsRequest = {
  kind: "bankrolls";
  config: EventConfig;
  bankroll: BankrollConfig;
  runs: number;
  seed: number;
};

export type SimulationRequest = BankrollsRequest;

/**
 * What the worker exposes over comlink, and what the backend implements:
 * run one simulation, cancelable by id. Queueing, caching and dispatch are
 * the client-side pool's business — a worker only ever holds one job.
 */
export type SimulationApi = {
  run(id: string, request: SimulationRequest): Promise<BankrollResult>;
  cancel(id: string): void;
};

/** A submission: the promise, and the means to walk away from it. */
export type SimulationHandle<T> = {
  id: string;
  promise: Promise<T>;
  cancel(): void;
};

/**
 * The one rejection cancellation produces, on both sides of the boundary.
 *
 * A DOMException because that is what the platform's own abortable APIs
 * throw, so callers test one shape.
 */
export const abortError = (): DOMException =>
  new DOMException("Simulation canceled", "AbortError");

/**
 * By name, never `instanceof`: an error cloned across the comlink boundary
 * keeps its name and loses its prototype.
 */
export const isAbortError = (e: unknown): boolean =>
  typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
