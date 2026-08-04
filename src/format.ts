/**
 * Display units.
 *
 * The model works in gems and only in gems — every balance, rate and payout it
 * stores is a gem figure. This converts on the way to the screen and back from
 * an input, so switching units cannot move a stored value.
 *
 * Gold is deliberately not converted. It is an Arena-internal currency with its
 * own exchange rate against gems, and putting a dollar sign on it would imply a
 * price you cannot pay.
 */

export type Unit = "gems" | "usd";

export type Money = {
  unit: Unit;
  /** For labels: "gems" or "USD". */
  label: string;
  /** A gem amount, rendered in the active unit. */
  fmt: (gems: number) => string;
  /** Same, but keeping a decimal on gem amounts that have one. */
  fmt1: (gems: number) => string;
  /** Gems to the number an input should show. */
  toInput: (gems: number) => number;
  /**
   * The same value as the text a field should display when it is not being
   * edited. Separate from `toInput` because a number cannot carry a trailing
   * zero — 8.5 and 8.50 are one value, and only the string form can say which
   * of them to print.
   */
  inputText: (gems: number) => string;
  /** An input's number back to gems. */
  fromInput: (n: number) => number;
  /** Whether inputs must accept decimals. */
  fractional: boolean;
};

const withSign = (n: number, body: string): string => (n < 0 ? `−${body}` : body);

/**
 * Dollar amounts here span five orders of magnitude — a pack is worth a few
 * cents and a collector box several hundred dollars — so precision follows
 * size rather than being fixed at two places.
 */
const usd = (value: number): string => {
  const a = Math.abs(value);
  const digits = a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
  return withSign(value, `$${a.toFixed(digits)}`);
};

const gemsWhole = (value: number): string =>
  withSign(value, Math.abs(Math.round(value)).toLocaleString());

const gemsLoose = (value: number): string =>
  withSign(
    value,
    Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 }),
  );

export function money(unit: Unit, gemsPerUsd: number): Money {
  const rate = gemsPerUsd > 0 ? gemsPerUsd : 1;
  if (unit === "gems") {
    return {
      unit,
      label: "gems",
      fmt: gemsWhole,
      fmt1: gemsLoose,
      toInput: (g) => g,
      inputText: (g) => String(g),
      fromInput: (n) => n,
      fractional: false,
    };
  }
  /*
   * Inputs show cents, so a collector box reads $630.33 rather than $630.3325.
   * Rounding here only affects what is displayed — the gem value behind an
   * untouched field is unchanged — but editing a sub-cent figure such as a
   * pack's $0.055 will snap it to the nearest cent.
   */
  const cents = (g: number): number => Math.round((g / rate) * 100) / 100;
  return {
    unit,
    label: "USD",
    fmt: (g) => usd(g / rate),
    fmt1: (g) => usd(g / rate),
    toInput: cents,
    /*
     * Always two places, so $8.50 does not display as $8.5. A price with a
     * missing cents digit reads as a truncation of some other number, which is
     * the one thing a money field should never do.
     */
    inputText: (g) => cents(g).toFixed(2),
    fromInput: (n) => n * rate,
    fractional: true,
  };
}
