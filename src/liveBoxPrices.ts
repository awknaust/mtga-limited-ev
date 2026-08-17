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
 */

import { parseBoxPriceFeed, type BoxPriceFeed } from "./lib";

export async function fetchBoxPriceFeed(signal?: AbortSignal): Promise<BoxPriceFeed | null> {
  try {
    const res = await fetch("/api/box-prices", { signal });
    if (!res.ok) return null;
    return parseBoxPriceFeed(await res.json());
  } catch {
    return null;
  }
}
