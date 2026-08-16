import type { ReactNode } from "react";

/**
 * Settled results, dimmed under a shimmer sweep while a recompute is in
 * flight. The stale numbers stay legible — they were right a moment ago and
 * are usually close — and the sweep says fresher ones are coming.
 *
 * Everything inside dims, including the closed-form EvCurveChart that is in
 * fact still live. Deliberate: one bright chart in a dimmed page reads as a
 * rendering bug, not as precision about data freshness.
 */
export function SimPending({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <div className={`sim-results${pending ? " is-pending" : ""}`} aria-busy={pending}>
      {children}
    </div>
  );
}
