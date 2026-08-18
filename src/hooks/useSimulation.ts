/**
 * The bankroll simulation as a hook: submit to the worker once the params
 * have settled, cancel the superseded run, and report what came back.
 *
 * The hook takes the *live* params — the object App rebuilds on every
 * change — and decides for itself when to submit. `pending` is measured
 * against those live params, so it is true from the keystroke that made
 * the results stale until the run for the current values lands, and not
 * merely while a worker is busy. Submission waits `SIM_DEBOUNCE_MS` after
 * the last change, except where the caller's `Timing` says otherwise — the
 * Advanced dialog holds every edit and flushes when it closes, a preset pick
 * runs at once. The caller builds the params with `useMemo`, so a flush is
 * atomic — no render can pair this keystroke's runs with the last one's
 * seed — and the effect needs exactly one dependency.
 *
 * Only the bankrolls go through here — the single event's, and the Compare
 * tab's grid of them. Every per-event figure is closed form and computed in
 * render.
 */

import { useEffect, useState } from "react";

import type { BankrollResult } from "../lib/bankroll";
import type { BankrollSummary } from "../lib/bankrollGrid";
import type { EventConfig } from "../lib/types";
import { simulationClient } from "../worker/client";
import { isAbortError } from "../worker/protocol";
import type { SimulationHandle } from "../worker/protocol";
import { useDebouncedValue, type Timing } from "./useDebouncedValue";

/**
 * How long after the last input the bankroll simulation waits before
 * recomputing.
 *
 * Long enough to cover the gap between keystrokes — a four-digit balance is
 * one recompute, not four — and comfortably past every kind of repeat: key
 * autorepeat is ~90 ms at the macOS default and ~30 ms at its fastest, and
 * Chrome's number spinner repeats at ~50 ms once held. A slider being
 * scrubbed defers it for as long as the scrubbing lasts.
 *
 * Waiting costs nothing on screen, which is why it can be this long: the
 * results dim and the tab strip's spinner appears on the render that takes
 * the keystroke, so the delay is spent looking busy rather than looking
 * broken. It was briefly half this, when a typed value instead held the
 * simulation until it was committed with Enter or a blur. That was accurate
 * about when a value was final and wrong about what a person expects: a
 * field left focused — the normal state after typing a number — kept the
 * page shimmering indefinitely, waiting for a commit the reader had no
 * reason to know was owed. A delay that always ends beats a wait that ends
 * only on the right gesture.
 *
 * Two changes skip it, and neither is a run of repeats: the Advanced dialog
 * flushes when it closes, and a preset pick runs at once
 * (`Timing.flushOn`).
 */
const SIM_DEBOUNCE_MS = 300;

/**
 * The knobs both simulations share: the starting balance, the ceiling, the
 * trial count and the seed. One object because the Compare tab reads exactly
 * the same ones the Bankroll tab does and adds no URL state of its own — the
 * grid is a second reading of the balance already entered, not a second set
 * of controls.
 */
export type BankrollKnobs = {
  startingGems: number;
  startingGold: number;
  startingPlayInPoints: number;
  maxEvents: number;
  runs: number;
  seed: number;
};

export type BankrollSimParams = BankrollKnobs & { config: EventConfig };

/**
 * The same, for several events at once.
 *
 * Carries the names as well as the configs, and `submitCompare` drops them on
 * the way to the worker — the model has never known event names and this does
 * not change that. What they are for is the way back: paired with
 * `resultParams` below, they let a caller label a settled grid with the
 * selection it was actually computed for, rather than with whatever is
 * selected by the time it renders. That is what lets a stale grid stay on
 * screen while a fresh one computes, instead of blanking.
 *
 * Order is the result's order.
 */
export type CompareSimParams = BankrollKnobs & {
  events: readonly { name: string; config: EventConfig }[];
};

export type SimulationState<T, P> = {
  /** The last settled result; null only before the first ever settles. */
  result: T | null;
  /**
   * The params `result` was computed for, which are not the live ones whenever
   * `pending` is true.
   *
   * A stale result is still a true answer to the question it was asked, and a
   * caller that renders one has to know which question that was. Without this
   * the only safe thing to do with a superseded result is drop it, which is a
   * blank panel for as long as the recompute takes — and at a high trial count
   * that is seconds.
   */
  resultParams: P | null;
  /** True from a params change until the run for those params settles. */
  pending: boolean;
  /** The last failure, kept beside the stale result; cleared by a success. */
  error: unknown;
};

const bankrollOf = (p: BankrollKnobs) => ({
  startingGems: p.startingGems,
  startingGold: p.startingGold,
  startingPlayInPoints: p.startingPlayInPoints,
  maxEvents: p.maxEvents,
});

const submitBankrolls = (p: BankrollSimParams): SimulationHandle<BankrollResult> =>
  simulationClient.simulateBankrolls(p.config, bankrollOf(p), p.runs, p.seed);

const submitCompare = (p: CompareSimParams): SimulationHandle<BankrollSummary[]> =>
  simulationClient.simulateCompare(
    p.events.map((e) => e.config),
    bankrollOf(p),
    p.runs,
    p.seed,
  );

function useSimulation<P, T>(
  params: P,
  submit: (p: P) => SimulationHandle<T>,
  timing: Timing,
): SimulationState<T, P> {
  const submitted = useDebouncedValue(params, SIM_DEBOUNCE_MS, timing);
  const [settled, setSettled] = useState<{ result: T | null; error: unknown; params: P | null }>({
    result: null,
    error: null,
    params: null,
  });
  useEffect(() => {
    const handle = submit(submitted);
    handle.promise.then(
      (result) => setSettled({ result, error: null, params: submitted }),
      (error: unknown) => {
        // A canceled run is a superseded one, not news. A real failure keeps
        // the stale result rendered and says so beside it.
        if (isAbortError(error)) return;
        setSettled((prev) => ({ result: prev.result, error, params: submitted }));
      },
    );
    return () => handle.cancel();
  }, [submitted, submit]);
  return {
    result: settled.result,
    resultParams: settled.params,
    /*
     * Against the live params, not the submitted ones. The debounce hands
     * back the very object it was given, so once the run for the current
     * values settles the two are the same reference and this is false; any
     * change since — held, debounced or in flight — and it is true.
     */
    pending: settled.params !== params,
    error: settled.error,
  };
}

/**
 * @param timing While `hold` is true no run is submitted, whatever the
 *   params do, and a change made under it runs the moment it lifts; a change
 *   arriving with a change to `flushOn` runs at once. Everything else waits
 *   `SIM_DEBOUNCE_MS` — see `Timing`.
 */
export function useSimulateBankrolls(
  params: BankrollSimParams,
  timing: Timing,
): SimulationState<BankrollResult, BankrollSimParams> {
  return useSimulation(params, submitBankrolls, timing);
}

/**
 * The Compare tab's grid: the same balance played out in each selected event,
 * under one seed.
 *
 * Same debounce, same hold, same flush as the single-event run, because the
 * inputs are the same inputs — a keystroke in the starting balance makes both
 * stale at once and neither should recompute until the typing stops.
 *
 * An empty selection goes to the worker like any other and comes back empty.
 * Special-casing it here would be a second path through the cache, the cancel
 * and the pending flag for a job that costs nothing to run.
 *
 * Held while the reader is on another tab — see the call site. The grid is the
 * one simulation nothing off its own tab reads, so running it for a reader who
 * never opens the Compare tab is worker time spent on nothing; holding rather
 * than unmounting is what keeps the last answer on screen when they come back.
 *
 * @param timing As `useSimulateBankrolls`.
 */
export function useSimulateCompare(
  params: CompareSimParams,
  timing: Timing,
): SimulationState<BankrollSummary[], CompareSimParams> {
  return useSimulation(params, submitCompare, timing);
}
