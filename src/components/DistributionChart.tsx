import { scaleBand, scaleLinear } from "d3";

const WIDTH = 560;
const ROW = 26;
const MARGIN = { top: 8, right: 56, bottom: 46, left: 48 };

export type DistributionRow = {
  /** Whatever the outcome is counted in — wins, packs, boxes. */
  value: number;
  probability: number;
  exactProbability: number;
};

/**
 * A discrete outcome distribution as horizontal bars, one per possible value,
 * with a tick marking the closed-form probability against the simulated bar.
 *
 * Used for win counts and for the reward each of them pays, which is the same
 * chart twice: the rewards are a function of the win count, so their
 * distribution is the win distribution regrouped, closed form and all.
 *
 * D3 supplies the scales and ticks; React renders the SVG. Keeping the DOM
 * under React avoids the two libraries both trying to own these nodes.
 */
export function DistributionChart({
  rows,
  axisLabel,
  rowLabel = (v) => String(v),
  ariaLabel,
}: {
  rows: DistributionRow[];
  /** Names what the rows are counted in, down the left-hand side. */
  axisLabel: string;
  /** How one row's value reads as a tick — "3W" for a win count, say. */
  rowLabel?: (value: number) => string;
  ariaLabel: string;
}) {
  const height = MARGIN.top + rows.length * ROW + MARGIN.bottom;
  const inner = WIDTH - MARGIN.left - MARGIN.right;

  const maxP = Math.max(...rows.map((r) => Math.max(r.probability, r.exactProbability)));
  const x = scaleLinear().domain([0, maxP || 1]).nice().range([0, inner]);
  const y = scaleBand<number>()
    .domain(rows.map((r) => r.value))
    .range([0, rows.length * ROW])
    .padding(0.22);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="chart-svg"
      role="img"
      aria-label={ariaLabel}
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {x.ticks(8).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line
              y1={0}
              y2={rows.length * ROW}
              className="chart-gridline"
            />
            <text y={rows.length * ROW + 16} className="chart-tick" textAnchor="middle">
              {`${Math.round(t * 100)}%`}
            </text>
          </g>
        ))}

        {rows.map((r) => {
          const yPos = y(r.value) ?? 0;
          return (
            <g key={r.value}>
              <text
                x={-8}
                y={yPos + y.bandwidth() / 2}
                dominantBaseline="middle"
                textAnchor="end"
                className="chart-tick"
              >
                {rowLabel(r.value)}
              </text>
              <rect
                x={0}
                y={yPos}
                width={Math.max(0, x(r.probability))}
                height={y.bandwidth()}
                rx={3}
                className="chart-bar"
              />
              {/* Closed-form probability, as a check on the simulated bar. */}
              <line
                x1={x(r.exactProbability)}
                x2={x(r.exactProbability)}
                y1={yPos - 2}
                y2={yPos + y.bandwidth() + 2}
                className="chart-exact-tick"
              >
                <title>{`exact: ${(r.exactProbability * 100).toFixed(2)}%`}</title>
              </line>
              <text
                x={inner + 8}
                y={yPos + y.bandwidth() / 2}
                dominantBaseline="middle"
                className="chart-value"
              >
                {`${(r.probability * 100).toFixed(2)}%`}
              </text>
            </g>
          );
        })}
        <text
          x={inner / 2}
          y={rows.length * ROW + 38}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Share of events
        </text>
        <text
          transform="rotate(-90)"
          x={-(rows.length * ROW) / 2}
          y={-MARGIN.left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          {axisLabel}
        </text>
      </g>
    </svg>
  );
}
