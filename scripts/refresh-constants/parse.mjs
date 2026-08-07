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
 * Scryfall, for the two things MTGGoldfish does not say: when a set came out,
 * and what kind of set it is.
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
 * Play and Collector booster box street prices, one row per set and box type.
 *
 * The page prints two price columns, EV and Retail, and leaves EV blank for
 * recent sets. Retail is the one wanted — what a box sells for, not what the
 * singles inside are thought to be worth — so the column is located by its
 * heading rather than by position.
 *
 * Sets are keyed by the code in each row's `data-card-id` rather than by the
 * heading above it, because the codes join to Scryfall exactly and the names
 * do not: this page says "Ravnica: Murders at Karlov Manor" where Scryfall says
 * "Murders at Karlov Manor".
 *
 * @see https://www.mtggoldfish.com/prices/paper/boosters
 */
export function parseBoxPrices(html) {
  const rows = [];

  for (const section of html.split("<div class='priceListV2-subsection'>").slice(1)) {
    const headerEnd = section.indexOf("</div>\n<div class='priceListV2-row'>");
    const header = section.slice(0, headerEnd === -1 ? section.length : headerEnd);
    const columns = [...header.matchAll(/<div class='priceListV2-price'>([\s\S]*?)<\/div>/g)].map(
      (m) => textOf(m[1]),
    );
    const retail = columns.findIndex((c) => /retail/i.test(c));
    if (retail === -1) continue;

    for (const row of section.split("<div class='priceListV2-row'>").slice(1)) {
      const parsed = parseBoxRow(row, retail);
      if (parsed) rows.push(parsed);
    }
  }

  if (rows.length === 0) throw new SourceError("mtggoldfish: no booster box prices parsed");
  return rows;
}

function parseBoxRow(row, retailColumn) {
  const id = /data-card-id="([^"]*)"/.exec(row);
  if (!id) return null;

  const label = id[1];
  const kind = /\bPlay Booster Box\b/.test(label)
    ? "play"
    : /\bCollector Booster Box\b/.test(label)
      ? "collector"
      : null;
  if (!kind) return null;

  const code = /\[([A-Z0-9]+)\]\s*$/.exec(label);
  if (!code) return null;

  const prices = [...row.matchAll(/priceList-price-price-wrapper'>\s*(?:\$\s*([\d,.]+))?/g)].map(
    (m) => (m[1] ? Number(m[1].replace(/,/g, "")) : null),
  );
  const usd = prices[retailColumn];
  if (usd == null || !Number.isFinite(usd)) return null;

  return { code: code[1].toLowerCase(), kind, usd };
}
