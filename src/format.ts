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

/**
 * The unit the display toggle is not on.
 *
 * For the figure that names both. The starting balance is checked in two
 * places — against an Arena wallet, which counts gems, and against the store
 * page that would sell them, which charges dollars — so it prints in the unit
 * showing and again in the one that is not, and neither reader has to convert
 * by hand. Every other figure takes the active unit alone; the toggle is what
 * changes it, and a second unit on every line would undo the point of having
 * one.
 */
export const otherUnit = (unit: Unit): Unit => (unit === "gems" ? "usd" : "gems");

/**
 * Gems have no currency sign of their own, so this stands in for one.
 *
 * U+1F48E GEM STONE. Being an emoji it carries its own colour rather than
 * inheriting the text's, so a figure in the red of a loss or the green of a
 * gain has a blue stone in front of it either way — the sign says which
 * currency, the digits say how it went. Bootstrap Icons' `bi-gem` still marks
 * the input fields, where an icon can be sized to the control; this is for
 * running text and for figures, where an icon cannot.
 */
export const GEM_SIGN = "💎";

/**
 * What separates it from the figure it leads.
 *
 * U+202F NARROW NO-BREAK SPACE. A dollar sign is a narrow upright that sets
 * tight against a digit; the stone is full-width and rounded, and a 1 set
 * against it touches. No-break rather than a plain thin space because this is
 * one word — a figure that wrapped between its sign and its digits would put a
 * lone gem at the end of a line.
 */
const GEM_GAP = "\u202F";

/**
 * Marks a figure as a gem-equivalent valuation rather than a real balance.
 *
 * Real gem figures \u2014 entry costs, gem payouts, the gem balance \u2014 print bare.
 * Figures that fold packs, boxes or points in at the configured rates lead
 * with \u2248, the way a conversion UI marks a balance shown in another currency.
 * The relation sign scopes over the whole signed figure, so it sits outside
 * the minus: \u2248 \u2212\uD83D\uDC8E 120 is "approximately minus 120 gems", where \u2212\u2248 would
 * read as negating the approximation.
 *
 * The gap is the gem sign's own narrow no-break space, so the marker cannot
 * wrap away from the figure it qualifies.
 */
export const approx = (figure: string): string => `\u2248${GEM_GAP}${figure}`;

export type Money = {
  unit: Unit;
  /** For labels: "gems" or "USD". */
  label: string;
  /**
   * What leads a figure: "$", or the gem sign and the gap it needs. Ready to
   * concatenate, so a caller building its own abbreviated label — a chart tick
   * that says "2k" where `fmt` would say "2,000" — spaces it as `fmt` does.
   */
  symbol: string;
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

/** A 0..1 fraction as a percentage. Not a unit, so it never converts. */
export const pct = (n: number, digits = 1): string => `${(n * 100).toFixed(digits)}%`;

/**
 * An amount as an axis tick, abbreviated to thousands.
 *
 * A tick saying which thousand it is says enough — the figures that have to be
 * read exactly are printed beside the chart, and an axis lettered `20,000` in
 * full spends six characters where three would do, which is what runs the
 * labels into each other on a wide chart.
 *
 * `prefix` carries the currency marker where there is one. Gems take theirs so
 * that two axes side by side cannot be read as each other's; gold takes none,
 * having none.
 */
export const tickAmount = (n: number, prefix = ""): string => {
  const a = Math.abs(n);
  const body = a >= 1000 ? `${Math.round(a / 1000)}k` : `${Math.round(a)}`;
  return `${n < 0 ? "−" : ""}${prefix}${body}`;
};

/**
 * A gem-valued axis tick, in whichever unit is showing.
 *
 * Gems abbreviate. Dollars are handed to `fmt` instead: they run three orders
 * of magnitude smaller, so they fit as they are, and rounding to the nearest
 * thousand would flatten an entire axis to zero.
 */
export const gemTick = (m: Money, gems: number): string =>
  m.unit === "gems" ? tickAmount(gems, m.symbol) : m.fmt(gems);

/**
 * What to call a gem-equivalent total, in whichever unit is showing.
 *
 * For the headings that name this quantity without a formatted figure under
 * them to carry the unit — a tab, a section title, a card label. Where a
 * figure *is* directly beneath, the label says nothing the figure has not
 * already said, and should not name a unit at all.
 *
 * Shared because it now appears in three places, and a total called "Gem
 * value" in one and "Gem total" in another reads as two different quantities.
 */
export const valueLabel = (unit: Unit): string =>
  unit === "gems" ? "Gem value" : "Dollar value";

const withSign = (n: number, body: string): string => (n < 0 ? `−${body}` : body);

/**
 * Formatters keyed by how many decimal places they print, built once each.
 * Constructing an `Intl.NumberFormat` is not cheap and these run inside chart
 * and table renders.
 *
 * Pinned to `en-US` rather than following the reader's locale, which the gem
 * formatters do. Gems are whole numbers, so localising them only changes the
 * thousands separator and is harmless. A dollar amount also has a decimal
 * separator, and it has to agree with the input sitting next to it — an
 * `<input type="number">` accepts a period and nothing else, whatever the
 * locale, so a reader shown `8,50` would be editing a field reading `8.50`.
 */
const usdFormats: Record<number, Intl.NumberFormat> = {};

const usdFormat = (digits: number): Intl.NumberFormat =>
  (usdFormats[digits] ??= new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }));

/**
 * Dollar amounts here span five orders of magnitude — a pack is worth a few
 * cents and a collector box several hundred dollars — so precision follows
 * size rather than being fixed at two places.
 *
 * Intl rather than `toFixed`, which printed no thousands separator: at a low
 * gems-per-dollar rate a collector box read `$6303.33` while every gem figure
 * beside it was grouped.
 *
 * Exported for the figures that are dollars to begin with — the box-price
 * feed quotes TCGplayer in USD — where `money("usd", …)` would be wrong,
 * since it converts a gem amount at the reader's rate. Same formatter either
 * way, so a market price and a converted one round the same.
 */
export const usdAmount = (value: number): string => {
  const a = Math.abs(value);
  // Zero takes the ordinary two places rather than falling through to the
  // small-amount branch. It has no significant digits to preserve, and an
  // axis reading $0.0000 between −$250.00 and $250.00 just looks broken.
  const digits = a === 0 || a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
  return withSign(value, usdFormat(digits).format(a));
};

/**
 * The stone and its gap, which is what leads every gem figure.
 *
 * Exported for the rare label that names a literal gem amount whatever the
 * display unit — the About table's one-gem row, whose left side must stay a
 * real gem while the right side converts.
 */
export const GEM_PREFIX = GEM_SIGN + GEM_GAP;

const gemsWhole = (value: number): string =>
  withSign(value, GEM_PREFIX + Math.abs(Math.round(value)).toLocaleString());

const gemsLoose = (value: number): string =>
  withSign(
    value,
    GEM_PREFIX +
      Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 }),
  );

export function money(unit: Unit, gemsPerUsd: number): Money {
  const rate = gemsPerUsd > 0 ? gemsPerUsd : 1;
  if (unit === "gems") {
    return {
      unit,
      label: "gems",
      symbol: GEM_PREFIX,
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
    symbol: "$",
    fmt: (g) => usdAmount(g / rate),
    fmt1: (g) => usdAmount(g / rate),
    toInput: cents,
    /*
     * Always two places, so $8.50 does not display as $8.5. A price with a
     * missing cents digit reads as a truncation of some other number, which is
     * the one thing a money field should never do.
     *
     * Deliberately `toFixed` and not the Intl formatter above: this is a form
     * value, not a label. It carries no symbol and no grouping — a number
     * field rejects both — and its decimal separator must stay a period.
     */
    inputText: (g) => cents(g).toFixed(2),
    fromInput: (n) => n * rate,
    fractional: true,
  };
}

/**
 * Real gem amounts, which never follow the display unit.
 *
 * The toggle prices *valuations* in dollars — what a run came to, what a pack
 * is worth to you. It has nothing to say about a real gem figure, because
 * there is no dollar answer to give: an entry costs 1,500 gems and no amount
 * of cash will enter you, a ladder pays the gems it pays, and a gem balance is
 * a number Arena shows you rather than an estimate of one. Rendering those in
 * dollars invents a price nobody can pay, and reads as though the event were
 * purchasable in cash.
 *
 * The About tab already draws this line for the reader — a bare gem figure
 * "is a real amount, and stays in gems whichever unit is showing" — so this is
 * what keeps that wording true rather than aspirational. The rule
 * in one line: dollars go with ≈ and nowhere else.
 *
 * Built with a rate of 1 because the gem branch above never consults one, and
 * shared as a constant so no caller has to build a second `money` to get it.
 */
export const REAL_GEMS: Money = money("gems", 1);
