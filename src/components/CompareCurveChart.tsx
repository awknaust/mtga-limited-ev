import { line, scaleLinear } from "d3";

import { effectiveEntryGems, expectedNetAt, type EventConfig } from "../lib";
import { gemTick, pct, type Money } from "../format";
import { compareSeries } from "./compareSeries";

const WIDTH = 560;
const HEIGHT = 300;
/*
 * The right margin is where the series names go. Wide enough for a truncated
 * label and no wider — every pixel here comes off the plot, which is the thing
 * being read.
 */
const MARGIN = { top: 12, right: 118, bottom: 50, left: 74 };

/** Match win rates to sample, as `EvCurveChart` samples them. */
const FROM = 0.3;
const TO = 0.85;
const STEPS = 120;

/** Past this many lines, names at the ends collide faster than they inform. */
const MAX_END_LABELS = 8;

export type CurveMode = "event" | "roi";

export const CURVE_MODES: readonly { key: CurveMode; label: string }[] = [
  { key: "event", label: "Per event" },
  { key: "roi", label: "ROI" },
];

/**
 * What one mode plots, at one win rate.
 *
 * ROI divides by the entry *at that rate*, not at the config's own. The
 * effective entry moves with the win rate — winning more climbs the daily gold
 * ladder, which pays for more of the next entry — so a swept numerator over a
 * fixed denominator would price every point but one against an entry belonging
 * to some other win rate.
 *
 * Null is "no answer here", not zero: an entry gold has covered entirely has no
 * gems staked to return a share of, and plotting 0 would read as breaking even
 * exactly.
 */
function valueAt(config: EventConfig, rate: number, mode: CurveMode): number | null {
  const net = expectedNetAt(config, rate);
  if (mode === "event") return net;
  const entry = effectiveEntryGems({ ...config, winRate: rate });
  return entry > 0 ? net / entry : null;
}

/**
 * Value against win rate, one line per event, all closed form.
 *
 * The point of drawing them together is where they *cross*. Which event pays
 * best is not a property of the events — it is a property of the reader's win
 * rate and the values they put on packs, gold and boxes, all of which are
 * theirs to set. Above some rate one ladder overtakes another; the crossing is
 * where that happens, and it moves the moment any of those inputs does. That is
 * the question the tab exists to answer, and nothing here answers it in prose.
 */
export function CompareCurveChart({
  configs,
  mode,
  winRate,
  rateBand,
  m,
}: {
  /** One per selected event, in the order they are drawn and listed. */
  configs: readonly { name: string; config: EventConfig }[];
  mode: CurveMode;
  /** The reader's own rate, marked on the axis. */
  winRate: number;
  /**
   * Win rates the record supports, shaded behind every line. Null if certain.
   *
   * One band for the whole chart rather than one per event, and that is not a
   * simplification: it is a statement about the reader, drawn from the win rate
   * and the match count they entered, and both are shared by everything here.
   * Which event is being compared does not change how well they play.
   */
  rateBand: [lo: number, hi: number] | null;
  m: Money;
}) {
  const inner = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const rates = Array.from(
    { length: STEPS + 1 },
    (_, i) => FROM + ((TO - FROM) * i) / STEPS,
  );

  const series = configs.map(({ name, config }) => ({
    name,
    ...compareSeries(name),
    points: rates.map((rate) => ({ rate, value: valueAt(config, rate, mode) })),
  }));

  // A series with nothing to plot is named rather than silently missing: in ROI
  // mode a fully gold-funded entry has no defined return, and a reader who
  // selected it deserves to be told why its line is absent.
  const omitted = series.filter((s) => s.points.every((p) => p.value === null));
  const drawn = series.filter((s) => s.points.some((p) => p.value !== null));

  const values = drawn.flatMap((s) =>
    s.points.map((p) => p.value).filter((v): v is number => v !== null),
  );

  const x = scaleLinear().domain([FROM, TO]).range([0, inner]);
  const y = scaleLinear()
    .domain([Math.min(0, ...values), Math.max(0, ...values)])
    .nice()
    .range([innerH, 0]);

  const path = line<{ rate: number; value: number | null }>()
    // Gaps break the line rather than being interpolated across. A ROI curve
    // can stop being defined partway up the axis, where gold starts covering
    // the whole entry, and a segment bridging that would be invented.
    .defined((p) => p.value !== null)
    .x((p) => x(p.rate))
    .y((p) => y(p.value ?? 0));

  const tick = (t: number): string =>
    mode === "roi" ? `${Math.round(t * 100)}%` : gemTick(m, t);

  const axisLabel = mode === "roi" ? "Return on entry" : "Expected net ≈";

  /*
   * Where each line ends, pushed apart so two close finishes stay two labels.
   * One pass down the sorted list is enough for the spacing to hold: each label
   * is placed at least `gap` below the one above it, so nothing can overlap
   * what has already been placed.
   */
  type EndLabel = { name: string; colorClass: string; y: number };
  const gap = 12;
  const ends = drawn
    .map((s): EndLabel | null => {
      const last = [...s.points].reverse().find((p) => p.value !== null);
      return last === undefined
        ? null
        : { name: s.name, colorClass: s.colorClass, y: y(last.value as number) };
    })
    .filter((l): l is EndLabel => l !== null)
    .sort((a, b) => a.y - b.y);

  const endLabels: EndLabel[] = [];
  for (const label of ends) {
    const floor = endLabels.length === 0 ? -Infinity : endLabels[endLabels.length - 1].y + gap;
    endLabels.push({ ...label, y: Math.max(label.y, floor) });
  }

  const showLabels = drawn.length <= MAX_END_LABELS;

  return (
    <>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-svg"
        role="img"
        aria-label={`${axisLabel} against match win rate, ${drawn.length} events compared`}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {y.ticks(8).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x1={0} x2={inner} className="chart-gridline" />
              <text x={-8} dy="0.32em" textAnchor="end" className="chart-tick">
                {tick(t)}
              </text>
            </g>
          ))}
          {x.ticks(8).map((t) => (
            <g key={t} transform={`translate(${x(t)},0)`}>
              <line y1={0} y2={innerH} className="chart-gridline" />
              <text y={innerH + 18} textAnchor="middle" className="chart-tick">
                {`${Math.round(t * 100)}%`}
              </text>
            </g>
          ))}

          {/*
            The win rates the record supports. Drawn first so every line reads
            on top of it, and clamped to the plotted domain — a short record can
            put the band's edge past either end of the axis.

            It is what stops the crossings being read as more than they are: a
            line that overtakes another inside this band has overtaken it at a
            rate the record cannot tell apart from the reader's own.
          */}
          {rateBand && (
            <rect
              x={x(Math.max(rateBand[0], FROM))}
              width={Math.max(
                0,
                x(Math.min(rateBand[1], TO)) - x(Math.max(rateBand[0], FROM)),
              )}
              y={0}
              height={innerH}
              className="chart-band"
            />
          )}

          <line x1={0} x2={inner} y1={y(0)} y2={y(0)} className="chart-zero" />

          {/* The reader's own rate: the vertical slice of this chart they are
              actually standing on, labelled so the slice has a number. */}
          {winRate >= FROM && winRate <= TO && (
            <>
              <line
                x1={x(winRate)}
                x2={x(winRate)}
                y1={0}
                y2={innerH}
                className="chart-rate"
              />
              <text
                x={x(winRate)}
                y={-2}
                // Swings to the left of the line near the right-hand end, where
                // a centred label would run under the series names.
                textAnchor={winRate > FROM + (TO - FROM) * 0.85 ? "end" : "middle"}
                className="chart-rate-label"
              >
                {pct(winRate, 1)}
              </text>
            </>
          )}

          {drawn.map((s) => (
            <path
              key={s.name}
              d={path(s.points) ?? undefined}
              className={`compare-line ${s.colorClass}`}
              strokeDasharray={s.dash ?? undefined}
            />
          ))}

          {showLabels &&
            endLabels.map((label) => (
              <text
                key={label.name}
                x={inner + 6}
                y={label.y}
                dy="0.32em"
                className={`compare-end-label ${label.colorClass}`}
              >
                {label.name.length > 15 ? `${label.name.slice(0, 14)}…` : label.name}
              </text>
            ))}

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
            {axisLabel}
          </text>
        </g>
      </svg>
      {omitted.length > 0 && (
        <p className="form-text">
          No line for {omitted.map((s) => s.name).join(", ")}: gold covers the whole
          entry at these rates, so there are no gems staked to return a share of.
        </p>
      )}
      {!showLabels && (
        <p className="form-text">
          {drawn.length} lines is more than the chart can label; the chips above
          carry the names, each in its own line's colour.
        </p>
      )}
    </>
  );
}
