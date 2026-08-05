import type { ReactNode } from "react";

/**
 * A distribution's percentiles as one plain sentence, with the full row
 * folded behind a disclosure.
 *
 * The five-figure p5/p25/median/p75/p95 strip is the densest jargon the
 * results tabs carry, and most readers want one thing from it: roughly where
 * they will land. The sentence answers that with the middle half and the
 * one-in-twenty tail. The row itself is a click away rather than gone — a
 * disclosure rather than a popover, so the figures stay in the page where
 * they can be checked against the charts and the model.
 */
export function PercentileSummary({
  percentiles,
  fmt,
  tone,
  noun,
}: {
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
  /** Formats a value in the active display unit. */
  fmt: (n: number) => string;
  /** Bootstrap text colour for a figure, judged against the reader's baseline. */
  tone: (n: number) => string;
  /** What one sample is called where the reader sees it: "runs" or "entries". */
  noun: string;
}) {
  const figure = (v: number): ReactNode => (
    <span className={`fw-semibold ${tone(v)}`}>{fmt(v)}</span>
  );
  return (
    <>
      <div className="small mt-1">
        Half the {noun} end between {figure(percentiles.p25)} and{" "}
        {figure(percentiles.p75)}; one in twenty ends below {figure(percentiles.p5)}.
      </div>
      <details className="percentile-details mt-1">
        <summary className="percentile-details-summary">All percentiles</summary>
        <div className="d-flex flex-wrap gap-3 mt-1">
          {(
            [
              ["p5", percentiles.p5],
              ["p25", percentiles.p25],
              ["median", percentiles.p50],
              ["p75", percentiles.p75],
              ["p95", percentiles.p95],
            ] as const
          ).map(([k, v]) => (
            <span key={k} className="small">
              <span className="text-body-secondary">{k} </span>
              {figure(v)}
            </span>
          ))}
        </div>
      </details>
    </>
  );
}
