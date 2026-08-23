/**
 * Where each bar and each name goes on the calendar strip.
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
 * The strip's other problem is that it sits above the fold and cannot be tall.
 * One row per entry would be twenty rows for a normal couple of months, most
 * of them a weekly series that never overlaps itself; instead every entry is
 * packed onto the first row with space for it.
 *
 * The part worth stating is what "space for it" counts. Packing on the bars
 * alone would be wrong: over a sixty-seven day window a three-day event is a
 * bar some fifty pixels wide, and no name fits inside one. So the names sit
 * beside the bars, and each entry reserves *bar plus name* when it claims its
 * row. The strip is a little taller for it and every bar is legible, which is
 * the trade — an unlabelled timeline is a decoration.
 */

import type { CalendarBar } from "../lib";

/**
 * Width of one character of a name, in pixels.
 *
 * An estimate, because measuring text needs a DOM and a second reflow. It is
 * deliberately above what any real name needs, and the asymmetry is the reason:
 * over-reserving leaves a little extra air beside a name, while
 * under-reserving truncates a name that would have fitted.
 *
 * Measured rather than guessed. Rendering the twenty-odd names from a couple of
 * months of Arena events at `.calendar-label`'s size gives a mean of 5.85px per
 * character and a worst case of 6.50 — "Midweek Magic", since short names full
 * of wide letters skew highest and the per-character average is least reliable
 * exactly where the string is shortest. An earlier 6.4 sat just under that
 * worst case and cut ten of twenty-one names on a 1281px strip that had room
 * for every one of them. This clears it with enough margin for names not in
 * that sample.
 */
export const CHAR_PX = 7;

/** Between a bar and its name, when the name sits beside the bar. */
export const LABEL_GAP = 6;

/** Between a bar's edge and a name sitting inside it. */
export const INSIDE_PAD = 6;

/** Between one entry's claim on a row and the next one's. */
export const ROW_GAP = 10;

/**
 * The narrowest a bar is drawn. A one-day entry is far wider than this at any
 * sane width; what this catches is a bar clipped almost entirely by the
 * window's edge, which should stay a sliver rather than vanish.
 */
export const MIN_BAR = 3;

/**
 * The most of the strip's width one name may claim.
 *
 * Without a ceiling the packing degenerates as the page narrows, and measurably
 * so: at a 351px plot, "Quick Draft: Marvel's Spider-Man" reserves 205px —
 * three-fifths of the row — and twenty-one events pack into *sixteen* rows of a
 * strip meant to be glanced at. Capped, a long name is truncated with an
 * ellipsis and the row it was hogging takes two or three more entries.
 *
 * It binds only where it has to. Two-fifths of a 1300px plot is 520px and no
 * name here approaches that, so a desktop lays out exactly as it would without
 * this.
 */
export const MAX_LABEL_SHARE = 0.4;

export const labelWidth = (title: string): number => title.length * CHAR_PX;

export type CalendarPlacement = {
  bar: CalendarBar;
  /** Bar geometry, in pixels from the plot's left edge. */
  x: number;
  width: number;
  /** Where the name's anchor sits, and which side of it the name hangs. */
  labelX: number;
  labelAnchor: "start" | "end";
  /**
   * Whether the name sits *within* its own bar rather than beside it.
   *
   * The single biggest thing the packing can do for a narrow strip. A
   * six-week event over a sixty-seven day window is a bar covering most of the
   * row; made to carry its name alongside, it claims more than the row has and
   * takes one to itself. Put the name inside — which is the ordinary Gantt
   * treatment, and reads better anyway — and the entry claims only its bar,
   * leaving the rest of the row for something else.
   */
  labelInside: boolean;
  /**
   * What the name was allotted, and what the element has to be held to.
   *
   * The packing reserved exactly this much, so the rendered name must not
   * exceed it: one allowed to run past what was reserved is drawn over its
   * neighbour, which is the single failure this module exists to prevent.
   */
  labelMax: number;
  /** Packed row, 0 at the top. */
  row: number;
};

export type CalendarLayout = {
  /** In the order given, so the strip draws in time order. */
  placements: CalendarPlacement[];
  /** How many rows the packing needed. */
  rows: number;
};

/**
 * Bars placed and packed.
 *
 * `scale` maps a date to a pixel offset — d3's `scaleTime` in the component, a
 * plain linear function in the tests. `plotWidth` is what a name may not run
 * past; a name that would is flipped to the left of its bar instead, which is
 * the same trick `BreakEvenChart` uses for a rate label near the axis's end.
 * Where neither side fits — a very long name on a bar in the last few pixels —
 * it stays on the right and is allowed to clip, because a name half off the
 * edge is still readable and one drawn over the bars is not.
 */
export function layoutCalendar(
  bars: readonly CalendarBar[],
  scale: (at: Date) => number,
  plotWidth: number,
): CalendarLayout {
  const ceiling = plotWidth * MAX_LABEL_SHARE;
  const placements: CalendarPlacement[] = bars.map((bar) => {
    const x = scale(bar.from);
    const width = Math.max(MIN_BAR, scale(bar.to) - x);
    const label = Math.min(labelWidth(bar.entry.title), ceiling);

    // Inside where the bar can hold the name, which costs the row nothing.
    if (width >= label + 2 * INSIDE_PAD) {
      return {
        bar,
        x,
        width,
        labelX: x + INSIDE_PAD,
        labelAnchor: "start",
        labelMax: width - 2 * INSIDE_PAD,
        labelInside: true,
        row: 0,
      };
    }

    const rightAnchor = x + width + LABEL_GAP;
    const flip = rightAnchor + label > plotWidth && x - LABEL_GAP - label >= 0;
    return {
      bar,
      x,
      width,
      labelX: flip ? x - LABEL_GAP : rightAnchor,
      labelAnchor: flip ? "end" : "start",
      labelMax: label,
      labelInside: false,
      row: 0,
    };
  });

  /*
   * Greedy first fit over what each entry actually occupies — bar and name
   * together, which for a flipped name reaches to the *left* of its bar.
   *
   * Walked in order of that left edge rather than of start date, since
   * flipping moves it, and a first-fit that saw its input out of order could
   * hand two overlapping entries the same row. `rowEnds` is maxed rather than
   * assigned for the same reason: belt and braces against an input this
   * function did not sort itself.
   */
  const claim = (p: CalendarPlacement): [number, number] =>
    p.labelInside
      ? [p.x, p.x + p.width]
      : p.labelAnchor === "start"
        ? [p.x, p.labelX + p.labelMax]
        : [p.labelX - p.labelMax, p.x + p.width];

  const rowEnds: number[] = [];
  for (const p of [...placements].sort((a, b) => claim(a)[0] - claim(b)[0])) {
    const [left, right] = claim(p);
    let row = rowEnds.findIndex((end) => end + ROW_GAP <= left);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(right);
    } else {
      rowEnds[row] = Math.max(rowEnds[row], right);
    }
    p.row = row;
  }

  return { placements, rows: rowEnds.length };
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

/**
 * The layout as rows of placements, which is how the strip renders it.
 *
 * The component stacks one element per row in normal flow and lets the
 * stylesheet decide how tall a row is, so this is the last step that has to
 * know a row index at all — and nothing in JS ever multiplies one by a height.
 */
export function groupRows({ placements, rows }: CalendarLayout): CalendarPlacement[][] {
  const grouped: CalendarPlacement[][] = Array.from({ length: rows }, () => []);
  for (const p of placements) grouped[p.row].push(p);
  return grouped;
}
