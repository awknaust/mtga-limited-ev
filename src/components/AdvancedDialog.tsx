import { useId, useState } from "react";

import { Dialog, DialogDone } from "./Dialog";
import { InfoTip } from "./InfoTip";
import {
  GemInput,
  GoldInput,
  MoneyInput,
  NumberInput,
  UsdInput,
  clampInt,
} from "./Inputs";
import { approx, pct, type Money } from "../format";
import {
  CREDIBLE_LEVEL,
  goldPerEvent,
  goldValueGems,
  meanEventsPerDay,
  type EventConfig,
} from "../lib";
import { SIM_LIMITS } from "../state";

/**
 * What the confidence selector offers, shortest record first.
 *
 * Twenty is a few drafts, a hundred is a season's worth, five hundred is enough
 * that the prior stops mattering at all. Infinity is stored as 0 and reads as
 * the limit of the same idea: a record long enough to leave nothing in doubt,
 * so the ranges collapse to the single figures they are drawn around.
 */
const CONFIDENCE_CHOICES = [
  { matches: 20, label: "20" },
  { matches: 100, label: "100" },
  { matches: 500, label: "500" },
  { matches: 0, label: "∞" },
];

/**
 * The dialog the code and `share.ts` still call "advanced": every rate a
 * reward is priced at, how much of a guess the win rate is, the gold
 * assumptions, the dollar conversion, and the bankroll simulation's size and
 * seed.
 *
 * These are the assumptions behind every figure on the page rather than the
 * question being asked of it, which is why they are a click away — and why the
 * dialog being open holds the simulation: its edits are meant to apply
 * together, not one recompute per keystroke.
 */
export function AdvancedDialog({
  ref,
  config,
  onConfigChange,
  m,
  rateBand,
  gemsPerUsd,
  onGemsPerUsdChange,
  bankrollRuns,
  onBankrollRunsChange,
  seed,
  onSeedChange,
  isDefault,
  onReset,
}: {
  ref?: React.Ref<HTMLDivElement>;
  config: EventConfig;
  onConfigChange: (config: EventConfig) => void;
  m: Money;
  /** The win rate's credible interval, or null where it is called certain. */
  rateBand: [lo: number, hi: number] | null;
  gemsPerUsd: number;
  onGemsPerUsdChange: (n: number) => void;
  bankrollRuns: number;
  onBankrollRunsChange: (n: number) => void;
  seed: number;
  onSeedChange: (n: number) => void;
  /** Whether anything in here has been changed from the build's own values. */
  isDefault: boolean;
  onReset: () => void;
}) {
  const set = <K extends keyof EventConfig>(key: K, value: EventConfig[K]) =>
    onConfigChange({ ...config, [key]: value });
  /** Gem-equivalent, for the two figures this dialog derives rather than takes. */
  const gemsEq = (g: number): string => approx(m.fmt(g));

  /*
   * What the reset announces. The fields it clears sit further up the dialog
   * and some of them are scrolled off it, so the press has a visible answer and
   * no audible one — the button disabling itself is not something a screen
   * reader is told about either.
   */
  const [resetSaid, setResetSaid] = useState("");

  const uid = useId();
  const ids = {
    confMatches: `${uid}-conf-matches`,
    draftPackValue: `${uid}-draft-pack-value`,
    packValue: `${uid}-pack-value`,
    mythicPackValue: `${uid}-mythic-pack-value`,
    cubePackValue: `${uid}-cube-pack-value`,
    playInValue: `${uid}-play-in-value`,
    qualifierTokenValue: `${uid}-qualifier-token-value`,
    funValue: `${uid}-fun-value`,
    playBoxValue: `${uid}-play-box-value`,
    collectorBoxValue: `${uid}-collector-box-value`,
    boxMarkdown: `${uid}-box-markdown`,
    draftTokenValue: `${uid}-draft-token-value`,
    mythicIcrValue: `${uid}-mythic-icr-value`,
    rareCardValue: `${uid}-rare-card-value`,
    uncommonIcrValue: `${uid}-uncommon-icr-value`,
    dailyWinIcrValue: `${uid}-daily-win-icr-value`,
    orbValue: `${uid}-orb-value`,
    cardStyleValue: `${uid}-card-style-value`,
    sleeveValue: `${uid}-sleeve-value`,
    avatarValue: `${uid}-avatar-value`,
    companionValue: `${uid}-companion-value`,
    goldPerDay: `${uid}-gold-per-day`,
    gamesPerDay: `${uid}-games-per-day`,
    goldRate: `${uid}-gold-rate`,
    gemsPerUsd: `${uid}-gems-per-usd`,
    bankrollRuns: `${uid}-bankroll-runs`,
    seed: `${uid}-seed`,
  };

  return (
    <Dialog
      ref={ref}
      title="Values & assumptions"
      footer={
        <>
          {/*
            Held to the far end, away from Done: one button leaves the dialog
            and the other changes what is in it, and they should not be
            adjacent. Disabled when there is nothing left to restore, which is
            also what tells you the dialog is untouched — the fields themselves
            never say so, since a default is just a number sitting in a box.
          */}
          <button
            type="button"
            className="btn btn-outline-secondary me-auto"
            disabled={isDefault}
            onClick={() => {
              onReset();
              setResetSaid("Values and assumptions reset to defaults");
            }}
          >
            <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true" />
            Reset to defaults
          </button>
          <span className="visually-hidden" aria-live="polite">
            {resetSaid}
          </span>
          <DialogDone />
        </>
      }
    >
      <div className="adv-group mb-3">
        <h3 className="section-title">Win rate confidence</h3>
        <div className="row g-2">
          <div className="col-12">
            <label htmlFor={ids.confMatches} className="form-label">
              Matches played
              <InfoTip
                label="About matches played"
                content="How many matches your win rate estimate is based on. Fewer means less certain outcomes; infinity means you know it exactly, and every range collapses to a single figure."
              />
            </label>
            {/*
              A pill per choice rather than a menu: there are four, they
              are ordered, and the whole range being visible is what
              makes it obvious the setting is a spectrum from a guess to
              a certainty. `id` sits on the group's first control so the
              label above still targets something focusable.
            */}
            <div
              className="btn-group w-100"
              role="group"
              aria-label="Matches played"
            >
              {CONFIDENCE_CHOICES.map((choice, i) => (
                <button
                  key={choice.matches}
                  id={i === 0 ? ids.confMatches : undefined}
                  type="button"
                  className={`btn ${
                    config.winRateMatches === choice.matches
                      ? "btn-primary"
                      : "btn-outline-secondary"
                  }`}
                  aria-pressed={config.winRateMatches === choice.matches}
                  onClick={() => set("winRateMatches", choice.matches)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
          <div className="col-12">
            <div className="form-text mt-0">
              {rateBand
                ? `Your true win rate is in ${pct(rateBand[0])} to ${pct(rateBand[1])}, with ${pct(CREDIBLE_LEVEL, 0)} probability.`
                : "An exactly known win rate, so every figure below is a single number."}
            </div>
          </div>
        </div>
      </div>

      {/*
        Every rate a reward is priced at, event and mastery alike. The
        event ladders' rewards come first; the mastery track's follow,
        and its last five — the orb and the four cosmetics — are zero
        by default because nothing in Arena converts them to currency.
        One button zeroes the lot, cosmetics included: it says "these",
        and a field the reader has typed into is one of these.
      */}
      <div className="adv-group mb-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h3 className="section-title mb-0">Reward values</h3>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() =>
              onConfigChange({
                ...config,
                draftPackValueGems: 0,
                packValueGems: 0,
                mythicPackValueGems: 0,
                cubePackValueGems: 0,
                playInPointValueGems: 0,
                qualifierTokenValueGems: 0,
                playBoxValueGems: 0,
                collectorBoxValueGems: 0,
                draftTokenValueGems: 0,
                mythicIcrValueGems: 0,
                rareCardValueGems: 0,
                uncommonIcrValueGems: 0,
                dailyWinIcrValueGems: 0,
                orbValueGems: 0,
                cardStyleValueGems: 0,
                sleeveValueGems: 0,
                avatarValueGems: 0,
                companionValueGems: 0,
              })
            }
          >
            Zero these out
          </button>
        </div>
        <div className="row g-2">
          <div className="col-6">
            <label htmlFor={ids.draftPackValue} className="form-label">
              Draft pack value ({m.label})
              <InfoTip
                label="About draft pack value"
                content="What one pack of kept draft cards is worth to you. Default: Arena's duplicate-protection payout on a complete set, about 23 gems."
              />
            </label>
            <MoneyInput
            id={ids.draftPackValue}
            m={m}
            gemValue={config.draftPackValueGems}
            onChange={(n) => set("draftPackValueGems", n)}
          />
          </div>
          <div className="col-6">
            <label htmlFor={ids.packValue} className="form-label">
              Pack value ({m.label})
              <InfoTip
                label="About pack value"
                content="What one pack won as a reward is worth to you. Default: Arena's duplicate-protection payout on a complete set."
              />
            </label>
            <MoneyInput
            id={ids.packValue}
            m={m}
            gemValue={config.packValueGems}
            onChange={(n) => set("packValueGems", n)}
          />
          </div>
          <div className="col-6">
            <label htmlFor={ids.mythicPackValue} className="form-label">
              Mythic pack value ({m.label})
              <InfoTip
                label="About mythic pack value"
                content="What one mythic pack is worth to you. Its rare slot is always a mythic rare rather than the usual rare-or-mythic mix."
              />
            </label>
            <MoneyInput
            id={ids.mythicPackValue}
            m={m}
            gemValue={config.mythicPackValueGems}
            onChange={(n) => set("mythicPackValueGems", n)}
          />
          </div>
          <div className="col-6">
            <label htmlFor={ids.cubePackValue} className="form-label">
              Cube pack value ({m.label})
              <InfoTip
                label="About cube pack value"
                content="What one Cube Prize Pack is worth to you. Three of its nine cards are rare or better, one of them from the cube bonus sheet. The cube drafts pay these instead of packs."
              />
            </label>
            <MoneyInput
            id={ids.cubePackValue}
            m={m}
            gemValue={config.cubePackValueGems}
            onChange={(n) => set("cubePackValueGems", n)}
          />
          </div>
          <div className="col-6">
            <label htmlFor={ids.playInValue} className="form-label">
              Play-in point value ({m.label})
              <InfoTip
                label="About play-in point value"
                content="Priced by what the points buy: 20 cover a Qualifier Play-In that otherwise costs 4,000 gems, so 200 a point."
              />
            </label>
            <MoneyInput
            id={ids.playInValue}
            m={m}
            gemValue={config.playInPointValueGems}
            onChange={(n) => set("playInPointValueGems", n)}
          />
          </div>
          <div className="col-6">
            <label htmlFor={ids.qualifierTokenValue} className="form-label">
              Qualifier token value ({m.label})
              <InfoTip
                label="About qualifier token value"
                content="What a Qualifier Weekend seat is worth to you. Zero by default because nothing sells one. Day One pays 500 to 12,000 gems by wins, about 4,830 at a 55% win rate."
              />
            </label>
            <MoneyInput
              id={ids.qualifierTokenValue}
              m={m}
              gemValue={config.qualifierTokenValueGems}
              onChange={(n) => set("qualifierTokenValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.funValue} className="form-label">
              Fun (gems / game)
              <InfoTip label="About the value of fun" content="Priceless." />
            </label>
            <input
              id={ids.funValue}
              className="form-control"
              value="priceless"
              disabled
              readOnly
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.playBoxValue} className="form-label">
              Generic play box value (USD)
              <InfoTip
                label="About generic play box value"
                content="What a Play Booster box is worth when the payout names no set: an average street price across three recent Standard sets. A payout naming a set uses that set's own market price. Zero here values every box at nothing, named or not."
              />
            </label>
            <UsdInput
              id={ids.playBoxValue}
              gemsPerUsd={gemsPerUsd}
              gemValue={config.playBoxValueGems}
              onChange={(n) => set("playBoxValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.collectorBoxValue} className="form-label">
              Generic collector box value (USD)
              <InfoTip
                label="About generic collector box value"
                content="What a Collector Booster box is worth when the payout names no set. Prices vary widely by set and trade well above the $479.88 MSRP; a payout naming a set uses that set's own price."
              />
            </label>
            <UsdInput
              id={ids.collectorBoxValue}
              gemsPerUsd={gemsPerUsd}
              gemValue={config.collectorBoxValueGems}
              onChange={(n) => set("collectorBoxValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.boxMarkdown} className="form-label">
              Box markdown (%)
              <InfoTip
                label="About box markdown"
                content="How far under market price selling a box actually pays. Taken off every box price, whether the payout names a set or not. Default: 15%, about what a patient sale on TCGplayer gives up in fees and shipping; Card Kingdom's cash buylist pays about 23% under."
              />
            </label>
            <NumberInput
              id={ids.boxMarkdown}
              min={0}
              fractional
              /*
               * Held as a fraction, edited as a percent — and rounded on the
               * way out, because 0.2 × 100 is 20.000000000000004 in floating
               * point and the field would echo the artefact. Six places on
               * the fraction, matching the share link's own precision.
               */
              value={Math.round(config.boxMarkdown * 1e6) / 1e4}
              onChange={(n) => set("boxMarkdown", Math.min(100, Math.max(0, n)) / 100)}
            />
          </div>
          {/* From here down: what the mastery track pays, which no
              event ladder does. */}
          <div className="col-6">
            <label htmlFor={ids.draftTokenValue} className="form-label">
              Draft token value ({m.label})
              <InfoTip
                label="About draft token value"
                content="A Player Draft token buys a Premier or Traditional Draft entry, so it is priced at that entry's 1,500 gems. If you would not have drafted anyway, what the entry pays back is the better figure, and usually smaller."
              />
            </label>
            <MoneyInput
              id={ids.draftTokenValue}
              m={m}
              gemValue={config.draftTokenValueGems}
              onChange={(n) => set("draftTokenValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.mythicIcrValue} className="form-label">
              Mythic ICR value ({m.label})
              <InfoTip
                label="About mythic ICR value"
                content="Arena's duplicate-protection payout for a mythic you already hold four of: 40 gems."
              />
            </label>
            <MoneyInput
              id={ids.mythicIcrValue}
              m={m}
              gemValue={config.mythicIcrValueGems}
              onChange={(n) => set("mythicIcrValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.rareCardValue} className="form-label">
              Rare ICR value ({m.label})
              <InfoTip
                label="About rare ICR value"
                content="Arena's duplicate-protection payout for a rare you already hold four of: 20 gems."
              />
            </label>
            <MoneyInput
              id={ids.rareCardValue}
              m={m}
              gemValue={config.rareCardValueGems}
              onChange={(n) => set("rareCardValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.uncommonIcrValue} className="form-label">
              Uncommon ICR value ({m.label})
              <InfoTip
                label="About uncommon ICR value"
                content="An uncommon has no gem payout, so this is only its 5% chance of upgrading to a rare: about 1.1 gems. It is what every mastery level past the cap pays."
              />
            </label>
            <MoneyInput
              id={ids.uncommonIcrValue}
              m={m}
              gemValue={config.uncommonIcrValueGems}
              onChange={(n) => set("uncommonIcrValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.dailyWinIcrValue} className="form-label">
              Daily win ICR value ({m.label})
              <InfoTip
                label="About daily win ICR value"
                content="Daily wins reward uncommon ICRs alongside the gold, and this is the rate they are valued at. Zero by default, since their value is almost negligible unless you hold a full collection."
              />
            </label>
            <MoneyInput
              id={ids.dailyWinIcrValue}
              m={m}
              gemValue={config.dailyWinIcrValueGems}
              onChange={(n) => set("dailyWinIcrValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.orbValue} className="form-label">
              Mastery Orb value ({m.label})
              <InfoTip
                label="About Mastery Orb value"
                content="Zero by default: an orb buys a card style or avatar in the Mastery Emporium, and neither has a gem price."
              />
            </label>
            <MoneyInput
              id={ids.orbValue}
              m={m}
              gemValue={config.orbValueGems}
              onChange={(n) => set("orbValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.cardStyleValue} className="form-label">
              Card style value ({m.label})
              <InfoTip
                label="About card style value"
                content="Cosmetic, so zero by default."
              />
            </label>
            <MoneyInput
              id={ids.cardStyleValue}
              m={m}
              gemValue={config.cardStyleValueGems}
              onChange={(n) => set("cardStyleValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.sleeveValue} className="form-label">
              Card sleeve value ({m.label})
              <InfoTip
                label="About card sleeve value"
                content="Cosmetic, so zero by default."
              />
            </label>
            <MoneyInput
              id={ids.sleeveValue}
              m={m}
              gemValue={config.sleeveValueGems}
              onChange={(n) => set("sleeveValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.avatarValue} className="form-label">
              Avatar value ({m.label})
              <InfoTip
                label="About avatar value"
                content="Cosmetic, so zero by default."
              />
            </label>
            <MoneyInput
              id={ids.avatarValue}
              m={m}
              gemValue={config.avatarValueGems}
              onChange={(n) => set("avatarValueGems", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.companionValue} className="form-label">
              Companion value ({m.label})
              <InfoTip
                label="About companion value"
                content="Cosmetic, so zero by default."
              />
            </label>
            <MoneyInput
              id={ids.companionValue}
              m={m}
              gemValue={config.companionValueGems}
              onChange={(n) => set("companionValueGems", n)}
            />
          </div>
        </div>
      </div>

      <div className="adv-group mb-3">
        <h3 className="section-title">Gold</h3>
        <div className="row g-2">
          <div className="col-6">
            <label htmlFor={ids.goldPerDay} className="form-label">
              Other gold per day
              <InfoTip
                label="About other gold per day"
                content="Gold from quests and play outside this event, credited across the day's events. Defaults to 600, about one daily quest. Gold from the event's own wins is counted separately, off the daily-win ladder."
              />
            </label>
            <GoldInput
              id={ids.goldPerDay}
              value={config.otherGoldPerDay}
              onChange={(n) => set("otherGoldPerDay", n)}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.gamesPerDay} className="form-label">
              Games per day
              <InfoTip
                label="About games per day"
                content="How many games a day you play, across every event — a best-of-three match is about 2.5 of them. Decides how far the day's wins climb the daily-win ladder, which stops paying at fifteen, and how many events share the day's gold. Set 0 to price the event in gems alone."
              />
            </label>
            <NumberInput
              id={ids.gamesPerDay}
              min={0}
              fractional
              value={config.gamesPerDay}
              onChange={(n) => set("gamesPerDay", n)}
            />
          </div>
          <div className="col-12">
            {/*
              What the two fields above come to, and what the rate
              below makes of it — the figure that lands in every
              per-event gross, so it is worth seeing here as gold and
              as gems both, along with how many events the day's games
              fill, which is the divisor behind the per-event share.
            */}
            <div className="form-text mt-0">
              {approx(`${meanEventsPerDay(config).toLocaleString(undefined, { maximumFractionDigits: 1 })} events a day`)}
              ; {Math.round(goldPerEvent(config)).toLocaleString()} gold per event
              {goldPerEvent(config) > 0 && `, counted as ${gemsEq(goldValueGems(config))}`}.
            </div>
          </div>
          <div className="col-6">
            <label htmlFor={ids.goldRate} className="form-label">
              Gems per 10,000 gold
              <InfoTip
                label="About the gold exchange rate"
                content="What gold counts as worth — the gold each event is credited, and any balance a run is left holding. Every event priced in both uses the same gold-to-gem ratio, so Arena sets this rate itself. Set 0 to count gold as worthless."
              />
            </label>
            <GemInput
              id={ids.goldRate}
              value={config.gemsPer10kGold}
              onChange={(n) => set("gemsPer10kGold", n)}
            />
          </div>
        </div>
      </div>

      <div className="adv-group mb-3">
        <h3 className="section-title">Display</h3>
        <div className="row g-2">
          <div className="col-6">
            <label htmlFor={ids.gemsPerUsd} className="form-label">
              Gems per US dollar
              <InfoTip
                label="About the dollar conversion"
                content="Only for showing figures in USD; the model runs in gems. 200 is the largest bundle's rate, 20,000 gems for $99.99, the best on offer."
              />
            </label>
            <GemInput
              id={ids.gemsPerUsd}
              value={gemsPerUsd}
              onChange={(n) => onGemsPerUsdChange(Math.max(1, n))}
            />
          </div>
        </div>
      </div>

      {/*
        The Bankroll tab's knobs, and only its: the Expected value tab
        is closed form and has nothing to size or seed.
      */}
      <div className="adv-group">
        <h3 className="section-title">Bankroll simulation</h3>
        <div className="row g-2">
          <div className="col-6">
            <label htmlFor={ids.bankrollRuns} className="form-label">
              Runs
              <InfoTip
                label="About bankroll runs"
                content="How many runs the Bankroll tab simulates from your starting balance. More runs steady the averages and the histograms."
              />
            </label>
            <NumberInput
              id={ids.bankrollRuns}
              min={1}
              value={bankrollRuns}
              onChange={(n) => onBankrollRunsChange(clampInt(n, 1, SIM_LIMITS.bankrollRuns))}
            />
          </div>
          <div className="col-6">
            <label htmlFor={ids.seed} className="form-label">
              Seed
              <InfoTip
                label="About the seed"
                content="Changes which outcomes you get, not the distribution they come from. The same seed always reproduces the same figures."
              />
            </label>
            <NumberInput id={ids.seed} value={seed} onChange={onSeedChange} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
