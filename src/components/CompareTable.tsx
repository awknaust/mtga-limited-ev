import { useState } from "react";

import {
  boxChancePerEvent,
  breakEvenWinRate,
  eventExpectation,
  netStdDev,
  paysBoxes,
  paysTokens,
  tokenChancePerEvent,
  type EventConfig,
} from "../lib";
import { pct, type Money } from "../format";
import { compareSeries } from "./compareSeries";

/**
 * Every compared figure at once, exactly.
 *
 * The charts show shape; this is where the numbers are read off. Each column is
 * a figure the model already computes for one event, asked once per selected
 * event — nothing here is a new derivation, which is what keeps a row and the
 * Long-term value tab from ever disagreeing.
 *
 * Sorting is the reader's, and it is the whole point: the ranking depends on
 * which column you believe matters, and nothing here says which that is. The
 * default is the selection's own order so the table opens agreeing with the
 * chips and the chart.
 */

type Row = {
  name: string;
  colorClass: string;
  entry: number;
  net: number;
  /** Credible interval on `net`; null where the win rate was called certain. */
  netBand: [lo: number, hi: number] | null;
  spread: number;
  roi: number | null;
  breakEven: number | null;
  probProfit: number;
  /** Share of the record above this event's break-even; null if certain. */
  pAbove: number | null;
  rounds: number;
  perMatch: number | null;
  prize: { label: string; chance: number } | null;
};

type Column = {
  key: string;
  label: string;
  /** Right-aligned unless it is the name. */
  numeric: boolean;
  /** How the cell reads. */
  cell: (row: Row, m: Money) => React.ReactNode;
  /** What it sorts on; null sorts last whichever way the column points. */
  sortBy: (row: Row) => number | null;
};

const COLUMNS: Column[] = [
  {
    key: "entry",
    label: "Entry",
    numeric: true,
    cell: (r, m) => m.fmt(r.entry),
    sortBy: (r) => r.entry,
  },
  {
    key: "net",
    label: "Net / event",
    numeric: true,
    // The range under the figure is the expected-net tile's "plausibly …"
    // hint, in the one column narrow enough to carry it.
    cell: (r, m) =>
      r.netBand === null ? (
        m.fmt(r.net)
      ) : (
        <>
          {m.fmt(r.net)}
          <span className="compare-range">
            {m.fmt(r.netBand[0])} to {m.fmt(r.netBand[1])}
          </span>
        </>
      ),
    sortBy: (r) => r.net,
  },
  {
    key: "perMatch",
    label: "Net / match",
    numeric: true,
    cell: (r, m) => (r.perMatch === null ? "—" : m.fmt(r.perMatch)),
    sortBy: (r) => r.perMatch,
  },
  {
    key: "roi",
    label: "ROI",
    numeric: true,
    // Null is a fully gold-funded entry: no gems staked, so no share of them
    // returned. An em dash rather than 0%, which would read as breaking even.
    cell: (r) => (r.roi === null ? "—" : pct(r.roi)),
    sortBy: (r) => r.roi,
  },
  {
    key: "breakEven",
    label: "Break-even",
    numeric: true,
    cell: (r) => (r.breakEven === null ? "—" : pct(r.breakEven)),
    sortBy: (r) => r.breakEven,
  },
  {
    // Named as the Long-term value tab names it, because it is the same
    // figure: the share of *events* that end net positive, which is luck at a
    // known win rate. The column after it is the other uncertainty entirely.
    key: "probProfit",
    label: "P(profit)",
    numeric: true,
    cell: (r) => pct(r.probProfit),
    sortBy: (r) => r.probProfit,
  },
  {
    /*
     * How much of the reader's own record puts them above this event's
     * break-even — the tab's version of the hint under the break-even tile.
     *
     * Not a restatement of P(profit). That one asks how often a run comes out
     * ahead when the win rate is taken as given; this asks whether the win
     * rate is high enough at all, which is the question a record of a hundred
     * matches can still leave open. Dashes when the rate was called certain,
     * where there is no record to be uncertain about.
     */
    key: "pAbove",
    label: "Above break-even",
    numeric: true,
    cell: (r) => (r.pAbove === null ? "—" : pct(r.pAbove)),
    sortBy: (r) => r.pAbove,
  },
  {
    key: "spread",
    label: "Spread ±",
    numeric: true,
    cell: (r, m) => m.fmt(r.spread),
    sortBy: (r) => r.spread,
  },
  {
    key: "rounds",
    label: "Matches",
    numeric: true,
    cell: (r) => r.rounds.toFixed(1),
    sortBy: (r) => r.rounds,
  },
  {
    key: "prize",
    label: "Box / token",
    numeric: true,
    cell: (r) => (r.prize === null ? "—" : `${pct(r.prize.chance)} ${r.prize.label}`),
    sortBy: (r) => r.prize?.chance ?? null,
  },
];

export function CompareTable({
  configs,
  m,
}: {
  configs: readonly {
    name: string;
    config: EventConfig;
    netBand: [lo: number, hi: number] | null;
    pAbove: number | null;
  }[];
  m: Money;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);

  const rows: Row[] = configs.map(({ name, config, netBand, pAbove }) => {
    const e = eventExpectation(config);
    return {
      name,
      colorClass: compareSeries(name).colorClass,
      entry: e.entryGems,
      net: e.meanNet,
      netBand,
      pAbove,
      spread: netStdDev(config),
      // `eventExpectation` reports 0 for a zero entry, which is a sentinel and
      // not a rate; the table says so rather than printing it.
      roi: e.entryGems > 0 ? e.roi : null,
      breakEven: breakEvenWinRate(config),
      probProfit: e.probProfit,
      rounds: e.meanRounds,
      perMatch: e.meanRounds > 0 ? e.meanNet / e.meanRounds : null,
      prize: paysBoxes(config.payouts)
        ? { label: "box", chance: boxChancePerEvent(config) }
        : paysTokens(config.payouts)
          ? { label: "token", chance: tokenChancePerEvent(config) }
          : null,
    };
  });

  const column = COLUMNS.find((c) => c.key === sort?.key);
  const sorted = column
    ? [...rows].sort((a, b) => {
        const av = column.sortBy(a);
        const bv = column.sortBy(b);
        // Null is "no answer", which belongs at the bottom whichever direction
        // the column is pointed — flipping it to the top would rank an absence
        // above every real figure.
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return sort?.desc ? bv - av : av - bv;
      })
    : rows;

  const onSort = (key: string) =>
    setSort((prev) => (prev?.key === key ? { key, desc: !prev.desc } : { key, desc: true }));

  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle compare-table">
        <thead>
          <tr>
            <th scope="col">Event</th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="text-end"
                aria-sort={
                  sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"
                }
              >
                <button
                  type="button"
                  className="compare-sort"
                  onClick={() => onSort(c.key)}
                >
                  {c.label}
                  <i
                    className={`bi ${
                      sort?.key === c.key
                        ? sort.desc
                          ? "bi-caret-down-fill"
                          : "bi-caret-up-fill"
                        : "bi-dash"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.name}>
              <th scope="row" className="fw-normal">
                <span
                  className={`compare-chip-swatch ${row.colorClass}`}
                  aria-hidden="true"
                />
                {row.name}
              </th>
              {COLUMNS.map((c) => (
                <td key={c.key} className="text-end">
                  {c.cell(row, m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
