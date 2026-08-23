/**
 * The MTG Arena event calendar, and the window of it the page shows.
 *
 * A Worker (see `worker/`) publishes a Google Calendar at `/api/calendar` on
 * this origin, normalised to whole days and stripped of anything of Google's
 * shape. The feed decides nothing beyond which months it covers; what a reader
 * sees is decided here.
 *
 * Two things this module is, and one it is not. It validates the payload, and
 * it clips the calendar to the window the strip draws — **from the day the
 * page is opened**, never from the day the feed was built. That second point is
 * the whole reason the fetch window (±four months, in `scripts/calendar/`) is
 * wider than this one: a copy of the feed ages, and a window baked in at build
 * time would age with it, showing less and less of the future until it showed
 * none. Clipped on read, a month-old copy still draws a full sixty days ahead
 * — of entries a month old, which is the honest cost of a stale copy and not
 * an empty strip.
 *
 * What it is not is an interpretation. Nothing here reads a title, matches an
 * entry to a preset, or sorts events into kinds. The strip is a timeline, and
 * an entry is a name and a span of days.
 *
 * The pure half, like `boxPrices.ts`: fetching lives in `src/liveCalendar.ts`,
 * so the model layer stays free of side effects. The bottom of the module
 * reads the copy the app ships (`src/data/mtg-calendar.json`) through this
 * same validator, which is what the page stands on where the feed cannot be
 * reached — previews, dev without the proxy, an outage.
 */

import baked from "../data/mtg-calendar.json";

/** One entry: a name, and the days it covers. */
export type CalendarEntry = {
  /** Unique per calendar, which is what makes it a row key. */
  id: string;
  title: string;
  /** Inclusive, `YYYY-MM-DD`. */
  start: string;
  /** Exclusive, `YYYY-MM-DD`. A one-day entry ends on the following day. */
  end: string;
  /** The entry's description as plain text, where it had one. */
  note?: string;
};

export type CalendarFeed = {
  version: 1;
  /** ISO timestamp of the Worker run that built the payload. */
  generatedAt: string;
  entries: CalendarEntry[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a feed payload from the network.
 *
 * Returns null rather than throwing: a malformed feed is equivalent to no
 * feed, and the caller's answer to both is the copy the app shipped. Unknown
 * extra fields pass — the Worker is deployed separately from the app, and a
 * payload from a newer Worker must not read as corrupt to an older app. A
 * malformed *value* fails the whole feed, though, on the same reasoning as
 * `parseBoxPriceFeed`: a date that is not a date, or a span that ends before
 * it starts, means something upstream broke, and drawing around it would
 * launder the breakage into a picture.
 */
export function parseCalendarFeed(data: unknown): CalendarFeed | null {
  if (typeof data !== "object" || data === null) return null;
  const feed = data as Record<string, unknown>;
  if (feed.version !== 1) return null;
  if (typeof feed.generatedAt !== "string") return null;
  if (!Array.isArray(feed.entries)) return null;

  const entries: CalendarEntry[] = [];
  for (const raw of feed.entries as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.id !== "string" || entry.id === "") return null;
    if (typeof entry.title !== "string" || entry.title === "") return null;
    if (typeof entry.start !== "string" || !DAY.test(entry.start)) return null;
    if (typeof entry.end !== "string" || !DAY.test(entry.end)) return null;
    // Ends are exclusive, so an entry covering no days at all is not a short
    // entry — it is a producer that has stopped making sense.
    if (entry.end <= entry.start) return null;
    if (entry.note !== undefined && typeof entry.note !== "string") return null;
    entries.push({
      id: entry.id,
      title: entry.title,
      start: entry.start,
      end: entry.end,
      ...(entry.note === undefined ? {} : { note: entry.note }),
    });
  }
  return { version: 1, generatedAt: feed.generatedAt, entries };
}

/**
 * A `YYYY-MM-DD` as local midnight.
 *
 * The reason this is a function and not `new Date(iso)`: the built-in parses a
 * bare date as *UTC* midnight, which in every negative-offset zone renders as
 * the previous day. A calendar of all-day entries is nothing but bare dates,
 * so the mistake would not be a rare edge — it would move every bar on the
 * strip by one day for every reader west of Greenwich.
 */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local midnight of the day a moment falls in. */
const startOfDay = (at: Date): Date =>
  new Date(at.getFullYear(), at.getMonth(), at.getDate());

const addDays = (from: Date, delta: number): Date =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + delta);

/**
 * The last day an entry actually covers.
 *
 * `end` is exclusive, which is the right convention for arithmetic and the
 * wrong one for a reader: an entry ending `2026-09-04` runs *to the 3rd*, and
 * a tooltip saying the 4th would be off by one on every multi-day event in the
 * calendar. The one place that conversion is made.
 */
export const lastDayOf = (entry: CalendarEntry): Date => addDays(parseDay(entry.end), -1);

/**
 * How much calendar the strip shows, and the one place it is decided.
 *
 * A week behind, because an event that ended on Tuesday is still worth seeing
 * on Thursday, and two months ahead, because that is about as far as Arena's
 * schedule is announced. Both are measured from the day the page is opened.
 */
export const WINDOW_BACK_DAYS = 7;
export const WINDOW_AHEAD_DAYS = 60;

/** One entry as the strip draws it: clipped to the window, and placed in time. */
export type CalendarBar = {
  entry: CalendarEntry;
  /** The drawn span, clamped to the window. */
  from: Date;
  to: Date;
  /** Whether the entry runs on past the edge it was clamped to. */
  clippedStart: boolean;
  clippedEnd: boolean;
  state: "past" | "now" | "upcoming";
};

export type CalendarView = {
  bars: CalendarBar[];
  /** The time axis: `[today − WINDOW_BACK_DAYS, today + WINDOW_AHEAD_DAYS]`. */
  domain: [Date, Date];
  /** Local midnight today, which is where the marker line goes. */
  today: Date;
  /** When the feed this was read from was built. */
  generatedAt: string;
};

/**
 * The feed clipped to the window, in the order it is drawn.
 *
 * An entry overlapping the window at all is kept and clamped to it, rather
 * than dropped: an event that started three weeks ago and runs until next
 * month is exactly the thing a reader wants to see is still on, and dropping
 * it for beginning out of shot would be the one answer that is plainly wrong.
 * `clippedStart` and `clippedEnd` say which ends are the window's rather than
 * the entry's, so the strip can mark them rather than imply an event begins
 * the day the axis does.
 */
export function calendarWindow(feed: CalendarFeed, now: Date): CalendarView {
  const today = startOfDay(now);
  const from = addDays(today, -WINDOW_BACK_DAYS);
  const to = addDays(today, WINDOW_AHEAD_DAYS);

  const bars: CalendarBar[] = [];
  for (const entry of feed.entries) {
    const start = parseDay(entry.start);
    const end = parseDay(entry.end);
    // Half-open on both sides: an entry whose exclusive end is the first
    // moment of the window covers no day inside it.
    if (end <= from || start >= to) continue;
    bars.push({
      entry,
      from: start < from ? from : start,
      to: end > to ? to : end,
      clippedStart: start < from,
      clippedEnd: end > to,
      state: end <= today ? "past" : start <= today ? "now" : "upcoming",
    });
  }

  // Sorted here rather than trusted from the feed: the copy the app ships is a
  // file, and a file can be older than the rule that ordered it.
  bars.sort(
    (a, b) =>
      a.from.getTime() - b.from.getTime() ||
      a.to.getTime() - b.to.getTime() ||
      (a.entry.title < b.entry.title ? -1 : a.entry.title > b.entry.title ? 1 : 0),
  );

  return { bars, domain: [from, to], today, generatedAt: feed.generatedAt };
}

/*
 * The copy the app ships with.
 *
 * `src/data/mtg-calendar.json` is the Worker's payload as it stood when the
 * build was made, read through the same validator the live payload passes, so
 * the copy is trusted exactly as far as the network is. It is written by
 * `npm run calendar -- --write`. A copy that will not parse is a build that
 * must not ship, and the throw is what makes `npm test` say so before it can.
 *
 * Unlike the box-price fallback there is no "as of" reading to do: the window
 * is taken from the day the page is opened, so this is simply the entries,
 * however old the file is.
 */
export const FALLBACK_CALENDAR: CalendarFeed = (() => {
  const feed = parseCalendarFeed(baked);
  if (feed === null) throw new Error("src/data/mtg-calendar.json is not a calendar feed");
  return feed;
})();
