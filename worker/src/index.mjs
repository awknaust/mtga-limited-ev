/**
 * Handlers: a cron that refreshes the KV feed, and a fetch that serves it.
 *
 * The source-reading modules are imported from `scripts/refresh-constants/`
 * rather than copied. That directory is the single place this repository
 * knows how to read Wizards' pages, Scryfall and MTGGoldfish, and a second
 * copy here would drift from it the first time either was fixed alone. The
 * modules are plain fetch-and-regex with no Node imports, which is what makes
 * them portable to the Workers runtime unchanged.
 */

import { SourceError } from "../../scripts/refresh-constants/errors.mjs";
import { createSources } from "../../scripts/refresh-constants/sources.mjs";
import { KV_KEY, buildDataset } from "./dataset.mjs";

/** Fetch both feeds, build the payload, store it. Returns the JSON body. */
async function refresh(env) {
  const sources = createSources();
  const [prices, sets] = await Promise.all([sources.boxPrices(), sources.sets()]);
  const dataset = buildDataset(prices, sets, new Date());
  const body = JSON.stringify(dataset);
  await env.BOX_PRICES.put(KV_KEY, body);
  console.log(
    JSON.stringify({
      event: "refreshed",
      sets: dataset.boxes.length,
      unmatched: dataset.unmatched,
      generatedAt: dataset.generatedAt,
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
};
