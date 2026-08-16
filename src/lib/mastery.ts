/**
 * What a Set Mastery Pass is worth, against what it costs.
 *
 * The ceiling case, and only that: it prices the whole published track, which
 * assumes you finish it. Whether you finish it is a question about experience
 * points, and Wizards publishes the *sources* of XP — quests and weekly wins —
 * but none of the amounts, so there is nothing here to model it with. What
 * stands in for it is `breakEvenLevel`: how far up the track the pass has to get
 * before it has paid for itself. That is answerable exactly, and it is the
 * figure an attainability model would later be answering against.
 *
 * The incremental value of buying is the **pass column alone**. The free column
 * arrives whether or not you pay, and Wizards grants the pass rewards for levels
 * already earned when you buy late, so nothing about the free track is caused by
 * the purchase. It is computed and shown as context, and it is never in `net`.
 *
 * Nothing here depends on the win rate or on any distribution. The one reward
 * that could — the Player Draft token — is priced at the entry it replaces
 * rather than at what a draft returns, so this module is arithmetic over the
 * track and the config's rates, and that is the whole of it.
 */

import { holdingRate } from "./holdings";
import { THE_HOBBIT_MASTERY } from "../data/mastery/the-hobbit";
import {
  MASTERY_REWARD_KINDS,
  type EventConfig,
  type MasteryRewardKind,
  type MasteryRewards,
  type MasteryTrack,
} from "./types";

export { THE_HOBBIT_MASTERY };

/**
 * Every season the app can price, newest first.
 *
 * Only one is live in Arena at a time — a Set Mastery runs from its set's
 * release until the next set's — but a finished season is still worth pricing,
 * both to check the model against a track whose totals are settled and to
 * compare one season's pass against another's. The picker exists for that, and
 * because the alternative is a hard-coded track that quietly means "whichever
 * season the last person to touch this file was playing".
 */
export const MASTERY_TRACKS: MasteryTrack[] = [THE_HOBBIT_MASTERY];

/** What the app opens on: the newest season. */
export const CURRENT_MASTERY_TRACK: MasteryTrack = MASTERY_TRACKS[0];

/** The track a URL token names, or null if it names none. */
export function masteryBySlug(slug: string): MasteryTrack | null {
  return MASTERY_TRACKS.find((t) => t.slug === slug) ?? null;
}

/** What to call each reward kind on screen. */
export const MASTERY_REWARD_LABELS: Record<MasteryRewardKind, string> = {
  gems: "Gems",
  gold: "Gold",
  packs: "Packs",
  draftToken: "Player Draft tokens",
  mythicIcr: "Mythic rare ICRs",
  rareCard: "Rare cards",
  uncommonIcr: "Uncommon ICRs",
  orbs: "Mastery Orbs",
  cardStyles: "Card styles",
  sleeves: "Card sleeves",
  avatars: "Avatars",
  companions: "Companions",
};

/**
 * The kinds whose value needs no judgement call.
 *
 * Gems are gems, gold converts at the rate every dual-priced event charges, and
 * the token is worth the entry it buys. Everything else — a pack, a card, a
 * cosmetic — is worth what you decide it is worth. Separating them is what lets
 * the tab say how much of its answer is arguable, which for this pass is very
 * little.
 */
export const MASTERY_CERTAIN_KINDS: readonly MasteryRewardKind[] = [
  "gems",
  "gold",
  "draftToken",
];

/**
 * Gems one of a kind is worth.
 *
 * Gems, gold and packs defer to `holdingRate`, which the rest of the model
 * already uses, rather than reading the config fields here. That is not only
 * reuse: it inherits the `goldPerGem === Infinity` case — gold valued at nothing
 * — which a hand-written `1 / config.goldPerGem` returns 0 for by luck and a
 * hand-written `config.goldPerGem` gets wrong outright.
 */
export function masteryRate(kind: MasteryRewardKind, config: EventConfig): number {
  switch (kind) {
    case "gems":
    case "gold":
    case "packs":
      return holdingRate(config, kind);
    case "draftToken":
      return config.draftTokenValueGems;
    case "mythicIcr":
      return config.mythicIcrValueGems;
    case "rareCard":
      return config.rareCardValueGems;
    case "uncommonIcr":
      return config.uncommonIcrValueGems;
    case "orbs":
      return config.orbValueGems;
    case "cardStyles":
      return config.cardStyleValueGems;
    case "sleeves":
      return config.sleeveValueGems;
    case "avatars":
      return config.avatarValueGems;
    case "companions":
      return config.companionValueGems;
    default: {
      /*
       * Exhaustive by construction rather than by a `default: return 0`. A kind
       * added to MASTERY_REWARD_KINDS without a rate here should stop the build,
       * not silently price itself at nothing — which is indistinguishable from
       * a cosmetic and would never be noticed.
       */
      const never: never = kind;
      return never;
    }
  }
}

/** Two reward sets added together, kind by kind. */
export function addRewards(a: MasteryRewards, b: MasteryRewards): MasteryRewards {
  const out: MasteryRewards = { ...a };
  for (const kind of MASTERY_REWARD_KINDS) {
    const n = b[kind];
    if (n) out[kind] = (out[kind] ?? 0) + n;
  }
  return out;
}

/** What one reward set comes to in gems. */
export function rewardsValue(rewards: MasteryRewards, config: EventConfig): number {
  let total = 0;
  for (const kind of MASTERY_REWARD_KINDS) {
    const count = rewards[kind];
    if (count) total += count * masteryRate(kind, config);
  }
  return total;
}

/** One row of the breakdown table. */
export type MasteryLine = {
  kind: MasteryRewardKind;
  label: string;
  /** How many the free track pays. */
  freeCount: number;
  /** How many the pass track pays. */
  passCount: number;
  /** Gems one is worth. */
  rate: number;
  /** `passCount × rate`. */
  gems: number;
};

/** One row of the reward track, with the running totals a reader wants. */
export type MasteryLevelValue = {
  level: number;
  freeText: string;
  passText: string;
  freeGems: number;
  passGems: number;
  cumulativeFreeGems: number;
  cumulativePassGems: number;
  /** The first level at which the pass has paid for itself. At most one is true. */
  breakEven: boolean;
};

export type MasteryValue = {
  /** What the pass is sold for. A real gem price, not a valuation. */
  price: number;
  /** The free track's whole value. Context; never part of `net`. */
  free: number;
  /** The pass track's whole value, which is what buying gets you. */
  pass: number;
  /** `pass − price`. */
  net: number;
  /** `net / price`. */
  roi: number;
  /** The part of `pass` that needs no valuation judgement. */
  certain: number;
  /** First level whose cumulative pass value clears the price, or null. */
  breakEvenLevel: number | null;
  /** What one level past the cap pays, repeating without end. */
  beyondPerLevel: number;
  freeTotals: MasteryRewards;
  passTotals: MasteryRewards;
  /** Breakdown rows, largest pass value first. */
  lines: MasteryLine[];
  /** Reward-track rows, in level order. */
  levelValues: MasteryLevelValue[];
};

/**
 * The whole valuation, in one pass over the track.
 *
 * `lines` and `levelValues` are the two tables' data, both carrying the
 * `count × rate = gems` shape so the UI does no arithmetic of its own and every
 * figure on screen can be checked against the one beside it.
 */
export function masteryValue(track: MasteryTrack, config: EventConfig): MasteryValue {
  let freeTotals: MasteryRewards = {};
  let passTotals: MasteryRewards = {};
  let cumulativeFreeGems = 0;
  let cumulativePassGems = 0;
  let breakEvenLevel: number | null = null;

  const levelValues: MasteryLevelValue[] = track.levels.map((lvl) => {
    freeTotals = addRewards(freeTotals, lvl.free.rewards);
    passTotals = addRewards(passTotals, lvl.pass.rewards);

    const freeGems = rewardsValue(lvl.free.rewards, config);
    const passGems = rewardsValue(lvl.pass.rewards, config);
    cumulativeFreeGems += freeGems;
    cumulativePassGems += passGems;

    const crossed = breakEvenLevel === null && cumulativePassGems >= track.priceGems;
    if (crossed) breakEvenLevel = lvl.level;

    return {
      level: lvl.level,
      freeText: lvl.free.text,
      passText: lvl.pass.text,
      freeGems,
      passGems,
      cumulativeFreeGems,
      cumulativePassGems,
      breakEven: crossed,
    };
  });

  const free = cumulativeFreeGems;
  const pass = cumulativePassGems;

  const lines: MasteryLine[] = MASTERY_REWARD_KINDS.map((kind) => {
    const rate = masteryRate(kind, config);
    const passCount = passTotals[kind] ?? 0;
    return {
      kind,
      label: MASTERY_REWARD_LABELS[kind],
      freeCount: freeTotals[kind] ?? 0,
      passCount,
      rate,
      gems: passCount * rate,
    };
  })
    .filter((line) => line.freeCount > 0 || line.passCount > 0)
    /*
     * Descending by what it is worth, not by the order the kinds are declared
     * in. That puts gems, the token and the packs at the top and drops every
     * cosmetic into a visible zero-valued tail, which is the honest shape of
     * this pass: a few large terms, and a great deal of decoration.
     */
    .sort((a, b) => b.gems - a.gems);

  const certain = MASTERY_CERTAIN_KINDS.reduce(
    (sum, kind) => sum + (passTotals[kind] ?? 0) * masteryRate(kind, config),
    0,
  );

  return {
    price: track.priceGems,
    free,
    pass,
    /*
     * The pass column alone against the price. Adding `free` here would be the
     * easy mistake and it moves the answer by hundreds of gems: those rewards
     * arrive whether or not you buy, so crediting them to the purchase prices
     * something the purchase did not cause.
     */
    net: pass - track.priceGems,
    roi: track.priceGems > 0 ? (pass - track.priceGems) / track.priceGems : 0,
    certain,
    breakEvenLevel,
    beyondPerLevel: rewardsValue(track.beyond, config),
    freeTotals,
    passTotals,
    lines,
    levelValues,
  };
}
