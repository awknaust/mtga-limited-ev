import { scaleLinear } from "d3";

import type { Money } from "../format";
import {
  heldKeys,
  holding,
  holdingRate,
  type Bin,
  type BankrollResult,
  type EventConfig,
  type HoldingKey,
} from "../lib";

/**
 * Where a run ended up, itemised: one card per thing it can hold, each with
 * its own spread.
 *
 * The gem-equivalent chart beside this one answers what a run came to. This
 * answers what it came to *in* — 4,200 gems and eleven packs is a different
 * outcome from 4,200 gems and a box, and the two are indistinguishable once
 * everything is converted. Valued at the config's rates the cards add back up
 * to the ending total, so this is a decomposition rather than a second
 * opinion.
 */

const CHART = { width: 220, height: 44 };

/**
 * Balances follow the display unit; counts print as counts.
 *
 * `whole` is for the figures that are whole by construction — a median, a
 * smallest, a largest — since only an average can land between two boxes. A
 * range reading 0.0 to 8.0 boxes implies a precision the thing does not have.
 */
const amountText = (key: HoldingKey, n: number, m: Money, exact = false): string => {
  if (key === "gems") return m.fmt(n);
  // Gold is Arena-internal and has its own rate against gems, so it is never
  // shown in dollars — the same reason format.ts refuses to convert it.
  if (key === "gold") return Math.round(n).toLocaleString();
  if (exact) return n.toLocaleString();
  return n.toFixed(n > 0 && n < 1 ? 2 : 1);
};

/**
 * The same amount as an axis label, where the room runs out well before the
 * significant digits do. Thousands abbreviate, since a tick saying which
 * thousand it is says enough — the figures that need to be read exactly are
 * printed above the chart.
 */
const tickText = (key: HoldingKey, n: number, m: Money): string => {
  if (key === "gems" && m.unit === "usd") return m.fmt(n);
  const a = Math.abs(n);
  if (key === "gems" || key === "gold") {
    return a >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
  }
  return n.toLocaleString();
};

/**
 * Where to letter the axis of a card chart.
 *
 * D3 picks round values, but not how many: asking for four gives anywhere
 * from one to six depending on how the range falls. One is not an axis, and
 * six will not fit, so this asks again when it comes back short and drops
 * every other when it comes back crowded. Whole holdings keep whole ticks —
 * half a box is not a place on the axis.
 */
const axisTicks = (
  x: ReturnType<typeof scaleLinear<number, number>>,
  whole: boolean,
  most: number,
): number[] => {
  const at = (count: number): number[] => {
    const ticks = x.ticks(count);
    return whole ? ticks.filter(Number.isInteger) : ticks;
  };
  let ticks = at(4);
  if (ticks.length < 3) ticks = at(6);
  while (ticks.length > most) ticks = ticks.filter((_, i) => i % 2 === 0);
  return ticks;
};

/**
 * The spread across runs, small enough to sit in a card.
 *
 * The axis is lettered in HTML rather than in the SVG. The chart is stretched
 * to whatever width the card has, and text in a non-uniformly scaled SVG
 * stretches with it — the bars can take that, letters cannot. So the labels
 * sit under the chart and are positioned by the same scale that placed the
 * bars, which keeps them crisp at any card width.
 */
function MiniHistogram({
  bins,
  median,
  whole,
  label,
  tickText,
  mostTicks,
}: {
  bins: Bin[];
  median: number;
  /** Whether the amounts are whole things, so the ticks must be too. */
  whole: boolean;
  label: string;
  tickText: (value: number) => string;
  /** How many labels the card has room for, which the widest ones decide. */
  mostTicks: number;
}) {
  if (!bins.length) return null;
  const lo = bins[0].from;
  const hi = bins[bins.length - 1].to;
  const total = bins.reduce((acc, b) => acc + b.count, 0) || 1;
  const peak = Math.max(...bins.map((b) => b.count / total), 0.01);

  // A single bin means every run held the same amount; drawn full width it
  // would read as a spread rather than the absence of one.
  const x = scaleLinear()
    .domain([lo, hi === lo ? lo + 1 : hi])
    .range([0, CHART.width]);
  const y = scaleLinear().domain([0, peak]).range([CHART.height, 0]);
  const ticks = axisTicks(x, whole, mostTicks);
  const at = (value: number): number => (x(value) / CHART.width) * 100;

  return (
    <>
    <svg
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      className="chart-svg mini-chart mt-2"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {/* Behind the bars, so a gridline never cuts one in half. */}
      {ticks.map((t) => (
        <line
          key={t}
          x1={x(t)}
          x2={x(t)}
          y1={0}
          y2={CHART.height}
          className="chart-gridline"
        />
      ))}
      {bins.map((b) => (
        <rect
          key={b.from}
          x={x(b.from)}
          y={y(b.count / total)}
          width={Math.max(1, x(b.to) - x(b.from) - 1)}
          height={CHART.height - y(b.count / total)}
          className="chart-bar"
        >
          <title>{`${Math.round((b.count / total) * 100)}% of outcomes`}</title>
        </rect>
      ))}
      <line
        x1={x(median)}
        x2={x(median)}
        y1={0}
        y2={CHART.height}
        className="chart-marker-median"
      />
    </svg>
    {/* Nudged inward at the ends, so the first and last are not half cut off. */}
    <div className="mini-ticks stat-hint">
      {ticks.map((t) => (
        <span
          key={t}
          style={{
            left: `${at(t)}%`,
            transform: `translateX(${at(t) < 8 ? 0 : at(t) > 92 ? -100 : -50}%)`,
          }}
        >
          {tickText(t)}
        </span>
      ))}
    </div>
    </>
  );
}

function HoldingCard({
  bankrollKey,
  totals,
  config,
  m,
}: {
  bankrollKey: HoldingKey;
  totals: BankrollResult["holdings"][HoldingKey];
  config: EventConfig;
  m: Money;
}) {
  const { label, whole } = holding(bankrollKey);
  const rate = holdingRate(config, bankrollKey);
  const text = (n: number, exact = false) => amountText(bankrollKey, n, m, exact);

  return (
    <div className="col-sm-6 col-xl-4">
      <div className="stat h-100">
        <div className="stat-label">{label}</div>
        {/* An average lands between two boxes; a constant does not. */}
        <div className="stat-value">{text(totals.mean, totals.min === totals.max)}</div>
        <div className="stat-hint">
          {`median ${text(totals.median, true)}`}
          {/* Gems are the unit, so restating their own value says nothing. */}
          {bankrollKey === "gems" ? "" : ` · worth ${m.fmt(totals.mean * rate)}`}
        </div>
        {/*
          Some holdings are the same in every run — draft packs, once the run
          length is fixed, and gold, which accrues and is spent on a schedule
          nothing random touches. There is no shape to draw, and a bar filling
          the card would claim a spread that is not there.
        */}
        {totals.min === totals.max ? (
          <div className="stat-hint mt-2">the same in every run</div>
        ) : (
          <MiniHistogram
            bins={totals.histogram}
            median={totals.median}
            whole={whole}
            label={`Spread of ${label.toLowerCase()} across possible outcomes`}
            tickText={(n) => tickText(bankrollKey, n, m)}
            /*
             * Dollar amounts are the long labels — "$112.50" against "45k" —
             * and they only turn up on the gems card, since gold is never
             * converted and counts are counts. Four rather than three because
             * thinning halves: a cap of three takes a four-tick axis down to
             * two, which is the bare ends again.
             */
            mostTicks={bankrollKey === "gems" && m.unit === "usd" ? 4 : 5}
          />
        )}
      </div>
    </div>
  );
}

export function PayoutBreakdown({
  bankroll,
  config,
  m,
  liquidating,
}: {
  bankroll: BankrollResult;
  config: EventConfig;
  m: Money;
  /** Whether winnings are being converted to gems and spent as they are won. */
  liquidating: boolean;
}) {
  const keys = heldKeys(config, bankroll.holdings.gold.mean > 0);
  // With winnings liquidated the rewards are already inside the gem balance,
  // so a card each would double-count what the gems card already carries.
  const shown = liquidating ? keys.filter((k) => k === "gems" || k === "gold") : keys;

  return (
    <>
      <div className="row g-2">
        {shown.map((key) => (
          <HoldingCard
            key={key}
            bankrollKey={key}
            totals={bankroll.holdings[key]}
            config={config}
            m={m}
          />
        ))}
      </div>
      <div className="form-text">
        {liquidating ? (
          <>
            Everything else was converted to gems as it was won and is already
            inside that balance — the rest of the breakdown would count it
            twice. Turn off "fund entries with winnings" to itemise it.
          </>
        ) : (
          <>
            What the ending total is made of, at the rates set on the left.
            Valued and added up, these are the gem-equivalent figure beside
            them. Bars are the spread across possible outcomes, the dashed line
            the median.
          </>
        )}
      </div>
    </>
  );
}
