import { useEffect, useRef, useState } from "react";

/**
 * What a bounded field settles on, given the text it settled with.
 *
 * An empty box is not a zero. A number input reports `""` for anything it
 * cannot parse — a cleared field, a half-typed `7.` — and that says the edit is
 * unfinished, not that the answer is nothing. Reading it as zero and raising it
 * to the minimum is what used to paint a `1` into a box that looked empty, so
 * that the next four digits typed read 15,000 where 5,000 was meant. The held
 * value stands instead, and comes back into view when the draft clears.
 *
 * Held values are returned untouched rather than clamped, because they were not
 * typed here: a link may legitimately carry a figure outside this field's range
 * — `share.ts` accepts a wider one — and an edit the user abandoned should not
 * be the thing that rewrites it.
 */
export function settledValue(text: string, held: number, min: number, max: number): number {
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n)) return held;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Number input for whole-number amounts.
 *
 * Drops focus on wheel events — otherwise scrolling the page with the cursor
 * over a focused field silently edits the value.
 *
 * `step` is deliberately left at 1 rather than set to a convenient spinner
 * increment: the attribute is a *validation* rule counted from `min`, so a
 * step of 1000 from a min of 1 makes 100,000 invalid, and an invalid field
 * silently blocks form submission.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  id,
  disabled,
  fractional,
  text,
  className = "form-control",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  /**
   * Ceiling on the value, and the thing that makes this a *bounded* field:
   * one that reports when it settles rather than on every keystroke.
   *
   * The two go together because a cap can only be applied to a number the user
   * has finished typing. Clamping each keystroke means 500,000 is read as
   * 200,000 the moment the last zero lands, while the box still says 500,000 —
   * the field and the state disagree, and the next thing to clear the draft
   * paints the clamped figure over what was typed. Holding the report back
   * until the native change event costs a bounded field nothing: that event
   * fires on blur, on Enter and immediately on every arrow-key step, so the
   * only edit it defers is one still being typed.
   *
   * Bounded fields are whole-number fields — the value is rounded — which is
   * every field that has a cap here.
   */
  max?: number;
  id?: string;
  disabled?: boolean;
  /** Allows decimals — "any" imposes no step rule, so nothing is invalidated. */
  fractional?: boolean;
  /**
   * What to display instead of the bare number, for units that fix their
   * precision. Shown only while the field is idle — see below.
   */
  text?: string;
  className?: string;
}) {
  /*
   * Keystrokes are echoed verbatim while the field is being edited, and the
   * formatted text returns once the value settles. Reformatting as the user
   * types would fight them: typing "8.5" into a two-place field rewrites it to
   * "8.50" before the 5 is finished, putting the caret behind two zeros the
   * user did not type.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  /*
   * What counts as settled is the native change event, which is not React's
   * onChange — that one is the input event, and fires on every keystroke.
   * The native one fires immediately when a number field is stepped with the
   * spinner or the arrow keys, but not until commit when text is typed. That
   * is precisely the line wanted here: stepping 8.50 up should read 9.50, not
   * strip to 9.5 and stay stripped until the field is left.
   *
   * A bounded field also reports here, and only here. `el.value` rather than
   * the draft because the element's own text is what the browser considers
   * settled — it is already sanitised, so anything unparseable arrives as "".
   *
   * Nothing is reported when the figure has not moved. Clearing a box and
   * leaving it settles on the value already held, and handing that back is not
   * free: `setStructure` rebuilds the config around it, and a config with a new
   * identity restarts every simulation hanging off it. Correcting the box needs
   * no report either — clearing the draft is what puts the value back on screen.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const settle = () => {
      setDraft(null);
      if (max === undefined) return;
      const settled = settledValue(el.value, value, min ?? 0, max);
      if (settled !== value) onChange(settled);
    };
    el.addEventListener("change", settle);
    return () => el.removeEventListener("change", settle);
  }, [max, min, onChange, value]);

  return (
    <input
      ref={ref}
      id={id}
      type="number"
      className={className}
      min={min}
      max={max}
      step={fractional ? "any" : 1}
      value={draft ?? text ?? String(value)}
      disabled={disabled}
      onWheel={(e) => e.currentTarget.blur()}
      onChange={(e) => {
        setDraft(e.target.value);
        // Unbounded fields answer live; a bounded one waits for `settle`.
        if (max === undefined) onChange(Number(e.target.value) || 0);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
