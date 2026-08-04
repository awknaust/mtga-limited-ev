import { scaleBand, scaleLinear } from "d3";

import type { WinBucket } from "../lib";

const WIDTH = 560;
const ROW = 26;
const MARGIN = { top: 8, right: 56, bottom: 26, left: 34 };

/**
 * Outcome distribution as horizontal bars, one per win count, with a tick
 * marking the closed-form probability against the simulated bar.
 *
 * D3 supplies the scales and ticks; React renders the SVG. Keeping the DOM
 * under React avoids the two libraries both trying to own these nodes.
 */
export function DistributionChart({ buckets }: { buckets: WinBucket[] }) {
  const height = MARGIN.top + buckets.length * ROW + MARGIN.bottom;
  const inner = WIDTH - MARGIN.left - MARGIN.right;

  const maxP = Math.max(...buckets.map((b) => Math.max(b.probability, b.exactProbability)));
  const x = scaleLinear().domain([0, maxP || 1]).nice().range([0, inner]);
  const y = scaleBand<number>()
    .domain(buckets.map((b) => b.wins))
    .range([0, buckets.length * ROW])
    .padding(0.22);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="chart-svg"
      role="img"
      aria-label="Distribution of outcomes by win count"
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {x.ticks(5).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line
              y1={0}
              y2={buckets.length * ROW}
              className="chart-gridline"
            />
            <text y={buckets.length * ROW + 16} className="chart-tick" textAnchor="middle">
              {`${Math.round(t * 100)}%`}
            </text>
          </g>
        ))}

        {buckets.map((b) => {
          const yPos = y(b.wins) ?? 0;
          return (
            <g key={b.wins}>
              <text
                x={-8}
                y={yPos + y.bandwidth() / 2}
                dominantBaseline="middle"
                textAnchor="end"
                className="chart-tick"
              >
                {b.wins}W
              </text>
              <rect
                x={0}
                y={yPos}
                width={Math.max(0, x(b.probability))}
                height={y.bandwidth()}
                rx={3}
                className="chart-bar"
              />
              {/* Closed-form probability, as a check on the simulated bar. */}
              <line
                x1={x(b.exactProbability)}
                x2={x(b.exactProbability)}
                y1={yPos - 2}
                y2={yPos + y.bandwidth() + 2}
                className="chart-exact-tick"
              >
                <title>{`exact: ${(b.exactProbability * 100).toFixed(2)}%`}</title>
              </line>
              <text
                x={inner + 8}
                y={yPos + y.bandwidth() / 2}
                dominantBaseline="middle"
                className="chart-value"
              >
                {`${(b.probability * 100).toFixed(2)}%`}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
