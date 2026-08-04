/**
 * What a run ends up holding, and what each of those is worth.
 *
 * The gem-equivalent total answers what a run came to, which is the only way
 * to weigh a box against a pack, but it cannot say what any of it *is*. These
 * are the components it folds together: two balances you actually spend, and
 * the rewards that pile up in counts.
 *
 * Gems and gold sit in the same table as packs and boxes deliberately. They
 * are not interchangeable — gems buy entries, gold buys entries at its own
 * price, a box buys nothing — but a breakdown that named only the rewards
 * would leave the two largest components unaccounted for and would not add
 * back up to the total it is breaking down.
 */

import { goldPerEvent } from "./payouts";
import type { EventConfig, PayoutTier } from "./types";

/**
 * Payout-tier fields paid as a count rather than as gems.
 *
 * Kept apart from the table below because these, and only these, index a
 * `PayoutTier` — gold is not a payout at all, and draft packs come with the
 * entry rather than the result.
 */
export const TIER_REWARD_KEYS = [
  "packs",
  "playInPoints",
  "playBoxes",
  "collectorBoxes",
] as const;

export type TierRewardKey = (typeof TIER_REWARD_KEYS)[number];

/**
 * Which rewards a ladder actually pays.
 *
 * Read off the payouts rather than off a simulated mean, so the answer depends
 * on the event alone: a box paid only at a win count you will rarely reach
 * still counts, and a rate of zero gems does not hide one.
 */
export function paidRewards(payouts: PayoutTier[]): TierRewardKey[] {
  return TIER_REWARD_KEYS.filter((key) => payouts.some((t) => (t[key] ?? 0) > 0));
}

/**
 * The rewards that arrive as physical product.
 *
 * Taken as a pair rather than one at a time because what a player is asking is
 * whether a box turns up, not which kind: a run that won a collector box and a
 * run that won a play box both came away with a box. The two are still counted
 * separately everywhere else, since they are worth very different amounts.
 */
export const BOX_KEYS = [
  "playBoxes",
  "collectorBoxes",
] as const satisfies readonly TierRewardKey[];

/** Whether a ladder pays a box at any win count. */
export function paysBoxes(payouts: PayoutTier[]): boolean {
  return payouts.some((t) => BOX_KEYS.some((key) => (t[key] ?? 0) > 0));
}

export const HOLDINGS = [
  { key: "gems", label: "Gems", whole: false },
  { key: "gold", label: "Gold", whole: false },
  { key: "packs", label: "Packs", whole: true, rateKey: "packValueGems" },
  {
    key: "playInPoints",
    label: "Play-in points",
    whole: true,
    rateKey: "playInPointValueGems",
  },
  { key: "playBoxes", label: "Play boxes", whole: true, rateKey: "playBoxValueGems" },
  {
    key: "collectorBoxes",
    label: "Collector boxes",
    whole: true,
    rateKey: "collectorBoxValueGems",
  },
  {
    // "Draft packs", matching the input that sets them, rather than "drafted
    // cards": the field counts packs' worth, and one name for one thing.
    key: "draftPacks",
    label: "Draft packs",
    whole: true,
    rateKey: "draftPackValueGems",
  },
] as const satisfies readonly {
  key: string;
  /** What to call them on screen. */
  label: string;
  /** Whether amounts are whole things, which decides how they bin and print. */
  whole: boolean;
  /** The config field holding what one is worth in gems, where there is one. */
  rateKey?: keyof EventConfig;
}[];

export type Holding = (typeof HOLDINGS)[number];
export type HoldingKey = Holding["key"];

export const HOLDING_KEYS = HOLDINGS.map((h) => h.key);

export function holding(key: HoldingKey): Holding {
  return HOLDINGS.find((h) => h.key === key) as Holding;
}

/**
 * Gems one of them is worth.
 *
 * Gems are worth themselves. Gold converts at the rate every dual-priced event
 * charges, and a rate of Infinity — set by valuing gold at nothing — drops it
 * to zero, the same way `runValue` treats it.
 */
export function holdingRate(config: EventConfig, key: HoldingKey): number {
  if (key === "gems") return 1;
  if (key === "gold") return 1 / config.goldPerGem;
  const h = holding(key);
  return "rateKey" in h ? config[h.rateKey] : 1;
}

/**
 * Which holdings an event can leave you with, in display order.
 *
 * Gems always: the balance is what a run is played out of, even when it ends
 * at nothing. Gold whenever any is earned or spent — it accrues daily whatever
 * the event charges, so most runs end holding some — or when a starting
 * balance the event has no use for is still sitting there, which the config
 * alone cannot say.
 */
export function heldKeys(config: EventConfig, holdingGold = false): HoldingKey[] {
  const paid = paidRewards(config.payouts);
  return HOLDING_KEYS.filter((key) => {
    if (key === "gems") return true;
    if (key === "gold")
      return holdingGold || config.entryCostGold > 0 || goldPerEvent(config) > 0;
    if (key === "draftPacks") return config.draftPacks > 0;
    return paid.includes(key);
  });
}
