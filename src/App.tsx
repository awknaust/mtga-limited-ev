import { useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "bootstrap/js/dist/modal";
import Popover from "bootstrap/js/dist/popover";
import {
  CUSTOM_PRESET,
  PRESETS,
  breakEvenWinRate,
  configFromPreset,
  defaultConfig,
  expectedNetAt,
  matchWinRate,
  maxPossibleWins,
  maxRounds,
  resizePayouts,
  simulate,
  type EventConfig,
  type EventFormat,
  type EventStructure,
  type PayoutTier,
} from "./lib";

const gems = (n: number): string =>
  `${n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString()}`;

const gems2 = (n: number): string =>
  `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}`;

const pct = (n: number, digits = 1): string => `${(n * 100).toFixed(digits)}%`;

const clampInt = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(n) || lo));

/** Bootstrap text colour for a signed figure. */
const signClass = (n: number): string => (n >= 0 ? "text-success" : "text-danger");

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
  disabled,
  className = "form-control",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      className={className}
      min={min}
      step={1}
      value={value}
      disabled={disabled}
      onWheel={(e) => e.currentTarget.blur()}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}

/**
 * Bootstrap popover on a small "i" button.
 *
 * Uses the `focus` trigger so the next click anywhere dismisses it. Buttons
 * are not focused by clicking in Safari, hence the explicit tabIndex.
 */
function InfoTip({ label, content }: { label: string; content: string }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const popover = new Popover(el, {
      content,
      trigger: "focus",
      // The inputs sit in a narrow column, so a popover above or below would
      // cover the neighbouring controls — and the click that dismisses it
      // would be swallowed by the bubble.
      placement: "right",
      container: "body",
    });
    return () => popover.dispose();
  }, [content]);

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={0}
      className="btn btn-sm info-btn ms-1"
      aria-label={label}
    >
      i
    </button>
  );
}

export default function App() {
  const [config, setConfig] = useState<EventConfig>(defaultConfig);
  const [trials, setTrials] = useState(100_000);
  const [seed, setSeed] = useState(1);
  const [presetName, setPresetName] = useState(PRESETS[0].name);

  const modalEl = useRef<HTMLDivElement>(null);
  const modal = useRef<Modal | null>(null);
  useEffect(() => {
    if (!modalEl.current) return;
    modal.current = new Modal(modalEl.current);
    return () => {
      modal.current?.dispose();
      modal.current = null;
    };
  }, []);

  const uid = useId();
  const ids = {
    preset: `${uid}-preset`,
    structure: `${uid}-structure`,
    format: `${uid}-format`,
    maxWins: `${uid}-max-wins`,
    maxLosses: `${uid}-max-losses`,
    rounds: `${uid}-rounds`,
    winRate: `${uid}-win-rate`,
    entry: `${uid}-entry`,
    packValue: `${uid}-pack-value`,
    funValue: `${uid}-fun-value`,
    playInValue: `${uid}-play-in-value`,
    playBoxValue: `${uid}-play-box-value`,
    collectorBoxValue: `${uid}-collector-box-value`,
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

  const update = setConfig;

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

  /** Presets load their own values; "Custom" keeps whatever is on screen. */
  const applyPreset = (name: string) => {
    setPresetName(name);
    const preset = PRESETS.find((p) => p.name === name);
    if (preset) setConfig(configFromPreset(preset, config));
  };

  const maxProb = Math.max(...result.buckets.map((b) => b.probability), 0.0001);
  /*
   * A preset describes a real event, so its definition is read-only; "Copy to
   * Custom" takes the values and unlocks them. Only editing an event you own
   * avoids the question of what a half-edited "Premier Draft" means.
   */
  const isCustom = presetName === CUSTOM_PRESET;
  const locked = !isCustom;
  /*
   * Most events award no play-in points, so the column is hidden for them. It
   * is always shown on Custom — otherwise a schedule that started at zero
   * could never grow one.
   */
  const showPlayInPoints =
    isCustom || config.payouts.some((t) => (t.playInPoints ?? 0) > 0);
  const showPlayBoxes =
    isCustom || config.payouts.some((t) => (t.playBoxes ?? 0) > 0);
  const showCollectorBoxes =
    isCustom || config.payouts.some((t) => (t.collectorBoxes ?? 0) > 0);
  const structure = config.structure;
  const roundWord = config.format === "bo3" ? "matches" : "games";
  // Restates the event being priced, for the Results heading — the numbers
  // below are meaningless without it.
  const structureSummary =
    structure.kind === "rounds"
      ? `${structure.rounds} rounds played in full · ${config.format.toUpperCase()}`
      : `to ${structure.maxWins} wins or ${structure.maxLosses} losses · ${config.format.toUpperCase()}`;

  const stats: { label: string; value: string; hint: string; tone?: string }[] = [
    {
      label: "Expected net / event",
      value: gems2(result.meanNet),
      hint: `gems · ±${gems2(1.96 * result.stdErrNet)} (95% CI)`,
      tone: signClass(result.meanNet),
    },
    {
      label: "Expected gross",
      value: gems2(result.meanGross),
      hint: `gems + ${result.meanPacks.toFixed(2)} packs / event`,
    },
    {
      label: "ROI",
      value: pct(result.roi),
      hint: `of ${gems(config.entryCostGems)} gem entry`,
      tone: signClass(result.roi),
    },
    {
      label: "Break-even win rate",
      value: breakEven === null ? "—" : pct(breakEven, 2),
      hint: breakEvenHint,
    },
    {
      label: "P(profit)",
      value: pct(result.probProfit),
      hint: "of events end net positive",
    },
    {
      label: `${roundWord} / event`,
      value: result.meanRounds.toFixed(2),
      hint: `max ${maxRounds(structure)} · σ of net: ${gems2(result.stdDevNet)} gems`,
    },
  ];

  return (
    <div className="container-xl py-4">
      <header className="mb-4">
        <h1 className="h3 mb-1">MTGA Limited EV</h1>
        <p className="text-body-secondary mb-0">
          Monte-Carlo EV model for MTG Arena limited events — any win/loss
          structure, best-of-one or best-of-three.
        </p>
      </header>

      <div className="row g-3 align-items-start">
        <div className="col-lg-4 vstack gap-3">
          {/* Assumptions that hold whichever event you price. */}
          <div className="card">
            <div className="card-body">
              <h2 className="section-title">Global inputs</h2>

              <div className="mb-3">
                <label htmlFor={ids.winRate} className="form-label">
                  Expected win rate (per game){" "}
                  <span className="fw-semibold text-body">{pct(config.winRate)}</span>
                </label>
                <input
                  id={ids.winRate}
                  type="range"
                  className="form-range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={config.winRate}
                  onChange={(e) => set("winRate", Number(e.target.value))}
                />
                {config.format === "bo3" && (
                  <div className="form-text">
                    BO3 →{" "}
                    <span className="fw-semibold">{pct(matchWinRate(config), 2)}</span>{" "}
                    per match.
                  </div>
                )}
              </div>

              <div className="mb-3">
                <label htmlFor={ids.packValue} className="form-label">
                  Pack value (gems)
                  <InfoTip
                    label="About pack value"
                    content="How much are packs worth to you (in gems)? Default is based on duplicate protection for a complete set."
                  />
                </label>
                <NumberInput
                  id={ids.packValue}
                  min={0}
                  value={config.packValueGems}
                  onChange={(n) => set("packValueGems", n)}
                />
              </div>

              <div>
                <label htmlFor={ids.funValue} className="form-label">
                  Fun (gems / game)
                  <InfoTip
                    label="About the value of fun"
                    content="Priceless."
                  />
                </label>
                <input
                  id={ids.funValue}
                  className="form-control"
                  value="∞"
                  disabled
                  readOnly
                />
              </div>

              <button
                type="button"
                className="btn btn-outline-secondary w-100 mt-3"
                onClick={() => modal.current?.show()}
              >
                <i className="bi bi-gear me-1" aria-hidden="true" />
                Advanced
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h2 className="section-title">Event</h2>

              <div className="mb-3">
                <label htmlFor={ids.preset} className="form-label">
                  Event preset
                </label>
                <select
                  id={ids.preset}
                  className="form-select"
                  value={presetName}
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  {PRESETS.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                  {/* Ellipsis by convention: picking it puts you in an editor. */}
                  <option value={CUSTOM_PRESET}>{CUSTOM_PRESET}…</option>
                </select>
                {locked ? (
                  <div className="form-text">
                    Read-only. Choose Custom… to edit these values.
                  </div>
                ) : (
                  /*
                   * Loading a preset's numbers into a custom schedule is a rare
                   * enough move to keep quiet. The select resets to its
                   * placeholder after each use, and PRESETS never contains
                   * Custom, so it cannot copy from itself.
                   */
                  <select
                    className="form-select form-select-sm mt-2"
                    aria-label="Copy values from an event"
                    value=""
                    onChange={(e) => {
                      const preset = PRESETS.find((p) => p.name === e.target.value);
                      if (preset) setConfig(configFromPreset(preset, config));
                    }}
                  >
                    <option value="">Copy from…</option>
                    {PRESETS.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label htmlFor={ids.structure} className="form-label">
                    Structure
                  </label>
                  <select
                    id={ids.structure}
                    className="form-select"
                    disabled={locked}
                    value={structure.kind}
                    onChange={(e) =>
                      setStructure(
                        e.target.value === "rounds"
                          ? { kind: "rounds", rounds: 3 }
                          : { kind: "elimination", maxWins: 7, maxLosses: 3 },
                      )
                    }
                  >
                    <option value="elimination">Wins / losses</option>
                    <option value="rounds">Fixed rounds</option>
                  </select>
                </div>
                <div className="col-6">
                  <label htmlFor={ids.format} className="form-label">
                    Match format
                    <InfoTip
                      label="About match format"
                      content="Win rate is always entered per game. Best-of-three converts it to a match rate: 55% of games is 57.5% of matches."
                    />
                  </label>
                  <select
                    id={ids.format}
                    className="form-select"
                    disabled={locked}
                    value={config.format}
                    onChange={(e) => set("format", e.target.value as EventFormat)}
                  >
                    <option value="bo1">Best of 1</option>
                    <option value="bo3">Best of 3</option>
                  </select>
                </div>
              </div>

              <div className="row g-2 mb-3">
                {structure.kind === "elimination" ? (
                  <>
                    <div className="col-6">
                      <label htmlFor={ids.maxWins} className="form-label">
                        Wins to finish
                      </label>
                      <NumberInput
                        id={ids.maxWins}
                        disabled={locked}
                        min={1}
                        value={structure.maxWins}
                        onChange={(n) =>
                          setStructure({ ...structure, maxWins: clampInt(n, 1, 20) })
                        }
                      />
                    </div>
                    <div className="col-6">
                      <label htmlFor={ids.maxLosses} className="form-label">
                        Losses to bust
                      </label>
                      <NumberInput
                        id={ids.maxLosses}
                        disabled={locked}
                        min={1}
                        value={structure.maxLosses}
                        onChange={(n) =>
                          setStructure({ ...structure, maxLosses: clampInt(n, 1, 20) })
                        }
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-6">
                    <label htmlFor={ids.rounds} className="form-label">
                      Rounds
                    </label>
                    <NumberInput
                      id={ids.rounds}
                      disabled={locked}
                      min={1}
                      value={structure.rounds}
                      onChange={(n) =>
                        setStructure({ kind: "rounds", rounds: clampInt(n, 1, 20) })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label htmlFor={ids.entry} className="form-label">
                    Entry cost (gems)
                  </label>
                  <NumberInput
                    id={ids.entry}
                    disabled={locked}
                    min={0}
                    value={config.entryCostGems}
                    onChange={(n) => set("entryCostGems", n)}
                  />
                </div>
              </div>

              <h3 className="section-title mt-4">
                Payout schedule
                <InfoTip
                  label="About the payout schedule"
                  content="Rows follow the structure. Lowering the win ceiling drops the rows above it; re-select a preset to refill the table."
                />
              </h3>
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th scope="col">Wins</th>
                    <th scope="col" className="text-end">
                      Gems
                    </th>
                    <th scope="col" className="text-end">
                      Packs
                    </th>
                    {showPlayInPoints && (
                      <th scope="col" className="text-end">
                        Points
                      </th>
                    )}
                    {showPlayBoxes && (
                      <th scope="col" className="text-end">
                        Play box
                      </th>
                    )}
                    {showCollectorBoxes && (
                      <th scope="col" className="text-end">
                        Coll. box
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {config.payouts.map((t) => (
                    <tr key={t.wins}>
                      <td className="fw-semibold text-primary">{t.wins}</td>
                      <td>
                        <NumberInput
                          className="form-control form-control-sm text-end"
                          disabled={locked}
                          min={0}
                          value={t.gems}
                          onChange={(n) => setTier(t.wins, { gems: n })}
                        />
                      </td>
                      <td>
                        <NumberInput
                          className="form-control form-control-sm text-end"
                          disabled={locked}
                          min={0}
                          value={t.packs}
                          onChange={(n) => setTier(t.wins, { packs: n })}
                        />
                      </td>
                      {showPlayInPoints && (
                        <td>
                          <NumberInput
                            className="form-control form-control-sm text-end"
                            disabled={locked}
                            min={0}
                            value={t.playInPoints ?? 0}
                            onChange={(n) => setTier(t.wins, { playInPoints: n })}
                          />
                        </td>
                      )}
                      {showPlayBoxes && (
                        <td>
                          <NumberInput
                            className="form-control form-control-sm text-end"
                            disabled={locked}
                            min={0}
                            value={t.playBoxes ?? 0}
                            onChange={(n) => setTier(t.wins, { playBoxes: n })}
                          />
                        </td>
                      )}
                      {showCollectorBoxes && (
                        <td>
                          <NumberInput
                            className="form-control form-control-sm text-end"
                            disabled={locked}
                            min={0}
                            value={t.collectorBoxes ?? 0}
                            onChange={(n) => setTier(t.wins, { collectorBoxes: n })}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card">
            <div className="card-body">
              <h2 className="section-title d-flex flex-wrap align-items-baseline gap-2">
                Results
                <span className="section-note">
                  {presetName} · {structureSummary}
                </span>
              </h2>

              <div className="row g-2">
                {stats.map((s) => (
                  <div key={s.label} className="col-6 col-xl-4">
                    <div className="stat h-100">
                      <div className="stat-label">{s.label}</div>
                      <div className={`stat-value ${s.tone ?? ""}`}>{s.value}</div>
                      <div className="stat-hint">{s.hint}</div>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="section-title mt-4">Distribution of outcomes by wins</h3>
              <div className="vstack gap-1">
                {result.buckets.map((b) => (
                  <div key={b.wins} className="d-flex align-items-center gap-2">
                    <span className="bar-label text-body-secondary small">
                      {b.wins}W
                    </span>
                    <div className="progress flex-grow-1 position-relative">
                      <div
                        className="progress-bar"
                        role="progressbar"
                        style={{ width: `${(b.probability / maxProb) * 100}%` }}
                        aria-valuenow={Math.round(b.probability * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${b.wins} wins`}
                      />
                      <span
                        className="exact-tick"
                        style={{ left: `${(b.exactProbability / maxProb) * 100}%` }}
                        title={`exact: ${pct(b.exactProbability, 2)}`}
                      />
                    </div>
                    <span className="bar-value text-body-secondary small text-end">
                      {pct(b.probability, 2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="form-text">
                Bars are the simulation; the tick mark is the closed-form probability.
              </div>

              <h3 className="section-title mt-4">Outcome table</h3>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Wins</th>
                      <th scope="col" className="text-end">
                        Events
                      </th>
                      <th scope="col" className="text-end">
                        Simulated
                      </th>
                      <th scope="col" className="text-end">
                        Exact
                      </th>
                      <th scope="col" className="text-end">
                        Packs
                      </th>
                      <th scope="col" className="text-end">
                        Gross
                      </th>
                      <th scope="col" className="text-end">
                        Net
                      </th>
                      <th scope="col" className="text-end">
                        Contribution to EV
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.buckets.map((b) => (
                      <tr key={b.wins}>
                        <td className="fw-semibold text-primary">{b.wins}</td>
                        <td className="text-end">{b.count.toLocaleString()}</td>
                        <td className="text-end">{pct(b.probability, 2)}</td>
                        <td className="text-end text-body-secondary">
                          {pct(b.exactProbability, 2)}
                        </td>
                        <td className="text-end">{b.packs}</td>
                        <td className="text-end">{gems(b.grossGems)}</td>
                        <td className={`text-end ${signClass(b.netGems)}`}>
                          {gems(b.netGems)}
                        </td>
                        <td
                          className={`text-end ${signClass(b.probability * b.netGems)}`}
                        >
                          {gems2(b.probability * b.netGems)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-top">
                      <td colSpan={7} className="fw-semibold">
                        Expected net per event
                      </td>
                      <td className={`text-end fw-semibold ${signClass(result.meanNet)}`}>
                        {gems2(result.meanNet)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <h3 className="section-title mt-4">Spread of a single event (net gems)</h3>
              <div className="row g-2">
                {(
                  [
                    ["p5", result.percentiles.p5],
                    ["p25", result.percentiles.p25],
                    ["median", result.percentiles.p50],
                    ["p75", result.percentiles.p75],
                    ["p95", result.percentiles.p95],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="col">
                    <div className="stat h-100">
                      <div className="stat-label">{label}</div>
                      <div className={`fw-semibold ${signClass(value)}`}>
                        {gems(value)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="form-text">
                Over {result.trials.toLocaleString()} events, total net ={" "}
                <span className={`fw-semibold ${signClass(result.totalNet)}`}>
                  {gems(result.totalNet)}
                </span>{" "}
                gems.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal fade" tabIndex={-1} ref={modalEl} aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h6 mb-0">Advanced settings</h2>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <div className="row g-2">
                <div className="col-6">
                  <label htmlFor={ids.trials} className="form-label">
                    Simulated events (N)
                    <InfoTip
                      label="About simulated events"
                      content="More events narrow the confidence interval on the simulated mean. The exact column is computed in closed form, not sampled."
                    />
                  </label>
                  <NumberInput
                    id={ids.trials}
                    min={1}
                    value={trials}
                    onChange={(n) => setTrials(clampInt(n, 1, 5_000_000))}
                  />
                </div>
                <div className="col-6">
                  <label htmlFor={ids.seed} className="form-label">
                    Seed
                    <InfoTip
                      label="About the seed"
                      content="Changes which sample you get, not the distribution it is drawn from. The same seed always reproduces the same run."
                    />
                  </label>
                  <NumberInput id={ids.seed} value={seed} onChange={setSeed} />
                </div>
                <div className="col-12">
                  <label htmlFor={ids.playInValue} className="form-label">
                    Play-in point value (gems)
                    <InfoTip
                      label="About play-in point value"
                      content="Priced off what the points buy: 20 of them cover an Arena Open play-in that otherwise costs 4,000 gems, so 200 a point."
                    />
                  </label>
                  <NumberInput
                    id={ids.playInValue}
                    min={0}
                    value={config.playInPointValueGems}
                    onChange={(n) => set("playInPointValueGems", n)}
                  />
                </div>
                <div className="col-6">
                  <label htmlFor={ids.playBoxValue} className="form-label">
                    Play box value (gems)
                    <InfoTip
                      label="About play box value"
                      content="Wizards' own substitution figure of $209.70 a box, converted at 400 gems to the dollar. Street prices are lower — nearer 50,000 gems if you would sell it."
                    />
                  </label>
                  <NumberInput
                    id={ids.playBoxValue}
                    min={0}
                    value={config.playBoxValueGems}
                    onChange={(n) => set("playBoxValueGems", n)}
                  />
                </div>
                <div className="col-6">
                  <label htmlFor={ids.collectorBoxValue} className="form-label">
                    Collector box value (gems)
                    <InfoTip
                      label="About collector box value"
                      content="MSRP of a 12-pack display at $39.99 a booster, converted at 400 gems to the dollar."
                    />
                  </label>
                  <NumberInput
                    id={ids.collectorBoxValue}
                    min={0}
                    value={config.collectorBoxValueGems}
                    onChange={(n) => set("collectorBoxValueGems", n)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" data-bs-dismiss="modal">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
