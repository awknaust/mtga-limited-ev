import { line, scaleLinear } from "d3";

import { bo3WinRate, expectedNetAt, type EventConfig } from "../lib";

const WIDTH = 560;
const HEIGHT = 262;
const MARGIN = { top: 12, right: 16, bottom: 50, left: 74 };

/** Per-game rates to sample. Wide enough to contain every preset's break-even. */
const FROM = 0.3;
const TO = 0.85;
const STEPS = 120;

const fmt = (n: number): string =>
  `${n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString()}`;

/**
 * Expected net against win rate for the current event.
 *
 * Answers what the headline figures cannot: how much a change in skill is
 * worth. The curve is the closed-form expectation, not the simulation, so it
 * is smooth and exact.
 *
 * Sampled on the per-game rate, since that is what `expectedNetAt` takes, but
 * plotted against whichever unit the event runs on so the axis matches the
 * slider.
 */
export function EvCurveChart({
  config,
  breakEven,
}: {
  config: EventConfig;
  breakEven: number | null;
}) {
  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const isBo3 = config.format === "bo3";
  const toAxis = (gameRate: number) => (isBo3 ? bo3WinRate(gameRate) : gameRate);

  const points = Array.from({ length: STEPS + 1 }, (_, i) => {
    const gameRate = FROM + ((TO - FROM) * i) / STEPS;
    return { axis: toAxis(gameRate), net: expectedNetAt(config, gameRate) };
  });

  const x = scaleLinear().domain([toAxis(FROM), toAxis(TO)]).range([0, inner]);
  const netExtent = [
    Math.min(...points.map((p) => p.net)),
    Math.max(...points.map((p) => p.net)),
  ];
  const y = scaleLinear()
    .domain([Math.min(netExtent[0], 0), Math.max(netExtent[1], 0)])
    .nice()
    .range([innerH, 0]);

  const path = line<(typeof points)[number]>()
    .x((p) => x(p.axis))
    .y((p) => y(p.net))(points);

  const current = toAxis(config.winRate);
  const currentNet = expectedNetAt(config, config.winRate);
  const breakEvenAxis = breakEven === null ? null : toAxis(breakEven);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="chart-svg"
      role="img"
      aria-label="Expected net gems against win rate"
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {y.ticks(5).map((t) => (
          <g key={t} transform={`translate(0,${y(t)})`}>
            <line x1={0} x2={inner} className="chart-gridline" />
            <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        {x.ticks(6).map((t) => (
          <text
            key={t}
            x={x(t)}
            y={innerH + 18}
            textAnchor="middle"
            className="chart-tick"
          >
            {`${Math.round(t * 100)}%`}
          </text>
        ))}

        {/* Break-even: where the curve crosses zero. */}
        <line x1={0} x2={inner} y1={y(0)} y2={y(0)} className="chart-zero" />
        {breakEvenAxis !== null && breakEvenAxis >= x.domain()[0] && (
          <line
            x1={x(breakEvenAxis)}
            x2={x(breakEvenAxis)}
            y1={0}
            y2={innerH}
            className="chart-breakeven"
          />
        )}

        <path d={path ?? undefined} className="chart-line" />

        {current >= x.domain()[0] && current <= x.domain()[1] && (
          <g transform={`translate(${x(current)},${y(currentNet)})`}>
            <circle r={4.5} className="chart-marker" />
            <text
              y={currentNet >= 0 ? -10 : 18}
              textAnchor="middle"
              className="chart-value"
            >
              {fmt(currentNet)}
            </text>
          </g>
        )}
        <text
          x={inner / 2}
          y={innerH + 40}
          textAnchor="middle"
          className="chart-axis-label"
        >
          {isBo3 ? "Match win rate" : "Game win rate"}
        </text>
        <text
          transform="rotate(-90)"
          x={-innerH / 2}
          y={-MARGIN.left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Expected net (gems)
        </text>
      </g>
    </svg>
  );
}
