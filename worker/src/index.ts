/**
 * The deployment of the box-price module, and nothing more: a cron that
 * refreshes the KV copy of the feed, and a fetch handler that serves it.
 *
 * Everything about *what* the feed is — which sets, which products, what the
 * payload looks like — lives in `scripts/box-prices/`, imported relatively
 * rather than copied, so fixing the module fixes the Worker and the
 * `npm run box:prices` inspection script in the same motion. This file only
 * knows where the feed is stored and how it is served.
 */

import { fetchBoxPriceFeed } from "../../scripts/box-prices/fetch.ts";
import { SourceError } from "../../scripts/shared/http.ts";

const KV_KEY = "box-prices:v1";

/** Build the feed, store it, return the JSON body that was stored. */
async function refresh(env: Env): Promise<string> {
  const feed = await fetchBoxPriceFeed();
  const body = JSON.stringify(feed);
  await env.BOX_PRICES.put(KV_KEY, body);
  console.log(
    JSON.stringify({
      event: "refreshed",
      sets: feed.boxes.length,
      unmatched: feed.unmatched,
      generatedAt: feed.generatedAt,
    }),
  );
  return body;
}

export default {
  /**
   * The daily refresh. Thrown errors are the intended failure mode: the run
   * shows as failed in observability, and the previous KV value keeps
   * serving — a source outage degrades the feed to yesterday's prices, which
   * for street prices is no degradation at all.
   */
  async scheduled(_controller, env, _ctx) {
    await refresh(env);
  },

  /**
   * GET /api/box-prices — the stored feed.
   *
   * On a KV miss (only ever the first request after the first deploy, before
   * the cron has fired) it builds the feed inline rather than 503ing a
   * freshly shipped app. Concurrent misses would each fetch the sources once;
   * the writes are idempotent and the window is minutes long, once.
   */
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/box-prices") {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json(
        { error: "method not allowed" },
        { status: 405, headers: { allow: "GET, HEAD" } },
      );
    }

    try {
      const body = (await env.BOX_PRICES.get(KV_KEY)) ?? (await refresh(env));
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "content-type": "application/json",
          // An hour in the browser: the feed changes daily, and a visitor
          // flipping between tabs should not re-download it. No edge caching
          // to reason about — KV reads at this rate are effectively free.
          "cache-control": "public, max-age=3600",
        },
      });
    } catch (err) {
      // The app treats any non-OK response as "no feed" and stays on its
      // baked-in fallback values, so this only needs to be honest, not clever.
      if (err instanceof SourceError) {
        console.error(JSON.stringify({ event: "refresh-failed", message: err.message }));
        return Response.json({ error: err.message }, { status: 503 });
      }
      throw err;
    }
  },
} satisfies ExportedHandler<Env>;
