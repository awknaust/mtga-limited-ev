import { useState } from "react";

import { eventExpectation } from "../lib";
import { pct, type Money } from "../format";
import { InfoTip } from "./InfoTip";
import type { CompareRow } from "./compareEvents";
import { compareSeries } from "./compareSeries";
import { STAT_HELP, type StatHelp } from "./statHelp";

/**
 * The compared figures, exactly.
 *
 * The charts show shape; this is where the numbers are read off. Each column is
 * a figure the model already computes for one event, asked once per selected
 * event — nothing here is a new derivation, which is what keeps a row and the
 * Expected value tab from ever disagreeing.
 *
 * Four columns, deliberately. The table grew to ten while every figure the
 * model exposes looked worth a column, and a row nobody can take in at a glance
 * answers nothing — the tab already has two charts for shape. What is left is
 * what an entry returns, what it returns per gem staked, the rate it needs, and
 * what it costs in matches.
 *
 * Sorting is the reader's, and it is the whole point: the ranking depends on
 * which column you believe decides it, and nothing here says which that is. The
 * default is the selection's own order, so the table opens agreeing with the
 * chips and the chart.
 */

type Row = {
  name: string;
  colorClass: string;
  net: number;
  roi: number | null;
  breakEven: number | null;
  rounds: number;
};

type Column = {
  key: string;
  label: string;
  /**
   * The popover on the heading, and the same words the Expected value tab's
   * tile uses — one definition in `statHelp.ts`, since two explanations of one
   * statistic only stay the same by being the same.
   */
  help: StatHelp;
  /** How the cell reads. */
  cell: (row: Row, m: Money) => React.ReactNode;
  /** What it sorts on; null sorts last whichever way the column points. */
  sortBy: (row: Row) => number | null;
};

const COLUMNS: Column[] = [
  {
    key: "net",
    help: STAT_HELP.net,
    /*
     * The ≈ is on the heading rather than on every figure, which is the call
     * the EV curve's axis label already makes: declared once, and left to the
     * cells to carry the unit. It is not decoration — a net is only ever as
     * exact as the reader's own pack and box values make it, and a column of
     * gem signs with no ≈ anywhere would claim otherwise.
     */
    label: "Net ≈",
    cell: (r, m) => m.fmt(r.net),
    sortBy: (r) => r.net,
  },
  {
    key: "roi",
    help: STAT_HELP.roi,
    label: "ROI",
    // Null is a free event: no gems staked, so no share of them returned. An
    // em dash rather than 0%, which would read as breaking even.
    cell: (r) => (r.roi === null ? "—" : pct(r.roi)),
    sortBy: (r) => r.roi,
  },
  {
    key: "breakEven",
    help: STAT_HELP.breakEven,
    label: "Break-even",
    cell: (r) => (r.breakEven === null ? "—" : pct(r.breakEven)),
    sortBy: (r) => r.breakEven,
  },
  {
    key: "rounds",
    help: STAT_HELP.matches,
    label: "Matches",
    cell: (r) => r.rounds.toFixed(1),
    sortBy: (r) => r.rounds,
  },
];

export function CompareTable({
  rows: given,
  m,
}: {
  /**
   * In selection order, carrying the break-even rate `Compare` computed for the
   * chart above — the same figure, not a second bisection of the same
   * expectation. It is the most expensive thing this tab computes.
   */
  rows: readonly CompareRow[];
  m: Money;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);

  const rows: Row[] = given.map(({ name, config, breakEven }) => {
    const e = eventExpectation(config);
    return {
      name,
      colorClass: compareSeries(name).colorClass,
      net: e.meanNet,
      // `eventExpectation` reports 0 where there is no gem price, which is a
      // sentinel and not a rate; the table says so rather than printing it.
      roi: config.entryCostGems === null ? null : e.roi,
      breakEven,
      rounds: e.meanRounds,
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
            {COLUMNS.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className="text-end"
                  aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
                >
                  {/* The tip sits beside the sort button rather than inside it:
                      it is a button itself, and one cannot nest in another. */}
                  <span className="compare-head">
                  <button type="button" className="compare-sort" onClick={() => onSort(c.key)}>
                    {c.label}
                    {/*
                      Bootstrap ships no table-sort component, so the glyphs are
                      the convention rather than the framework: the paired
                      up-down arrow is what a sortable-but-unsorted column wears
                      almost everywhere, and a filled caret is the direction
                      once one is chosen. It replaces a dash, which read as
                      "no value" rather than "sort by this".
                    */}
                    <i
                      className={`bi ms-1 ${
                        active
                          ? sort.desc
                            ? "bi-caret-down-fill"
                            : "bi-caret-up-fill"
                          : "bi-arrow-down-up compare-sort-idle"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                    <InfoTip label={c.help.label} content={c.help.content} />
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.name}>
              <th scope="row" className="fw-normal">
                <span className="compare-event">
                  <span
                    className={`compare-chip-swatch ${row.colorClass}`}
                    aria-hidden="true"
                  />
                  {row.name}
                </span>
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
