/**
 * The deployment of the two feed modules, and nothing more: crons that refresh
 * the KV copy of each, and a fetch handler that serves them.
 *
 * Everything about *what* a feed is — which sets, which products, which
 * calendar, what the payload looks like — lives in `scripts/box-prices/` and
 * `scripts/calendar/`, imported relatively rather than copied, so fixing a
 * module fixes the Worker and the `npm run` inspection script in the same
 * motion. This file only knows where each feed is stored and how it is served.
 *
 * The calendar half reaches Google, which is worth being explicit about: the
 * app's CSP says `connect-src 'self'` and that is not amended for this. A CSP
 * governs the page, not the edge. The browser talks only to this origin; the
 * Worker is what talks to Google, and what it stores has been normalised to
 * this repository's own shape, so neither the calendar's owner nor Google's
 * event format reaches a reader.
 */

import { fetchBoxPriceFeed } from "../../scripts/box-prices/fetch.ts";
import { fetchCalendarFeed } from "../../scripts/calendar/fetch.ts";
import { SourceError } from "../../scripts/shared/http.ts";

const BOX_PRICES_KEY = "box-prices:v1";
const CALENDAR_KEY = "calendar:v1";

/** Build the box-price feed, store it, return the JSON body that was stored. */
async function refreshBoxPrices(env: Env): Promise<string> {
  const feed = await fetchBoxPriceFeed();
  const body = JSON.stringify(feed);
  await env.BOX_PRICES.put(BOX_PRICES_KEY, body);
  console.log(
    JSON.stringify({
      event: "refreshed",
      feed: "box-prices",
      sets: feed.boxes.length,
      unmatched: feed.unmatched,
      generatedAt: feed.generatedAt,
    }),
  );
  return body;
}

/** The same for the event calendar. */
async function refreshCalendar(env: Env): Promise<string> {
  const feed = await fetchCalendarFeed(env.GOOGLE_CALENDAR_ID, env.GOOGLE_API_KEY);
  const body = JSON.stringify(feed);
  await env.CALENDAR.put(CALENDAR_KEY, body);
  console.log(
    JSON.stringify({
      event: "refreshed",
      feed: "calendar",
      entries: feed.entries.length,
      generatedAt: feed.generatedAt,
    }),
  );
  return body;
}

/**
 * What each route serves, and what rebuilds it on a miss.
 *
 * A map rather than a chain of path tests, so adding a third feed is a line
 * here and a cron below. The route pattern is `mtga.fyi/api/*`, so every path
 * under it already arrives at this Worker; anything not named here 404s.
 */
const ROUTES: Record<
  string,
  { key: string; kv: (env: Env) => KVNamespace; refresh: (env: Env) => Promise<string> }
> = {
  "/api/box-prices": {
    key: BOX_PRICES_KEY,
    kv: (env) => env.BOX_PRICES,
    refresh: refreshBoxPrices,
  },
  "/api/calendar": {
    key: CALENDAR_KEY,
    kv: (env) => env.CALENDAR,
    refresh: refreshCalendar,
  },
};

/** Which cron expression drives which refresh. */
const SCHEDULE: Record<string, (env: Env) => Promise<string>> = {
  "23 21 * * *": refreshBoxPrices,
  "41 9 * * *": refreshCalendar,
};

export default {
  /**
   * The daily refreshes. Thrown errors are the intended failure mode: the run
   * shows as failed in observability, and the previous KV value keeps
   * serving — a source outage degrades a feed to yesterday's copy, which for
   * street prices is no degradation at all and for a calendar is a day's lag.
   *
   * Dispatched on which cron fired rather than run together, and that is a
   * budget rather than tidiness: the box-price refresh already spends about 42
   * of the free plan's 50 subrequests, and the calendar's paging can want up to
   * four. Sharing an invocation would leave no headroom at all.
   */
  async scheduled(controller, env, _ctx) {
    const refresh = SCHEDULE[controller.cron];
    if (refresh === undefined) {
      console.error(JSON.stringify({ event: "unknown-cron", cron: controller.cron }));
      return;
    }
    await refresh(env);
  },

  /**
   * GET /api/box-prices, GET /api/calendar — the stored feeds.
   *
   * On a KV miss (only ever the first request after the first deploy, before
   * the cron has fired) it builds the feed inline rather than 503ing a
   * freshly shipped app. Concurrent misses would each fetch the sources once;
   * the writes are idempotent and the window is minutes long, once.
   */
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname];
    if (route === undefined) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json(
        { error: "method not allowed" },
        { status: 405, headers: { allow: "GET, HEAD" } },
      );
    }

    try {
      const body = (await route.kv(env).get(route.key)) ?? (await route.refresh(env));
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "content-type": "application/json",
          // An hour, and it governs two caches rather than one: the browser,
          // so a visitor flipping between tabs does not re-download a feed,
          // and Cloudflare's edge, because Workers Caching reads this very
          // header — the `cache` block in wrangler.jsonc says why, and says
          // it there because this line is the only place a TTL is written.
          // The feeds are rewritten once a day; an hour is well inside that.
          "cache-control": "public, max-age=3600",
        },
      });
    } catch (err) {
      // The app treats any non-OK response as "no feed" and stays on the copy
      // it shipped with, so this only needs to be honest, not clever.
      if (err instanceof SourceError) {
        console.error(
          JSON.stringify({ event: "refresh-failed", path: url.pathname, message: err.message }),
        );
        return Response.json({ error: err.message }, { status: 503 });
      }
      throw err;
    }
  },
} satisfies ExportedHandler<Env>;
