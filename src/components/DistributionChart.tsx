import { scaleBand, scaleLinear } from "d3";

import type { RecordProbability } from "../lib";

const WIDTH = 560;
const ROW = 26;

/**
 * The right margin past the plot: each row's share, then the trophy, which
 * every event draws at `BRACE_X` whether or not a brace is there to hold it.
 */
const MARGIN = { top: 8, right: 64, bottom: 46, left: 48 };

/** What a brace and the total beside it need on top of that. */
const BRACED_EXTRA = 44;

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
 * A bar you are reading off a 400-unit axis cannot support two decimal places.
 * The tooltip on each row keeps them, for anyone who wants the figure the
 * label had to round.
 */
const pct = (p: number) => `${Math.round(p * 100)}%`;

const rowKey = (r: { wins: number; losses: number }) => `${r.wins}-${r.losses}`;

/** Consecutive records sharing a win count, with their combined share. */
type WinGroup = {
  wins: number;
  from: number;
  to: number;
  probability: number;
};

function groupByWins(records: RecordProbability[]): WinGroup[] {
  const groups: WinGroup[] = [];
  for (const [i, r] of records.entries()) {
    const open = groups[groups.length - 1];
    if (open?.wins === r.wins) {
      open.to = i;
      open.probability += r.probability;
    } else {
      groups.push({ wins: r.wins, from: i, to: i, probability: r.probability });
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
 * Outcome distribution as horizontal bars, one per finishing record.
 *
 * By record rather than by win count, because the two differ exactly where it
 * matters: 7-0, 7-1 and 7-2 are one row of the payout table but three quite
 * different runs, and the odds of each are worth seeing. What the payout table
 * cares about is still legible — a brace to the right of the rows gathers the
 * ceiling and totals it, which is the number the old chart showed. The trophy
 * marks it either way.
 *
 * The bars are the closed-form probabilities. They used to be a simulation's
 * frequencies with a tick marking the exact figure against each, which was a
 * chart drawing the same number twice and inviting a comparison it could not
 * settle; the exact figure is the only one there is now.
 *
 * D3 supplies the scales and ticks; React renders the SVG. Keeping the DOM
 * under React avoids the two libraries both trying to own these nodes.
 */
export function DistributionChart({ records }: { records: RecordProbability[] }) {
  /*
   * The ceiling is the last group, since the records arrive in win order. It
   * is braced only when it holds more than one record: a fixed-rounds event
   * reaches 3-0 exactly one way, so there is nothing to gather and nothing to
   * total that the row does not already say. The trophy still marks it — that
   * is the part which is about the finish rather than about the grouping.
   */
  const groups = groupByWins(records);
  const trophy = groups[groups.length - 1];
  const braced = trophy !== undefined && trophy.from !== trophy.to;

  const rows = records.length * ROW;
  const height = MARGIN.top + rows + MARGIN.bottom;
  const inner = WIDTH - MARGIN.left - MARGIN.right - (braced ? BRACED_EXTRA : 0);

  const maxP = Math.max(...records.map((r) => r.probability));
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
            {braced ? (
              <path
                d={bracePath(inner + BRACE_X, band.top, band.bottom)}
                className="chart-brace"
              />
            ) : null}
            <text
              x={inner + (braced ? GROUP_TEXT_X : BRACE_X)}
              y={(band.top + band.bottom) / 2}
              dominantBaseline="middle"
              className="chart-group-value"
            >
              <tspan className="chart-group-trophy">{TROPHY}</tspan>
              {/*
                Unbraced, the trophy takes the brace's own column and stands
                alone: there is one row under it, and its share is already
                printed on the same line an inch to the left.
              */}
              {braced ? ` ${pct(trophy.probability)}` : null}
              <title>{`${trophy.wins}W — ${(trophy.probability * 100).toFixed(2)}%`}</title>
            </text>
          </g>
        ) : null}

        {records.map((r) => {
          const yPos = y(rowKey(r)) ?? 0;
          return (
            <g key={rowKey(r)}>
              {/*
                The unrounded figure, for anyone who wants the one the label
                had to round. A `<title>` is the browser's own tooltip: no
                library, no state, and it needs no JS at all. As the group's
                first child it answers for every mark in the row.
              */}
              <title>{`${rowKey(r)} — ${(r.probability * 100).toFixed(2)}%`}</title>
              {/*
                And something to hover. Without this the tooltip is only on the
                marks themselves, so a 1% bar offers a few pixels of target and
                the rest of its row is dead space.
              */}
              <rect x={0} y={yPos} width={inner} height={y.bandwidth()} className="chart-row-hit" />
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
