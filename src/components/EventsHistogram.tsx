import { scaleLinear } from "d3";

const WIDTH = 560;
const HEIGHT = 208;
const MARGIN = { top: 26, right: 12, bottom: 48, left: 58 };

/** Ticks are fractions of all outcomes; keep a decimal only when one is needed. */
const asPct = (f: number): string =>
  `${f > 0 && f < 0.01 ? (f * 100).toFixed(1) : Math.round(f * 100)}%`;


/**
 * How many events a starting balance bought, across runs.
 *
 * Bucketed rather than one bar per count: a long-lived bankroll can reach the
 * cap, and hundreds of one-wide bars read as noise.
 */
export function EventsHistogram({
  histogram,
  median,
}: {
  histogram: { events: number; count: number }[];
  median: number;
}) {
  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxEvents = histogram.length ? histogram[histogram.length - 1].events : 0;
  const bucketCount = 24;
  const size = Math.max(1, Math.ceil((maxEvents + 1) / bucketCount));

  const buckets = new Map<number, number>();
  for (const h of histogram) {
    const key = Math.floor(h.events / size) * size;
    buckets.set(key, (buckets.get(key) ?? 0) + h.count);
  }
  const bars = [...buckets.entries()]
    .map(([events, count]) => ({ events, count }))
    .sort((a, b) => a.events - b.events);

  // Plotted as a share of all outcomes, so the shape reads the same whatever
  // the trial count.
  const total = histogram.reduce((acc, h) => acc + h.count, 0) || 1;
  const x = scaleLinear().domain([0, maxEvents + size]).range([0, inner]);
  const y = scaleLinear()
    .domain([0, Math.max(...bars.map((b) => b.count / total), 0.01)])
    .nice()
    .range([innerH, 0]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="chart-svg"
      role="img"
      aria-label="Distribution of events played before running out"
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
        {x.ticks(10).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={innerH} className="chart-gridline" />
            <text y={innerH + 18} textAnchor="middle" className="chart-tick">
              {t}
            </text>
          </g>
        ))}

        {bars.map((b) => (
          <rect
            key={b.events}
            x={x(b.events)}
            y={y(b.count / total)}
            width={Math.max(1, x(size) - x(0) - 1)}
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
                the word means the median. */}
            {`typically ${median}`}
          </text>
        </g>
        <text
          x={inner / 2}
          y={innerH + 40}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Events played
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
