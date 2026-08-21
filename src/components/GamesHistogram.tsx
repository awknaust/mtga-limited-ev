import { scaleLinear } from "d3";

import { gamesLabel } from "../format";

const WIDTH = 560;
const HEIGHT = 208;
const MARGIN = { top: 26, right: 12, bottom: 48, left: 58 };

/** Ticks are fractions of all outcomes; keep a decimal only when one is needed. */
const asPct = (f: number): string =>
  `${f > 0 && f < 0.01 ? (f * 100).toFixed(1) : Math.round(f * 100)}%`;

/**
 * How much play a starting balance bought, across runs — the events histogram
 * beside it read in games, the unit the budget knob is set in.
 *
 * The bins arrive from the simulation rather than being bucketed here, unlike
 * the events chart's: games sit on a lattice only the model knows — whole
 * matches at `gamesPerMatch` apiece — and `gamesHistogram` cuts its edges on
 * that lattice so the bars cannot comb. The axis still opens at zero, as the
 * events axis does: where the shortest run stands is part of what the chart
 * says, and a domain clipped to the sample would hide it.
 */
export function GamesHistogram({
  bins,
  median,
}: {
  bins: { from: number; to: number; count: number }[];
  median: number;
}) {
  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  if (!bins.length) return null;

  const hi = bins[bins.length - 1].to;
  const total = bins.reduce((acc, b) => acc + b.count, 0) || 1;
  const x = scaleLinear().domain([0, hi]).range([0, inner]);
  const y = scaleLinear()
    .domain([0, Math.max(...bins.map((b) => b.count / total), 0.01)])
    .nice()
    .range([innerH, 0]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="chart-svg"
      role="img"
      aria-label="Distribution of games played before running out"
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {y.ticks(6).map((t) => (
          <g key={t} transform={`translate(0,${y(t)})`}>
            <line x1={0} x2={inner} className="chart-gridline" />
            <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
              {asPct(t)}
            </text>
          </g>
        ))}
        {/* Whole games only: a tick at 2.5 would label a quantity between the
            lattice points every bar stands on. */}
        {x.ticks(10)
          .filter((t) => Number.isInteger(t))
          .map((t) => (
            <g key={t} transform={`translate(${x(t)},0)`}>
              <line y1={0} y2={innerH} className="chart-gridline" />
              <text y={innerH + 18} textAnchor="middle" className="chart-tick">
                {t}
              </text>
            </g>
          ))}

        {bins.map((b) => (
          <rect
            key={b.from}
            x={x(b.from)}
            y={y(b.count / total)}
            width={Math.max(1, x(b.to) - x(b.from) - 1)}
            height={innerH - y(b.count / total)}
            rx={3}
            className="chart-bar"
          />
        ))}

        <g transform={`translate(${x(median)},0)`}>
          <line y1={0} y2={innerH} className="chart-marker-median" />
          <text
            y={-8}
            textAnchor={x(median) > inner * 0.75 ? "end" : "middle"}
            className="chart-marker-label-median"
          >
            {/* "Typically", as the tiles say — the tile popovers teach that
                the word means the median. `gamesLabel` decides when the count
                earns an ≈. */}
            {`typically ${gamesLabel(median)}`}
          </text>
        </g>
        <text
          x={inner / 2}
          y={innerH + 40}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Games played
        </text>
        <text
          transform="rotate(-90)"
          x={-innerH / 2}
          y={-MARGIN.left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          % of outcomes
        </text>
      </g>
    </svg>
  );
}
