/**
 * The event-calendar feed the Worker publishes on this origin (see `worker/`).
 *
 * The second of the app's two network calls, and the same shape as the first:
 * kept out of `src/lib` because the model layer does no I/O, same-origin by
 * construction — the path is relative, and the CSP's `connect-src 'self'`
 * would reject anything else. Where the route does not exist (preview
 * deployments, `npm run dev` without the proxy, an outage) this resolves to
 * null and the app stays on the copy of the calendar it shipped with; every
 * failure is deliberately indistinguishable from "no feed".
 *
 * That the *Worker* reaches Google to build this is not a hole in the policy
 * and does not widen it. A CSP governs the page, not the edge; the browser
 * still only ever talks to this origin, and nothing of the calendar's source —
 * its owner, its id, Google's event shape — survives the Worker's
 * normalisation.
 */

import { parseCalendarFeed, type CalendarFeed } from "./lib";

/**
 * How long the first render waits for the calendar before painting without it.
 *
 * The same second the box feed gets, and for the same reasons — but the two
 * are fetched together, so this adds nothing to the worst case rather than
 * doubling it. Where it elapses the app mounts on the shipped copy and does
 * not go back: the strip sits above everything else on the page, so a late
 * arrival would push the whole layout down a second after the reader started
 * looking at it.
 */
export const CALENDAR_FEED_BUDGET_MS = 1000;

export async function fetchCalendarFeed(signal?: AbortSignal): Promise<CalendarFeed | null> {
  try {
    const res = await fetch("/api/calendar", { signal });
    if (!res.ok) return null;
    return parseCalendarFeed(await res.json());
  } catch {
    return null;
  }
}
