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
 * It shows the feed and not the derivation. Which three sets were averaged is
 * `liveBoxDefaults`'s business and was marked here once; the marks said more
 * about the rule than a reader of a price table wants, and the prices are the
 * thing being looked up. A set with neither box priced still gets its row —
 * the feed carries it, and a gap in the data is data.
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
  gemsPerUsd,
  now,
}: {
  feed: BoxPriceFeed;
  /** Whether `feed` came from the network, or is the copy the app shipped. */
  live: boolean;
  /**
   * What the model actually prices a box at — the average of the newest
   * released expansions, or the baked fallback, or whatever the reader typed
   * over it. The top row of the table, since it is the figure every payout in
   * the app is settled at and the rows below it are only its working.
   */
  playBoxValueGems: number;
  collectorBoxValueGems: number;
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
          These are the prices this build shipped with, and the two box values
          in Advanced settings are their averages.
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
            {/* The figure the model settles every box payout at, above the
                prices it was averaged from. It is not a set and takes no set
                code; the rows below are its working. The popover is what
                keeps it from reading as one — a row of prices in a table of
                sets, that is not a set and can be typed over. */}
            <tr className="box-price-custom">
              <th scope="row" className="fw-normal">
                —
              </th>
              <td>
                Custom
                <InfoTip
                  label="About the custom box value"
                  content="What the model prices every box payout at, from Advanced settings. It follows the average of the sets below until you edit it."
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
