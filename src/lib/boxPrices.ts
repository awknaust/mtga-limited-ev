/**
 * The live box-price feed, and the rule that turns it into default values.
 *
 * A Worker (see `worker/`) publishes the newest twenty draftable paper sets
 * at `/api/box-prices` on this origin — every booster-box kind TCGplayer
 * tracks for each, with the full price statistics, presales included. The
 * feed decides nothing; every modelling choice is made here, in the app:
 *
 *   - **market price**, not a listing — `market` is derived from actual
 *     sales, `low`/`mid`/`high` are the current ask spread, and a listing is
 *     a hope rather than a price;
 *   - **released sets only** — presale boxes trade and even carry market
 *     prices, but those prices ride preorder hype and settle after release,
 *     and a default should rest on settled prices;
 *   - **Standard-legal expansions only** for the *default*, the mean of the
 *     newest three, with anything over twice its pool's median set aside —
 *     the rule that kept Final Fantasy's collector box out of the average.
 *
 * This module is the pure half: validating the payload and deriving the two
 * defaults. Fetching lives in `src/liveBoxPrices.ts` — the model layer stays
 * free of side effects. The feed carries data rather than an answer so that
 * changing a rule here is an app deploy, not a data migration; the eventual
 * goal is payouts that name their set and price against that row directly.
 *
 * When the feed is missing (previews, dev without the proxy, an outage) or
 * fails validation, the app stays on DEFAULT_PLAY_BOX_VALUE_GEMS and
 * DEFAULT_COLLECTOR_BOX_VALUE_GEMS — a snapshot of this same rule, refreshed
 * by hand via `npm run refresh:constants`.
 */

import { GEMS_PER_USD } from "./presets";

/**
 * TCGplayer's price statistics for one box, in USD. Any may be null — a box
 * with no recent sales has a `low` but no `market`, and Direct rarely stocks
 * sealed, so `directLow` usually is.
 */
export type BoxPriceStats = {
  /** Derived from completed sales; the honest street price. */
  market: number | null;
  /** Cheapest current listing. */
  low: number | null;
  mid: number | null;
  high: number | null;
  /** Cheapest TCGplayer-Direct listing. */
  directLow: number | null;
};

/**
 * One set's row in the feed. `boxes` is keyed by kind — `play`, `collector`,
 * `jumpstart`, whatever the set was sold as — and unknown kinds are data, not
 * errors.
 */
export type BoxPriceRow = {
  code: string;
  name: string;
  releasedAt: string | null;
  setType: string;
  digital: boolean;
  boxes: Partial<Record<string, BoxPriceStats>>;
};

export type BoxPriceFeed = {
  version: 1;
  /** ISO timestamp of the Worker run that built the payload. */
  generatedAt: string;
  boxes: BoxPriceRow[];
};

/** How many sets feed each average. */
export const BOX_SAMPLE_SIZE = 3;

/**
 * The outlier rule: a box priced over this multiple of the median across the
 * newest OUTLIER_POOL_SIZE candidates is left out of the average.
 */
export const BOX_OUTLIER_FACTOR = 2;
const OUTLIER_POOL_SIZE = 8;

const STAT_KEYS = ["market", "low", "mid", "high", "directLow"] as const;

/**
 * Validates a feed payload from the network.
 *
 * Returns null rather than throwing: a malformed feed is equivalent to no
 * feed, and the caller's answer to both is the baked-in fallback. Unknown
 * extra fields and unknown box kinds pass — the Worker is deployed separately
 * from the app, and a payload from a newer Worker must not read as corrupt to
 * an older app. A malformed *value* fails the whole feed, though: a price
 * that is a string or negative means something upstream broke, and guessing
 * around it would launder the breakage into a number.
 */
export function parseBoxPriceFeed(data: unknown): BoxPriceFeed | null {
  if (typeof data !== "object" || data === null) return null;
  const feed = data as Record<string, unknown>;
  if (feed.version !== 1) return null;
  if (typeof feed.generatedAt !== "string") return null;
  if (!Array.isArray(feed.boxes)) return null;

  const price = (v: unknown): v is number | null =>
    v === null ||
    v === undefined ||
    (typeof v === "number" && Number.isFinite(v) && v >= 0);

  const rows: BoxPriceRow[] = [];
  for (const raw of feed.boxes as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.code !== "string" || typeof row.name !== "string") return null;
    if (row.releasedAt !== null && typeof row.releasedAt !== "string") return null;
    if (typeof row.setType !== "string" || typeof row.digital !== "boolean") return null;
    if (typeof row.boxes !== "object" || row.boxes === null) return null;

    const boxes: BoxPriceRow["boxes"] = {};
    for (const [kind, rawStats] of Object.entries(row.boxes as Record<string, unknown>)) {
      if (typeof rawStats !== "object" || rawStats === null) return null;
      const stats = rawStats as Record<string, unknown>;
      const parsed = {} as Record<(typeof STAT_KEYS)[number], number | null>;
      for (const key of STAT_KEYS) {
        if (!price(stats[key])) return null;
        parsed[key] = (stats[key] as number | null | undefined) ?? null;
      }
      boxes[kind] = parsed;
    }
    rows.push({
      code: row.code,
      name: row.name,
      releasedAt: row.releasedAt,
      setType: row.setType,
      digital: row.digital,
      boxes,
    });
  }
  return { version: 1, generatedAt: feed.generatedAt, boxes: rows };
}

/** The two derived defaults, with the sets they rest on kept for showing why. */
export type LiveBoxDefaults = {
  playBoxValueGems: number;
  collectorBoxValueGems: number;
  /** The sets averaged, newest first. */
  sets: BoxPriceRow[];
  /** Sets that would have been used but were priced out by the outlier rule. */
  outliers: BoxPriceRow[];
  generatedAt: string;
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Local calendar date, so a set releasing today counts today everywhere. */
const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** A candidate for the averages: both markets known, so both usable. */
type PricedRow = BoxPriceRow & { releasedAt: string; playMarket: number; collectorMarket: number };

/**
 * The default box values today's feed implies, or null when the feed cannot
 * support the rule — fewer than BOX_SAMPLE_SIZE usable sets means the answer
 * is "keep the fallback", never a thinner average.
 *
 * A set is usable when it is a released, paper, Standard-legal expansion with
 * a market price for both boxes. "Standard-legal" is `setType ===
 * "expansion"`, the same reading the constants were derived with — it is also
 * what keeps Masters and Remastered sets out. Preorders are excluded by
 * release date even when they already trade: a presale market price rides
 * preorder hype, and the default should rest on settled prices.
 */
export function liveBoxDefaults(feed: BoxPriceFeed, now: Date): LiveBoxDefaults | null {
  const today = isoDate(now);

  const candidates: PricedRow[] = [];
  for (const row of feed.boxes) {
    const playMarket = row.boxes.play?.market;
    const collectorMarket = row.boxes.collector?.market;
    if (playMarket == null || collectorMarket == null) continue;
    if (row.releasedAt === null || row.releasedAt > today) continue;
    if (row.setType !== "expansion" || row.digital) continue;
    candidates.push({ ...row, releasedAt: row.releasedAt, playMarket, collectorMarket });
  }
  candidates.sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1));

  const pool = candidates.slice(0, OUTLIER_POOL_SIZE);
  if (pool.length < BOX_SAMPLE_SIZE) return null;
  const limits = {
    play: median(pool.map((c) => c.playMarket)) * BOX_OUTLIER_FACTOR,
    collector: median(pool.map((c) => c.collectorMarket)) * BOX_OUTLIER_FACTOR,
  };

  const sets: PricedRow[] = [];
  const outliers: PricedRow[] = [];
  for (const candidate of candidates) {
    if (sets.length === BOX_SAMPLE_SIZE) break;
    if (candidate.playMarket > limits.play || candidate.collectorMarket > limits.collector) {
      outliers.push(candidate);
    } else {
      sets.push(candidate);
    }
  }
  if (sets.length < BOX_SAMPLE_SIZE) return null;

  return {
    playBoxValueGems: Math.round(mean(sets.map((s) => s.playMarket)) * GEMS_PER_USD),
    collectorBoxValueGems: Math.round(
      mean(sets.map((s) => s.collectorMarket)) * GEMS_PER_USD,
    ),
    sets,
    outliers,
    generatedAt: feed.generatedAt,
  };
}
