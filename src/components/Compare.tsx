import { useId, useMemo, useState } from "react";

import {
  CUSTOM_PRESET,
  PRESETS,
  breakEvenWinRate,
  configFromPreset,
  startingValue,
  winRateInterval,
  winRatePosterior,
  type EventConfig,
} from "../lib";
import { useSimulateCompare, type BankrollKnobs } from "../hooks/useSimulation";
import type { Money } from "../format";
import { BreakEvenChart } from "./BreakEvenChart";
import {
  BANKROLL_MODES,
  CompareBankroll,
  bankrollChartHeight,
  type BankrollMode,
} from "./CompareBankroll";
import { CompareCurveChart, CURVE_MODES, type CurveMode } from "./CompareCurveChart";
import { CompareSelector } from "./CompareSelector";
import { CompareTable } from "./CompareTable";
import { SectionHeading } from "./SectionHeading";
import { SimPending } from "./SimPending";
import { Tabs, TabPanel } from "./Tabs";

/**
 * One event as the two ranked charts draw it: the config they price, and the
 * break-even rate they are both ordered by.
 *
 * The rate is computed here rather than inside the chart that plots it because
 * two charts need the ordering and only one of them needs the figure — and a
 * bisection run twice per event per render is a bisection run once too often.
 */
export type CompareRow = {
  name: string;
  config: EventConfig;
  breakEven: number | null;
};

/**
 * Several events under one set of the reader's own rates.
 *
 * Almost everything here is closed form — the same sums the Long-term value tab
 * takes, asked once per selected event — so it has no trial count, no seed and
 * nothing sampled. The exception is the bankroll grid at the foot of the tab,
 * which is the one thing on this page that has to be simulated, and it is the
 * same simulation the Bankroll tab runs under the same knobs.
 *
 * The fan-out is `configFromPreset(preset, config)`: it replaces the entry cost,
 * structure and ladder and leaves every rate and the win rate alone. That is
 * what makes the comparison fair and what makes it *the reader's* — change the
 * pack value in the sidebar and all of these lines move together, because they
 * are all being priced with the number that was just changed.
 */
export function Compare({
  config,
  presetName,
  selection,
  onSelectionChange,
  knobs,
  hold,
  m,
}: {
  /** The sidebar's config: the rates every event here is priced with. */
  config: EventConfig;
  presetName: string;
  selection: string[];
  onSelectionChange: (next: string[]) => void;
  /**
   * The Bankroll tab's own controls, driving the grid below unchanged. This
   * tab adds none of its own and puts nothing in the link: a starting balance
   * is a fact about the reader, not about which events they are comparing.
   */
  knobs: BankrollKnobs;
  /** A dialog is open and holding its edits; see `Timing`. */
  hold: boolean;
  m: Money;
}) {
  const uid = useId();
  /*
   * Not in the share link, like the Bankroll tab's value/breakdown switch and
   * for the same reason: it is a glance at one chart rather than part of the
   * comparison being shared. Which events are compared *is* in the link.
   */
  const [mode, setMode] = useState<CurveMode>("roi");
  /* Not in the link either, and for the reason above. */
  const [rollMode, setRollMode] = useState<BankrollMode>("events");

  /*
   * "Custom" names the sidebar's own config, which is already what `config` is
   * — so it needs no preset applied, and there is no preset to apply. Every
   * other entry takes its event fields from the named preset and keeps the
   * rates it was handed.
   *
   * Memoised for the grid's sake and only that: everything else here is
   * recomputed per render anyway, but the simulation's params debounce on
   * object identity, and a fresh array every render would restart the wait on
   * every keystroke and never submit.
   */
  const picked = useMemo(
    () =>
      selection
        .map((name) => {
          if (name === CUSTOM_PRESET) return { name: "Custom", config };
          const preset = PRESETS.find((p) => p.name === name);
          return preset ? { name, config: configFromPreset(preset, config) } : null;
        })
        .filter((c): c is { name: string; config: EventConfig } => c !== null),
    [selection, config],
  );

  /*
   * The order the two ranked charts share, easiest bar to clear at the top. An
   * event with no break-even sorts to the end whichever kind of null it is; the
   * chart's own label says which.
   *
   * Both bar charts stack the same names down the same left margin, so a reader
   * comparing a row's break-even against how far their balance went in it is
   * reading across two charts — and would read across the wrong row if the two
   * disagreed. The sort is stable, so events the ranking cannot separate keep
   * the order the chips show them in.
   *
   * The curve above and the table below are deliberately not in this order.
   * The curve has no rows to order, and the table opens in selection order and
   * then ranks by whichever column the reader decides settles it, which is that
   * table's whole point.
   */
  const ranked: CompareRow[] = useMemo(
    () =>
      picked
        .map((p) => ({ ...p, breakEven: breakEvenWinRate(p.config) }))
        .sort((a, b) => (a.breakEven ?? Infinity) - (b.breakEven ?? Infinity)),
    [picked],
  );

  const compareParams = useMemo(
    () => ({ configs: picked.map((p) => p.config), ...knobs }),
    [picked, knobs],
  );
  const { result: grid, pending: gridPending, error: gridError } = useSimulateCompare(
    compareParams,
    { hold, flushOn: presetName },
  );

  /*
   * The reader's own win rate as an interval, shared by every chart that plots
   * against it. One band for the tab, not one per event: it comes from the win
   * rate and match count in the sidebar, and which event is being compared
   * does not change how well they play. Null when the rate was called certain.
   */
  const posterior = winRatePosterior(config);
  const rateBand = posterior ? winRateInterval(posterior) : null;

  const startValue = startingValue(
    config,
    knobs.startingGems,
    knobs.startingGold,
    knobs.startingPlayInPoints,
  );

  /*
   * A settled grid is only this selection's grid when it has a row per event.
   * Between a selection change and the run for it landing, the previous run's
   * rows are one event short or one long, and rendering them zipped against
   * the new names would label an event with another's numbers — which is worse
   * than a moment of shimmer. A width match is exact rather than heuristic:
   * the rows are positional, so same length means same request.
   *
   * Zipped against `picked`, which is the order the request went out in, and
   * then drawn in `ranked` order. The request keeps the canonical order on
   * purpose: it is the cache key, and a key that moved with a display decision
   * would recompute a grid to redraw it.
   */
  const gridRows = (() => {
    if (grid === null || grid.length !== picked.length) return null;
    const rank = new Map(ranked.map((r, i) => [r.name, i]));
    return picked
      .map((p, i) => ({ name: p.name, summary: grid[i] }))
      .sort((a, b) => (rank.get(a.name) ?? 0) - (rank.get(b.name) ?? 0));
  })();

  return (
    <>
      <CompareSelector
        selection={selection}
        onChange={onSelectionChange}
        presetName={presetName}
      />

      {picked.length === 0 ? (
        <p className="text-secondary my-4">
          No events selected. Pick some above to compare them.
        </p>
      ) : (
        <>
          <SectionHeading title="Value against win rate" />
          <div className="switch-panel">
            <Tabs
              group={`${uid}-mode`}
              items={CURVE_MODES}
              active={mode}
              onSelect={setMode}
              label="What the vertical axis measures"
              variant="segmented"
            />
            <TabPanel group={`${uid}-mode`} active={mode}>
              <CompareCurveChart
                configs={picked}
                mode={mode}
                winRate={config.winRate}
                rateBand={rateBand}
                m={m}
              />
            </TabPanel>
          </div>

          <SectionHeading
            title="Break-even win rate"
            subtitle="What each event needs before it stops costing gems. The dashed line is your rate."
            className="mt-4"
          />
          <BreakEvenChart rows={ranked} winRate={config.winRate} rateBand={rateBand} />

          <SectionHeading
            title="From one bankroll"
            subtitle="Each event played out from the same starting balance until it runs dry. The box holds the middle half of runs and the whiskers the middle 90%; the line is where one typically lands."
            className="mt-4"
          />
          {gridError != null && (
            <div className="alert alert-warning" role="alert">
              {grid === null
                ? "The bankroll grid failed to run. Adjust any input to retry."
                : "The bankroll grid failed — showing previous results. Adjust any input to retry."}
            </div>
          )}
          <div className="switch-panel">
            <Tabs
              group={`${uid}-roll`}
              items={BANKROLL_MODES}
              active={rollMode}
              onSelect={setRollMode}
              label="What the bars measure"
              variant="segmented"
            />
            <TabPanel group={`${uid}-roll`} active={rollMode}>
              {gridRows === null ? (
                /*
                 * `ResultsPlaceholder` is the Bankroll tab's shape — four tiles
                 * over two charts — and this is one chart. Same shimmer, one
                 * block, held at the height the chart will be so the sections
                 * below do not jump when it lands.
                 */
                <div>
                  <p className="visually-hidden" role="status">
                    Simulating…
                  </p>
                  <div
                    className="shimmer"
                    aria-hidden="true"
                    // The row count, which is the one thing about this block
                    // the stylesheet cannot know.
                    style={{ height: bankrollChartHeight(picked.length) }}
                  />
                </div>
              ) : (
                <SimPending pending={gridPending}>
                  <CompareBankroll
                    rows={gridRows}
                    mode={rollMode}
                    maxEvents={knobs.maxEvents}
                    startValue={startValue}
                    m={m}
                  />
                </SimPending>
              )}
            </TabPanel>
          </div>

          <SectionHeading
            title="All figures"
            subtitle="Sort by whichever column you think decides it."
            className="mt-4"
          />
          <CompareTable configs={picked} m={m} />
        </>
      )}
    </>
  );
}
