/**
 * The feed's payload: the calendar as whole days, with nothing of Google's
 * shape left in it.
 *
 * Two things happen here and both are normalisation rather than modelling.
 * Every entry is flattened to a span of days, because the app draws day-wide
 * bars and an hour is not a thing it can show. And every description is
 * reduced to text, because Google's is documented to carry HTML.
 *
 * What is deliberately *not* decided here: which entries are worth showing,
 * what window the reader sees, what any of them mean. The window this feed
 * covers is a fetch budget (`fetch.ts`); the window the reader sees is the
 * app's (`src/lib/calendar.ts`). Keeping those apart is what lets the copy the
 * app ships stay correct as it ages — it is clipped from the day it is read,
 * not the day it was written.
 *
 * One refusal lives here, mirroring the one in `google.ts`. Events arriving
 * and *none* of them carrying a recognised `eventType` is the annotation
 * scheme having broken — a copier bug, a property renamed — and publishing
 * that would replace a working calendar with a blank that looks exactly like
 * a quiet week. A single typo'd event, by contrast, is simply dropped.
 *
 * Pure: no fetching, so it tests against fixture rows under plain Node.
 */

import { decodeHTML } from "entities";
import striptags from "striptags";

import { isCalendarEventType, type CalendarEventType } from "../../src/lib/calendarEventTypes.ts";
import { SourceError } from "../shared/http.ts";
import { isoDate } from "../shared/dates.ts";
import type { RawEvent, RawTime } from "./google.ts";

export type CalendarEntry = {
  /**
   * A row key derived from Google's event id — unique per calendar and
   * stable across runs, so the checked-in copy diffs only when the calendar
   * moves — but not the id itself: see `rowKey`.
   */
  id: string;
  title: string;
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Exclusive, `YYYY-MM-DD`. A one-day entry ends on the following day. */
  end: string;
  /** Description as plain text, absent when there was none worth carrying. */
  note?: string;
  /**
   * The author's category — the copier's
   * `extendedProperties.shared.mtgaEventType`, held to the closed set in
   * `src/lib/calendarEventTypes.ts`. The one channel there is: cowork's
   * `[mtga-meta]` description blocks are consumed by the copier
   * (`apps-script/`) at the staging boundary and never reach this feed.
   * Always present: an event whose annotation is missing or names a type
   * not on the list never becomes an entry at all.
   */
  type: CalendarEventType;
};

export type CalendarFeed = {
  version: 1;
  /** ISO timestamp of the run that built the payload. */
  generatedAt: string;
  entries: CalendarEntry[];
};

/**
 * How much of a description rides along. It is tooltip text, and a tooltip
 * that has to be scrolled is one nobody reads.
 */
const MAX_NOTE = 200;

/** A `YYYY-MM-DD` shifted by whole days, through the local calendar. */
function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + delta));
}

/**
 * The days an entry covers, as an inclusive start and an exclusive end.
 *
 * All-day events pass through: Google documents `end` as exclusive already, so
 * a one-day event arrives as the 21st to the 22nd and that is exactly what is
 * wanted.
 *
 * A timed event has to be widened to the days it touches, and the bump is the
 * part worth stating. An event running 10:00 to 18:00 on the 21st has both
 * ends on the 21st; taken literally that is a zero-width bar, so the exclusive
 * end becomes the 22nd. The exception is an end at exactly midnight, which is
 * already the boundary — 10:00 on the 21st to 00:00 on the 22nd covers one
 * day, not two, and bumping it would draw an extra one. Midnight is read in
 * the offset the timestamp carries, which is the same frame the date is
 * sliced in.
 */
function spanOf(start: RawTime, end: RawTime): { start: string; end: string } {
  const from = "day" in start ? start.day : start.time.slice(0, 10);
  let to: string;
  if ("day" in end) {
    to = end.day;
  } else {
    const day = end.time.slice(0, 10);
    to = /T00:00:00/.test(end.time) ? day : addDays(day, 1);
  }
  // A floor rather than a rule: an end at or before its start is a calendar
  // nobody meant to write, and a bar of zero or negative width is one the
  // reader cannot see at all. One day is the smallest honest answer.
  return { start: from, end: to > from ? to : addDays(from, 1) };
}

/**
 * Google's description reduced to one line of text.
 *
 * `description` "can contain HTML" per the documentation. React escapes it, so
 * this is tidiness rather than a hole — but a tooltip reading
 * `<p>Runs all weekend</p>` is not what anyone wants. `striptags` takes the
 * markup (every removed tag becomes a space, which is what keeps two
 * paragraphs from running together as one word) and `entities` decodes the
 * whole entity vocabulary — a home-rolled table here once knew five names and
 * would have shown a reader `&mdash;` verbatim. Both are dependency-free and
 * run in the Workers runtime, which anything this module imports must.
 *
 * Order matters and is load-bearing: tags are stripped while entities are
 * still encoded, then everything is decoded in one pass — so an escaped
 * entity in the source (`&amp;lt;`) survives as the text it was rather than
 * being decoded twice into a tag and stripped.
 */
function stripHtml(html: string): string {
  return decodeHTML(striptags(html, [], " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The published row key: a one-way hash of Google's event id.
 *
 * The raw id was the one Google field that survived into the payload, against
 * this module's own charter of leaving nothing of Google's shape in it. An id
 * alone fetches nothing — every read needs the calendar id and a key — but a
 * public feed has no business republishing another system's internal
 * identifiers. SHA-256 through Web Crypto, the standard hash both runtimes
 * ship, and deterministic on purpose: a random UUID would also key the rows,
 * but every `--write` would then rewrite every id and bury the checked-in
 * copy's real changes in churn. Truncated to 64 bits — ample for a calendar's
 * scale, and short enough that the copy stays readable. The `await` this
 * costs is why `buildCalendarFeed` is async.
 */
async function rowKey(id: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return [...new Uint8Array(digest, 0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildCalendarFeed(events: RawEvent[], now: Date): Promise<CalendarFeed> {
  const entries: CalendarEntry[] = [];
  for (const event of events) {
    const span = spanOf(event.start, event.end);
    // The one type channel. Null is a verdict on the whole event: an entry
    // with no recognised type is skipped entirely — untyped events are not
    // possible — so a typo'd annotation costs the calendar one entry rather
    // than failing the feed or inventing a lane.
    const type =
      event.eventTypeProperty !== null && isCalendarEventType(event.eventTypeProperty)
        ? event.eventTypeProperty
        : null;
    if (type === null) continue;
    const note = event.description === null ? "" : stripHtml(event.description);
    entries.push({
      id: await rowKey(event.id),
      title: event.title,
      start: span.start,
      end: span.end,
      type,
      ...(note === ""
        ? {}
        : { note: note.length > MAX_NOTE ? `${note.slice(0, MAX_NOTE - 1).trimEnd()}…` : note }),
    });
  }

  // The refusal the module doc states: all events arriving untyped is the
  // annotation scheme broken, not a quiet week, and yesterday's KV value
  // serving on is the better outcome.
  if (events.length > 0 && entries.length === 0) {
    throw new SourceError(
      `calendar: ${events.length} events, none carrying a recognised ` +
        "extendedProperties.shared.mtgaEventType — refusing to publish a blank calendar",
    );
  }

  // Earliest first, then the shorter of two that start together, then by title
  // so the ordering is total: the payload is written to a file the repository
  // tracks, and a stable sort is what keeps that diff to what actually moved.
  entries.sort(
    (a, b) =>
      (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) ||
      (a.end < b.end ? -1 : a.end > b.end ? 1 : 0) ||
      (a.title < b.title ? -1 : a.title > b.title ? 1 : 0),
  );

  return { version: 1, generatedAt: now.toISOString(), entries };
}
