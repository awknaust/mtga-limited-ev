import { useState } from "react";

import type { Money } from "../format";
import type { EventConfig, EventLog, SampleRun } from "../lib";

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

/**
 * Reward names for a cramped cell, which is not what the breakdown cards call
 * them: a card heading is always plural and has room to be a proper noun,
 * while "1 Play Booster box" in a table column is neither.
 */
const REWARDS: { key: keyof EventLog; one: string; many: string }[] = [
  { key: "packs", one: "pack", many: "packs" },
  { key: "playInPoints", one: "point", many: "points" },
  { key: "playBoxes", one: "play box", many: "play boxes" },
  { key: "collectorBoxes", one: "collector box", many: "collector boxes" },
];

/** What a tier paid, beyond the gems. */
const rewardText = (row: EventLog): string =>
  REWARDS.filter((r) => (row[r.key] as number) > 0)
    .map((r) => `${row[r.key]} ${row[r.key] === 1 ? r.one : r.many}`)
    .join(" · ");

export function RunLog({
  samples,
  config,
  m,
  isBo3,
  runs,
}: {
  samples: SampleRun[];
  config: EventConfig;
  m: Money;
  isBo3: boolean;
  /** How many runs were simulated, of which these are the ones kept. */
  runs: number;
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

  return (
    <>
      <h3 className="section-title mt-4">
        A run in full
        <span className="section-note ms-2">
          {samples.length} of {runs.toLocaleString()} runs kept, ordered by what
          they came to
        </span>
      </h3>

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

      <div className="stat mb-3">
        <div className="stat-label">
          {run.events} {run.events === 1 ? "event" : "events"} ·{" "}
          {run.survived ? "stopped at the cap" : "ran out of currency"}
        </div>
        <div className="stat-hint mt-1">
          Ended holding {m.fmt(run.finalGems)} and{" "}
          {Math.round(run.finalGold).toLocaleString()} gold, worth{" "}
          <span className="fw-semibold">{m.fmt(sample.value)}</span> all told.
        </div>
      </div>

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
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{isBo3 ? "Matches" : "Games"}</th>
              <th scope="col">Entry</th>
              <th scope="col">Payout</th>
              <th scope="col" className="text-end">
                Gems
              </th>
              <th scope="col" className="text-end">
                Gold
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rewards = rewardText(row);
              return (
                <tr key={row.event}>
                  <td className="text-body-secondary">{row.event}</td>
                  <td className="fw-semibold">
                    {row.wins}–{row.rounds - row.wins}
                  </td>
                  <td className="text-body-secondary">
                    {row.paidWithGold
                      ? `${config.entryCostGold.toLocaleString()} gold`
                      : m.fmt(config.entryCostGems)}
                  </td>
                  <td>
                    {m.fmt(row.gems)}
                    {rewards ? (
                      <span className="text-body-secondary"> · {rewards}</span>
                    ) : null}
                  </td>
                  <td className="text-end">{m.fmt(row.gemBalance)}</td>
                  <td className="text-end text-body-secondary">
                    {Math.round(row.goldBalance).toLocaleString()}
                  </td>
                </tr>
              );
            })}
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
