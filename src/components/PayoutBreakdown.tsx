import { scaleLinear } from "d3";

import {
  REAL_GEMS,
  approx,
  gemTick,
  tickAmount,
  valueLabel,
  type Money,
} from "../format";
import { amountText } from "./holdingText";
import { Stat } from "./Stat";
import {
  heldKeys,
  holding,
  holdingLabel,
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
 * The same amount as an axis label, where the room runs out well before the
 * significant digits do. Thousands abbreviate, since a tick saying which
 * thousand it is says enough — the figures that need to be read exactly are
 * printed above the chart.
 */
const tickText = (key: HoldingKey, n: number): string => {
  if (key === "gems") return gemTick(REAL_GEMS, n);
  // Gold has no sign of its own; gems take theirs, so the two axes cannot be
  // confused with each other where the cards sit side by side.
  if (key === "gold") return tickAmount(n);
  // Counts stay whole. A packs axis rarely reaches four figures, and where it
  // does, "1,500 packs" is worth more than the thousand "2k" would round it to.
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
): number[] => {
  const at = (count: number): number[] => {
    const ticks = x.ticks(count);
    return whole ? ticks.filter(Number.isInteger) : ticks;
  };
  let ticks = at(4);
  if (ticks.length < 3) ticks = at(6);
  while (ticks.length > MOST_TICKS) ticks = ticks.filter((_, i) => i % 2 === 0);
  return ticks;
};

/**
 * How many labels a card has room for, which the widest ones decide.
 *
 * One number for every card now that the gems axis has stopped converting.
 * Dollars were the long labels — "$112.50" against "45k" — and they could only
 * ever appear there, since gold does not convert and counts are counts, so the
 * cards used to need a lower cap on that one axis alone.
 */
const MOST_TICKS = 5;

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
}: {
  bins: Bin[];
  median: number;
  /** Whether the amounts are whole things, so the ticks must be too. */
  whole: boolean;
  label: string;
  tickText: (value: number) => string;
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
  const ticks = axisTicks(x, whole);
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

/**
 * A headline figure, said to be the average it is, with what that average is
 * worth kept beside it.
 *
 * Every card leads with a mean while the line under it reports a median, and
 * on a skewed holding those are far apart — 14.5 packs above "typically 8".
 * Unlabelled, the pair reads as a contradiction rather than as two statistics.
 *
 * The worth belongs up here rather than in that line because it values the
 * mean, not the median: a "typically 900 · worth ≈ 989" read as one clause
 * quietly changed statistic halfway through. Each figure now sits with the one
 * it describes.
 *
 * After the number rather than before it. A tile exists to put a figure in
 * front of someone, and a qualifier ahead of that figure makes them read a
 * word before they can read the number.
 *
 * The worth is kept even where it restates the figure it follows — gems in
 * gems, at a rate of 1. Dropping it there would make the one card whose value
 * needs no conversion the one card missing the clause, and the clause is what
 * says these worths are the things that add up to the total.
 */
const avg = (figure: string, worth?: string) => (
  <>
    {figure}
    {/* A real space, not just the margin: the gap has to exist in the text as
        well as in the layout, or a screen reader reads "989avg". */}
    {" "}
    <span className="stat-qualifier">
      {worth === undefined ? "avg" : `avg · worth ${worth}`}
    </span>
  </>
);

/**
 * The total the other cards decompose, shaped like one of them.
 *
 * Every card beside it is an amount in its own currency — packs as packs,
 * gold as gold — and this is the one figure on the panel that is wholly a
 * valuation, so it is the only card marked ≈ throughout and the only one that
 * follows the display toggle. Its spread is the ending-value distribution,
 * which is the same data the chart on the sibling tab draws, at the size the
 * grid gives it.
 *
 * Read as a total rather than as a fifth holding: nothing is held in "gem
 * value", and this card's figure is what the others add up to.
 */
function ValueCard({ bankroll, m }: { bankroll: BankrollResult; m: Money }) {
  const bins = bankroll.valueHistogram;
  // Flat when every run came to the same figure, which the bins say by
  // spanning nothing — the same case the holdings read off min and max.
  const flat = bins.length === 0 || bins[0].from === bins[bins.length - 1].to;

  return (
    <div className="col-sm-6 col-xl-4">
      <Stat
        label={valueLabel(m.unit)}
        // No "worth" beside it: on every other card that clause converts an
        // amount into a value, and here the figure it would follow already is
        // one. This is the total those worths add up to.
        value={avg(approx(m.fmt(bankroll.meanFinalValue)))}
        hint={`typically ${approx(m.fmt(bankroll.medianFinalValue))}`}
      >
        {flat ? (
          <div className="stat-hint mt-2">the same in every run</div>
        ) : (
          <MiniHistogram
            bins={bins}
            median={bankroll.medianFinalValue}
            // A value lands anywhere; only counts of things are whole.
            whole={false}
            label="Spread of ending value across possible outcomes"
            tickText={(n) => gemTick(m, n)}
          />
        )}
      </Stat>
    </div>
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
  const { whole } = holding(bankrollKey);
  // Boxes name their set, which only the config can resolve.
  const label = holdingLabel(config, bankrollKey);
  const text = (n: number, exact = false) => amountText(bankrollKey, n, exact);

  return (
    <div className="col-sm-6 col-xl-4">
      <Stat
        label={label}
        /*
          An average lands between two boxes; a constant does not.

          The worth beside it is a valuation, hence the ≈, and the only figure
          on the card that follows the display unit — the amounts here and the
          ticks below are what a run is holding, so they stay in their own
          currency. It is the value the runs actually held rather than the
          amount at a rate, which is the same thing for everything but boxes,
          where two of a kind can be worth different amounts.
        */
        value={avg(
          text(totals.mean, totals.min === totals.max),
          approx(m.fmt(totals.worth)),
        )}
        hint={`typically ${text(totals.median, true)}`}
      >
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
            tickText={(n) => tickText(bankrollKey, n)}
          />
        )}
      </Stat>
    </div>
  );
}

export function PayoutBreakdown({
  bankroll,
  config,
  m,
}: {
  bankroll: BankrollResult;
  config: EventConfig;
  m: Money;
}) {
  const keys = heldKeys(config, bankroll.holdings.gold.mean > 0);

  return (
    <>
      <div className="row g-2">
        {/* First, so the total is read before the parts that make it up. */}
        <ValueCard bankroll={bankroll} m={m} />
        {keys.map((key) => (
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
        Bars are the spread across possible outcomes, the dashed line the
        typical (median) run.
      </div>
    </>
  );
}
