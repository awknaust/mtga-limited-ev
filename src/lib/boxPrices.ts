/**
 * The live box-price feed, and what the app makes of it.
 *
 * A Worker (see `worker/`) publishes the newest twenty draftable paper sets
 * at `/api/box-prices` on this origin — every booster-box kind TCGplayer
 * tracks for each, with the full price statistics, presales included. The
 * feed decides nothing; every modelling choice is made here, in the app.
 *
 * What the app makes of it is one thing: **`boxPriceTable`**, which answers
 * "what does *this* box cost" for a payout that names its set. Every priced
 * paper set in the feed is listed, presales included and whatever its type —
 * Arena Direct has paid Modern Horizons boxes, and it runs alongside a set in
 * its release week. No outlier rule: a named box is worth what it trades at,
 * however startling that is, and Final Fantasy's $1,728 collector box is the
 * answer rather than an error. Market price throughout — `market` is derived
 * from actual sales, `low`/`mid`/`high` are the current ask spread, and a
 * listing is a hope rather than a price.
 *
 * The two *generic* box values — what a box naming no set is worth — are not
 * read from the feed at all. They are constants in `presets.ts`, refreshed by
 * a person, and the feed never moves them; see the note on PLAY_BOX_USD there.
 *
 * This module is the pure half: validating the payload and reading it. Fetching
 * lives in `src/liveBoxPrices.ts` — the model layer stays free of side effects.
 * The feed carries data rather than an answer so that changing a rule here is
 * an app deploy, not a data migration.
 *
 * The app also ships a copy of the feed — `src/data/box-prices.json`, the
 * Worker's payload as it stood when the build was made — and the bottom of
 * this module reads that copy the same way. That is what the app stands on
 * when the feed is missing (previews, dev without the proxy, an outage) or
 * fails validation: not an empty table but production's own on an earlier
 * day, so a missing feed is never worse than an old one.
 */

import baked from "../data/box-prices.json";
import { GEMS_PER_USD } from "./boxes";
import type { BoxKind, BoxPriceSet, BoxPriceTable, EventConfig } from "./types";

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

/** Local calendar date, so a set releasing today counts today everywhere. */
const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** Kinds a payout can name, and the feed key each is published under. */
const TABLE_KINDS: BoxKind[] = ["play", "collector"];

/**
 * Every priced box in the feed, for payouts that name their set.
 *
 * Wider than the averaging rule above on purpose, and each widening earns its
 * place: **any set type**, because Arena Direct has paid Modern Horizons
 * boxes and a Masters set is a real product with a real price; **presales
 * included**, because an Arena Direct runs in its set's release week and the
 * hype premium that disqualifies a preorder from an *average* is simply what
 * the box costs that week; **no outlier rule**, because naming a set is
 * saying which box, and the answer to "what is that box worth" is its price.
 *
 * Digital sets are still excluded — an Alchemy set has no paper box to ship.
 *
 * `latest` is the narrow one, since it stands for a preset's "whatever is
 * newest": the newest *released* expansion priced in that kind. Released,
 * because a preset that pointed at a set nobody can buy yet would price this
 * week's event at next month's preorder; an expansion, because that is the
 * cadence Arena Direct follows.
 *
 * A feed that priced nothing is no better than no feed, so it resolves the
 * same way — to the table the app shipped with, which names and prices the
 * sets it knew. The reading itself is `readBoxPriceTable`, kept apart so the
 * shipped table can be read by it without being asked for.
 */
export function boxPriceTable(feed: BoxPriceFeed, now: Date): BoxPriceTable {
  const table = readBoxPriceTable(feed, now);
  return table.sets.length === 0 ? FALLBACK_BOX_PRICES : table;
}

function readBoxPriceTable(feed: BoxPriceFeed, now: Date): BoxPriceTable {
  const today = isoDate(now);

  const sets: BoxPriceSet[] = [];
  for (const row of feed.boxes) {
    if (row.digital || row.releasedAt === null) continue;
    const boxes: BoxPriceSet["boxes"] = {};
    for (const kind of TABLE_KINDS) {
      const market = row.boxes[kind]?.market;
      if (market != null) boxes[kind] = Math.round(market * GEMS_PER_USD);
    }
    if (Object.keys(boxes).length === 0) continue;
    sets.push({ code: row.code, name: row.name, releasedAt: row.releasedAt, boxes });
  }
  sets.sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1));

  const released = feed.boxes.filter(
    (row) =>
      !row.digital &&
      row.releasedAt !== null &&
      row.releasedAt <= today &&
      row.setType === "expansion",
  );
  const latest: BoxPriceTable["latest"] = {};
  for (const kind of TABLE_KINDS) {
    // `sets` is already newest-first, and this walks the same order.
    const code = sets.find(
      (s) => s.boxes[kind] !== undefined && released.some((r) => r.code === s.code),
    )?.code;
    if (code !== undefined) latest[kind] = code;
  }

  return { sets, latest, generatedAt: feed.generatedAt };
}

/*
 * The copy the app ships with.
 *
 * Everything below is the reading above applied to `src/data/box-prices.json`
 * — the payload the Worker publishes, taken when the build was made — and it
 * has to sit at the bottom of the module because it runs at load, after every
 * rule and constant it uses is defined. `FALLBACK_BOX_PRICES` is what the rest
 * of the app reads: `defaultConfig` seeds a config's price table from it.
 */

/**
 * The feed's UTC calendar day, as a local `Date`, so the local-date reading
 * `isoDate` takes lands on the same day in every zone. Null when the stamp is
 * not one — the validator only checks that it is a string.
 */
function feedDay(feed: BoxPriceFeed): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(feed.generatedAt);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/**
 * The feed as it stood when this build was made, and the table read from it.
 *
 * `feed` is `src/data/box-prices.json` through `parseBoxPriceFeed` — the same
 * validator the live payload passes, so the copy is trusted exactly as far as
 * the network is. It is written by `npm run box:prices -- --write`, which CI
 * runs once at the top of every build so a deploy ships the newest feed it
 * could reach; when it cannot, the checked-in copy stands.
 *
 * `day` is when the copy was taken, and it is the date the table is read as
 * of — not the day the page is opened — so `latest` means the newest set
 * released *then*, and the copy means one thing wherever and whenever it is
 * read: production's answer on that day. Being a build behind is the whole
 * cost of the fallback, and it is the same cost as the prices being a week
 * old.
 *
 * A copy that will not parse is a build that must not ship, and the throw is
 * what makes `npm test` say so before it can.
 */
export const BAKED_BOX_PRICES: { feed: BoxPriceFeed; day: Date; table: BoxPriceTable } = (() => {
  const where = "src/data/box-prices.json";
  const feed = parseBoxPriceFeed(baked);
  if (feed === null) throw new Error(`${where} is not a box-price feed`);
  const day = feedDay(feed);
  if (day === null) throw new Error(`${where}: generatedAt ${feed.generatedAt} is not a date`);
  return { feed, day, table: readBoxPriceTable(feed, day) };
})();

/**
 * The price table the app holds before — or instead of — the live feed:
 * every set the shipped copy priced, and which of them `LATEST_SET` means,
 * as of the day the copy was taken. A payout naming a set is priced from it,
 * so a preview prices a Hobbit box at what one cost when the build was made
 * rather than at the generic value.
 */
export const FALLBACK_BOX_PRICES: BoxPriceTable = BAKED_BOX_PRICES.table;

/**
 * A config with the live feed applied — which is the per-set table, and only
 * that.
 *
 * The table is installed outright: it is not a setting anybody chose, it is
 * what the boxes named by the payouts cost today, and it is never written to
 * a link — a link names the product and this prices it on the day it is
 * opened. The two generic values are left exactly as they are. They are
 * settings with a shipped default, and the feed used to move them while they
 * still sat at it; that made a fresh load read as edited (the reset button
 * lit, the values written into the link) for the sake of a number nothing but
 * a custom ladder reads. Now only the reader moves them.
 *
 * Pure, so the app can apply it while building its first state rather than
 * after the first render: what the page paints is then the live answer, not
 * the shipped copy corrected a moment later.
 */
export function withLiveBoxPrices(config: EventConfig, feed: BoxPriceFeed, now: Date): EventConfig {
  return { ...config, boxPrices: boxPriceTable(feed, now) };
}
