import { REAL_GEMS, approx, usdAmount } from "../format";
import type { BoxPriceFeed, BoxPriceRow, BoxPriceStats } from "../lib";
import { InfoTip } from "./InfoTip";
import { feedAgeText, feedStampText } from "./boxPriceText";

/**
 * One box, priced twice: what it costs in dollars, and what that is worth in
 * gems at the reader's own rate.
 *
 * Both rather than whichever the display toggle is on, because the two answer
 * different questions and a reader of this table has both. The dollar figure
 * is the market price as TCGplayer reports it — the thing being sourced, and
 * a price someone actually paid. The gem figure is what the model does with
 * it, so it is a valuation and carries the ≈.
 *
 * Written as an equation, the form the About table states its rates in: the
 * two halves are one price in two currencies, and a bare pair of figures
 * would read as two.
 */
const priceText = (usd: number, gemsPerUsd: number): string =>
  `${usdAmount(usd)} = ${approx(REAL_GEMS.fmt(usd * gemsPerUsd))}`;

/**
 * The same, for a figure that starts life in gems — the model's own box
 * value, which is a gem amount the app converts the other way.
 */
const gemPriceText = (gems: number, gemsPerUsd: number): string =>
  `${usdAmount(gems / gemsPerUsd)} = ${approx(REAL_GEMS.fmt(gems))}`;

/** The markdown as typed — 12.5% must not read 13%, nor 20% read 20.0%. */
const markdownText = (fraction: number): string =>
  `${Math.round(fraction * 1e4) / 100}%`;

/** A market price, or an em dash where nothing has sold. */
const marketText = (
  stats: BoxPriceStats | undefined,
  gemsPerUsd: number,
): string =>
  stats?.market == null ? "—" : priceText(stats.market, gemsPerUsd);

/** Newest first. The release date is the order; it is no longer a column. */
const byRelease = (a: BoxPriceRow, b: BoxPriceRow): number =>
  (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "");

/**
 * What the two box values are standing on: every set the feed carries,
 * priced.
 *
 * The values themselves are two fields in Advanced settings, which is a fine
 * place to edit a number and no place at all to check one — a reader who
 * wants to know why a Collector box says $470 needs the sets behind it, and
 * they are not a tooltip's worth of text. Hence a table, reached from the
 * About tab, where the two boxes are already named as rewards.
 *
 * It shows the feed, and above it the two generic values from Advanced
 * settings — constants a person set from three recent sets, not something
 * derived from the rows below. Which sets those were was marked here once;
 * the marks said more about the recipe than a reader of a price table wants,
 * and the prices are the thing being looked up. A set with neither box priced
 * still gets its row — the feed carries it, and a gap in the data is data.
 *
 * There is always a feed to show: the app ships a copy of it, and the live
 * one replaces that when it arrives. Where it has not — previews, dev
 * without the proxy, an outage — the table is the shipped copy, and the note
 * above it says so, because "last updated three weeks ago" would otherwise
 * read as a Worker that has stopped rather than a build that never had one.
 *
 * `now` is passed rather than read, so the age is a value the caller decides
 * — App stamps it when the dialog opens. Reading the clock during a render
 * would be a lie the React Compiler is entitled to memoise.
 */
export function BoxPrices({
  feed,
  live,
  playBoxValueGems,
  collectorBoxValueGems,
  boxMarkdown,
  gemsPerUsd,
  now,
}: {
  feed: BoxPriceFeed;
  /** Whether `feed` came from the network, or is the copy the app shipped. */
  live: boolean;
  /**
   * What the model prices a box at when the payout names no set — the constant
   * in Advanced settings, or whatever the reader typed over it. The top row of
   * the table, since it is the figure a custom ladder's boxes settle at; a
   * payout that names a set is priced from the rows below it directly.
   */
  playBoxValueGems: number;
  collectorBoxValueGems: number;
  /**
   * The share the model takes off every price below — this table quotes what
   * boxes trade at, and the model values them at less. Stated over the table
   * so the figures here and the ones in the breakdowns do not silently
   * disagree by exactly this much.
   */
  boxMarkdown: number;
  /** The reader's own rate, as Advanced settings has it. */
  gemsPerUsd: number;
  now: Date;
}) {
  const age = feedAgeText(feed.generatedAt, now);
  const stamp = feedStampText(feed.generatedAt);
  /* Sorted here rather than trusted from the feed: the order is the only
     thing left saying these are the newest sets, now that the date has no
     column of its own. */
  const rows = [...feed.boxes].sort(byRelease);
  /* Guarded the way `money` guards it: a rate of zero would divide the
     model's own row into infinities. */
  const rate = gemsPerUsd > 0 ? gemsPerUsd : 1;

  return (
    <>
      {!live && (
        <p>
          No live prices here — they are served from the production site.
          These are the prices this build shipped with.
        </p>
      )}
      {/* Both credited, because the price and the route to it are two
          different claims: the market figures are TCGplayer's, and tcgcsv is
          the public mirror of their API the Worker actually reads. Same
          `rel` and `target` as the footer's one other outward link. */}
      <p>
        Market prices sourced from{" "}
        <a href="https://www.tcgplayer.com" target="_blank" rel="noreferrer">
          TCGplayer
        </a>{" "}
        via{" "}
        <a href="https://tcgcsv.com" target="_blank" rel="noreferrer">
          tcgcsv
        </a>
        .
        {/* The one adjustment between this table and the model's box figures,
            said here so a breakdown card quoting less than a row below is not
            read as a bug. */}
        {boxMarkdown > 0 && (
          <>
            {" "}
            The model values every box at {markdownText(boxMarkdown)} under
            these prices — the box markdown in Values &amp; assumptions.
          </>
        )}
      </p>
      <div className="table-responsive box-price-scroll">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Set</th>
              <th scope="col" className="text-end">
                Play box
              </th>
              <th scope="col" className="text-end">
                Collector box
              </th>
            </tr>
          </thead>
          <tbody>
            {/* The figure the model settles an unnamed box at, above the
                per-set prices. It is not a set, so its code is the chip's
                "Any" — title case among the uppercase codes, as the payout row
                draws it, which is what marks it as not one of them — and it
                is not derived from the rows below: it is a constant, set from
                three recent sets and editable under Values & assumptions. The
                popover is what keeps it from reading as one more set. */}
            <tr className="box-price-generic">
              <th scope="row" className="fw-normal">
                Any
              </th>
              <td>
                Generic
                <InfoTip
                  label="About the generic box value"
                  content="What a box starts from when the payout names no set: an average street price across three recent Standard sets, until you edit it under Values & assumptions. A payout naming a set starts from that set's row below. The box markdown then comes off either."
                />
              </td>
              <td className="text-end">
                {gemPriceText(playBoxValueGems, rate)}
              </td>
              <td className="text-end">
                {gemPriceText(collectorBoxValueGems, rate)}
              </td>
            </tr>
            {rows.map((row) => (
              <tr key={row.code}>
                <th scope="row" className="fw-normal text-uppercase">
                  {row.code}
                </th>
                <td>{row.name}</td>
                <td className="text-end">{marketText(row.boxes.play, rate)}</td>
                <td className="text-end">
                  {marketText(row.boxes.collector, rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Both null together — they parse the same stamp — so one condition
          covers the case where the payload's timestamp is not a date. */}
      {age && stamp && (
        <p className="form-text mb-0">
          Last updated {age}, at <time dateTime={feed.generatedAt}>{stamp}</time>
          .
        </p>
      )}
    </>
  );
}
