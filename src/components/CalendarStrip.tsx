import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /*
   * The entry whose details are open, or null. Selection, not hover: the strip
   * is read on phones and tablets, where hover is a synthetic afterthought —
   * the old popover opened under the finger that asked for it and vanished
   * with it. A bar toggles its entry on click or tap; the close button,
   * Escape and a click anywhere else put it away; a pointer is never
   * required.
   */
  const [selected, setSelected] = useState<CalendarBar | null>(null);
  /*
   * Folded on every mount, and deliberately remembered nowhere. Not in the
   * URL, where a window-dressing preference would make two otherwise-equal
   * links unequal; not in localStorage either — that was shipped and backed
   * out, because an open remembered on one visit surfaced the calendar above
   * the numbers of every later share link. The strip is a glance, the folded
   * row already answers it, and opening is one click.
   */
  const [open, setOpen] = useState(false);

  const toggle = () => {
    setOpen(!open);
    setSelected(null);
  };

  /*
   * A second click on the open entry puts it away; a click on any other
   * switches to it. One function so the bars and the release marks cannot
   * drift apart on what a click means.
   */
  const select = (bar: CalendarBar) =>
    setSelected((prev) => (prev?.entry.id === bar.entry.id ? null : bar));

  /*
   * A click anywhere else puts the popover away — the exit a reader reaches
   * for without thinking, beside the deliberate two (the close button and
   * Escape). Bars and marks are excluded so a click on a second entry
   * switches rather than closing what it just opened, and the popover is
   * excluded so selecting text in a note is not an exit. A document listener
   * rather than a backdrop, because the page under the popover stays live —
   * a click out there should *both* do its own work and close this. Bound
   * only while something is selected, so the page carries no listener the
   * rest of the time.
   */
  useEffect(() => {
    if (selected === null) return;
    const away = (e: MouseEvent) => {
      const at = e.target instanceof Element ? e.target : null;
      if (at?.closest(".calendar-popover, .calendar-bar, .calendar-release-mark")) return;
      setSelected(null);
    };
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, [selected]);

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
      onKeyDown={(e) => {
        if (e.key === "Escape") setSelected(null);
      }}
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
              subscribe dialog, said in two words and link colour — the
              tooltip carries the rest. The href is the redirect in
              public/_redirects, the one place that knows where the calendar
              lives, so a calendar migration touches no component. Dev has no
              redirect handling and lands back on the app; every deploy,
              previews included, serves the real thing. */}
          <a
            className="calendar-strip-link"
            href="/calendars/small/add"
            target="_blank"
            rel="noreferrer"
            title="Add to Google Calendar"
          >
            <i className="bi bi-calendar-plus" aria-hidden="true" /> Add Calendar
          </a>
        </span>
      </div>

      {open && (
        <>
        <div className="calendar-plot" ref={plot}>
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
                          <div key={entry.id}>
                            {/*
                              * The bar is the control: clicking it opens the
                              * entry in the popover, clicking again closes it.
                              * A button rather than a span with a handler, so
                              * the same toggle is a Tab stop and an Enter press
                              * for anyone not using a pointer.
                              */}
                            <button
                              type="button"
                              className={[
                                "calendar-bar",
                                state === "past" ? "calendar-bar-past" : "",
                                clippedStart ? "calendar-bar-open-start" : "",
                                clippedEnd ? "calendar-bar-open-end" : "",
                                selected?.entry.id === entry.id ? "calendar-bar-selected" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              style={{ left: x, width: w }}
                              aria-expanded={selected?.entry.id === entry.id}
                              onClick={() => select(bar)}
                            >
                              {/* Most bars carry no visible name at all, so this
                                  — the button's accessible name — is the whole
                                  reading for anyone not using a pointer. The
                                  text is never cut; only boxes are. */}
                              <span className="visually-hidden">
                                {entry.title}, {range}
                                {entry.note === undefined ? "" : `. ${entry.note}`}
                              </span>
                            </button>
                            {labelInside && (
                              /* The name, where the bar can hold a useful amount
                                 of it. aria-hidden because it may be truncated
                                 and the button already carries the whole entry;
                                 announcing both would say it twice. */
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
                  >
                    <span className="calendar-release-line" style={{ left: x }} />
                    {/* No name on the chart — the diamond is the whole visible
                        mark, doubling as the button that opens the popover,
                        and the popover carries the rest. */}
                    <button
                      type="button"
                      className={[
                        "calendar-release-mark",
                        selected?.entry.id === entry.id ? "calendar-release-selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ left: x }}
                      aria-expanded={selected?.entry.id === entry.id}
                      onClick={() => select(bar)}
                    >
                      <span className="visually-hidden">
                        {entry.title}, {range}
                        {entry.note === undefined ? "" : `. ${entry.note}`}
                      </span>
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/*
           * The selected entry in full.
           *
           * It used to float beside the hovered bar, and on a phone or tablet
           * that was unreadable: it opened under the finger that asked for it
           * and left with it. So it overlays the plot in one fixed place — the
           * bottom left — with a close button, and a tap or click on a bar
           * toggles it. Anchored at the plot's own left edge, so the plot's
           * horizontal clip can never cut it, and yes, it covers the bars
           * beneath it: the reader asked for it, and the close button and a
           * second click on the bar both give the corner back.
           *
           * It carries the name in full, which the row may have had to
           * truncate, and the dates, which are nowhere else on screen. The
           * same text is each bar's accessible name, so a screen reader hears
           * it from the button already — the duplication is on demand, not
           * announced twice on the way past.
           */}
          {selected && (
            <div className="calendar-popover">
              <div className="calendar-popover-head">
                <strong className="calendar-popover-title">{selected.entry.title}</strong>
                <button
                  type="button"
                  className="calendar-popover-close"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                >
                  <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
              </div>
              <span className="calendar-popover-dates">
                {rangeText(selected.entry, day, dayYear)}
                {selected.state === "now" ? " · on now" : ""}
              </span>
              {selected.entry.note !== undefined && (
                <span className="calendar-popover-note">{selected.entry.note}</span>
              )}
              {selected.entry.link !== undefined && (
                <a
                  className="calendar-popover-link"
                  href={selected.entry.link.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selected.entry.link.text}{" "}
                  <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                </a>
              )}
            </div>
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
    </section>
  );
}
