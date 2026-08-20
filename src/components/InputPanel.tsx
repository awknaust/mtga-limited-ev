import { useEffect, useId, useMemo, useState } from "react";

import { EventFields } from "./EventFields";
import { InfoTip } from "./InfoTip";
import {
  GemInput,
  GoldInput,
  MoneyInput,
  NumberInput,
  PointsInput,
  clampInt,
} from "./Inputs";
import { approx, money, otherUnit, pct, type Money, type Unit } from "../format";
import { stepWinRate } from "../winRate";
import {
  CUSTOM_PRESET,
  MASTERY_TRACKS,
  PRESETS,
  matchWinRate,
  maxEventsFor,
  type EventConfig,
  type MasteryTrack,
} from "../lib";
import { wrongNumberIssueUrl } from "../report";
import { SIM_LIMITS } from "../state";

/*
 * What the win rate's step buttons move by, in percentage points, grouped as
 * the two pairs they render in. The fine step is the slider's own — 0.005 of a
 * rate is half a point — so the buttons hand a mouse the granularity the arrow
 * keys already had.
 */
const WIN_RATE_STEPS = [
  [-5, -0.5],
  [0.5, 5],
] as const;

/**
 * Everything the reader sets, in the column beside the results.
 *
 * Three cards, in the order the page is read: what holds whichever event is
 * priced — the win rate and the bankroll — then the event itself, then the
 * mastery season. The two editors are dialogs the page raises, so this column
 * is a record throughout: the fields here are locked whichever event is
 * chosen, which is what spares them the question of what a half-edited Premier
 * Draft would mean.
 */
export function InputPanel({
  config,
  onConfigChange,
  m,
  unit,
  onUnitChange,
  gemsPerUsd,
  startValue,
  startingGems,
  onStartingGemsChange,
  startingGold,
  onStartingGoldChange,
  startingPlayInPoints,
  onStartingPlayInPointsChange,
  maxGames,
  onMaxGamesChange,
  presetName,
  onPresetChange,
  masteryTrack,
  onMasterySlugChange,
  onEditEvent,
  onAdvanced,
  shareUrl,
}: {
  config: EventConfig;
  onConfigChange: (config: EventConfig) => void;
  m: Money;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  /** Only to price the balance in the unit that is not showing — see below. */
  gemsPerUsd: number;
  /**
   * The balances as the one gem-equivalent figure a run is judged against.
   * Computed by `App`, which needs the same figure for the results.
   */
  startValue: number;
  startingGems: number;
  onStartingGemsChange: (n: number) => void;
  startingGold: number;
  onStartingGoldChange: (n: number) => void;
  startingPlayInPoints: number;
  onStartingPlayInPointsChange: (n: number) => void;
  maxGames: number;
  onMaxGamesChange: (n: number) => void;
  presetName: string;
  /** Picking a preset can raise the top-up prompt, so `App` handles it. */
  onPresetChange: (name: string) => void;
  masteryTrack: MasteryTrack;
  onMasterySlugChange: (slug: string) => void;
  /** Raises the custom event's editor, which only Custom offers. */
  onEditEvent: () => void;
  /** Raises the values and assumptions dialog. */
  onAdvanced: () => void;
  /**
   * The page's own link as it stands, for the wrong-number report to carry.
   * `App` builds it from the same state the address bar shows, rather than
   * this reading `window.location`, which is written after the render that
   * would read it and so is one edit behind.
   */
  shareUrl: string;
}) {
  const set = <K extends keyof EventConfig>(key: K, value: EventConfig[K]) =>
    onConfigChange({ ...config, [key]: value });

  /*
   * The same amount priced in the unit that is not showing, at the same rate.
   * Only the starting balance takes it: that figure is the one compared with
   * what a top-up would cost, so it says both what Arena would show and what
   * the store would charge, whichever unit the toggle is on.
   */
  const alt = useMemo(() => money(otherUnit(unit), gemsPerUsd), [unit, gemsPerUsd]);
  const gemsEq = (g: number): string => approx(m.fmt(g));
  const altEq = (g: number): string => approx(alt.fmt(g));

  /*
   * The games budget read back in the units the results and the calendar
   * speak. The events figure is quoted at an even 50% game rather than at
   * the reader's own rate, so it holds still under the win-rate slider —
   * the cap the simulation actually enforces (`maxEventsFor` at the
   * configured rate) tracks the rate and moves *against* it, a better
   * player's elimination runs being longer, which reads as a bug while
   * dragging. "Around" is what carries that gap. A fixed-rounds event is
   * the same number of games whoever plays, so its count is stated plainly
   * and the two readings agree exactly. No days reading when the day knob
   * is zero: with no pace stated, a budget is not an amount of time.
   */
  const budgetEvents = maxEventsFor({ ...config, winRate: 0.5 }, maxGames);
  const exactCount = config.structure.kind === "rounds";
  const budgetDays = config.gamesPerDay > 0 ? maxGames / config.gamesPerDay : null;

  /*
   * A preset describes a real event, so its definition is read-only wherever it
   * is shown; Custom is the one you own, and the dialog is where it is edited.
   */
  const isCustom = presetName === CUSTOM_PRESET;
  /*
   * Whether the event's own fields are unfolded. Deliberately outside the share
   * state: a link should carry the model, not whether the sender happened to
   * have a panel folded open.
   */
  const [eventDetailsOpen, setEventDetailsOpen] = useState(isCustom);
  /*
   * Switching to Custom opens the panel. Not because it is the editor — that
   * moved into a dialog — but because it is the record of the one ladder you
   * are about to change, and seeing an edit land in it is what makes the
   * dialog worth trusting. Switching back does not close it: having opened
   * the schedule to read it, you probably want it open for the next preset
   * too.
   */
  useEffect(() => {
    if (isCustom) setEventDetailsOpen(true);
  }, [isCustom]);

  /*
   * A round is a match in every event here, whether that match is one game or
   * up to three, so everything the user reads is in matches and nothing needs
   * converting. The slider sets the rate the model runs on directly.
   */
  const roundWinRate = matchWinRate(config);
  /*
   * What the win rate's step buttons announce. The slider's own aria-valuetext
   * covers dragging and the arrow keys, but a button press leaves focus on the
   * button, where nothing speaks the value it just moved. Kept as its own live
   * region rather than put on the visible readout, which would then announce
   * over the slider on every drag.
   */
  const [winRateStepped, setWinRateStepped] = useState("");
  const stepWin = (points: number) => {
    const next = stepWinRate(roundWinRate, points);
    set("winRate", next);
    setWinRateStepped(`Match win rate ${pct(next)}`);
  };

  const uid = useId();
  const ids = {
    winRate: `${uid}-win-rate`,
    startGems: `${uid}-start-gems`,
    startGold: `${uid}-start-gold`,
    startPoints: `${uid}-start-points`,
    maxGames: `${uid}-max-games`,
    preset: `${uid}-preset`,
    masterySeason: `${uid}-mastery-season`,
    masteryPrice: `${uid}-mastery-price`,
  };

  return (
    <div className="col-lg-4 vstack gap-3">
      {/* Assumptions that hold whichever event you price. */}
      <div className="card">
        <div className="card-body">
          <h2 className="section-title d-flex flex-wrap align-items-center justify-content-between gap-2">
            Your inputs
            {/* Display only — everything is stored and simulated in gems. */}
            <span
              className="btn-group btn-group-sm"
              role="group"
              aria-label="Display unit"
            >
              {(["gems", "usd"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  className={`btn ${unit === u ? "btn-primary" : "btn-outline-secondary"}`}
                  aria-pressed={unit === u}
                  onClick={() => onUnitChange(u)}
                >
                  {u === "gems" ? "Gems" : "USD"}
                </button>
              ))}
            </span>
          </h2>

          {/*
            Reads in matches, which is the unit every event here runs on —
            a best-of-one match is a single game, a best-of-three is up to
            three, and the win and loss counters move per match either way.
            So the slider sets the model's rate directly, with no
            conversion between the two formats.
          */}
          <div className="mb-3">
            <label htmlFor={ids.winRate} className="form-label">
              Match win rate{" "}
              <span className="win-rate-value text-body">{pct(roundWinRate)}</span>
              <InfoTip
                label="About the win rate"
                content="Your chance of winning one match. In best-of-three that is the match, not each game; either way it is the rate the event's win and loss counters move at."
              />
            </label>
            <input
              id={ids.winRate}
              type="range"
              className="form-range win-rate-slider"
              min={0}
              max={1}
              step={0.005}
              value={roundWinRate}
              // The value is a fraction and the label reads a percentage;
              // without this a screen reader announces "0.55".
              aria-valuetext={pct(roundWinRate)}
              onChange={(e) =>
                set("winRate", Number(e.target.value))
              }
            />
            {/*
              Held to the slider's two ends, so the pair that walks the
              value down sits at the end it moves towards. The labels read
              in percentage points, matching the readout above rather than
              the 0..1 fraction underneath.
            */}
            <div className="d-flex justify-content-between win-rate-steps">
              {WIN_RATE_STEPS.map((pair) => (
                <span
                  key={pair[0]}
                  className="btn-group btn-group-sm"
                  role="group"
                >
                  {pair.map((points) => (
                    <button
                      key={points}
                      type="button"
                      className="btn btn-outline-secondary"
                      aria-label={`${points > 0 ? "Increase" : "Decrease"} win rate by ${Math.abs(points)} percentage points`}
                      // One expression for both ends: a step with nowhere
                      // to go is a step already at the bound.
                      disabled={
                        stepWinRate(roundWinRate, points) === roundWinRate
                      }
                      onClick={() => stepWin(points)}
                    >
                      {points > 0 ? "+" : "−"}
                      {Math.abs(points)}
                    </button>
                  ))}
                </span>
              ))}
            </div>
            <span className="visually-hidden" aria-live="polite">
              {winRateStepped}
            </span>
          </div>

          {/* The inputs the Bankroll tab runs on, boxed under its name. */}
          <div className="adv-group mb-3">
            <h3 className="section-title">Bankroll</h3>
            <div className="row g-2">
              <div className="col-6">
                <label htmlFor={ids.startGems} className="form-label">
                  Starting {m.label}
                </label>
                <MoneyInput
                  id={ids.startGems}
                  m={m}
                  gemValue={startingGems}
                  onChange={onStartingGemsChange}
                />
              </div>
              <div className="col-6">
                <label htmlFor={ids.startGold} className="form-label">
                  Starting gold
                </label>
                <GoldInput
                  id={ids.startGold}
                  value={startingGold}
                  onChange={onStartingGoldChange}
                />
              </div>
              {/*
                Full width beneath the two currencies rather than beside
                them: it is the balance most readers have none of, and
                narrowing the two they do have to make room would be the
                wrong trade.
              */}
              <div className="col-12">
                <label htmlFor={ids.startPoints} className="form-label">
                  Starting play-in points
                  <InfoTip
                    label="About play-in points"
                    content="Points you have banked. Twenty enter a Qualifier Play-In, and the simulation spends them before gold or gems since nothing else in Arena takes them."
                  />
                </label>
                <PointsInput
                  id={ids.startPoints}
                  value={startingPlayInPoints}
                  onChange={onStartingPlayInPointsChange}
                />
              </div>
              {/*
                The balances as the one figure the results judge runs
                against, priced both ways — the gems Arena would show and
                the dollars they would cost, since deciding whether a
                bankroll is worth playing means weighing it against what
                refilling it would charge.
              */}
              <div className="col-12 form-text mt-0">
                Together worth {gemsEq(startValue)} or {altEq(startValue)}
              </div>
              <div className="col-12">
                <label htmlFor={ids.maxGames} className="form-label">
                  Stop after (games)
                  <InfoTip
                    label="About the games budget"
                    content="The most games you are willing to play — games take time, and the bankroll simulation needs a stopping point. Games per day is adjusted in Values & assumptions."
                  />
                </label>
                <NumberInput
                  id={ids.maxGames}
                  min={1}
                  value={maxGames}
                  onChange={(n) => onMaxGamesChange(clampInt(n, 1, SIM_LIMITS.maxGames))}
                />
                {/* The budget in the two units a reader can check it in —
                    see budgetEvents above for the phrasing. */}
                <div className="form-text">
                  {exactCount ? "" : "Around "}
                  {budgetEvents} {budgetEvents === 1 ? "event" : "events"}
                  {budgetDays !== null &&
                    (budgetDays < 1
                      ? ", or under a day of play"
                      : `, or about ${Math.round(budgetDays)} ${Math.round(budgetDays) === 1 ? "day" : "days"} of play`)}
                </div>
              </div>
            </div>
          </div>

          {/* Opens the dialog the code and `share.ts` still call
              "advanced" — reward values, win rate confidence, gold, the
              dollar rate and the simulation's size and seed. */}
          <button
            type="button"
            className="btn btn-outline-secondary w-100"
            onClick={() => onAdvanced()}
          >
            <i className="bi bi-gear me-1" aria-hidden="true" />
            Values &amp; assumptions
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
              onChange={(e) => onPresetChange(e.target.value)}
            >
              {PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
              {/* Ellipsis by convention: picking it puts you in an editor. */}
              <option value={CUSTOM_PRESET}>{CUSTOM_PRESET}…</option>
            </select>
            {/* The only way into the editor, and shown only where there
                is something to edit: a preset's numbers are the event's
                own, and the panel below reads the same either way. */}
            {isCustom && (
              <button
                type="button"
                className="btn btn-outline-secondary w-100 mt-2"
                onClick={() => onEditEvent()}
              >
                <i className="bi bi-pencil me-1" aria-hidden="true" />
                Edit custom event
              </button>
            )}
          </div>

          {/*
           * Collapsed by default: every field in here is read-only
           * reference, on Custom as much as on a preset, and the payout
           * table is the tallest thing in the column. Custom opens it
           * unprompted, since there it is the record of a ladder that is
           * about to be edited.
           */}
          <details
            className="event-details"
            open={eventDetailsOpen}
            onToggle={(e) => setEventDetailsOpen(e.currentTarget.open)}
          >
            <summary className="event-details-summary">
              Entry cost and payout schedule
            </summary>
            {/* Locked whichever event is chosen. The editor is the dialog
                the button above opens, and this is what it wrote. */}
            <EventFields config={config} locked onChange={onConfigChange} />
            {/*
              A preset's ladder is transcribed, not published, so the reader
              looking at it is the check it gets; this is the shortest way
              from noticing to telling, and it arrives with the event and
              this page's link filled in. Not on Custom, whose numbers are
              the reader's own.
            */}
            {!isCustom && (
              <p className="form-text text-center mb-0 mt-2">
                <a
                  className="link-secondary"
                  href={wrongNumberIssueUrl({
                    eventName: presetName,
                    link: shareUrl,
                  })}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="bi bi-flag me-1" aria-hidden="true" />
                  Report a wrong number
                </a>
              </p>
            )}
          </details>
        </div>
      </div>

      {/*
        Beside the event rather than on the tab it feeds, so every input the
        page has is in one column. The cost is disabled because it is the
        season's own figure — Wizards sets it per pass, and it has moved
        before — but it is shown rather than hidden, since it is the thing
        the Mastery tab prices everything against.
      */}
      <div className="card">
        <div className="card-body">
          <h2 className="section-title">Mastery</h2>

          <div className="row g-2">
            <div className="col-7">
              <label htmlFor={ids.masterySeason} className="form-label">
                Mastery season
              </label>
              <select
                id={ids.masterySeason}
                className="form-select"
                value={masteryTrack.slug}
                onChange={(e) => onMasterySlugChange(e.target.value)}
              >
                {MASTERY_TRACKS.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-5">
              <label htmlFor={ids.masteryPrice} className="form-label">
                Pass cost
              </label>
              {/* The payout editor's gem field, so a gem amount looks the
                  same wherever it is entered or shown. */}
              <GemInput
                id={ids.masteryPrice}
                disabled
                value={masteryTrack.priceGems}
                onChange={() => {}}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
