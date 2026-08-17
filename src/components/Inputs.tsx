import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { money } from "../format";

/**
 * The form controls the app types numbers into.
 *
 * Split out of App.tsx once the Mastery tab needed the gem field too. They were
 * private to that file while the payout editor was the only caller, and a second
 * caller is what makes them a component rather than a local helper — the point
 * being that a gem amount looks the same wherever it is entered or shown.
 */
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
  id,
  disabled,
  fractional,
  text,
  className = "form-control",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
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
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const settle = () => setDraft(null);
    el.addEventListener("change", settle);
    return () => el.removeEventListener("change", settle);
  }, []);

  return (
    <input
      ref={ref}
      id={id}
      type="number"
      className={className}
      min={min}
      step={fractional ? "any" : 1}
      value={draft ?? text ?? String(value)}
      disabled={disabled}
      onWheel={(e) => e.currentTarget.blur()}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(Number(e.target.value) || 0);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** A number input with a currency marker in front of it. */
export function AddonInput({
  addon,
  id,
  disabled,
  fractional,
  text,
  value,
  onChange,
  compact,
}: {
  addon: ReactNode;
  id?: string;
  disabled?: boolean;
  fractional?: boolean;
  text?: string;
  value: number;
  onChange: (n: number) => void;
  /** Narrower marker and field, for the payout table's cramped columns. */
  compact?: boolean;
}) {
  return (
    // The marker names the currency at the point of entry, so a field cannot
    // be misread as the other one while the toggle is out of view.
    <div className={`input-group${compact ? " input-group-sm input-group-compact" : ""}`}>
      <span className="input-group-text">{addon}</span>
      <NumberInput
        id={id}
        disabled={disabled}
        min={0}
        fractional={fractional}
        text={text}
        value={value}
        onChange={onChange}
        className={`form-control${compact ? " form-control-sm text-end" : ""}`}
      />
    </div>
  );
}

/**
 * A field holding gems and only gems, whatever the display unit.
 *
 * Rates — gems per dollar, gems per 10,000 gold — define the conversions
 * rather than being subject to them. The rest of the entry-and-payout panel
 * qualifies for a different reason: the entry cost and the ladder's payouts
 * are the event's published numbers, transcribed from a rewards table that
 * quotes gems, so a dollar field would mean converting by hand to check a row
 * against its source. Those two also have to agree with each other — an entry
 * in dollars over a ladder in gems cannot be read down the column.
 *
 * The starting balance is the one exception, and takes `MoneyInput`: it is
 * what a reader compares against what a top-up would cost, so it is the field
 * they are likeliest to want to type in money.
 */
export function GemInput(props: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return <AddonInput addon={<i className="bi bi-gem" aria-hidden="true" />} {...props} />;
}

/** Gold is Arena's own currency and never follows the display unit. */
export function GoldInput(props: {
  id?: string;
  disabled?: boolean;
  value: number;
  onChange: (n: number) => void;
}) {
  return <AddonInput addon={<i className="bi bi-coin" aria-hidden="true" />} {...props} />;
}

/**
 * Play-in points: a count of things, not money, so like gold it never follows
 * the display unit. They do carry a gem rate, but that rate prices a *leftover*
 * balance rather than saying what the field means — twenty points is twenty
 * points whether or not anybody would sell them.
 */
export function PointsInput(props: {
  id?: string;
  disabled?: boolean;
  value: number;
  onChange: (n: number) => void;
  compact?: boolean;
}) {
  return (
    <AddonInput
      addon={<i className="bi bi-ticket-perforated" aria-hidden="true" />}
      {...props}
    />
  );
}

/** A gem-valued input, displayed and edited in the active unit. */
export function MoneyInput({
  gemValue,
  onChange,
  m,
  id,
  disabled,
}: {
  gemValue: number;
  onChange: (gems: number) => void;
  m: ReturnType<typeof money>;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <AddonInput
      addon={m.unit === "usd" ? "$" : <i className="bi bi-gem" aria-hidden="true" />}
      id={id}
      disabled={disabled}
      fractional={m.fractional}
      text={m.inputText(gemValue)}
      value={m.toInput(gemValue)}
      onChange={(n) => onChange(m.fromInput(n))}
    />
  );
}

/**
 * A gem-valued input pinned to dollars, whatever the display unit.
 *
 * Box prices are quoted in dollars everywhere they are sourced — street price
 * on MTGGoldfish, Wizards' cash substitution — so editing them in gems means
 * converting by hand to check a figure against the page it came from.
 *
 * Only the field is dollars. The stored value is still gems, so the rate
 * applies at the edit and not inside the simulation, and `gemsPerUsd` stays
 * what its own tooltip says it is: a display setting. The visible consequence
 * is that changing the rate re-prices a box that was already set, because the
 * gems behind it are what is held.
 */
export function UsdInput({
  gemValue,
  onChange,
  gemsPerUsd,
  id,
  disabled,
}: {
  gemValue: number;
  onChange: (gems: number) => void;
  gemsPerUsd: number;
  id?: string;
  disabled?: boolean;
}) {
  const usd = useMemo(() => money("usd", gemsPerUsd), [gemsPerUsd]);
  return (
    <MoneyInput
      id={id}
      m={usd}
      gemValue={gemValue}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
