/**
 * The one network call the app makes: the box-price feed the Worker publishes
 * on this origin (see `worker/`). Kept out of `src/lib` because the model
 * layer does no I/O; the validation and the derivation this feeds are pure and
 * live in `src/lib/boxPrices.ts`.
 *
 * Same-origin by construction — the path is relative, and the CSP's
 * `connect-src 'self'` would reject anything else. Where the route does not
 * exist (preview deployments, `npm run dev` without the proxy, an outage)
 * this resolves to null and the app stays on the copy of the feed it shipped
 * with; every failure is deliberately indistinguishable from "no feed".
 *
 * It is called once, from `main.tsx`, *before* the first render — and the
 * request itself is older than that: `index.html` preloads the same URL, so
 * by the time the script asks, the response has usually been sitting in the
 * browser since before the bundle finished downloading. That is what lets the
 * first paint be the live table rather than the shipped copy corrected a
 * moment later.
 */

import { parseBoxPriceFeed, type BoxPriceFeed } from "./lib";

/**
 * How long the first render waits for the feed before painting on the shipped
 * copy instead.
 *
 * Counted from the moment the script asks, not from the preload — so the
 * request has had the whole bundle download as a head start, and this only
 * elapses when the Worker is failing to answer a KV read that normally takes
 * tens of milliseconds. A second is long enough that a slow edge does not read
 * as an outage, and short enough that an outage is not a blank page for long.
 * When it does elapse the app does not go back for the feed later: the shipped
 * copy is a build old at most, and a late correction is exactly the re-render
 * this arrangement exists to avoid.
 */
export const BOX_FEED_BUDGET_MS = 1000;

export async function fetchBoxPriceFeed(signal?: AbortSignal): Promise<BoxPriceFeed | null> {
  try {
    const res = await fetch("/api/box-prices", { signal });
    if (!res.ok) return null;
    return parseBoxPriceFeed(await res.json());
  } catch {
    return null;
  }
}
