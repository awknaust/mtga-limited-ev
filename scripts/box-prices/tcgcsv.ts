/**
 * Reading tcgcsv.com — a public JSON mirror of TCGplayer's API, refreshed
 * daily around 20:00 UTC. TCGplayer is the same marketplace Scryfall's USD
 * card prices come from.
 *
 * Extraction only: what a payload says, not which sets to ask about (that is
 * `select.ts`) or what any number means (that is the consumers' business).
 */

import { SourceError } from "../shared/http.ts";

/** Category 1 is Magic. */
export const TCGCSV_BASE_URL = "https://tcgcsv.com/tcgplayer/1";

export type TcgGroup = { groupId: number; name: string };

/**
 * TCGplayer's price statistics for one product, in USD. Any may be null — a
 * box with no recent sales has a `low` but no `market`, and TCGplayer Direct
 * rarely stocks sealed, so `directLow` usually is.
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

/** Box prices for one set, keyed by kind: `play`, `collector`, `jumpstart`… */
export type BoxPrices = Partial<Record<string, BoxPriceStats>>;

/**
 * The group list — TCGplayer's sets, one group per set.
 *
 * Keyed by abbreviation because it joins to Scryfall's set codes exactly:
 * checked over every paper expansion since Throne of Eldraine, 33 of 33
 * matched. (The names would not — TCGplayer writes "Murders at Karlov Manor"
 * where a storefront might prefix the block.)
 */
export function indexTcgGroups(payload: unknown): Map<string, TcgGroup> {
  const results = (payload as { results?: unknown[] })?.results ?? [];
  const byAbbreviation = new Map<string, TcgGroup>();
  for (const raw of results) {
    const group = raw as { groupId?: unknown; name?: unknown; abbreviation?: unknown };
    if (typeof group.abbreviation !== "string" || group.abbreviation === "") continue;
    if (typeof group.groupId !== "number" || typeof group.name !== "string") continue;
    const key = group.abbreviation.toLowerCase();
    // First writer wins; duplicates have not been observed and the newest
    // groups sort first in the payload, which is the right tiebreak anyway.
    if (!byAbbreviation.has(key)) {
      byAbbreviation.set(key, { groupId: group.groupId, name: group.name });
    }
  }
  if (byAbbreviation.size === 0) throw new SourceError("tcgcsv: no groups returned");
  return byAbbreviation;
}

/**
 * One set's booster-box prices from its products and prices payloads: every
 * "… Booster Display" product, each with the full statistics, keyed by kind —
 * `play`, `collector`, `jumpstart`, whatever the set was sold as.
 *
 * Everything is carried and nothing is chosen. Which statistic to trust is a
 * modelling question, and modelling questions belong to the consumers.
 *
 * TCGplayer calls a booster box a "Display", and the `$`-anchored tail is the
 * match: "… Booster Display Case" and "… Master Case" must not match, because
 * a case is six boxes and would read as a box at six times the price.
 */
export function extractBoxPrices(productsPayload: unknown, pricesPayload: unknown): BoxPrices {
  const products = (productsPayload as { results?: unknown[] })?.results;
  const prices = (pricesPayload as { results?: unknown[] })?.results;
  if (!Array.isArray(products) || !Array.isArray(prices)) {
    throw new SourceError("tcgcsv: products or prices payload has no results array");
  }

  const price = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const statsOf = new Map<number, BoxPriceStats>();
  for (const raw of prices) {
    const row = raw as Record<string, unknown>;
    // Sealed product is only ever the "Normal" printing; the guard is there
    // for the day a foil-subtype row appears against a product id.
    if (row.subTypeName !== "Normal") continue;
    if (typeof row.productId !== "number") continue;
    statsOf.set(row.productId, {
      market: price(row.marketPrice),
      low: price(row.lowPrice),
      mid: price(row.midPrice),
      high: price(row.highPrice),
      directLow: price(row.directLowPrice),
    });
  }

  const boxes: BoxPrices = {};
  for (const raw of products) {
    const product = raw as { productId?: unknown; name?: unknown };
    if (typeof product.name !== "string" || typeof product.productId !== "number") continue;
    const m = /- (?:([A-Za-z][A-Za-z' ]*?) )?Booster Display$/.exec(product.name);
    if (!m) continue;
    const kind = (m[1] ?? "booster").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const stats = statsOf.get(product.productId);
    if (stats) boxes[kind] = stats;
  }
  return boxes;
}
