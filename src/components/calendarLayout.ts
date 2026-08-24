/**
 * Where each bar goes on the calendar strip: lanes, rows within a lane, and
 * which bars carry their name inside themselves.
 *
 * Split out of the component because it is arithmetic and the test suite has
 * no DOM — the same arrangement as `compareEvents.ts` and `compareSeries.ts`.
 * The time scale arrives as a plain function, so nothing here imports d3
 * either.
 *
 * **Everything here is in CSS pixels**, against the strip's measured width.
 * That is the one design decision the rest follows from. Every other chart in
 * this app is drawn in a fixed 560-unit viewBox and stretched, which works
 * because they sit in a column; this one runs the full width of the page, so
 * the same trick would render its lettering at about 3px on a phone and 22px
 * on a desktop. Measuring instead — see `CalendarStrip` — costs a layout
 * effect and buys type that is the same size everywhere.
 *
 * The strip sits above the fold and cannot be tall, and the first design paid
 * for that the hard way: every entry carried its name beside its bar and
 * reserved *bar plus name* when it claimed a row, so twenty entries with the
 * long names a real schedule has packed into twelve rows, most holding one
 * event. This layout gives the names up instead and organises by **lane**: a
 * bar's category — the `type` token the feed reads from each entry's
 * `[mtga-meta]` block, the calendar author's own marking, opaque here —
 * decides which band of the strip it lands in, colour says lane, and a name
 * is drawn only where its own bar is wide enough to hold a useful amount of
 * it. Everything else about an entry lives in the popover and in its
 * visually-hidden text.
 *
 * Packing on bars alone has a property worth keeping: it does not depend on
 * the plot's width. A name reserved beside a bar is a fixed number of pixels
 * while the bar is proportional, so the old packing changed shape as the page
 * narrowed; this one is the same arrangement at every width, only scaled.
 */

import type { CalendarBar } from "../lib";

/** Between a bar's edge and a name sitting inside it. */
export const INSIDE_PAD = 6;

/**
 * The narrowest a bar is drawn. A one-day entry is far wider than this at any
 * sane width; what this catches is a bar clipped almost entirely by the
 * window's edge, which should stay a sliver rather than vanish.
 */
export const MIN_BAR = 3;

/**
 * The least of a name worth showing inside a bar, in pixels — about ten
 * characters.
 *
 * Below this a truncated name is little more than an ellipsis, which reads
 * worse than no name at all; such bars stay bare and their lane's colour and
 * the popover carry them. The trade is deliberate and taken with eyes open:
 * at this minimum two long titles differing only in their suffix truncate
 * alike, and the full name is always in the popover and the hidden text.
 */
export const MIN_INSIDE_LABEL = 70;

/**
 * How many lane colours the stylesheet defines (`.calendar-lane-slot-*`).
 * Slot assignment wraps past this, which no plausible calendar reaches.
 */
export const SLOT_COUNT = 8;

export type CalendarPlacement = {
  bar: CalendarBar;
  /** Bar geometry, in pixels from the plot's left edge. */
  x: number;
  width: number;
  /**
   * Whether the bar is wide enough to carry a useful amount of its own name.
   * Narrow bars are bare — their lane's colour and the popover identify them.
   */
  labelInside: boolean;
  /**
   * What the name may occupy, and what the element has to be held to: the
   * component sets `max-width` from this and the stylesheet truncates. A name
   * allowed past it would be drawn over the next bar on the row.
   */
  labelMax: number;
  /** Packed row within the lane, 0 at the top. */
  row: number;
};

export type CalendarLane = {
  /** The shared `type` token, or null for the pooled untyped entries. */
  key: string | null;
  /** Which `.calendar-lane-slot-*` colours it; null for the neutral pool. */
  slot: number | null;
  /** Placements grouped by row, in time order within each row. */
  rows: CalendarPlacement[][];
};

export type CalendarLayout = {
  /** In display order: by each lane's earliest visible bar. */
  lanes: CalendarLane[];
  /** Total rows across all lanes, for whoever needs the strip's height. */
  rows: number;
};

/** Greedy first-fit over the bars alone, returned as rows in x order. */
function packRows(placements: CalendarPlacement[]): CalendarPlacement[][] {
  /*
   * Touching bars share a row on purpose — a schedule full of back-to-back
   * runs (four Flashback Drafts, the play-in-then-weekend qualifier rhythm)
   * would otherwise alternate rows forever. The visible separation between
   * them is the renderer's job: every bar wears a 1px ring of the page
   * colour, so two touching bars still read as two.
   */
  const rowEnds: number[] = [];
  for (const p of [...placements].sort((a, b) => a.x - b.x)) {
    let row = rowEnds.findIndex((end) => end <= p.x);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(p.x + p.width);
    } else {
      rowEnds[row] = Math.max(rowEnds[row], p.x + p.width);
    }
    p.row = row;
  }
  const rows: CalendarPlacement[][] = Array.from({ length: rowEnds.length }, () => []);
  for (const p of [...placements].sort((a, b) => a.x - b.x)) rows[p.row].push(p);
  return rows;
}

/**
 * Bars placed, laned and packed.
 *
 * `scale` maps a date to a pixel offset — d3's `scaleTime` in the component, a
 * plain linear function in the tests.
 *
 * A lane is a `type` token — the author's category, read from the calendar
 * itself — and entries sharing one share a band and a colour. Entries with no
 * type pool into a single neutral lane rather than each taking a coloured one:
 * an untyped entry is the author not having said, which is not a category.
 *
 * Colour slots follow the lanes' display order, so adjacent lanes wear
 * *consecutive* palette slots — the pairing the palette's colour-vision gates
 * were validated on. The trade is that a category's colour can drift as the
 * schedule rotates and its lane changes rank; assigning slots by sorted token
 * instead would pin each colour and was rejected for putting unvalidated hue
 * pairs side by side, which fails readers every day rather than surprising
 * them across weeks.
 */
export function layoutCalendar(
  bars: readonly CalendarBar[],
  scale: (at: Date) => number,
): CalendarLayout {
  const placed = bars.map((bar): CalendarPlacement => {
    const x = scale(bar.from);
    const width = Math.max(MIN_BAR, scale(bar.to) - x);
    return {
      bar,
      x,
      width,
      labelInside: width >= MIN_INSIDE_LABEL + 2 * INSIDE_PAD,
      labelMax: Math.max(0, width - 2 * INSIDE_PAD),
      row: 0,
    };
  });

  const groups = new Map<string, CalendarPlacement[]>();
  const misc: CalendarPlacement[] = [];
  for (const p of placed) {
    const key = p.bar.entry.type ?? null;
    if (key === null) misc.push(p);
    else groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const lanes: CalendarLane[] = [...groups.entries()].map(([key, members]) => ({
    key,
    slot: null as number | null,
    rows: packRows(members),
  }));
  if (misc.length > 0) lanes.push({ key: null, slot: null, rows: packRows(misc) });

  lanes.sort(
    (a, b) =>
      Math.min(...a.rows.flat().map((p) => p.x)) - Math.min(...b.rows.flat().map((p) => p.x)),
  );

  let slot = 0;
  for (const lane of lanes) {
    if (lane.key !== null) lane.slot = slot++ % SLOT_COUNT;
  }

  return { lanes, rows: lanes.reduce((n, lane) => n + lane.rows.length, 0) };
}

/** Room a date label needs before its neighbour, "16 Aug" plus air. */
const TICK_PX = 70;

/**
 * How many weeks apart the axis dates should be.
 *
 * D3's time scale will not take a tick *count* here in any useful way. Asked
 * for anything from two to four over a sixty-seven day span it returns two
 * ticks — the first of each month — and asked for five through fifteen it
 * returns ten, one a week; between those there is nothing, and just past them
 * it jumps to thirty-four. So the interval is chosen here and handed to
 * `ticks` as an interval, which d3 honours exactly.
 *
 * Returns the `n` for `timeMonday.every(n)`: weekly on a desktop, fortnightly
 * on a phone, and never so many that two dates collide.
 */
export function tickEvery(plotWidth: number, spanDays: number): number {
  const fits = Math.max(2, Math.floor(plotWidth / TICK_PX));
  return Math.max(1, Math.ceil(spanDays / 7 / fits));
}
