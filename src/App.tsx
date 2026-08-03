import { useMemo, useState } from "react";
import {
  CUSTOM_PRESET,
  PRESETS,
  breakEvenWinRate,
  configFromPreset,
  defaultConfig,
  expectedNetAt,
  matchesPreset,
  simulate,
  type EventConfig,
  type PayoutTier,
} from "./lib/draft";

const gems = (n: number): string =>
  `${n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString()}`;

const gems2 = (n: number): string =>
  `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}`;

const pct = (n: number, digits = 1): string => `${(n * 100).toFixed(digits)}%`;

/**
 * Number input that drops focus on wheel events — otherwise scrolling the page
 * with the cursor over a focused field silently edits the value.
 */
function NumberInput({
  value,
  onChange,
  min,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      value={value}
      onWheel={(e) => e.currentTarget.blur()}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}

export default function App() {
  const [config, setConfig] = useState<EventConfig>(defaultConfig);
  const [trials, setTrials] = useState(100_000);
  const [seed, setSeed] = useState(1);
  const [presetName, setPresetName] = useState(PRESETS[0].name);
  // Last preset picked from the dropdown. Kept separately from presetName so an
  // edit can fall back to "Custom" and return to the preset when undone —
  // Premier and Cube are identical, so the right name can't be inferred.
  const [anchor, setAnchor] = useState<string | null>(PRESETS[0].name);

  const result = useMemo(() => simulate(config, trials, seed), [config, trials, seed]);
  const breakEven = useMemo(() => breakEvenWinRate(config), [config]);
  // When there is no break-even point, say which side of zero the event sits on.
  const breakEvenHint = useMemo(() => {
    if (breakEven !== null) return "per game";
    return expectedNetAt(config, 1) < 0
      ? "unreachable — even a perfect run pays less than entry"
      : "always profitable, even at a 0% win rate";
  }, [breakEven, config]);

  /**
   * Apply a hand edit. The selector shows "Custom" whenever the schedule has
   * moved off the last-picked preset, and snaps back if the edit is undone.
   */
  const update = (next: EventConfig) => {
    setConfig(next);
    setPresetName(anchor && matchesPreset(next, anchor) ? anchor : CUSTOM_PRESET);
  };

  const set = <K extends keyof EventConfig>(key: K, value: EventConfig[K]) =>
    update({ ...config, [key]: value });

  const setTier = (wins: number, patch: Partial<PayoutTier>) =>
    update({
      ...config,
      payouts: config.payouts.map((t) => (t.wins === wins ? { ...t, ...patch } : t)),
    });

  const applyPreset = (name: string) => {
    setPresetName(name);
    const preset = PRESETS.find((p) => p.name === name);
    if (preset) {
      setAnchor(name);
      setConfig(configFromPreset(preset, config));
    } else {
      // "Custom" keeps whatever is on screen, and drops the anchor so the
      // selector stays on Custom instead of snapping back to a matching preset.
      setAnchor(null);
    }
  };

  const maxProb = Math.max(...result.buckets.map((b) => b.probability), 0.0001);
  const profitable = result.meanNet >= 0;

  return (
    <div className="app">
      <header>
        <h1>MTGA Limited EV</h1>
        <p className="sub">
          Monte-Carlo EV model for an Arena limited event — play until{" "}
          {config.maxWins} wins or {config.maxLosses} losses, BO1.
        </p>
      </header>

      <div className="layout">
        <section className="panel inputs">
          <h2>Inputs</h2>

          <label className="field">
            <span>Event preset</span>
            <select value={presetName} onChange={(e) => applyPreset(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} — {p.entryCostGems.toLocaleString()} gems
                </option>
              ))}
              <option value={CUSTOM_PRESET}>{CUSTOM_PRESET}</option>
            </select>
          </label>

          <label className="field">
            <span>
              Expected win rate <strong>{pct(config.winRate)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={config.winRate}
              onChange={(e) => set("winRate", Number(e.target.value))}
            />
          </label>

          <div className="grid2">
            <label className="field">
              <span>Entry cost (gems)</span>
              <NumberInput
                min={0}
                step={100}
                value={config.entryCostGems}
                onChange={(n) => set("entryCostGems", n)}
              />
            </label>
            <label className="field">
              <span>Pack value (gems)</span>
              <NumberInput
                min={0}
                step={10}
                value={config.packValueGems}
                onChange={(n) => set("packValueGems", n)}
              />
            </label>
            <label className="field">
              <span>Simulated events (N)</span>
              <NumberInput
                min={1}
                step={1000}
                value={trials}
                onChange={(n) => setTrials(Math.max(1, Math.min(5_000_000, n || 1)))}
              />
            </label>
            <label className="field">
              <span>Seed</span>
              <NumberInput value={seed} onChange={setSeed} />
            </label>
          </div>

          <h3>Payout schedule</h3>
          <table className="payouts">
            <thead>
              <tr>
                <th>Wins</th>
                <th>Gems</th>
                <th>Packs</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {config.payouts.map((t) => {
                const net =
                  t.gems + t.packs * config.packValueGems - config.entryCostGems;
                return (
                  <tr key={t.wins}>
                    <td className="wins">{t.wins}</td>
                    <td>
                      <NumberInput
                        min={0}
                        step={50}
                        value={t.gems}
                        onChange={(n) => setTier(t.wins, { gems: n })}
                      />
                    </td>
                    <td>
                      <NumberInput
                        min={0}
                        step={1}
                        value={t.packs}
                        onChange={(n) => setTier(t.wins, { packs: n })}
                      />
                    </td>
                    <td className={net >= 0 ? "pos" : "neg"}>{gems(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="note">
            Packs are counted separately and valued at {config.packValueGems} gems each,
            so "Net" is gems-only unless you give packs a value.
          </p>
        </section>

        <section className="panel results">
          <h2>Results</h2>

          <div className="cards">
            <div className={`card ${profitable ? "pos" : "neg"}`}>
              <span className="label">Expected net / event</span>
              <span className="value">{gems2(result.meanNet)}</span>
              <span className="hint">
                gems · ±{gems2(1.96 * result.stdErrNet)} (95% CI)
              </span>
            </div>
            <div className="card">
              <span className="label">Expected gross</span>
              <span className="value">{gems2(result.meanGross)}</span>
              <span className="hint">
                gems + {result.meanPacks.toFixed(2)} packs / event
              </span>
            </div>
            <div className={`card ${profitable ? "pos" : "neg"}`}>
              <span className="label">ROI</span>
              <span className="value">{pct(result.roi)}</span>
              <span className="hint">of {gems(config.entryCostGems)} gem entry</span>
            </div>
            <div className="card">
              <span className="label">Break-even win rate</span>
              <span className="value">
                {breakEven === null ? "—" : pct(breakEven, 2)}
              </span>
              <span className="hint">{breakEvenHint}</span>
            </div>
            <div className="card">
              <span className="label">P(profit)</span>
              <span className="value">{pct(result.probProfit)}</span>
              <span className="hint">of events end net positive</span>
            </div>
            <div className="card">
              <span className="label">Games / event</span>
              <span className="value">{result.meanGames.toFixed(2)}</span>
              <span className="hint">σ of net: {gems2(result.stdDevNet)} gems</span>
            </div>
          </div>

          <h3>Distribution of outcomes by wins</h3>
          <div className="chart">
            {result.buckets.map((b) => (
              <div key={b.wins} className="bar-row">
                <span className="bar-label">{b.wins}W</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(b.probability / maxProb) * 100}%` }}
                  />
                  <div
                    className="bar-exact"
                    style={{ left: `${(b.exactProbability / maxProb) * 100}%` }}
                    title={`exact: ${pct(b.exactProbability, 2)}`}
                  />
                </div>
                <span className="bar-value">{pct(b.probability, 2)}</span>
              </div>
            ))}
          </div>
          <p className="note">
            Bars are the simulation; the tick mark is the closed-form probability.
          </p>

          <h3>Outcome table</h3>
          <div className="table-scroll">
            <table className="outcomes">
              <thead>
                <tr>
                  <th>Wins</th>
                  <th>Events</th>
                  <th>Simulated</th>
                  <th>Exact</th>
                  <th>Packs</th>
                  <th>Gross</th>
                  <th>Net</th>
                  <th>Contribution to EV</th>
                </tr>
              </thead>
              <tbody>
                {result.buckets.map((b) => (
                  <tr key={b.wins}>
                    <td className="wins">{b.wins}</td>
                    <td>{b.count.toLocaleString()}</td>
                    <td>{pct(b.probability, 2)}</td>
                    <td className="muted">{pct(b.exactProbability, 2)}</td>
                    <td>{b.packs}</td>
                    <td>{gems(b.grossGems)}</td>
                    <td className={b.netGems >= 0 ? "pos" : "neg"}>{gems(b.netGems)}</td>
                    <td className={b.probability * b.netGems >= 0 ? "pos" : "neg"}>
                      {gems2(b.probability * b.netGems)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7}>Expected net per event</td>
                  <td className={profitable ? "pos" : "neg"}>{gems2(result.meanNet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h3>Spread of a single event (net gems)</h3>
          <div className="percentiles">
            {(
              [
                ["p5", result.percentiles.p5],
                ["p25", result.percentiles.p25],
                ["median", result.percentiles.p50],
                ["p75", result.percentiles.p75],
                ["p95", result.percentiles.p95],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="pct-cell">
                <span className="label">{label}</span>
                <span className={value >= 0 ? "pos" : "neg"}>{gems(value)}</span>
              </div>
            ))}
          </div>
          <p className="note">
            Over {result.trials.toLocaleString()} events, total net ={" "}
            <strong className={result.totalNet >= 0 ? "pos" : "neg"}>
              {gems(result.totalNet)}
            </strong>{" "}
            gems.
          </p>
        </section>
      </div>
    </div>
  );
}
