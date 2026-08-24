/**
 * The guard on the Apps Script copier, from the repository side.
 *
 * `calendar-sync/Code.js` is the **only parser** of cowork's `[mtga-meta]`
 * format — the app's feed reads `extendedProperties.shared.mtgaEventType`
 * and nothing else — so two different things need holding here. First, the
 * boundary: every token the copier can emit must be one the feed recognises,
 * or those staging events would silently never exist for the app. That is
 * the closed-set check on `LABEL_BY_TYPE` and the round-trip of each token
 * through `buildCalendarFeed`. Second, the copier's own reading of cowork's
 * format, which no longer has a repo original to compare against and is
 * pinned to expected values directly — the HTML-escaped-quotes case
 * especially, since a Google-UI edit produces exactly that and a copier that
 * cannot read it drops the event whole.
 *
 * The pure half of Code.js — everything above its "Apps Script services"
 * marker, written to make this possible — is evaluated under Node here.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CALENDAR_EVENT_TYPES } from "../src/lib/calendarEventTypes.ts";
import { buildCalendarFeed } from "../scripts/calendar/feed.ts";

const source = readFileSync(new URL("./calendar-sync/Code.js", import.meta.url), "utf8");

/** Loose stand-in for `Calendar.Schema.Event` — the shapes Google hands back. */
type SchemaEvent = Record<string, unknown>;

type Helpers = {
  LABEL_BY_TYPE: Record<string, { name: string; backgroundColor: string }>;
  stripHtmlText: (html: string) => string;
  readEventTypeFrom: (text: string) => string | null;
  cleanDescription: (text: string) => string;
  desiredFor: (
    event: SchemaEvent,
    labelIds: Record<string, string>,
  ) => { sourceId: string; body: (SchemaEvent & { eventLabelId?: string }) | null } | null;
  differs: (body: SchemaEvent, existing: SchemaEvent) => boolean;
};

const helpers = new Function(
  `${source}\nreturn { LABEL_BY_TYPE, stripHtmlText, readEventTypeFrom, cleanDescription, desiredFor, differs };`,
)() as Helpers;

/** A stand-in for what `ensureLabels_` returns on the live calendar. */
const LABEL_IDS = Object.fromEntries(
  CALENDAR_EVENT_TYPES.map((type, i) => [type, `label-${i}`]),
);

describe("LABEL_BY_TYPE", () => {
  it("labels exactly the closed set of event types", () => {
    expect(Object.keys(helpers.LABEL_BY_TYPE).sort()).toEqual([...CALENDAR_EVENT_TYPES].sort());
  });

  it("gives each type its own name, within Google's 50-character limit", () => {
    const names = Object.values(helpers.LABEL_BY_TYPE).map((label) => label.name);
    for (const name of names) {
      expect(name.trim()).not.toBe("");
      expect(name.length).toBeLessThanOrEqual(50);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives each label a distinct hex colour to be born with", () => {
    const colors = Object.values(helpers.LABEL_BY_TYPE).map((label) => label.backgroundColor);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe("every token the copier emits round-trips through the feed", () => {
  const NOW = new Date("2026-08-23T12:00:00Z");

  it.each([...CALENDAR_EVENT_TYPES])("%s", async (type) => {
    // The copier's write, as the feed will read it: the body's shared
    // property becomes the RawEvent's eventTypeProperty, the one channel.
    const want = helpers.desiredFor(
      {
        id: "evt-1",
        status: "confirmed",
        summary: "Probe",
        description: `[mtga-meta]{"v":1,"eventType":"${type}"}[/mtga-meta]`,
        start: { date: "2026-08-21" },
        end: { date: "2026-08-22" },
      },
      LABEL_IDS,
    );
    const shared = (want?.body?.extendedProperties as { shared: Record<string, string> }).shared;
    const feed = await buildCalendarFeed(
      [
        {
          id: "evt-1",
          title: "Probe",
          start: { day: "2026-08-21" },
          end: { day: "2026-08-22" },
          description: null,
          eventTypeProperty: shared.mtgaEventType,
        },
      ],
      NOW,
    );
    expect(feed.entries[0]?.type).toBe(type);
  });
});

describe("reading cowork's format", () => {
  it.each([
    ["a plain block", 'Runs all week. [mtga-meta]{"v":1,"eventType":"qualifier"}[/mtga-meta]', "qualifier"],
    [
      // A Google-UI edit turns the description to HTML and the JSON's quotes
      // to &quot; — the reason tags strip and entities decode before the
      // block is matched.
      "a block whose quotes an HTML edit escaped",
      "<p>Runs all week.</p>[mtga-meta]{&quot;v&quot;:1,&quot;eventType&quot;:&quot;limited_open&quot;}[/mtga-meta]",
      "limited_open",
    ],
    ["a token that is not on the list", '[mtga-meta]{"v":1,"eventType":"midweek_magic"}[/mtga-meta]', null],
    ["a broken block", "Oops [mtga-meta]{oops[/mtga-meta]", null],
    [
      "a broken block followed by a readable one",
      '[mtga-meta]{nope[/mtga-meta] [mtga-meta]{"v":1,"eventType":"arena_direct"}[/mtga-meta]',
      "arena_direct",
    ],
    ["no block at all", "Just prose.", null],
  ])("reads %s", (_label, description, expected) => {
    expect(helpers.readEventTypeFrom(helpers.stripHtmlText(description))).toBe(expected);
  });

  it("decodes named and numeric entities into the clean text", () => {
    expect(helpers.stripHtmlText("<p>6&nbsp;wins &mdash; 4,200 gems &#8212; that&#39;s rich</p>")).toBe(
      "6 wins — 4,200 gems — that's rich",
    );
  });

  it("does not decode an escaped entity twice", () => {
    // `&amp;lt;` is someone writing "&lt;", not a tag.
    expect(helpers.stripHtmlText("a &amp;lt;b&amp;gt; tag")).toBe("a &lt;b&gt; tag");
  });

  it("strips tags before decoding, so an encoded tag stays text", () => {
    // Decoding first would mint a tag here and then strip it, and the
    // description would lose its text.
    expect(helpers.stripHtmlText("&lt;b&gt;not markup&lt;/b&gt;")).toBe("<b>not markup</b>");
  });

  it("removes the block from the text and keeps the full length", () => {
    // The feed caps its copy at 200 characters because that copy is a
    // tooltip; the copier's is the event a subscriber opens.
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

  it("builds the clean event: label, shared properties, stripped text", () => {
    expect(helpers.desiredFor(stagedAllDay, LABEL_IDS)).toEqual({
      sourceId: "evt-1",
      body: {
        summary: "Arena Direct — Hobbit",
        description: "Six wins takes the box.",
        start: { date: "2026-08-21" },
        end: { date: "2026-08-23" },
        transparency: "transparent",
        eventLabelId: LABEL_IDS.arena_direct,
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
    const body = helpers.desiredFor(timed, LABEL_IDS)?.body;
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
    expect(helpers.desiredFor(typo, LABEL_IDS)).toEqual({ sourceId: "evt-1", body: null });
  });

  it.each([
    ["a cancelled tombstone", { ...stagedAllDay, status: "cancelled" }],
    ["an event with no title", { ...stagedAllDay, summary: " " }],
    ["an event with no id", { ...stagedAllDay, id: "" }],
    ["an event with unreadable times", { ...stagedAllDay, start: {} }],
  ])("does not treat %s as a candidate", (_label, event) => {
    expect(helpers.desiredFor(event, LABEL_IDS)).toBeNull();
  });

  describe("differs", () => {
    const body = helpers.desiredFor(stagedAllDay, LABEL_IDS)!.body!;
    /** Google's copy of a write echoes the body plus fields of its own. */
    const echoed: SchemaEvent = { ...body, id: "target-1", status: "confirmed", etag: '"1"' };

    it("sees no change in Google's echo of the copier's own write", () => {
      expect(helpers.differs(body, echoed)).toBe(false);
    });

    it("sees each managed field move", () => {
      expect(helpers.differs(body, { ...echoed, summary: "Renamed" })).toBe(true);
      expect(helpers.differs(body, { ...echoed, description: "" })).toBe(true);
      // A pre-existing Busy event: Google omits the default, absent = opaque.
      expect(helpers.differs(body, { ...echoed, transparency: undefined })).toBe(true);
      expect(helpers.differs(body, { ...echoed, eventLabelId: "label-elsewhere" })).toBe(true);
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
      const timed = helpers.desiredFor(
        {
          ...stagedAllDay,
          start: { dateTime: "2026-08-25T10:00:00-07:00" },
          end: { dateTime: "2026-08-25T18:00:00-07:00" },
        },
        LABEL_IDS,
      )!.body!;
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
