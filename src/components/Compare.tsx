import { useId, useState } from "react";

import {
  CUSTOM_PRESET,
  PRESETS,
  configFromPreset,
  winRateInterval,
  winRatePosterior,
  type EventConfig,
} from "../lib";
import type { Money } from "../format";
import { BreakEvenChart } from "./BreakEvenChart";
import { CompareCurveChart, CURVE_MODES, type CurveMode } from "./CompareCurveChart";
import { CompareSelector } from "./CompareSelector";
import { CompareTable } from "./CompareTable";
import { SectionHeading } from "./SectionHeading";
import { Tabs, TabPanel } from "./Tabs";

/**
 * Several events under one set of the reader's own rates.
 *
 * Every figure here is closed form — the same sums the Long-term value tab
 * takes, asked once per selected event — so there is no trial count, no seed
 * and nothing sampled. The bankroll is the one thing that has to be simulated,
 * and it is not on this tab.
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
  m,
}: {
  /** The sidebar's config: the rates every event here is priced with. */
  config: EventConfig;
  presetName: string;
  selection: string[];
  onSelectionChange: (next: string[]) => void;
  m: Money;
}) {
  const uid = useId();
  /*
   * Not in the share link, like the Bankroll tab's value/breakdown switch and
   * for the same reason: it is a glance at one chart rather than part of the
   * comparison being shared. Which events are compared *is* in the link.
   */
  const [mode, setMode] = useState<CurveMode>("roi");

  /*
   * "Custom" names the sidebar's own config, which is already what `config` is
   * — so it needs no preset applied, and there is no preset to apply. Every
   * other entry takes its event fields from the named preset and keeps the
   * rates it was handed.
   */
  const picked = selection
    .map((name) => {
      if (name === CUSTOM_PRESET) return { name: "Custom", config };
      const preset = PRESETS.find((p) => p.name === name);
      return preset ? { name, config: configFromPreset(preset, config) } : null;
    })
    .filter((c): c is { name: string; config: EventConfig } => c !== null);

  /*
   * The reader's own win rate as an interval, shared by every chart that plots
   * against it. One band for the tab, not one per event: it comes from the win
   * rate and match count in the sidebar, and which event is being compared
   * does not change how well they play. Null when the rate was called certain.
   */
  const posterior = winRatePosterior(config);
  const rateBand = posterior ? winRateInterval(posterior) : null;

  return (
    <>
      <div className="form-text mb-2">
        Every event below is priced with the rates in the sidebar — your win rate,
        your pack and box values, your gold. Change one and every line moves.
      </div>

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
          <BreakEvenChart configs={picked} winRate={config.winRate} rateBand={rateBand} />

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
