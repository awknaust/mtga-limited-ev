import { scaleBand, scaleLinear } from "d3";

import type { BankrollSummary } from "../lib";
import { approx, gemTick, type Money } from "../format";
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
 */
const MARGIN = { top: 30, right: 92, bottom: 42, left: 168 };
const ROW = 26;

/** How tall the chart will be, so a placeholder can hold its space. */
export const bankrollChartHeight = (rows: number): number =>
  MARGIN.top + MARGIN.bottom + rows * ROW;

export type BankrollMode = "events" | "value";

export const BANKROLL_MODES: readonly { key: BankrollMode; label: string }[] = [
  { key: "events", label: "Events played" },
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
 * **A box plot, because the summary is already five numbers.** The simulation
 * reports p5, p25, the median, p75 and p95, which is exactly the five a box
 * plot draws, so nothing here is a new derivation or a re-binning of one — the
 * whiskers are the outer pair, the box the inner pair, the line the median.
 * The shape also says the thing a single span cannot: how much of the spread
 * is the middle half and how much is the tail, which on these distributions is
 * most of it.
 *
 * **Two measures, one at a time.** How long the balance lasted and what it was
 * worth at the end are different questions in different units, and a reader has
 * one of them in mind at a time — so they are a switch over one chart rather
 * than two columns of one, which is what this was before and which made every
 * row a small table. The switch is the idiom the curve above already set.
 *
 * **The events axis runs to the run-length ceiling, not to the longest bar.**
 * Two things follow that are worth the empty space it sometimes costs. A bar
 * reaching the right-hand edge is a run the ceiling stopped rather than one that
 * went broke, which is a completely different fact about an event and one an
 * auto-scaled axis would hide. And the scale does not move when an event is
 * added or removed, so a bar the reader was looking at stays where it was. The
 * value axis has no such ceiling to run to and takes the widest run instead.
 *
 * Rows are drawn in the order given, which `Compare` shares with the break-even
 * chart above so that the two can be read across.
 */
export function CompareBankroll({
  rows,
  mode,
  maxEvents,
  startValue,
  m,
}: {
  /** Ordered by `Compare`; `summary` is that event's row of the grid. */
  rows: readonly BankrollRow[];
  mode: BankrollMode;
  /** Where a run is cut short, and the end of the events axis. */
  maxEvents: number;
  /**
   * The gem-equivalent balance every row starts from, which is what the ending
   * values are judged against — gems plus gold and points at the reader's own
   * rates, exactly as `runValue` counts what is left of them.
   */
  startValue: number;
  m: Money;
}) {
  const events = mode === "events";

  const drawn = rows.map(({ name, summary }) => ({
    name,
    ...compareSeries(name),
    span: events ? summary.eventPercentiles : summary.valuePercentiles,
    /*
     * No run played an event, so the balance never covered a single entry. In
     * the events chart a zero-width bar would read as an event that ended
     * instantly rather than one that was never entered, so these are labelled
     * instead — the call `BreakEvenChart` already makes for a bar it cannot
     * draw. The value chart needs no such rescue: an untouched balance lands
     * its mark on the starting-balance line, which is exactly the truth.
     */
    unaffordable: events && summary.meanEvents === 0,
    figure: events
      ? { text: String(summary.eventPercentiles.p50), tone: "" }
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
   * as a column of bars that merely stopped early.
   */
  const domainMax = events
    ? Math.max(1, maxEvents)
    : Math.max(1, startValue, ...drawn.map((r) => r.span.p95));

  const x = scaleLinear().domain([0, domainMax]).range([0, inner]);
  const y = scaleBand()
    .domain(drawn.map((r) => r.name))
    .range([0, innerH])
    .padding(0.28);

  /*
   * Whole events only: half a draft is not a thing that happened, so a tick at
   * 2.5 would be labelling a quantity the simulation cannot produce. d3 picks
   * the count; the filter drops the fractions it picks on a short axis.
   */
  const ticks = events ? x.ticks(6).filter((t) => Number.isInteger(t)) : x.ticks(5);

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
          : "What a run is worth at the end, from one starting balance, per event"
      }
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {ticks.map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={innerH} className="chart-gridline" />
            <text y={innerH + 16} textAnchor="middle" className="chart-tick">
              {events ? t : gemTick(m, t)}
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
        {!events && (
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
            <text
              x={-8}
              y={y.bandwidth() / 2}
              dy="0.32em"
              textAnchor="end"
              className="chart-tick"
            >
              {row.name}
            </text>

            {row.unaffordable ? (
              <text x={4} y={y.bandwidth() / 2} dy="0.32em" className="chart-tick">
                no entry affordable
              </text>
            ) : (
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
          {events ? `Events played, of at most ${maxEvents}` : "Value at the end of a run"}
        </text>
      </g>
    </svg>
  );
}
