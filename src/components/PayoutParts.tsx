import { Fragment, type ReactNode } from "react";

import { REAL_GEMS } from "../format";
import { boxChip, boxFullName, boxId, type BoxPriceTable, type PayoutBox } from "../lib";

/**
 * What a payout is made of, itemised: "💎 1,600 · 6 packs · MSH".
 *
 * Two places ask it and they have to answer the same way. The run log asks of
 * an event that happened; the outcome table asks of a rung nobody has climbed
 * yet. Either way the question is the one a folded gross cannot answer — a
 * seven-win Arena Direct row reading ≈💎 48,982 says nothing about the two
 * boxes it is nearly all made of, let alone *which* two.
 *
 * The gems are the amount the tier pays rather than a valuation of anything,
 * so they print in gems whatever the display toggle says — see `REAL_GEMS`.
 * The valuation is the gross beside this, which is where dollars belong.
 */

/** A count and its noun: "14 packs", "1 point". */
const counted = (n: number, one: string, many: string): string =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Reward names for a cramped cell, which is not what the breakdown cards call
 * them: a card heading is always plural and has room to be a proper noun,
 * while "1 Play Booster box" in a table column is neither.
 *
 * The boxes are not here. They are drawn as the chips the payout editor uses,
 * beside these — an event that shipped a Spider-Man box and a Marvel Super
 * Heroes box is the case "2 play boxes" cannot state, and it is exactly what
 * someone reading one row wants to see.
 */
const REWARDS = [
  { key: "packs", one: "pack", many: "packs" },
  { key: "playInPoints", one: "point", many: "points" },
] as const;

export type PayoutContents = {
  gems: number;
  packs: number;
  playInPoints: number;
  boxes: readonly PayoutBox[];
};

export function PayoutParts({
  prices,
  payout,
  zeroGems = "omit",
}: {
  prices: BoxPriceTable;
  payout: PayoutContents;
  /**
   * Whether a gem payout of nothing is still an item.
   *
   * A ladder rung lists what it awards, so a rung awarding no gems does not
   * mention gems — "💎 0 · HOB · HOB" spends its first word saying what the
   * row does not pay. An event that happened is the other case: the run log
   * reports what each entry came back with, and "it paid 💎 0" is a result
   * rather than an omission, which is why that column names the gems on every
   * row and stays aligned down its left edge.
   */
  zeroGems?: "show" | "omit";
}) {
  /*
   * Everything it pays, in the order the ladder lists it: the gems, then the
   * counted rewards, then a chip per box.
   */
  const parts: ReactNode[] = [
    ...(payout.gems !== 0 || zeroGems === "show" ? [REAL_GEMS.fmt(payout.gems)] : []),
    ...REWARDS.filter((r) => payout[r.key] > 0).map((r) => (
      <span className="text-body-secondary">
        {counted(payout[r.key], r.one, r.many)}
      </span>
    )),
    ...payout.boxes.map((box, i) => (
      <span
        className={`box-chip box-chip-${box.kind}`}
        title={boxFullName(prices, box)}
        key={`${boxId(box)}-${i}`}
      >
        {boxChip(prices, box)}
      </span>
    )),
  ];

  /* A rung that awards nothing says so, the way an empty cell does elsewhere. */
  if (parts.length === 0) return <span className="text-body-secondary">—</span>;

  /*
   * One list, one separator. The boxes are chips rather than words — drawn as
   * the payout editor draws them, so the row that shipped a box and the ladder
   * that promised it read the same — but they are still items in the same list
   * as the packs, including between two boxes.
   */
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="text-body-secondary"> · </span> : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}
