/**
 * The contract between the app and the simulation worker.
 *
 * Requests are plain data — a kind tag and the numbers the model needs — so
 * they survive the structured clone across the worker boundary unchanged.
 * The client hands back a handle rather than a bare promise: cancellation is
 * by id, REST-style, and the id lives on the handle so cancelling needs no
 * round trip.
 *
 * Two kinds, both bankrolls: one event in depth, or several under one balance.
 * Everything else the app reports is closed form and never leaves the main
 * thread. The tag is what keeps the two apart in the pool, in the cache and
 * in `ResultOf` — one kind, one lane, one result shape.
 */

import type { BankrollConfig, BankrollResult } from "../lib/bankroll";
import type { BankrollSummary } from "../lib/bankrollGrid";
import type { EventConfig } from "../lib/types";

export type BankrollsRequest = {
  kind: "bankrolls";
  config: EventConfig;
  bankroll: BankrollConfig;
  runs: number;
  seed: number;
};

/**
 * Several events, one balance, one seed.
 *
 * A single request rather than N `bankrolls` ones, and the reasons are the
 * pool's own design read back. Per-kind lanes exist so two kinds never queue
 * behind each other, and a grid must not block the Bankroll tab's own run. One
 * job is one cancellation, one cache key and one pending flag, where N would
 * be N of each and a half-finished grid to render. And `CACHE_MAX.bankrolls`
 * is four, sized for a ~4.3 MB result, so a sixteen-event grid submitted as
 * sixteen requests would evict its own first twelve answers before the last
 * landed.
 *
 * No event names cross: the model does not know them, and `summaries[i]`
 * answers for `configs[i]`. Order is therefore load-bearing here in a way it
 * is not for a tier's boxes — see `keys.ts`.
 */
export type CompareRequest = {
  kind: "compare";
  configs: EventConfig[];
  bankroll: BankrollConfig;
  runs: number;
  seed: number;
};

export type SimulationRequest = BankrollsRequest | CompareRequest;

/**
 * What each kind comes back as. One entry per kind, so a kind added without a
 * result shape does not compile, and the pool can narrow a handle from the tag
 * it was submitted with rather than from a cast at every call site.
 */
export type ResultOf = {
  bankrolls: BankrollResult;
  compare: BankrollSummary[];
};

/** Any settled result, which is what the cache and the lanes hold. */
export type SimulationResult = ResultOf[SimulationRequest["kind"]];

/**
 * What the worker exposes over comlink, and what the backend implements:
 * run one simulation, cancelable by id. Queueing, caching and dispatch are
 * the client-side pool's business — a worker only ever holds one job.
 *
 * The return is the union rather than the precise shape for the request: a
 * generic method survives comlink's `Remote<T>` mapping only by being
 * instantiated at its constraint, so the narrowing is done once, in the
 * client, where the tag is still a literal.
 */
export type SimulationApi = {
  run(id: string, request: SimulationRequest): Promise<SimulationResult>;
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
