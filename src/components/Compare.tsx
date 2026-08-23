import { useId, useMemo, useState } from "react";

import {
  maxEventsFor,
  startingValue,
  winRateInterval,
  winRatePosterior,
  type BankrollSummary,
  type EventConfig,
} from "../lib";
import type {
  BankrollKnobs,
  CompareSimParams,
  SimulationState,
} from "../hooks/useSimulation";
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
import { rankByBreakEven, withBreakEven, type CompareEvent } from "./compareEvents";
import { CompareTable } from "./CompareTable";
import { SectionHeading } from "./SectionHeading";
import { SimPending } from "./SimPending";
import { Tabs, TabPanel } from "./Tabs";

/**
 * Several events under one set of the reader's own rates.
 *
 * Almost everything here is closed form — the same sums the Expected value tab
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
  picked,
  grid,
  knobs,
  m,
}: {
  /** The sidebar's config: the rates every event here is priced with. */
  config: EventConfig;
  presetName: string;
  selection: string[];
  onSelectionChange: (next: string[]) => void;
  /** `pickEvents(selection, config)`, computed by `App` so the grid can be. */
  picked: readonly CompareEvent[];
  /** The bankroll grid, run and held by `App` across tab switches. */
  grid: SimulationState<BankrollSummary[], CompareSimParams>;
  /**
   * The Bankroll tab's own controls, driving the grid below unchanged. This
   * tab adds none of its own and puts nothing in the link: a starting balance
   * is a fact about the reader, not about which events they are comparing.
   */
  knobs: BankrollKnobs;
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
   * The order the two bar charts share; `rankByBreakEven` says why it is one
   * order rather than each chart's own.
   *
   * The curve above and the table below are deliberately not in it. The curve
   * has no rows to order, and the table opens in selection order and then ranks
   * by whichever column the reader decides settles it, which is that table's
   * whole point.
   */
  const rows = useMemo(() => withBreakEven(picked), [picked]);
  const ranked = useMemo(() => rankByBreakEven(rows), [rows]);

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
   * The settled grid, labelled with the selection it was *computed for* rather
   * than the one showing now.
   *
   * Those differ for as long as a recompute takes, and at a high trial count
   * that is seconds. Labelling by the current selection would put one event's
   * numbers under another's name, so the earlier version dropped the result
   * instead and rendered a blank — which is how adding a sixteenth event, or
   * changing the win rate on another tab, wiped the chart rather than dimming
   * it. Both are answered the same way: the rows are the old answer, correctly
   * labelled, and `SimPending` says they are stale.
   *
   * Drawn in `ranked` order where a row is still selected, and after it where
   * one is not — an event on its way out sinks to the bottom for the moment it
   * takes to go.
   */
  const gridView = (() => {
    const params = grid.resultParams;
    if (grid.result === null || params === null) return null;
    const rank = new Map(ranked.map((r, i) => [r.name, i]));
    const rows = params.events
      .map((e, i) => ({ name: e.name, summary: grid.result![i] }))
      .sort((a, b) => (rank.get(a.name) ?? Infinity) - (rank.get(b.name) ?? Infinity));
    /*
     * The events axis ceiling, from the params the rows were computed for
     * rather than the live knobs, so a stale grid is drawn against its own
     * cap. Per event now — one games budget is a different number of entries
     * for each — so the axis takes the largest of the rows' own caps.
     */
    const eventCap = Math.max(
      1,
      ...params.events.map((e) => maxEventsFor(e.config, params.maxGames)),
    );
    return { rows, eventCap, maxGames: params.maxGames };
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
          {grid.error != null && (
            <div className="alert alert-warning" role="alert">
              {grid.result === null
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
              {gridView === null ? (
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
                <SimPending pending={grid.pending}>
                  <CompareBankroll
                    rows={gridView.rows}
                    mode={rollMode}
                    eventCap={gridView.eventCap}
                    maxGames={gridView.maxGames}
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
          <CompareTable rows={rows} m={m} />
        </>
      )}
    </>
  );
}
