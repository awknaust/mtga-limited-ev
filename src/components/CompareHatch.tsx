/**
 * The slashes that tell a second lap through the colour ramp apart.
 *
 * There are sixteen events and eight hues, so half of them share a colour with
 * another. The curve chart settles that with a dash pattern, which a filled
 * shape cannot use — so the bar charts settle it here, by laying diagonal
 * slashes over the fill of every event on the ramp's second lap.
 *
 * **Cut out of the bar, not painted onto it.** The slashes are the card's own
 * background colour, so a hatched bar reads as the same colour with gaps rather
 * than as a paler colour, which is the mistake a white or black overlay makes:
 * a hue mixed toward anything is a *different hue* to the eye, and telling two
 * events apart by texture only works if it does not also change what colour
 * they are. That is why this is a separate rect over the fill rather than a
 * fill of its own: the bar underneath keeps `var(--series)` at full strength.
 *
 * **One pattern per chart, not one per hue.** A `<pattern>`'s contents resolve
 * custom properties against the pattern element, not against whatever
 * references it, so a hatch drawn in `var(--series)` would need one pattern per
 * hue. Drawing in the background colour instead needs no hue at all, and one
 * definition serves every row.
 *
 * The id has to be unique in the *document* — two charts on this tab both use
 * this — so each caller passes its own from `useId`. The reference is a `fill`
 * presentation attribute rather than a class, which is only safe because
 * nothing in the stylesheet sets `fill` on these: a CSS rule would win over the
 * attribute and the hatch would vanish.
 */
export function CompareHatchDefs({ id }: { id: string }) {
  return (
    <defs>
      {/*
        `userSpaceOnUse`, so the slashes line up across every row of the chart
        rather than restarting inside each bar — which would draw a different
        phase of the pattern in every bar and read as a rendering fault.
      */}
      <pattern
        id={id}
        width={SPACING}
        height={SPACING}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-45)"
      >
        <line x1={0} y1={0} x2={0} y2={SPACING} className="compare-hatch-line" />
      </pattern>
    </defs>
  );
}

/**
 * How far apart the slashes sit, in chart units.
 *
 * Rows here are ~19px tall, so this crosses a bar three or four times — often
 * enough to read as a texture at a glance, sparse enough that a short bar is
 * still mostly its own colour.
 */
const SPACING = 6;

/** The fill a hatched shape takes, or none where the lap is a plain one. */
export const hatchFill = (id: string, hatched: boolean): string | undefined =>
  hatched ? `url(#${id})` : undefined;
