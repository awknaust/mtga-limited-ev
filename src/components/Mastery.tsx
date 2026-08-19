import { REAL_GEMS, approx, signClass, type Money } from "../format";
import { masteryValue, type EventConfig, type MasteryTrack } from "../lib";
import { SectionHeading } from "./SectionHeading";
import { StatStrip } from "./StatStrip";
import { ValueSplitBar, masterySlices } from "./ValueSplitBar";
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
 * could vary, the Player Draft token, is priced at the entry it replaces. The
 * tab does not say so, so a reader who drags the slider expecting these figures
 * to follow will find they do not; `mastery.test.ts` pins the invariance, which
 * is where the reasoning lives if that ever wants revisiting.
 *
 * The prose names no computed figure. Every number it would have quoted is in
 * the strip a few lines below it, and a sentence that restates a tile is a
 * second place to keep in step with the model for no gain.
 */
export function Mastery({
  track,
  config,
  m,
}: {
  /** Which season to price. Chosen beside the event, with the other inputs. */
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
          "Everything the Mastery Pass track pays at your rates, less the pass's cost. The free Set Mastery track is not counted, since you get it whether or not you buy.",
      },
      value: gemsEq(v.net),
      tone: signClass(v.net),
      hint: `for ${price}`,
    },
    {
      key: "pass",
      label: "Pass value",
      help: {
        label: "What the pass value figure means",
        content:
          "Everything on the Mastery Pass track, valued at the rates under Values & assumptions, over the whole season.",
      },
      value: gemsEq(v.pass),
      // No hint: the bar underneath is what the figure cannot say on its own.
      // A pass worth mostly gems and one worth mostly packs read alike as a
      // number, and they are not the same offer.
      children: <ValueSplitBar slices={masterySlices(v)} m={m} />,
    },
    {
      key: "breakEven",
      label: "Break-even level",
      help: {
        label: "What the break-even level means",
        content:
          "The first mastery level at which the pass rewards you have collected are worth the pass's cost. Whether you reach it is not modelled.",
      },
      value:
        v.breakEvenLevel === null ? "—" : `${v.breakEvenLevel} of ${track.passCap}`,
      hint:
        v.breakEvenLevel === null
          ? "never, at these values"
          : "where the pass has paid for itself",
    },
    {
      key: "free",
      label: "Free track",
      help: {
        label: "What the free track figure means",
        content:
          "What the Set Mastery track pays without a pass. Shown for scale; not part of the net above, since you get it either way.",
      },
      value: gemsEq(v.free),
      hint: "yours without paying",
    },
  ];

  return (
    <div>
      <div className="form-text mb-2">
        What the Mastery Pass costs, against what its reward track pays at the
        values under Values &amp; assumptions. The whole track is priced
        assuming you reach the final level.
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
                Free track
              </th>
              <td className="text-end">{gemsEq(v.free)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

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
                  className={lvl.breakEven ? "table-success" : undefined}
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
    </div>
  );
}
