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
 * scheme having broken — a bulk edit gone wrong, a format change — and
 * publishing that would replace a working calendar with a blank that looks
 * exactly like a quiet week. A single typo'd event, by contrast, is simply
 * dropped: see `readEventType`.
 *
 * Pure: no fetching, so it tests against fixture rows under plain Node.
 */

import { isCalendarEventType, type CalendarEventType } from "../../src/lib/calendarEventTypes.ts";
import { SourceError } from "../shared/http.ts";
import { isoDate } from "../shared/dates.ts";
import type { RawEvent, RawTime } from "./google.ts";

export type CalendarEntry = {
  /** Google's event id — unique per calendar, so it keys a row. */
  id: string;
  title: string;
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Exclusive, `YYYY-MM-DD`. A one-day entry ends on the following day. */
  end: string;
  /** Description as plain text, absent when there was none worth carrying. */
  note?: string;
  /**
   * The author's category — `eventType` from the description's `[mtga-meta]`
   * block, held to the closed set in `src/lib/calendarEventTypes.ts`. Always present:
   * an event whose block is missing, unreadable, or names a type not on the
   * list never becomes an entry at all.
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
 * `<p>Runs all weekend</p>` is not what anyone wants. `&amp;` is decoded last
 * so that an escaped entity in the source (`&amp;lt;`) survives as the text it
 * was rather than being decoded twice into a tag.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The machine-readable tail of a description:
 * `[mtga-meta]{"v":1,"eventType":"qualifier"}[/mtga-meta]`.
 *
 * The calendar author's own annotation, carried in the description because a
 * Google Calendar event has nowhere else to put structured data. Matched
 * *after* `stripHtml`, deliberately: an edit made in Google's UI can turn the
 * description to HTML and its quotes to `&quot;`, and the strip's entity
 * decoding is what restores the JSON before this ever sees it.
 */
const META = /\[mtga-meta\](.*?)\[\/mtga-meta\]/g;

/**
 * The block's `eventType`, or null when no block names a recognised one.
 *
 * Null is a verdict on the whole event: an entry with no recognised type is
 * skipped entirely — untyped events are not possible — so a typo'd annotation
 * costs the calendar one entry rather than failing the feed or inventing a
 * lane. The first block naming a type on the list wins; unreadable blocks
 * and unknown tokens are passed over (and stripped from the note regardless).
 */
function readEventType(text: string): CalendarEventType | null {
  for (const match of text.matchAll(META)) {
    try {
      const meta = JSON.parse(match[1]) as unknown;
      if (typeof meta !== "object" || meta === null) continue;
      const type = (meta as Record<string, unknown>).eventType;
      if (typeof type === "string") {
        const token = type.trim();
        if (isCalendarEventType(token)) return token;
      }
    } catch {
      // Fall through to the next block, if any.
    }
  }
  return null;
}

export function buildCalendarFeed(events: RawEvent[], now: Date): CalendarFeed {
  const entries: CalendarEntry[] = [];
  for (const event of events) {
    const span = spanOf(event.start, event.end);
    const text = event.description === null ? "" : stripHtml(event.description);
    const type = readEventType(text);
    if (type === null) continue;
    // The meta is for machines and must never surface in a tooltip — readable
    // or not — and it is removed *before* the length cap so a truncated note
    // can never end mid-block with the tail of one showing.
    const note = text.replace(META, " ").replace(/\s+/g, " ").trim();
    entries.push({
      id: event.id,
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
      `calendar: ${events.length} events, none carrying a recognised [mtga-meta] eventType — ` +
        "refusing to publish a blank calendar",
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
