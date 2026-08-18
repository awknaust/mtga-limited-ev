import { line, scaleLinear } from "d3";

import { expectedNetAt, type EventConfig } from "../lib";
import { approx, gemTick, pct, type Money } from "../format";

const WIDTH = 560;
const HEIGHT = 262;
const MARGIN = { top: 12, right: 16, bottom: 50, left: 74 };

/** Match win rates to sample. Wide enough to contain every preset's break-even. */
const FROM = 0.3;
const TO = 0.85;
const STEPS = 120;

/**
 * Expected net against win rate for the current event.
 *
 * Answers what the headline figures cannot: how much a change in skill is
 * worth. The curve is the closed-form expectation at each rate, so it is
 * smooth and exact.
 *
 * Sampled and plotted on the match win rate, which is the unit `expectedNetAt`
 * takes and the one the slider sets, so the axis needs no conversion.
 */
export function EvCurveChart({
  config,
  breakEven,
  m,
  rateBand,
}: {
  config: EventConfig;
  breakEven: number | null;
  m: Money;
  /** Win rates the record supports, shaded behind the curve. Null if certain. */
  rateBand: [lo: number, hi: number] | null;
}) {
  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const points = Array.from({ length: STEPS + 1 }, (_, i) => {
    const rate = FROM + ((TO - FROM) * i) / STEPS;
    return { axis: rate, net: expectedNetAt(config, rate) };
  });

  const x = scaleLinear().domain([FROM, TO]).range([0, inner]);
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

  const current = config.winRate;
  const currentNet = expectedNetAt(config, config.winRate);
  const breakEvenAxis = breakEven;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="chart-svg"
      role="img"
      aria-label="Expected net gems against win rate"
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {y.ticks(8).map((t) => (
          <g key={t} transform={`translate(0,${y(t)})`}>
            <line x1={0} x2={inner} className="chart-gridline" />
            <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
              {gemTick(m, t)}
            </text>
          </g>
        ))}
        {x.ticks(10).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={innerH} className="chart-gridline" />
            <text y={innerH + 18} textAnchor="middle" className="chart-tick">
              {`${Math.round(t * 100)}%`}
            </text>
          </g>
        ))}

        {/*
          The win rates the record supports. Drawn first so everything else
          reads on top of it, and clamped to the plotted domain — a short record
          can put the band's edge past either end of the axis.
        */}
        {rateBand && (
          <rect
            x={x(Math.max(rateBand[0], FROM))}
            width={Math.max(0, x(Math.min(rateBand[1], TO)) - x(Math.max(rateBand[0], FROM)))}
            y={0}
            height={innerH}
            className="chart-band"
          />
        )}

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

        {/*
          The rate the reader entered, as a rule and a number.

          The dot below already marks the point, but only against the vertical
          axis: reading its win rate off meant tracing down to the ticks and
          guessing between them. Its own mark rather than the break-even dash
          above, which is amber and means something else entirely.
        */}
        {current >= x.domain()[0] && current <= x.domain()[1] && (
          <>
            <line x1={x(current)} x2={x(current)} y1={0} y2={innerH} className="chart-rate" />
            <text
              x={x(current)}
              y={-2}
              textAnchor={current > TO - (TO - FROM) * 0.1 ? "end" : "middle"}
              className="chart-rate-label"
            >
              {pct(current, 1)}
            </text>
          </>
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
              {approx(m.fmt(currentNet))}
            </text>
          </g>
        )}
        <text
          x={inner / 2}
          y={innerH + 40}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Match win rate
        </text>
        <text
          transform="rotate(-90)"
          x={-innerH / 2}
          y={-MARGIN.left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          {/* The unit is gem-equivalent, so the axis declares the ≈ once and
              leaves the unit to the ticks, which carry 💎 or $ through
              `gemTick`. Naming it here as well restated the symbol an inch
              away — the same redundancy the ending-value tile shed. */}
          Expected net ≈
        </text>
      </g>
    </svg>
  );
}
