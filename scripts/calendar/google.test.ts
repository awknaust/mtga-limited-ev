/**
 * The source adapter and the day-flattening behind it, against a fixture in
 * Google's own payload shape.
 *
 * The fixture matters more than the assertions: what is being held still is
 * the *reading* of a payload this repository does not control. A field renamed
 * upstream, or a shape this code quietly mis-narrows, should fail here rather
 * than against the live calendar — which is the same reason `wizards.test.ts`
 * keeps the drop-rates markup. The event fixtures are additionally held to
 * `calendar_v3.Schema$Event` from `@googleapis/calendar` — a types-only dev
 * dependency, the one part of Google's client that runs anywhere — so "in the
 * shape the API documents" is checked by the compiler rather than claimed.
 * (The client itself stays out: it is a Node program, and `scripts/calendar/`
 * deploys to the Workers runtime — see `fetch.ts`.)
 *
 * Nothing here touches the network. The paging tests drive `fetchCalendarFeed`
 * through an injected transport, stubbed by argument rather than by mocking
 * the module, as `registry.test.ts` does.
 */

import type { calendar_v3 } from "@googleapis/calendar";
import { describe, expect, it } from "vitest";

import { SourceError } from "../shared/http.ts";
import { buildCalendarFeed } from "./feed.ts";
import { fetchCalendarFeed, type CalendarTransport } from "./fetch.ts";
import { extractEvents } from "./google.ts";

const NOW = new Date("2026-08-23T12:00:00Z");

/**
 * One page of `events.list`, in the shape the API documents. Untyped because
 * `items` deliberately carries malformed rows in the skip-tests; the page
 * scaffolding around them matches `Schema$Events`, and the well-formed event
 * fixtures below are held to `Schema$Event` where the compiler can see it.
 */
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
} satisfies calendar_v3.Schema$Event;

const timed = {
  kind: "calendar#event",
  id: "evt-midweek",
  status: "confirmed",
  summary: "Midweek Magic",
  start: { dateTime: "2026-08-25T10:00:00-07:00", timeZone: "America/Los_Angeles" },
  end: { dateTime: "2026-08-27T18:00:00-07:00", timeZone: "America/Los_Angeles" },
} satisfies calendar_v3.Schema$Event;

/** The copier's annotation, as the clean calendar's events carry it. */
const typed = (type: string) => ({
  extendedProperties: { shared: { mtgaEventType: type, mtgaSourceId: "src-1" } },
});

/**
 * The fixtures as the clean calendar carries them — typed by the copier's
 * shared property, the only channel the feed reads. `buildCalendarFeed`
 * drops any event without a recognised type, so the feed-level tests start
 * from these; the raw pair above stays unannotated for `extractEvents`.
 */
const allDayTyped = { ...allDay, ...typed("other_draft") } satisfies calendar_v3.Schema$Event;
const timedTyped = { ...timed, ...typed("qualifier") } satisfies calendar_v3.Schema$Event;

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
        eventTypeProperty: null,
      },
    ]);
  });

  it("carries the copier's shared-property annotation, uninterpreted", () => {
    const annotated = {
      ...allDay,
      extendedProperties: {
        shared: { mtgaEventType: " limited_open ", mtgaSourceId: "evt-src" },
      },
    } satisfies calendar_v3.Schema$Event;
    // Trimmed but not vetted: whether the token is on the list is feed.ts's
    // call, so even a nonsense value rides through here.
    expect(extractEvents(page([annotated])).events[0].eventTypeProperty).toBe("limited_open");
    const nonsense = { ...allDay, extendedProperties: { shared: { mtgaEventType: "nope" } } };
    expect(extractEvents(page([nonsense])).events[0].eventTypeProperty).toBe("nope");
  });

  it.each([
    ["no extendedProperties at all", allDay],
    ["a private-only annotation", { ...allDay, extendedProperties: { private: { mtgaEventType: "cube" } } }],
    ["an empty token", { ...allDay, extendedProperties: { shared: { mtgaEventType: "  " } } }],
    ["a token that is not a string", { ...allDay, extendedProperties: { shared: { mtgaEventType: 7 } } }],
  ])("reads %s as null", (_label, item) => {
    expect(extractEvents(page([item])).events[0].eventTypeProperty).toBeNull();
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
  it("passes an all-day span through, exclusive end and all", async () => {
    const [entry] = (await build([allDayTyped])).entries;
    expect(entry.start).toBe("2026-08-21");
    expect(entry.end).toBe("2026-09-04");
  });

  it("widens a timed event to the days it touches", async () => {
    // 25th 10:00 to 27th 18:00 covers the 25th, 26th and 27th, so the
    // exclusive end is the 28th.
    const [entry] = (await build([timedTyped])).entries;
    expect(entry.start).toBe("2026-08-25");
    expect(entry.end).toBe("2026-08-28");
  });

  it("does not bump an end that is already midnight", async () => {
    // 25th 10:00 to 26th 00:00 is one day. Bumping would draw two.
    const [entry] = (await build([
      {
        ...timedTyped,
        start: { dateTime: "2026-08-25T10:00:00-07:00" },
        end: { dateTime: "2026-08-26T00:00:00-07:00" },
      },
    ])).entries;
    expect(entry.start).toBe("2026-08-25");
    expect(entry.end).toBe("2026-08-26");
  });

  it("floors a same-instant event at one day rather than drawing nothing", async () => {
    const [entry] = (await build([
      {
        ...timedTyped,
        start: { dateTime: "2026-08-25T10:00:00-07:00" },
        end: { dateTime: "2026-08-25T10:00:00-07:00" },
      },
    ])).entries;
    expect(entry.end).toBe("2026-08-26");
  });

  it("floors a backwards all-day span the same way", async () => {
    const [entry] = (await build([
      { ...allDayTyped, start: { date: "2026-08-21" }, end: { date: "2026-08-20" } },
    ])).entries;
    expect(entry.start).toBe("2026-08-21");
    expect(entry.end).toBe("2026-08-22");
  });

  it("reduces a description to text", async () => {
    expect((await build([allDayTyped])).entries[0].note).toBe("Runs all fortnight & then rotates");
  });

  it("leaves an escaped entity as the text it was", async () => {
    // `&amp;lt;` is someone writing "&lt;", not a tag. Decoding twice would
    // turn it into one.
    const [entry] = (await build([{ ...allDayTyped, description: "a &amp;lt;b&amp;gt; tag" }])).entries;
    expect(entry.note).toBe("a &lt;b&gt; tag");
  });

  it("decodes the entities a hand-rolled table would miss", async () => {
    // Named and numeric alike — the reason the stripping is a library's job.
    const [entry] = (await build([
      { ...allDayTyped, description: "6&nbsp;wins &mdash; 4,200 gems &#8212; that&#39;s rich" },
    ])).entries;
    expect(entry.note).toBe("6 wins — 4,200 gems — that's rich");
  });

  it("omits a note that strips to nothing", async () => {
    expect(
      (await build([{ ...allDayTyped, description: "<p>  </p>" }])).entries[0].note,
    ).toBeUndefined();
  });

  it("caps a long note", async () => {
    const [entry] = (await build([{ ...allDayTyped, description: "x".repeat(500) }])).entries;
    expect(entry.note!.length).toBeLessThanOrEqual(200);
    expect(entry.note!.endsWith("…")).toBe(true);
  });

  it("carries a trailing More Info link out of the description", async () => {
    const [entry] = (await build([
      {
        ...allDayTyped,
        description:
          'Bo1 Hobbit Sealed, while supplies last. <a href="https://magic.wizards.com/en/news?a=1&amp;b=2">More Info</a>',
      },
    ])).entries;
    expect(entry.note).toBe("Bo1 Hobbit Sealed, while supplies last.");
    // The href decodes like any attribute: &amp; in a query string is one &.
    expect(entry.link).toEqual({
      href: "https://magic.wizards.com/en/news?a=1&b=2",
      text: "More Info",
    });
  });

  it("counts an anchor as trailing through markup that strips to nothing", async () => {
    const [entry] = (await build([
      {
        ...allDayTyped,
        description: '<p>Runs all weekend. <a href="https://example.com/x">More Info</a></p><br>&nbsp;',
      },
    ])).entries;
    expect(entry.note).toBe("Runs all weekend.");
    expect(entry.link).toEqual({ href: "https://example.com/x", text: "More Info" });
  });

  it("leaves a mid-sentence anchor as the words it was", async () => {
    // Cutting one out would take a piece of the sentence with it.
    const [entry] = (await build([
      {
        ...allDayTyped,
        description: 'Premier Draft of <a href="https://example.com/set">The Hobbit</a> with prizing.',
      },
    ])).entries;
    expect(entry.note).toBe("Premier Draft of The Hobbit with prizing.");
    expect(entry.link).toBeUndefined();
  });

  it("extracts only the trailing anchor when there are several", async () => {
    const [entry] = (await build([
      {
        ...allDayTyped,
        description:
          'See <a href="https://example.com/a">the announcement</a> for dates. <a href="https://example.com/b">More Info</a>',
      },
    ])).entries;
    expect(entry.note).toBe("See the announcement for dates.");
    expect(entry.link).toEqual({ href: "https://example.com/b", text: "More Info" });
  });

  it("flattens a trailing anchor whose scheme is not http(s)", async () => {
    // The href is headed for an <a> the app renders; any other scheme stays
    // the text it always was.
    const [entry] = (await build([
      { ...allDayTyped, description: 'Runs all weekend. <a href="javascript:alert(1)">More Info</a>' },
    ])).entries;
    expect(entry.note).toBe("Runs all weekend. More Info");
    expect(entry.link).toBeUndefined();
  });

  it("carries a description that is only its link", async () => {
    const [entry] = (await build([
      { ...allDayTyped, description: '<a href="https://example.com/x">More Info</a>' },
    ])).entries;
    expect(entry.note).toBeUndefined();
    expect(entry.link).toEqual({ href: "https://example.com/x", text: "More Info" });
  });

  it("caps the note without costing the link", async () => {
    // The link comes off before the cap, so however long the body runs the
    // call-to-action survives.
    const [entry] = (await build([
      {
        ...allDayTyped,
        description: `${"x".repeat(500)} <a href="https://example.com/x">More Info</a>`,
      },
    ])).entries;
    expect(entry.note!.length).toBeLessThanOrEqual(200);
    expect(entry.note!.endsWith("…")).toBe(true);
    expect(entry.link).toEqual({ href: "https://example.com/x", text: "More Info" });
  });

  it("types an event from the copier's shared property", async () => {
    const [entry] = (await build([
      { ...allDay, description: "Six wins takes the box.", ...typed("arena_direct") },
    ])).entries;
    expect(entry.type).toBe("arena_direct");
    expect(entry.note).toBe("Six wins takes the box.");
  });

  it("drops an event naming a type that is not on the list", async () => {
    // A copier ahead of the app, or a typo in its map: one entry lost, not
    // a lane invented and not a failed feed.
    const feed = await build([allDayTyped, { ...allDay, id: "evt-unknown", ...typed("midweek_magic") }]);
    expect(feed.entries.map((e) => e.title)).toEqual(["Premier Draft — Hobbit"]);
  });

  it("drops an event with no annotation at all", async () => {
    // Untyped events are not possible: the type is the lane, and an event
    // the copier has not annotated has nowhere to be drawn. The [mtga-meta]
    // blocks cowork writes are no exception — the copier consumes them, and
    // the feed does not read descriptions for types.
    const feed = await build([
      allDayTyped,
      { ...timed, id: "evt-plain", description: '[mtga-meta]{"v":1,"eventType":"qualifier"}[/mtga-meta]' },
    ]);
    expect(feed.entries.map((e) => e.title)).toEqual(["Premier Draft — Hobbit"]);
  });

  it("refuses when events arrive and none carries a recognised type", async () => {
    // The mirror of extractEvents' unreadable-page guard: every event losing
    // its annotation at once is a broken scheme, and publishing it would
    // replace a working calendar with a blank that looks like a quiet week.
    await expect(build([allDay, timed])).rejects.toThrow(SourceError);
  });

  it("orders by start, then by length, then by title", async () => {
    const at = (id: string, start: string, end: string, summary: string) => ({
      ...allDayTyped,
      id,
      summary,
      start: { date: start },
      end: { date: end },
    });
    const feed = await build([
      at("c", "2026-08-25", "2026-08-27", "Beta"),
      at("a", "2026-08-21", "2026-08-22", "Alpha"),
      at("d", "2026-08-25", "2026-08-26", "Zeta"),
      at("b", "2026-08-25", "2026-08-27", "Alpha"),
    ]);
    // By title now that ids are hashed: a and b share one, and telling them
    // apart is exactly what the date tiebreaks in between are for.
    expect(feed.entries.map((e) => e.title)).toEqual(["Alpha", "Zeta", "Alpha", "Beta"]);
  });

  it("publishes an empty calendar rather than refusing one", async () => {
    // A quiet fortnight is a real state, and the strip renders nothing for it.
    const feed = await build([]);
    expect(feed.entries).toEqual([]);
    expect(feed.version).toBe(1);
    expect(feed.generatedAt).toBe(NOW.toISOString());
  });

  it("resolves every event that carries a recognised type", async () => {
    // A RawEvent has already been through `extractEvents`, so it has a title
    // and a date shape; with a recognised type on it there is no way for one
    // to fall out here.
    const feed = await build([allDayTyped, timedTyped]);
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
    const transport = pages(page([allDayTyped]));
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
    const second = { ...allDayTyped, id: "evt-second", summary: "Quick Draft" };
    const transport = pages(page([allDayTyped], "CAoQAA"), page([second]));
    const feed = await fetchCalendarFeed("cal", "KEY", { now: NOW, transport });
    expect(feed.entries.map((e) => e.title)).toEqual(["Premier Draft — Hobbit", "Quick Draft"]);
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
