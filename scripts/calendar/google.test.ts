/**
 * The source adapter and the day-flattening behind it, against a fixture in
 * Google's own payload shape.
 *
 * The fixture matters more than the assertions: what is being held still is
 * the *reading* of a payload this repository does not control. A field renamed
 * upstream, or a shape this code quietly mis-narrows, should fail here rather
 * than against the live calendar — which is the same reason `wizards.test.ts`
 * keeps the drop-rates markup.
 *
 * Nothing here touches the network. The paging tests drive `fetchCalendarFeed`
 * through an injected transport, stubbed by argument rather than by mocking
 * the module, as `registry.test.ts` does.
 */

import { describe, expect, it } from "vitest";

import { SourceError } from "../shared/http.ts";
import { buildCalendarFeed } from "./feed.ts";
import { fetchCalendarFeed, type CalendarTransport } from "./fetch.ts";
import { extractEvents } from "./google.ts";

const NOW = new Date("2026-08-23T12:00:00Z");

/** One page of `events.list`, in the shape the API documents. */
const page = (items: unknown[], nextPageToken?: string) => ({
  kind: "calendar#events",
  etag: '"p32"',
  summary: "MTG Arena",
  updated: "2026-08-23T09:00:00.000Z",
  timeZone: "America/Los_Angeles",
  accessRole: "reader",
  defaultReminders: [],
  ...(nextPageToken === undefined ? {} : { nextPageToken }),
  items,
});

const allDay = {
  kind: "calendar#event",
  id: "evt-premier",
  status: "confirmed",
  htmlLink: "https://www.google.com/calendar/event?eid=evt-premier",
  summary: "Premier Draft — Hobbit",
  description: "<p>Runs all fortnight &amp; then rotates</p>",
  start: { date: "2026-08-21" },
  end: { date: "2026-09-04" },
};

const timed = {
  kind: "calendar#event",
  id: "evt-midweek",
  status: "confirmed",
  summary: "Midweek Magic",
  start: { dateTime: "2026-08-25T10:00:00-07:00", timeZone: "America/Los_Angeles" },
  end: { dateTime: "2026-08-27T18:00:00-07:00", timeZone: "America/Los_Angeles" },
};

const build = (items: unknown[]) => buildCalendarFeed(extractEvents(page(items)).events, NOW);

describe("extractEvents", () => {
  it("reads an all-day event", () => {
    const { events, nextPageToken } = extractEvents(page([allDay]));
    expect(nextPageToken).toBeNull();
    expect(events).toEqual([
      {
        id: "evt-premier",
        title: "Premier Draft — Hobbit",
        start: { day: "2026-08-21" },
        end: { day: "2026-09-04" },
        description: "<p>Runs all fortnight &amp; then rotates</p>",
      },
    ]);
  });

  it("carries a timed event as instants, leaving the flattening to the feed", () => {
    const { events } = extractEvents(page([timed]));
    expect(events[0].start).toEqual({ time: "2026-08-25T10:00:00-07:00" });
    expect(events[0].end).toEqual({ time: "2026-08-27T18:00:00-07:00" });
    expect(events[0].description).toBeNull();
  });

  it("returns the paging cursor when there is one", () => {
    expect(extractEvents(page([], "CAoQAA")).nextPageToken).toBe("CAoQAA");
    // An empty string is Google saying nothing, not a cursor to follow.
    expect(extractEvents(page([], "")).nextPageToken).toBeNull();
  });

  it.each([
    ["a cancelled event", { ...allDay, status: "cancelled" }],
    ["an event with no title", { ...allDay, summary: "   " }],
    ["an event with no id", { ...allDay, id: "" }],
    ["an event with no start", { ...allDay, start: {} }],
    ["a date that is not a date", { ...allDay, start: { date: "next tuesday" } }],
    ["a dateTime that is not one", { ...allDay, end: { dateTime: "2026-09-04" } }],
    ["an item that is not an object", null],
  ])("skips %s without failing the page", (_label, item) => {
    const { events } = extractEvents(page([item, timed]));
    expect(events.map((e) => e.id)).toEqual(["evt-midweek"]);
  });

  it.each([
    ["a payload that is not an object", 42],
    ["an error body from a rejected key", { error: { code: 403, message: "Forbidden" } }],
    ["a payload of the wrong kind", { kind: "calendar#event", items: [] }],
    ["a payload with no items array", { kind: "calendar#events" }],
  ])("refuses %s", (_label, payload) => {
    expect(() => extractEvents(payload)).toThrow(SourceError);
  });

  it("refuses a page of live items none of which are readable", () => {
    // A field renamed upstream. Left to pass, this publishes a blank calendar
    // that looks exactly like a quiet week.
    const renamed = { ...allDay, summary: undefined, title: "Premier Draft" };
    expect(() => extractEvents(page([renamed, { ...renamed, id: "b" }]))).toThrow(SourceError);
  });

  it("publishes a page with nothing live on it", () => {
    // Not the same thing: no events is a real answer, and the strip draws
    // nothing for it.
    expect(extractEvents(page([])).events).toEqual([]);
    expect(extractEvents(page([{ ...allDay, status: "cancelled" }])).events).toEqual([]);
  });

  it("lets one readable event carry a page of odd ones", () => {
    const { events } = extractEvents(page([{ ...allDay, summary: undefined }, timed]));
    expect(events.map((e) => e.id)).toEqual(["evt-midweek"]);
  });
});

describe("buildCalendarFeed", () => {
  it("passes an all-day span through, exclusive end and all", () => {
    const [entry] = build([allDay]).entries;
    expect(entry.start).toBe("2026-08-21");
    expect(entry.end).toBe("2026-09-04");
  });

  it("widens a timed event to the days it touches", () => {
    // 25th 10:00 to 27th 18:00 covers the 25th, 26th and 27th, so the
    // exclusive end is the 28th.
    const [entry] = build([timed]).entries;
    expect(entry.start).toBe("2026-08-25");
    expect(entry.end).toBe("2026-08-28");
  });

  it("does not bump an end that is already midnight", () => {
    // 25th 10:00 to 26th 00:00 is one day. Bumping would draw two.
    const [entry] = build([
      {
        ...timed,
        start: { dateTime: "2026-08-25T10:00:00-07:00" },
        end: { dateTime: "2026-08-26T00:00:00-07:00" },
      },
    ]).entries;
    expect(entry.start).toBe("2026-08-25");
    expect(entry.end).toBe("2026-08-26");
  });

  it("floors a same-instant event at one day rather than drawing nothing", () => {
    const [entry] = build([
      {
        ...timed,
        start: { dateTime: "2026-08-25T10:00:00-07:00" },
        end: { dateTime: "2026-08-25T10:00:00-07:00" },
      },
    ]).entries;
    expect(entry.end).toBe("2026-08-26");
  });

  it("floors a backwards all-day span the same way", () => {
    const [entry] = build([
      { ...allDay, start: { date: "2026-08-21" }, end: { date: "2026-08-20" } },
    ]).entries;
    expect(entry.start).toBe("2026-08-21");
    expect(entry.end).toBe("2026-08-22");
  });

  it("reduces a description to text", () => {
    expect(build([allDay]).entries[0].note).toBe("Runs all fortnight & then rotates");
  });

  it("leaves an escaped entity as the text it was", () => {
    // `&amp;lt;` is someone writing "&lt;", not a tag. Decoding twice would
    // turn it into one.
    const [entry] = build([{ ...allDay, description: "a &amp;lt;b&amp;gt; tag" }]).entries;
    expect(entry.note).toBe("a &lt;b&gt; tag");
  });

  it("omits a note that strips to nothing", () => {
    expect(build([{ ...allDay, description: "<p>  </p>" }]).entries[0].note).toBeUndefined();
  });

  it("caps a long note", () => {
    const [entry] = build([{ ...allDay, description: "x".repeat(500) }]).entries;
    expect(entry.note!.length).toBeLessThanOrEqual(200);
    expect(entry.note!.endsWith("…")).toBe(true);
  });

  it("orders by start, then by length, then by title", () => {
    const at = (id: string, start: string, end: string, summary: string) => ({
      ...allDay,
      id,
      summary,
      start: { date: start },
      end: { date: end },
    });
    const feed = build([
      at("c", "2026-08-25", "2026-08-27", "Beta"),
      at("a", "2026-08-21", "2026-08-22", "Alpha"),
      at("d", "2026-08-25", "2026-08-26", "Zeta"),
      at("b", "2026-08-25", "2026-08-27", "Alpha"),
    ]);
    expect(feed.entries.map((e) => e.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("publishes an empty calendar rather than refusing one", () => {
    // A quiet fortnight is a real state, and the strip renders nothing for it.
    const feed = build([]);
    expect(feed.entries).toEqual([]);
    expect(feed.version).toBe(1);
    expect(feed.generatedAt).toBe(NOW.toISOString());
  });

  it("resolves every event it is given", () => {
    // The contract that lets this module hold no guard of its own: a RawEvent
    // has already been through `extractEvents`, so it has a title and a date
    // shape, and there is no way for one to fall out here.
    const feed = build([allDay, timed]);
    expect(feed.entries).toHaveLength(2);
    for (const entry of feed.entries) {
      expect(entry.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.end > entry.start).toBe(true);
    }
  });
});

describe("fetchCalendarFeed", () => {
  /** Replies with the given pages in order, recording the URLs asked for. */
  function pages(...replies: unknown[]): CalendarTransport & { urls: string[] } {
    const urls: string[] = [];
    const transport = (url: string) => {
      urls.push(url);
      return Promise.resolve(replies[urls.length - 1]);
    };
    return Object.assign(transport, { urls });
  }

  it("asks for expanded single events in start order", async () => {
    const transport = pages(page([allDay]));
    await fetchCalendarFeed("cal@group.calendar.google.com", "KEY", { now: NOW, transport });
    const url = new URL(transport.urls[0]);
    expect(url.pathname).toBe("/calendar/v3/calendars/cal%40group.calendar.google.com/events");
    expect(url.searchParams.get("singleEvents")).toBe("true");
    expect(url.searchParams.get("orderBy")).toBe("startTime");
    expect(url.searchParams.get("maxResults")).toBe("2500");
    // The key is a header, so it must not have leaked into the URL that every
    // SourceError message carries.
    expect(transport.urls[0]).not.toContain("KEY");
  });

  it("windows the request around the given day", async () => {
    const transport = pages(page([]));
    await fetchCalendarFeed("cal", "KEY", { now: NOW, transport });
    const url = new URL(transport.urls[0]);
    expect(url.searchParams.get("timeMin")).toBe("2026-07-23T12:00:00.000Z");
    expect(url.searchParams.get("timeMax")).toBe("2026-12-21T12:00:00.000Z");
  });

  it("follows the cursor and merges the pages", async () => {
    const second = { ...allDay, id: "evt-second", summary: "Quick Draft" };
    const transport = pages(page([allDay], "CAoQAA"), page([second]));
    const feed = await fetchCalendarFeed("cal", "KEY", { now: NOW, transport });
    expect(feed.entries.map((e) => e.id)).toEqual(["evt-premier", "evt-second"]);
    expect(new URL(transport.urls[1]).searchParams.get("pageToken")).toBe("CAoQAA");
  });

  it("refuses to publish rather than truncate when the pages never end", async () => {
    // A short page is not evidence there is no more, so the cursor is the only
    // stop signal — and a calendar that keeps handing one back is one this
    // feed cannot promise is complete.
    const transport = pages(...Array.from({ length: 6 }, () => page([allDay], "more")));
    await expect(fetchCalendarFeed("cal", "KEY", { now: NOW, transport })).rejects.toThrow(
      SourceError,
    );
  });
});
