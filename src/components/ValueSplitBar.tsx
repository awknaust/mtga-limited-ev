import { useState } from "react";

import { approx, type Money } from "../format";
import { amountText } from "./holdingText";
import {
  HOLDING_KEYS,
  grossCounts,
  grossSplit,
  heldKeys,
  holding,
  holdingRate,
  type BankrollResult,
  type EventConfig,
  type HoldingKey,
  type WinBucket,
} from "../lib";

/** One component of a total: what it is, how much of it, and what it came to. */
export type ValueSlice = {
  key: HoldingKey;
  label: string;
  /** Gem-equivalent value, and what sizes the segment. */
  worth: number;
  /** How many of the thing, in its own units. */
  amount: number;
};

/**
 * What a run ends up holding, as slices of its ending value.
 *
 * Means rather than medians, and the additivity is the reason: the median
 * run's total is not the sum of each holding's median, so a median bar would
 * sum to a number no run ever held and no tile ever shows.
 */
export function holdingSlices(
  bankroll: BankrollResult,
  config: EventConfig,
  liquidating: boolean,
): ValueSlice[] {
  const keys = heldKeys(config, bankroll.holdings.gold.mean > 0);
  // With winnings liquidated their value already sits inside the gem balance,
  // so a segment each would count it twice — the rule the cards follow.
  const shown = liquidating ? keys.filter((k) => k === "gems" || k === "gold") : keys;

  return shown
    .map((key) => ({
      key,
      label: holding(key).label,
      worth: bankroll.holdings[key].mean * holdingRate(config, key),
      amount: bankroll.holdings[key].mean,
    }))
    .filter((s) => s.worth > 0);
}

/** What one event pays back on average, as slices of its expected gross. */
export function grossSlices(
  config: EventConfig,
  buckets: readonly WinBucket[],
): ValueSlice[] {
  const worths = grossSplit(config, buckets);
  const counts = grossCounts(config, buckets);

  // Walked in the holdings' own order rather than the object's, which only
  // fixes the order these are listed in — the bar ranks them by share when it
  // draws them, and relies on this being deterministic to break ties.
  return HOLDING_KEYS.map((key) => ({
    key,
    label: holding(key).label,
    worth: worths[key],
    amount: counts[key],
  })).filter((s) => s.worth > 0);
}

/**
 * What a total is made of, at the size of a rule under the figure itself.
 *
 * The tile above says what something comes to; this says where that came
 * from, which is the question the number cannot answer on its own — 💎 2,220
 * of gems reads identically to 💎 2,220 that is mostly packs, and those are
 * different outcomes to anyone who has to open the packs to realise it.
 *
 * Checkable rather than decorative: the segments sum to the figure directly
 * above them, by construction in both callers and by test in the per-event
 * one. If a bar and the number over it ever disagree, one of them is wrong.
 *
 * Drawn in HTML rather than SVG, which is the one surprising thing here. The
 * bar stretches to whatever width its tile has, and an SVG stretched that way
 * stretches its corner radii with it — rounded ends come out as ellipses that
 * change shape with the viewport. Flex children take a border radius in real
 * pixels and hold it at any width. `flex-grow` carries the proportions, so
 * the gaps between segments come out of the layout rather than out of the
 * percentages, and the segments still sum to exactly the whole bar.
 *
 * Unlabelled at rest, since it has a tile's width to work in, and named in a
 * line beneath as each segment is pointed at. That line is rendered rather
 * than left to a `title` tooltip: those are drawn by the operating system
 * after a delay it chooses, which is no way to carry the only reading of a
 * figure. `title` stays as a courtesy, and the whole split sits in the bar's
 * `aria-label` for anyone who cannot hover at all.
 */
export function ValueSplitBar({ slices, m }: { slices: ValueSlice[]; m: Money }) {
  const [hovered, setHovered] = useState<HoldingKey | null>(null);

  const total = slices.reduce((acc, s) => acc + s.worth, 0);
  // One segment is a bar of a single colour, which states the obvious.
  if (slices.length < 2 || total <= 0) return null;

  /*
   * Biggest share first, so the bar ranks rather than lists.
   *
   * A fixed order would put gems at the left of every event whatever it paid,
   * and the question this bar answers is which holding the value came from —
   * an answer the reader should get from the shape without reading a single
   * label. On an event paying boxes, boxes lead.
   *
   * Safe to reorder because the colours are keyed by holding rather than by
   * position: a segment keeps its hue wherever it lands, so a preset that
   * reshuffles the ranking cannot repaint gems as gold. Copied before sorting,
   * since the array belongs to the caller, and `sort` is stable, so holdings
   * worth exactly the same keep the order the model listed them in.
   */
  const ranked = [...slices].sort((a, b) => b.worth - a.worth);

  const share = (worth: number) => Math.round((worth / total) * 100);
  // How much of the thing, and what that came to — neither answers the other:
  // 6.2 packs does not say what they are worth, and ≈ $1.60 does not say what
  // it is. Whole counts print whole; an average that landed between two packs
  // keeps its decimal.
  const detail = (s: ValueSlice) =>
    `${s.label} ${amountText(s.key, s.amount, Number.isInteger(s.amount))} · worth ${approx(
      m.fmt(s.worth),
    )}`;

  const active = ranked.find((s) => s.key === hovered);

  return (
    <>
      <div
        className="value-split"
        role="img"
        // Read out in the drawn order, largest first, so someone hearing the
        // bar is told what dominates it in the same breath the sighted reader
        // sees it.
        aria-label={`Made up of ${ranked
          .map((s) => `${s.label} ${approx(m.fmt(s.worth))}`)
          .join(", ")}`}
        onPointerLeave={() => setHovered(null)}
      >
        {ranked.map((s) => (
          <div
            key={s.key}
            className={`value-split-seg slice-${s.key}${
              hovered && hovered !== s.key ? " is-muted" : ""
            }`}
            // The proportions. Set here because they are data, and the sole
            // reason this is not wholly in the stylesheet.
            style={{ flexGrow: s.worth }}
            // Pointer rather than mouse, so a tap on a touch screen — where
            // there is no hover at all — still names the segment.
            onPointerEnter={() => setHovered(s.key)}
            title={`${detail(s)} — ${share(s.worth)}%`}
          />
        ))}
      </div>
      {/*
        Always rendered, so naming a segment cannot change the tile's height
        and shove the rest of the strip around as the pointer crosses the bar.
        Empty is a space, not nothing.
      */}
      <div className="stat-hint value-split-detail">
        {active ? `${detail(active)} · ${share(active.worth)}%` : " "}
      </div>
    </>
  );
}
