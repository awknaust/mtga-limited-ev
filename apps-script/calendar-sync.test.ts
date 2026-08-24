/**
 * The guard on the Apps Script port.
 *
 * `calendar-sync/Code.js` re-implements rules whose home is this repository —
 * the `[mtga-meta]` parse and strip order from `scripts/calendar/feed.ts`,
 * the closed type set from `src/lib/calendarEventTypes.ts` — because Apps
 * Script cannot import repo modules. A port drifts silently: a category
 * added to the app without a colour in the copier would make it drop those
 * staging events *whole*, and the clean calendar — which the app reads —
 * would simply never show them.
 *
 * So the pure half of Code.js is evaluated under Node (everything above its
 * "Apps Script services" marker is written to make that possible) and held
 * to the originals: the colour map's keys to CALENDAR_EVENT_TYPES, and the
 * meta parser and text stripping to `buildCalendarFeed`'s observable
 * behaviour on shared fixtures. The parity fixtures stay inside the entity
 * vocabulary the port documents — numeric references plus its named table;
 * rarer names surviving literally is the accepted difference, and is not
 * pinned.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CALENDAR_EVENT_TYPES } from "../src/lib/calendarEventTypes.ts";
import { buildCalendarFeed } from "../scripts/calendar/feed.ts";
import type { RawEvent } from "../scripts/calendar/google.ts";

const source = readFileSync(new URL("./calendar-sync/Code.js", import.meta.url), "utf8");

/** Loose stand-in for `Calendar.Schema.Event` — the shapes Google hands back. */
type SchemaEvent = Record<string, unknown>;

type Helpers = {
  COLOR_BY_TYPE: Record<string, string>;
  stripHtmlText: (html: string) => string;
  readEventTypeFrom: (text: string) => string | null;
  cleanDescription: (text: string) => string;
  desiredFor: (event: SchemaEvent) => { sourceId: string; body: SchemaEvent | null } | null;
  differs: (body: SchemaEvent, existing: SchemaEvent) => boolean;
};

const helpers = new Function(
  `${source}\nreturn { COLOR_BY_TYPE, stripHtmlText, readEventTypeFrom, cleanDescription, desiredFor, differs };`,
)() as Helpers;

describe("COLOR_BY_TYPE", () => {
  it("colours exactly the closed set of event types", () => {
    expect(Object.keys(helpers.COLOR_BY_TYPE).sort()).toEqual([...CALENDAR_EVENT_TYPES].sort());
  });

  it("gives each type its own colour from Google's palette", () => {
    const colors = Object.values(helpers.COLOR_BY_TYPE);
    for (const color of colors) expect(color).toMatch(/^([1-9]|1[01])$/);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("parity with the feed's reading of a description", () => {
  const NOW = new Date("2026-08-23T12:00:00Z");

  const raw = (over: Partial<RawEvent>): RawEvent => ({
    id: "probe",
    title: "Probe",
    start: { day: "2026-08-21" },
    end: { day: "2026-08-22" },
    description: null,
    eventTypeProperty: null,
    ...over,
  });

  /** An always-typed companion, so a dropped probe reads as a drop rather
   * than tripping the feed's all-untyped refusal. */
  const anchor = raw({
    id: "anchor",
    title: "Anchor",
    description: '[mtga-meta]{"v":1,"eventType":"cube"}[/mtga-meta]',
  });

  async function feedReads(description: string): Promise<{ type: string | null; note: string }> {
    const feed = await buildCalendarFeed([anchor, raw({ description })], NOW);
    const entry = feed.entries.find((e) => e.title === "Probe");
    return { type: entry?.type ?? null, note: entry?.note ?? "" };
  }

  it.each([
    ["a plain block", 'Runs all week. [mtga-meta]{"v":1,"eventType":"qualifier"}[/mtga-meta]'],
    [
      "a block whose quotes an HTML edit escaped",
      "<p>Runs all week.</p>[mtga-meta]{&quot;v&quot;:1,&quot;eventType&quot;:&quot;limited_open&quot;}[/mtga-meta]",
    ],
    ["a token that is not on the list", '[mtga-meta]{"v":1,"eventType":"midweek_magic"}[/mtga-meta]'],
    ["a broken block", "Oops [mtga-meta]{oops[/mtga-meta]"],
    [
      "a broken block followed by a readable one",
      '[mtga-meta]{nope[/mtga-meta] [mtga-meta]{"v":1,"eventType":"arena_direct"}[/mtga-meta]',
    ],
    ["no block at all", "Just prose."],
    [
      "the entities the port's table must know",
      '<p>6&nbsp;wins &mdash; 4,200 gems &#8212; that&#39;s rich</p>[mtga-meta]{"v":1,"eventType":"contender_draft"}[/mtga-meta]',
    ],
    [
      "an escaped entity that must not decode twice",
      'a &amp;lt;b&amp;gt; tag [mtga-meta]{"v":1,"eventType":"set_release"}[/mtga-meta]',
    ],
    [
      // Strip-then-decode order: decoding first would mint a tag here and
      // then strip it, and the note would lose its text.
      "an encoded tag that must stay text",
      '&lt;b&gt;not markup&lt;/b&gt; [mtga-meta]{"v":1,"eventType":"flashback_draft"}[/mtga-meta]',
    ],
  ])("agrees with the feed on %s", async (_label, description) => {
    const viaFeed = await feedReads(description);
    const text = helpers.stripHtmlText(description);
    expect(helpers.readEventTypeFrom(text)).toBe(viaFeed.type);
    // A null type means neither side publishes anything — the feed drops the
    // entry and the copier's desiredFor answers `body: null` — so there is a
    // note to compare only when a type was read.
    if (viaFeed.type !== null) {
      expect(helpers.cleanDescription(text)).toBe(viaFeed.note);
    }
  });

  it("keeps the full text where the feed's tooltip copy caps at 200", () => {
    const text = "x".repeat(500);
    const description = `${text} [mtga-meta]{"v":1,"eventType":"cube"}[/mtga-meta]`;
    expect(helpers.cleanDescription(helpers.stripHtmlText(description))).toBe(text);
  });
});

describe("desiredFor", () => {
  const stagedAllDay: SchemaEvent = {
    id: "evt-1",
    status: "confirmed",
    summary: "  Arena Direct — Hobbit  ",
    description: '<p>Six wins takes the box.</p>[mtga-meta]{"v":1,"eventType":"arena_direct"}[/mtga-meta]',
    start: { date: "2026-08-21" },
    end: { date: "2026-08-23" },
  };

  it("builds the clean event: colour, shared properties, stripped text", () => {
    expect(helpers.desiredFor(stagedAllDay)).toEqual({
      sourceId: "evt-1",
      body: {
        summary: "Arena Direct — Hobbit",
        description: "Six wins takes the box.",
        start: { date: "2026-08-21" },
        end: { date: "2026-08-23" },
        colorId: helpers.COLOR_BY_TYPE.arena_direct,
        extendedProperties: { shared: { mtgaEventType: "arena_direct", mtgaSourceId: "evt-1" } },
      },
    });
  });

  it("keeps a timed event's instant and zone", () => {
    const timed = {
      ...stagedAllDay,
      start: { dateTime: "2026-08-25T10:00:00-07:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-08-25T18:00:00-07:00", timeZone: "America/Los_Angeles" },
    };
    const body = helpers.desiredFor(timed)?.body;
    expect(body?.start).toEqual({
      dateTime: "2026-08-25T10:00:00-07:00",
      timeZone: "America/Los_Angeles",
    });
  });

  it("marks a typo'd annotation as a candidate with nothing to publish", () => {
    // The distinction reconcile_'s refusal counts: this row is readable, so
    // *many* of these at once means the scheme broke, while one just costs
    // the calendar one entry.
    const typo = { ...stagedAllDay, description: "[mtga-meta]{oops[/mtga-meta]" };
    expect(helpers.desiredFor(typo)).toEqual({ sourceId: "evt-1", body: null });
  });

  it.each([
    ["a cancelled tombstone", { ...stagedAllDay, status: "cancelled" }],
    ["an event with no title", { ...stagedAllDay, summary: " " }],
    ["an event with no id", { ...stagedAllDay, id: "" }],
    ["an event with unreadable times", { ...stagedAllDay, start: {} }],
  ])("does not treat %s as a candidate", (_label, event) => {
    expect(helpers.desiredFor(event)).toBeNull();
  });

  describe("differs", () => {
    const body = helpers.desiredFor(stagedAllDay)!.body!;
    /** Google's copy of a write echoes the body plus fields of its own. */
    const echoed: SchemaEvent = { ...body, id: "target-1", status: "confirmed", etag: '"1"' };

    it("sees no change in Google's echo of the copier's own write", () => {
      expect(helpers.differs(body, echoed)).toBe(false);
    });

    it("sees each managed field move", () => {
      expect(helpers.differs(body, { ...echoed, summary: "Renamed" })).toBe(true);
      expect(helpers.differs(body, { ...echoed, description: "" })).toBe(true);
      expect(helpers.differs(body, { ...echoed, colorId: "2" })).toBe(true);
      expect(helpers.differs(body, { ...echoed, end: { date: "2026-08-24" } })).toBe(true);
      expect(
        helpers.differs(body, {
          ...echoed,
          extendedProperties: { shared: { mtgaEventType: "cube", mtgaSourceId: "evt-1" } },
        }),
      ).toBe(true);
    });

    it("does not read a re-rendered offset as a change", () => {
      // Google may hand the same instant back in another zone's spelling;
      // patching over that would churn on every run.
      const timed = helpers.desiredFor({
        ...stagedAllDay,
        start: { dateTime: "2026-08-25T10:00:00-07:00" },
        end: { dateTime: "2026-08-25T18:00:00-07:00" },
      })!.body!;
      const rendered = {
        ...timed,
        id: "target-2",
        start: { dateTime: "2026-08-25T17:00:00Z", timeZone: "Etc/UTC" },
        end: { dateTime: "2026-08-26T01:00:00Z", timeZone: "Etc/UTC" },
      };
      expect(helpers.differs(timed, rendered)).toBe(false);
    });
  });
});
