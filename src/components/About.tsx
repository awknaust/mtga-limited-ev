import type { EventConfig } from "../lib";
import { GEM_PREFIX, GEM_SIGN, approx, type Money } from "../format";
import { SectionHeading } from "./SectionHeading";

/* Rates are valuations, not prices anyone is paid, so they carry the ≈. */
const show = (m: Money, n: number): string =>
  Number.isFinite(n) ? approx(m.fmt(n)) : "—";

/**
 * What the numbers mean and what they leave out.
 *
 * Reads the live config rather than hard-coding the defaults, so it cannot
 * drift from what the model is actually using.
 *
 * Deliberately short. How the simulation works is said on the Bankroll tab,
 * above the figures it produces, which is where someone reads it; repeating it
 * here only made this page long enough that the parts said nowhere else — the
 * rates, and the list of what is not modelled — were buried behind it.
 */
export function About({ config, m }: { config: EventConfig; m: Money }) {
  return (
    <div className="about">
      <SectionHeading
        title="What each reward counts as"
        subtitle="Everything is converted to gems at these rates, all of them editable in Advanced settings."
      />
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Reward</th>
              <th scope="col">Can it pay an entry?</th>
              <th scope="col">Valued at</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gems</td>
              <td>Yes</td>
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
              <td>Only where the event has a gold price</td>
              <td>
                {approx(m.fmt(config.gemsPer10kGold))} = 10,000 gold
              </td>
            </tr>
            <tr>
              <td>Draft packs kept</td>
              <td>No</td>
              <td>{show(m, config.draftPackValueGems)} each</td>
            </tr>
            <tr>
              <td>Packs</td>
              <td>No</td>
              <td>{show(m, config.packValueGems)} each</td>
            </tr>
            <tr>
              <td>Play-in points</td>
              <td>No</td>
              <td>{show(m, config.playInPointValueGems)} each</td>
            </tr>
            <tr>
              <td>Play Booster box</td>
              <td>No</td>
              <td>{show(m, config.playBoxValueGems)} each</td>
            </tr>
            <tr>
              <td>Collector Booster box</td>
              <td>No</td>
              <td>{show(m, config.collectorBoxValueGems)} each</td>
            </tr>
            {/* Below here nothing is paid by an event ladder — these are the
                Mastery Pass's rewards, and they are priced on the Mastery tab
                alone. They sit in this table anyway because the heading above
                promises every rate is here and editable, and a rate that was
                neither would make that sentence false. */}
            <tr>
              <td>Player Draft token</td>
              <td>No</td>
              <td>{show(m, config.draftTokenValueGems)} each</td>
            </tr>
            <tr>
              <td>Mythic rare ICR</td>
              <td>No</td>
              <td>{show(m, config.mythicIcrValueGems)} each</td>
            </tr>
            <tr>
              <td>Rare card</td>
              <td>No</td>
              <td>{show(m, config.rareCardValueGems)} each</td>
            </tr>
            <tr>
              <td>Uncommon ICR</td>
              <td>No</td>
              <td>{show(m, config.uncommonIcrValueGems)} each</td>
            </tr>
            <tr>
              <td>Mastery Orb</td>
              <td>No</td>
              <td>{show(m, config.orbValueGems)} each</td>
            </tr>
            <tr>
              <td>Card style</td>
              <td>No</td>
              <td>{show(m, config.cardStyleValueGems)} each</td>
            </tr>
            <tr>
              <td>Card sleeve</td>
              <td>No</td>
              <td>{show(m, config.sleeveValueGems)} each</td>
            </tr>
            <tr>
              <td>Avatar</td>
              <td>No</td>
              <td>{show(m, config.avatarValueGems)} each</td>
            </tr>
            <tr>
              <td>Companion</td>
              <td>No</td>
              <td>{show(m, config.companionValueGems)} each</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="form-text">
        "Can it pay an entry?" is Arena's rule, and the model's. A reward that
        cannot buy an entry counts toward what a run comes to and never toward
        how long it lasts.
      </p>
      <p className="form-text">
        The defaults are derived, not guessed: packs and drafted cards from
        Arena's published duplicate-protection values, boxes from street prices,
        gold from the ratio every dual-priced event charges.
      </p>

      <SectionHeading className="mt-4" title="Terms" />
      <dl className="row mb-0">
        {/* Carrying its own notation, built by the same helper that marks
            every figure, so the two cannot drift apart. */}
        <dt className="col-sm-4">Gem value ({approx(GEM_SIGN)})</dt>
        <dd className="col-sm-8">
          Everything you hold at the end, converted to gems at the rates above.
          The only figure that compares two outcomes fairly, since events pay in
          different currencies. Marked ≈ wherever it appears.
        </dd>

        <dt className="col-sm-4">Possible outcome</dt>
        <dd className="col-sm-8">
          One simulated run, start to finish. One way things could go, not a
          prediction.
        </dd>

        <dt className="col-sm-4">Break-even win rate</dt>
        <dd className="col-sm-8">
          The match win rate at which one event returns exactly its entry cost.
        </dd>

        <dt className="col-sm-4">Expected net</dt>
        <dd className="col-sm-8">
          Average gems gained or lost on a single event, after entry. Per event
          prices one entry; Bankroll compounds it.
        </dd>

        <dt className="col-sm-4">Win rate confidence</dt>
        <dd className="col-sm-8">
          How many matches your win rate is estimated from, set in Advanced
          settings. Every other number is exact once the rate is fixed, so this
          is the largest uncertainty in the model — on a short record it is worth
          hundreds of gems. Each range covers 90% of the rates your record
          supports, and every run is played at its own rate drawn from that
          range.
        </dd>

        <dt className="col-sm-4">Risk of ruin</dt>
        <dd className="col-sm-8">
          The share of outcomes that could not afford another entry before the
          event limit. Ruin is being unable to pay the stake, not holding
          nothing — a busted run may still be sitting on packs and points.
        </dd>

        <dt className="col-sm-4">Chance of a box</dt>
        <dd className="col-sm-8">
          Shown only for events that pay one. The share of possible outcomes in
          which you finish holding at least one box, counting play and collector
          boxes alike, over the whole run rather than a single entry — so it
          rises with your starting balance and your event limit as well as with
          your win rate. It is the figure a mean cannot give you, since nobody
          is shipped a fifth of a box.

          The range beside it is the win rate's, carried through: the chance if
          your true rate sits at each end of what your record supports. It is
          not a margin of error on the simulation, and more runs will not narrow
          it — only more matches played will.
        </dd>
      </dl>

      <SectionHeading
        className="mt-4"
        title="How the figures are worded"
        subtitle="The tiles speak plain words; each one is a precise statistic underneath."
      />
      <dl className="row mb-0">
        <dt className="col-sm-4">≈</dt>
        <dd className="col-sm-8">
          A gem-equivalent figure: packs, boxes and points priced at the rates
          above, not gems anyone was paid. A bare gem figure — an entry cost, a
          ladder's gem payout, the gem balance — is a real amount.
        </dd>

        <dt className="col-sm-4">Average</dt>
        <dd className="col-sm-8">
          The mean of every simulated outcome. A few lucky runs can pull it
          well above what most people see, which is why "typically" sits
          beside it.
        </dd>

        <dt className="col-sm-4">Typically</dt>
        <dd className="col-sm-8">
          The median: half the outcomes end at or above this figure. The best
          one-number answer to what will probably happen to you.
        </dd>

        <dt className="col-sm-4">Plausibly X to Y</dt>
        <dd className="col-sm-8">
          The middle 90% of what your win-rate record supports. It is
          uncertainty about you, not about the simulation — more matches
          played narrow it; more simulated runs do not.
        </dd>

        <dt className="col-sm-4">Give or take</dt>
        <dd className="col-sm-8">
          Shown when the win rate is set to exactly known: the simulation's
          own sampling wobble, a 95% confidence interval, which more simulated
          events do narrow.
        </dd>

        <dt className="col-sm-4">One in twenty</dt>
        <dd className="col-sm-8">
          The 5th and 95th percentiles — sort the outcomes from worst to best,
          and only one in twenty falls outside these marks on each side. The
          full set is under "All percentiles" wherever a spread is summarised.
        </dd>
      </dl>

      <SectionHeading className="mt-4" title="What it does not model" />
      <ul className="mb-0">
        <li>
          Whether a card is any good. A pool counts at what duplicate protection
          converts it to and nothing more.
        </li>
        <li>Switching events. A run plays one event type until it stops.</li>
        <li>
          Gold as anything but an average. Every event is credited the gold an
          average number of wins would earn, however that run actually went.
        </li>
        <li>
          Any difference between one pack and another, including Contender
          Draft's mythic packs — counted at face count, so those rows are
          understated.
        </li>
        <li>Tax withholding on cash prizes, which Arena Direct's terms mention.</li>
        <li>
          Whether you finish a Mastery Pass. The Mastery tab prices the whole
          track, so it answers what the pass is worth if you complete it. How
          much experience a season of your play earns is not modelled, because
          Wizards publishes where experience comes from — quests and weekly wins
          — but none of the amounts.
        </li>
        <li>
          What a cosmetic is worth. Orbs, card styles, sleeves, avatars and
          companions are counted and priced at nothing, since nothing in Arena
          converts one to currency. Each has its own rate if you disagree.
        </li>
      </ul>

    </div>
  );
}
