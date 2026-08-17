import type { EventConfig } from "../lib";
import { GEM_PREFIX, GEM_SIGN, approx, valueLabel, type Money } from "../format";
import { SectionHeading } from "./SectionHeading";

/* Rates are valuations, not prices anyone is paid, so they carry the ≈. */
const show = (m: Money, n: number): string =>
  Number.isFinite(n) ? approx(m.fmt(n)) : "—";

/**
 * What a box is valued at, in the one form that is true of both boxes: it
 * depends on the set, and here are the sets. Sized and aligned to sit in a
 * cell of figures without shouldering the rows apart.
 */
const BoxPricesLink = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    className="btn btn-link btn-sm p-0 align-baseline"
    onClick={onClick}
  >
    varies by set
  </button>
);

/**
 * The two things a reader cannot get from a tooltip: what a reward counts as,
 * and what the plain words on the tiles mean precisely.
 *
 * Reads the live config rather than hard-coding the defaults, so it cannot
 * drift from what the model is actually using.
 *
 * Deliberately short, and it stays short by saying only what is said nowhere
 * else. How the simulation works is on the Bankroll tab, above the figures it
 * produces; where each default rate comes from is in the Advanced settings
 * tooltip beside the input it belongs to; every tile carries a popover naming
 * the statistic behind its word. This page repeating any of that is what made
 * it long enough to go unread.
 *
 * The modelling limits used to be listed here and are not worth a section —
 * they are answers to questions a reader has not thought to ask yet. Kept here
 * so they are not lost: card quality is ignored, a pool counting only at what
 * duplicate protection converts it to; a run plays one event type throughout;
 * gold is credited per event at what an average number of wins would earn,
 * however that run went; packs are counted at face count, so Contender Draft's
 * mythic packs are understated; and tax withholding on cash prizes, which
 * Arena Direct's terms mention, is not deducted.
 *
 * Two of that list were the Mastery Pass's, and both are already said where
 * they bite. Whether a season earns enough experience to finish the track is
 * not modelled — the Mastery tab's break-even popover says so, Wizards
 * publishing where experience comes from but none of the amounts. And cosmetics
 * are counted but priced at nothing, which the rates below state as a figure:
 * an orb reading 0 needs no paragraph explaining that it is worth nothing.
 *
 * The two box rows are the exception to the table's own form: their cell is a
 * way through to the prices rather than a figure. Every other rate here is one
 * number arrived at by reasoning — 40 gems for a mythic, because that is what
 * duplicate protection pays — while a box is worth whatever boxes are going
 * for, which is a different answer every set and a table of its own. The
 * number the model uses is still one number, and still sits in Advanced
 * settings where it can be edited; this row says where it came from.
 */
export function About({
  config,
  m,
  onShowBoxPrices,
}: {
  config: EventConfig;
  m: Money;
  /**
   * Opens the box-price table. The two box rows are the only ones here whose
   * rate is fetched rather than reasoned out, so they are the only ones where
   * "valued at" has a source worth showing.
   */
  onShowBoxPrices: () => void;
}) {
  return (
    <div className="about">
      {/* Follows the display toggle, as the rates in the table below it do —
          naming gems while the column reads dollars is the one way this
          sentence can be wrong. */}
      <SectionHeading
        title="What each reward counts as"
        subtitle={`Everything is converted to ${m.label} at these rates, all of them editable under Values & assumptions.`}
      />
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Reward</th>
              <th scope="col">Valued at</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gems</td>
              {/* Face value, written as the equation the other rows use — and
                  a quiet primer on the notation. The left side is pinned to
                  one real gem; only the right follows the display unit, so in
                  dollars the row shows the exchange rate rather than the
                  tautology $0.0050 = $0.0050. */}
              <td>
                {GEM_PREFIX}1 = {approx(m.fmt(1))}
              </td>
            </tr>
            <tr>
              <td>Gold</td>
              <td>
                {approx(m.fmt(config.gemsPer10kGold))} = 10,000 gold
              </td>
            </tr>
            <tr>
              <td>Draft packs kept</td>
              <td>{show(m, config.draftPackValueGems)} each</td>
            </tr>
            <tr>
              <td>Packs</td>
              <td>{show(m, config.packValueGems)} each</td>
            </tr>
            <tr>
              <td>Play-in points</td>
              <td>{show(m, config.playInPointValueGems)} each</td>
            </tr>
            <tr>
              <td>Play Booster box</td>
              <td>
                <BoxPricesLink onClick={onShowBoxPrices} />
              </td>
            </tr>
            <tr>
              <td>Collector Booster box</td>
              <td>
                <BoxPricesLink onClick={onShowBoxPrices} />
              </td>
            </tr>
            {/* Below here nothing is paid by an event ladder — these are the
                Mastery Pass's rewards, and they are priced on the Mastery tab
                alone. They sit in this table anyway because the heading above
                promises every rate is here and editable, and a rate that was
                neither would make that sentence false. */}
            <tr>
              <td>Player Draft token</td>
              <td>{show(m, config.draftTokenValueGems)} each</td>
            </tr>
            <tr>
              <td>Mythic ICR</td>
              <td>{show(m, config.mythicIcrValueGems)} each</td>
            </tr>
            <tr>
              <td>Rare card</td>
              <td>{show(m, config.rareCardValueGems)} each</td>
            </tr>
            <tr>
              <td>Uncommon ICR</td>
              <td>{show(m, config.uncommonIcrValueGems)} each</td>
            </tr>
            <tr>
              <td>Mastery Orb</td>
              <td>{show(m, config.orbValueGems)} each</td>
            </tr>
            <tr>
              <td>Card style</td>
              <td>{show(m, config.cardStyleValueGems)} each</td>
            </tr>
            <tr>
              <td>Card sleeve</td>
              <td>{show(m, config.sleeveValueGems)} each</td>
            </tr>
            <tr>
              <td>Avatar</td>
              <td>{show(m, config.avatarValueGems)} each</td>
            </tr>
            <tr>
              <td>Companion</td>
              <td>{show(m, config.companionValueGems)} each</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="form-text">
        Only gems and gold can pay for another entry, and gold only where the
        event has a gold price. Everything else adds to what a run is worth
        without extending how long it lasts.
      </p>

      <SectionHeading
        className="mt-4"
        title="How to read the figures"
        subtitle="The tiles speak plain words; each one is a precise statistic underneath."
      />
      <dl className="row mb-0">
        {/* Name and marker both from the active unit, and the marker from the
            same helper that stamps every figure, so the three cannot drift
            apart. The gem branch takes the bare sign rather than `m.symbol`,
            whose trailing gap would sit inside the bracket. */}
        <dt className="col-sm-4">
          {valueLabel(m.unit)} (
          {approx(m.unit === "gems" ? GEM_SIGN : m.symbol)})
        </dt>
        <dd className="col-sm-8">
          Everything you hold at the end, priced at the rates above — the only
          fair way to compare events that pay in different things. The ≈ marks a
          figure as one of those valuations rather than something anyone
          actually paid you; a bare gem figure, like an entry cost or a payout
          on the ladder, is a real amount, and stays in gems whichever unit is
          showing.
        </dd>

        <dt className="col-sm-4">Average</dt>
        <dd className="col-sm-8">
          The mean across every simulated run. A few lucky runs can pull it well
          above what most people see, which is why "typically" sits beside it.
        </dd>

        <dt className="col-sm-4">Typically</dt>
        <dd className="col-sm-8">
          The median: half the runs did at least this well. The best one-number
          answer to what will probably happen to you.
        </dd>

        <dt className="col-sm-4">Plausibly X to Y</dt>
        <dd className="col-sm-8">
          How much your own win rate is in doubt, given how many matches you
          have played — the middle 90% of the rates that record supports. It is
          uncertainty about you, not about the model: playing more matches
          narrows it, and no setting here does.
        </dd>

        <dt className="col-sm-4">Give or take</dt>
        <dd className="col-sm-8">
          Shown on the bankroll's box chance instead, when your win rate is set
          to exactly known: the simulation's own wobble, which more bankroll
          runs do narrow. The Long-term value tab needs no such figure —
          everything on it is exact for the win rate you set.
        </dd>

        <dt className="col-sm-4">One in twenty</dt>
        <dd className="col-sm-8">
          Sort the runs from worst to best and only one in twenty falls outside
          these two marks on each side — an unlucky run and a lucky one. The
          full spread is under "All percentiles".
        </dd>
      </dl>
    </div>
  );
}
