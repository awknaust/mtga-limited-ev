/**
 * The arithmetic, and the judgement calls that go with it.
 *
 * Pure: everything here takes parsed data and returns numbers. Which constant
 * uses which derivation is `registry.ts`; where the data came from is
 * `sources.ts`. The box-price *feed* is its own module, `scripts/box-prices/`,
 * and how a named set is priced lives in the app; what lives here is the one
 * rule that turns that feed into the two generic box constants.
 */

import type { BoxPriceFeed, FeedSet } from "../box-prices/feed.ts";
import { isoDate } from "../shared/dates.ts";
import { SourceError } from "../shared/http.ts";
import type { ScryfallSet } from "../shared/scryfall.ts";
import type { MythicRateEntry } from "./wizards.ts";

/**
 * How far back a set still counts as recent, for picking the mythic rate.
 *
 * Two years covers roughly the Standard rotation, so the answer tracks what
 * someone drafting now actually opens.
 */
export const RECENT_SET_MONTHS = 24;

/**
 * What one rare slot is worth to a complete collection.
 *
 * Once you hold playsets of every rare and mythic, the slot pays gems instead
 * of a card. It is a rare unless it upgrades, and it upgrades about once every
 * `packsPerMythic` packs.
 */
export const rareSlotGems = (
  rareDupeGems: number,
  mythicDupeGems: number,
  packsPerMythic: number,
): number => rareDupeGems + (mythicDupeGems - rareDupeGems) / packsPerMythic;

/**
 * How often the rare slot pays a wildcard rather than a card or gems.
 *
 * Both a rare and a mythic wildcard can displace it, so the two rates add.
 */
export const wildcardShare = (wildcards: { rare: number; mythic: number }): number =>
  1 / wildcards.rare + 1 / wildcards.mythic;

export type MythicRateSummary = {
  rate: number;
  buckets: { rate: number; sets: ScryfallSet[] }[];
  /** Names that matched no Scryfall set — worth reading, not just counting. */
  undated: string[];
  /** Codes of digital sets skipped, normally the Alchemy variants. */
  digital: string[];
  tied: boolean;
  window: { from: string; to: string };
};

/**
 * Which mythic upgrade rate to treat as today's.
 *
 * Wizards lists a rate per set and the spread is real — 1:5.8 to 1:8.4 among
 * sets released in the last two years. The representative figure is the one
 * covering the most of those sets, which is a mode rather than an average
 * because Wizards sets these per set rather than sampling a distribution. Ties
 * go to the rate covering the newest set.
 */
export function representativeMythicRate(
  mythicRates: MythicRateEntry[],
  setsByCode: Map<string, ScryfallSet>,
  now: Date,
): MythicRateSummary {
  const resolve = setResolver(setsByCode);

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RECENT_SET_MONTHS);
  const from = isoDate(cutoff);
  const to = isoDate(now);

  const tally = new Map<number, { rate: number; sets: ScryfallSet[] }>();
  const undated: string[] = [];
  const digital: string[] = [];
  for (const { rate, sets } of mythicRates) {
    for (const name of sets) {
      const set = resolve(name);
      if (!set) {
        undated.push(name);
        continue;
      }
      // Alchemy sets carry their own rate and are listed alongside the paper
      // set they draw from. They are excluded because this figure is about what
      // a limited player opens, and counting them also double-counts: matching
      // them loosely would fold "Alchemy: Aetherdrift" back onto Aetherdrift
      // and let one set vote twice.
      if (set.digital) {
        digital.push(set.code);
        continue;
      }
      if (set.releasedAt === null || set.releasedAt < from || set.releasedAt > to) continue;
      const bucket = tally.get(rate) ?? { rate, sets: [] };
      if (!bucket.sets.some((s) => s.code === set.code)) bucket.sets.push(set);
      tally.set(rate, bucket);
    }
  }

  const newest = (bucket: { sets: ScryfallSet[] }): number =>
    Math.max(...bucket.sets.map((s) => Date.parse(s.releasedAt!)));
  const buckets = [...tally.values()].sort(
    (a, b) => b.sets.length - a.sets.length || newest(b) - newest(a),
  );
  if (buckets.length === 0) {
    throw new SourceError(
      `drop rates: no set in the mythic rate list could be dated to the last ${RECENT_SET_MONTHS} months`,
    );
  }

  return {
    rate: buckets[0].rate,
    buckets,
    undated,
    digital: [...new Set(digital)],
    tied: buckets.length > 1 && buckets[1].sets.length === buckets[0].sets.length,
    window: { from, to },
  };
}

/**
 * Set names as Wizards writes them, reduced to something comparable with
 * Scryfall's: Wizards writes "Magic: The Gathering® | Marvel's Spider-Man"
 * where Scryfall writes "Marvel's Spider-Man", and hangs a ™ off Avatar.
 * Dropping everything but letters and digits and then shedding the brand
 * prefix leaves the part that actually names the set.
 */
const normaliseSetName = (name: string): string =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^magicthegathering/, "");

/**
 * Matches a set name written by Wizards to a set known to Scryfall.
 *
 * Digital sets are in the pool deliberately, even though nothing downstream
 * counts them: leaving them out does not make them go away, it makes
 * "Alchemy: Aetherdrift" fall through to a loose match on Aetherdrift. Being
 * able to name a set and then discard it beats mistaking it for another.
 *
 * Exact first. Containment only where it is unambiguous, because "Strixhaven"
 * matches both "Strixhaven: School of Mages" and "Secrets of Strixhaven", and
 * guessing between them would file a set under the wrong upgrade rate.
 */
function setResolver(setsByCode: Map<string, ScryfallSet>): (name: string) => ScryfallSet | null {
  const known = [...setsByCode.values()].filter((s) => s.releasedAt !== null);
  const exact = new Map<string, ScryfallSet>();
  for (const set of known) {
    const key = normaliseSetName(set.name);
    if (!exact.has(key)) exact.set(key, set);
  }

  return (name) => {
    const key = normaliseSetName(name);
    const hit = exact.get(key);
    if (hit) return hit;
    const hits = known.filter((set) => {
      const other = normaliseSetName(set.name);
      return other.length > 3 && (key.includes(other) || other.includes(key));
    });
    return hits.length === 1 ? hits[0] : null;
  };
}

export type GemsPer10kGold = {
  rates: { name: string; gems: number; gold: number; per10k: number }[];
  agrees: boolean;
  value: number | null;
};

/**
 * Gems 10,000 gold is worth, and whether the events that price both ways
 * still agree on it. Stored the way the model stores it — the finite
 * reciprocal, where "unspent gold is worthless" is plainly 0.
 */
export function gemsPer10kGold(
  events: readonly { name: string; gems: number; gold: number }[],
): GemsPer10kGold {
  const rates = events.map((e) => ({ ...e, per10k: (e.gems * 10_000) / e.gold }));
  const distinct = [...new Set(rates.map((r) => r.per10k.toFixed(6)))];
  return { rates, agrees: distinct.length === 1, value: rates[0]?.per10k ?? null };
}

/** How many sets each generic box value averages over. */
export const BOX_SAMPLE_SIZE = 3;

/**
 * The outlier rule: a box priced past this multiple of the median across the
 * newest BOX_OUTLIER_POOL candidates is set aside rather than averaged.
 */
export const BOX_OUTLIER_FACTOR = 2;
export const BOX_OUTLIER_POOL = 8;

/** A set with both boxes at a market price, which is what the average wants. */
export type PricedSet = FeedSet & { releasedAt: string; playUsd: number; collectorUsd: number };

export type GenericBoxValues = {
  /** Mean market price in USD, per kind. */
  playUsd: number;
  collectorUsd: number;
  /** The same at the given rate, rounded — the two constants as presets.ts holds them. */
  playGems: number;
  collectorGems: number;
  /** The sets averaged, newest first. */
  sets: PricedSet[];
  /** Newer sets that would have been used but were priced out by the outlier rule. */
  outliers: PricedSet[];
  /** The medians the outlier limits were taken from, and how many sets they cover. */
  medians: { playUsd: number; collectorUsd: number; over: number };
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * What a box naming no set is worth, from the feed: the two generic constants
 * in presets.ts, and the working behind them.
 *
 * The rule the doc comment on PLAY_BOX_USD states, so that a person refreshing
 * the constants reads the same numbers off this that they would work out by
 * hand from `npm run box:prices`:
 *
 *   - **market price**, never the listing spread — `market` is derived from
 *     completed sales; `low`/`mid`/`high` are current asks, and an ask is a
 *     hope rather than a price;
 *   - **released as of `now`** — presale boxes trade, and even carry market
 *     prices, but at preorder hype that settles after release, and a default
 *     should rest on settled prices;
 *   - **Standard-legal expansions only** (`setType === "expansion"`, which is
 *     also what keeps Masters and Remastered sets out), paper, both boxes
 *     priced;
 *   - **the newest BOX_SAMPLE_SIZE**, walking down from the newest and setting
 *     aside anything past BOX_OUTLIER_FACTOR times the median of the newest
 *     BOX_OUTLIER_POOL — the rule that kept Final Fantasy's $1,700 collector
 *     box out of an average of sets near $450.
 *
 * Throws when the feed cannot support that — fewer than BOX_SAMPLE_SIZE usable
 * sets — because a thinner average is a different number, not this one.
 */
export function genericBoxValues(feed: BoxPriceFeed, now: Date, gemsPerUsd: number): GenericBoxValues {
  const today = isoDate(now);
  const candidates: PricedSet[] = [];
  for (const set of feed.boxes) {
    const playUsd = set.boxes.play?.market;
    const collectorUsd = set.boxes.collector?.market;
    if (playUsd == null || collectorUsd == null) continue;
    if (set.releasedAt === null || set.releasedAt > today) continue;
    if (set.setType !== "expansion" || set.digital) continue;
    candidates.push({ ...set, releasedAt: set.releasedAt, playUsd, collectorUsd });
  }
  candidates.sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1));

  const pool = candidates.slice(0, BOX_OUTLIER_POOL);
  if (pool.length < BOX_SAMPLE_SIZE) {
    throw new SourceError(
      `box prices: only ${pool.length} released expansions with both boxes priced; ` +
        `the generic values want ${BOX_SAMPLE_SIZE}`,
    );
  }
  const medians = {
    playUsd: median(pool.map((c) => c.playUsd)),
    collectorUsd: median(pool.map((c) => c.collectorUsd)),
    over: pool.length,
  };

  const sets: PricedSet[] = [];
  const outliers: PricedSet[] = [];
  for (const candidate of candidates) {
    if (sets.length === BOX_SAMPLE_SIZE) break;
    if (
      candidate.playUsd > medians.playUsd * BOX_OUTLIER_FACTOR ||
      candidate.collectorUsd > medians.collectorUsd * BOX_OUTLIER_FACTOR
    ) {
      outliers.push(candidate);
    } else {
      sets.push(candidate);
    }
  }
  if (sets.length < BOX_SAMPLE_SIZE) {
    throw new SourceError(
      `box prices: only ${sets.length} of the newest expansions survive the outlier rule; ` +
        `the generic values want ${BOX_SAMPLE_SIZE}`,
    );
  }

  const playUsd = mean(sets.map((s) => s.playUsd));
  const collectorUsd = mean(sets.map((s) => s.collectorUsd));
  return {
    playUsd,
    collectorUsd,
    playGems: Math.round(playUsd * gemsPerUsd),
    collectorGems: Math.round(collectorUsd * gemsPerUsd),
    sets,
    outliers,
    medians,
  };
}
