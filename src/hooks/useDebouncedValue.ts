import { useEffect, useRef, useState } from "react";

/**
 * How long after the last input the simulations wait before recomputing.
 * The closed-form figures never wait — they are cheap and answer live.
 */
export const SIM_DEBOUNCE_MS = 300;

/**
 * `value`, trailing-debounced, with a hold.
 *
 * The initial value passes through immediately. While `hold` is true nothing
 * propagates and no timer exists — the Advanced dialog holds its edits until
 * it closes — and on release a changed value flushes on a 0 ms timer rather
 * than waiting out the delay again. An unchanged value never schedules
 * anything (`Object.is`), so an untouched open-and-close is free.
 *
 * No `maxWait` on purpose: scrubbing a slider defers the simulations for as
 * long as the scrubbing lasts, which is fine because every closed-form
 * figure keeps answering live while they wait.
 */
export function useDebouncedValue<T>(value: T, delayMs: number, hold = false): T {
  const [debounced, setDebounced] = useState(value);
  const wasHeld = useRef(false);
  useEffect(() => {
    if (hold) {
      wasHeld.current = true;
      return;
    }
    const releasing = wasHeld.current;
    wasHeld.current = false;
    if (Object.is(value, debounced)) return;
    const timer = window.setTimeout(() => setDebounced(value), releasing ? 0 : delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs, hold, debounced]);
  return debounced;
}
