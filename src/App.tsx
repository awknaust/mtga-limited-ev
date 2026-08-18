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
import { BoxPrices } from "./components/BoxPrices";
import { DistributionChart } from "./components/DistributionChart";
import { EvCurveChart } from "./components/EvCurveChart";
import { EventFields } from "./components/EventFields";
import { EventsHistogram } from "./components/EventsHistogram";
import { InfoTip } from "./components/InfoTip";
import {
  GemInput,
  GoldInput,
  MoneyInput,
  PointsInput,
  NumberInput,
  UsdInput,
  clampInt,
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
  BAKED_BOX_PRICES,
  CURRENT_MASTERY_TRACK,
  CUSTOM_PRESET,
  MASTERY_TRACKS,
  PRESETS,
  bankrollRoi,
  masteryBySlug,
  breakEvenWinRate,
  configFromPreset,
  eventExpectation,
  expectedNetAt,
  goldPerEvent,
  matchWinRate,
  netInterval,
  CREDIBLE_LEVEL,
  probProfitable,
  winRateInterval,
  winRatePosterior,
  maxRounds,
  boxChancePerEvent,
  payoutFor,
  paidRewards,
  paysBoxes,
  startingValue,
  withLiveBoxPrices,
  type BoxPriceFeed,
  type EventConfig,
} from "./lib";
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
import { useSimulateBankrolls } from "./hooks/useSimulation";

/** An event the current balance cannot enter, and what to do about it. */
type TopUp = {
  name: string;
  entryGems: number;
  /** 0 where the event takes gems only, which changes what the prompt says. */
  goldPrice: number;
  /** 0 where the event takes no play-in points, which is every event but two. */
  pointPrice: number;
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
  { key: "event" as const, label: "Long-term value" },
  { key: "mastery" as const, label: "Mastery" },
  { key: "about" as const, label: "About" },
];

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

/**
 * A tile per kind of pack, drawn only for the kinds the ladder actually pays.
 *
 * Three kinds and never three tiles: an event pays ordinary packs, or mythic
 * packs beside them, or Cube Prize Packs instead of them, and no ladder has
 * ever paid all three. Contender is the most this reaches — packs and mythic
 * packs — which is what keeps the strip at the six it is designed around,
 * since that ladder pays no boxes and so has no box tile to displace.
 *
 * Folding any two of them into one figure is the thing this change undid: the
 * three carry separate rates, so a single "packs won" would be a count of
 * things that are not the same thing and could be priced only by picking one.
 */
const PACK_TILES = [
  {
    key: "packs",
    label: "Avg packs won",
    help: {
      label: "What average packs won means",
      content: "Packs a run holds when it stops, averaged over all simulated runs.",
    },
  },
  {
    key: "mythicPacks",
    label: "Avg mythic packs won",
    help: {
      label: "What average mythic packs won means",
      content:
        "Mythic packs a run holds when it stops, averaged over all simulated runs. Counted and priced apart from ordinary packs.",
    },
  },
  {
    key: "cubePacks",
    label: "Avg cube packs won",
    help: {
      label: "What average cube packs won means",
      content:
        "Cube Prize Packs a run holds when it stops, averaged over all simulated runs. The cube drafts pay these instead of ordinary packs, at their own rate.",
    },
  },
] as const;

export default function App({
  boxFeed,
}: {
  /**
   * The live box-price feed, or null where there is none — previews, dev
   * without the proxy, an outage. Fetched once by main.tsx before the first
   * render, which is what lets the page open on today's prices rather than
   * paint the shipped copy and correct it a moment later.
   */
  boxFeed: BoxPriceFeed | null;
}) {
  /*
   * The query string is the only place state persists. It is read once here
   * and written back on every change, so the address bar always describes what
   * is on screen and is shareable as it stands. Defaults live in share.ts
   * rather than in these initialisers: a default that disagreed with the one
   * the encoder measures against would be written into every link.
   *
   * The live feed is applied here, to the decoded state, so the first state is
   * the priced one. It supplies the per-set table and nothing else: the two
   * generic box values are the build's own and only the reader moves them, so
   * a fresh load reads as untouched and writes nothing into the link.
   */
  const [initial] = useState(() => {
    const decoded = decodeShareState(window.location.search);
    return boxFeed === null
      ? decoded
      : { ...decoded, config: withLiveBoxPrices(decoded.config, boxFeed, new Date()) };
  });
  const [config, setConfig] = useState<EventConfig>(initial.config);
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
  // Only the Qualifier Play-Ins spend these, and nothing here refills them.
  const [startingPlayInPoints, setStartingPlayInPoints] = useState(
    initial.startingPlayInPoints,
  );
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
    bankrollRuns,
    seed,
    startingGems,
    startingGold,
    startingPlayInPoints,
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
    bankrollRuns,
    seed,
    startingGems,
    startingGold,
    startingPlayInPoints,
    maxEvents,
    tab,
    masterySlug,
    unit,
    gemsPerUsd,
  ]);

  /*
   * The feed the dialog shows — the payload itself, not the two defaults
   * derived from it, since the table quotes prices and says nothing about
   * which of them were averaged. Fetched in main.tsx before this component
   * ever rendered, so it is a prop rather than state: the live one where the
   * feed could be reached, else the copy the app shipped with, and only the
   * note above the table says which. Nothing arrives later, and nothing here
   * changes shape after first paint.
   */
  const shownFeed = boxFeed ?? BAKED_BOX_PRICES.feed;

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
   * Whether the Advanced dialog is open, which holds the bankroll simulation:
   * its edits apply together when it closes rather than one recompute per
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

  /*
   * The custom event's editor, and whether it is open — which holds the
   * bankroll simulation for the same reason the Advanced dialog does: its
   * edits are meant to apply together, and a ladder is edited a row at a
   * time. Nothing behind the backdrop is legible while it is up, so the run
   * it would have made is one nobody could read.
   *
   * Opened from the page rather than from inside another dialog, like the
   * box-price table, which is what keeps it a plain `show()` — Bootstrap
   * stacks backdrops that outlive them both if two are raised at once. The
   * box picker inside it is a native `<dialog>` and not subject to that; see
   * `AddBox`.
   */
  const editorEl = useRef<HTMLDivElement>(null);
  const editorModal = useRef<Modal | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  /*
   * Bumped when the editor's "Copy values from" loads another event, and used
   * as the editor's `key`, which is React's way of saying "this is a
   * different thing now, start it over". What starts over is which payout
   * columns are on screen: those are the editor's own state rather than the
   * config's, and copying an Arena Direct should bring its boxes column along
   * while copying a draft leaves it behind. Nothing about the model, so it is
   * not in the share state — two links that copied different events and
   * ended up at the same ladder are the same link.
   */
  const [copyGeneration, setCopyGeneration] = useState(0);
  useEffect(() => {
    const el = editorEl.current;
    if (!el) return;
    editorModal.current = new Modal(el);
    const onShow = () => setEditorOpen(true);
    const onHide = () => setEditorOpen(false);
    el.addEventListener("show.bs.modal", onShow);
    el.addEventListener("hide.bs.modal", onHide);
    return () => {
      el.removeEventListener("show.bs.modal", onShow);
      el.removeEventListener("hide.bs.modal", onHide);
      editorModal.current?.dispose();
      editorModal.current = null;
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
    copyFrom: `${uid}-copy-from`,
    winRate: `${uid}-win-rate`,
    draftPackValue: `${uid}-draft-pack-value`,
    goldPerDay: `${uid}-gold-per-day`,
    eventsPerDay: `${uid}-events-per-day`,
    goldRate: `${uid}-gold-rate`,
    packValue: `${uid}-pack-value`,
    mythicPackValue: `${uid}-mythic-pack-value`,
    cubePackValue: `${uid}-cube-pack-value`,
    funValue: `${uid}-fun-value`,
    playInValue: `${uid}-play-in-value`,
    qualifierTokenValue: `${uid}-qualifier-token-value`,
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
    bankrollRuns: `${uid}-bankroll-runs`,
    seed: `${uid}-seed`,
    startGems: `${uid}-start-gems`,
    startGold: `${uid}-start-gold`,
    startPoints: `${uid}-start-points`,
    maxEvents: `${uid}-max-events`,
    gemsPerUsd: `${uid}-gems-per-usd`,
    confMatches: `${uid}-conf-matches`,
    masterySeason: `${uid}-mastery-season`,
    masteryPrice: `${uid}-mastery-price`,
    resultTabs: `${uid}-results`,
    viewTabs: `${uid}-view`,
    topUpTitle: `${uid}-top-up-title`,
    boxPricesTitle: `${uid}-box-prices-title`,
    editorTitle: `${uid}-editor-title`,
  };

  /*
   * The bankroll simulation lives in a worker, debounced behind the inputs;
   * everything on the Long-term value tab is closed form and computed here,
   * live. The params object is memoised so the hook sees one identity per
   * actual change, and the *object* is what debounces — a flush is atomic,
   * so no render can pair this keystroke's runs with the last one's seed.
   *
   * What the debounce delays is the *run*, not the saying so. The hook
   * measures pending against these live params, so the results dim and the
   * spinner appears on the render that takes the keystroke, and only the
   * recompute waits for the typing to stop. Getting that the wrong way round
   * is what made this feel jarring: nothing happened for 300 ms, and then
   * everything did at once.
   *
   * Two changes do not wait. Either dialog being open is a hold — the
   * Advanced settings and the custom event's editor both apply their edits
   * together, and the run goes the moment the dialog closes. And a preset
   * pick runs at once: one deliberate choice with no run of repeats behind
   * it, for which the delay would be latency for nothing. The preset's name
   * is what says one was picked — it moves then and only then — so it is
   * handed over as the thing to flush on rather than a flag the handler
   * would have to set and something else reset. Only the main selector: the
   * editor's "Copy from…" changes the config under the same name, and is
   * held with the rest of that dialog's edits.
   */
  const bankrollParams = useMemo(
    () => ({
      config,
      startingGems,
      startingGold,
      startingPlayInPoints,
      maxEvents,
      runs: bankrollRuns,
      seed,
    }),
    [
      config,
      startingGems,
      startingGold,
      startingPlayInPoints,
      maxEvents,
      bankrollRuns,
      seed,
    ],
  );
  const {
    result: bankroll,
    pending: bankrollPending,
    error: bankrollError,
  } = useSimulateBankrolls(bankrollParams, {
    hold: advancedOpen || editorOpen,
    flushOn: presetName,
  });
  /*
   * What one entry is worth, exactly. A sum over the outcome distribution
   * rather than a simulation, so it needs no worker, no debounce, no
   * pending state and no seed: it is as current as the inputs are.
   */
  const event = useMemo(() => eventExpectation(config), [config]);
  const breakEven = useMemo(() => breakEvenWinRate(config), [config]);
  /*
   * The gem-equivalent baseline ending values are judged against — gems plus
   * starting gold at the config's rate, since `runValue` counts leftover gold
   * the same way. Judged against bare starting gems, a run beginning with
   * gold would read as ahead before it played anything.
   */
  const startValue = startingValue(
    config,
    startingGems,
    startingGold,
    startingPlayInPoints,
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
     * which is why the test is whether *any* of the three currencies covers
     * one entry rather than whether all of them do. Points are one of the
     * three now: someone holding twenty of them can enter a Play-In with an
     * empty gem balance, and interrupting them would be plain wrong.
     */
    const gemsCover = startingGems >= preset.entryCostGems;
    const goldPrice = preset.entryCostGold ?? 0;
    const goldCovers = goldPrice > 0 && startingGold >= goldPrice;
    const pointPrice = preset.entryCostPlayInPoints ?? 0;
    const pointsCover = pointPrice > 0 && startingPlayInPoints >= pointPrice;
    if (gemsCover || goldCovers || pointsCover) return;
    setTopUp({
      name: preset.name,
      entryGems: preset.entryCostGems,
      goldPrice,
      pointPrice,
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
    setBankrollRuns(next.bankrollRuns);
    setSeed(next.seed);
    setStartingGems(next.startingGems);
    setStartingGold(next.startingGold);
    setStartingPlayInPoints(next.startingPlayInPoints);
    setMaxEvents(next.maxEvents);
    setTab(next.tab);
    setMasterySlug(next.masterySlug);
    setUnit(next.unit);
    setGemsPerUsd(next.gemsPerUsd);
    setAdvancedReset("Values and assumptions reset to defaults");
  };

  /*
   * A preset describes a real event, so its definition is read-only wherever
   * it is shown; Custom is the one you own, and the dialog is where it is
   * edited. The panel in the column is a record either way, which is what
   * spares this the "half-edited Premier Draft" question entirely.
   */
  const isCustom = presetName === CUSTOM_PRESET;
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
   * Which pack tiles the bankroll strip draws. A narrower question than the
   * editor's columns, which live with the table in `EventFields`: an empty
   * column is an invitation to fill it, where an "Avg packs won 0.0" tile is
   * only noise.
   */
  const paidPacks: string[] = paidRewards(config.payouts);
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
      ? `${structure.rounds} round${structure.rounds === 1 ? "" : "s"} played in full`
      : `to ${structure.maxWins} win${structure.maxWins === 1 ? "" : "s"} or ${structure.maxLosses} loss${structure.maxLosses === 1 ? "" : "es"}`;

  /*
   * Bankroll tile building tolerates a result that has not arrived:
   * `bankroll` is null until the first simulation lands, and every tile list
   * below collapses to empty for the skeleton to stand in. Once a result
   * exists it is never null again — recomputes dim the stale tiles instead.
   * The per-event tiles further down have no such state: they are closed
   * form and always current.
   */
  /** Null unless the ladder pays boxes, which is what makes the strip move. */
  const box = bankroll?.boxChance ?? null;
  /** Null unless the ladder pays a Qualifier token, i.e. on the two Play-Ins. */
  const token = bankroll?.tokenChance ?? null;
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
      : PACK_TILES.filter(({ key }) => paidPacks.includes(key)).map(
          ({ key, label, help }) => ({
            key,
            label,
            value: bankroll.holdings[key].mean.toFixed(1),
            hint: "over the whole run",
            help,
          }),
        );
  const runTiles: StatTile[] = bankroll === null ? [] : [
    {
      key: "events",
      label: "Avg events played",
      value: bankroll.meanEvents.toFixed(1),
      hint: `typically ${bankroll.eventPercentiles.p50}`,
      help: {
        label: "What average events played means",
        content:
          "Events a run enters before it stops, averaged over all simulated runs. \"Typically\" is the median: half of runs played at least that many.",
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
          "Everything a run holds when it stops (gems, leftover gold, and rewards at your rates), averaged over all simulated runs. Green: the average run ends ahead of what you started with, gems and gold together. Red: behind.",
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
          "What the average run gained or lost, as a share of its starting balance. Unlike the per-event ROI it covers the whole run, so playing longer moves it: a profitable event compounds and a losing one grinds toward −100%.",
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
          "The share of simulated runs that went broke (could no longer afford an entry) before reaching your stop limit. At 25%, one player in four goes bust along the way.",
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
           * simulated proportion when the rate is called certain, since there
           * is then nothing else for a ± to describe — the one place the app
           * quotes a sampling error, this being the one simulated tile with a
           * figure the reader is asked to trust to a point.
           */
          hint: box.interval
            ? `plausibly ${pct(box.interval[0])} to ${pct(box.interval[1])}`
            : `give or take ${pct(1.96 * Math.sqrt((box.probAny * (1 - box.probAny)) / bankroll.trials))}`,
          help: {
            label: "What chance of a box means",
            content: `The share of simulated runs that won at least one box. At 10%, one player in ten who plays this way walks away with one. ${
              box.interval
                ? `The range underneath is this chance at each end of the win rates your record supports, covering ${pct(box.level, 0)} of them.`
                : "With the win rate exactly known, the give-or-take underneath is only the simulation's sampling noise (95% confidence)."
            }`,
          },
        },
      ]
    : [];

  /**
   * The same question for the Play-Ins, and the only one worth asking of them.
   *
   * A Play-In pays gems down its whole ladder, so unlike an Arena Direct it is
   * not a lottery with a consolation prize — but the thing anyone enters one
   * *for* is the Qualifier Weekend seat, which is won at the top and nowhere
   * else. There is no expected-tokens counterpart to this on the other tab, and
   * there should not be: a second token is redundant, so a mean would count
   * something nobody receives.
   *
   * Two chance tiles never appear together on any preset — no ladder pays both
   * a box and a token — so this costs the strip nothing where it is not shown.
   */
  const tokenChanceTiles: StatTile[] = token && bankroll
    ? [
        {
          key: "token",
          label: (
            <>
              <i className="bi bi-trophy me-1" aria-hidden="true" />
              Chance of a qualifier token
            </>
          ),
          value: pct(token.probAny),
          // Same reading as the box band above, and the same fallback when the
          // rate is called certain and there is no range left to report.
          hint: token.interval
            ? `plausibly ${pct(token.interval[0])} to ${pct(token.interval[1])}`
            : `give or take ${pct(1.96 * Math.sqrt((token.probAny * (1 - token.probAny)) / bankroll.trials))}`,
          help: {
            label: "What chance of a qualifier token means",
            content: `The share of simulated runs that won at least one Qualifier Weekend token — the seat a Play-In is played for. At 10%, one player in ten who plays this way earns one. Winning a second is no better than winning one, so this is a chance rather than an average. ${
              token.interval
                ? `The range underneath is this chance at each end of the win rates your record supports, covering ${pct(token.level, 0)} of them.`
                : "With the win rate exactly known, the give-or-take underneath is only the simulation's sampling noise (95% confidence)."
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
   * Six is the most this ever runs to on a preset. The two prize tiles are
   * mutually exclusive across every event here — the Arena Directs pay boxes,
   * the Play-Ins pay tokens, and nothing pays both — so only one is ever at
   * the front. A *custom* ladder paying both would reach seven, which the
   * strip scrolls rather than breaks on.
   *
   * The closed-form chance of a box for a single entry was among them for a
   * while and has been taken out again: it answers a question nobody asked of
   * a page about bankrolls, and sitting in the same row as the run-level
   * chance it mostly invited the two to be confused. It lives on the Long-term
   * value tab, under the expected-boxes tile, and holds this simulation to
   * account in the tests.
   */
  const bankrollTiles: StatTile[] = [
    ...boxChanceTiles,
    ...tokenChanceTiles,
    ...runTiles,
    ...packsTiles,
  ];

  /*
   * Boxes per entry, where the ladder pays them. A mean rather than a chance,
   * because the two differ by more than rounding here: most winning finishes
   * are seven-win doubles, so the ladder promises more boxes than it has
   * winners. The share underneath is the chance, keeping the pair together;
   * the run-level version of that question lives on the bankroll strip.
   */
  const boxTiles: StatTile[] = paysBoxes(config.payouts)
    ? [
        {
          key: "boxes",
          label: (
            <>
              <i className="bi bi-box-seam me-1" aria-hidden="true" />
              Expected boxes
            </>
          ),
          value: event.meanBoxes.toFixed(2),
          hint: `${pct(boxChancePerEvent(config))} of events win at least one`,
          help: {
            label: "What expected boxes means",
            content:
              "How many boxes one entry wins on average, counting a double-box finish as two. At 0.17, six entries bring home about one box between them. The share underneath counts events that win any at all; it is lower, since winners often take two.",
          },
        },
      ]
    : [];

  /*
   * As on the bankroll strip, each tile carries a popover explaining the
   * statistic in plain terms — what was averaged, over what, and how to read
   * it — for a reader the bare label would leave behind. Every figure here is
   * exact for the win rate on the slider; the only uncertainty worth carrying
   * is how much of a guess that rate is, and the net tile carries it.
   */
  const stats: StatTile[] = [
    {
      key: "net",
      label: "Expected net",
      value: gemsEq2(event.meanNet),
      /*
       * The band the record supports. There is nothing to fall back to when
       * the rate is called certain: the figure is then exact, and the hint
       * says so rather than going quiet, since a range that was there a
       * moment ago and is not now should say why.
       * No unit word: the figures above and here carry their own sign.
       */
      hint: netBand
        ? `plausibly ${eq2(netBand[0])} to ${eq2(netBand[1])}`
        : "exact, at a win rate you called certain",
      tone: signClass(event.meanNet),
      help: {
        label: "What expected net means",
        content: `What one entry wins or loses on average, after the entry fee. Marked ≈ because packs and other rewards are priced at your rates, not paid as gems.${
          netBand
            ? ` The range underneath covers ${pct(CREDIBLE_LEVEL, 0)} of what your win-rate record allows.`
            : ""
        }`,
      },
    },
    {
      key: "gross",
      label: "Expected gross",
      value: gemsEq2(event.meanGross),
      // No hint: the popover says what the figure folds in.
      // Which of those it is, though, the popover cannot say — a gross that is
      // mostly gems and one that is mostly packs read alike as a number.
      children: <ValueSplitBar slices={grossSlices(config)} m={m} />,
      help: {
        label: "What expected gross means",
        content:
          "What one event pays back on average, before the entry fee. Packs and other rewards are counted at your rates.",
      },
    },
    ...boxTiles,
    {
      key: "roi",
      label: "ROI",
      value: pct(event.roi),
      /*
       * Marked ≈, and converting with the toggle, because this is what ROI
       * divides by rather than a price anyone was quoted: `entryGems` is the
       * entry discounted by the share of entries gold pays for, so it lands
       * between the gem price and zero and equals neither. The no-gold
       * wording quotes the same statistic, which is why it is marked too.
       */
      hint:
        event.goldEntryFraction > 0
          ? `of ${gemsEq(event.entryGems)} paid · ${pct(event.goldEntryFraction)} entries free`
          : `of ${gemsEq(config.entryCostGems)} entry`,
      tone: signClass(event.roi),
      help: {
        label: "What ROI means",
        content:
          "Expected net as a share of the entry fee. At −10%, an average entry gives back 90 for every 100 paid; positive means it more than pays for itself.",
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
          "The match win rate at which the average event exactly pays back its entry. Win more often and the event makes money on average; less often and it loses.",
      },
    },
    {
      key: "p-profit",
      label: "P(profit)",
      value: pct(event.probProfit),
      hint: "of events end net positive",
      help: {
        label: "What P(profit) means",
        content:
          "The chance one event ends worth more than its entry. It can be under 50% even when the event is profitable on average, because a few big finishes carry the average.",
      },
    },
    {
      key: "matches",
      label: "Matches",
      value: event.meanRounds.toFixed(2),
      hint: `max ${maxRounds(structure)}`,
      help: {
        label: "What matches per event means",
        content:
          "How many matches one event lasts on average.",
      },
    },
  ];

  return (
    <div className="container-xl py-4">
      <header className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div>
          <h1 className="h3 mb-1">MTGA Limited EV</h1>
          <p className="text-body-secondary mb-0">
            The quest for going infinite: an analyzer for the value of MTGA
            events and passes.
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
                      onChange={setStartingPlayInPoints}
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
                    <label htmlFor={ids.maxEvents} className="form-label">
                      Stop after (events)
                      <InfoTip
                        label="About the event limit"
                        content="Where you stop playing. A run that never goes broke has to end somewhere, and how long you keep going changes the ending balance."
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

              {/* Opens the dialog the code and `share.ts` still call
                  "advanced" — reward values, win rate confidence, gold, the
                  dollar rate and the simulation's size and seed. */}
              <button
                type="button"
                className="btn btn-outline-secondary w-100"
                onClick={() => modal.current?.show()}
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
                {/* The only way into the editor, and shown only where there
                    is something to edit: a preset's numbers are the event's
                    own, and the panel below reads the same either way. */}
                {isCustom && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary w-100 mt-2"
                    onClick={() => editorModal.current?.show()}
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
                <EventFields config={config} locked onChange={setConfig} />
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
                    {bankrollPending && (
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
                    <ResultsPlaceholder />
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
                              "Every simulated run, sorted from worst ending value to best. Half the runs ended at or above the median; only 5% ended below p5, and only 5% above p95.",
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
                event and exact for the win rate you set: what an average
                entry wins or loses, and how the possible finishes are spread.
              </div>
              {/*
                No placeholder, no pending state and no error alert here,
                unlike the Bankroll tab: nothing on this tab is simulated.
                Every figure is a sum over the exact outcome distribution,
                computed in render, so it is never waiting on anything.
              */}
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
                subtitle="How likely each finishing record is, at your win rate."
              />
              <DistributionChart records={event.records} />

              <SectionHeading
                className="mt-4"
                title="Expected net by win rate"
                subtitle="Per match win rate, against expected net gems."
              >
                <InfoTip
                  label="About the expected net curve"
                  content="The dot is where you are, the dashed line is break-even, and the shaded band is the win rates your record supports."
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
                    Closed form, like everything else on the tab: one row per
                    win count, its exact chance, what the rung pays and what
                    that comes to. The pool is stated once beneath rather than
                    repeated down the rows.
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
                    {event.outcomes.map((b) => {
                      const tier = payoutFor(config, b.wins);
                      return (
                        <tr key={b.wins}>
                          <td className="fw-semibold text-primary">{b.wins}</td>
                          <td className="text-end">{pct(b.probability, 2)}</td>
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
                                mythicPacks: b.mythicPacks,
                                cubePacks: b.cubePacks,
                                playInPoints: b.playInPoints,
                                qualifierTokens: b.qualifierTokens,
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
                        are a multiplication instead, on the two columns above
                        — so the arithmetic closes on what is shown, and this
                        is the same number the "Expected net" tile carries.
                      */}
                      <td
                        className={`text-end fw-semibold ${signClass(event.meanNet)}`}
                      >
                        {gemsEq2(event.meanNet)}
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
                </>
              )}
              </TabPanel>
            </div>
          </div>
        </div>
      </div>

      <footer className="site-footer">
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
              <h2 className="modal-title h6 mb-0">Values &amp; assumptions</h2>
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
                      update({
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
                      Rare card value ({m.label})
                      <InfoTip
                        label="About rare card value"
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
                        content="Gold from quests and play outside this event, counted toward entries. Defaults to 600, about one daily quest. Gold from the event's own wins is counted separately, off the daily-win ladder."
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
                        content="How far a day's wins climb the daily-win ladder, which stops paying at fifteen. More events a day earn more gold in total but less per event. Set 0 to price the event in gems alone."
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
                        content="What leftover gold counts as worth. Every event priced in both uses the same gold-to-gem ratio, so Arena sets this rate itself. Set 0 to count unspent gold as worthless."
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
                      onChange={(n) => setGemsPerUsd(Math.max(1, n))}
                    />
                  </div>
                </div>
              </div>

              {/*
                The Bankroll tab's knobs, and only its: the Long-term value tab
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
                      onChange={(n) => setBankrollRuns(clampInt(n, 1, SIM_LIMITS.bankrollRuns))}
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

      {/*
        The custom event's editor: the same fields the column shows, with the
        locks off. It is here rather than in the sidebar because the payout
        table is a table — up to twenty rows of five columns, three of them
        number fields — and a third of a page is not where that is legible.
        Scrollable and wide for the same reason the box-price table is.
      */}
      <div
        className="modal fade"
        tabIndex={-1}
        ref={editorEl}
        aria-labelledby={ids.editorTitle}
      >
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h6 mb-0" id={ids.editorTitle}>
                Custom event
              </h2>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              />
            </div>
            <div className="modal-body">
              {/*
                Built only on Custom, so the app never holds a second,
                editable copy of a preset's own numbers in the document. The
                button that opens this appears on exactly the same condition,
                so there is no state in which it is reachable and empty.
              */}
              {isCustom && (
                <>
                  <div className="mb-3">
                    <label htmlFor={ids.copyFrom} className="form-label">
                      Copy values from
                      <InfoTip
                        label="About copying values"
                        content="Loads a real event's entry cost and payout schedule into this one, as a starting point to edit."
                      />
                    </label>
                    {/*
                     * The select resets to its placeholder after each use, and
                     * PRESETS never contains Custom, so it cannot copy from
                     * itself.
                     */}
                    <select
                      id={ids.copyFrom}
                      className="form-select"
                      value=""
                      onChange={(e) => {
                        const preset = PRESETS.find((p) => p.name === e.target.value);
                        if (!preset) return;
                        setConfig(configFromPreset(preset, config));
                        setCopyGeneration(copyGeneration + 1);
                      }}
                    >
                      <option value="">Choose an event…</option>
                      {PRESETS.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <EventFields
                    key={copyGeneration}
                    config={config}
                    locked={false}
                    onChange={setConfig}
                  />
                </>
              )}
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
                feed={shownFeed}
                live={boxFeed !== null}
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
                    )}
                    {topUp.pointPrice > 0 && (
                      <>
                        {" "}
                        Nor do your play-in points cover its {topUp.pointPrice}.
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
