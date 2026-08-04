/**
 * The rewards a payout tier pays in counts rather than in gems.
 *
 * Gems are what everything else converts into, so they are not one of these. A
 * currency here is something the ladder awards a number of — packs, play-in
 * points, boxes — which the results otherwise only ever show folded into a
 * gem-equivalent total. Folding is the right default, since it is the only way
 * to compare a box against a pack, but it answers "what is this worth" and
 * never "how many will I get".
 *
 * Drafted cards are deliberately absent. They are not a tier reward — you keep
 * them for entering, however the event goes — so per event their count has no
 * distribution to speak of, and over a run it is just the number of events
 * played.
 */

import type { EventConfig, PayoutTier, WinBucket } from "./types";

export const CURRENCIES = [
  { key: "packs", label: "Packs", one: "pack", rateKey: "packValueGems" },
  {
    key: "playInPoints",
    label: "Play-in points",
    one: "play-in point",
    rateKey: "playInPointValueGems",
  },
  {
    key: "playBoxes",
    label: "Play boxes",
    one: "Play Booster box",
    rateKey: "playBoxValueGems",
  },
  {
    key: "collectorBoxes",
    label: "Collector boxes",
    one: "Collector Booster box",
    rateKey: "collectorBoxValueGems",
  },
] as const satisfies readonly {
  key: string;
  /** Plural, for headings and axes. */
  label: string;
  /** Singular, for prose. Not derivable from the plural — "boxes" is not "boxe". */
  one: string;
  /** The config field holding what one of them is worth in gems. */
  rateKey: keyof EventConfig;
}[];

export type Currency = (typeof CURRENCIES)[number];
export type CurrencyKey = Currency["key"];

export const CURRENCY_KEYS = CURRENCIES.map((c) => c.key);

export function currency(key: CurrencyKey): Currency {
  return CURRENCIES.find((c) => c.key === key) as Currency;
}

/** What one of them is worth, per the config's conversion rates. */
export function currencyRate(config: EventConfig, key: CurrencyKey): number {
  return config[currency(key).rateKey];
}

/** Amount a tier pays; the optional fields read as none rather than absent. */
export function amountAt(tier: PayoutTier, key: CurrencyKey): number {
  return tier[key] ?? 0;
}

/**
 * Which currencies a ladder actually pays, in display order.
 *
 * Read off the payouts rather than off a simulated mean, so the answer depends
 * on the event alone: a tier that pays a box only at a win count you will
 * almost never reach still counts, and a rate of zero gems does not hide one.
 */
export function paidCurrencies(payouts: PayoutTier[]): CurrencyKey[] {
  return CURRENCY_KEYS.filter((key) => payouts.some((t) => amountAt(t, key) > 0));
}

export type CurrencyBucket = {
  amount: number;
  /** Empirical frequency of that amount, from the simulation. */
  probability: number;
  /** Closed-form probability of the same, for comparison. */
  exactProbability: number;
};

export type CurrencyOutcome = {
  key: CurrencyKey;
  /** Expected amount per event, from the simulated frequencies. */
  mean: number;
  /** The same from the closed form. */
  exactMean: number;
  /** Share of events paying any at all. */
  probAny: number;
  /** One entry per distinct amount the ladder pays, ascending. */
  buckets: CurrencyBucket[];
};

/**
 * How much of one currency an event pays, as a distribution.
 *
 * The amount is a function of the win count, so this is the win buckets
 * regrouped: several win counts can pay the same number of packs, and their
 * probabilities add. The closed-form column comes along for the ride, which is
 * what keeps these charts checkable in the same way the win chart is.
 */
export function currencyOutcome(
  buckets: WinBucket[],
  key: CurrencyKey,
): CurrencyOutcome {
  const byAmount = new Map<number, CurrencyBucket>();
  for (const b of buckets) {
    const amount = b[key];
    const at = byAmount.get(amount) ?? { amount, probability: 0, exactProbability: 0 };
    at.probability += b.probability;
    at.exactProbability += b.exactProbability;
    byAmount.set(amount, at);
  }

  const grouped = [...byAmount.values()].sort((a, b) => a.amount - b.amount);
  return {
    key,
    mean: grouped.reduce((acc, b) => acc + b.probability * b.amount, 0),
    exactMean: grouped.reduce((acc, b) => acc + b.exactProbability * b.amount, 0),
    probAny: grouped.reduce((acc, b) => acc + (b.amount > 0 ? b.probability : 0), 0),
    buckets: grouped,
  };
}

/** Every currency's distribution, keyed for lookup. */
export function currencyOutcomes(
  buckets: WinBucket[],
): Record<CurrencyKey, CurrencyOutcome> {
  return Object.fromEntries(
    CURRENCY_KEYS.map((key) => [key, currencyOutcome(buckets, key)]),
  ) as Record<CurrencyKey, CurrencyOutcome>;
}
