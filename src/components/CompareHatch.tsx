/**
 * The lines that tell a later lap through the colour ramp apart.
 *
 * There are seventeen events and eight hues, so most of them share a colour
 * with another. The curve chart settles that with a dash pattern, which a
 * filled shape cannot use — so the bar charts settle it here, by laying
 * diagonal slashes over the fill of every event on the ramp's second lap, and
 * a grid of them over the third.
 *
 * **Cut out of the bar, not painted onto it.** The lines are the card's own
 * background colour, so a hatched bar reads as the same colour with gaps rather
 * than as a paler colour, which is the mistake a white or black overlay makes:
 * a hue mixed toward anything is a *different hue* to the eye, and telling two
 * events apart by texture only works if it does not also change what colour
 * they are. That is why this is a separate rect over the fill rather than a
 * fill of its own: the bar underneath keeps `var(--series)` at full strength.
 *
 * **One pattern per texture, not one per hue.** A `<pattern>`'s contents
 * resolve custom properties against the pattern element, not against whatever
 * references it, so a hatch drawn in `var(--series)` would need one pattern per
 * hue. Drawing in the background colour instead needs no hue at all, and one
 * definition of each texture serves every row.
 *
 * The ids have to be unique in the *document* — two charts on this tab both
 * use these — so each caller passes its own prefix from `useId`. The reference
 * is a `fill` presentation attribute rather than a class, which is only safe
 * because nothing in the stylesheet sets `fill` on these: a CSS rule would win
 * over the attribute and the hatch would vanish.
 */
export function CompareHatchDefs({ id }: { id: string }) {
  return (
    <defs>
      {Object.entries(PATTERNS).map(([name, { cell, lines }]) => (
        /*
          `userSpaceOnUse`, so the lines line up across every row of the chart
          rather than restarting inside each bar — which would draw a different
          phase of the pattern in every bar and read as a rendering fault.
        */
        <pattern
          key={name}
          id={`${id}-${name}`}
          width={cell}
          height={cell}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          {lines.map(([x2, y2]) => (
            <line key={`${x2},${y2}`} x1={0} y1={0} x2={x2} y2={y2} className="compare-hatch-line" />
          ))}
        </pattern>
      ))}
    </defs>
  );
}

/**
 * The textures a lap can cut out of a fill, and what draws each: the edge of
 * one pattern cell and the segments from its corner, in chart units, before
 * the whole cell is turned 45°.
 *
 * `Hatch` is derived from this table, so a lap in `compareSeries.ts` cannot
 * name a texture nothing here draws. That matters because the failure would
 * be silent: a fill referencing an undefined pattern renders as no fill at
 * all, leaving that lap looking like the first with the uniqueness test none
 * the wiser, since it reads the lap and not the pixels.
 *
 * The slashes sit 6 apart. Rows here are ~19px tall, so that crosses a bar
 * three or four times — often enough to read as a texture at a glance, sparse
 * enough that a short bar is still mostly its own colour. The grid is coarser,
 * 9, because it cuts twice: at the slashes' spacing it would take more colour
 * out of a bar than it left, and read as a paler hue rather than the same one
 * with gaps.
 */
const PATTERNS = {
  slash: { cell: 6, lines: [[0, 6]] },
  cross: { cell: 9, lines: [[0, 9], [9, 0]] },
} as const satisfies Record<string, { cell: number; lines: readonly (readonly [number, number])[] }>;

/** How a filled shape is textured: plain, or one of the patterns above. */
export type Hatch = "plain" | keyof typeof PATTERNS;

/** The fill a textured shape takes, or none where the lap is a plain one. */
export const hatchFill = (id: string, hatch: Hatch): string | undefined =>
  hatch === "plain" ? undefined : `url(#${id}-${hatch})`;
