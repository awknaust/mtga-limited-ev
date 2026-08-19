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

import { boxHoldingKey, boxLabel, isBoxHolding, ladderBoxes } from "./boxes";
import { goldPerEvent } from "./payouts";
import type { EventConfig, PayoutTier } from "./types";

/**
 * Rewards a payout tier pays as a count, other than boxes.
 *
 * Kept apart from the table below because these, and only these, come off a
 * `PayoutTier` as a number — gold is credited to the entry off the daily
 * ladder rather than paid by a row, and draft packs come with the entry
 * rather than the result. Boxes are absent because there is no fixed list of
 * them: which exist depends on which the ladder names.
 */
export const TIER_REWARD_KEYS = [
  "packs",
  "mythicPacks",
  "cubePacks",
  "playInPoints",
  "qualifierTokens",
] as const;

export type TierRewardKey = (typeof TIER_REWARD_KEYS)[number];

/**
 * Which rewards a ladder actually pays.
 *
 * Read off the payouts rather than off a simulated mean, so the answer depends
 * on the event alone: a reward paid only at a win count you will rarely reach
 * still counts, and a rate of zero gems does not hide one.
 */
export function paidRewards(payouts: PayoutTier[]): TierRewardKey[] {
  return TIER_REWARD_KEYS.filter((key) => payouts.some((t) => (t[key] ?? 0) > 0));
}

/** Whether a ladder pays a box at any win count. */
export function paysBoxes(payouts: PayoutTier[]): boolean {
  return payouts.some((t) => (t.boxes?.length ?? 0) > 0);
}

/** Whether a ladder pays a Qualifier Weekend token at any win count. */
export function paysTokens(payouts: PayoutTier[]): boolean {
  return payouts.some((t) => (t.qualifierTokens ?? 0) > 0);
}

/**
 * The holdings there is a fixed list of.
 *
 * Boxes are not among them: a ladder names its own, so they arrive as keys
 * built from the box rather than as entries here. Everything below that walks
 * "the holdings" walks these plus whatever boxes the ladder pays.
 */
export const HOLDINGS = [
  { key: "gems", label: "Gems", whole: false },
  { key: "gold", label: "Gold", whole: false },
  { key: "packs", label: "Packs", whole: true, rateKey: "packValueGems" },
  {
    // Beside the packs rather than folded into them: they are a different
    // product at a different price, and a ladder paying both pays two rows.
    key: "mythicPacks",
    label: "Mythic packs",
    whole: true,
    rateKey: "mythicPackValueGems",
  },
  {
    // Wizards' own name for them. "Cube packs" is what everyone says, but the
    // product is a Cube Prize Pack, and this table is what the About tab
    // prints as the thing being priced.
    key: "cubePacks",
    label: "Cube prize packs",
    whole: true,
    rateKey: "cubePackValueGems",
  },
  {
    key: "playInPoints",
    label: "Play-in points",
    whole: true,
    rateKey: "playInPointValueGems",
  },
  {
    key: "qualifierTokens",
    label: "Qualifier tokens",
    whole: true,
    rateKey: "qualifierTokenValueGems",
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
export type StaticHoldingKey = Holding["key"];

/**
 * What a run can end up holding.
 *
 * Open rather than a closed union, because the boxes are: `box:play.msh` is a
 * holding exactly when some ladder pays that box. `isBoxHolding` is how the
 * two halves are told apart.
 */
export type HoldingKey = StaticHoldingKey | (string & {});

export const HOLDING_KEYS: StaticHoldingKey[] = HOLDINGS.map((h) => h.key);

const BOX_HOLDING_SHAPE = { whole: true } as const;

/** How a holding prints, whichever kind of key it is. */
/**
 * The static holdings by key, built once.
 *
 * A map rather than a scan because `holding` sits in the bankroll's hot loop:
 * `runValue` folds over every holding of every run, so a linear `find` is one
 * pass over this table per key per run — quadratic in a list that has grown
 * three times in as many changes.
 *
 * Worth about 2% of a 200,000-run simulation when it was measured, which is
 * not why it is here: the lookup is keyed and known at module load, so the
 * scan was the wrong shape whatever it cost. Do not expect it back if the
 * table shrinks.
 */
const HOLDING_BY_KEY = new Map<string, Holding>(HOLDINGS.map((h) => [h.key, h]));

export function holding(key: HoldingKey): { key: HoldingKey; whole: boolean } {
  if (isBoxHolding(key)) return { key, ...BOX_HOLDING_SHAPE };
  return HOLDING_BY_KEY.get(key) as Holding;
}

/**
 * What to call a holding on screen.
 *
 * Boxes need the config to name themselves — the set's code and, through the
 * price table, whichever set "newest" currently means — so this takes one
 * where `holding` does not.
 */
export function holdingLabel(config: EventConfig, key: HoldingKey): string {
  if (!isBoxHolding(key)) return (holding(key) as Holding).label;
  const box = ladderBoxes(config.payouts).find((b) => boxHoldingKey(b) === key);
  return box ? `${boxLabel(config.boxPrices, box)} boxes` : "Boxes";
}

/**
 * Gems one of them is worth.
 *
 * Gems are worth themselves. Gold converts at the rate every dual-priced event
 * charges — the same rate `goldValueGems` credits an event's gold at, so the
 * per-event gross and a run's ending value price gold alike — and a rate of 0,
 * set by valuing gold at nothing, drops it to zero in both. A box is worth
 * whatever that box trades at, which `boxValueGems` answers and `heldValue`
 * applies.
 */
export function holdingRate(config: EventConfig, key: HoldingKey): number {
  if (key === "gems") return 1;
  if (key === "gold") return config.gemsPer10kGold / 10000;
  const h = holding(key);
  return "rateKey" in h ? config[h.rateKey as keyof EventConfig] as number : 1;
}

/**
 * Which holdings an event can leave you with, in display order.
 *
 * Gems always: the balance is what a run is played out of, even when it ends
 * at nothing. Gold whenever any is earned or spent — it accrues daily whatever
 * the event charges, so most runs end holding some — or when a starting
 * balance the event has no use for is still sitting there, which the config
 * alone cannot say.
 *
 * Play-in points follow the same rule as gold, and for the same reason: an
 * event that *charges* them leaves you holding them whether or not any ladder
 * pays them. Reading only what is paid would hide the balance a Qualifier
 * Play-In is spending, which is the one event where the points matter most.
 *
 * The boxes sit where the two aggregate box holdings used to, between the
 * points and the drafted cards: won rather than bought, and one entry per
 * product the ladder actually ships.
 */
export function heldKeys(
  config: EventConfig,
  holdingGold = false,
  holdingPoints = false,
): HoldingKey[] {
  const paid: string[] = paidRewards(config.payouts);
  const kept = (key: StaticHoldingKey): boolean => {
    if (key === "gems") return true;
    if (key === "gold")
      return holdingGold || config.entryCostGold !== null || goldPerEvent(config) > 0;
    if (key === "playInPoints")
      return (
        holdingPoints || config.entryCostPlayInPoints !== null || paid.includes(key)
      );
    if (key === "draftPacks") return config.draftPacks > 0;
    return paid.includes(key);
  };

  const keys: HoldingKey[] = [];
  for (const key of HOLDING_KEYS) {
    // The boxes go just before the drafted cards, which is where the two
    // aggregate box holdings sat before a ladder could name its own.
    if (key === "draftPacks") {
      keys.push(...ladderBoxes(config.payouts).map(boxHoldingKey));
    }
    if (kept(key)) keys.push(key);
  }
  return keys;
}
