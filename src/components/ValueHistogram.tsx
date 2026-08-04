import { scaleLinear } from "d3";

const WIDTH = 560;
const HEIGHT = 192;
const MARGIN = { top: 10, right: 12, bottom: 48, left: 64 };

/** Ticks are fractions of all runs; keep a decimal only when one is needed. */
const asPct = (f: number): string =>
  `${f > 0 && f < 0.01 ? (f * 100).toFixed(1) : Math.round(f * 100)}%`;

const short = (n: number): string => {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1000) return `${sign}${Math.round(a / 1000)}k`;
  return `${sign}${Math.round(a)}`;
};

/** Where runs ended up, binned. */
export function ValueHistogram({
  bins,
  markers = [],
}: {
  bins: { from: number; to: number; count: number }[];
  markers?: { at: number; label: string }[];
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
        {y.ticks(4).map((t) => (
          <g key={t} transform={`translate(0,${y(t)})`}>
            <line x1={0} x2={inner} className="chart-gridline" />
            <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
              {asPct(t)}
            </text>
          </g>
        ))}
        {x.ticks(6).map((t) => (
          <text key={t} x={x(t)} y={innerH + 18} textAnchor="middle" className="chart-tick">
            {short(t)}
          </text>
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

        {markers
          .filter((m) => m.at >= lo && m.at <= hi)
          .map((m) => (
            <line
              key={m.label}
              x1={x(m.at)}
              x2={x(m.at)}
              y1={0}
              y2={innerH}
              className="chart-breakeven"
            >
              <title>{m.label}</title>
            </line>
          ))}
        <text
          x={inner / 2}
          y={innerH + 40}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Ending value (gems)
        </text>
        <text
          transform="rotate(-90)"
          x={-innerH / 2}
          y={-MARGIN.left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          % of runs
        </text>
      </g>
    </svg>
  );
}
