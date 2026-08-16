import { useState } from "react";

import {
  BOX_KINDS,
  boxChip,
  boxFullName,
  boxLabel,
  boxSetCode,
  type BoxKind,
  type BoxPriceTable,
  type PayoutBox,
} from "../lib";

/**
 * The boxes one payout row pays, as chips you add to and take from.
 *
 * A list rather than a count per kind, because a row can pay two different
 * products — the August 2026 Powered Cube paid a Spider-Man box and a Marvel
 * Super Heroes box for the same seven wins. One chip per box keeps that
 * sayable in a cell that shares its table with three number fields: `MSH` is
 * a Marvel Super Heroes box, and the full name — which is the widest thing
 * this column could hold — is its title and its accessible name instead.
 *
 * The kind is not written either. Collector chips are drawn as foil, which is
 * what the product looks like and is read at a glance on a row paying one of
 * each; the name spells it out for anyone hovering or listening.
 *
 * Adding is a picker, removing is a click on the chip. A box has no quantity
 * to edit and no other property to set, so a chip that only ever means "delete
 * this one" costs nothing to learn and leaves the row a single line.
 */

/** How a box is spelled in the picker, matching the share link's grammar. */
const boxToken = (box: PayoutBox, table: BoxPriceTable): string => {
  const code = boxSetCode(table, box);
  return code === null ? box.kind : `${box.kind}.${code}`;
};

const boxFromToken = (token: string): PayoutBox => {
  const [kind, set] = token.split(".");
  return set === undefined
    ? { kind: kind as BoxKind }
    : { kind: kind as BoxKind, set };
};

/** One `<optgroup>` of the picker. */
export type OptionGroup = { label: string; options: { token: string; label: string }[] };

const KIND_LABEL = { play: "Play", collector: "Collector" } as const;

/**
 * What the picker offers: a box of no particular set, then every set the feed
 * prices, newest first.
 *
 * The two set-less entries come first and always exist, so the control is
 * usable with no feed at all — which is what previews, dev without the proxy
 * and an outage all look like. A set the feed has dropped since a link was
 * written is added back as its own option, so a ladder naming it can still be
 * read and edited rather than silently snapping to the first entry.
 */
export function optionGroups(table: BoxPriceTable, selected: PayoutBox[]): OptionGroup[] {
  const groups: OptionGroup[] = [
    {
      label: "Any set",
      options: BOX_KINDS.map((kind) => ({
        token: kind,
        label: `${KIND_LABEL[kind]} (generic)`,
      })),
    },
  ];

  for (const kind of BOX_KINDS) {
    const options = table.sets
      .filter((s) => s.boxes[kind] !== undefined)
      .map((s) => ({ token: `${kind}.${s.code}`, label: `${s.code.toUpperCase()} ${KIND_LABEL[kind]}` }));
    if (options.length) groups.push({ label: `${KIND_LABEL[kind]} boxes`, options });
  }

  /*
   * Anything already chosen that the list above does not offer — an old link
   * naming a set that has since fallen out of the feed's twenty-set window,
   * or any set at all when there is no feed. Without this the control would
   * show the first option instead, silently repricing a ladder on open.
   *
   * Deduplicated, because one row can pay two boxes of the same set: the
   * cube's seven-win row nearly does, and two options for one product is a
   * duplicate React key as well as a confusing list.
   */
  const known = new Set(groups.flatMap((g) => g.options.map((o) => o.token)));
  const missing: OptionGroup["options"] = [];
  for (const box of selected) {
    const token = boxToken(box, table);
    if (known.has(token)) continue;
    known.add(token);
    missing.push({ token, label: boxLabel(table, box) });
  }
  if (missing.length) groups.push({ label: "Not in the feed", options: missing });

  return groups;
}

export function BoxCell({
  boxes,
  table,
  locked,
  onChange,
}: {
  boxes: PayoutBox[];
  table: BoxPriceTable;
  /** Presets describe real events, so their ladders are read-only. */
  locked: boolean;
  onChange: (boxes: PayoutBox[]) => void;
}) {
  const remove = (at: number) => onChange(boxes.filter((_, i) => i !== at));
  const add = (token: string) => onChange([...boxes, boxFromToken(token)]);

  /*
   * What each box is worth is deliberately not here. This column says which
   * products a row ships, beside three columns saying how much of everything
   * else it pays; a gem figure per box would be the widest thing in the
   * narrowest panel, and it is a valuation rather than a payout, which is the
   * distinction the rest of the table keeps. The About tab prices every box
   * this ladder names, and Advanced settings holds the rates.
   */
  return (
    <div className="d-flex flex-wrap align-items-center gap-1">
      {boxes.map((box, i) => {
        const chip = boxChip(table, box);
        // Spelled out in full for the hover and the screen reader, since the
        // chip itself is a set code and a shimmer.
        const name = boxFullName(table, box);
        /*
         * Collector boxes are drawn as foil. It is what the product looks
         * like, and it separates the two kinds faster than a suffix does on a
         * row that pays one of each. Nothing rests on seeing it: the chip's
         * title and its accessible name both spell the kind out.
         */
        const className = `box-chip box-chip-${box.kind}`;
        return locked ? (
          <span className={className} title={name} key={`${chip}-${i}`}>
            {chip}
          </span>
        ) : (
          <button
            type="button"
            className={className}
            // The chip is the delete control, so the label has to say so —
            // "MSH" alone would leave a screen reader with a button whose
            // name is the thing it removes rather than the act of removing.
            aria-label={`Remove ${name}`}
            title={`${name} — click to remove`}
            onClick={() => remove(i)}
            key={`${chip}-${i}`}
          >
            {chip}
          </button>
        );
      })}
      {!locked && <AddBox table={table} boxes={boxes} onAdd={add} />}
    </div>
  );
}

/**
 * The `+` that adds a box: a chip-sized button that becomes a picker.
 *
 * Two controls rather than one because they want different widths. At rest
 * this is a `+` the size of the chips beside it; choosing needs a list wide
 * enough to read, and a `<select>` sized down to a plus would leave its
 * option list at the mercy of how each browser draws a popup.
 *
 * The picker is a native `<select>` for the same reason it is not a menu: it
 * sits inside the payout table's horizontal scroller, where a CSS popover
 * would be clipped and the browser's own list cannot be. It also costs no
 * Bootstrap JS and no inline script, which the CSP forbids.
 */
function AddBox({
  table,
  boxes,
  onAdd,
}: {
  table: BoxPriceTable;
  boxes: PayoutBox[];
  onAdd: (token: string) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (!picking) {
    return (
      <button
        type="button"
        className="box-chip box-add"
        aria-label="Add a box"
        title="Add a box"
        onClick={() => setPicking(true)}
      >
        +
      </button>
    );
  }

  return (
    <select
      className="form-select form-select-sm w-auto"
      aria-label="Add a box"
      autoFocus
      value=""
      // Closed on blur as well as on a pick, so a picker opened by mistake
      // goes away by clicking off it rather than by choosing something.
      onBlur={() => setPicking(false)}
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value);
        setPicking(false);
      }}
    >
      <option value="">Add a box…</option>
      {optionGroups(table, boxes).map((g) => (
        <optgroup label={g.label} key={g.label}>
          {g.options.map((o) => (
            <option value={o.token} key={o.token}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
