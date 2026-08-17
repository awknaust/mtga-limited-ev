import { useEffect, useRef, useState } from "react";

/**
 * How a debounced value's changes are timed, beyond the delay itself: one
 * way to suspend it, and one way to skip the delay for a change.
 *
 * `hold` is a batch: nothing propagates while it is true, and when it drops
 * a changed value flushes at once, on a 0 ms timer, rather than waiting out
 * the delay again — whoever released the hold has finished, and the point
 * was to apply everything together. The Advanced dialog is this.
 *
 * `flushOn` names a change that should not wait: when it differs from what
 * it was the last time a change was timed, that change goes at once. It is
 * compared, not read — pass the thing whose change means "now", not a flag
 * that would need resetting. A preset pick is this: one deliberate commit
 * with no run of repeats behind it, for which the delay would be latency
 * and nothing else, and the preset's name moves exactly when one is picked.
 * A bump with no change to the value is consumed and times nothing.
 */
export type Timing = {
  hold?: boolean;
  flushOn?: unknown;
};

/**
 * `value`, trailing-debounced, timed as above.
 *
 * The initial value passes through immediately. An unchanged value never
 * schedules anything (`Object.is`), so a hold taken and released around
 * nothing is free.
 *
 * No `maxWait` on purpose: typing, or scrubbing a slider, defers the
 * debounced value for as long as it lasts, which is fine because whatever
 * reads the live value keeps answering meanwhile — here every closed-form
 * figure, the URL, and the pending state that says the rest is stale.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number,
  { hold = false, flushOn }: Timing = {},
): T {
  const [debounced, setDebounced] = useState(value);
  const wasHeld = useRef(false);
  const lastFlushOn = useRef(flushOn);
  useEffect(() => {
    if (hold) {
      wasHeld.current = true;
      return;
    }
    const releasing = wasHeld.current;
    wasHeld.current = false;
    const flushing = !Object.is(flushOn, lastFlushOn.current);
    lastFlushOn.current = flushOn;
    if (Object.is(value, debounced)) return;
    const timer = window.setTimeout(
      () => setDebounced(value),
      releasing || flushing ? 0 : delayMs,
    );
    return () => window.clearTimeout(timer);
  }, [value, delayMs, hold, flushOn, debounced]);
  return debounced;
}
