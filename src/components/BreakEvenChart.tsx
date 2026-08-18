import { useId } from "react";
import { scaleBand, scaleLinear } from "d3";

import { expectedNetAt } from "../lib";
import { pct } from "../format";
import type { CompareRow } from "./Compare";
import { CompareHatchDefs, hatchFill } from "./CompareHatch";
import { compareSeries } from "./compareSeries";

const WIDTH = 560;
// Room above the bars for the win-rate label, which cannot go below: the tick
// labels are already there.
const MARGIN = { top: 22, right: 52, bottom: 42, left: 168 };
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
 *
 * Rows arrive ordered and are drawn in the order given. The sort used to live
 * here, and moved out when a second chart on the tab grew rows of its own: two
 * charts stacked with the same events down the left must agree about which is
 * on top, and the only way two orderings stay the same is by being one.
 */
export function BreakEvenChart({
  rows: given,
  winRate,
  rateBand,
}: {
  /** Ordered by `Compare`; see `CompareRow`. */
  rows: readonly CompareRow[];
  /** The reader's own rate, drawn across the bars as the line to clear. */
  winRate: number;
  /**
   * Win rates the record supports, on the same axis the bars are measured in —
   * which is what makes this chart honest rather than merely tidy. A bar ending
   * inside the band is an event whose break-even the record cannot place above
   * or below the reader; only a bar clear of the band is settled either way.
   */
  rateBand: [lo: number, hi: number] | null;
}) {
  const hatchId = `${useId()}-hatch`;
  const rows = given.map(({ name, config, breakEven: rate }) => ({
    name,
    rate,
    alwaysAhead: rate === null && expectedNetAt(config, 0) >= 0,
    ...compareSeries(name),
  }));

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
      <CompareHatchDefs id={hatchId} />
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {/* Behind the bars, so a bar ending inside it stays readable. */}
        {rateBand && (
          <rect
            x={x(rateBand[0])}
            width={Math.max(0, x(rateBand[1]) - x(rateBand[0]))}
            y={-4}
            height={innerH + 4}
            className="chart-band"
          />
        )}
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
                  // The radius every other bar in the app carries. Rows here
                  // are ~19px, the same as the outcome chart's, so 3px lands
                  // the same; SVG clamps the radius to half the width, so a
                  // bar shorter than 6px stays a sliver rather than a blob.
                  rx={3}
                  className={`compare-bar ${row.colorClass}`}
                />
                {/* Over the fill, same geometry: the bar keeps its colour and
                    the slashes are cut out of it. */}
                {row.hatched && (
                  <rect
                    x={0}
                    width={Math.max(0, x(row.rate))}
                    height={y.bandwidth()}
                    rx={3}
                    fill={hatchFill(hatchId, true)}
                  />
                )}
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
        <line x1={x(winRate)} x2={x(winRate)} y1={-4} y2={innerH} className="chart-rate" />
        <text
          x={x(winRate)}
          y={-8}
          textAnchor={winRate > 0.85 ? "end" : "middle"}
          className="chart-rate-label"
        >
          {pct(winRate, 1)}
        </text>

        <text x={inner / 2} y={innerH + 36} textAnchor="middle" className="chart-axis-label">
          Break-even match win rate
        </text>
      </g>
    </svg>
  );
}
