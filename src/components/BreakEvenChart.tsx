import { scaleBand, scaleLinear } from "d3";

import { breakEvenWinRate, expectedNetAt, type EventConfig } from "../lib";
import { compareSeries } from "./compareSeries";

const WIDTH = 560;
const MARGIN = { top: 8, right: 52, bottom: 42, left: 168 };
const ROW = 26;

/**
 * The match win rate each event needs before it stops costing gems.
 *
 * A different question from the curve above, and the one a reader can check
 * against themselves: not "what is this worth" but "can I clear the bar". It is
 * `breakEvenWinRate` — a bisection on the same closed-form expectation — so it
 * moves with the reward values like everything else here.
 *
 * `null` from that function is two different facts, and both are worth showing.
 * An event whose expectation never reaches zero has no bar to draw; one already
 * at or above zero with every match lost never needed one. The two are told
 * apart here by asking what a 0% win rate returns, because the model's
 * signature is a rate and widening it to carry a reason would be a change to
 * the model for a caption's sake. They are labelled rather than dropped — a
 * missing row reads as an event that was never selected.
 */
export function BreakEvenChart({
  configs,
  winRate,
}: {
  configs: readonly { name: string; config: EventConfig }[];
  /** The reader's own rate, drawn across the bars as the line to clear. */
  winRate: number;
}) {
  const rows = configs
    .map(({ name, config }) => {
      const rate = breakEvenWinRate(config);
      return {
        name,
        rate,
        alwaysAhead: rate === null && expectedNetAt(config, 0) >= 0,
        ...compareSeries(name),
      };
    })
    // Ascending, so the easiest bar to clear is at the top. An event with no
    // break-even sorts to the end whichever kind of null it is; the label says
    // which.
    .sort((a, b) => (a.rate ?? Infinity) - (b.rate ?? Infinity));

  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = rows.length * ROW;
  const height = MARGIN.top + MARGIN.bottom + innerH;

  const x = scaleLinear().domain([0, 1]).range([0, inner]);
  const y = scaleBand()
    .domain(rows.map((r) => r.name))
    .range([0, innerH])
    .padding(0.28);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="chart-svg"
      role="img"
      aria-label="Match win rate each event breaks even at"
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {x.ticks(6).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={innerH} className="chart-gridline" />
            <text y={innerH + 16} textAnchor="middle" className="chart-tick">
              {`${Math.round(t * 100)}%`}
            </text>
          </g>
        ))}

        {rows.map((row) => (
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
            {row.rate === null ? (
              <text x={4} y={y.bandwidth() / 2} dy="0.32em" className="chart-tick">
                {row.alwaysAhead ? "ahead at any rate" : "never breaks even"}
              </text>
            ) : (
              <>
                <rect
                  x={0}
                  width={Math.max(0, x(row.rate))}
                  height={y.bandwidth()}
                  className={`compare-bar ${row.colorClass}`}
                />
                <text
                  x={x(row.rate) + 6}
                  y={y.bandwidth() / 2}
                  dy="0.32em"
                  className="chart-value"
                >
                  {`${(row.rate * 100).toFixed(1)}%`}
                </text>
              </>
            )}
          </g>
        ))}

        {/* Where the reader stands. A bar ending left of this line is an event
            the rate they entered already clears. */}
        <line x1={x(winRate)} x2={x(winRate)} y1={-4} y2={innerH} className="chart-breakeven" />

        <text x={inner / 2} y={innerH + 36} textAnchor="middle" className="chart-axis-label">
          Break-even match win rate
        </text>
      </g>
    </svg>
  );
}
