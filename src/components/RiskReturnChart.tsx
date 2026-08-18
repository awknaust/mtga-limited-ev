import { scaleLinear } from "d3";

import { expectedNet, netStdDev, type EventConfig } from "../lib";
import { gemTick, type Money } from "../format";
import { compareSeries } from "./compareSeries";

const WIDTH = 560;
const HEIGHT = 300;
const MARGIN = { top: 12, right: 24, bottom: 50, left: 78 };

/**
 * Spread against expectation, one dot per event.
 *
 * Both figures are closed form over the same exact outcome distribution — the
 * mean the tiles already show, and the standard deviation around it. Nothing
 * here is sampled.
 *
 * The pair says something neither number says alone. Two ladders can return the
 * same gems per entry and differ entirely in how those gems arrive: a little at
 * a time from most entries, or rarely and in bulk. Whether that matters, and
 * which side of it to prefer, depends on how large a balance the reader is
 * playing off and how much variance they will sit through — which is theirs to
 * weigh, and why this draws the two axes and stops.
 */
export function RiskReturnChart({
  configs,
  m,
}: {
  configs: readonly { name: string; config: EventConfig }[];
  m: Money;
}) {
  const points = configs.map(({ name, config }) => ({
    name,
    spread: netStdDev(config),
    net: expectedNet(config),
    ...compareSeries(name),
  }));

  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const x = scaleLinear()
    .domain([0, Math.max(1, ...points.map((p) => p.spread))])
    .nice()
    .range([0, inner]);
  const y = scaleLinear()
    .domain([Math.min(0, ...points.map((p) => p.net)), Math.max(0, ...points.map((p) => p.net))])
    .nice()
    .range([innerH, 0]);

  /*
   * Labels pushed apart where two events land close together, which is the
   * normal case rather than the exception: the evergreen drafts cluster near
   * the origin whenever a ladder paying boxes stretches the axes past them.
   *
   * Ordered by height and placed top down, each at least `gap` below the last,
   * so a label can only ever be pushed *down* and never onto one already
   * settled. The dot itself never moves — only the name does, and a leader
   * line says so wherever the two have come apart.
   */
  const gap = 12;
  const placed: { name: string; colorClass: string; cx: number; cy: number; labelY: number }[] =
    [];
  for (const p of [...points].sort((a, b) => y(a.net) - y(b.net))) {
    const cy = y(p.net);
    const floor = placed.length === 0 ? -Infinity : placed[placed.length - 1].labelY + gap;
    placed.push({
      name: p.name,
      colorClass: p.colorClass,
      cx: x(p.spread),
      cy,
      labelY: Math.max(cy, floor),
    });
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="chart-svg"
      role="img"
      aria-label="Expected net against the spread of outcomes, one point per event"
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {y.ticks(6).map((t) => (
          <g key={t} transform={`translate(0,${y(t)})`}>
            <line x1={0} x2={inner} className="chart-gridline" />
            <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
              {gemTick(m, t)}
            </text>
          </g>
        ))}
        {x.ticks(6).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={innerH} className="chart-gridline" />
            <text y={innerH + 18} textAnchor="middle" className="chart-tick">
              {gemTick(m, t)}
            </text>
          </g>
        ))}

        <line x1={0} x2={inner} y1={y(0)} y2={y(0)} className="chart-zero" />

        {placed.map((p) => (
          <g key={p.name}>
            <circle
              cx={p.cx}
              cy={p.cy}
              r={5}
              className={`compare-dot ${p.colorClass}`}
            />
            {/*
              Labelled in place: a dot without a name is a dot, and unlike the
              curve chart there is no line running to the margin for a name to
              sit at the end of.

              Where a label has been pushed off its dot to clear another, a
              leader joins the two. Without it the nudge is a lie — the reader
              reads the label against whatever height it ended up at, which is
              the one thing this chart is asking them to compare.
            */}
            {Math.abs(p.labelY - p.cy) > 1 && (
              <line
                x1={p.cx + 5}
                y1={p.cy}
                x2={p.cx + 9}
                y2={p.labelY}
                className={`compare-leader ${p.colorClass}`}
              />
            )}
            <text
              x={p.cx + 11}
              y={p.labelY}
              dy="0.32em"
              className={`compare-end-label ${p.colorClass}`}
            >
              {p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name}
            </text>
          </g>
        ))}

        <text x={inner / 2} y={innerH + 40} textAnchor="middle" className="chart-axis-label">
          Spread of one event's net (± ≈)
        </text>
        <text
          transform="rotate(-90)"
          x={-innerH / 2}
          y={-MARGIN.left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Expected net ≈
        </text>
      </g>
    </svg>
  );
}
