/**
 * Extraction: each function takes what a source returned and gives back plain
 * data. Nothing here fetches, and nothing here does arithmetic — the maths is
 * in `derive.mjs`.
 *
 * Every parser fails loudly rather than returning something partial. A page
 * that has been restructured should stop the run, not quietly produce a number
 * built from whatever still matched.
 */

import { SourceError } from "./errors.mjs";
import { stripNoise, tableNear, textOf } from "./html.mjs";

/**
 * Wizards' drop-rates page: what a duplicate rare and mythic convert to, how
 * often the rare slot upgrades to a mythic, how often it pays a wildcard
 * instead of anything at all, and the daily win ladder.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */
export function parseDropRates(rawHtml) {
  const html = stripNoise(rawHtml);
  const text = textOf(html);

  const dupe = /(\d+)\s*Gems for rares,\s*(\d+)\s*Gems for mythic rares/i.exec(text);
  if (!dupe) throw new SourceError("drop rates: duplicate protection gems not found");

  return {
    rareDupeGems: Number(dupe[1]),
    mythicDupeGems: Number(dupe[2]),
    mythicRates: parseMythicRates(html),
    wildcards: parseWildcardRates(html),
    dailyWinGold: parseDailyWinGold(html),
  };
}

/** The per-set mythic upgrade rates, one `<li>` per rate. */
function parseMythicRates(html) {
  const anchor = html.indexOf("Rares may upgrade to a mythic rare");
  if (anchor === -1) throw new SourceError("drop rates: mythic upgrade list not found");
  const start = html.indexOf("<ul", anchor);
  const end = html.indexOf("</ul>", start);
  if (start === -1 || end === -1) {
    throw new SourceError("drop rates: mythic upgrade list is not a list any more");
  }

  const rates = [];
  for (const li of html.slice(start, end).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const m = /approximately 1:([\d.]+)\s+for\s+(?:Sets:)?\s*(.+)/i.exec(textOf(li[1]));
    if (!m) continue;
    rates.push({
      rate: Number(m[1]),
      sets: m[2]
        .split(",")
        .map((s) => s.replace(/\.\s*$/, "").trim())
        .filter(Boolean),
    });
  }
  if (rates.length === 0) throw new SourceError("drop rates: no mythic rates parsed");
  return rates;
}

/** How often each rarity's slot pays a wildcard instead of a card. */
function parseWildcardRates(html) {
  const rows = tableNear(html, html.indexOf("may redeem for a Wildcard of the same rarity"));
  if (!rows) throw new SourceError("drop rates: wildcard rate table not found");

  const wildcards = {};
  for (const [, rarity, rate] of rows) {
    const m = rate && /1:([\d.]+)/.exec(rate);
    if (m) wildcards[rarity.toLowerCase()] = Number(m[1]);
  }
  for (const rarity of ["rare", "mythic"]) {
    if (!wildcards[rarity]) throw new SourceError(`drop rates: no ${rarity} wildcard rate`);
  }
  return wildcards;
}

/** Gold at each daily win, first through last. */
function parseDailyWinGold(html) {
  const rows = tableNear(html, html.indexOf("Win Number"));
  const header = rows?.[0]?.map((c) => c.toLowerCase()) ?? [];
  if (!rows || header[0] !== "win number" || header[1] !== "gold") {
    // A shape check, not a formality: the page has a dozen tables, and the one
    // next to this in the source is a fifty-row mastery track that parses to
    // plausible-looking rubbish if it is picked up by mistake.
    throw new SourceError(
      `drop rates: daily win table not found (nearest header: ${header.join("/") || "none"})`,
    );
  }

  const gold = rows
    .slice(1)
    .filter((row) => row.length >= 2 && /^\d+$/.test(row[0]))
    .map((row) => Number(row[1]));
  if (gold.length === 0 || gold.some((g) => !Number.isFinite(g))) {
    throw new SourceError("drop rates: daily win gold column is not all numbers");
  }
  return gold;
}

/**
 * Scryfall, for the two things the price source does not say: when a set came
 * out, and what kind of set it is.
 *
 * @see https://scryfall.com/docs/api/sets
 */
export function indexSets(payload) {
  const byCode = new Map();
  for (const set of payload.data ?? []) {
    byCode.set(set.code.toLowerCase(), {
      code: set.code.toLowerCase(),
      name: set.name,
      releasedAt: set.released_at ?? null,
      setType: set.set_type,
      digital: Boolean(set.digital),
    });
  }
  if (byCode.size === 0) throw new SourceError("scryfall: no sets returned");
  return byCode;
}

/**
 * tcgcsv's group list — TCGplayer's sets, one group per set.
 *
 * Keyed by abbreviation because it joins to Scryfall's set codes exactly:
 * checked over every paper expansion since Throne of Eldraine, 33 of 33
 * matched. (The names would not — TCGplayer writes "Murders at Karlov Manor"
 * where a storefront might prefix the block.)
 *
 * @see https://tcgcsv.com — a public JSON mirror of TCGplayer's API,
 *      refreshed daily around 20:00 UTC
 */
export function indexTcgGroups(payload) {
  const byAbbreviation = new Map();
  for (const group of payload.results ?? []) {
    if (typeof group.abbreviation !== "string" || group.abbreviation === "") continue;
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
 * One set's booster-box prices from its tcgcsv products and prices payloads:
 * every "… Booster Display" product, each with TCGplayer's full price
 * statistics, keyed by kind — `play`, `collector`, `jumpstart`, whatever the
 * set was sold as.
 *
 * Everything is carried and nothing is chosen: `market` is sales-derived,
 * `low`/`mid`/`high` are the current listing spread, `directLow` is the
 * cheapest TCGplayer-Direct listing, and any of them can be null. Which
 * statistic to trust is a modelling question, and modelling questions belong
 * to the consumers.
 *
 * TCGplayer calls a booster box a "Display", and the `$`-anchored tail is the
 * match: "… Booster Display Case" and "… Master Case" must not match, because
 * a case is six boxes and would read as a box at six times the price.
 */
export function extractBoxPrices(productsPayload, pricesPayload) {
  const products = productsPayload.results;
  const prices = pricesPayload.results;
  if (!Array.isArray(products) || !Array.isArray(prices)) {
    throw new SourceError("tcgcsv: products or prices payload has no results array");
  }

  const price = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const statsOf = new Map();
  for (const row of prices) {
    // Sealed product is only ever the "Normal" printing; the guard is there
    // for the day a foil-subtype row appears against a product id.
    if (row.subTypeName !== "Normal") continue;
    statsOf.set(row.productId, {
      market: price(row.marketPrice),
      low: price(row.lowPrice),
      mid: price(row.midPrice),
      high: price(row.highPrice),
      directLow: price(row.directLowPrice),
    });
  }

  const boxes = {};
  for (const product of products) {
    const m = /- (?:([A-Za-z][A-Za-z' ]*?) )?Booster Display$/.exec(product.name);
    if (!m) continue;
    const kind = (m[1] ?? "booster").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const stats = statsOf.get(product.productId);
    if (stats) boxes[kind] = stats;
  }
  return boxes;
}
