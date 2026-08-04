import type { EventConfig } from "../lib";
import type { Money } from "../format";

const show = (m: Money, n: number): string => (Number.isFinite(n) ? m.fmt(n) : "—");

/**
 * What the numbers mean and what they leave out.
 *
 * Reads the live config rather than hard-coding the defaults, so it cannot
 * drift from what the model is actually using.
 */
export function About({ config, m }: { config: EventConfig; m: Money }) {
  return (
    <div className="about">
      <h3 className="section-title">How the bankroll simulation works</h3>
      <p>
        It plays a sequence of events from your starting balance, not one event in
        isolation. Each time round it pays an entry — gold first wherever the event
        takes gold, gems otherwise — plays the event out game by game, and puts the
        winnings back in the pot to fund the next one. A run ends when neither
        currency covers another entry, or when it reaches the event limit you set.
      </p>
      <p>
        That is repeated a few thousand times. Every figure on the Bankroll tab is a
        summary of those samples, so "median 4 events" means half the sampled runs
        managed four or fewer.
      </p>

      <h3 className="section-title mt-4">What each reward counts as</h3>
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
        "Can it pay an entry?" answers Arena's rules, which is the default: gems and
        gold are liquid, the rest is not. Advanced settings has a switch to treat
        the non-liquid rewards as spendable too, which asks how long you could keep
        playing if they were. Every rate above is editable there.      </p>
      <p className="form-text">
        The defaults are derived rather than guessed — packs and drafted cards from
        Arena's published duplicate-protection values, boxes from street prices,
        gold from the fact that every event priced in both currencies charges the
        same ratio of gold to gems.
      </p>

      <h3 className="section-title mt-4">Terms</h3>
      <dl className="row mb-0">
        <dt className="col-sm-4">Gem-equivalent</dt>
        <dd className="col-sm-8">
          Everything a run holds, converted to gems at the rates above: the gem
          balance, leftover gold, and every pack, point and box won along the way.
          It is the only figure that compares two runs fairly, since events pay in
          different currencies.
        </dd>

        <dt className="col-sm-4">Sample</dt>
        <dd className="col-sm-8">One simulated run, from the starting balance to the end.</dd>

        <dt className="col-sm-4">Break-even win rate</dt>
        <dd className="col-sm-8">
          The win rate at which one event returns exactly its entry cost. Quoted per
          game for best-of-one events and per match for best-of-three, matching the
          slider.
        </dd>

        <dt className="col-sm-4">Expected net</dt>
        <dd className="col-sm-8">
          Average gems gained or lost on a single event, after entry. The Per event
          tab prices one entry; the Bankroll tab compounds it.
        </dd>
      </dl>

      <h3 className="section-title mt-4">What it does not model</h3>
      <ul className="mb-0">
        <li>
          Cards beyond their duplicate-protection value. The pool is counted at
          what a complete collection converts it to, which says nothing about a
          card being good, or about filling a collection you have not finished.
        </li>
        <li>
          Switching events. A run plays one event type until it stops, where a real
          player would move to whatever is best value at the time.
        </li>
        <li>
          Gold as anything but an average. The daily-win ladder is modelled,
          including where it caps, but an event is credited the gold its{" "}
          <em>expected</em> wins earn rather than the gold the run in front of
          you actually won.
        </li>
        <li>Tax withholding on cash prizes, which Arena Direct's terms mention.</li>
      </ul>

    </div>
  );
}
