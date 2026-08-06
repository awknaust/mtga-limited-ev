import { scaleLinear } from "d3";

import { gemTick, type Money } from "../format";

const WIDTH = 560;
const HEIGHT = 220;
const MARGIN = { top: 38, right: 12, bottom: 48, left: 64 };

/** Ticks are fractions of all outcomes; keep a decimal only when one is needed. */
const asPct = (f: number): string =>
  `${f > 0 && f < 0.01 ? (f * 100).toFixed(1) : Math.round(f * 100)}%`;

/** Where possible outcomes ended up, binned. */
export function ValueHistogram({
  bins,
  m,
  markers = [],
}: {
  bins: { from: number; to: number; count: number }[];
  m: Money;
  markers?: { at: number; label: string; tone: "start" | "median" }[];
}) {
  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  if (!bins.length) return null;

  const lo = bins[0].from;
  const hi = bins[bins.length - 1].to;
  const total = bins.reduce((acc, b) => acc + b.count, 0) || 1;
  const x = scaleLinear().domain([lo, hi]).range([0, inner]);
  const y = scaleLinear()
    .domain([0, Math.max(...bins.map((b) => b.count / total), 0.01)])
    .nice()
    .range([innerH, 0]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="chart-svg"
      role="img"
      aria-label="Distribution of ending value"
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
        {x.ticks(m.unit === "gems" ? 10 : 6).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={innerH} className="chart-gridline" />
            <text y={innerH + 18} textAnchor="middle" className="chart-tick">
              {gemTick(m, t)}
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
            className="chart-bar"
          />
        ))}

        {/* Labelled in place rather than in a legend — two lines do not need
            a key, and a label beside the line cannot be mismatched to it. */}
        {markers
          .filter((m) => m.at >= lo && m.at <= hi)
          .map((m, i) => (
            <g key={m.label} transform={`translate(${x(m.at)},0)`}>
              <line y1={0} y2={innerH} className={`chart-marker-${m.tone}`} />
              {/* Staggered: the median often lands close to the starting
                  balance, and two labels on one line run together. */}
              {/* Anchored away from whichever edge it is near. A label
                  carrying its figure is wide enough to run off either end,
                  and the median lands at the left of a chart whose tail is
                  long — which is most of them. */}
              <text
                y={i % 2 === 0 ? -20 : -8}
                textAnchor={
                  x(m.at) < inner * 0.25
                    ? "start"
                    : x(m.at) > inner * 0.75
                      ? "end"
                      : "middle"
                }
                className={`chart-marker-label-${m.tone}`}
              >
                {m.label}
              </text>
            </g>
          ))}
        <text
          x={inner / 2}
          y={innerH + 40}
          textAnchor="middle"
          className="chart-axis-label"
        >
          {/* The unit is gem-equivalent, so the axis declares the ≈ once and
              leaves the unit to the ticks, which carry 💎 or $ through
              `gemTick`. Naming it here as well restated the symbol an inch
              below — the same redundancy the ending-value tile shed. */}
          Ending value ≈
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
