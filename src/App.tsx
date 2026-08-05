import { useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "bootstrap/js/dist/modal";

import { money, pct, type Unit } from "./format";
import { About } from "./components/About";
import { DistributionChart } from "./components/DistributionChart";
import { EvCurveChart } from "./components/EvCurveChart";
import { EventsHistogram } from "./components/EventsHistogram";
import { InfoTip } from "./components/InfoTip";
import { PayoutBreakdown } from "./components/PayoutBreakdown";
import { PercentileSummary } from "./components/PercentileSummary";
import { RunLog } from "./components/RunLog";
import { SectionHeading } from "./components/SectionHeading";
import { Stat, type StatTile } from "./components/Stat";
import { StatStrip } from "./components/StatStrip";
import { Tabs, TabPanel } from "./components/Tabs";
import { ValueHistogram } from "./components/ValueHistogram";
import {
  CUSTOM_PRESET,
  PRESETS,
  breakEvenWinRate,
  configFromPreset,
  expectedNetAt,
  goldPerEvent,
  matchWinRate,
  netInterval,
  CREDIBLE_LEVEL,
  probProfitable,
  winRateInterval,
  winRatePosterior,
  maxPossibleWins,
  maxRounds,
  resizePayouts,
  simulate,
  simulateBankrolls,
  type EventConfig,
  type EventStructure,
  type PayoutTier,
} from "./lib";
import {
  STARTING_ENTRIES,
  decodeShareState,
  encodeShareState,
  type Tab,
} from "./share";

/** An event the current balance cannot enter, and what to do about it. */
type TopUp = {
  name: string;
  entryGems: number;
  /** 0 where the event takes gems only, which changes what the prompt says. */
  goldPrice: number;
  suggested: number;
};

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

const RESULT_TABS = [
  { key: "bankroll" as const, label: "Bankroll" },
  { key: "event" as const, label: "Per event" },
  { key: "about" as const, label: "About" },
];

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
  fractional,
  text,
  className = "form-control",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  id?: string;
  disabled?: boolean;
  /** Allows decimals — "any" imposes no step rule, so nothing is invalidated. */
  fractional?: boolean;
  /**
   * What to display instead of the bare number, for units that fix their
   * precision. Shown only while the field is idle — see below.
   */
  text?: string;
  className?: string;
}) {
  /*
   * Keystrokes are echoed verbatim while the field is being edited, and the
   * formatted text returns once the value settles. Reformatting as the user
   * types would fight them: typing "8.5" into a two-place field rewrites it to
   * "8.50" before the 5 is finished, putting the caret behind two zeros the
   * user did not type.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  /*
   * What counts as settled is the native change event, which is not React's
   * onChange — that one is the input event, and fires on every keystroke.
   * The native one fires immediately when a number field is stepped with the
   * spinner or the arrow keys, but not until commit when text is typed. That
   * is precisely the line wanted here: stepping 8.50 up should read 9.50, not
   * strip to 9.5 and stay stripped until the field is left.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const settle = () => setDraft(null);
    el.addEventListener("change", settle);
    return () => el.removeEventListener("change", settle);
  }, []);

  return (
    <input
      ref={ref}
      id={id}
      type="number"
      className={className}
      min={min}
      step={fractional ? "any" : 1}
      value={draft ?? text ?? String(value)}
      disabled={disabled}
      onWheel={(e) => e.currentTarget.blur()}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(Number(e.target.value) || 0);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** A number input with a currency marker in front of it. */
function AddonInput({
  addon,
  id,
  disabled,
  fractional,
  text,
  value,
  onChange,
  compact,
}: {
  addon: React.ReactNode;
  id?: string;
  disabled?: boolean;
  fractional?: boolean;
  text?: string;
  value: number;
  onChange: (n: number) => void;
  /** Narrower marker and field, for the payout table's cramped columns. */
  compact?: boolean;
}) {
  return (
    // The marker names the currency at the point of entry, so a field cannot
    // be misread as the other one while the toggle is out of view.
    <div className={`input-group${compact ? " input-group-sm input-group-compact" : ""}`}>
      <span className="input-group-text">{addon}</span>
      <NumberInput
        id={id}
        disabled={disabled}
        min={0}
        fractional={fractional}
        text={text}
        value={value}
        onChange={onChange}
        className={`form-control${compact ? " form-control-sm text-end" : ""}`}
      />
    </div>
  );
}

/**
 * A rate quoted in gems. Always marked as gems, whatever the display unit —
 * these define the conversions rather than being subject to them.
 */
function GemInput(props: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return <AddonInput addon={<i className="bi bi-gem" aria-hidden="true" />} {...props} />;
}

/** Gold is Arena's own currency and never follows the display unit. */
function GoldInput(props: {
  id?: string;
  disabled?: boolean;
  value: number;
  onChange: (n: number) => void;
}) {
  return <AddonInput addon={<i className="bi bi-coin" aria-hidden="true" />} {...props} />;
}

/** A gem-valued input, displayed and edited in the active unit. */
function MoneyInput({
  gemValue,
  onChange,
  m,
  id,
  disabled,
}: {
  gemValue: number;
  onChange: (gems: number) => void;
  m: ReturnType<typeof money>;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <AddonInput
      addon={m.unit === "usd" ? "$" : <i className="bi bi-gem" aria-hidden="true" />}
      id={id}
      disabled={disabled}
      fractional={m.fractional}
      text={m.inputText(gemValue)}
      value={m.toInput(gemValue)}
      onChange={(n) => onChange(m.fromInput(n))}
    />
  );
}

/**
 * A gem-valued input pinned to dollars, whatever the display unit.
 *
 * Box prices are quoted in dollars everywhere they are sourced — street price
 * on MTGGoldfish, Wizards' cash substitution — so editing them in gems means
 * converting by hand to check a figure against the page it came from.
 *
 * Only the field is dollars. The stored value is still gems, so the rate
 * applies at the edit and not inside the simulation, and `gemsPerUsd` stays
 * what its own tooltip says it is: a display setting. The visible consequence
 * is that changing the rate re-prices a box that was already set, because the
 * gems behind it are what is held.
 */
function UsdInput({
  gemValue,
  onChange,
  gemsPerUsd,
  id,
  disabled,
}: {
  gemValue: number;
  onChange: (gems: number) => void;
  gemsPerUsd: number;
  id?: string;
  disabled?: boolean;
}) {
  const usd = useMemo(() => money("usd", gemsPerUsd), [gemsPerUsd]);
  return (
    <MoneyInput
      id={id}
      m={usd}
      gemValue={gemValue}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

export default function App() {
  /*
   * The query string is the only place state persists. It is read once here
   * and written back on every change, so the address bar always describes what
   * is on screen and is shareable as it stands. Defaults live in share.ts
   * rather than in these initialisers: a default that disagreed with the one
   * the encoder measures against would be written into every link.
   */
  const [initial] = useState(() => decodeShareState(window.location.search));
  const [config, setConfig] = useState<EventConfig>(initial.config);
  const [trials, setTrials] = useState(initial.trials);
  /*
   * Counted apart from `trials` because a run costs far more than an event:
   * one plays a whole sequence, so matching the per-event count would be tens
   * of times the work for a shape a few thousand runs already settle.
   */
  const [bankrollRuns, setBankrollRuns] = useState(initial.bankrollRuns);
  const [seed, setSeed] = useState(initial.seed);
  const [presetName, setPresetName] = useState(initial.presetName);
  // Deliberately outside the share state: a link should carry the model, not
  // whether the sender happened to have a panel folded open.
  const [eventDetailsOpen, setEventDetailsOpen] = useState(
    initial.presetName === CUSTOM_PRESET,
  );
  const [startingGems, setStartingGems] = useState(initial.startingGems);
  const [startingGold, setStartingGold] = useState(initial.startingGold);
  // Where the player stops, not a numerical guard — a run that never busts has
  // to end somewhere, and how long you intend to play is a real input.
  const [maxEvents, setMaxEvents] = useState(initial.maxEvents);
  // Off by default: none of these buys an entry in Arena.
  const [spendWinnings, setSpendWinnings] = useState(initial.spendWinnings);
  const [tab, setTab] = useState<Tab>(initial.tab);
  /*
   * Whether the ending total is shown as one figure or as what it is made of.
   * Deliberately not in the shared state beside `tab`: the link format is
   * pinned by a snapshot so that breaking an old link takes a decision, and
   * this is a glance at a section rather than part of the simulation being
   * shared.
   */
  const [view, setView] = useState<"value" | "breakdown">("value");
  const [unit, setUnit] = useState<Unit>(initial.unit);
  // 20,000 gems for $99.99 is the largest bundle, so the best rate on offer.
  const [gemsPerUsd, setGemsPerUsd] = useState(initial.gemsPerUsd);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  // Set when a preset switch lands on an event the balance cannot enter. Not
  // in the URL: it describes a moment, not a configuration worth sharing.
  const [topUp, setTopUp] = useState<TopUp | null>(null);

  /*
   * replaceState, not pushState: these are live-edited fields, and a history
   * entry per keystroke would mean pressing Back a hundred times to leave the
   * page. The cost is that Back does not undo an edit.
   *
   * There is no popstate listener to match, because with nothing pushed there
   * is nothing to pop — typing a URL by hand is a full load, which the initial
   * decode above already handles.
   */
  useEffect(() => {
    const query = encodeShareState({
      presetName,
      config,
      trials,
      bankrollRuns,
      seed,
      startingGems,
      startingGold,
      maxEvents,
      spendWinnings,
      tab,
      unit,
      gemsPerUsd,
    });
    const { pathname, hash } = window.location;
    window.history.replaceState(
      null,
      "",
      `${pathname}${query ? `?${query}` : ""}${hash}`,
    );
  }, [
    presetName,
    config,
    trials,
    bankrollRuns,
    seed,
    startingGems,
    startingGold,
    maxEvents,
    spendWinnings,
    tab,
    unit,
    gemsPerUsd,
  ]);

  const copyTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /*
   * The URL is already current, so this only saves a trip to the address bar.
   * Writing to the clipboard can be refused — a denied permission, or a
   * non-secure context — and silently doing nothing would read as a no-op
   * button, so a refusal says so.
   */
  const copyLink = () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    navigator.clipboard.writeText(window.location.href).then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );
    copyTimer.current = window.setTimeout(() => setCopyState("idle"), 2000);
  };
  const m = useMemo(() => money(unit, gemsPerUsd), [unit, gemsPerUsd]);
  // Shadowing the old helpers keeps every call site reading naturally while
  // the unit behind them changes.
  const gems = m.fmt;
  const gems2 = m.fmt1;
  /*
   * Two forms because the label sits in two grammatical slots: `valueLabel`
   * stands alone ("Final gem value"), `unitLabel` only ever qualifies a figure
   * already named ("Mean ending value (gems)"), where repeating "value" reads
   * as a stutter. Sentence case, like every other label in the app.
   */
  const valueLabel = unit === "gems" ? "Gem value" : "Dollar value";
  const unitLabel = unit === "gems" ? "gems" : "USD";

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

  const topUpEl = useRef<HTMLDivElement>(null);
  const topUpModal = useRef<Modal | null>(null);
  useEffect(() => {
    if (!topUpEl.current) return;
    topUpModal.current = new Modal(topUpEl.current);
    return () => {
      topUpModal.current?.dispose();
      topUpModal.current = null;
    };
  }, []);
  /*
   * Shown from an effect rather than from the handler that sets it, so the
   * body has rendered before the dialog appears — calling show() inline would
   * fade in the previous prompt's text for a frame.
   *
   * `topUp` is deliberately not cleared when the dialog closes: the content
   * would vanish mid-fade, and the next switch overwrites it anyway.
   */
  useEffect(() => {
    if (topUp) topUpModal.current?.show();
  }, [topUp]);

  const uid = useId();
  const ids = {
    preset: `${uid}-preset`,
    structure: `${uid}-structure`,
    maxWins: `${uid}-max-wins`,
    maxLosses: `${uid}-max-losses`,
    rounds: `${uid}-rounds`,
    winRate: `${uid}-win-rate`,
    entry: `${uid}-entry`,
    entryGold: `${uid}-entry-gold`,
    draftPacks: `${uid}-draft-packs`,
    draftPackValue: `${uid}-draft-pack-value`,
    goldPerDay: `${uid}-gold-per-day`,
    eventsPerDay: `${uid}-events-per-day`,
    goldRate: `${uid}-gold-rate`,
    packValue: `${uid}-pack-value`,
    funValue: `${uid}-fun-value`,
    playInValue: `${uid}-play-in-value`,
    playBoxValue: `${uid}-play-box-value`,
    collectorBoxValue: `${uid}-collector-box-value`,
    trials: `${uid}-trials`,
    bankrollRuns: `${uid}-bankroll-runs`,
    seed: `${uid}-seed`,
    startGems: `${uid}-start-gems`,
    startGold: `${uid}-start-gold`,
    maxEvents: `${uid}-max-events`,
    spendWinnings: `${uid}-spend-winnings`,
    gemsPerUsd: `${uid}-gems-per-usd`,
    confMatches: `${uid}-conf-matches`,
    resultTabs: `${uid}-results`,
    viewTabs: `${uid}-view`,
    topUpTitle: `${uid}-top-up-title`,
  };

  const result = useMemo(() => simulate(config, trials, seed), [config, trials, seed]);
  const breakEven = useMemo(() => breakEvenWinRate(config), [config]);
  const bankroll = useMemo(
    () =>
      simulateBankrolls(
        config,
        { startingGems, startingGold, maxEvents, spendWinnings },
        bankrollRuns,
        seed,
      ),
    [config, startingGems, startingGold, maxEvents, spendWinnings, bankrollRuns, seed],
  );
  /*
   * The win rate is a guess, so these carry how much of one. Null throughout
   * when the player has called it certain.
   */
  const posterior = useMemo(() => winRatePosterior(config), [config]);
  const netBand = useMemo(() => netInterval(config), [config]);
  const pProfitable = useMemo(() => probProfitable(config), [config]);
  const rateBand = useMemo(
    () => (posterior ? winRateInterval(posterior) : null),
    [posterior],
  );

  // When there is no break-even point, say which side of zero the event sits on.
  const breakEvenHint = useMemo(() => {
    if (breakEven !== null) return "per match";
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
    if (!preset) return;
    setConfig(configFromPreset(preset, config));

    /*
     * Switching to an event you cannot afford produces a page of zeroes: the
     * bankroll run ends before its first entry, so every figure on that tab is
     * the starting balance restated. That reads as a broken app rather than as
     * an empty wallet, so it is worth interrupting for — but only in that case,
     * which is why the test is whether *either* currency covers one entry
     * rather than whether both do.
     */
    const gemsCover = startingGems >= preset.entryCostGems;
    const goldPrice = preset.entryCostGold ?? 0;
    const goldCovers = goldPrice > 0 && startingGold >= goldPrice;
    if (gemsCover || goldCovers) return;
    setTopUp({
      name: preset.name,
      entryGems: preset.entryCostGems,
      goldPrice,
      suggested: STARTING_ENTRIES * preset.entryCostGems,
    });
  };

  /*
   * A preset describes a real event, so its definition is read-only; "Copy to
   * Custom" takes the values and unlocks them. Only editing an event you own
   * avoids the question of what a half-edited "Premier Draft" means.
   */
  const isCustom = presetName === CUSTOM_PRESET;
  const locked = !isCustom;
  /*
   * Switching to Custom opens the panel, because on Custom the panel is the
   * editor and an empty card would look like the app had lost its inputs.
   * Switching back does not close it: having opened the schedule to read it,
   * you probably want it open for the next preset too.
   */
  useEffect(() => {
    if (isCustom) setEventDetailsOpen(true);
  }, [isCustom]);
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
  const viewItems = [
    { key: "value" as const, label: valueLabel },
    { key: "breakdown" as const, label: "Payout breakdown" },
  ];
  const structure = config.structure;
  /*
   * A round is a match in every event here, whether that match is one game or
   * up to three, so everything the user reads is in matches and nothing needs
   * converting. The slider sets the rate the model runs on directly.
   */
  const roundWinRate = matchWinRate(config);
  const breakEvenShown = breakEven;
  // Restates the event being priced, for the Results heading — the numbers
  // below are meaningless without it.
  const structureSummary =
    structure.kind === "rounds"
      ? `${structure.rounds} rounds played in full`
      : `to ${structure.maxWins} wins or ${structure.maxLosses} losses`;

  /** Null unless the ladder pays boxes, which is what makes the strip move. */
  const box = bankroll.boxChance;
  /*
   * The tiles' help popovers explain the statistics to someone who does not
   * live in them: what was averaged or counted, over which simulated runs,
   * and how to read the figure as odds where that is the natural reading.
   * The lay words carry the surface — "average", "typically", "plausibly" —
   * and each popover names the statistic behind its word, so the precise
   * vocabulary is one click away rather than ambient.
   */
  const packsTile: StatTile = {
    key: "packs",
    label: "Average packs won",
    value: bankroll.holdings.packs.mean.toFixed(1),
    hint: spendWinnings ? "over the run, then converted to gems" : "over the whole run",
    help: {
      label: "What average packs won means",
      content:
        "How many packs a run had collected by the time it stopped, averaged across every simulated run.",
    },
  };
  const runTiles: StatTile[] = [
    {
      key: "events",
      label: "Average events played",
      value: bankroll.meanEvents.toFixed(1),
      hint: `typically ${bankroll.eventPercentiles.p50}`,
      help: {
        label: "What average events played means",
        content:
          "How many events a run got to enter before it stopped, averaged across every simulated run. The typical figure underneath is the median: half of the runs played at least that many.",
      },
    },
    {
      key: "value",
      label: `Average ending value (${unitLabel})`,
      value: gems(bankroll.meanFinalValue),
      tone: signClass(bankroll.meanFinalValue - startingGems),
      // No hint: the typical (median) figure is in the sentence below and the
      // starting balance is an input a few inches away.
      help: {
        label: "What average ending value means",
        content:
          "Everything a run holds when it stops — gems, leftover gold and winnings — averaged across every simulated run. Green means the average run ends ahead of your starting balance; red, behind it.",
      },
    },
    {
      key: "ruin",
      // The model stores the survival rate; ruin is the figure with a name,
      // and the direction people quote it in.
      label: "Risk of ruin",
      value: pct(1 - bankroll.survivedFraction),
      hint: `went broke inside ${maxEvents} events`,
      help: {
        label: "What risk of ruin means",
        content:
          "The share of simulated runs that went broke — could no longer afford an entry — before reaching your stop limit. At 25%, one player in four who tries this goes bust along the way.",
      },
    },
  ];
  /**
   * The bankroll tiles, in the order they earn their place.
   *
   * Four show and the rest sit behind the strip's arrow, so the order is a
   * claim about what the event is for rather than a layout detail. Boxes take
   * the front wherever the ladder pays them: they are the only reason to enter
   * an Arena Direct, and they are the one reward a mean cannot describe,
   * because 0.2 boxes is not something anyone receives. Packs give up their
   * slot in that case rather than their place — they are still a real part of
   * the payout, one arrow to the right.
   *
   * Five is the most this ever runs to. The closed-form chance for a single
   * entry was a sixth for a while and has been taken out again: it answers a
   * question nobody asked of a page about bankrolls, and sitting in the same
   * row as the run-level chance it mostly invited the two to be confused. It
   * still exists as `boxChancePerEvent`, where it does its real work of
   * holding the simulation to account in the tests.
   */
  const bankrollTiles: StatTile[] = box
    ? [
        {
          key: "box",
          label: (
            <>
              <i className="bi bi-box-seam me-1" aria-hidden="true" />
              Chance of a box
            </>
          ),
          value: pct(box.probAny),
          /*
           * The band the record supports, and the reason the tile is worth
           * more than the figure alone: at twenty matches of record the chance
           * of a box can span a factor of three, which is the difference
           * between a plan and a hope. Falls back to the sampling error of the
           * simulated proportion when the rate is called certain, the same way
           * the expected-net tile does, since there is then nothing else for a
           * ± to describe.
           */
          hint: box.interval
            ? `plausibly ${pct(box.interval[0])} to ${pct(box.interval[1])}`
            : `give or take ${pct(1.96 * Math.sqrt((box.probAny * (1 - box.probAny)) / bankroll.trials))}`,
          help: {
            label: "What chance of a box means",
            content: `The share of simulated runs that won at least one box — at 10%, one player in ten who plays this way walks away with one. ${
              box.interval
                ? `The range underneath covers ${pct(box.level, 0)} of the possibilities your win-rate record allows.`
                : "The give-or-take underneath is the simulation's own sampling wobble, a 95% confidence interval."
            }`,
          },
        },
        ...runTiles,
        packsTile,
      ]
    : [runTiles[0], runTiles[1], packsTile, runTiles[2]];

  /*
   * As on the bankroll strip, each tile carries a popover explaining the
   * statistic in plain terms — what was averaged, over what, and how to read
   * it — for a reader the bare label would leave behind.
   */
  const stats: StatTile[] = [
    {
      key: "net",
      label: "Expected net / event",
      value: gems2(result.meanNet),
      // The band the record supports. Falls back to the sampling error of the
      // simulated mean when the rate is called certain, since there is then
      // nothing else for a range to describe.
      hint: netBand
        ? `${m.label} · plausibly ${gems2(netBand[0])} to ${gems2(netBand[1])}`
        : `${m.label} · give or take ${gems2(1.96 * result.stdErrNet)}`,
      tone: signClass(result.meanNet),
      help: {
        label: "What expected net means",
        content: `What one entry wins or loses on average, after paying the entry. Any single event swings well above or below this; play many and your average result heads toward it. ${
          netBand
            ? `The range underneath covers ${pct(CREDIBLE_LEVEL, 0)} of the possibilities your win-rate record allows.`
            : "The give-or-take underneath is the simulation's own sampling wobble, a 95% confidence interval."
        }`,
      },
    },
    {
      key: "gross",
      label: "Expected gross",
      value: gems2(result.meanGross),
      hint: `${m.label} + ${result.meanPacks.toFixed(2)} packs / event`,
      help: {
        label: "What expected gross means",
        content:
          "What one event pays back on average, before subtracting what it cost to enter. The packs beside it are counted separately rather than folded into the figure.",
      },
    },
    {
      key: "roi",
      label: "ROI",
      value: pct(result.roi),
      hint:
        result.goldEntryFraction > 0
          ? `of ${gems(result.meanEntryGems)} paid · ${pct(result.goldEntryFraction)} entries free`
          : `of ${gems(config.entryCostGems)} entry`,
      tone: signClass(result.roi),
      help: {
        label: "What ROI means",
        content:
          "Return on investment: the expected net as a share of what an entry costs. At −10%, an average entry gives back 90 for every 100 paid in; positive means the average entry more than pays for itself.",
      },
    },
    {
      key: "break-even",
      label: "Break-even win rate",
      value: breakEvenShown === null ? "—" : pct(breakEvenShown, 2),
      hint:
        pProfitable !== null && breakEvenShown !== null
          ? `${pct(pProfitable)} chance you are above it`
          : breakEvenHint,
      help: {
        label: "What break-even win rate means",
        content:
          "The match win rate at which the average event exactly pays back its entry. Win more often than this and the event makes you money on average; less often, and it loses.",
      },
    },
    {
      key: "p-profit",
      label: "P(profit)",
      value: pct(result.probProfit),
      hint: "of events end net positive",
      help: {
        label: "What P(profit) means",
        content:
          "The share of simulated events that ended worth more than they cost to enter. It can sit below 50% even when the event is profitable on average, because rare big finishes carry the average.",
      },
    },
    {
      key: "matches",
      label: "matches / event",
      value: result.meanRounds.toFixed(2),
      // The σ of net that used to share this hint lives in the spread section
      // now, where percentiles say the same thing in plainer words.
      hint: `max ${maxRounds(structure)}`,
      help: {
        label: "What matches per event means",
        content:
          "How many matches one event lasts on average before it reaches a finish.",
      },
    },
  ];

  return (
    <div className="container-xl py-4">
      <header className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div>
          <h1 className="h3 mb-1">MTGA Limited EV</h1>
          <p className="text-body-secondary mb-0">
            How far you can go drafting — the quest for infinite.
          </p>
        </div>
        {/* Every input is already in the address bar; this is only the shortest
            path from there to someone else. */}
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm flex-shrink-0"
          onClick={copyLink}
        >
          <i
            className={`bi ${copyState === "copied" ? "bi-check2" : "bi-link-45deg"} me-1`}
            aria-hidden="true"
          />
          <span aria-live="polite">
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy link"}
          </span>
        </button>
      </header>

      <div className="row g-3 align-items-start">
        <div className="col-lg-4 vstack gap-3">
          {/* Assumptions that hold whichever event you price. */}
          <div className="card">
            <div className="card-body">
              <h2 className="section-title d-flex flex-wrap align-items-center justify-content-between gap-2">
                Global inputs
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
                      onClick={() => setUnit(u)}
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
                    content="Your chance of winning one match. A best-of-one match is a single game and a best-of-three is up to three, but either way this is the rate the event's win and loss counters move on."
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
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label htmlFor={ids.startGems} className="form-label">
                    Starting {m.label}
                  </label>
                  <MoneyInput
                    id={ids.startGems}
                    m={m}
                    gemValue={startingGems}
                    onChange={setStartingGems}
                  />
                </div>
                <div className="col-6">
                  <label htmlFor={ids.startGold} className="form-label">
                    Starting gold
                  </label>
                  <GoldInput
                    id={ids.startGold}
                    value={startingGold}
                    onChange={setStartingGold}
                  />
                </div>
                <div className="col-12">
                  <label htmlFor={ids.maxEvents} className="form-label">
                    Stop after (events)
                    <InfoTip
                      label="About the event limit"
                      content="Where you stop playing. A run that never goes broke has to end somewhere, and how long you intend to keep going changes the ending balance."
                    />
                  </label>
                  <NumberInput
                    id={ids.maxEvents}
                    min={1}
                    value={maxEvents}
                    onChange={(n) => setMaxEvents(clampInt(n, 1, 2000))}
                  />
                </div>
              </div>

              <button
                type="button"
                className="btn btn-outline-secondary w-100"
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
                {!locked && (
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

              {/*
               * Collapsed by default: on a preset every field here is
               * read-only reference, and the payout table is the tallest
               * thing in the column. Custom opens it unprompted, since
               * there the panel is the editor rather than a record.
               */}
              <details
                className="event-details"
                open={eventDetailsOpen}
                onToggle={(e) => setEventDetailsOpen(e.currentTarget.open)}
              >
                <summary className="event-details-summary">
                  Entry cost and payout schedule
                </summary>
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
                      Entry cost ({m.label})
                    </label>
                    <MoneyInput
                      id={ids.entry}
                      disabled={locked}
                      m={m}
                      gemValue={config.entryCostGems}
                      onChange={(n) => set("entryCostGems", n)}
                    />
                  </div>
                  <div className="col-6">
                    <label htmlFor={ids.entryGold} className="form-label">
                      Entry cost (gold)
                      <InfoTip
                        label="About the gold entry"
                        content="Most events price the entry in gold as well as gems. Set 0 for events that do not. Gold accrues as you play and pays the entry whenever enough has built up."
                      />
                    </label>
                    <GoldInput
                      id={ids.entryGold}
                      disabled={locked}
                      value={config.entryCostGold}
                      onChange={(n) => set("entryCostGold", n)}
                    />
                  </div>
                  <div className="col-6">
                    <label htmlFor={ids.draftPacks} className="form-label">
                      Draft packs kept
                      <InfoTip
                        label="About draft packs kept"
                        content="How many packs' worth of cards you keep from the pool you played with — three for a draft, six for sealed. Zero for phantom events like cube, where the cards are borrowed."
                      />
                    </label>
                    <AddonInput
                      addon={<i className="bi bi-stack" aria-hidden="true" />}
                      id={ids.draftPacks}
                      disabled={locked}
                      value={config.draftPacks}
                      onChange={(n) => set("draftPacks", n)}
                    />
                  </div>
                </div>

                <h3 className="section-title mt-4">
                  Payout schedule
                  <InfoTip
                    label="About the payout schedule"
                    content="What the event pays for finishing on each win count — you get one row, not the rows below it. On Custom the rows follow the win ceiling, so lowering it drops the ones above."
                  />
                </h3>
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Wins</th>
                      <th scope="col" className="text-end">
                        <i className="bi bi-gem me-1" aria-hidden="true" />
                        Gems
                      </th>
                      <th scope="col" className="text-end">
                        <i className="bi bi-stack me-1" aria-hidden="true" />
                        Packs
                      </th>
                      {showPlayInPoints && (
                        <th scope="col" className="text-end">
                          <i className="bi bi-ticket-perforated me-1" aria-hidden="true" />
                          Points
                        </th>
                      )}
                      {showPlayBoxes && (
                        <th scope="col" className="text-end">
                          <i className="bi bi-box-seam me-1" aria-hidden="true" />
                          Play box
                        </th>
                      )}
                      {showCollectorBoxes && (
                        <th scope="col" className="text-end">
                          <i className="bi bi-boxes me-1" aria-hidden="true" />
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
                          <GemInput
                            compact
                            disabled={locked}
                            value={t.gems}
                            onChange={(n) => setTier(t.wins, { gems: n })}
                          />
                        </td>
                        <td>
                          <AddonInput
                            compact
                            addon={<i className="bi bi-stack" aria-hidden="true" />}
                            disabled={locked}
                            value={t.packs}
                            onChange={(n) => setTier(t.wins, { packs: n })}
                          />
                        </td>
                        {showPlayInPoints && (
                          <td>
                            <AddonInput
                              compact
                              addon={<i className="bi bi-ticket-perforated" aria-hidden="true" />}
                              disabled={locked}
                              value={t.playInPoints ?? 0}
                              onChange={(n) => setTier(t.wins, { playInPoints: n })}
                            />
                          </td>
                        )}
                        {showPlayBoxes && (
                          <td>
                            <AddonInput
                              compact
                              addon={<i className="bi bi-box-seam" aria-hidden="true" />}
                              disabled={locked}
                              value={t.playBoxes ?? 0}
                              onChange={(n) => setTier(t.wins, { playBoxes: n })}
                            />
                          </td>
                        )}
                        {showCollectorBoxes && (
                          <td>
                            <AddonInput
                              compact
                              addon={<i className="bi bi-boxes" aria-hidden="true" />}
                              disabled={locked}
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
              </details>
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          <div className="card">
            <div className="card-body">
              <Tabs
                group={ids.resultTabs}
                items={RESULT_TABS}
                active={tab}
                onSelect={setTab}
                label="Results"
                trailing={
                  <span className="section-note">
                    {presetName} · {structureSummary}
                  </span>
                }
              />

              <TabPanel group={ids.resultTabs} active={tab}>
              {tab === "about" ? (
                <About config={config} m={m} />
              ) : tab === "bankroll" ? (
                <>
                  <div className="form-text mb-2">
                    You start with the balance above and enter the same event
                    over and over. Each entry is paid in gold if the event has a
                    gold price and in gems otherwise, and whatever you win goes
                    back into the pot to pay for the next one. A run stops when
                    you can no longer afford an entry, or when it hits your event
                    limit. The figures below summarise a few thousand different
                    possible outcomes.
                  </div>
                  <div className="mb-3">
                    <StatStrip tiles={bankrollTiles} label="Bankroll summary" />
                  </div>
                  <SectionHeading
                    className="mt-4"
                    title="How many events you can play"
                    subtitle="Before the balance runs out."
                  />
                  <EventsHistogram
                    histogram={bankroll.histogram}
                    median={bankroll.eventPercentiles.p50}
                  />

                  <SectionHeading
                    className="mt-4"
                    title="Winnings"
                    subtitle="Everything a run is holding when it stops: gems, leftover gold, and everything won."
                  />
                  {/*
                    A segmented switch rather than tabs, so the strip reads as
                    the subdivision it is: the tabs above choose the question,
                    and these choose whether its answer comes as one figure or
                    as what that figure is made of. Framed together with what
                    it toggles, so the switch's reach is visible — the example
                    runs below sit outside it and are not part of the choice.
                  */}
                  <div className="switch-panel">
                  <Tabs
                    group={ids.viewTabs}
                    items={viewItems}
                    active={view}
                    onSelect={setView}
                    label="Ending total shown as"
                    variant="segmented"
                  />
                  <TabPanel group={ids.viewTabs} active={view}>
                    {view === "value" ? (
                      <>
                        <Stat
                          className="mb-3"
                          label={`Final ${valueLabel}`}
                          help={{
                            label: "What the final value figures mean",
                            content:
                              "Every simulated run, sorted from worst ending value to best. Half the runs ended with at least the median; p5 marks a run that only 5% did worse than, and p95 one that only 5% did better than.",
                          }}
                        >
                          <PercentileSummary
                            percentiles={bankroll.valuePercentiles}
                            fmt={gems}
                            tone={(v) => signClass(v - startingGems)}
                            noun="runs"
                          />
                        </Stat>
                        <ValueHistogram
                          bins={bankroll.valueHistogram}
                          m={m}
                          markers={[
                            {
                              at: startingGems,
                              // Carrying the figure, as the events histogram's
                              // median does: the axis under a landmark is
                              // lettered in thousands, so the line alone says
                              // roughly where you began and never what it was.
                              label: `starting ${gems(startingGems)}`,
                              tone: "start",
                            },
                            {
                              at: bankroll.medianFinalValue,
                              // "Typically", as the tiles say — the popover on
                              // the tile above teaches that the word means the
                              // median.
                              label: `typically ${gems(bankroll.medianFinalValue)}`,
                              tone: "median",
                            },
                          ]}
                        />
                      </>
                    ) : (
                      <PayoutBreakdown
                        bankroll={bankroll}
                        config={config}
                        m={m}
                        liquidating={spendWinnings}
                      />
                    )}
                  </TabPanel>
                  </div>

                  <RunLog samples={bankroll.samples} config={config} m={m} />
                </>
              ) : (
                <>
              <div className="row g-2">
                {stats.map(({ key, ...s }) => (
                  <div key={key} className="col-6 col-xl-4">
                    <Stat {...s} />
                  </div>
                ))}
              </div>

              <SectionHeading
                className="mt-4"
                title="Distribution of outcomes by wins"
                subtitle="Bars are the simulation; the tick mark is the closed-form probability."
              />
              <DistributionChart buckets={result.buckets} />

              <SectionHeading
                className="mt-4"
                title="Expected net by win rate"
                subtitle="Per match win rate, against expected net gems."
              >
                <InfoTip
                  label="About the expected net curve"
                  content="Closed-form expectation, not the simulation. The dot is where you are, the dashed line is break-even."
                />
              </SectionHeading>
              <EvCurveChart config={config} breakEven={breakEven} m={m} rateBand={rateBand} />

              <SectionHeading
                className="mt-4"
                title="Outcome table"
                subtitle="One row per finish: how often it happens, and what it pays."
              />
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

              <SectionHeading
                className="mt-4"
                title="Spread of a single event"
                subtitle="Net gems from one entry, from an unlucky one to a lucky one."
              >
                <InfoTip
                  label="What the spread figures mean"
                  content="Every simulated event, sorted from worst net result to best. Half the events paid at least the median; p5 is an unlucky one-in-twenty result, p95 a lucky one-in-twenty."
                />
              </SectionHeading>
              <PercentileSummary
                percentiles={result.percentiles}
                fmt={gems}
                tone={signClass}
                noun="entries"
              />
              <div className="form-text">
                Over {result.trials.toLocaleString()} events, total net ={" "}
                <span className={`fw-semibold ${signClass(result.totalNet)}`}>
                  {gems(result.totalNet)}
                </span>
                .
              </div>
                </>
              )}
              </TabPanel>
            </div>
          </div>
        </div>
      </div>

      <footer className="site-footer">
        <p className="mb-1">
          An expected-value model for MTG Arena limited events.
        </p>
        <p className="mb-0">
          <a
            className="link-secondary"
            href="https://github.com/awknaust/mtga-limited-ev"
            target="_blank"
            rel="noreferrer"
          >
            <i className="bi bi-github me-1" aria-hidden="true" />
            Source on GitHub
          </a>
        </p>
      </footer>

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
              {/* The one switch that changes what the simulation does, rather
                  than what a reward is worth. */}
              <div className="adv-highlight mb-3">
                <div className="form-check mb-0">
                  <input
                    id={ids.spendWinnings}
                    type="checkbox"
                    className="form-check-input"
                    checked={spendWinnings}
                    onChange={(e) => setSpendWinnings(e.target.checked)}
                  />
                  <label htmlFor={ids.spendWinnings} className="form-check-label fw-semibold">
                    Spend non-liquid winnings on entries
                    <InfoTip
                      label="About spending non-liquid winnings"
                      content="Gems and gold are liquid; packs, cards, points and boxes are not — none of them buys an entry in Arena, so by default they only count toward your ending total. Turning this on treats them as liquid at the rates below."
                    />
                  </label>
                </div>
              </div>

              <div className="adv-group mb-3">
                <h3 className="section-title">Win rate confidence</h3>
                <div className="row g-2">
                  <div className="col-12">
                    <label htmlFor={ids.confMatches} className="form-label">
                      Matches played
                      <InfoTip
                        label="About matches played"
                        content="How many matches you estimated your win rate from. Fewer matches means less certain outcomes. Infinity means you know it exactly, and every range collapses to a single figure."
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

              <div className="adv-group mb-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h3 className="section-title mb-0">Reward values</h3>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      update({
                        ...config,
                        draftPackValueGems: 0,
                        packValueGems: 0,
                        playInPointValueGems: 0,
                        playBoxValueGems: 0,
                        collectorBoxValueGems: 0,
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
                        content="What one draft pack of kept cards is worth, assuming a complete set: a rare converts to 20 gems and a mythic to 40, upgrading about 1:7, so roughly 23 a pack."
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
                        content="How much are packs worth to you (in gems)? Default is based on duplicate protection for a complete set."
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
                    <label htmlFor={ids.playInValue} className="form-label">
                      Play-in point value ({m.label})
                      <InfoTip
                        label="About play-in point value"
                        content="Priced off what the points buy: 20 of them cover an Arena Open play-in that otherwise costs 4,000 gems, so 200 a point."
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
                      Play box value (USD)
                      <InfoTip
                        label="About play box value"
                        content="Average street price across three recent Standard sets. Wizards' published cash substitution is $209.70 a box, before withholding."
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
                      Collector box value (USD)
                      <InfoTip
                        label="About collector box value"
                        content="Average street price across three recent Standard sets. These trade well above the $479.88 MSRP of a 12-pack display."
                      />
                    </label>
                    <UsdInput
                      id={ids.collectorBoxValue}
                      gemsPerUsd={gemsPerUsd}
                      gemValue={config.collectorBoxValueGems}
                      onChange={(n) => set("collectorBoxValueGems", n)}
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
                        content="Gold from quests and games outside this event, counted as budget toward entries. Defaults to 600, roughly a daily quest. The gold the event's own wins pay is counted separately, off the daily-win ladder."
                      />
                    </label>
                    <GoldInput
                      id={ids.goldPerDay}
                      value={config.otherGoldPerDay}
                      onChange={(n) => set("otherGoldPerDay", n)}
                    />
                  </div>
                  <div className="col-6">
                    <label htmlFor={ids.eventsPerDay} className="form-label">
                      Events per day
                      <InfoTip
                        label="About events per day"
                        content="How far a day's wins climb the daily-win ladder before it stops paying at fifteen. Playing more earns more gold in total but less per event. Set 0 to price the event in gems alone."
                      />
                    </label>
                    <NumberInput
                      id={ids.eventsPerDay}
                      min={0}
                      fractional
                      value={config.eventsPerDay}
                      onChange={(n) => set("eventsPerDay", n)}
                    />
                  </div>
                  <div className="col-12">
                    <div className="form-text mt-0">
                      {Math.round(goldPerEvent(config)).toLocaleString()} gold per event.
                    </div>
                  </div>
                  <div className="col-6">
                    <label htmlFor={ids.goldRate} className="form-label">
                      Gems per 10,000 gold
                      <InfoTip
                        label="About the gold exchange rate"
                        content="What leftover gold is counted as worth. Every event priced in both charges the same ratio of gold to gems, so Arena sets this rate itself. Set 0 to count unspent gold as worthless."
                      />
                    </label>
                    <GemInput
                      id={ids.goldRate}
                      value={
                        Number.isFinite(config.goldPerGem)
                          ? Math.round(10000 / config.goldPerGem)
                          : 0
                      }
                      onChange={(n) =>
                        set("goldPerGem", n > 0 ? 10000 / n : Number.POSITIVE_INFINITY)
                      }
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
                        content="Used only for showing figures in USD; the simulation always runs in gems. 200 comes from the largest bundle, 20,000 gems for $99.99, which is the best rate on offer."
                      />
                    </label>
                    <GemInput
                      id={ids.gemsPerUsd}
                      value={gemsPerUsd}
                      onChange={(n) => setGemsPerUsd(Math.max(1, n))}
                    />
                  </div>
                </div>
              </div>

              <div className="adv-group">
                <h3 className="section-title">Simulation</h3>
                <div className="row g-2">
                  <div className="col-6">
                    <label htmlFor={ids.trials} className="form-label">
                      Simulated events (Per event)
                      <InfoTip
                        label="About simulated events"
                        content="How many single events the Per event tab simulates; it does not touch the Bankroll tab. More of them narrow the confidence interval on the mean, and the exact column beside it is closed form rather than simulated."
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
                    <label htmlFor={ids.bankrollRuns} className="form-label">
                      Bankroll runs (Bankroll)
                      <InfoTip
                        label="About bankroll runs"
                        content="How many sequences the Bankroll tab plays. Counted apart from simulated events because one run plays a whole sequence of them, so the same number would be tens of times the work."
                      />
                    </label>
                    <NumberInput
                      id={ids.bankrollRuns}
                      min={1}
                      value={bankrollRuns}
                      onChange={(n) => setBankrollRuns(clampInt(n, 1, 200_000))}
                    />
                  </div>
                  <div className="col-6">
                    <label htmlFor={ids.seed} className="form-label">
                      Seed
                      <InfoTip
                        label="About the seed"
                        content="Changes which possible outcomes you get, not the distribution they are drawn from. The same seed always reproduces the same figures."
                      />
                    </label>
                    <NumberInput id={ids.seed} value={seed} onChange={setSeed} />
                  </div>
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

      {/* Raised when a preset switch lands on an event the balance cannot
          enter. Declining is the plain-text option, since the balance on
          screen may be exactly the one being asked about. */}
      <div
        className="modal fade"
        tabIndex={-1}
        ref={topUpEl}
        aria-labelledby={ids.topUpTitle}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h6 mb-0" id={ids.topUpTitle}>
                Not enough to enter
              </h2>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            {topUp && (
              <>
                <div className="modal-body">
                  <p className="mb-0">
                    {topUp.name} costs {gems(topUp.entryGems)} {m.label} and you
                    have {gems(startingGems)}.
                    {topUp.goldPrice > 0 && (
                      <>
                        {" "}
                        Your gold does not cover its{" "}
                        {topUp.goldPrice.toLocaleString()} gold price either.
                      </>
                    )}{" "}
                    Set your balance to{" "}
                    <span className="fw-semibold text-body">
                      {gems(topUp.suggested)}
                    </span>{" "}
                    — enough for {STARTING_ENTRIES} entries?
                  </p>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    data-bs-dismiss="modal"
                  >
                    Leave it
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setStartingGems(topUp.suggested);
                      topUpModal.current?.hide();
                    }}
                  >
                    Set to {gems(topUp.suggested)}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
