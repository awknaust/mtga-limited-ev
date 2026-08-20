import { DistributionChart } from "./DistributionChart";
import { EvCurveChart } from "./EvCurveChart";
import { InfoTip } from "./InfoTip";
import { PayoutParts } from "./PayoutParts";
import { SectionHeading } from "./SectionHeading";
import { Stat, type StatTile } from "./Stat";
import { STAT_HELP } from "./statHelp";
import { ValueSplitBar, grossSlices } from "./ValueSplitBar";
import { REAL_GEMS, approx, pct, signClass, type Money } from "../format";
import {
  CREDIBLE_LEVEL,
  boxChancePerEvent,
  breakEvenWinRate,
  eventExpectation,
  expectedNetAt,
  goldPerEvent,
  goldValueGems,
  maxRounds,
  meanGamesPerEvent,
  netInterval,
  payoutFor,
  paysBoxes,
  probProfitable,
  type EventConfig,
} from "../lib";

/**
 * What one entry is worth, over the long run: the tiles, the spread of
 * finishes, the curve against win rate, and the ladder priced row by row.
 *
 * Nothing here is simulated. Every figure is a sum over the exact outcome
 * distribution, taken in render, which is why this tab has no placeholder, no
 * pending state and no error to show — it is never waiting on anything, and it
 * is what holds the Bankroll tab's simulation to account.
 */
export function EventValueTab({
  config,
  m,
  rateBand,
}: {
  config: EventConfig;
  m: Money;
  /**
   * The win rates the reader's record supports, shaded under the curve, or
   * null where they called it certain. Computed by `App`, which needs it for
   * the dialog that sets it.
   */
  rateBand: [lo: number, hi: number] | null;
}) {
  /*
   * Real gem amounts as reported — a ladder's gem payout, the entry — against
   * gem-equivalent valuations, which are the only figures the dollar toggle
   * can honestly convert. `eq` and `eq2` are for cells under a column heading
   * that already carries the ≈; `gemsEq` marks the figure itself.
   */
  const gems = REAL_GEMS.fmt;
  const gemsEq = (g: number): string => approx(m.fmt(g));
  const gemsEq2 = (g: number): string => approx(m.fmt1(g));
  const eq = m.fmt;
  const eq2 = m.fmt1;

  /*
   * What one entry is worth, exactly: a sum over the outcome distribution
   * rather than a simulation, so it needs no worker, no debounce, no pending
   * state and no seed. It is as current as the inputs are.
   */
  const event = eventExpectation(config);
  const breakEven = breakEvenWinRate(config);
  /* The band the record supports, and the chance of being the right side of
     break-even. Null throughout when the win rate is called certain. */
  const netBand = netInterval(config);
  const pProfitable = probProfitable(config);
  const structure = config.structure;

  // When there is no break-even point, say which side of zero the event sits on.
  const breakEvenHint =
    breakEven !== null
      ? "per match"
      : expectedNetAt(config, 1) < 0
        ? "unreachable — even a perfect run pays less than entry"
        : "always profitable, even at a 0% win rate";

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
   * What every entry is credited whatever its finish — the cards kept from
   * the pool and the gold a day's play earns — each as a count in its own
   * unit and what that comes to at the rates on the left. Named under the
   * outcome table, whose rows show only what varies by finish: without this
   * the gross on every row carries an amount the table never accounts for.
   * A credit is listed whenever there is any of it, even at a rate of zero,
   * so the reader sees it counted and priced at nothing rather than absent.
   */
  const entryCredits: string[] = [
    config.draftPacks > 0
      ? `the pool you keep, ${config.draftPacks} ${config.draftPacks === 1 ? "pack" : "packs"}’ worth of cards (${gemsEq(config.draftPacks * config.draftPackValueGems)})`
      : null,
    goldPerEvent(config) > 0
      ? `${Math.round(goldPerEvent(config)).toLocaleString()} gold from a day's play (${gemsEq(goldValueGems(config))})`
      : null,
  ].filter((s): s is string => s !== null);

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
        ...STAT_HELP.net,
        // The shared sentence, plus what only a tile with a range under it can
        // say. The Compare tab's heading takes the sentence alone.
        content: `${STAT_HELP.net.content}${
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
      help: STAT_HELP.gross,
    },
    ...boxTiles,
    {
      key: "roi",
      label: "ROI",
      /*
       * A real gem figure rather than a valuation: the divisor is the entry
       * as Arena quotes it, so it stays in gems whatever the toggle says.
       * Gold used to discount this figure, which left the divisor a number
       * nobody was ever charged; it is counted as earnings now, in the net
       * above the line, and the line itself is the sticker price.
       *
       * An event that takes no gems has no divisor at all, and says so with
       * an em dash, as the break-even tile below does for a rate that does
       * not exist. The model reports 0 there as a sentinel, and printing it
       * would read as a rate of zero.
       */
      value: config.entryCostGems === null ? "—" : pct(event.roi),
      hint:
        config.entryCostGems === null
          ? "no gem entry to return a share of"
          : `of ${gems(config.entryCostGems)} entry`,
      tone: config.entryCostGems === null ? undefined : signClass(event.roi),
      help: STAT_HELP.roi,
    },
    {
      key: "break-even",
      label: "Break-even win rate",
      value: breakEven === null ? "—" : pct(breakEven, 2),
      hint:
        pProfitable !== null && breakEven !== null
          ? `${pct(pProfitable)} chance you are above it`
          : breakEvenHint,
      help: STAT_HELP.breakEven,
    },
    {
      key: "p-profit",
      label: "P(profit)",
      value: pct(event.probProfit),
      hint: "of events end net positive",
      help: STAT_HELP.probProfit,
    },
    {
      /*
       * Games rather than matches, because games are the unit everything else
       * speaks: the budget knob, the day of play, and the bankroll charts. The
       * matches it converts from are kept as the hint — the Compare table
       * still carries them as a column — so the ×2.5 a best-of-three takes is
       * visible rather than baked in silently.
       */
      key: "games",
      label: "Games",
      value: meanGamesPerEvent(config).toFixed(2),
      hint: `${event.meanRounds.toFixed(2)} matches, max ${maxRounds(structure)}`,
      help: STAT_HELP.games,
    },
  ];

  return (
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
        What entering buys rather than what finishing pays, said once:
        the pool you keep and the gold a day's play credits the entry.
        Both are in every row's gross and in none of their Pays, and
        printing them on all eight rows would be eight statements of
        two flat figures — gold in particular used to reach these
        figures nowhere a reader could see. The entry is named too, so
        gross, net and the price are three figures a reader can add
        up: real gems for the price, ≈ for the valuations, as
        everywhere. A credit is listed whenever there is any of it,
        even at a rate of zero, so it reads as counted and priced at
        nothing rather than absent.
      */}
      <div className="form-text">
        {entryCredits.length > 0 &&
          `Every gross also carries what entering pays for however the event goes — ${entryCredits.join(", and ")}. `}
        {config.entryCostGems === null
          ? "Net is gross: this event takes no gems at the door."
          : `Net is gross less the ${gems(config.entryCostGems)} entry.`}
      </div>
    </>
  );
}
