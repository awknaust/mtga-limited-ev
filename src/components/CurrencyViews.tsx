import { CountHistogram } from "./CountHistogram";
import { DistributionChart } from "./DistributionChart";
import { pct, type Money } from "../format";
import { currency, type CurrencyOutcome, type CurrencyTotals } from "../lib";

/**
 * One reward, counted rather than valued.
 *
 * The gem-equivalent view answers what a payout is worth, which is the only
 * way to compare a box against a pack, but it can never answer how many. These
 * two panels do, one per side of the results: what a single event pays, and
 * what a whole bankroll run ends up holding.
 */

/**
 * Counts span orders of magnitude between rewards — a draft pays packs by the
 * half dozen, a box turns up in one event in fifty — so precision follows size
 * rather than being fixed, in the same way dollar amounts are formatted.
 */
const amountText = (n: number): string => {
  const a = Math.abs(n);
  return n.toFixed(a === 0 || a >= 1 ? 2 : a >= 0.01 ? 3 : 4);
};

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="col-6 col-xl-4">
      <div className="stat h-100">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-hint">{hint}</div>
      </div>
    </div>
  );
}

/** What one event pays of a currency, and how often. */
export function EventCurrencyView({
  outcome,
  rate,
  m,
}: {
  outcome: CurrencyOutcome;
  /** Gems one of them is worth, for tying the count back to the gem-eq view. */
  rate: number;
  m: Money;
}) {
  const { label, one } = currency(outcome.key);
  const lower = label.toLowerCase();

  return (
    <>
      <div className="row g-2">
        <Stat
          label={`Expected ${lower} / event`}
          value={amountText(outcome.mean)}
          hint={`closed form ${amountText(outcome.exactMean)}`}
        />
        <Stat
          label="Worth"
          value={m.fmt1(outcome.mean * rate)}
          hint={`at ${m.fmt(rate)} each`}
        />
        <Stat
          label="Events paying any"
          value={pct(outcome.probAny, 2)}
          hint={`pay at least one ${one}`}
        />
      </div>

      <h3 className="section-title mt-4">Distribution of {lower} per event</h3>
      <DistributionChart
        rows={outcome.buckets.map((b) => ({
          value: b.amount,
          probability: b.probability,
          exactProbability: b.exactProbability,
        }))}
        axisLabel={label}
        ariaLabel={`Distribution of ${lower} won per event`}
      />
      <div className="form-text">
        Bars are the simulation; the tick mark is the closed-form probability.
        Win counts paying the same amount are one row.
      </div>
    </>
  );
}

/** What a whole run wins of a currency — or why the question does not apply. */
export function BankrollCurrencyView({
  totals,
  currencyKey,
  rate,
  m,
  liquidating,
}: {
  totals: CurrencyTotals;
  currencyKey: CurrencyOutcome["key"];
  rate: number;
  m: Money;
  /** Whether winnings are being converted to gems and spent as they are won. */
  liquidating: boolean;
}) {
  const { label, one } = currency(currencyKey);
  const lower = label.toLowerCase();

  /*
   * Two separate reasons the count would mislead here, either one enough: the
   * run does not end holding any of them, and liquidating buys entries it
   * otherwise could not, so even the number won along the way is not the one
   * this event would pay you. Showing the tab and saying so beats hiding it,
   * which would leave the strip reflowing every time the switch is flipped.
   */
  if (liquidating) {
    return (
      <div className="stat">
        <div className="stat-label">Not counted while winnings are liquidated</div>
        <p className="stat-hint mb-0 mt-1">
          "Fund entries with winnings" converts every {one} to gems the moment it
          is won, so a run ends holding none of them — and the extra entries that
          buys change how many are won in the first place. Turn it off to count
          them, or read the gem-equivalent total instead, which is the question
          liquidating asks.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="row g-2">
        <Stat
          label={`${label} won`}
          value={totals.mean.toFixed(1)}
          hint={`median ${totals.median} · over the whole run`}
        />
        <Stat
          label="Worth"
          value={m.fmt(totals.mean * rate)}
          hint={`at ${m.fmt(rate)} each`}
        />
        <Stat
          label="Runs winning any"
          value={pct(totals.probAny, 2)}
          hint="of samples won at least one"
        />
      </div>

      <h3 className="section-title mt-4">{label} won per run</h3>
      {/*
        One distinct total means every run won the same number — usually none,
        because the bankroll never reached the win count that pays. A single
        bar spanning the chart says that far less clearly than a sentence does.
      */}
      {totals.histogram.length > 1 ? (
        <>
          <CountHistogram
            histogram={totals.histogram.map((h) => ({
              value: h.amount,
              count: h.count,
            }))}
            median={totals.median}
            axisLabel={`${label} won`}
            ariaLabel={`Distribution of ${lower} won across a run`}
          />
          <div className="form-text">
            Totals across a whole run, so they scale with how long the bankroll
            lasts.
          </div>
        </>
      ) : (
        <div className="form-text">
          {totals.probAny === 0
            ? `No run won a ${one}, so there is no spread to plot.`
            : `Every run won ${totals.median}, so there is no spread to plot.`}
        </div>
      )}
    </>
  );
}
