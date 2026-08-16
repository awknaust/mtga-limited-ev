/**
 * The simulations as hooks: submit to the worker on parameter change, cancel
 * the superseded run, and report what settled.
 *
 * Each hook takes one params object. The caller builds it with `useMemo`
 * from the live pieces and debounces the object itself, so a flush is
 * atomic — no render can pair this keystroke's trials with the last one's
 * seed — and the effect needs exactly one dependency.
 */

import { useEffect, useState } from "react";

import type { BankrollResult } from "../lib/bankroll";
import type { EventConfig, SimResult } from "../lib/types";
import { simulationClient } from "../worker/client";
import { isAbortError } from "../worker/protocol";
import type { SimulationHandle } from "../worker/protocol";

export type EventSimParams = {
  config: EventConfig;
  trials: number;
  seed: number;
};

export type BankrollSimParams = {
  config: EventConfig;
  startingGems: number;
  startingGold: number;
  maxEvents: number;
  runs: number;
  seed: number;
};

export type SimulationState<T> = {
  /** The last settled result; null only before the first ever settles. */
  result: T | null;
  /** True from a params change until its run settles. */
  pending: boolean;
  /** The last failure, kept beside the stale result; cleared by a success. */
  error: unknown;
};

const submitEvent = (p: EventSimParams): SimulationHandle<SimResult> =>
  simulationClient.simulate(p.config, p.trials, p.seed);

const submitBankrolls = (p: BankrollSimParams): SimulationHandle<BankrollResult> =>
  simulationClient.simulateBankrolls(
    p.config,
    { startingGems: p.startingGems, startingGold: p.startingGold, maxEvents: p.maxEvents },
    p.runs,
    p.seed,
  );

function useSimulation<P, T>(params: P, submit: (p: P) => SimulationHandle<T>): SimulationState<T> {
  const [settled, setSettled] = useState<{ result: T | null; error: unknown; params: P | null }>({
    result: null,
    error: null,
    params: null,
  });
  useEffect(() => {
    const handle = submit(params);
    handle.promise.then(
      (result) => setSettled({ result, error: null, params }),
      (error: unknown) => {
        // A canceled run is a superseded one, not news. A real failure keeps
        // the stale result rendered and says so beside it.
        if (isAbortError(error)) return;
        setSettled((prev) => ({ result: prev.result, error, params }));
      },
    );
    return () => handle.cancel();
  }, [params, submit]);
  return {
    result: settled.result,
    pending: settled.params !== params,
    error: settled.error,
  };
}

export function useSimulate(params: EventSimParams): SimulationState<SimResult> {
  return useSimulation(params, submitEvent);
}

export function useSimulateBankrolls(params: BankrollSimParams): SimulationState<BankrollResult> {
  return useSimulation(params, submitBankrolls);
}
