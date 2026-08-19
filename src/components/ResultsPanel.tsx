import { useId } from "react";

import { About } from "./About";
import { BankrollTab } from "./BankrollTab";
import { Compare } from "./Compare";
import { EventValueTab } from "./EventValueTab";
import { Mastery } from "./Mastery";
import { Tabs, TabPanel } from "./Tabs";
import type { CompareEvent } from "./compareEvents";
import type { Money } from "../format";
import type {
  BankrollKnobs,
  CompareSimParams,
  SimulationState,
} from "../hooks/useSimulation";
import type {
  BankrollResult,
  BankrollSummary,
  EventConfig,
  MasteryTrack,
} from "../lib";
import type { Tab } from "../share";

/**
 * The tabs, in the order they answer the page's questions: what a balance does
 * over a run, what one entry is worth, how the events compare, what the pass
 * pays, and then how all of it is worked out.
 *
 * Exported because the page title names the tab, and the label belongs to the
 * tab rather than to the title.
 */
export const RESULT_TABS = [
  { key: "bankroll" as const, label: "Bankroll" },
  { key: "event" as const, label: "Long-term value" },
  { key: "compare" as const, label: "Compare" },
  { key: "mastery" as const, label: "Mastery" },
  { key: "about" as const, label: "About" },
];

/**
 * The results, beside the column that sets them.
 *
 * One card, one tab strip, and one panel per question. Nothing is computed
 * here: the simulations run in `App`, from any tab, so a settled result
 * survives the unmount that switching tabs causes.
 */
export function ResultsPanel({
  tab,
  onTabChange,
  simulating,
  config,
  m,
  presetName,
  masteryTrack,
  compareSelection,
  onCompareSelectionChange,
  comparePicked,
  compareGrid,
  bankrollKnobs,
  bankroll,
  bankrollPending,
  bankrollError,
  startValue,
  maxEvents,
  view,
  onViewChange,
  rateBand,
  onShowBoxPrices,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  /** Whether either simulation is running, from whichever tab is showing. */
  simulating: boolean;
  config: EventConfig;
  m: Money;
  presetName: string;
  masteryTrack: MasteryTrack;
  compareSelection: string[];
  onCompareSelectionChange: (next: string[]) => void;
  comparePicked: readonly CompareEvent[];
  compareGrid: SimulationState<BankrollSummary[], CompareSimParams>;
  bankrollKnobs: BankrollKnobs;
  bankroll: BankrollResult | null;
  bankrollPending: boolean;
  bankrollError: unknown;
  startValue: number;
  maxEvents: number;
  view: "value" | "breakdown";
  onViewChange: (view: "value" | "breakdown") => void;
  rateBand: [lo: number, hi: number] | null;
  onShowBoxPrices: () => void;
}) {
  const group = useId();
  return (
    <div className="col-lg-8">
      <div className="card">
        <div className="card-body">
          <Tabs
            group={group}
            items={RESULT_TABS}
            active={tab}
            onSelect={onTabChange}
            label="Results"
            /*
             * Only the spinner, and only while one is running: it is the one
             * thing here that has to be visible from a tab other than the one
             * dimming, so it cannot live in the panel. The event and its
             * structure used to sit beside it, restating the sidebar two
             * inches away.
             */
            trailing={
              simulating ? (
                <span className="sim-running" role="status">
                  <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                  Simulating…
                </span>
              ) : undefined
            }
          />

          <TabPanel group={group} active={tab}>
            {/*
              The last branch is the per-event panel rather than a
              `tab === "event"` test, so a tab added above without its own
              rung here renders that panel silently. Add the rung.
            */}
            {tab === "about" ? (
              <About config={config} m={m} onShowBoxPrices={onShowBoxPrices} />
            ) : tab === "mastery" ? (
              <Mastery track={masteryTrack} config={config} m={m} />
            ) : tab === "compare" ? (
              <Compare
                config={config}
                presetName={presetName}
                selection={compareSelection}
                onSelectionChange={onCompareSelectionChange}
                picked={comparePicked}
                grid={compareGrid}
                knobs={bankrollKnobs}
                m={m}
              />
            ) : tab === "bankroll" ? (
              <BankrollTab
                bankroll={bankroll}
                pending={bankrollPending}
                error={bankrollError}
                config={config}
                m={m}
                startValue={startValue}
                maxEvents={maxEvents}
                view={view}
                onViewChange={onViewChange}
              />
            ) : (
              <EventValueTab config={config} m={m} rateBand={rateBand} />
            )}
          </TabPanel>
        </div>
      </div>
    </div>
  );
}
