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
 * Nothing here refuses, either. Whether the payload was readable at all is
 * settled upstream in `google.ts`, which is where a page of unreadable items
 * becomes a `SourceError`; by the time a `RawEvent` exists it has a title and
 * a date shape, so every one of them resolves to days.
 *
 * Pure: no fetching, so it tests against fixture rows under plain Node.
 */

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

export function buildCalendarFeed(events: RawEvent[], now: Date): CalendarFeed {
  const entries: CalendarEntry[] = [];
  for (const event of events) {
    const span = spanOf(event.start, event.end);
    const note = event.description === null ? "" : stripHtml(event.description);
    entries.push({
      id: event.id,
      title: event.title,
      start: span.start,
      end: span.end,
      ...(note === ""
        ? {}
        : { note: note.length > MAX_NOTE ? `${note.slice(0, MAX_NOTE - 1).trimEnd()}…` : note }),
    });
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
