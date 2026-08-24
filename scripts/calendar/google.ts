/**
 * The source adapter: Google's `events.list` payload in, flat rows out.
 *
 * Extraction only. Nothing here decides what a calendar entry *means* — not
 * which days it covers, not what order the entries go in, not whether a
 * description is worth keeping. That is `feed.ts`, and keeping the two apart
 * is what lets this be tested against a captured payload without a network.
 *
 * The one judgement here is the difference between a row this code cannot read
 * and a *payload* this code cannot read. A row that is missing a title, or
 * carries a date in a shape that is not a date, is skipped: calendars collect
 * odd entries and one of them is not a reason to stop publishing. A payload
 * that is not an event list at all — the `{error:{…}}` body a rejected key
 * returns, an HTML interstitial — is a `SourceError`, because continuing from
 * it would publish an empty calendar that looks exactly like a quiet week.
 */

import { SourceError } from "../shared/http.ts";

/**
 * A point on the calendar as the source gives it: either a whole day, or an
 * instant. Which of the two an entry uses is Google's business — `feed.ts`
 * flattens both to days — so it is carried rather than resolved here.
 */
export type RawTime = { day: string } | { time: string };

/** One event, narrowed but not yet interpreted. */
export type RawEvent = {
  id: string;
  title: string;
  start: RawTime;
  end: RawTime;
  /** Raw `description`, HTML and all. `feed.ts` is what strips it. */
  description: string | null;
  /**
   * `extendedProperties.shared.mtgaEventType`, when the event carries one —
   * the channel the calendar copier writes (`apps-script/`). Carried raw:
   * whether the token names a recognised type is `feed.ts`'s call, exactly
   * as it is for the description this fell back from.
   */
  eventTypeProperty: string | null;
};

export type EventPage = {
  events: RawEvent[];
  /**
   * Google's cursor, or null on the last page.
   *
   * The only signal of completeness there is. A short page is *not* evidence
   * there is no more — the documentation is explicit that a page "may be less
   * than this value, or none at all, even if there are more events matching
   * the query" — so `fetch.ts` follows this until it is null rather than
   * reasoning about counts.
   */
  nextPageToken: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** RFC3339, which is what `dateTime` is documented to be. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * The copier's annotation, out of `extendedProperties.shared`. Absent far
 * more often than present — the staging calendar has never had one — and
 * narrowed like every other field: a shape that is not a non-empty string is
 * null rather than an error, because one odd event is not a broken payload.
 */
function readSharedEventType(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const shared = (value as Record<string, unknown>).shared;
  if (typeof shared !== "object" || shared === null) return null;
  const token = (shared as Record<string, unknown>).mtgaEventType;
  return typeof token === "string" && token.trim() !== "" ? token.trim() : null;
}

/** A `start` or `end` object, or null if it is neither shape. */
function readTime(value: unknown): RawTime | null {
  if (typeof value !== "object" || value === null) return null;
  const at = value as Record<string, unknown>;
  if (typeof at.date === "string" && DAY.test(at.date)) return { day: at.date };
  if (typeof at.dateTime === "string" && INSTANT.test(at.dateTime)) {
    return { time: at.dateTime };
  }
  return null;
}

export function extractEvents(payload: unknown): EventPage {
  if (typeof payload !== "object" || payload === null) {
    throw new SourceError("calendar: response is not an object");
  }
  const body = payload as Record<string, unknown>;
  if (body.kind !== "calendar#events") {
    throw new SourceError(
      `calendar: expected kind "calendar#events", got ${JSON.stringify(body.kind)}`,
    );
  }
  if (!Array.isArray(body.items)) {
    throw new SourceError("calendar: response has no items array");
  }

  const events: RawEvent[] = [];
  /*
   * Items that were not tombstones — the denominator for the guard below.
   *
   * Counted apart from `items.length` so that a page which happens to be all
   * cancelled instances reads as "nothing to show" rather than as a broken
   * parse. `showDeleted=false` means that should not arrive at all, which is
   * exactly why it must not be what decides.
   */
  let live = 0;
  for (const raw of body.items as unknown[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    // A deleted event, or a deleted instance of a recurring one. Google
    // returns these as tombstones carrying little more than an id.
    if (item.status === "cancelled") continue;
    live++;
    if (typeof item.id !== "string" || item.id === "") continue;
    if (typeof item.summary !== "string" || item.summary.trim() === "") continue;
    const start = readTime(item.start);
    const end = readTime(item.end);
    if (start === null || end === null) continue;
    events.push({
      id: item.id,
      title: item.summary.trim(),
      start,
      end,
      description: typeof item.description === "string" ? item.description : null,
      eventTypeProperty: readSharedEventType(item.extendedProperties),
    });
  }

  /*
   * The floor under "the parse worked", and it is narrow on purpose.
   *
   * An empty calendar is a real state — a quiet fortnight is not an outage —
   * so a page with no live items publishes happily and the strip renders
   * nothing. What cannot pass is live items arriving and none of them being
   * readable: that is a field renamed upstream, and publishing it would
   * replace a working calendar with a blank one that looks exactly like a
   * quiet week. A single readable event is enough to clear it, because one
   * odd entry among many is a calendar, not a broken parse.
   */
  if (live > 0 && events.length === 0) {
    throw new SourceError(
      `calendar: ${live} events, none of them readable — the source has probably changed shape`,
    );
  }

  return {
    events,
    nextPageToken:
      typeof body.nextPageToken === "string" && body.nextPageToken !== ""
        ? body.nextPageToken
        : null,
  };
}
