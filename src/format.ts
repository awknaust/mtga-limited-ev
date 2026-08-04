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
      fromInput: (n) => n,
      fractional: false,
    };
  }
  return {
    unit,
    label: "USD",
    fmt: (g) => usd(g / rate),
    fmt1: (g) => usd(g / rate),
    // Four places is enough to hold a pack's few cents without a long tail.
    toInput: (g) => Math.round((g / rate) * 10000) / 10000,
    fromInput: (n) => n * rate,
    fractional: true,
  };
}
