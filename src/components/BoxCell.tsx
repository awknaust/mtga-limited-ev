import { useRef, useState } from "react";

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

/** One group of the picker: a heading and the boxes under it. */
export type OptionGroup = {
  label: string;
  options: { token: string; label: string; box: PayoutBox }[];
};

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
        box: { kind },
      })),
    },
  ];

  for (const kind of BOX_KINDS) {
    const options = table.sets
      .filter((s) => s.boxes[kind] !== undefined)
      .map((s) => ({
        token: `${kind}.${s.code}`,
        label: `${s.code.toUpperCase()} ${KIND_LABEL[kind]}`,
        box: { kind, set: s.code },
      }));
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
    missing.push({ token, label: boxLabel(table, box), box });
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
            className={`${className} box-chip-remove`}
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
 * The `+` that adds a box, and the small dialog it opens.
 *
 * A dialog rather than a control in the cell, because there is no room for
 * one: the column is a chip wide inside a table that scrolls horizontally, so
 * anything that expands in place either overflows the cell or is clipped by
 * that scroller. Lifting the choice out of the table sidesteps both.
 *
 * A native `<dialog>` rather than a Bootstrap modal, for two reasons. It
 * draws in the browser's top layer, which is what puts it beyond the reach of
 * the scroller; and there is one of these per payout row, where a Bootstrap
 * modal would mean an instance to construct and dispose for each. Escape and
 * the focus trap come with the element.
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
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    setOpen(true);
    ref.current?.showModal();
  };
  const close = () => {
    setOpen(false);
    ref.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className="box-chip box-add"
        aria-label="Add a box"
        title="Add a box"
        onClick={show}
      >
        +
      </button>
      <dialog
        ref={ref}
        className="box-dialog"
        aria-label="Add a box"
        // `close` fires for Escape too, which the element handles itself —
        // this is what keeps React's idea of open in step with the DOM's.
        onClose={() => setOpen(false)}
        // The dialog fills its own backdrop, so a click landing on the
        // element itself rather than on its contents is a click outside.
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        {/* Built only while open, so a table of eight rows is not eight
            copies of the set list sitting in the DOM. */}
        {open && (
          <div className="box-dialog-body">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h2 className="section-title mb-0">Add a box</h2>
              <button
                type="button"
                className="btn-close btn-sm"
                aria-label="Close"
                onClick={close}
              />
            </div>
            {/* The same chips the row shows, a size up: what you pick is what
                lands in the cell, and a collector box is foil in both places. */}
            {optionGroups(table, boxes).map((g) => (
              <div className="mb-2" key={g.label}>
                <div className="form-label mb-1">{g.label}</div>
                <div className="d-flex flex-wrap gap-2">
                  {g.options.map((o) => (
                    <button
                      type="button"
                      className={`box-chip box-chip-lg box-chip-${o.box.kind}`}
                      title={boxFullName(table, o.box)}
                      aria-label={`Add ${boxFullName(table, o.box)}`}
                      key={o.token}
                      onClick={() => {
                        onAdd(o.token);
                        close();
                      }}
                    >
                      {boxChip(table, o.box)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </dialog>
    </>
  );
}
