import { scaleLinear } from "d3";

const WIDTH = 560;
const HEIGHT = 208;
const MARGIN = { top: 26, right: 12, bottom: 48, left: 58 };

/** Ticks are fractions of all samples; keep a decimal only when one is needed. */
const asPct = (f: number): string =>
  `${f > 0 && f < 0.01 ? (f * 100).toFixed(1) : Math.round(f * 100)}%`;

/**
 * A whole-number tally across runs — events played, or packs and boxes won.
 *
 * Bucketed rather than one bar per count: a long-lived bankroll can reach the
 * cap and a run can win hundreds of packs, and hundreds of one-wide bars read
 * as noise. Counts small enough to need no bucketing get a bar each anyway,
 * since the bucket width floors at one.
 */
export function CountHistogram({
  histogram,
  median,
  axisLabel,
  ariaLabel,
}: {
  histogram: { value: number; count: number }[];
  median: number;
  axisLabel: string;
  ariaLabel: string;
}) {
  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxValue = histogram.length ? histogram[histogram.length - 1].value : 0;
  const bucketCount = 24;
  const size = Math.max(1, Math.ceil((maxValue + 1) / bucketCount));

  const buckets = new Map<number, number>();
  for (const h of histogram) {
    const key = Math.floor(h.value / size) * size;
    buckets.set(key, (buckets.get(key) ?? 0) + h.count);
  }
  const bars = [...buckets.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value - b.value);

  // Plotted as a share of all samples, so the shape reads the same whatever
  // the trial count.
  const total = histogram.reduce((acc, h) => acc + h.count, 0) || 1;
  const x = scaleLinear().domain([0, maxValue + size]).range([0, inner]);
  const y = scaleLinear()
    .domain([0, Math.max(...bars.map((b) => b.count / total), 0.01)])
    .nice()
    .range([innerH, 0]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="chart-svg"
      role="img"
      aria-label={ariaLabel}
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
        {/* Whole numbers only: a bucket of half an event means nothing. */}
        {x.ticks(10).filter(Number.isInteger).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={innerH} className="chart-gridline" />
            <text y={innerH + 18} textAnchor="middle" className="chart-tick">
              {t}
            </text>
          </g>
        ))}

        {bars.map((b) => (
          <rect
            key={b.value}
            x={x(b.value)}
            y={y(b.count / total)}
            width={Math.max(1, x(size) - x(0) - 1)}
            height={innerH - y(b.count / total)}
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
            {`median ${median}`}
          </text>
        </g>
        <text
          x={inner / 2}
          y={innerH + 40}
          textAnchor="middle"
          className="chart-axis-label"
        >
          {axisLabel}
        </text>
        <text
          transform="rotate(-90)"
          x={-innerH / 2}
          y={-MARGIN.left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          % of samples
        </text>
      </g>
    </svg>
  );
}
