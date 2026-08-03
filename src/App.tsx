import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CUSTOM_PRESET,
  PRESETS,
  breakEvenWinRate,
  configFromPreset,
  defaultConfig,
  expectedNetAt,
  matchWinRate,
  matchesPreset,
  maxPossibleWins,
  maxRounds,
  resizePayouts,
  simulate,
  type EventConfig,
  type EventFormat,
  type EventStructure,
  type PayoutTier,
} from "./lib/draft";

const gems = (n: number): string =>
  `${n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString()}`;

const gems2 = (n: number): string =>
  `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}`;

const pct = (n: number, digits = 1): string => `${(n * 100).toFixed(digits)}%`;

const clampInt = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(n) || lo));

/**
 * Number input for whole-number amounts.
 *
 * Drops focus on wheel events — otherwise scrolling the page with the cursor
 * over a focused field silently edits the value.
 *
 * `step` is deliberately left at 1 rather than set to a convenient spinner
 * increment: the attribute is a *validation* rule counted from `min`, so a
 * step of 1000 from a min of 1 makes 100,000 invalid, and an invalid field
 * silently blocks form submission.
 */
function NumberInput({
  value,
  onChange,
  min,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      min={min}
      step={1}
      value={value}
      onWheel={(e) => e.currentTarget.blur()}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}

/** Small "i" button that reveals an explanatory bubble on click. */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="infotip" ref={ref}>
      <button
        type="button"
        className="info-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <span role="tooltip" className="info-bubble">
          {children}
        </span>
      )}
    </span>
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
  const advancedRef = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const ids = {
    format: `${uid}-format`,
    entry: `${uid}-entry`,
    packValue: `${uid}-pack-value`,
    trials: `${uid}-trials`,
    seed: `${uid}-seed`,
  };

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

  /**
   * Changing the structure changes how many win counts are reachable, so the
   * payout table has to be resized to match — rows that still exist keep their
   * values.
   */
  const setStructure = (structure: EventStructure) =>
    update({
      ...config,
      structure,
      payouts: resizePayouts(config.payouts, maxPossibleWins(structure)),
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
  const structure = config.structure;
  const roundWord = config.format === "bo3" ? "matches" : "games";
  const structureSummary =
    structure.kind === "rounds"
      ? `${structure.rounds} rounds played out in full, ${config.format.toUpperCase()}`
      : `play until ${structure.maxWins} wins or ${structure.maxLosses} losses, ${config.format.toUpperCase()}`;

  return (
    <div className="app">
      <header>
        <h1>MTGA Limited EV</h1>
        <p className="sub">
          Monte-Carlo EV model for an Arena limited event — {structureSummary}.
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
                  {p.name}
                </option>
              ))}
              <option value={CUSTOM_PRESET}>{CUSTOM_PRESET}</option>
            </select>
          </label>

          <div className="grid2">
            <label className="field">
              <span>Structure</span>
              <select
                value={structure.kind}
                onChange={(e) =>
                  setStructure(
                    e.target.value === "rounds"
                      ? { kind: "rounds", rounds: 3 }
                      : { kind: "elimination", maxWins: 7, maxLosses: 3 },
                  )
                }
              >
                <option value="elimination">Play until N wins / M losses</option>
                <option value="rounds">Fixed rounds</option>
              </select>
            </label>
            <div className="field">
              <div className="field-head">
                <label htmlFor={ids.format}>Match format</label>
                <InfoTip label="About match format">
                  Win rate is always entered per game. In best-of-three a per-game
                  edge compounds — winning 55% of games means winning 57.5% of
                  matches — so the longer format rewards the better deck.
                </InfoTip>
              </div>
              <select
                id={ids.format}
                value={config.format}
                onChange={(e) => set("format", e.target.value as EventFormat)}
              >
                <option value="bo1">Best of 1</option>
                <option value="bo3">Best of 3</option>
              </select>
            </div>
          </div>

          <div className="grid2">
            {structure.kind === "elimination" ? (
              <>
                <label className="field">
                  <span>Wins to finish</span>
                  <NumberInput
                    min={1}
                    value={structure.maxWins}
                    onChange={(n) =>
                      setStructure({ ...structure, maxWins: clampInt(n, 1, 20) })
                    }
                  />
                </label>
                <label className="field">
                  <span>Losses to bust</span>
                  <NumberInput
                    min={1}
                    value={structure.maxLosses}
                    onChange={(n) =>
                      setStructure({ ...structure, maxLosses: clampInt(n, 1, 20) })
                    }
                  />
                </label>
              </>
            ) : (
              <label className="field">
                <span>Rounds</span>
                <NumberInput
                  min={1}
                  value={structure.rounds}
                  onChange={(n) =>
                    setStructure({ kind: "rounds", rounds: clampInt(n, 1, 20) })
                  }
                />
              </label>
            )}
          </div>

          <label className="field">
            <span>
              Expected win rate (per game) <strong>{pct(config.winRate)}</strong>
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
          {config.format === "bo3" && (
            <p className="note tight">
              BO3 → <strong>{pct(matchWinRate(config), 2)}</strong> per match.
            </p>
          )}

          <div className="grid2">
            <div className="field">
              <div className="field-head">
                <label htmlFor={ids.entry}>Entry cost (gems)</label>
              </div>
              <NumberInput
                id={ids.entry}
                min={0}
                value={config.entryCostGems}
                onChange={(n) => set("entryCostGems", n)}
              />
            </div>
            <div className="field">
              <div className="field-head">
                <label htmlFor={ids.packValue}>Pack value (gems)</label>
                <InfoTip label="About pack value">
                  Packs are always counted, but only enter the gem figures once you
                  price them here. At 0 they contribute nothing to Net, so the
                  results are gems-only.
                </InfoTip>
              </div>
              <NumberInput
                id={ids.packValue}
                min={0}
                value={config.packValueGems}
                onChange={(n) => set("packValueGems", n)}
              />
            </div>
          </div>

          <button
            type="button"
            className="link-button"
            onClick={() => advancedRef.current?.showModal()}
          >
            Advanced settings…
          </button>

          <h3>
            Payout schedule
            <InfoTip label="About the payout schedule">
              Rows follow the structure: lowering the win ceiling drops the rows
              above it, and raising it again adds empty rows rather than restoring
              the old numbers. Re-select a preset to refill the table.
            </InfoTip>
          </h3>
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
                        value={t.gems}
                        onChange={(n) => setTier(t.wins, { gems: n })}
                      />
                    </td>
                    <td>
                      <NumberInput
                        min={0}
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
              <span className="label">{roundWord} / event</span>
              <span className="value">{result.meanRounds.toFixed(2)}</span>
              <span className="hint">
                max {maxRounds(structure)} · σ of net: {gems2(result.stdDevNet)} gems
              </span>
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

      <dialog
        ref={advancedRef}
        className="advanced"
        // Clicking the backdrop lands on the dialog element itself, not its
        // contents, which is what makes this a click-outside-to-close check.
        onClick={(e) => {
          if (e.target === advancedRef.current) advancedRef.current?.close();
        }}
      >
        <form method="dialog">
          <h2>Advanced settings</h2>
          <div className="grid2">
            <div className="field">
              <div className="field-head">
                <label htmlFor={ids.trials}>Simulated events (N)</label>
                <InfoTip label="About simulated events">
                  More events narrow the confidence interval on the simulated mean.
                  The exact column is unaffected — it's computed in closed form, not
                  sampled.
                </InfoTip>
              </div>
              <NumberInput
                id={ids.trials}
                min={1}
                value={trials}
                onChange={(n) => setTrials(clampInt(n, 1, 5_000_000))}
              />
            </div>
            <div className="field">
              <div className="field-head">
                <label htmlFor={ids.seed}>Seed</label>
                <InfoTip label="About the seed">
                  Changes which sample you get, not the distribution it's drawn
                  from. The same seed always reproduces the same run.
                </InfoTip>
              </div>
              <NumberInput id={ids.seed} value={seed} onChange={setSeed} />
            </div>
          </div>
          <div className="dialog-actions">
            {/*
              Closed explicitly rather than by submitting the method="dialog"
              form: submission is silently refused whenever any field is
              invalid, which would leave the dialog stuck open.
            */}
            <button
              type="button"
              className="primary"
              onClick={() => advancedRef.current?.close()}
            >
              Done
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
