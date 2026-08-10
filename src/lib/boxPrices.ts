/**
 * The live box-price feed, and the rule that turns it into default values.
 *
 * A Worker (see `worker/`) publishes street prices for every set MTGGoldfish
 * tracks, joined to Scryfall's metadata, at `/api/box-prices` on this origin.
 * This module is the pure half: validating that payload and deriving the two
 * default box values from it. Fetching lives in `src/liveBoxPrices.ts` — the
 * model layer stays free of side effects.
 *
 * The rule is the one the shipped constants were computed with, deliberately:
 * the mean of the newest three released Standard-legal sets, with anything
 * priced over twice its pool's median set aside as an outlier — the rule that
 * kept Final Fantasy's $2,400 collector box out of the average. The feed
 * carries every set precisely so this rule can live here, where changing it is
 * an app deploy rather than a data migration; the eventual goal is payouts
 * that name their set and price against that row directly.
 *
 * When the feed is missing (previews, dev without the proxy, an outage) or
 * fails validation, the app stays on DEFAULT_PLAY_BOX_VALUE_GEMS and
 * DEFAULT_COLLECTOR_BOX_VALUE_GEMS — a snapshot of this same rule, refreshed
 * by hand via `npm run refresh:constants`.
 */

import { GEMS_PER_USD } from "./presets";

/** One set's row in the feed. Prices are street USD; null means not tracked. */
export type BoxPriceRow = {
  code: string;
  name: string;
  releasedAt: string | null;
  setType: string;
  digital: boolean;
  playUsd: number | null;
  collectorUsd: number | null;
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

/**
 * Validates a feed payload from the network.
 *
 * Returns null rather than throwing: a malformed feed is equivalent to no
 * feed, and the caller's answer to both is the baked-in fallback. Unknown
 * extra fields pass — the Worker is deployed separately from the app, and a
 * payload from a newer Worker must not read as corrupt to an older app.
 */
export function parseBoxPriceFeed(data: unknown): BoxPriceFeed | null {
  if (typeof data !== "object" || data === null) return null;
  const feed = data as Record<string, unknown>;
  if (feed.version !== 1) return null;
  if (typeof feed.generatedAt !== "string") return null;
  if (!Array.isArray(feed.boxes)) return null;

  const price = (v: unknown): v is number | null =>
    v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);

  const boxes: BoxPriceRow[] = [];
  for (const raw of feed.boxes as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.code !== "string" || typeof row.name !== "string") return null;
    if (row.releasedAt !== null && typeof row.releasedAt !== "string") return null;
    if (typeof row.setType !== "string" || typeof row.digital !== "boolean") return null;
    if (!price(row.playUsd) || !price(row.collectorUsd)) return null;
    boxes.push({
      code: row.code,
      name: row.name,
      releasedAt: row.releasedAt,
      setType: row.setType,
      digital: row.digital,
      playUsd: row.playUsd,
      collectorUsd: row.collectorUsd,
    });
  }
  return { version: 1, generatedAt: feed.generatedAt, boxes };
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

/**
 * The default box values today's feed implies, or null when the feed cannot
 * support the rule — fewer than BOX_SAMPLE_SIZE usable sets means the answer
 * is "keep the fallback", never a thinner average.
 *
 * A set is usable when it is a released, paper, Standard-legal expansion with
 * both prices tracked. "Standard-legal" is `setType === "expansion"`, the same
 * reading the constants were derived with — it is also what keeps Masters and
 * Remastered sets out. Preorders are excluded by release date: their prices
 * are speculation.
 */
export function liveBoxDefaults(feed: BoxPriceFeed, now: Date): LiveBoxDefaults | null {
  const today = isoDate(now);

  const candidates = feed.boxes
    .filter(
      (b): b is BoxPriceRow & { playUsd: number; collectorUsd: number; releasedAt: string } =>
        b.playUsd !== null &&
        b.collectorUsd !== null &&
        b.releasedAt !== null &&
        b.setType === "expansion" &&
        !b.digital &&
        b.releasedAt <= today,
    )
    .sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1));

  const pool = candidates.slice(0, OUTLIER_POOL_SIZE);
  if (pool.length < BOX_SAMPLE_SIZE) return null;
  const limits = {
    play: median(pool.map((c) => c.playUsd)) * BOX_OUTLIER_FACTOR,
    collector: median(pool.map((c) => c.collectorUsd)) * BOX_OUTLIER_FACTOR,
  };

  const sets: LiveBoxDefaults["sets"] = [];
  const outliers: LiveBoxDefaults["outliers"] = [];
  for (const candidate of candidates) {
    if (sets.length === BOX_SAMPLE_SIZE) break;
    if (candidate.playUsd > limits.play || candidate.collectorUsd > limits.collector) {
      outliers.push(candidate);
    } else {
      sets.push(candidate);
    }
  }
  if (sets.length < BOX_SAMPLE_SIZE) return null;

  return {
    playBoxValueGems: Math.round(mean(sets.map((s) => s.playUsd!)) * GEMS_PER_USD),
    collectorBoxValueGems: Math.round(mean(sets.map((s) => s.collectorUsd!)) * GEMS_PER_USD),
    sets,
    outliers,
    generatedAt: feed.generatedAt,
  };
}
