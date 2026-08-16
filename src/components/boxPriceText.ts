/**
 * Wording for the box-price table: how old the feed is, in two forms.
 *
 * Pure and apart from the component for the reason `holdingText.ts` is — the
 * arithmetic under a sentence is worth testing, and a test for it should not
 * need a DOM. Nothing here decides anything about the model; the two defaults
 * are derived in `lib/boxPrices.ts` and every figure below is the feed's own.
 */

/**
 * The stamp prints in UTC, not the reader's zone: it says which run of the
 * Worker built the payload, and naming the zone is what makes it checkable
 * against the Worker's schedule.
 */
const MINUTE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** A parsed timestamp, or null where the string is not one. */
const parse = (iso: string): Date | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const plural = (n: number, unit: string): string =>
  `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/**
 * How old the prices are, in words.
 *
 * Coarse on purpose: the Worker refreshes daily, so hours and days are the
 * only distinctions that mean anything, and a figure to the minute would
 * suggest a feed that moves faster than it does. A stamp in the future — a
 * reader's clock behind the Worker's — reads as "just now" rather than as a
 * negative age.
 *
 * Null where the stamp will not parse, which the validator permits: it checks
 * that `generatedAt` is a string and not that it is a date.
 */
export const feedAgeText = (generatedAt: string, now: Date): string | null => {
  const built = parse(generatedAt);
  if (built === null) return null;
  const minutes = Math.floor((now.getTime() - built.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  return plural(Math.floor(hours / 24), "day");
};

/** The exact instant the prices were read, for the reader who wants it. */
export const feedStampText = (generatedAt: string): string | null => {
  const built = parse(generatedAt);
  return built === null ? null : `${MINUTE.format(built)} UTC`;
};
