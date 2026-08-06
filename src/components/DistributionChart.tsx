import { scaleBand, scaleLinear } from "d3";

import type { RecordBucket } from "../lib";

const WIDTH = 560;
const ROW = 26;
const MARGIN = { top: 8, right: 56, bottom: 46, left: 48 };

/**
 * Extra right margin for the brace and its total, added only when something is
 * braced. A `rounds` event has one record per win count and nothing to group,
 * so it keeps the layout it always had.
 *
 * On the right because that is the side the rows already end on: the per-row
 * percentages are a column there, so the brace has something straight to sit
 * against, and the reader meets each bar, then its share, then the group's.
 * Everything beyond the plot is measured from its right edge by the three
 * offsets below, and the 72 is what those need — `100.00%` is the widest
 * either column has to hold, and the total must clear the viewBox as well as
 * the bars.
 */
const GROUP_W = 72;

/** Horizontal extent of the brace, flat side to tip. */
const BRACE_W = 8;

/**
 * The trophy, marking the finish a player would call one: the win ceiling,
 * whether that is 7 wins in an elimination event or 3-0 in a fixed-rounds one.
 *
 * It stands in for the win count over the braced total rather than sitting
 * beside it — the rows the brace spans all start with that number, so naming
 * it again said less than the trophy does. Where nothing is braced there is no
 * total to head, and it goes on the ceiling's own row label instead.
 *
 * A system emoji rather than the bootstrap-icons glyph the rest of the app
 * draws with. This is a mark on the data and not chrome around it, and it
 * stays a trophy when the icon font does not load — which a fresh worktree's
 * dev server is quite capable of arranging.
 */
const TROPHY = "🏆";

/** What the trophy costs the row-label column when it has to carry one. */
const TROPHY_W = 18;

/** Offsets from the plot's right edge. */
const VALUE_X = 8;
const BRACE_X = 60;
const GROUP_TEXT_X = 74;

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
 * A curly brace, `}`: four ends touching `x` on the rows' side, a straight
 * spine behind them, and a tip at the middle reaching `BRACE_W` further right,
 * where the total sits.
 *
 * Drawn rather than typed. A `}` glyph scaled to span three rows would carry
 * its stroke weight up with it and swamp the chart's own lines, and it would
 * land differently in every font a reader has.
 */
function bracePath(x: number, y0: number, y1: number): string {
  const spine = x + BRACE_W / 2;
  const tip = x + BRACE_W;
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
 * cares about is still legible — a brace to the right of the rows gathers the
 * records that share a win count and totals them, which is the number the old
 * chart showed.
 *
 * D3 supplies the scales and ticks; React renders the SVG. Keeping the DOM
 * under React avoids the two libraries both trying to own these nodes.
 */
export function DistributionChart({ records }: { records: RecordBucket[] }) {
  const groups = groupByWins(records).filter((g) => g.to > g.from);
  /*
   * The ceiling is the last row, since the records arrive in win order. It is
   * braced whenever more than one record reaches it, and only then does the
   * trophy have a total to sit over; otherwise that one row wears it.
   */
  const ceiling = records[records.length - 1]?.wins;
  const trophyRow = groups.some((g) => g.wins === ceiling) ? undefined : ceiling;

  const left = MARGIN.left + (trophyRow === undefined ? 0 : TROPHY_W);
  const right = MARGIN.right + (groups.length > 0 ? GROUP_W : 0);
  const rows = records.length * ROW;
  const height = MARGIN.top + rows + MARGIN.bottom;
  const inner = WIDTH - left - right;

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
              <path d={bracePath(inner + BRACE_X, top, bottom)} className="chart-brace" />
              <text
                x={inner + GROUP_TEXT_X}
                y={mid - 7}
                dominantBaseline="middle"
                className="chart-group-trophy"
              >
                {TROPHY}
              </text>
              <text
                x={inner + GROUP_TEXT_X}
                y={mid + 8}
                dominantBaseline="middle"
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
                {/*
                  The trophy leads, so the records stay right-aligned with each
                  other rather than being shunted left by the row that has one.
                */}
                {r.wins === trophyRow ? `${TROPHY} ${rowKey(r)}` : rowKey(r)}
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
                x={inner + VALUE_X}
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
          y={-MARGIN.left + 14}
          textAnchor="middle"
          className="chart-axis-label"
        >
          Record
        </text>
      </g>
    </svg>
  );
}
