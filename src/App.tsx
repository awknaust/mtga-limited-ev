import { useEffect, useMemo, useRef, useState } from "react";

import { money } from "./format";
import { AdvancedDialog } from "./components/AdvancedDialog";
import { BoxPricesDialog } from "./components/BoxPricesDialog";
import { CalendarStrip } from "./components/CalendarStrip";
import { pickEvents } from "./components/compareEvents";
import { CustomEventDialog } from "./components/CustomEventDialog";
import { InputPanel } from "./components/InputPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { SiteFooter } from "./components/SiteFooter";
import { TopUpDialog, type TopUp } from "./components/TopUpDialog";
import {
  CURRENT_MASTERY_TRACK,
  CUSTOM_PRESET,
  PRESETS,
  configFromPreset,
  masteryBySlug,
  maxEventsFor,
  startingValue,
  winRateInterval,
  winRatePosterior,
  withLiveBoxPrices,
  FALLBACK_CALENDAR,
  type BoxPriceFeed,
  type CalendarFeed,
} from "./lib";
import { decodeShareState, encodeShareState, isAdvancedDefault } from "./share";
import { STARTING_ENTRIES, resetAdvanced, type ShareState } from "./state";
import { RESULT_TABS } from "./tabs";
import { SITE_NAME, pageTitle } from "./title";
import { useModal } from "./hooks/useModal";
import { useSimulateBankrolls, useSimulateCompare } from "./hooks/useSimulation";

/**
 * The page: the state a link carries, the simulations that state drives, and
 * the panels that read them.
 *
 * Everything visible is a component of its own — the input column, the results
 * card and its tabs, the footer, and each of the four dialogs. What is left
 * here is the wiring they share: one config, one balance, one seed, and the
 * URL that is the only place any of it persists.
 */
export default function App({
  boxFeed,
  calendar,
}: {
  /**
   * The live box-price feed, or null where there is none — previews, dev
   * without the proxy, an outage. Fetched once by main.tsx before the first
   * render, which is what lets the page open on today's prices rather than
   * paint the shipped copy and correct it a moment later.
   */
  boxFeed: BoxPriceFeed | null;
  /**
   * The live event calendar, on the same terms and with the same fallback.
   *
   * Display only, and the one thing on this page that is not the model: it
   * reaches no state, no config and no simulation, which is why it is passed
   * straight to the strip rather than folded into `ShareState` below. Nothing
   * about it belongs in a link — a link describes a run, and the calendar is
   * whatever is running the day the link is opened.
   */
  calendar: CalendarFeed | null;
}) {
  /*
   * The query string is the only place state persists. It is read once here
   * and written back on every change, so the address bar always describes what
   * is on screen and is shareable as it stands. Defaults live in state.ts
   * rather than in this initialiser: a default that disagreed with the one the
   * encoder measures against would be written into every link.
   *
   * One `ShareState` rather than a field per `useState`, because every field
   * of it is written to the URL together and the effect below has to depend on
   * all of them. Thirteen states meant a thirteen-name dependency list that
   * nothing checked: a field added to `ShareState` is a type error until
   * `defaultShareState` and the decoder account for it, and was *no* error at
   * all if it never reached that list — the link would simply stop following
   * that one field. Now the effect depends on the object.
   *
   * The live feed is applied here, to the decoded state, so the first state is
   * the priced one. It supplies the per-set table and nothing else: the two
   * generic box values are the build's own and only the reader moves them, so
   * a fresh load reads as untouched and writes nothing into the link.
   */
  const [state, setState] = useState<ShareState>(() => {
    const decoded = decodeShareState(window.location.search);
    return boxFeed === null
      ? decoded
      : { ...decoded, config: withLiveBoxPrices(decoded.config, boxFeed, new Date()) };
  });
  /**
   * A field or two at a time, which is how every control here edits.
   *
   * Functional, so two patches raised from one event cannot lose each other —
   * and so a handler never has to close over the state it is about to replace.
   */
  const patch = (fields: Partial<ShareState>) =>
    setState((current) => ({ ...current, ...fields }));
  /*
   * Read back out under the names the panels below take, so what each of them
   * is handed reads at the call site rather than being spelled `state.` at
   * every use.
   */
  const {
    config,
    presetName,
    bankrollRuns,
    seed,
    startingGems,
    startingGold,
    // Only the Qualifier Play-Ins spend these, and nothing here refills them.
    startingPlayInPoints,
    // Where the player stops, as a budget of games — a run that never busts
    // has to end somewhere, and how much you intend to play is a real input.
    maxGames,
    tab,
    // Which Set Mastery season the Mastery tab prices.
    masterySlug,
    // Which events the Compare tab draws. In the link, unlike the y-axis mode
    // inside it: which events are being weighed up is the question being
    // asked, and the thing worth sending someone.
    compareSelection,
    unit,
    // 20,000 gems for $99.99 is the largest bundle, so the best rate on offer.
    gemsPerUsd,
  } = state;
  // Resolved here rather than in the tab, since the picker sits beside the
  // event and the tab is only one of the two things reading it.
  const masteryTrack = masteryBySlug(masterySlug) ?? CURRENT_MASTERY_TRACK;
  /*
   * Whether the ending total is shown as one figure or as what it is made of.
   * Deliberately not in the shared state beside `tab`: the link format is
   * pinned by a snapshot so that breaking an old link takes a decision, and
   * this is a glance at a section rather than part of the simulation being
   * shared. Held here rather than in the tab, which a tab switch unmounts.
   */
  const [view, setView] = useState<"value" | "breakdown">("value");
  // The run-length chart's unit — events or games — held here for the same
  // reasons as `view`: a glance, not part of the link, and a tab switch
  // should not silently put it back.
  const [runView, setRunView] = useState<"events" | "games">("events");
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
    const query = encodeShareState(state);
    const { pathname, hash } = window.location;
    window.history.replaceState(
      null,
      "",
      `${pathname}${query ? `?${query}` : ""}${hash}`,
    );
    /*
     * The title rides on the same query the URL does, so the two never
     * disagree about what is being looked at and "no query" means one thing
     * in both: the bare origin, which keeps the site's own title.
     *
     * Guarded because this effect runs on every keystroke, and an assignment
     * to `document.title` replaces a text node whether or not the string
     * moved.
     */
    const title = pageTitle({
      tab,
      tabLabel: RESULT_TABS.find((t) => t.key === tab)?.label ?? tab,
      eventName: presetName,
      isDefault: query === "",
    });
    if (document.title !== title) document.title = title;
    // One dependency, which is the point: `tab` and `presetName` are read off
    // the same object, so there is no list to keep in step with `ShareState`.
  }, [state]);

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
   * The four dialogs. Every `show()` is on the page rather than inside another
   * dialog, because Bootstrap allows one at a time: a second raised over the
   * first stacks two backdrops that outlive them both. That is why the
   * box-price table, which is reached from the About tab, is opened from here.
   * The box picker inside the event editor is a native `<dialog>` and not
   * subject to that; see `AddBox`.
   *
   * Either editing dialog being open holds the simulations: their edits are
   * meant to apply together rather than one recompute per keystroke, and
   * nothing behind the backdrop is legible while one is up, so the run it
   * would have made is one nobody could read.
   */
  const {
    ref: advancedRef,
    show: showAdvanced,
    open: advancedOpen,
  } = useModal();
  const { ref: editorRef, show: showEditor, open: editorOpen } = useModal();
  const { ref: boxPricesRef, show: showBoxPrices, openedAt: boxPricesAt } = useModal();
  const { ref: topUpRef, show: showTopUp, hide: hideTopUp } = useModal();
  const hold = advancedOpen || editorOpen;
  /*
   * Shown from an effect rather than from the handler that sets it, so the
   * body has rendered before the dialog appears — calling show() inline would
   * fade in the previous prompt's text for a frame.
   *
   * `topUp` is deliberately not cleared when the dialog closes: the content
   * would vanish mid-fade, and the next switch overwrites it anyway.
   */
  useEffect(() => {
    if (topUp) showTopUp();
  }, [topUp, showTopUp]);

  /*
   * The bankroll simulation lives in a worker, debounced behind the inputs;
   * everything on the Expected value tab is closed form and computed in that
   * tab, live. The params object is memoised so the hook sees one identity per
   * actual change, and the *object* is what debounces — a flush is atomic, so
   * no render can pair this keystroke's runs with the last one's seed.
   *
   * What the debounce delays is the *run*, not the saying so. The hook
   * measures pending against these live params, so the results dim and the
   * spinner appears on the render that takes the keystroke, and only the
   * recompute waits for the typing to stop. Getting that the wrong way round
   * is what made this feel jarring: nothing happened for 300 ms, and then
   * everything did at once.
   *
   * Two changes do not wait. Either dialog being open is a hold, as above.
   * And a preset pick runs at once: one deliberate choice with no run of
   * repeats behind it, for which the delay would be latency for nothing. The
   * preset's name is what says one was picked — it moves then and only then —
   * so it is handed over as the thing to flush on rather than a flag the
   * handler would have to set and something else reset. Only the main
   * selector: the editor's "Copy values from" changes the config under the
   * same name, and is held with the rest of that dialog's edits.
   */
  /*
   * One object for the knobs, because two tabs read them: the Bankroll tab's
   * single-event run and the Compare tab's grid. Memoised separately from the
   * config so a preset pick, which moves `config` and nothing else, does not
   * hand the grid a fresh identity for values that did not change.
   */
  const bankrollKnobs = useMemo(
    () => ({
      startingGems,
      startingGold,
      startingPlayInPoints,
      maxGames,
      runs: bankrollRuns,
      seed,
    }),
    [startingGems, startingGold, startingPlayInPoints, maxGames, bankrollRuns, seed],
  );
  const bankrollParams = useMemo(
    () => ({ config, ...bankrollKnobs }),
    [config, bankrollKnobs],
  );
  const {
    result: bankroll,
    pending: bankrollPending,
    error: bankrollError,
  } = useSimulateBankrolls(bankrollParams, { hold, flushOn: presetName });
  /*
   * The Compare tab's bankroll grid, run from here rather than from inside the
   * tab, and run whichever tab is showing.
   *
   * Both halves of that are deliberate. Every simulation starts on the change
   * that made it stale, not on the tab switch that reveals it, so a reader who
   * adjusts a rate and then goes looking for the comparison usually finds it
   * already computed — the wait happens while they are reading something else.
   * It costs worker time for a reader who never opens the tab, and that is the
   * trade being made: cores are idle and attention is not. And kept out of the
   * tab's own component, a settled grid survives the unmount that switching
   * tabs causes, so a stale answer stays on screen while the new one computes
   * rather than the panel blanking for as long as the run takes.
   *
   * `pickEvents` runs on every render, tab or no tab — a spread per selected
   * event, measured in single-digit microseconds — and buys the memo identity
   * the debounce compares on.
   */
  const comparePicked = useMemo(
    () => pickEvents(compareSelection, config),
    [compareSelection, config],
  );
  const compareParams = useMemo(
    () => ({ events: comparePicked, ...bankrollKnobs }),
    [comparePicked, bankrollKnobs],
  );
  const compareGrid = useSimulateCompare(compareParams, {
    hold,
    flushOn: presetName,
  });
  /*
   * Every lane, not just the bankroll's: both simulations run from any tab, so
   * a spinner reading only one of them is silent through work that is
   * genuinely happening. Same timing as the panels it accompanies — true from
   * the keystroke, through the debounce, until the run for the current values
   * lands — which is what makes a debounced keystroke look answered rather
   * than ignored.
   */
  const simulating = bankrollPending || compareGrid.pending;

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
   * How much of a guess the win rate is, as the band it supports — null when
   * the player has called it certain. Here rather than in a panel because two
   * read it: the dialog that sets the confidence, and the curve that shades it.
   */
  const posterior = useMemo(() => winRatePosterior(config), [config]);
  const rateBand = useMemo(
    () => (posterior ? winRateInterval(posterior) : null),
    [posterior],
  );

  /** Presets load their own values; "Custom" keeps whatever is on screen. */
  const applyPreset = (name: string) => {
    const preset = PRESETS.find((p) => p.name === name);
    // Custom, which has no definition of its own to load.
    if (!preset) {
      patch({ presetName: name });
      return;
    }
    // Read off the config rather than the preset, so the prompt below asks the
    // same three prices the model does — absent and zero already normalised.
    const next = configFromPreset(preset, config);
    // Name and ladder in one write: they are one move, and a link written
    // between two of them would name an event it did not carry.
    patch({ presetName: name, config: next });

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
    const gemPrice = next.entryCostGems;
    const goldPrice = next.entryCostGold;
    const pointPrice = next.entryCostPlayInPoints;
    // A gem price the balance covers, or no gem price to cover: either way
    // there is nothing here for a prompt that offers to set the gem balance.
    const gemsCover = gemPrice === null || startingGems >= gemPrice;
    const goldCovers = goldPrice !== null && startingGold >= goldPrice;
    const pointsCover = pointPrice !== null && startingPlayInPoints >= pointPrice;
    if (gemsCover || goldCovers || pointsCover) return;
    setTopUp({
      name: preset.name,
      entryGems: gemPrice,
      goldPrice,
      pointPrice,
      suggested: STARTING_ENTRIES * gemPrice,
    });
  };

  /*
   * Advanced settings back to their defaults, from the dialog's own footer.
   *
   * `resetAdvanced` decides where the line falls, and it is already a
   * `ShareState` to a `ShareState`, so it *is* the updater — which is the
   * whole of it now. It used to hand every field to its own setter, and what
   * that cost was a list: a field moved into the dialog was restored only if
   * someone remembered to come back here and add a thirteenth call.
   */
  const resetAdvancedSettings = () => setState(resetAdvanced);

  /*
   * The link as the address bar will show it once the effect above has run.
   * Built here, from state, for the wrong-number report to carry: reading
   * `window.location` during render would hand it the previous edit's URL,
   * since the effect that writes it runs after this render commits.
   */
  const shareQuery = encodeShareState(state);
  const shareUrl = `${window.location.origin}${window.location.pathname}${
    shareQuery ? `?${shareQuery}` : ""
  }`;

  return (
    <div className="container-xl py-4">
      <header className="mb-4 d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div>
          <h1 className="h3 mb-1">{SITE_NAME}</h1>
          
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

      {/* What is running, and when. Above the columns because it is context
          for everything in them and belongs to neither, and because it is one
          band of rows rather than a panel. It renders nothing at all when the
          calendar has nothing in the window, which is the state a preview or a
          fresh checkout is in. */}
      <CalendarStrip calendar={calendar ?? FALLBACK_CALENDAR} />

      <div className="row g-3 align-items-start">
        <InputPanel
          config={config}
          onConfigChange={(config) => patch({ config })}
          m={m}
          unit={unit}
          onUnitChange={(unit) => patch({ unit })}
          gemsPerUsd={gemsPerUsd}
          startValue={startValue}
          startingGems={startingGems}
          onStartingGemsChange={(startingGems) => patch({ startingGems })}
          startingGold={startingGold}
          onStartingGoldChange={(startingGold) => patch({ startingGold })}
          startingPlayInPoints={startingPlayInPoints}
          onStartingPlayInPointsChange={(points) => patch({ startingPlayInPoints: points })}
          maxGames={maxGames}
          onMaxGamesChange={(maxGames) => patch({ maxGames })}
          presetName={presetName}
          onPresetChange={applyPreset}
          masteryTrack={masteryTrack}
          onMasterySlugChange={(masterySlug) => patch({ masterySlug })}
          onEditEvent={showEditor}
          onAdvanced={showAdvanced}
          shareUrl={shareUrl}
        />

        <ResultsPanel
          tab={tab}
          onTabChange={(tab) => patch({ tab })}
          simulating={simulating}
          config={config}
          m={m}
          presetName={presetName}
          masteryTrack={masteryTrack}
          compareSelection={compareSelection}
          onCompareSelectionChange={(compareSelection) => patch({ compareSelection })}
          comparePicked={comparePicked}
          compareGrid={compareGrid}
          bankrollKnobs={bankrollKnobs}
          bankroll={bankroll}
          bankrollPending={bankrollPending}
          bankrollError={bankrollError}
          startValue={startValue}
          // The budget as the cap this event's runs actually stop at, for the
          // tiles that speak in events.
          eventCap={maxEventsFor(config, maxGames)}
          view={view}
          onViewChange={setView}
          runView={runView}
          onRunViewChange={setRunView}
          rateBand={rateBand}
          onShowBoxPrices={showBoxPrices}
        />
      </div>

      <SiteFooter />

      <AdvancedDialog
        ref={advancedRef}
        config={config}
        onConfigChange={(config) => patch({ config })}
        m={m}
        rateBand={rateBand}
        gemsPerUsd={gemsPerUsd}
        onGemsPerUsdChange={(gemsPerUsd) => patch({ gemsPerUsd })}
        bankrollRuns={bankrollRuns}
        onBankrollRunsChange={(bankrollRuns) => patch({ bankrollRuns })}
        seed={seed}
        onSeedChange={(seed) => patch({ seed })}
        isDefault={isAdvancedDefault(state)}
        onReset={resetAdvancedSettings}
      />

      <CustomEventDialog
        ref={editorRef}
        isCustom={presetName === CUSTOM_PRESET}
        config={config}
        onChange={(config) => patch({ config })}
      />

      <BoxPricesDialog
        ref={boxPricesRef}
        boxFeed={boxFeed}
        config={config}
        gemsPerUsd={gemsPerUsd}
        now={boxPricesAt}
      />

      <TopUpDialog
        ref={topUpRef}
        topUp={topUp}
        startingGems={startingGems}
        onAccept={(gems) => {
          patch({ startingGems: gems });
          hideTopUp();
        }}
      />
    </div>
  );
}
