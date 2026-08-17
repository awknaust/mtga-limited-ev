import { useState } from "react";

import { REAL_GEMS, approx, pct, type Money } from "../format";
import {
  boxFullName,
  ladderBoxes,
  type BankrollRun,
  type EntryCurrency,
  type EventConfig,
  type SampleRun,
} from "../lib";
import { PayoutParts } from "./PayoutParts";
import { SectionHeading } from "./SectionHeading";
import { Stat } from "./Stat";

/**
 * One run of the bankroll simulation, event by event.
 *
 * Everything else on this tab is an average over runs nobody can see: a bar in
 * a histogram is four hundred runs that went a certain way, with no way to ask
 * what that way was. This is the way — entered on gold, lost at 1-2, entered
 * again, went 7-1 — which is the thing a distribution cannot say however many
 * percentiles are printed beside it.
 */

/** Rows shown at once. A run at the cap would otherwise bury the tab. */
const VISIBLE = 30;

/** A count and its noun: "14 packs", "1 collector box". */
const counted = (n: number, one: string, many: string): string =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * The rewards for the run summary, where a sentence has room for the full
 * names, plus the draft packs that come with each entry rather than with a win
 * count. A payout type added to the model belongs here and in `PayoutParts`,
 * which is what names them in the cramped cells of the log below.
 */
const RUN_REWARDS: {
  key:
    | "packs"
    | "mythicPacks"
    | "cubePacks"
    | "draftPacks"
    | "playInPoints"
    | "qualifierTokens";
  one: string;
  many: string;
}[] = [
  { key: "packs", one: "pack", many: "packs" },
  { key: "mythicPacks", one: "mythic pack", many: "mythic packs" },
  { key: "cubePacks", one: "cube pack", many: "cube packs" },
  { key: "draftPacks", one: "draft pack", many: "draft packs" },
  // A balance rather than a tally on this one, so on a Play-In it reads as
  // what is left rather than what was won. That is the honest sentence: a run
  // that started on twenty points and spent them ends holding none.
  { key: "playInPoints", one: "play-in point", many: "play-in points" },
  { key: "qualifierTokens", one: "qualifier token", many: "qualifier tokens" },
];

/** What one entry cost, in whichever currency actually paid for it. */
const entryText = (config: EventConfig, paidWith: EntryCurrency): string => {
  if (paidWith === "points") {
    return counted(config.entryCostPlayInPoints, "point", "points");
  }
  if (paidWith === "gold") return `${config.entryCostGold.toLocaleString()} gold`;
  return REAL_GEMS.fmt(config.entryCostGems);
};

/** A list as a sentence would say it: "a, b and c". */
const proseJoin = (parts: string[]): string =>
  parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/**
 * Everything the run ends holding, named: the two balances, then every reward
 * it won.
 *
 * Every item here is a real amount rather than a valuation, gems included, so
 * none of them follow the display unit. The valuation is the "worth ≈ …" that
 * closes the sentence, and it is the only part dollars belong in.
 */
const heldText = (config: EventConfig, run: BankrollRun): string =>
  proseJoin([
    REAL_GEMS.fmt(run.finalGems),
    `${Math.round(run.finalGold).toLocaleString()} gold`,
    ...RUN_REWARDS.filter((r) => run[r.key] > 0).map((r) =>
      counted(run[r.key], r.one, r.many),
    ),
    // Named in full here, where a sentence has the room the table cell does
    // not: "2 The Hobbit Play Booster boxes" is what the run came away with.
    ...ladderBoxes(config.payouts)
      .map((box, i) => ({ box, n: run.boxes[i] ?? 0 }))
      .filter(({ n }) => n > 0)
      .map(({ box, n }) => {
        const name = boxFullName(config.boxPrices, box);
        return n === 1 ? `1 ${name}` : `${n.toLocaleString()} ${name}es`;
      }),
  ]);

export function RunLog({
  samples,
  config,
  m,
}: {
  samples: SampleRun[];
  config: EventConfig;
  m: Money;
}) {
  /*
   * The landmark to open on. Held by label rather than by index so it survives
   * a re-simulation that moves every run — changing the win rate should leave
   * you looking at the median, not at whatever is now 50th.
   */
  const [label, setLabel] = useState("median");
  const at = Math.max(
    0,
    samples.findIndex((s) => s.label === label),
  );
  const [offset, setOffset] = useState(0);
  const index = Math.min(samples.length - 1, Math.max(0, at + offset));
  const sample = samples[index];
  if (!sample) return null;

  const step = (by: number) => {
    // Stepping is relative to the landmark, so the two controls compose rather
    // than fight: pick p95, step twice, you are two runs above p95.
    if (index + by >= 0 && index + by < samples.length) setOffset(offset + by);
  };
  const jump = (to: string) => {
    setLabel(to);
    setOffset(0);
  };

  const { run } = sample;
  const log = run.log ?? [];
  const rows = log.slice(0, VISIBLE);
  const landmarks = samples.filter((s) => s.label !== undefined);
  // Points earn a column when the event charges them or a ladder pays them —
  // the same test `heldKeys` applies, so the table and the breakdown agree
  // about whether points are part of this event at all.
  const showPoints =
    config.entryCostPlayInPoints > 0 ||
    config.payouts.some((t) => (t.playInPoints ?? 0) > 0);

  return (
    <>
      <SectionHeading
        className="mt-4"
        title="Example runs"
        subtitle="Explore a few of the runs the simulation summarised."
      />

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span className="btn-group btn-group-sm" role="group" aria-label="Jump to">
          {landmarks.map((s) => (
            <button
              key={s.label}
              type="button"
              className={`btn ${s === sample ? "btn-primary" : "btn-outline-secondary"}`}
              aria-pressed={s === sample}
              onClick={() => jump(s.label as string)}
            >
              {s.label}
            </button>
          ))}
        </span>
        <span className="btn-group btn-group-sm" role="group" aria-label="Step through runs">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => step(-1)}
            disabled={index === 0}
            aria-label="Previous run"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => step(1)}
            disabled={index >= samples.length - 1}
            aria-label="Next run"
          >
            ›
          </button>
        </span>
        <span className="section-note">
          run {index + 1} of {samples.length}
        </span>
      </div>

      <Stat
        className="mb-3"
        // An arrow rather than the middot it was: the two halves are a
        // sequence, not a pair of facts — this many events, and then this is
        // how it ended.
        label={
          <>
            Run {index + 1}: Played {run.events}{" "}
            {run.events === 1 ? "event" : "events"} →{" "}
            {run.survived ? "stopped at the cap" : "ran out of currency"}
          </>
        }
      >
        {/* The realised rate rather than the slider's: with uncertainty on, a
            run is dealt a rate of its own, and its record is where that shows. */}
        {run.rounds > 0 ? (
          <div className="stat-hint mt-1">
            Won {run.wins.toLocaleString()} of {run.rounds.toLocaleString()}{" "}
            {run.rounds === 1 ? "match" : "matches"} — a {pct(run.wins / run.rounds)}{" "}
            average match win rate.
          </div>
        ) : null}
        <div className="stat-hint mt-1">
          {/* The holdings are real amounts; the "all told" is a valuation. */}
          Ended holding {heldText(config, run)}, worth{" "}
          <span className="fw-semibold">{approx(m.fmt(sample.value))}</span> all told.
        </div>
      </Stat>

      {/* A balance too small for one entry plays nothing, which is a real
          outcome and not an empty table with headings over it. */}
      {log.length === 0 ? (
        <div className="form-text">
          Nothing to show: the starting balance never covered an entry, so this
          run played no events at all.
        </div>
      ) : (
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          {/*
            Every figure below is a real amount, so the whole table stays in
            Arena's own two currencies whatever the display toggle says. What
            an entry cost, what a tier paid and what the balance stood at are
            all things that happened in gems; a dollar column would be pricing
            a purchase nobody can make. Dollars belong to the summary above,
            where the ≈ says it is a valuation — which is also why these two
            headings can name their unit without contradicting the toggle.
          */}
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Matches</th>
              <th scope="col">Entry</th>
              <th scope="col">Payout</th>
              <th scope="col" className="text-end">
                Gems
              </th>
              <th scope="col" className="text-end">
                Gold
              </th>
              {/* Only where points are in play, which is the two Play-Ins: a
                  column of zeroes on every draft would cost the table its
                  width for nothing. */}
              {showPoints && (
                <th scope="col" className="text-end">
                  Points
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.event}>
                <td className="text-body-secondary">{row.event}</td>
                <td className="fw-semibold">
                  {row.wins}–{row.rounds - row.wins}
                </td>
                <td className="text-body-secondary">
                  {entryText(config, row.paidWith)}
                </td>
                {/* Gems on every row, zero included: this is what the entry
                    came back with, not what the ladder promises. */}
                <td>
                  <PayoutParts prices={config.boxPrices} payout={row} zeroGems="show" />
                </td>
                <td className="text-end">{REAL_GEMS.fmt(row.gemBalance)}</td>
                <td className="text-end text-body-secondary">
                  {Math.round(row.goldBalance).toLocaleString()}
                </td>
                {showPoints && (
                  <td className="text-end text-body-secondary">
                    {row.pointBalance.toLocaleString()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {log.length > rows.length || run.events > log.length ? (
        <div className="form-text">
          {log.length > rows.length
            ? `Showing the first ${rows.length} events of ${log.length}. `
            : ""}
          {run.events > log.length
            ? `The run played ${run.events}; only its first ${log.length} were recorded.`
            : ""}
        </div>
      ) : null}
    </>
  );
}
