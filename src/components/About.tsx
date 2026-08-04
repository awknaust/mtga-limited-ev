import type { EventConfig } from "../lib";
import type { Money } from "../format";
import { SectionHeading } from "./SectionHeading";

const show = (m: Money, n: number): string => (Number.isFinite(n) ? m.fmt(n) : "—");

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
              <td>Face value</td>
            </tr>
            <tr>
              <td>Gold</td>
              <td>Only where the event has a gold price</td>
              <td>
                {Math.round(10000 / config.goldPerGem).toLocaleString()} gems per 10,000 gold
              </td>
            </tr>
            <tr>
              <td>Draft packs kept</td>
              <td>No</td>
              <td>
                {show(m, config.draftPackValueGems)} each × {config.draftPacks}
              </td>
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
          </tbody>
        </table>
      </div>
      <p className="form-text">
        "Can it pay an entry?" is Arena's rule, and the default. Advanced
        settings can treat the rest as spendable too, which asks how long you
        could keep playing if it were.
      </p>
      <p className="form-text">
        The defaults are derived, not guessed: packs and drafted cards from
        Arena's published duplicate-protection values, boxes from street prices,
        gold from the ratio every dual-priced event charges.
      </p>

      <SectionHeading className="mt-4" title="Terms" />
      <dl className="row mb-0">
        <dt className="col-sm-4">Gem value</dt>
        <dd className="col-sm-8">
          Everything you hold at the end, converted to gems at the rates above.
          The only figure that compares two outcomes fairly, since events pay in
          different currencies.
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
          it — only more matches played will. The tile behind the arrow gives
          the chance for one entry instead, worked out exactly rather than
          simulated.
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
      </ul>

    </div>
  );
}
