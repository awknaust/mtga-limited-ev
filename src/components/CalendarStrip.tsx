import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { scaleTime, timeFormat, timeMonday } from "d3";

import {
  calendarWindow,
  lastDayOf,
  parseDay,
  type CalendarBar,
  type CalendarFeed,
} from "../lib";
import { INSIDE_PAD, layoutCalendar, tickEvery } from "./calendarLayout";

/**
 * One class per palette slot, spelled out so `CalendarStrip.test.ts` — which
 * greps this file for string literals — can hold every one to a definition in
 * the stylesheet. A template literal would render the same and be checked by
 * nothing.
 */
const SLOT_CLASS = [
  "calendar-lane-slot-0",
  "calendar-lane-slot-1",
  "calendar-lane-slot-2",
  "calendar-lane-slot-3",
  "calendar-lane-slot-4",
  "calendar-lane-slot-5",
  "calendar-lane-slot-6",
  "calendar-lane-slot-7",
] as const;

/**
 * An entry's dates as a reader says them.
 *
 * The exclusive end is converted here and only here: an entry ending
 * `2026-09-04` runs *to the 3rd*, and a one-day entry is a date rather than a
 * range that starts and finishes on itself.
 */
function rangeText(
  entry: CalendarFeed["entries"][number],
  day: (at: Date) => string,
  dayYear: (at: Date) => string,
): string {
  const from = parseDay(entry.start);
  const to = lastDayOf(entry);
  return from.getTime() === to.getTime() ? dayYear(to) : `${day(from)} – ${dayYear(to)}`;
}

/** What the popover needs: which entry, and where its row sits in the strip. */
type Hover = { bar: CalendarBar; left: number | null; right: number | null; top: number };

/**
 * Where the reader's collapse choice lives. The first and only localStorage
 * in this app, and deliberately so: everything that changes what the numbers
 * mean rides in the link, and folding the calendar away changes nothing about
 * them — it is a device preference, like a window size, and putting it in the
 * URL would make two otherwise-identical links unequal. Storage being denied
 * (private browsing, hardened settings) costs only the memory of the choice.
 *
 * Namespaced with the site, and not spelled `calendar-…`, which
 * `CalendarStrip.test.ts` would read as a class name to hold the stylesheet
 * to.
 */
const COLLAPSE_KEY = "mtga.fyi:collapse-calendar";

const readCollapsed = (): boolean => {
  // Collapsed until the reader says otherwise: the strip is a glance, and the
  // folded row already answers it. Only an explicit open ("0") is remembered
  // as one, so storage denied simply means folded every visit.
  try {
    return localStorage.getItem(COLLAPSE_KEY) !== "0";
  } catch {
    return true;
  }
};

/**
 * What is running, and when — a week back and two months on — above everything
 * else on the page.
 *
 * The one thing here that is not the model. Every other panel answers a
 * question about value; this answers "is that event still on", which nothing
 * in `src/lib` knows and no amount of arithmetic would tell you. It reads a
 * calendar the Worker publishes and draws it, and it deliberately stops there:
 * no entry is matched to a preset or linked anywhere. Each entry arrives
 * carrying its `type` — one of the closed set in `src/lib/calendarEventTypes.ts`,
 * read from the calendar's own `[mtga-meta]` blocks — and the lanes band by
 * it without interpreting it: which lane is which colour falls out of the
 * schedule's order, not out of anything this component knows about Arena.
 *
 * Drawn in HTML rather than SVG, which is worth stating because every other
 * chart here is the other way round. Those sit in a column and are drawn in a
 * fixed 560-unit viewBox stretched to fit, and the lettering stretches with
 * them — tolerable across a column's width, and not across this one's, which
 * runs from a 320px phone to a 1140px container. Lettering sized that way
 * would come out near 3px at one end and 22px at the other. So the strip
 * measures itself and lays out in the reader's own pixels. `styles.css` has
 * the rest of that reasoning.
 */
export function CalendarStrip({ calendar }: { calendar: CalendarFeed }) {
  const strip = useRef<HTMLElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const [open, setOpen] = useState(() => !readCollapsed());

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setHover(null);
    // Computed outside the try: React Compiler cannot yet compile value
    // blocks inside try/catch and bails out of the whole component —
    // silently, which is what react-compiler.test.ts exists to catch.
    const stored = next ? "0" : "1";
    try {
      localStorage.setItem(COLLAPSE_KEY, stored);
    } catch {
      // The choice is not remembered; the toggle still works.
    }
  };

  /**
   * Where to put the popover for a hovered entry, measured off its own row.
   *
   * Anchored to whichever side keeps it on the page — left edge to the bar for
   * an entry in the near half, right edge to it for one in the far half — so
   * it can never run off, which centring on the bar would do at both ends. The
   * same reasoning as the name flip in `calendarLayout`, and cheaper, since a
   * box positioned from an edge needs no knowledge of its own width.
   */
  const anchorOf = (el: HTMLElement, bar: CalendarBar): Hover | null => {
    const host = strip.current;
    if (host === null) return null;
    const box = el.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    const bars = el.firstElementChild?.getBoundingClientRect() ?? box;
    const mid = bars.left + bars.width / 2 - frame.left;
    const near = mid < frame.width / 2;
    return {
      bar,
      left: near ? Math.max(0, bars.left - frame.left) : null,
      right: near ? null : Math.max(0, frame.right - bars.right),
      top: box.bottom - frame.top + 4,
    };
  };

  /*
   * The measurement the pixel layout needs.
   *
   * A layout effect rather than a plain one: it runs after the DOM is
   * committed but *before* the browser paints, so the first frame the reader
   * sees is already laid out. With a plain effect the strip would paint empty
   * and fill in a frame later — a visible jump, and one directly above the
   * rest of the page, so everything below it would jump too.
   *
   * `window.resize` beside the observer for the reason `StatStrip` gives: an
   * element mounted into a viewport that has no size yet measures nothing, and
   * the observer has been seen to stay quiet through the reflow that gives it
   * one.
   */
  useLayoutEffect(() => {
    // Keyed on `open`: while the strip is folded away the plot does not exist,
    // and a mount-only effect would leave one that opened later unmeasured.
    const el = plot.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      resize.disconnect();
    };
  }, [open]);

  /*
   * The window is taken once, when the feed arrives, rather than on every
   * render. Nobody leaves this page open across midnight to watch the marker
   * move, and an interval that redrew the strip on the off-chance would be a
   * timer running for the life of every session.
   */
  const view = useMemo(() => calendarWindow(calendar, new Date()), [calendar]);

  const layout = useMemo(() => {
    if (width === 0) return null;
    const x = scaleTime().domain(view.domain).range([0, width]);
    const spanDays = (view.domain[1].getTime() - view.domain[0].getTime()) / 86_400_000;
    const { lanes, markers } = layoutCalendar(view.bars, x);
    return {
      x,
      lanes,
      markers,
      // Mondays, every `n`th, `n` chosen from the width — see `tickEvery` for
      // why this cannot just ask d3 for a number of ticks.
      ticks: x.ticks(timeMonday.every(tickEvery(width, spanDays)) ?? timeMonday),
    };
  }, [view, width]);

  /*
   * Nothing to say, so nothing is said. A bar reading "no events" pinned above
   * the whole app is noise, and this is the state a preview deploy or a fresh
   * checkout is in — the shipped copy of the feed is empty until someone runs
   * the sync.
   */
  if (view.bars.length === 0) return null;

  const day = timeFormat("%-d %b");
  const dayYear = timeFormat("%-d %b %Y");

  return (
    <section
      /*
       * `card` by class rather than by imitation. An earlier pass painted
       * `var(--bs-card-bg)` on and did not match: Bootstrap's `.card` rule
       * declares its own `--bs-card-bg: var(--bs-body-bg)`, which beats the
       * theme block's inherited value, so the real cards resolve to a colour
       * the variable never shows from outside one. Same class, same
       * resolution, nothing to drift. Kept as two joined literals so the
       * class-name test still sees "calendar-strip".
       */
      className={["calendar-strip", "card"].join(" ")}
      aria-labelledby="calendar-strip-title"
      ref={strip}
    >
      <div className="calendar-strip-head">
        <h2 className="calendar-strip-title" id="calendar-strip-title">
          <button
            type="button"
            className="calendar-strip-toggle"
            aria-expanded={open}
            onClick={toggle}
          >
            <i
              className={open ? "bi bi-chevron-down" : "bi bi-chevron-right"}
              aria-hidden="true"
            />
            Arena event calendar
          </button>
        </h2>
        <span className="calendar-strip-meta">
          {open ? (
            <span className="calendar-strip-stamp">
              as of {dayYear(new Date(view.generatedAt))}
            </span>
          ) : (
            /* Folded away, the row still answers the glance the strip exists
               for: is anything on. */
            <span className="calendar-strip-stamp">
              {view.bars.filter((b) => b.state === "now").length} on now ·{" "}
              {view.bars.filter((b) => b.state === "upcoming").length} ahead
            </span>
          )}
          {/* The same schedule as a real calendar: opens the one-click
              subscribe dialog. Icon-only to keep the head quiet — the name
              lives in the label and the tooltip. The href is the redirect in
              public/_redirects, the one place that knows where the calendar
              lives, so a calendar migration touches no component. Dev has no
              redirect handling and lands back on the app; every deploy,
              previews included, serves the real thing. */}
          <a
            className="calendar-strip-link"
            href="/calendars/small/add"
            target="_blank"
            rel="noreferrer"
            aria-label="Add to Google Calendar"
            title="Add to Google Calendar"
          >
            <i className="bi bi-calendar-plus" aria-hidden="true" />
          </a>
        </span>
      </div>

      {/* Leaving the plot clears the popover. The per-entry `onPointerLeave`
          alone is not enough: a pointer can leave through a gap between two
          entries, or the row under it can be repacked by a resize, and either
          way no entry ever gets told. */}
      {open && (
        <>
        <div className="calendar-plot" ref={plot} onPointerLeave={() => setHover(null)}>
          {layout && (
            <>
              {layout.ticks.map((tick) => (
                <div
                  key={tick.getTime()}
                  className="calendar-gridline"
                  style={{ left: layout.x(tick) }}
                  aria-hidden="true"
                />
              ))}
              <div
                className="calendar-today"
                style={{ left: layout.x(view.today) }}
                aria-hidden="true"
              />
              {layout.lanes.map((lane) => (
                <div
                  className={["calendar-lane", SLOT_CLASS[lane.slot]].join(" ")}
                  key={lane.key}
                >
                  {lane.rows.map((row, i) => (
                    // Rows are stacked in flow and sized by the stylesheet; the
                    // index is the row's identity and nothing else keys off it.
                    <div className="calendar-row" key={i}>
                      {row.map(({ bar, x, width: w, labelMax, labelInside }) => {
                        const { entry, state, clippedStart, clippedEnd } = bar;
                        const range = rangeText(entry, day, dayYear);
                        return (
                          <div
                            key={entry.id}
                            /*
                             * Hover is read from the element rather than computed,
                             * which is what keeps row heights out of JS: the row's
                             * own box says where the popover goes, so the
                             * stylesheet stays the only thing that knows how tall
                             * a row is.
                             */
                            onPointerEnter={(e) => setHover(anchorOf(e.currentTarget, bar))}
                            onPointerLeave={() => setHover(null)}
                          >
                            <span
                              className={[
                                "calendar-bar",
                                state === "past" ? "calendar-bar-past" : "",
                                clippedStart ? "calendar-bar-open-start" : "",
                                clippedEnd ? "calendar-bar-open-end" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              style={{ left: x, width: w }}
                            />
                            {labelInside && (
                              /* The name, where the bar can hold a useful amount
                                 of it. aria-hidden because it may be truncated
                                 and the hidden span below carries the whole
                                 entry; announcing both would say it twice. */
                              <span
                                className={[
                                  "calendar-label",
                                  "calendar-label-inside",
                                  state === "past" ? "calendar-label-past" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                style={{ left: x + INSIDE_PAD, maxWidth: labelMax }}
                                aria-hidden="true"
                              >
                                {entry.title}
                              </span>
                            )}
                            {/* Most bars carry no visible name at all now, so
                                this is the whole reading for anyone not using a
                                pointer. The text is never cut — only boxes are. */}
                            <span className="visually-hidden">
                              {entry.title}, {range}
                              {entry.note === undefined ? "" : `. ${entry.note}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
              {/* Set releases: a moment rather than a span, drawn as a rule
                  across the whole strip. Rendered after the lanes so the line
                  crosses the bars it ends — the events whose last day it is. */}
              {layout.markers.map(({ bar, x }) => {
                const { entry, state } = bar;
                const range = rangeText(entry, day, dayYear);
                return (
                  <div
                    key={entry.id}
                    className={[
                      "calendar-release",
                      state === "past" ? "calendar-release-past" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onPointerEnter={(e) => setHover(anchorOf(e.currentTarget, bar))}
                    onPointerLeave={() => setHover(null)}
                  >
                    <span className="calendar-release-line" style={{ left: x }} />
                    {/* No name on the chart — the diamond is the whole visible
                        mark, and the popover names it on hover. */}
                    <span
                      className="calendar-release-mark"
                      style={{ left: x }}
                      aria-hidden="true"
                    />
                    <span className="visually-hidden">
                      {entry.title}, {range}
                      {entry.note === undefined ? "" : `. ${entry.note}`}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="calendar-axis">
          {layout?.ticks.map((tick) => (
            <span key={tick.getTime()} className="calendar-tick" style={{ left: layout.x(tick) }}>
              {day(tick)}
            </span>
          ))}
        </div>
        </>
      )}

      {/*
       * The full entry, on hover.
       *
       * Rendered here rather than inside the plot because the plot clips —
       * it has to, so that a name at the right edge is cut rather than
       * widening the page — and a popover drawn inside it would be clipped
       * with everything else.
       *
       * It carries the name in full, which the row may have had to truncate,
       * and the dates, which are nowhere on screen. `aria-hidden` because the
       * same text is already in each entry's own hidden span: announcing it
       * twice is worse than not announcing it here at all.
       */}
      {hover && (
        <div
          className="calendar-popover"
          style={{
            top: hover.top,
            ...(hover.left === null ? { right: hover.right! } : { left: hover.left }),
          }}
          aria-hidden="true"
        >
          <strong className="calendar-popover-title">{hover.bar.entry.title}</strong>
          <span className="calendar-popover-dates">
            {rangeText(hover.bar.entry, day, dayYear)}
            {hover.bar.state === "now" ? " · on now" : ""}
          </span>
          {hover.bar.entry.note !== undefined && (
            <span className="calendar-popover-note">{hover.bar.entry.note}</span>
          )}
        </div>
      )}
    </section>
  );
}
