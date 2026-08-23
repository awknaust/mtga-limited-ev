/**
 * The strip's packing, against a plain linear scale.
 *
 * Only the arithmetic is tested — there is no DOM in this suite, and the
 * component is a fold over what comes out of here. The property that matters
 * and that is asserted directly is the one a picture would show: **nothing
 * placed on the same row overlaps anything else on it**, names included.
 */

import { describe, expect, it } from "vitest";

import type { CalendarBar } from "../lib";
import {
  CHAR_PX,
  LABEL_GAP,
  MAX_LABEL_SHARE,
  MIN_BAR,
  ROW_GAP,
  layoutCalendar,
  labelWidth,
  tickEvery,
  type CalendarPlacement,
} from "./calendarLayout";

const PLOT = 500;
/** One pixel per day, from day zero — enough to write the cases in days. */
const scale = (at: Date) => (at.getTime() - Date.UTC(2026, 0, 1)) / 86_400_000;

const bar = (title: string, fromDay: number, toDay: number): CalendarBar => ({
  entry: { id: title, title, start: "unused", end: "unused" },
  from: new Date(Date.UTC(2026, 0, 1 + fromDay)),
  to: new Date(Date.UTC(2026, 0, 1 + toDay)),
  clippedStart: false,
  clippedEnd: false,
  state: "upcoming",
});

/**
 * What a placement occupies, bar and name together.
 *
 * Measured against `labelMax` rather than the name's natural width, because
 * that is what actually reaches the screen: the component sets `max-width` from
 * this number and the stylesheet truncates anything longer. Checking the
 * natural width instead would report overlaps between names that are never
 * drawn at that size.
 */
function claim(p: CalendarPlacement): [number, number] {
  return p.labelAnchor === "start"
    ? [p.x, p.labelX + p.labelMax]
    : [p.labelX - p.labelMax, p.x + p.width];
}

function overlapsOnARow(placements: CalendarPlacement[]): string[] {
  const clashes: string[] = [];
  for (const a of placements) {
    for (const b of placements) {
      if (a === b || a.row !== b.row) continue;
      const [al, ar] = claim(a);
      const [bl] = claim(b);
      if (bl >= al && bl < ar) clashes.push(`${a.bar.entry.title} / ${b.bar.entry.title}`);
    }
  }
  return clashes;
}

describe("layoutCalendar", () => {
  it("places a bar where the scale puts it", () => {
    const { placements } = layoutCalendar([bar("A", 10, 14)], scale, PLOT);
    expect(placements[0].x).toBe(10);
    expect(placements[0].width).toBe(4);
  });

  it("keeps a bar clipped to a sliver visible", () => {
    const { placements } = layoutCalendar([bar("A", 10, 10)], scale, PLOT);
    expect(placements[0].width).toBe(MIN_BAR);
  });

  it("puts the name to the right of the bar, clear of it", () => {
    const [p] = layoutCalendar([bar("Premier", 10, 14)], scale, PLOT).placements;
    expect(p.labelAnchor).toBe("start");
    expect(p.labelX).toBe(10 + 4 + LABEL_GAP);
  });

  it("flips a name that would run off the right edge", () => {
    const [p] = layoutCalendar([bar("Premier Draft", 480, 484)], scale, PLOT).placements;
    expect(p.labelAnchor).toBe("end");
    expect(p.labelX).toBe(480 - LABEL_GAP);
  });

  it("leaves a name on the right when neither side fits", () => {
    // A long name on a bar wide enough that neither margin has room for it.
    // Half off the edge still reads; drawn back over the bars it would not.
    const long = "x".repeat(120);
    const [p] = layoutCalendar([bar(long, 150, 300)], scale, PLOT).placements;
    expect(p.labelAnchor).toBe("start");
  });

  it("puts two entries that cannot share a row on separate rows", () => {
    const { placements, rows } = layoutCalendar(
      [bar("Alpha", 0, 4), bar("Beta", 5, 9)],
      scale,
      PLOT,
    );
    // "Alpha" is 5 chars, so its claim runs well past day 5.
    expect(labelWidth("Alpha")).toBeGreaterThan(5 * CHAR_PX - 1);
    expect(placements.map((p) => p.row)).toEqual([0, 1]);
    expect(rows).toBe(2);
  });

  it("shares a row when there is room for the bar and the name", () => {
    const { placements, rows } = layoutCalendar(
      [bar("Alpha", 0, 4), bar("Beta", 200, 204)],
      scale,
      PLOT,
    );
    expect(placements.map((p) => p.row)).toEqual([0, 0]);
    expect(rows).toBe(1);
  });

  it("reserves the name, not just the bar", () => {
    /*
     * The rule the whole module turns on. These two bars do not touch — day 4
     * ends before day 6 begins — so packing on bars alone would put them on
     * one row and draw the first name straight through the second bar.
     */
    const bars = [bar("A long event name", 0, 4), bar("Beta", 6, 10)];
    const { rows } = layoutCalendar(bars, scale, PLOT);
    expect(rows).toBe(2);
  });

  it("never overlaps two entries on one row", () => {
    // Twenty overlapping spans of assorted lengths and names.
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(`Event number ${i}`, i * 9, i * 9 + (i % 5) + 1),
    );
    const { placements } = layoutCalendar(bars, scale, PLOT);
    expect(overlapsOnARow(placements)).toEqual([]);
  });

  it("never overlaps even when flipping reorders the left edges", () => {
    // Bars crowded against the right edge, so several names flip and the
    // occupied intervals stop being in start order.
    const bars = Array.from({ length: 12 }, (_, i) =>
      bar(`Long event name ${i}`, 430 + i * 5, 432 + i * 5),
    );
    const { placements } = layoutCalendar(bars, scale, PLOT);
    expect(placements.some((p) => p.labelAnchor === "end")).toBe(true);
    expect(overlapsOnARow(placements)).toEqual([]);
  });

  it("keeps the given order so the strip draws in time order", () => {
    const bars = [bar("A", 0, 2), bar("B", 1, 3), bar("C", 2, 4)];
    const { placements } = layoutCalendar(bars, scale, PLOT);
    expect(placements.map((p) => p.bar.entry.title)).toEqual(["A", "B", "C"]);
  });

  it("packs nothing into no rows", () => {
    expect(layoutCalendar([], scale, PLOT)).toEqual({ placements: [], rows: 0 });
  });

  it("leaves a gap between neighbours on a row", () => {
    const { placements } = layoutCalendar([bar("A", 0, 2), bar("B", 200, 202)], scale, PLOT);
    const [, right] = claim(placements[0]);
    expect(placements[1].x).toBeGreaterThanOrEqual(right + ROW_GAP);
  });

  it("caps a name at a share of the width, and reports the cap", () => {
    const long = "Quick Draft: Marvel's Spider-Man";
    const narrow = layoutCalendar([bar(long, 0, 4)], scale, 350);
    expect(labelWidth(long)).toBeGreaterThan(350 * MAX_LABEL_SHARE);
    expect(narrow.placements[0].labelMax).toBeCloseTo(350 * MAX_LABEL_SHARE);
  });

  it("leaves a name that fits alone", () => {
    // The cap must not bind on a desktop, or it would truncate names that had
    // all the room they needed.
    const long = "Quick Draft: Marvel's Spider-Man";
    const wide = layoutCalendar([bar(long, 0, 4)], scale, 1300);
    expect(wide.placements[0].labelMax).toBe(labelWidth(long));
  });

  it("packs far tighter for the cap", () => {
    /*
     * The measurement the cap exists for. These are the real names from a
     * couple of months of Arena events at a phone's plot width; uncapped they
     * take a row each.
     */
    const titles = [
      "Quick Draft: Marvel's Spider-Man",
      "Premier Draft: The Hobbit",
      "Arena Direct: The Hobbit",
      "Set Mastery: The Hobbit",
      "Qualifier Weekend",
      "Midweek Magic",
    ];
    const bars = titles.map((t, i) => bar(t, i * 55, i * 55 + 10));
    expect(layoutCalendar(bars, scale, 350).rows).toBeLessThan(titles.length);
  });

  it("still never overlaps once names are capped", () => {
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(`A really quite long event name ${i}`, i * 9, i * 9 + (i % 5) + 1),
    );
    // `claim` here reads `labelMax`, which is what the renderer is held to.
    expect(overlapsOnARow(layoutCalendar(bars, scale, 350).placements)).toEqual([]);
  });
});

describe("tickEvery", () => {
  // A sixty-seven day window is what `calendarWindow` produces.
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
