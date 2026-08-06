import { scaleBand, scaleLinear } from "d3";

import type { RecordBucket } from "../lib";

const WIDTH = 560;
const ROW = 26;

/**
 * The right margin carries three things past the plot, at the offsets below:
 * each row's share, the brace, and the braced total. Every event draws all
 * three, so unlike the rest of the layout this is not conditional.
 */
const MARGIN = { top: 8, right: 108, bottom: 46, left: 48 };

/** Horizontal extent of the brace, flat side to tip. */
const BRACE_W = 8;

/** Offsets from the plot's right edge. */
const VALUE_X = 8;
const BRACE_X = 40;
const GROUP_TEXT_X = 54;

/**
 * The trophy, marking the finish a player would call one: the win ceiling,
 * whether that is 7 wins in an elimination event or 3-0 in a fixed-rounds one.
 *
 * It stands in for the win count over the braced total rather than sitting
 * beside it — the rows the brace spans all start with that number, so naming
 * it again said less than the trophy does.
 *
 * A system emoji rather than the bootstrap-icons glyph the rest of the app
 * draws with. This is a mark on the data and not chrome around it, and it
 * stays a trophy when the icon font does not load — which a fresh worktree's
 * dev server is quite capable of arranging.
 */
const TROPHY = "🏆";

/**
 * Shares are shown to the percent and no further.
 *
 * A bar you are reading off a 400-unit axis cannot support two decimal places,
 * and printing them invited a comparison the chart could not settle. The
 * closed-form figure in each row's tooltip keeps its precision, because that is
 * the one number here whose whole job is to be more exact than the bar.
 */
const pct = (p: number) => `${Math.round(p * 100)}%`;

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
 * ceiling and totals it, which is the number the old chart showed.
 *
 * D3 supplies the scales and ticks; React renders the SVG. Keeping the DOM
 * under React avoids the two libraries both trying to own these nodes.
 */
export function DistributionChart({ records }: { records: RecordBucket[] }) {
  /*
   * The ceiling is the last group, since the records arrive in win order, and
   * it is braced whether it holds three records or one. A fixed-rounds event
   * reaches it exactly one way and so has nothing to gather, but the brace and
   * its trophy are where a reader has learnt to look for the trophy odds, and
   * an event that dropped them would be saying something it does not mean.
   */
  const groups = groupByWins(records);
  const trophy = groups[groups.length - 1];

  const rows = records.length * ROW;
  const height = MARGIN.top + rows + MARGIN.bottom;
  const inner = WIDTH - MARGIN.left - MARGIN.right;

  const maxP = Math.max(...records.map((r) => Math.max(r.probability, r.exactProbability)));
  const x = scaleLinear().domain([0, maxP || 1]).nice().range([0, inner]);
  const y = scaleBand<string>()
    .domain(records.map(rowKey))
    .range([0, rows])
    .padding(0.22);

  /** Top and bottom of the braced band, and where its total sits. */
  const band = trophy && {
    top: y(rowKey(records[trophy.from])) ?? 0,
    bottom: (y(rowKey(records[trophy.to])) ?? 0) + y.bandwidth(),
  };

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="chart-svg"
      role="img"
      aria-label="Distribution of outcomes by finishing record"
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {x.ticks(8).map((t) => (
          <g key={t} transform={`translate(${x(t)},0)`}>
            <line y1={0} y2={rows} className="chart-gridline" />
            <text y={rows + 16} className="chart-tick" textAnchor="middle">
              {pct(t)}
            </text>
          </g>
        ))}

        {trophy && band ? (
          <g>
            <path
              d={bracePath(inner + BRACE_X, band.top, band.bottom)}
              className="chart-brace"
            />
            <text
              x={inner + GROUP_TEXT_X}
              y={(band.top + band.bottom) / 2}
              dominantBaseline="middle"
              className="chart-group-value"
            >
              <tspan className="chart-group-trophy">{TROPHY}</tspan>
              {/*
                A ceiling reached one way needs no total: the brace is against
                that row, and its share is already printed on the same line an
                inch to the left. Printing it again read as a bug.
              */}
              {trophy.from === trophy.to ? null : ` ${pct(trophy.probability)}`}
              <title>{`exact: ${(trophy.exactProbability * 100).toFixed(2)}%`}</title>
            </text>
          </g>
        ) : null}

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
                {rowKey(r)}
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
                {pct(r.probability)}
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
