import type { ReactNode } from "react";

import { InfoTip } from "./InfoTip";

/**
 * One stat tile: a label over a figure, with optional help and hint.
 *
 * Every boxed figure in the app is one of these — the bankroll strip, the
 * per-event grid, the percentile rows, the holding cards. They vary in what
 * sits under the label, so the parts are all optional and `children` takes
 * whatever a particular tile carries beyond them: a percentile row, a mini
 * histogram, a second hint.
 */
export type StatProps = {
  label: ReactNode;
  /**
   * A popover spelling out what the figure means, for a reader who does not
   * live in the statistics. The label names the button for a screen reader;
   * the content is the explanation.
   */
  help?: { label: string; content: string };
  value?: string;
  /** Bootstrap text colour for the value, where the figure has a sign. */
  tone?: string;
  /** Smaller value styling, for dense rows of many tiles. */
  compact?: boolean;
  hint?: ReactNode;
  /** Sizing and spacing; tiles in a grid fill their cell with `h-100`. */
  className?: string;
  children?: ReactNode;
};

/** A tile's data plus the identity a list of them needs. */
export type StatTile = StatProps & {
  /** Stable identity, so a tile keeps its DOM as the set around it changes. */
  key: string;
};

export function Stat({
  label,
  help,
  value,
  tone,
  compact,
  hint,
  className = "h-100",
  children,
}: StatProps) {
  return (
    <div className={`stat ${className}`.trimEnd()}>
      <div className="stat-label">
        {label}
        {help && <InfoTip label={help.label} content={help.content} />}
      </div>
      {value !== undefined && (
        <div className={`${compact ? "fw-semibold" : "stat-value"} ${tone ?? ""}`.trimEnd()}>
          {value}
        </div>
      )}
      {hint !== undefined && <div className="stat-hint">{hint}</div>}
      {children}
    </div>
  );
}
