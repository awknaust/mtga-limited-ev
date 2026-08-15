import { REAL_GEMS, approx, pct, type Money } from "../format";
import { masteryValue, type EventConfig, type MasteryTrack } from "../lib";
import { SectionHeading } from "./SectionHeading";
import { StatStrip } from "./StatStrip";
import type { StatTile } from "./Stat";

/**
 * What the Set Mastery Pass returns, against what it costs.
 *
 * The tab answers one question and says plainly what it assumes: it prices the
 * whole published track, so it is the ceiling — how the pass does *if you finish
 * it*. Whether you finish it needs the XP economy, and Wizards publishes the
 * sources of experience but none of the amounts. What stands in for it is the
 * break-even level, which is exact and is the number an attainability model
 * would later be measured against.
 *
 * Unlike every other results tab, nothing here moves with the win rate. That is
 * a property of the valuation rather than an oversight — the one reward that
 * could vary, the Player Draft token, is priced at the entry it replaces — and
 * the intro says so, because a panel that ignores the slider otherwise reads as
 * broken wiring.
 */
export function Mastery({
  track,
  config,
  m,
}: {
  track: MasteryTrack;
  config: EventConfig;
  m: Money;
}) {
  const v = masteryValue(track, config);
  const gemsEq = (n: number): string => approx(m.fmt(n));
  const gemsEq1 = (n: number): string => approx(m.fmt1(n));
  // The price is a real amount somebody was quoted, so it never converts and
  // never takes the ≈. The one figure on this tab the unit toggle cannot reach.
  const price = REAL_GEMS.fmt(track.priceGems);
  const signClass = (n: number): string => (n >= 0 ? "text-success" : "text-danger");
  // Counts, not valuations: 4,000 gold is a count of gold and takes a separator
  // like any four-digit figure, but never a gem sign and never the ≈.
  const count = (n: number): string => (n ? n.toLocaleString() : "—");

  const tiles: StatTile[] = [
    {
      key: "net",
      label: "Net",
      help: {
        label: "What the net figure means",
        content:
          "Everything the Mastery Pass track pays, valued at your rates, less what the pass costs. The free Set Mastery track is not counted: you receive it whether or not you buy, and buying late still grants the pass rewards for levels you already earned, so it is not something the purchase causes.",
      },
      value: gemsEq(v.net),
      tone: signClass(v.net),
      hint: `for ${price}`,
    },
    {
      key: "roi",
      label: "ROI",
      help: {
        label: "What the ROI figure means",
        content:
          "The net above as a share of the pass price. Assumes the track is finished — see the break-even level for how far you have to get.",
      },
      value: pct(v.roi),
      tone: signClass(v.roi),
      hint: `of ${price} paid`,
    },
    {
      key: "breakEven",
      label: "Break-even level",
      help: {
        label: "What the break-even level means",
        content:
          "The first mastery level at which the pass rewards you have collected are worth what the pass cost. Below it you are behind; above it you are ahead. Whether you reach it is not modelled — that depends on how much experience you earn in the season, which Wizards does not publish rates for.",
      },
      value:
        v.breakEvenLevel === null ? "—" : `${v.breakEvenLevel} of ${track.passCap}`,
      hint:
        v.breakEvenLevel === null
          ? "never, at these values"
          : "where the pass has paid for itself",
    },
    {
      key: "pass",
      label: "Pass value",
      help: {
        label: "What the pass value figure means",
        content:
          "Everything on the Mastery Pass track, valued at the rates in Advanced settings, over the whole season.",
      },
      value: gemsEq(v.pass),
      hint: "everything the pass track pays",
    },
    {
      key: "certain",
      label: "Certain value",
      help: {
        label: "What the certain value figure means",
        content:
          "The part of the pass value that needs no judgement call: gems are gems, gold converts at the rate every dual-priced event charges, and the draft token is worth the entry it buys. Everything else — packs, cards, cosmetics — is worth what you decide it is worth. The closer this sits to the price, the less the arguable rates can change the answer.",
      },
      value: gemsEq(v.certain),
      hint: "gems, gold and the token alone",
    },
    {
      key: "free",
      label: "Free track",
      help: {
        label: "What the free track figure means",
        content:
          "What the Set Mastery track pays without a pass. Shown for scale; it is deliberately not part of the net above, because you get it either way.",
      },
      value: gemsEq(v.free),
      hint: "yours without paying",
    },
  ];

  return (
    <div>
      <div className="form-text mb-2">
        The Mastery Pass costs {price} and runs for the season, from this set's
        release until the next. At the values in Advanced settings its rewards
        come to {gemsEq(v.pass)}, a net of {gemsEq(v.net)} ({pct(v.roi)}), and it
        has paid for itself by{" "}
        {v.breakEvenLevel === null
          ? "no level on the track"
          : `level ${v.breakEvenLevel} of ${track.passCap}`}
        .
      </div>
      <div className="form-text mb-2">
        This is the ceiling: it assumes you finish the track. How far your play
        actually gets you is a question about experience points, and Wizards
        publishes where experience comes from — quests and weekly wins — but none
        of the amounts, so it is not modelled here. Nothing on this tab moves
        with the win rate.
      </div>
      <div className="mb-3">
        <StatStrip tiles={tiles} label="Mastery Pass summary" />
      </div>

      <SectionHeading
        className="mt-4"
        title="What the pass pays"
        subtitle="Every reward on the track, counted over the season and priced at your rates. The free column is what you would get anyway."
      />
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Reward</th>
              <th scope="col" className="text-end">
                Free
              </th>
              <th scope="col" className="text-end">
                Pass
              </th>
              <th scope="col" className="text-end">
                Valued at
              </th>
              <th scope="col" className="text-end">
                Pass value
              </th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map((line) => (
              <tr key={line.kind}>
                <th scope="row" className="fw-normal">
                  {line.label}
                </th>
                <td className="text-end">{count(line.freeCount)}</td>
                <td className="text-end">{count(line.passCount)}</td>
                {/* Gold is the one row whose rate is not "per one" — a seventh
                    of a gem a piece rounds to nothing and says less than the
                    rate the events themselves charge, which is the form the
                    About table states it in too. */}
                <td className="text-end">
                  {line.kind === "gold"
                    ? `${gemsEq(10000 * line.rate)} = 10,000 gold`
                    : line.rate === 0
                      ? "nothing"
                      : `${gemsEq1(line.rate)} each`}
                </td>
                <td className="text-end">{line.gems ? gemsEq(line.gems) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Spanning the count columns rather than filling them: those hold
                counts of things, and a gem total dropped into one would read as
                21 packs against ≈462 packs. */}
            <tr className="fw-semibold">
              <th scope="row" colSpan={4} className="text-end">
                Pass total
              </th>
              <td className="text-end">{gemsEq(v.pass)}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={4} className="text-end fw-normal">
                Free track, for comparison
              </th>
              <td className="text-end">{gemsEq(v.free)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="form-text">
        Orbs, card styles, sleeves, avatars and companions count for nothing by
        default, and are listed rather than dropped so it is visible what is
        being ignored. Nothing prices them: an orb buys a card style or an avatar
        in the Mastery Emporium, and neither has a gem price or a
        duplicate-protection value. Each has its own rate in Advanced settings if
        you disagree.
      </p>

      <SectionHeading
        className="mt-4"
        title="Reward track"
        subtitle="Level by level, as Wizards prints it, with what the pass column is worth as it accumulates."
      />
      <details className="mb-0">
        <summary>All {track.levels.length} levels</summary>
        <div className="table-responsive mt-2">
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Set Mastery</th>
                <th scope="col">Set Mastery Pass</th>
                <th scope="col" className="text-end">
                  Pass value
                </th>
                <th scope="col" className="text-end">
                  Cumulative
                </th>
              </tr>
            </thead>
            <tbody>
              {v.levelValues.map((lvl) => (
                <tr
                  key={lvl.level}
                  className={
                    lvl.breakEven ? "table-success" : lvl.inferred ? "text-body-secondary" : undefined
                  }
                >
                  <th scope="row" className="fw-normal">
                    {lvl.level}
                    {lvl.breakEven && (
                      <span className="section-note ms-2">breaks even</span>
                    )}
                  </th>
                  <td>{lvl.freeText || "—"}</td>
                  <td>{lvl.passText || "—"}</td>
                  <td className="text-end">{lvl.passGems ? gemsEq(lvl.passGems) : "—"}</td>
                  <td className="text-end">{gemsEq(lvl.cumulativePassGems)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="form-text">
        Levels 1–40 are Wizards' own wording. Levels 41–45 are not published row
        by row: the amounts come from subtracting the printed rows from the
        season totals, and they are entered at the end of each track because
        their placement is unknown. Everything below level 41 is exact, which
        includes the break-even level. Past level {track.passCap} each further
        level pays one uncommon ICR, worth {gemsEq1(v.beyondPerLevel)}.
      </p>
    </div>
  );
}
