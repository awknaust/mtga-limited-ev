import type { ReactNode } from "react";

/**
 * Settled bankroll results, dimmed under a shimmer sweep while a recompute
 * is in flight. The stale numbers stay legible — they were right a moment
 * ago and are usually close — and the sweep says fresher ones are coming.
 *
 * Everything inside dims, whether or not every part of it depends on the
 * run. Deliberate: one bright element in a dimmed page reads as a rendering
 * bug, not as precision about data freshness.
 */
export function SimPending({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <div className={`sim-results${pending ? " is-pending" : ""}`} aria-busy={pending}>
      {children}
    </div>
  );
}
