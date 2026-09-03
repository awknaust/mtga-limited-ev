/**
 * The strip's lane layout, against a plain linear scale.
 *
 * Only the arithmetic is tested — there is no DOM in this suite, and the
 * component is a fold over what comes out of here. The property that matters
 * and that is asserted directly is the one a picture would show: **no two
 * bars on the same row overlap** — touching is allowed, because the renderer
 * separates touching bars with a ring of the page colour.
 */

import { describe, expect, it } from "vitest";

import { CALENDAR_EVENT_TYPES, type CalendarBar, type CalendarEventType } from "../lib";
import {
  INSIDE_PAD,
  MARKER_KIND,
  MIN_BAR,
  MIN_INSIDE_LABEL,
  SLOT_COUNT,
  layoutCalendar,
  tickEvery,
  type CalendarLayout,
} from "./calendarLayout";

/** One pixel per day, from day zero — enough to write the cases in days. */
const scale = (at: Date) => (at.getTime() - Date.UTC(2026, 0, 1)) / 86_400_000;

const bar = (
  title: string,
  fromDay: number,
  toDay: number,
  // Arbitrary but required: every entry that reaches the layout has one.
  type: CalendarEventType = "other_draft",
): CalendarBar => ({
  entry: {
    id: `${title}@${fromDay}`,
    title,
    start: "unused",
    end: "unused",
    type,
  },
  from: new Date(Date.UTC(2026, 0, 1 + fromDay)),
  to: new Date(Date.UTC(2026, 0, 1 + toDay)),
  clippedStart: false,
  clippedEnd: false,
  state: "upcoming",
});

/** Every row of every lane, flattened for invariant checks. */
function rowsOf(layout: CalendarLayout) {
  return layout.lanes.flatMap((lane) => lane.rows);
}

function overlapsOnARow(layout: CalendarLayout): string[] {
  const clashes: string[] = [];
  for (const row of rowsOf(layout)) {
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1];
      const b = row[i];
      if (b.x < a.x + a.width)
        clashes.push(`${a.bar.entry.title} / ${b.bar.entry.title}`);
    }
  }
  return clashes;
}

describe("layoutCalendar", () => {
  it("places a bar where the scale puts it", () => {
    const layout = layoutCalendar([bar("A", 10, 14)], scale);
    expect(rowsOf(layout)[0][0].x).toBe(10);
    expect(rowsOf(layout)[0][0].width).toBe(4);
  });

  it("keeps a bar clipped to a sliver visible", () => {
    const layout = layoutCalendar([bar("A", 10, 10)], scale);
    expect(rowsOf(layout)[0][0].width).toBe(MIN_BAR);
  });

  it("puts a name inside a bar wide enough for a useful amount of it", () => {
    const span = MIN_INSIDE_LABEL + 2 * INSIDE_PAD + 10;
    const [p] = rowsOf(layoutCalendar([bar("Flashback Draft", 0, span)], scale))[0];
    expect(p.labelInside).toBe(true);
    // Held to the bar's interior — this is what the stylesheet truncates
    // against, whatever the name's natural width.
    expect(p.labelMax).toBe(span - 2 * INSIDE_PAD);
  });

  it("leaves a narrow bar bare", () => {
    const span = MIN_INSIDE_LABEL + 2 * INSIDE_PAD - 10;
    const [p] = rowsOf(layoutCalendar([bar("Flashback Draft", 0, span)], scale))[0];
    expect(p.labelInside).toBe(false);
  });

  it("groups entries sharing a type into one lane", () => {
    const layout = layoutCalendar(
      [
        bar("Play-In", 0, 1, "qualifier"),
        bar("Direct A", 0, 5, "arena_direct"),
        bar("Weekend", 10, 12, "qualifier"),
        bar("Direct B", 10, 15, "arena_direct"),
      ],
      scale,
    );
    expect(layout.lanes.map((l) => l.key).sort()).toEqual(["arena_direct", "qualifier"]);
    expect(layout.lanes.every((l) => l.rows.flat().length === 2)).toBe(true);
  });

  it("gives a type its lane even when one entry carries it", () => {
    // The author said what it is; one of a kind is still a kind.
    const layout = layoutCalendar(
      [bar("Powered Cube", 0, 20, "cube"), bar("Play-In", 25, 26, "qualifier")],
      scale,
    );
    expect(layout.lanes.map((l) => l.key)).toEqual(["cube", "qualifier"]);
    expect(layout.lanes.map((l) => l.slot)).toEqual([0, 1]);
  });

  it("hands adjacent lanes consecutive colour slots", () => {
    /*
     * The palette's colour-vision gates were validated on *adjacent* pairs of
     * the slot order, so the stacked lanes must wear the slots in display
     * order — which lane is which colour falls out of the schedule, not out
     * of the tokens' spellings.
     */
    const layout = layoutCalendar(
      [
        bar("Direct", 0, 5, "arena_direct"),
        bar("Play-In", 8, 9, "qualifier"),
        bar("Cube", 12, 20, "cube"),
      ],
      scale,
    );
    expect(layout.lanes.map((l) => l.slot)).toEqual([0, 1, 2]);
  });

  it("orders lanes by their earliest bar", () => {
    const layout = layoutCalendar(
      [
        bar("Direct A", 5, 8, "arena_direct"),
        bar("Play-In", 0, 1, "qualifier"),
        bar("Weekend", 10, 12, "qualifier"),
        bar("Direct B", 20, 23, "arena_direct"),
      ],
      scale,
    );
    expect(layout.lanes.map((l) => l.key)).toEqual(["qualifier", "arena_direct"]);
  });

  it("lets touching events share a row", () => {
    /*
     * The row count the lanes exist to buy. A qualifier cycle is a play-in
     * ending the day its weekend begins, and a Flashback series is four
     * drafts back to back; forcing a gap between touching bars would
     * alternate such chains across two rows forever. The renderer's ring is
     * what keeps two touching bars distinct.
     */
    const layout = layoutCalendar(
      [
        bar("Play-In", 0, 10, "qualifier"),
        bar("Weekend", 10, 20, "qualifier"),
        bar("Next", 20, 30, "qualifier"),
      ],
      scale,
    );
    expect(layout.rows).toBe(1);
  });

  it("splits overlapping events in one lane across rows", () => {
    const layout = layoutCalendar(
      [bar("Contender", 0, 40, "contender_draft"), bar("Flashback", 5, 15, "contender_draft")],
      scale,
    );
    expect(layout.lanes[0].rows.length).toBe(2);
    expect(layout.rows).toBe(2);
  });

  it("never overlaps two bars on one row", () => {
    // Twenty overlapping spans of assorted lengths across three lanes.
    const types: CalendarEventType[] = ["qualifier", "arena_direct", "other_draft"];
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(`Event ${i}`, i * 9, i * 9 + 4 + (i % 7) * 3, types[i % 3]),
    );
    expect(overlapsOnARow(layoutCalendar(bars, scale))).toEqual([]);
  });

  it("counts its rows", () => {
    const layout = layoutCalendar(
      [
        bar("Contender", 0, 40, "contender_draft"),
        bar("Flashback", 5, 15, "contender_draft"),
        bar("Challenge", 0, 4, "limited_open"),
      ],
      scale,
    );
    expect(layout.rows).toBe(layout.lanes.reduce((n, l) => n + l.rows.length, 0));
  });

  it("packs nothing into no lanes", () => {
    expect(layoutCalendar([], scale)).toEqual({ lanes: [], rows: 0, markers: [] });
  });

  it("draws a set release as a marker, not a lane", () => {
    // A release is a moment: it gets a rule across the strip, costs no row,
    // and consumes no colour slot.
    const layout = layoutCalendar(
      [
        bar("Direct", 0, 5, "arena_direct"),
        bar("Reality Fracture", 20, 21, "set_release"),
        bar("Cube", 8, 15, "cube"),
      ],
      scale,
    );
    expect(layout.lanes.map((l) => l.key)).toEqual(["arena_direct", "cube"]);
    expect(layout.lanes.map((l) => l.slot)).toEqual([0, 1]);
    expect(layout.rows).toBe(2);
    expect(layout.markers.map((m) => m.x)).toEqual([20]);
    expect(layout.markers[0].bar.entry.title).toBe("Reality Fracture");
    expect(layout.markers[0].kind).toBe("release");
  });

  it("draws a season rollover as a marker of its own kind", () => {
    // The other moment: the same treatment as a release — a rule, no row, no
    // colour slot — in a look of its own, since the two fall within days of
    // each other and one look would read as a line drawn twice.
    const layout = layoutCalendar(
      [
        bar("Release: FRA", 20, 21, "set_release"),
        bar("Season Rollover", 21, 22, "season_rollover"),
        bar("Cube", 8, 15, "cube"),
      ],
      scale,
    );
    expect(layout.lanes.map((l) => l.key)).toEqual(["cube"]);
    expect(layout.rows).toBe(1);
    expect(layout.markers.map((m) => [m.bar.entry.title, m.kind, m.x])).toEqual([
      ["Release: FRA", "release", 20],
      ["Season Rollover", "rollover", 21],
    ]);
  });

  it("gives every type on the closed set a lane or a rule, never both", () => {
    for (const type of CALENDAR_EVENT_TYPES) {
      const layout = layoutCalendar([bar("Probe", 0, 3, type)], scale);
      expect(layout.lanes.length + layout.markers.length, type).toBe(1);
    }
  });

  it("has a colour slot for every lane type", () => {
    // What SLOT_COUNT's comment claims: adding a lane type without a ninth
    // palette entry would wrap a colour, and this is where it says so.
    const laneTypes = CALENDAR_EVENT_TYPES.filter((type) => MARKER_KIND[type] === undefined);
    expect(laneTypes.length).toBeLessThanOrEqual(SLOT_COUNT);
  });

  it("keeps markers in time order", () => {
    const layout = layoutCalendar(
      [bar("Second", 30, 31, "set_release"), bar("First", 10, 11, "set_release")],
      scale,
    );
    expect(layout.markers.map((m) => m.bar.entry.title)).toEqual(["First", "Second"]);
    expect(layout.lanes).toEqual([]);
  });

  it("keeps each row in time order so the strip draws left to right", () => {
    const layout = layoutCalendar(
      [bar("B", 10, 12, "qualifier"), bar("A", 0, 2, "qualifier"), bar("C", 20, 22, "qualifier")],
      scale,
    );
    expect(layout.lanes[0].rows[0].map((p) => p.bar.entry.title)).toEqual(["A", "B", "C"]);
  });
});

describe("tickEvery", () => {
  // A sixty-seven day window is what `calendarWindow` can produce at most.
  const SPAN = 67;

  it("puts a date every week when there is room", () => {
    expect(tickEvery(1300, SPAN)).toBe(1);
  });

  it("thins them out on a phone rather than letting them collide", () => {
    expect(tickEvery(351, SPAN)).toBe(2);
  });

  it("never returns less than one week", () => {
    expect(tickEvery(10_000, SPAN)).toBe(1);
  });

  it("keeps the dates it draws inside the space available", () => {
    // The property, rather than the three numbers above: at every width the
    // strip can be, the dates drawn fit the width they are drawn in.
    for (let w = 280; w <= 1600; w += 20) {
      const drawn = SPAN / 7 / tickEvery(w, SPAN);
      expect(drawn).toBeLessThanOrEqual(Math.max(2, Math.floor(w / 70)) + 1);
    }
  });
});
