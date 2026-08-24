/**
 * The orchestration: one calendar in, one feed out.
 *
 * This is the module's front door and the only function the Worker calls. Any
 * page failing fails the whole feed, and the Worker turns that into "keep
 * serving yesterday's KV value" — a calendar a day old is no worse than one
 * that is missing its second half.
 *
 * The credentials arrive as arguments rather than off the environment. The
 * Worker passes `env.*`, the driver passes `process.env.*`, and this module
 * stays in the half of `scripts/` that has to typecheck under Workers globals
 * as well as Node's — the same rule that keeps `node:fs` confined to `main.ts`.
 *
 * Raw `fetch` against the one endpoint, not a Google client library, and the
 * constraint is the line above: this module deploys to the Workers runtime,
 * and the official clients — `googleapis`, or the per-API
 * `@googleapis/calendar` — are Node programs (gaxios, google-auth-library,
 * streams) that do not run there. Adopting one would fork the single code
 * path the driver and the Worker share. Nor would it retire `google.ts`: a
 * client's types state what Google promises, and the validation there exists
 * because this feed does not publish on a promise.
 */

import { SourceError, request } from "../shared/http.ts";
import { buildCalendarFeed, type CalendarFeed } from "./feed.ts";
import { extractEvents, type RawEvent } from "./google.ts";

const API_BASE = "https://www.googleapis.com/calendar/v3/calendars";

/**
 * How much calendar the feed carries, and it is a fetch budget rather than a
 * view. The app clips to its own, narrower window — from the day the page is
 * opened, not the day the feed was built — so the extra months here are what
 * keep the copy the app ships from losing its forward horizon as it ages. A
 * three-week-old copy fetched to a +60d horizon would show only 39 days ahead;
 * fetched to +120d and clipped on read, it still shows the full window.
 */
export const WINDOW_BACK_DAYS = 31;
export const WINDOW_AHEAD_DAYS = 120;

/**
 * The documented ceiling. The default is 250, and either is far above a
 * calendar of Arena events — five months of them, with a weekly series
 * expanded by `singleEvents`, is tens — but asking for the maximum makes the
 * paging below the belt-and-braces it should be rather than the mechanism.
 */
const PAGE_SIZE = 2500;

/**
 * How many pages before this gives up rather than publishes.
 *
 * A calendar that genuinely runs past 10,000 entries in five months is not the
 * calendar this feed was built for, and the alternative to stopping is a loop
 * with no bound at all. Stopping is a `SourceError`, not a truncated publish:
 * a timeline that quietly ends three months in looks entirely correct, which
 * is the one failure nobody would notice.
 */
const MAX_PAGES = 4;

const shiftDays = (from: Date, delta: number): Date =>
  new Date(from.getTime() + delta * 24 * 60 * 60 * 1000);

/**
 * One request to the source, injectable so the paging below can be tested
 * against canned pages. Stubbed by argument rather than by mocking the module,
 * which is how the rest of `scripts/` is tested (`registry.test.ts`).
 */
export type CalendarTransport = (url: string, apiKey: string) => Promise<unknown>;

const liveTransport: CalendarTransport = (url, apiKey) =>
  // The key rides in a header, never the query: `request` puts the URL into
  // every SourceError it raises, and those are logged by the Worker and CI.
  request(url, { json: true, headers: { "X-goog-api-key": apiKey } });

export async function fetchCalendarFeed(
  calendarId: string,
  apiKey: string,
  {
    now = new Date(),
    transport = liveTransport,
  }: { now?: Date; transport?: CalendarTransport } = {},
): Promise<CalendarFeed> {
  const events: RawEvent[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      // `timeMin` is an exclusive lower bound on an event's *end*, so an event
      // already running at the boundary is still returned. That is what makes
      // "a week back" mean what it says.
      timeMin: shiftDays(now, -WINDOW_BACK_DAYS).toISOString(),
      timeMax: shiftDays(now, WINDOW_AHEAD_DAYS).toISOString(),
      // Expands a recurring event into its instances, so nothing here has to
      // understand RRULE. `orderBy=startTime` is only available with it.
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(PAGE_SIZE),
      showDeleted: "false",
    });
    if (pageToken !== null) params.set("pageToken", pageToken);

    const url = `${API_BASE}/${encodeURIComponent(calendarId)}/events?${params}`;
    const { events: batch, nextPageToken } = extractEvents(await transport(url, apiKey));
    events.push(...batch);
    if (nextPageToken === null) return buildCalendarFeed(events, now);
    pageToken = nextPageToken;
  }

  throw new SourceError(
    `calendar: still paging after ${MAX_PAGES} pages (${events.length} events) — ` +
      "refusing to publish a calendar that may be cut short",
  );
}
