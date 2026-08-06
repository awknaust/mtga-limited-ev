import { scaleBand, scaleLinear } from "d3";

import type { RecordBucket } from "../lib";

const WIDTH = 560;
const ROW = 26;
const MARGIN = { top: 8, right: 56, bottom: 46, left: 48 };

/**
 * Extra left margin for the brace and its total, added only when something is
 * braced. A `rounds` event has one record per win count and nothing to group,
 * so it keeps the layout it always had.
 *
 * The 64 is spent as: the total right-aligned 46 units from the plot, which is
 * enough for `100.00%`, then the brace, then the record labels. What is left
 * over is where the rotated axis title sits, and the clearance between the two
 * is the only reason this is a constant rather than a guess.
 */
const GROUP_W = 64;

/** Horizontal extent of the brace, tip to open side. */
const BRACE_W = 8;
const BRACE_X = -34;
const GROUP_TEXT_X = -46;

const rowKey = (r: { wins: number; losses: number }) => `${r.wins}-${r.losses}`;

/** Consecutive records sharing a win count, with their combined share. */
type WinGroup = {
  wins: number;
  from: number;
  to: number;
  probability: number;
  exactProbability: number;
};

function groupByWins(records: RecordBucket[]): WinGroup[] {
  const groups: WinGroup[] = [];
  for (const [i, r] of records.entries()) {
    const open = groups[groups.length - 1];
    if (open?.wins === r.wins) {
      open.to = i;
      open.probability += r.probability;
      open.exactProbability += r.exactProbability;
    } else {
      groups.push({
        wins: r.wins,
        from: i,
        to: i,
        probability: r.probability,
        exactProbability: r.exactProbability,
      });
    }
  }
  return groups;
}

/**
 * A curly brace pointing left: four ends touching `x`, a straight spine behind
 * them, and a tip at the middle reaching `BRACE_W` further left.
 *
 * Drawn rather than typed. A `}` glyph scaled to span three rows would carry
 * its stroke weight up with it and swamp the chart's own lines, and it would
 * land differently in every font a reader has.
 */
function bracePath(x: number, y0: number, y1: number): string {
  const spine = x - BRACE_W / 2;
  const tip = x - BRACE_W;
  const mid = (y0 + y1) / 2;
  const r = Math.min(BRACE_W / 2, (mid - y0) / 2);
  return [
    `M${x},${y0}`,
    `Q${spine},${y0} ${spine},${y0 + r}`,
    `L${spine},${mid - r}`,
    `Q${spine},${mid} ${tip},${mid}`,
    `Q${spine},${mid} ${spine},${mid + r}`,
    `L${spine},${y1 - r}`,
    `Q${spine},${y1} ${x},${y1}`,
  ].join(" ");
}

/**
 * Outcome distribution as horizontal bars, one per finishing record, with a
 * tick marking the closed-form probability against the simulated bar.
 *
 * By record rather than by win count, because the two differ exactly where it
 * matters: 7-0, 7-1 and 7-2 are one row of the payout table but three quite
 * different runs, and the odds of each are worth seeing. What the payout table
 * cares about is still legible — a brace gathers the records that share a win
 * count and totals them, which is the number the old chart showed.
 *
 * D3 supplies the scales and ticks; React renders the SVG. Keeping the DOM
 * under React avoids the two libraries both trying to own these nodes.
 */
export function DistributionChart({ records }: { records: RecordBucket[] }) {
  const groups = groupByWins(records).filter((g) => g.to > g.from);
  const left = MARGIN.left + (groups.length > 0 ? GROUP_W : 0);
  const rows = records.length * ROW;
  const height = MARGIN.top + rows + MARGIN.bottom;
  const inner = WIDTH - left - MARGIN.right;

  const maxP = Math.max(...records.map((r) => Math.max(r.probability, r.exactProbability)));
  const x = scaleLinear().domain([0, maxP || 1]).nice().range([0, inner]);
  const y = scaleBand<string>()
    .domain(records.map(rowKey))
    .range([0, rows])
    .padding(0.22);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="chart-svg"
      role="img"
      aria-label="Distribution of outcomes by finishing record"
    >
      <g transform={`translate(${left},${MARGIN.top})`}>
        {x.ticks(8).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={rows} className="chart-gridline" />
            <text y={rows + 16} className="chart-tick" textAnchor="middle">
              {`${Math.round(t * 100)}%`}
            </text>
          </g>
        ))}

        {groups.map((g) => {
          const top = y(rowKey(records[g.from])) ?? 0;
          const bottom = (y(rowKey(records[g.to])) ?? 0) + y.bandwidth();
          const mid = (top + bottom) / 2;
          return (
            <g key={g.wins}>
              <path d={bracePath(BRACE_X, top, bottom)} className="chart-brace" />
              <text
                x={GROUP_TEXT_X}
                y={mid - 6}
                dominantBaseline="middle"
                textAnchor="end"
                className="chart-group-label"
              >
                {`${g.wins}W`}
              </text>
              <text
                x={GROUP_TEXT_X}
                y={mid + 7}
                dominantBaseline="middle"
                textAnchor="end"
                className="chart-group-value"
              >
                {`${(g.probability * 100).toFixed(2)}%`}
                <title>{`exact: ${(g.exactProbability * 100).toFixed(2)}%`}</title>
              </text>
            </g>
          );
        })}

        {records.map((r) => {
          const yPos = y(rowKey(r)) ?? 0;
          return (
            <g key={rowKey(r)}>
              <text
                x={-8}
                y={yPos + y.bandwidth() / 2}
                dominantBaseline="middle"
                textAnchor="end"
                className="chart-tick"
              >
                {`${r.wins}-${r.losses}`}
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
        <text x={inner / 2} y={rows + 38} textAnchor="middle" className="chart-axis-label">
          Share of events
        </text>
        <text
          transform="rotate(-90)"
          x={-rows / 2}
          y={-left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Record
        </text>
      </g>
    </svg>
  );
}
