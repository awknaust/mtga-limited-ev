import { useId } from "react";
import { scaleBand, scaleLinear } from "d3";

import type { BankrollSummary } from "../lib";
import { approx, gamesLabel, gemTick, type Money } from "../format";
import { CompareHatchDefs, hatchFill } from "./CompareHatch";
import { rowLabelLines } from "./compareEvents";
import { compareSeries } from "./compareSeries";

const WIDTH = 560;
/*
 * Room on the right for the median's own figure — the bar says roughly where it
 * lands and the column says exactly — and above it for that column's heading,
 * which is why the top margin is deeper than the break-even chart's.
 *
 * The median is a column rather than a label beside its own bar because a bar
 * reaching the ceiling has no room to the right of it, and a number that
 * sometimes sits inside the plot and sometimes past its edge is a number the
 * eye has to hunt for down a column of rows.
 *
 * The left margin matches the break-even chart's exactly, and has to: the two
 * are stacked with the same names down the same edge and read across, so a
 * row's label must start at the same place in both. It is sized for the widest
 * *line* a name wraps to rather than for the widest name.
 */
const MARGIN = { top: 30, right: 92, bottom: 42, left: 112 };
const ROW = 26;

/** How tall the chart will be, so a placeholder can hold its space. */
export const bankrollChartHeight = (rows: number): number =>
  MARGIN.top + MARGIN.bottom + rows * ROW;

export type BankrollMode = "events" | "games" | "value";

export const BANKROLL_MODES: readonly { key: BankrollMode; label: string }[] = [
  { key: "events", label: "Events played" },
  // The same run lengths in the budget's own unit. Worth a mode of its own
  // because it is the one axis where every row's stopping point is the same
  // number: the budget is shared, where the event cap it converts to is not.
  { key: "games", label: "Games played" },
  // "Outcomes" as the reader meets it here: not the per-event outcome table,
  // but where a whole run of them left the balance.
  { key: "value", label: "Outcomes" },
];

export type BankrollRow = { name: string; summary: BankrollSummary };

/**
 * Ahead, behind, or neither — three cases where the tiles elsewhere have two.
 *
 * The third one is real here and is not a rounding curiosity: an event whose
 * entry the balance never covers returns the balance untouched, and painting
 * that green would report never having played as a gain. So exact equality is
 * its own case, and it is left in the body colour, which is what "nothing
 * happened" should look like.
 */
const toneOf = (value: number, start: number): string =>
  value === start ? "" : value > start ? "chart-value-up" : "chart-value-down";

/**
 * How far one starting balance goes in each event.
 *
 * The one simulated thing on this tab. Everything above it is a sum over an
 * outcome distribution, exact and instant; this is a stopped random walk —
 * entries paid from a real balance, winnings recycled, the run over when
 * neither currency covers another entry — and a stopped walk has no PMF to sum
 * over. So it is sampled, in a worker, and the whole grid is one job at one
 * seed. That last part is what makes the rows comparable: every event is played
 * against the same stream of draws, so the difference between two rows is the
 * events and not the luck.
 *
 * **A percentile box plot, deliberately, and not a Tukey one.** The whiskers
 * reach p5 and p95 rather than 1.5×IQR, and nothing is drawn as an outlier.
 * Two reasons, and both would still hold if the shape were free. Tukey's
 * fences are computed from the values themselves, and `BankrollSummary`
 * carries five percentiles precisely so the values do not have to cross the
 * worker boundary — reinstating them is the ~4.3 MB the second request kind
 * exists to avoid. And these distributions are discrete and hard right-skewed:
 * events played is an integer under a ceiling, and ending value has a long
 * tail wherever a ladder pays a box. At ten thousand runs the fences would
 * class thousands of them as outliers, and one row per event would become a
 * smear of dots. What is drawn is five numbers the simulation already reports,
 * which is why the caption says which five rather than leaving the reader to
 * assume the usual ones.
 *
 * **Three measures, one at a time.** How long the balance lasted — in entries,
 * or in the games they took — and what it was worth at the end are different
 * questions in different units, and a reader has one of them in mind at a time
 * — so they are a switch over one chart rather than columns of one, which is
 * what this was before and which made every row a small table. The switch is
 * the idiom the curve above already set.
 *
 * **The events axis runs to the run-length ceiling, not to the longest bar.**
 * Two things follow that are worth the empty space it sometimes costs. A bar
 * reaching the right-hand edge is a run the ceiling stopped rather than one that
 * went broke, which is a completely different fact about an event and one an
 * auto-scaled axis would hide. And the scale does not move when an event is
 * added or removed, so a bar the reader was looking at stays where it was. The
 * value axis has no such ceiling to run to and takes the widest run instead.
 *
 * One caveat since the stopping point became a games budget: the ceiling is
 * per event — the same budget is fewer entries of a best-of-three — and the
 * axis runs to the largest of them. So only the longest-capped rows can touch
 * the right edge, and a shorter event's ceiling-stopped runs stack short of
 * it: the budget being honest about table time, not the chart clipping.
 *
 * The games axis is that caveat resolved, and is why the mode earns its place:
 * in games the shared budget *is* the ceiling, the same number for every row,
 * so runs stopped by the plan stack together at the right wherever their event
 * put its cap. It runs to the budget or the widest run, whichever is further —
 * a capped run can play out its last entry past the budget line, since the cap
 * rounds to whole events and the final event is as long as it happens to be.
 *
 * Rows are drawn in the order given, which `Compare` shares with the break-even
 * chart above so that the two can be read across.
 */
export function CompareBankroll({
  rows,
  mode,
  eventCap,
  maxGames,
  startValue,
  m,
}: {
  /** Ordered by `Compare`; `summary` is that event's row of the grid. */
  rows: readonly BankrollRow[];
  mode: BankrollMode;
  /**
   * The largest of the rows' own event caps, and the end of the events axis —
   * see the caveat above about which rows can reach it.
   */
  eventCap: number;
  /** The games budget those caps were converted from, for the axis label. */
  maxGames: number;
  /**
   * The gem-equivalent balance every row starts from, which is what the ending
   * values are judged against — gems plus gold and points at the reader's own
   * rates, exactly as `runValue` counts what is left of them.
   */
  startValue: number;
  m: Money;
}) {
  const events = mode === "events";
  const games = mode === "games";
  const value = mode === "value";
  const hatchId = `${useId()}-hatch`;

  const drawn = rows.map(({ name, summary }) => ({
    name,
    ...compareSeries(name),
    span: events
      ? summary.eventPercentiles
      : games
        ? summary.gamePercentiles
        : summary.valuePercentiles,
    /*
     * No run played an event, so the balance never covered a single entry, and
     * the whole distribution is a point at zero — in events and in games alike,
     * a run that entered nothing having played nothing. Nothing is drawn: a box
     * and a median line stacked on the axis origin is a mark that has to be
     * squinted at and then means nothing anyway, where an empty row beside a
     * plain 0 in the figures column says it at a glance. The value chart needs
     * no such case — an untouched balance lands its box on the starting-balance
     * line, which is exactly the truth.
     */
    unaffordable: !value && summary.meanEvents === 0,
    figure: events
      ? { text: String(summary.eventPercentiles.p50), tone: "" }
      : games
        ? // `gamesLabel` decides when the count earns an ≈ — a best-of-three
          // median lands between whole games, and half a game is not a thing
          // anyone played.
          { text: gamesLabel(summary.gamePercentiles.p50), tone: "" }
        : {
            text: approx(m.fmt(summary.medianFinalValue)),
            tone: toneOf(summary.medianFinalValue, startValue),
          },
  }));

  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = drawn.length * ROW;
  const height = MARGIN.top + MARGIN.bottom + innerH;

  /*
   * The value axis is floored at zero and stretched to cover the starting
   * balance even where every run ended under it: the line the bars are judged
   * against has to be on the chart, or a column of bars well short of it reads
   * as a column of bars that merely stopped early. The games axis stretches to
   * the shared budget the same way and for the same reason — it is the number
   * the bars are read against — while the widest run can still overshoot it by
   * part of an event, as the caveat above says.
   */
  const domainMax = events
    ? Math.max(1, eventCap)
    : games
      ? Math.max(1, maxGames, ...drawn.map((r) => r.span.p95))
      : Math.max(1, startValue, ...drawn.map((r) => r.span.p95));

  const x = scaleLinear().domain([0, domainMax]).range([0, inner]);
  const y = scaleBand()
    .domain(drawn.map((r) => r.name))
    .range([0, innerH])
    .padding(0.28);

  /*
   * Whole events only, and whole games: half a draft is not a thing that
   * happened, and a games tick at 2.5 would label a point between the lattice
   * the bars stand on. d3 picks the count; the filter drops the fractions it
   * picks on a short axis.
   */
  const ticks = value ? x.ticks(5) : x.ticks(6).filter((t) => Number.isInteger(t));

  /*
   * Box-plot geometry, in the band each row gets. The box takes most of the
   * band and the caps a little less, so the two ends of a whisker read as
   * belonging to the box between them rather than as separate ticks.
   */
  const mid = y.bandwidth() / 2;
  const boxH = y.bandwidth();
  const capH = y.bandwidth() * 0.32;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="chart-svg"
      role="img"
      aria-label={
        events
          ? "Events played from one starting balance, per event"
          : games
            ? "Games played from one starting balance, per event"
            : "What a run is worth at the end, from one starting balance, per event"
      }
    >
      <CompareHatchDefs id={hatchId} />
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {ticks.map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={innerH} className="chart-gridline" />
            <text y={innerH + 16} textAnchor="middle" className="chart-tick">
              {value ? gemTick(m, t) : t}
            </text>
          </g>
        ))}

        {/*
          Where the balance started, in the Bankroll tab's own marker: same
          dash, same colour, same word. That tab teaches this vocabulary on its
          ending-value histogram — pink is where you began, amber is where a run
          typically lands — and a reader arriving here having learnt it should
          not have to learn it twice. Carrying the figure for the reason that
          chart's marker does: the axis under it is lettered in thousands, so
          the line alone says roughly where you began and never what it was.
        */}
        {value && (
          <>
            <line
              x1={x(startValue)}
              x2={x(startValue)}
              y1={-4}
              y2={innerH}
              className="chart-marker-start"
            />
            <text
              x={x(startValue)}
              y={-10}
              textAnchor={x(startValue) > inner * 0.8 ? "end" : "middle"}
              className="chart-marker-label-start"
            >
              {`starting ${approx(m.fmt(startValue))}`}
            </text>
          </>
        )}

        {/* "Typically", as the tiles and the histogram markers say — their
            popovers are where the reader is taught it means the median. */}
        <text x={inner + MARGIN.right - 8} y={-10} textAnchor="end" className="chart-tick">
          typically
        </text>

        {drawn.map((row) => (
          <g key={row.name} transform={`translate(0,${y(row.name) ?? 0})`}>
            <RowLabel name={row.name} mid={y.bandwidth() / 2} />

            {row.unaffordable ? null : (
              <g className={row.colorClass}>
                {/* Whiskers to p5 and p95 — the middle nineteen runs in
                    twenty — capped at each end so the reach is a mark rather
                    than a line trailing off. */}
                <line
                  x1={x(row.span.p5)}
                  x2={x(row.span.p95)}
                  y1={mid}
                  y2={mid}
                  className="compare-whisker"
                />
                {[row.span.p5, row.span.p95].map((at, i) => (
                  <line
                    key={i}
                    x1={x(at)}
                    x2={x(at)}
                    y1={mid - capH}
                    y2={mid + capH}
                    className="compare-whisker"
                  />
                ))}
                {/* The middle half. Floored at a hairline so a quartile range
                    of nothing is still a mark rather than an empty row. */}
                <rect
                  x={x(row.span.p25)}
                  width={Math.max(1, x(row.span.p75) - x(row.span.p25))}
                  height={boxH}
                  y={mid - boxH / 2}
                  rx={2}
                  className="compare-box"
                />
                {/* Over the fill, same geometry: the box keeps its colour and
                    the slashes are cut out of it. */}
                {row.hatched && (
                  <rect
                    x={x(row.span.p25)}
                    width={Math.max(1, x(row.span.p75) - x(row.span.p25))}
                    height={boxH}
                    y={mid - boxH / 2}
                    rx={2}
                    fill={hatchFill(hatchId, true)}
                  />
                )}
                <line
                  x1={x(row.span.p50)}
                  x2={x(row.span.p50)}
                  y1={mid - boxH / 2}
                  y2={mid + boxH / 2}
                  className="compare-median"
                />
              </g>
            )}

            <text
              x={inner + MARGIN.right - 8}
              y={y.bandwidth() / 2}
              dy="0.32em"
              textAnchor="end"
              className={`chart-value ${row.figure.tone}`}
            >
              {row.figure.text}
            </text>
          </g>
        ))}

        <text x={inner / 2} y={innerH + 36} textAnchor="middle" className="chart-axis-label">
          {events
            ? `Events played, within ${maxGames} games`
            : games
              ? `Games played, of a ${maxGames}-game budget`
              : "Value at the end of a run"}
        </text>
      </g>
    </svg>
  );
}

/**
 * A row's event name, on one line or two.
 *
 * SVG does not wrap text, so the lines are `tspan`s placed by hand: both are
 * pulled back to the same `x` because a `tspan` otherwise continues from where
 * the last one ended, and the pair is shifted up half a line so that two lines
 * straddle the row's middle exactly as one line sits on it.
 *
 * The `<title>` is the whole name whatever the lines do — the tooltip a pointer
 * gets, and the only place a clipped name survives.
 */
function RowLabel({ name, mid }: { name: string; mid: number }) {
  const lines = rowLabelLines(name);
  return (
    <text x={-8} y={mid} dy="0.32em" textAnchor="end" className="chart-tick">
      <title>{name}</title>
      {lines.length === 1 ? (
        lines[0]
      ) : (
        lines.map((line, i) => (
          <tspan key={line} x={-8} dy={i === 0 ? "-0.55em" : "1.1em"}>
            {line}
          </tspan>
        ))
      )}
    </text>
  );
}
