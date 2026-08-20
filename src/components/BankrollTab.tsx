import { useId } from "react";

import { EventsHistogram } from "./EventsHistogram";
import { GamesHistogram } from "./GamesHistogram";
import { PayoutBreakdown } from "./PayoutBreakdown";
import { PercentileSummary } from "./PercentileSummary";
import { ResultsPlaceholder } from "./ResultsPlaceholder";
import { RunLog } from "./RunLog";
import { SectionHeading } from "./SectionHeading";
import { SimPending } from "./SimPending";
import { Stat, type StatTile } from "./Stat";
import { StatStrip } from "./StatStrip";
import { Tabs, TabPanel } from "./Tabs";
import { ValueHistogram } from "./ValueHistogram";
import { ValueSplitBar, holdingSlices } from "./ValueSplitBar";
import { approx, pct, signClass, valueLabel, type Money } from "../format";
import {
  bankrollRoi,
  paidRewards,
  type BankrollResult,
  type EventConfig,
} from "../lib";

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

/**
 * How far a starting balance goes: the same event entered over and over until
 * the balance runs out or the event limit does.
 *
 * The one simulated tab. Everything here comes from the worker's run, which is
 * why it alone has a placeholder, a pending state and an error to show — and
 * why a stale result stays on screen, dimmed, while a fresh one computes.
 */
export function BankrollTab({
  bankroll,
  pending,
  error,
  config,
  m,
  startValue,
  eventCap,
  view,
  onViewChange,
  runView,
  onRunViewChange,
}: {
  /** Null until the first run lands; never null again after that. */
  bankroll: BankrollResult | null;
  pending: boolean;
  error: unknown;
  config: EventConfig;
  m: Money;
  /** The gem-equivalent balance a run began with, which its ending is judged against. */
  startValue: number;
  /**
   * The whole-event cap the games budget converts to for this event — the
   * number the runs behind these tiles actually stopped at, so it is the
   * figure quoted where a tile speaks in events.
   */
  eventCap: number;
  /**
   * Whether the ending total shows as one figure or as what it is made of.
   * Held by `App` rather than here so that switching tabs, which unmounts this,
   * does not silently put it back.
   */
  view: "value" | "breakdown";
  onViewChange: (view: "value" | "breakdown") => void;
  /**
   * Whether a run's length is charted in events entered or in games played —
   * the same length in the entry's unit or the budget knob's. Held by `App`
   * for the reason `view` is.
   */
  runView: "events" | "games";
  onRunViewChange: (view: "events" | "games") => void;
}) {
  const gemsEq = (g: number): string => approx(m.fmt(g));
  const valueName = valueLabel(m.unit);
  const viewItems = [
    { key: "value" as const, label: valueName },
    { key: "breakdown" as const, label: "Payout breakdown" },
  ];
  const viewGroup = useId();
  const runItems = [
    { key: "events" as const, label: "Events" },
    { key: "games" as const, label: "Games" },
  ];
  const runGroup = useId();

  /*
   * Which pack tiles the bankroll strip draws. A narrower question than the
   * editor's columns, which live with the table in `EventFields`: an empty
   * column is an invitation to fill it, where an "Avg packs won 0.0" tile is
   * only noise.
   */
  const paidPacks: string[] = paidRewards(config.payouts);

  /*
   * Bankroll tile building tolerates a result that has not arrived:
   * `bankroll` is null until the first simulation lands, and every tile list
   * below collapses to empty for the skeleton to stand in. Once a result
   * exists it is never null again — recomputes dim the stale tiles instead.
   * The Long-term value tab's tiles have no such state: they are closed form
   * and always current.
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
      hint: `went broke inside ${eventCap} events`,
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

  return (
    <>
      <div className="form-text mb-2">
        As in tournament poker, your profitability depends on how
        much you start with: with too small a bankroll, an ordinary
        losing streak ends the run before the long-term averages
        can arrive. We simulate entering the same event repeatedly,
        recycling your gem and gold winnings, and summarise the
        thousands of outcomes below.
      </div>
      {error != null && (
        <div className="alert alert-warning" role="alert">
          {bankroll === null
            ? "The simulation failed to run. Adjust any input to retry."
            : "The simulation failed — showing previous results. Adjust any input to retry."}
        </div>
      )}
      {bankroll === null ? (
        <ResultsPlaceholder />
      ) : (
      <SimPending pending={pending}>
      <div className="mb-3">
        <StatStrip tiles={bankrollTiles} label="Bankroll summary" />
      </div>
      <SectionHeading
        className="mt-4"
        // "How long", now that the length has two units: the switch below
        // picks whether it is counted in entries or in the games they took.
        title="How long you can play"
        subtitle="Before the balance runs out."
      />
      {/*
        The same switch idiom as the winnings section below: one question —
        how far the balance went — with its answer in the unit the reader is
        holding, entries paid for or the games budget spent down.
      */}
      <div className="switch-panel">
        <Tabs
          group={runGroup}
          items={runItems}
          active={runView}
          onSelect={onRunViewChange}
          label="How a run's length is counted"
          variant="segmented"
        />
        <TabPanel group={runGroup} active={runView}>
          {runView === "events" ? (
            <EventsHistogram
              histogram={bankroll.histogram}
              median={bankroll.eventPercentiles.p50}
            />
          ) : (
            <GamesHistogram
              bins={bankroll.gamesHistogram}
              median={bankroll.gamePercentiles.p50}
            />
          )}
        </TabPanel>
      </div>

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
        group={viewGroup}
        items={viewItems}
        active={view}
        onSelect={onViewChange}
        label="Ending total shown as"
        variant="segmented"
      />
      <TabPanel group={viewGroup} active={view}>
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
  );
}
