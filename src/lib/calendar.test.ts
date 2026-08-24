/**
 * The calendar feed's validator and the window the strip draws from it.
 *
 * Every date here is built with the local `Date` constructor rather than
 * parsed from a string, so the suite says the same thing in every timezone —
 * which is the point, since the bug this module exists to prevent is exactly a
 * day's drift between zones. `npm test` under `TZ=Pacific/Auckland` and under
 * `TZ=America/Los_Angeles` must agree.
 */

import { describe, expect, it } from "vitest";

import {
  FALLBACK_CALENDAR,
  WINDOW_AHEAD_DAYS,
  WINDOW_BACK_DAYS,
  calendarWindow,
  parseCalendarFeed,
  parseDay,
  type CalendarFeed,
} from "./calendar";

const entry = (id: string, start: string, end: string, title = id) => ({
  id,
  title,
  start,
  end,
});

const feedOf = (...entries: ReturnType<typeof entry>[]): CalendarFeed => ({
  version: 1,
  generatedAt: "2026-08-23T09:00:00.000Z",
  entries,
});

/** Local noon on 23 August 2026 — the same instant-in-the-day everywhere. */
const NOW = new Date(2026, 7, 23, 12, 0, 0);

describe("parseDay", () => {
  it("reads a bare date as that day, in whatever zone the reader is in", () => {
    /*
     * The trap this function exists for: `new Date("2026-08-21")` is UTC
     * midnight, which is the 20th anywhere west of Greenwich. Asserting the
     * *named* day comes back is the invariant that holds in every zone, and it
     * is false for the built-in in about half of them.
     */
    const day = parseDay("2026-08-21");
    expect(day.getFullYear()).toBe(2026);
    expect(day.getMonth()).toBe(7);
    expect(day.getDate()).toBe(21);
    expect(day.getHours()).toBe(0);
  });

  it("survives a month and a year boundary", () => {
    expect(parseDay("2026-12-31").getDate()).toBe(31);
    expect(parseDay("2027-01-01").getMonth()).toBe(0);
  });
});

describe("parseCalendarFeed", () => {
  it("reads a well-formed payload", () => {
    const feed = parseCalendarFeed({
      version: 1,
      generatedAt: "2026-08-23T09:00:00.000Z",
      entries: [{ id: "a", title: "Premier Draft", start: "2026-08-21", end: "2026-09-04", note: "hi" }],
    });
    expect(feed?.entries).toEqual([
      { id: "a", title: "Premier Draft", start: "2026-08-21", end: "2026-09-04", note: "hi" },
    ]);
  });

  it("accepts an empty calendar", () => {
    expect(parseCalendarFeed(feedOf())?.entries).toEqual([]);
  });

  it("carries an entry's type through, and its absence through too", () => {
    const feed = parseCalendarFeed({
      version: 1,
      generatedAt: "2026-08-23T09:00:00.000Z",
      entries: [
        { id: "a", title: "a", start: "2026-08-21", end: "2026-08-22", type: "qualifier" },
        { id: "b", title: "b", start: "2026-08-21", end: "2026-08-22" },
      ],
    });
    expect(feed?.entries[0].type).toBe("qualifier");
    expect(feed?.entries[1]).not.toHaveProperty("type");
  });

  it("passes fields it does not know", () => {
    // The Worker deploys separately from the app: a newer payload must not
    // read as corrupt to an older bundle.
    const feed = parseCalendarFeed({
      version: 1,
      generatedAt: "2026-08-23T09:00:00.000Z",
      timeZone: "America/Los_Angeles",
      entries: [{ ...entry("a", "2026-08-21", "2026-08-22"), colorId: "5" }],
    });
    expect(feed?.entries).toHaveLength(1);
    expect(feed?.entries[0]).not.toHaveProperty("colorId");
  });

  it.each([
    ["a non-object", 7],
    ["null", null],
    ["a version from the future", { version: 2, generatedAt: "x", entries: [] }],
    ["no timestamp", { version: 1, entries: [] }],
    ["no entries array", { version: 1, generatedAt: "x" }],
  ])("rejects %s", (_label, payload) => {
    expect(parseCalendarFeed(payload)).toBeNull();
  });

  it.each([
    ["an id that is empty", { ...entry("a", "2026-08-21", "2026-08-22"), id: "" }],
    ["a title that is empty", { ...entry("a", "2026-08-21", "2026-08-22"), title: "" }],
    ["a start that is not a date", { ...entry("a", "2026-08-21", "2026-08-22"), start: "soon" }],
    ["an end that is not a date", { ...entry("a", "2026-08-21", "2026-08-22"), end: "2026-8-2" }],
    ["a span that ends where it starts", entry("a", "2026-08-21", "2026-08-21")],
    ["a span that ends before it starts", entry("a", "2026-08-21", "2026-08-20")],
    ["a note that is not a string", { ...entry("a", "2026-08-21", "2026-08-22"), note: 3 }],
    ["a type that is not a string", { ...entry("a", "2026-08-21", "2026-08-22"), type: 7 }],
  ])("fails the whole feed on %s", (_label, bad) => {
    // The same contract as parseBoxPriceFeed: a malformed value means
    // something upstream broke, and drawing around it would launder it.
    expect(parseCalendarFeed(feedOf(bad as ReturnType<typeof entry>))).toBeNull();
  });
});

describe("calendarWindow", () => {
  it("spans a week back and condenses to the end of the last event", () => {
    const { domain, today } = calendarWindow(
      feedOf(entry("a", "2026-08-25", "2026-08-28"), entry("b", "2026-09-01", "2026-09-15")),
      NOW,
    );
    expect(today).toEqual(new Date(2026, 7, 23));
    expect(domain[0]).toEqual(new Date(2026, 7, 23 - WINDOW_BACK_DAYS));
    // The last exclusive end, not two months of mostly blank axis: the final
    // bar sits flush against the right edge with its rounded cap intact.
    expect(domain[1]).toEqual(new Date(2026, 8, 15));
  });

  it("caps the axis at two months ahead however far the schedule runs", () => {
    const { domain } = calendarWindow(feedOf(entry("far", "2026-09-01", "2026-12-01")), NOW);
    expect(domain[1]).toEqual(new Date(2026, 7, 23 + WINDOW_AHEAD_DAYS));
  });

  it("never ends the axis before tomorrow, so the today line stays on it", () => {
    // A feed of nothing but finished events still has to draw them against an
    // axis that contains the marker.
    const { domain } = calendarWindow(feedOf(entry("done", "2026-08-18", "2026-08-21")), NOW);
    expect(domain[1]).toEqual(new Date(2026, 7, 24));
  });

  it("places each entry against today", () => {
    const view = calendarWindow(
      feedOf(
        entry("past", "2026-08-17", "2026-08-19"),
        entry("now", "2026-08-20", "2026-08-25"),
        entry("soon", "2026-09-01", "2026-09-03"),
      ),
      NOW,
    );
    expect(view.bars.map((b) => [b.entry.id, b.state])).toEqual([
      ["past", "past"],
      ["now", "now"],
      ["soon", "upcoming"],
    ]);
  });

  it("counts an entry ending today as finished and one starting today as running", () => {
    // Ends are exclusive, so an end of the 23rd is the last moment of the
    // 22nd: the event is over by the time anyone reads this.
    const view = calendarWindow(
      feedOf(entry("ended", "2026-08-20", "2026-08-23"), entry("began", "2026-08-23", "2026-08-26")),
      NOW,
    );
    expect(view.bars.map((b) => b.state)).toEqual(["past", "now"]);
  });

  it("keeps an entry that straddles the start, clamped and marked", () => {
    // The case that must not be dropped: something that began weeks ago and is
    // still on is exactly what a reader is looking for.
    const [bar] = calendarWindow(feedOf(entry("long", "2026-07-01", "2026-09-01")), NOW).bars;
    expect(bar.from).toEqual(new Date(2026, 7, 16));
    expect(bar.clippedStart).toBe(true);
    expect(bar.clippedEnd).toBe(false);
    expect(bar.to).toEqual(new Date(2026, 8, 1));
  });

  it("keeps an entry that straddles the end, clamped and marked", () => {
    const [bar] = calendarWindow(feedOf(entry("far", "2026-10-01", "2026-12-01")), NOW).bars;
    expect(bar.to).toEqual(new Date(2026, 9, 22));
    expect(bar.clippedEnd).toBe(true);
  });

  it.each([
    ["wholly before", entry("x", "2026-08-01", "2026-08-10")],
    ["ending exactly at the left edge", entry("x", "2026-08-01", "2026-08-16")],
    ["wholly after", entry("x", "2026-11-01", "2026-11-05")],
    ["starting exactly at the right edge", entry("x", "2026-10-22", "2026-10-25")],
  ])("drops an entry %s the window", (_label, only) => {
    expect(calendarWindow(feedOf(only), NOW).bars).toEqual([]);
  });

  it("keeps an entry covering only the window's first day", () => {
    expect(calendarWindow(feedOf(entry("x", "2026-08-15", "2026-08-17")), NOW).bars).toHaveLength(1);
  });

  it("orders by start, then by length, then by title", () => {
    // Not trusted from the feed: the copy the app ships is a file, and a file
    // can be older than the rule that ordered it.
    const view = calendarWindow(
      feedOf(
        entry("c", "2026-09-01", "2026-09-05", "Beta"),
        entry("a", "2026-08-20", "2026-08-22", "Alpha"),
        entry("d", "2026-09-01", "2026-09-02", "Zeta"),
        entry("b", "2026-09-01", "2026-09-05", "Alpha"),
      ),
      NOW,
    );
    expect(view.bars.map((b) => b.entry.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("carries the feed's stamp through", () => {
    expect(calendarWindow(feedOf(), NOW).generatedAt).toBe("2026-08-23T09:00:00.000Z");
  });
});

describe("FALLBACK_CALENDAR", () => {
  it("is a feed the validator accepts", () => {
    /*
     * Structural only. The file is rewritten by CI on every build, so nothing
     * here may pin a title, an id or a date out of it — the module throwing at
     * load is what actually guards the copy, and this is the assertion that
     * makes the throw a test failure rather than a blank page.
     */
    expect(FALLBACK_CALENDAR.version).toBe(1);
    expect(Array.isArray(FALLBACK_CALENDAR.entries)).toBe(true);
  });

  it("windows without complaint", () => {
    expect(() => calendarWindow(FALLBACK_CALENDAR, NOW)).not.toThrow();
  });
});
