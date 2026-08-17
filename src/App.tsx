import { useEffect, useId, useMemo, useRef, useState } from "react";
import Modal from "bootstrap/js/dist/modal";

import {
  REAL_GEMS,
  approx,
  money,
  otherUnit,
  pct,
  valueLabel,
  type Unit,
} from "./format";
import { stepWinRate } from "./winRate";
import { About } from "./components/About";
import { BoxCell } from "./components/BoxCell";
import { BoxPrices } from "./components/BoxPrices";
import { DistributionChart } from "./components/DistributionChart";
import { EvCurveChart } from "./components/EvCurveChart";
import { EventsHistogram } from "./components/EventsHistogram";
import { InfoTip } from "./components/InfoTip";
import {
  AddonInput,
  GemInput,
  GoldInput,
  MoneyInput,
  NumberInput,
  UsdInput,
} from "./components/Inputs";
import { Mastery } from "./components/Mastery";
import { PayoutBreakdown } from "./components/PayoutBreakdown";
import { PayoutParts } from "./components/PayoutParts";
import { PercentileSummary } from "./components/PercentileSummary";
import { ResultsPlaceholder } from "./components/ResultsPlaceholder";
import { RunLog } from "./components/RunLog";
import { SectionHeading } from "./components/SectionHeading";
import { SimPending } from "./components/SimPending";
import { Stat, type StatTile } from "./components/Stat";
import { StatStrip } from "./components/StatStrip";
import { Tabs, TabPanel } from "./components/Tabs";
import { ValueHistogram } from "./components/ValueHistogram";
import {
  ValueSplitBar,
  grossSlices,
  holdingSlices,
} from "./components/ValueSplitBar";
import {
  CURRENT_MASTERY_TRACK,
  CUSTOM_PRESET,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  MASTERY_TRACKS,
  PRESETS,
  bankrollRoi,
  boxPriceTable,
  masteryBySlug,
  breakEvenWinRate,
  configFromPreset,
  expectedNetAt,
  goldPerEvent,
  liveBoxDefaults,
  matchWinRate,
  netInterval,
  CREDIBLE_LEVEL,
  probProfitable,
  winRateInterval,
  winRatePosterior,
  maxPossibleWins,
  maxRounds,
  payoutFor,
  paysBoxes,
  resizePayouts,
  startingValue,
  type BoxPriceFeed,
  type EventConfig,
  type EventStructure,
  type PayoutBox,
  type PayoutTier,
} from "./lib";
import { fetchBoxPriceFeed } from "./liveBoxPrices";
import {
  SIM_LIMITS,
  STARTING_ENTRIES,
  decodeShareState,
  encodeShareState,
  isAdvancedDefault,
  resetAdvanced,
  type ShareState,
  type Tab,
} from "./share";
import { SIM_DEBOUNCE_MS, useDebouncedValue } from "./hooks/useDebouncedValue";
import { useSimulate, useSimulateBankrolls } from "./hooks/useSimulation";

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
  { key: "mastery" as const, label: "Mastery" },
  { key: "about" as const, label: "About" },
];

const clampInt = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(n) || lo));

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

/** Bootstrap text colour for a signed figure. */
const signClass = (n: number): string => (n >= 0 ? "text-success" : "text-danger");



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
  /*
   * What the win rate's step buttons announce. The slider's own aria-valuetext
   * covers dragging and the arrow keys, but a button press leaves focus on the
   * button, where nothing speaks the value it just moved. Kept as its own live
   * region rather than put on the visible readout, which would then announce
   * over the slider on every drag.
   */
  const [winRateStepped, setWinRateStepped] = useState("");
  const [startingGems, setStartingGems] = useState(initial.startingGems);
  const [startingGold, setStartingGold] = useState(initial.startingGold);
  // Where the player stops, not a numerical guard — a run that never busts has
  // to end somewhere, and how long you intend to play is a real input.
  const [maxEvents, setMaxEvents] = useState(initial.maxEvents);
  const [tab, setTab] = useState<Tab>(initial.tab);
  // Which Set Mastery season the Mastery tab prices.
  const [masterySlug, setMasterySlug] = useState(initial.masterySlug);
  // Resolved here rather than in the tab, since the picker sits beside the
  // event and the tab is only one of the two things reading it.
  const masteryTrack = masteryBySlug(masterySlug) ?? CURRENT_MASTERY_TRACK;
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
   * What the Advanced reset announces. The fields it clears sit further up the
   * dialog and some of them are scrolled off it, so the press has a visible
   * answer and no audible one — the button disabling itself is not something a
   * screen reader is told about either.
   */
  const [advancedReset, setAdvancedReset] = useState("");

  /**
   * Everything a link carries, as the one object two things here take.
   *
   * A function rather than a value so the effect below keeps a dependency list
   * of plain numbers and strings: an object built in the render body is a new
   * one every time unless the compiler memoises it, and a silent bailout would
   * turn that effect into a history write per render.
   */
  const shareState = (): ShareState => ({
    presetName,
    config,
    trials,
    bankrollRuns,
    seed,
    startingGems,
    startingGold,
    maxEvents,
    tab,
    masterySlug,
    unit,
    gemsPerUsd,
  });

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
    const query = encodeShareState(shareState());
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
    tab,
    unit,
    gemsPerUsd,
  ]);

  /*
   * The feed as fetched, kept for the dialog that shows it — the payload
   * itself, not the two defaults derived from it, since the table quotes
   * prices and says nothing about which of them were averaged. Null covers
   * both "not back yet" and "there is none", which is what the dialog says:
   * the page never waits on this and never changes shape when it lands.
   */
  const [boxFeed, setBoxFeed] = useState<BoxPriceFeed | null>(null);

  /*
   * Live box prices, applied once if they arrive. The fetch resolves to null
   * on previews, in dev without the proxy, and during outages, and the baked
   * defaults simply stand — nothing here may ever make the app worse than it
   * was without a network.
   *
   * Two different things land here. The per-set table is installed outright:
   * it is not a setting anybody chose, it is what the boxes named by the
   * payouts cost today, and it is never written to a link — a link names the
   * product and this prices it on the day it is opened.
   *
   * The two generic averages are settings, so they follow the older rule: a
   * field is only overwritten while it still holds its baked default. That
   * covers every case at once — a link that spelled out a box value keeps it
   * (decode gave a non-default), a user who edited before the fetch resolved
   * keeps their number, and a fresh load gets today's prices. The update
   * flows into the next URL write like any edit, so a copied link carries the
   * generic values explicitly and an old link still means what it said.
   */
  useEffect(() => {
    const controller = new AbortController();
    void fetchBoxPriceFeed(controller.signal).then((feed) => {
      if (!feed) return;
      // Kept whether or not the averages below could be derived: a feed too
      // thin to average is still the answer to why the values did not move.
      setBoxFeed(feed);
      const now = new Date();
      const table = boxPriceTable(feed, now);
      const live = liveBoxDefaults(feed, now);
      setConfig((prev) => {
        const untouched = <K extends "playBoxValueGems" | "collectorBoxValueGems">(
          key: K,
          baked: number,
        ): number =>
          live !== null && prev[key] === baked ? live[key] : prev[key];
        return {
          ...prev,
          boxPrices: table,
          playBoxValueGems: untouched("playBoxValueGems", DEFAULT_PLAY_BOX_VALUE_GEMS),
          collectorBoxValueGems: untouched(
            "collectorBoxValueGems",
            DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
          ),
        };
      });
    });
    return () => controller.abort();
  }, []);

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
  /*
   * Real gem amounts, as *reported*: what a run paid to enter, a ladder's gem
   * payout, a gem balance. Pinned to gems whatever the toggle says, because a
   * dollar figure for one of these is a price nobody can pay — see
   * `REAL_GEMS`.
   *
   * The starting-balance *input* is a separate question and takes
   * `MoneyInput`: naming a figure you are about to type is not the same as
   * quoting one the simulation paid.
   */
  const gems = REAL_GEMS.fmt;
  /*
   * Gem-equivalent figures — the ones that fold packs, boxes or points in at
   * the configured rates. These are valuations rather than amounts, so they
   * are the only figures the dollar toggle can honestly convert.
   *
   * Two forms because the ≈ is sometimes declared above a group rather than on
   * each of its members: `gemsEq` marks the figure itself, `eq` is for cells
   * under a column heading that already carries the mark. Same conversion
   * either way — the difference is only where the mark is written.
   */
  const gemsEq = (g: number) => approx(m.fmt(g));
  const gemsEq2 = (g: number) => approx(m.fmt1(g));
  const eq = m.fmt;
  const eq2 = m.fmt1;
  /*
   * The same amount priced in the unit that is not showing, at the same rate.
   * Only the starting balance takes it: that figure is the one compared with
   * what a top-up would cost, so it says both what Arena would show and what
   * the store would charge, whichever unit the toggle is on.
   */
  const alt = useMemo(() => money(otherUnit(unit), gemsPerUsd), [unit, gemsPerUsd]);
  const altEq = (g: number) => approx(alt.fmt(g));
  /*
   * Only for the slots where nothing else says which unit is showing — the
   * view tab and the heading above the percentiles. A label sitting directly
   * over a formatted figure does not take it: those render with 💎 or $ on
   * the number, so a trailing "(gems)" only repeats what the reader is
   * already looking at. Sentence case, like every other label in the app.
   */
  const valueName = valueLabel(unit);

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

  /*
   * Whether the Advanced dialog is open, which holds the simulations: its
   * edits apply together when it closes rather than one recompute per
   * keystroke. `show` rather than `shown` puts the hold in place before the
   * first keystroke can land in the dialog; `hide` rather than `hidden` lets
   * the flush overlap the closing fade. Done, ×, Esc and a backdrop click
   * all arrive through these two Bootstrap events.
   */
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => {
    const el = modalEl.current;
    if (!el) return;
    const onShow = () => setAdvancedOpen(true);
    const onHide = () => setAdvancedOpen(false);
    el.addEventListener("show.bs.modal", onShow);
    el.addEventListener("hide.bs.modal", onHide);
    return () => {
      el.removeEventListener("show.bs.modal", onShow);
      el.removeEventListener("hide.bs.modal", onHide);
    };
  }, []);

  /*
   * The box-price table, opened from the About tab — from the page rather
   * than from inside another dialog, which is what keeps it a plain `show()`.
   * Bootstrap supports one dialog at a time, and a second raised over the
   * first stacks two backdrops that outlive them both.
   */
  const boxPricesEl = useRef<HTMLDivElement>(null);
  const boxPricesModal = useRef<Modal | null>(null);
  /*
   * Stamped when the dialog opens rather than read while rendering: "4 hours
   * ago" is a fact about the moment it was asked, and the React Compiler is
   * free to memoise a render that read the clock itself.
   */
  const [boxPricesAt, setBoxPricesAt] = useState(() => new Date());
  useEffect(() => {
    const el = boxPricesEl.current;
    if (!el) return;
    boxPricesModal.current = new Modal(el);
    const onShow = () => setBoxPricesAt(new Date());
    el.addEventListener("show.bs.modal", onShow);
    return () => {
      el.removeEventListener("show.bs.modal", onShow);
      boxPricesModal.current?.dispose();
      boxPricesModal.current = null;
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
    draftTokenValue: `${uid}-draft-token-value`,
    mythicIcrValue: `${uid}-mythic-icr-value`,
    rareCardValue: `${uid}-rare-card-value`,
    uncommonIcrValue: `${uid}-uncommon-icr-value`,
    orbValue: `${uid}-orb-value`,
    cardStyleValue: `${uid}-card-style-value`,
    sleeveValue: `${uid}-sleeve-value`,
    avatarValue: `${uid}-avatar-value`,
    companionValue: `${uid}-companion-value`,
    trials: `${uid}-trials`,
    bankrollRuns: `${uid}-bankroll-runs`,
    seed: `${uid}-seed`,
    startGems: `${uid}-start-gems`,
    startGold: `${uid}-start-gold`,
    maxEvents: `${uid}-max-events`,
    gemsPerUsd: `${uid}-gems-per-usd`,
    confMatches: `${uid}-conf-matches`,
    masterySeason: `${uid}-mastery-season`,
    masteryPrice: `${uid}-mastery-price`,
    resultTabs: `${uid}-results`,
    viewTabs: `${uid}-view`,
    topUpTitle: `${uid}-top-up-title`,
    boxPricesTitle: `${uid}-box-prices-title`,
  };

  /*
   * The Monte Carlo runs live in workers, debounced behind the inputs; only
   * the closed-form figures below are computed here, live. The params
   * objects are memoised so the debounce sees one identity per actual
   * change, and the *objects* are what debounce — a flush is atomic, so no
   * render can pair this keystroke's trials with the last one's seed.
   */
  const eventParams = useMemo(() => ({ config, trials, seed }), [config, trials, seed]);
  const bankrollParams = useMemo(
    () => ({ config, startingGems, startingGold, maxEvents, runs: bankrollRuns, seed }),
    [config, startingGems, startingGold, maxEvents, bankrollRuns, seed],
  );
  const {
    result,
    pending: eventPending,
    error: eventError,
  } = useSimulate(useDebouncedValue(eventParams, SIM_DEBOUNCE_MS, advancedOpen));
  const {
    result: bankroll,
    pending: bankrollPending,
    error: bankrollError,
  } = useSimulateBankrolls(useDebouncedValue(bankrollParams, SIM_DEBOUNCE_MS, advancedOpen));
  const breakEven = useMemo(() => breakEvenWinRate(config), [config]);
  /*
   * The gem-equivalent baseline ending values are judged against — gems plus
   * starting gold at the config's rate, since `runValue` counts leftover gold
   * the same way. Judged against bare starting gems, a run beginning with
   * gold would read as ahead before it played anything.
   */
  const startValue = startingValue(config, startingGems, startingGold);
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
   * Replace one row's boxes, dropping the field when none are left.
   *
   * Absent rather than empty, so an edited row serialises the way the presets
   * are written and a row that had its last box removed is indistinguishable
   * from one that never had any.
   */
  const setBoxes = (wins: number, boxes: PayoutBox[]) =>
    setTier(wins, boxes.length ? { boxes } : { boxes: undefined });

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

  /**
   * Advanced settings back to their defaults, from the dialog's own footer.
   *
   * `resetAdvanced` decides where the line falls; this only puts back what it
   * returns. Every field is handed to its setter rather than the ones the
   * dialog happens to show today, so moving a field into it stays a change in
   * share.ts alone — React drops a set to the value already held, which is
   * what makes the unchanged ones free.
   */
  const resetAdvancedSettings = () => {
    const next = resetAdvanced(shareState());
    setPresetName(next.presetName);
    setConfig(next.config);
    setTrials(next.trials);
    setBankrollRuns(next.bankrollRuns);
    setSeed(next.seed);
    setStartingGems(next.startingGems);
    setStartingGold(next.startingGold);
    setMaxEvents(next.maxEvents);
    setTab(next.tab);
    setMasterySlug(next.masterySlug);
    setUnit(next.unit);
    setGemsPerUsd(next.gemsPerUsd);
    setAdvancedReset("Advanced settings reset to defaults");
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
  /*
   * One column for both kinds, since a row names the boxes it pays rather than
   * counting them in two places. Shown for the same reason points are: always
   * on Custom, so a ladder that pays none can grow one, and otherwise only
   * where the event actually ships something.
   */
  const showBoxes = isCustom || paysBoxes(config.payouts);
  const viewItems = [
    { key: "value" as const, label: valueName },
    { key: "breakdown" as const, label: "Payout breakdown" },
  ];
  const structure = config.structure;
  /*
   * A round is a match in every event here, whether that match is one game or
   * up to three, so everything the user reads is in matches and nothing needs
   * converting. The slider sets the rate the model runs on directly.
   */
  const roundWinRate = matchWinRate(config);

  const stepWin = (points: number) => {
    const next = stepWinRate(roundWinRate, points);
    set("winRate", next);
    setWinRateStepped(`Match win rate ${pct(next)}`);
  };

  const breakEvenShown = breakEven;
  // Restates the event being priced, for the Results heading — the numbers
  // below are meaningless without it.
  const structureSummary =
    structure.kind === "rounds"
      ? `${structure.rounds} rounds played in full`
      : `to ${structure.maxWins} wins or ${structure.maxLosses} losses`;

  /*
   * Tile building tolerates results that have not arrived: `result` and
   * `bankroll` are null until each first simulation lands, and every tile
   * list below collapses to empty for the skeleton to stand in. Once a
   * result exists it is never null again — recomputes dim the stale tiles
   * instead.
   */
  /** Null unless the ladder pays boxes, which is what makes the strip move. */
  const box = bankroll?.boxChance ?? null;
  /** Null only on an empty wallet, where there is nothing to return on. */
  const runRoi = bankroll === null ? null : bankrollRoi(bankroll.meanFinalValue, startValue);
  /*
   * The tiles' help popovers explain the statistics to someone who does not
   * live in them: what was averaged or counted, over which simulated runs,
   * and how to read the figure as odds where that is the natural reading.
   * The lay words carry the surface — "average", "typically", "plausibly" —
   * and each popover names the statistic behind its word, so the precise
   * vocabulary is one click away rather than ambient.
   */
  const packsTiles: StatTile[] =
    bankroll === null
      ? []
      : [
          {
            key: "packs",
            label: "Avg packs won",
            value: bankroll.holdings.packs.mean.toFixed(1),
            hint: "over the whole run",
            help: {
              label: "What average packs won means",
              content:
                "How many packs a run had collected by the time it stopped, averaged across every simulated run.",
            },
          },
        ];
  const runTiles: StatTile[] = bankroll === null ? [] : [
    {
      key: "events",
      label: "Avg events played",
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
      label: "Avg ending value",
      value: gemsEq(bankroll.meanFinalValue),
      tone: signClass(bankroll.meanFinalValue - startValue),
      // No hint: the typical (median) figure is in the sentence below and the
      // starting balance is an input a few inches away.
      // What that average is made of, as a rule under the figure it decomposes.
      children: (
        <ValueSplitBar
          slices={holdingSlices(bankroll, config)}
          m={m}
        />
      ),
      help: {
        label: "What average ending value means",
        content:
          "Everything a run holds when it stops — gems, leftover gold, and winnings priced at the rates set on the left — averaged across every simulated run. Green means the average run ends ahead of the combined value you started with, gems and gold together; red, behind it.",
      },
    },
    {
      key: "roi",
      /*
       * "Avg" as its neighbours on this strip carry it, and not as the
       * per-event tile does — that one is a bare "ROI", and the difference is
       * worth the inconsistency. Every figure on this strip is an average over
       * simulated runs, and this is the one where the average is furthest from
       * the run you should expect: a mean return of −13% on Arena Direct sits
       * against a median of −79%, since the runs that win a box carry it.
       */
      label: "Avg ROI",
      /*
       * The ending value above, restated as a return on what was put in. It
       * earns a tile of its own beside that one because the two answer
       * different questions: ≈💎 9,400 says nothing about whether that is a
       * fortune or a disappointment without the starting balance held in mind,
       * and this is that comparison already made.
       *
       * Null only when the bankroll is empty, which is the one case where
       * there is nothing to return on — an em dash rather than a percentage,
       * as the break-even tile does for a rate that does not exist.
       */
      value: runRoi === null ? "—" : pct(runRoi),
      tone: runRoi === null ? undefined : signClass(runRoi),
      /*
       * The denominator, marked ≈ because it is one: starting gold is folded
       * in at the config's rate, the same figure the inputs print under the two
       * balances. Naming it is what makes the percentage checkable against the
       * ending value beside it.
       */
      hint:
        runRoi === null
          ? "no balance to return on"
          : `of ${gemsEq(startValue)} to start`,
      help: {
        label: "What bankroll ROI means",
        content:
          "What the average run gained or lost, as a share of the balance it started with. Unlike the per-event ROI this is not per entry: it covers the whole run, so playing longer moves it — a profitable event compounds, and a losing one grinds toward −100%, which is as far as it can fall.",
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
   * The chance of coming away with a box, where the ladder pays one — and
   * nothing at all where it does not, so it spreads into the strip below
   * without a branch there.
   */
  const boxChanceTiles: StatTile[] = box && bankroll
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
      ]
    : [];

  /**
   * The bankroll tiles, in the order they earn their place.
   *
   * Four show and the rest sit behind the strip's arrow, so the order is a
   * claim about what the event is for rather than a layout detail. Boxes take
   * the front wherever the ladder pays them: they are the only reason to enter
   * an Arena Direct, and they are the one reward a mean cannot describe,
   * because 0.2 boxes is not something anyone receives.
   *
   * One order now serves both ladders, where it used to take an index shuffle
   * to move packs forward when there was no box tile to displace them. Packs
   * are last either way: they are a real part of the payout and no part of the
   * decision, and they were the tile ROI was let in ahead of.
   *
   * ROI follows the ending value it restates, the two being one figure read
   * twice — what a run came to, and what that came to per gem put in. That
   * pairing is what costs risk of ruin its slot on a box ladder, where the
   * strip runs to six: the tiles pair up as value with ROI and events played
   * with ruin, and showing one of each pair beats showing both halves of one.
   *
   * Six is the most this ever runs to. The closed-form chance of a box for a
   * single entry was among them for a while and has been taken out again: it
   * answers a question nobody asked of a page about bankrolls, and sitting in
   * the same row as the run-level chance it mostly invited the two to be
   * confused. It still exists as `boxChancePerEvent`, where it does its real
   * work of holding the simulation to account in the tests.
   */
  const bankrollTiles: StatTile[] = [...boxChanceTiles, ...runTiles, ...packsTiles];

  /*
   * Boxes per entry, where the ladder pays them. A mean rather than a chance,
   * because the two differ by more than rounding here: most winning finishes
   * are seven-win doubles, so the ladder promises more boxes than it has
   * winners. The share underneath is the chance, keeping the pair together;
   * the run-level version of that question lives on the bankroll strip.
   */
  const boxTiles: StatTile[] = result !== null && paysBoxes(config.payouts)
    ? [
        {
          key: "boxes",
          label: (
            <>
              <i className="bi bi-box-seam me-1" aria-hidden="true" />
              Expected boxes
            </>
          ),
          value: result.meanBoxes.toFixed(2),
          hint: `${pct(
            result.buckets.reduce(
              (acc, b) =>
                acc + (b.boxes > 0 ? b.probability : 0),
              0,
            ),
          )} of events win at least one`,
          help: {
            label: "What expected boxes means",
            content:
              "How many physical boxes one entry wins on average, counting a double-box finish as two. At 0.17, six entries bring home about one box between them. The share underneath counts events that win any at all — fewer, because winners often take two.",
          },
        },
      ]
    : [];

  /*
   * As on the bankroll strip, each tile carries a popover explaining the
   * statistic in plain terms — what was averaged, over what, and how to read
   * it — for a reader the bare label would leave behind.
   */
  const stats: StatTile[] = result === null ? [] : [
    {
      key: "net",
      label: "Expected net",
      value: gemsEq2(result.meanNet),
      // The band the record supports. Falls back to the sampling error of the
      // simulated mean when the rate is called certain, since there is then
      // nothing else for a range to describe.
      // No unit word: the figures above and here carry their own sign.
      hint: netBand
        ? `plausibly ${eq2(netBand[0])} to ${eq2(netBand[1])}`
        : `give or take ${eq2(1.96 * result.stdErrNet)}`,
      tone: signClass(result.meanNet),
      help: {
        label: "What expected net means",
        content: `What one entry wins or loses on average, after paying the entry. Marked ≈ because packs and other rewards are priced at the rates set on the left, not paid as gems. Any single event swings well above or below this; play many and your average result heads toward it. ${
          netBand
            ? `The range underneath covers ${pct(CREDIBLE_LEVEL, 0)} of the possibilities your win-rate record allows.`
            : "The give-or-take underneath is the simulation's own sampling wobble, a 95% confidence interval."
        }`,
      },
    },
    {
      key: "gross",
      label: "Expected gross",
      value: gemsEq2(result.meanGross),
      // No hint: the popover says what the figure folds in.
      // Which of those it is, though, the popover cannot say — a gross that is
      // mostly gems and one that is mostly packs read alike as a number.
      children: <ValueSplitBar slices={grossSlices(config, result.buckets)} m={m} />,
      help: {
        label: "What expected gross means",
        content:
          "What one event pays back on average, before subtracting what it cost to enter. Packs and other rewards are folded in at the rates set on the left.",
      },
    },
    ...boxTiles,
    {
      key: "roi",
      label: "ROI",
      value: pct(result.roi),
      /*
       * Marked ≈, and converting with the toggle, because this is what ROI
       * divides by rather than a price anyone was quoted: `meanEntryGems` is
       * the entry discounted by the share of entries gold paid for, so it
       * lands between the gem price and zero and equals neither. The no-gold
       * wording quotes the same statistic, which is why it is marked too.
       */
      hint:
        result.goldEntryFraction > 0
          ? `of ${gemsEq(result.meanEntryGems)} paid · ${pct(result.goldEntryFraction)} entries free`
          : `of ${gemsEq(config.entryCostGems)} entry`,
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
      label: "Matches",
      value: result.meanRounds.toFixed(2),
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
                  {/*
                    The two balances as the one figure the results judge runs
                    against, priced both ways — the gems Arena would show and
                    the dollars they would cost, since deciding whether a
                    bankroll is worth playing means weighing it against what
                    refilling it would charge.
                  */}
                  <div className="col-12 form-text mt-0">
                    Together worth {gemsEq(startValue)} or {altEq(startValue)}
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
                      onChange={(n) => setMaxEvents(clampInt(n, 1, SIM_LIMITS.maxEvents))}
                    />
                  </div>
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
                      Entry cost (gems)
                    </label>
                    <GemInput
                      id={ids.entry}
                      disabled={locked}
                      value={config.entryCostGems}
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
                      {showBoxes && (
                        /*
                          Held to one line. This column is as narrow as its
                          chips, which is narrower than "Boxes" plus its icon,
                          so the two wrap and the header row grows to twice
                          the height of every other column's.
                        */
                        <th scope="col" className="text-nowrap">
                          <i className="bi bi-box-seam me-1" aria-hidden="true" />
                          Boxes
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
                        {showBoxes && (
                          <td>
                            <BoxCell
                              boxes={t.boxes ?? []}
                              table={config.boxPrices}
                              locked={locked}
                              onChange={(boxes) => setBoxes(t.wins, boxes)}
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
                    onChange={(e) => setMasterySlug(e.target.value)}
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
                    {/* Visible from any tab, unlike the dimmed panel itself. */}
                    {(eventPending || bankrollPending) && (
                      <span
                        className="spinner-border spinner-border-sm ms-2 text-secondary"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                }
              />

              <TabPanel group={ids.resultTabs} active={tab}>
              {/*
                The last branch is the per-event panel rather than a
                `tab === "event"` test, so a tab added above without its own
                rung here renders that panel silently. Add the rung.
              */}
              {tab === "about" ? (
                <About
                  config={config}
                  m={m}
                  onShowBoxPrices={() => boxPricesModal.current?.show()}
                />
              ) : tab === "mastery" ? (
                <Mastery track={masteryTrack} config={config} m={m} />
              ) : tab === "bankroll" ? (
                <>
                  <div className="form-text mb-2">
                    As in tournament poker, your profitability depends on how
                    much you start with: with too small a bankroll, an ordinary
                    losing streak ends the run before the long-term averages
                    can arrive. We simulate entering the same event repeatedly,
                    recycling your gem and gold winnings, and summarise the
                    thousands of outcomes below.
                  </div>
                  {bankrollError != null && (
                    <div className="alert alert-warning" role="alert">
                      {bankroll === null
                        ? "The simulation failed to run. Adjust any input to retry."
                        : "The simulation failed — showing previous results. Adjust any input to retry."}
                    </div>
                  )}
                  {bankroll === null ? (
                    <ResultsPlaceholder variant="bankroll" />
                  ) : (
                  <SimPending pending={bankrollPending}>
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
                          label={`Final ${valueName}`}
                          help={{
                            label: "What the final value figures mean",
                            content:
                              "Every simulated run, sorted from worst ending value to best. Half the runs ended with at least the median; p5 marks a run that only 5% did worse than, and p95 one that only 5% did better than.",
                          }}
                        >
                          <PercentileSummary
                            percentiles={bankroll.valuePercentiles}
                            fmt={gemsEq}
                            tone={(v) => signClass(v - startValue)}
                            noun="runs"
                          />
                        </Stat>
                        <ValueHistogram
                          bins={bankroll.valueHistogram}
                          m={m}
                          markers={[
                            {
                              // The gem-equivalent start, not the gem balance:
                              // the axis this sits on counts gold, so the line
                              // must too, or beginning with gold reads as an
                              // immediate gain. Marked ≈ like every figure on
                              // this chart.
                              at: startValue,
                              // Carrying the figure, as the events histogram's
                              // median does: the axis under a landmark is
                              // lettered in thousands, so the line alone says
                              // roughly where you began and never what it was.
                              label: `starting ${gemsEq(startValue)}`,
                              tone: "start",
                            },
                            {
                              at: bankroll.medianFinalValue,
                              // "Typically", as the tiles say — the popover on
                              // the tile above teaches that the word means the
                              // median.
                              label: `typically ${gemsEq(bankroll.medianFinalValue)}`,
                              tone: "median",
                            },
                          ]}
                        />
                      </>
                    ) : (
                      <PayoutBreakdown bankroll={bankroll} config={config} m={m} />
                    )}
                  </TabPanel>
                  </div>

                  <RunLog samples={bankroll.samples} config={config} m={m} />
                  </SimPending>
                  )}
                </>
              ) : (
                <>
              <div className="form-text mb-2">
                Conventional analysis: the (possibly very) long-term
                expectations for this event, assuming a bankroll deep enough
                that you can always afford the next entry. Every figure is per
                event: what an average entry wins or loses, and how the
                possible finishes are spread.
              </div>
              {eventError != null && (
                <div className="alert alert-warning" role="alert">
                  {result === null
                    ? "The simulation failed to run. Adjust any input to retry."
                    : "The simulation failed — showing previous results. Adjust any input to retry."}
                </div>
              )}
              {result === null ? (
                <ResultsPlaceholder variant="event" />
              ) : (
              <SimPending pending={eventPending}>
              <div className="row g-2">
                {stats.map(({ key, ...s }) => (
                  <div key={key} className="col-6 col-xl-4">
                    <Stat {...s} />
                  </div>
                ))}
              </div>

              <SectionHeading
                className="mt-4"
                title="Distribution of outcomes by record"
                subtitle="Bars are the simulation; the tick mark is the closed-form probability."
              />
              <DistributionChart records={result.records} />

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
                  {/*
                    Closed form throughout, the simulated columns having been
                    dropped: an "Events" count and a "Simulated" percentage
                    were the Monte Carlo answering, to two decimal places, the
                    question the column beside them answered exactly. `Chance`
                    therefore reads as itself — `Exact` only ever earned that
                    name against the column it sat beside.

                    So the table no longer carries its own check on the
                    simulation, and where that check lives is worth knowing
                    before anyone puts a figure back: `model.test.ts` pins
                    every bucket to within half a point of the closed form,
                    and the distribution chart above draws both and names
                    them. Nothing here is a sampled figure to be checked
                    anyway — the tiles above are, and they carry the interval.
                  */}
                  <thead>
                    <tr>
                      <th scope="col">Wins</th>
                      <th scope="col" className="text-end">
                        Chance
                      </th>
                      <th scope="col">Pays</th>
                      {/*
                        The ≈ is declared once, on the column, rather than on
                        every signed cell below it — the same way an axis names
                        its unit. The About tab's wording list says what it
                        means.
                      */}
                      <th scope="col" className="text-end">
                        Gross ≈
                      </th>
                      <th scope="col" className="text-end">
                        Net ≈
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.buckets.map((b) => {
                      const tier = payoutFor(config, b.wins);
                      return (
                        <tr key={b.wins}>
                          <td className="fw-semibold text-primary">{b.wins}</td>
                          <td className="text-end">{pct(b.exactProbability, 2)}</td>
                          {/*
                            What the finish awards, itemised as the run log
                            itemises an event that paid it. The pool is not
                            here — it comes with entering rather than with a
                            finish, so it is flat down the column and would be
                            eight repetitions of one fact. The note says it
                            once instead.
                          */}
                          <td>
                            <PayoutParts
                              prices={config.boxPrices}
                              payout={{
                                gems: tier.gems,
                                packs: b.packs,
                                playInPoints: b.playInPoints,
                                boxes: tier.boxes ?? [],
                              }}
                            />
                          </td>
                          <td className="text-end">{eq(b.grossGems)}</td>
                          <td className={`text-end ${signClass(b.netGems)}`}>
                            {eq(b.netGems)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-top">
                      <td colSpan={4} className="fw-semibold">
                        Expected net per event
                      </td>
                      {/*
                        Under Net, which is the column it is the mean of:
                        every row's net weighted by the chance beside it. The
                        per-row products used to be a column of their own and
                        are a multiplication instead, on the two columns above.

                        Closed form, because those two columns are — so the
                        arithmetic closes on what is shown. It is the simulated
                        mean that the "Expected net" tile carries, with the
                        interval that belongs to a sampled figure.
                      */}
                      <td
                        className={`text-end fw-semibold ${signClass(result.exactMeanNet)}`}
                      >
                        {gemsEq2(result.exactMeanNet)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {/*
                The pool, said once. It is in every row's gross and in none of
                their Pays, being what entering buys rather than what finishing
                pays — and printing it on all eight rows would be eight
                statements of one flat figure. A phantom event keeps no pool
                and gets no line, rather than an empty one.
              */}
              {config.draftPacks > 0 ? (
                <div className="form-text">
                  Every gross also carries the pool you keep — {config.draftPacks}{" "}
                  {config.draftPacks === 1 ? "pack" : "packs"}&rsquo; worth of cards,{" "}
                  {gemsEq(config.draftPacks * config.draftPackValueGems)} — which
                  entering pays for however the event goes.
                </div>
              ) : null}
              </SimPending>
              )}
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
                      Generic play box value (USD)
                      <InfoTip
                        label="About generic play box value"
                        content="What a Play Booster box is worth when no set is named — an average street price across three recent Standard sets. A payout naming a set is priced at that set's own market price instead. Zero here values every box at nothing, named or not."
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
                        content="What a Collector Booster box is worth when no set is named. These trade well above the $479.88 MSRP of a 12-pack display, and vary widely by set — a named payout uses that set's own price."
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

              {/*
                The Mastery tab's rates, which no event ladder pays. Kept in
                their own group rather than mixed into the reward values above:
                these price a season's pass, and the four cosmetics are all zero
                by default, so a reader scanning the group above should not have
                to wonder why five of its fields do nothing.
              */}
              <div className="adv-group mb-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h3 className="section-title mb-0">Mastery rewards</h3>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() =>
                      update({
                        ...config,
                        draftTokenValueGems: 0,
                        mythicIcrValueGems: 0,
                        rareCardValueGems: 0,
                        uncommonIcrValueGems: 0,
                      })
                    }
                  >
                    Zero these out
                  </button>
                </div>
                <div className="row g-2">
                  <div className="col-6">
                    <label htmlFor={ids.draftTokenValue} className="form-label">
                      Draft token value ({m.label})
                      <InfoTip
                        label="About draft token value"
                        content="A Player Draft token is redeemable for a Premier or Traditional Draft entry, both of which cost 1,500 gems — so it is priced at the entry it replaces. That holds if you would have drafted anyway; if you would not, what the entry returns is the better figure, and at most win rates it is smaller."
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
                        content="Arena's published duplicate protection: a mythic you already hold four of converts to 40 gems. Higher than a pack because a card reward has no rare slot to lose to a wildcard."
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
                      Rare card value ({m.label})
                      <InfoTip
                        label="About rare card value"
                        content="The published rare buyout, 20 gems on a complete collection."
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
                        content="An uncommon has no gem buyout, so this is only its 5% chance of upgrading to a rare — about 1.1 gems. It is what every mastery level past the cap pays."
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
                    <label htmlFor={ids.orbValue} className="form-label">
                      Mastery Orb value ({m.label})
                      <InfoTip
                        label="About Mastery Orb value"
                        content="Zero by default, for want of anything to derive a figure from: an orb buys a card style or an avatar in the Mastery Emporium, and neither has a gem price."
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
                        content="Cosmetic, so zero by default. Nothing in Arena converts a style to currency."
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
                        content="How many single events the Per event tab simulates; it does not touch the Bankroll tab. More of them narrow the confidence interval on the mean, and bring the simulation closer to the closed-form figures in the outcome table."
                      />
                    </label>
                    <NumberInput
                      id={ids.trials}
                      min={1}
                      value={trials}
                      onChange={(n) => setTrials(clampInt(n, 1, SIM_LIMITS.trials))}
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
                      onChange={(n) => setBankrollRuns(clampInt(n, 1, SIM_LIMITS.bankrollRuns))}
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
              {/*
                Held to the far end, away from Done: one button leaves the
                dialog and the other changes what is in it, and they should not
                be adjacent. Disabled when there is nothing left to restore,
                which is also what tells you the dialog is untouched — the
                fields themselves never say so, since a default is just a
                number sitting in a box.
              */}
              <button
                type="button"
                className="btn btn-outline-secondary me-auto"
                disabled={isAdvancedDefault(shareState())}
                onClick={resetAdvancedSettings}
              >
                <i
                  className="bi bi-arrow-counterclockwise me-1"
                  aria-hidden="true"
                />
                Reset to defaults
              </button>
              <span className="visually-hidden" aria-live="polite">
                {advancedReset}
              </span>
              <button type="button" className="btn btn-primary" data-bs-dismiss="modal">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Where the two box values come from, reached from beside them in
          Advanced settings. Scrollable and wide: it is twenty rows of six
          columns, and a dialog that grew to fit them would run off a laptop
          screen. */}
      <div
        className="modal fade"
        tabIndex={-1}
        ref={boxPricesEl}
        aria-labelledby={ids.boxPricesTitle}
      >
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h6 mb-0" id={ids.boxPricesTitle}>
                Box prices by set
              </h2>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              <BoxPrices
                feed={boxFeed}
                playBoxValueGems={config.playBoxValueGems}
                collectorBoxValueGems={config.collectorBoxValueGems}
                gemsPerUsd={gemsPerUsd}
                now={boxPricesAt}
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                data-bs-dismiss="modal"
              >
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
                    {topUp.name} costs {gems(topUp.entryGems)} and you have{" "}
                    {gems(startingGems)}.
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
