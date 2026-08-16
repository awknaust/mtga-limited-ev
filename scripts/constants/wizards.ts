/**
 * Reading Wizards' drop-rates page — the authoritative source for reward and
 * drop-rate data, and the only HTML this repository still parses.
 *
 * The parsers fail loudly rather than returning something partial. A page
 * that has been restructured should stop the run, not quietly produce a
 * number built from whatever still matched.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 */

import { SourceError } from "../shared/http.ts";

// ---------------------------------------------------------------------------
// Generic HTML reading
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

const decode = (s: string): string =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    if (key in ENTITIES) return ENTITIES[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
    return whole;
  });

/**
 * Scripts and styles gone.
 *
 * Not cosmetic: the drop-rates page carries a second, JSON-escaped copy of its
 * own body inside a `<script>`, so an `indexOf` for a heading can land in the
 * duplicate and every offset after it is then meaningless.
 */
const stripNoise = (html: string): string =>
  html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

/** Tags out, entities decoded, whitespace collapsed. */
const textOf = (html: string): string =>
  decode(stripNoise(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/**
 * Rows of cell text from the table nearest `anchor` — the one containing it if
 * the anchor is a heading cell, otherwise the next one down.
 *
 * Both directions are needed because the two tables this reads are anchored
 * differently: one by a sentence above it, one by its own first header cell.
 */
function tableNear(html: string, anchor: number): string[][] | null {
  if (anchor < 0) return null;
  let start = html.lastIndexOf("<table", anchor);
  if (start === -1 || html.indexOf("</table>", start) < anchor) {
    start = html.indexOf("<table", anchor);
  }
  if (start === -1) return null;
  const end = html.indexOf("</table>", start);
  if (end === -1) return null;
  return [...html.slice(start, end).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...tr[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) => textOf(cell[2])),
  );
}

// ---------------------------------------------------------------------------
// The drop-rates page
// ---------------------------------------------------------------------------

export type MythicRateEntry = { rate: number; sets: string[] };

export type DropRates = {
  /** What duplicate protection pays for a rare / mythic, in gems. */
  rareDupeGems: number;
  mythicDupeGems: number;
  /** The per-set mythic upgrade rates, one entry per listed rate. */
  mythicRates: MythicRateEntry[];
  /** How often each rarity's slot pays a wildcard, as N in "1:N". */
  wildcards: { rare: number; mythic: number } & Record<string, number>;
  /** Gold at each daily win, first through last. */
  dailyWinGold: number[];
  /** How often a rare ICR upgrades to a mythic, as N in "1:N". */
  icrRareToMythicRate: number;
  /**
   * The upgrade chance on the mastery track's beyond-cap reward, in percent —
   * the "∞ Uncommon ICR – 5% Upgrade" row.
   */
  masteryUncommonUpgradePct: number;
};

/**
 * The figures the pack constants are built from: what a duplicate rare and
 * mythic convert to, how often the rare slot upgrades to a mythic, how often
 * it pays a wildcard instead of anything at all — plus the daily win ladder,
 * which is pinned in code and worth watching.
 */
export function parseDropRates(rawHtml: string): DropRates {
  const html = stripNoise(rawHtml);
  const text = textOf(html);

  const dupe = /(\d+)\s*Gems for rares,\s*(\d+)\s*Gems for mythic rares/i.exec(text);
  if (!dupe) throw new SourceError("drop rates: duplicate protection gems not found");

  // "Standard ICRs that upgrade from Rare to Mythic Rare are approximately at
  // a rate of 1:8" — the Event Rewards section. The Historic line repeats the
  // figure; matching the Standard one keeps the anchor unambiguous.
  const icr = /Standard ICRs that upgrade from Rare to Mythic Rare are approximately at a rate of 1:([\d.]+)/i.exec(
    text,
  );
  if (!icr) throw new SourceError("drop rates: ICR rare-to-mythic rate not found");

  // The mastery track's every-level-after reward. The spelling moves between
  // seasons — TMNT's table printed "∞ Uncommon ICR – 5% Upgrade", The Hobbit's
  // page writes "1x Uncommon ICR that has a 5% upgrade rate" — so both forms
  // are accepted, plus dash siblings rather than breaking on a typographic
  // edit.
  const masteryUpgrade = /Uncommon ICR(?:\s*[–—-]\s*|\s+that has a\s+)([\d.]+)%\s*upgrade/i.exec(
    text,
  );
  if (!masteryUpgrade) {
    throw new SourceError("drop rates: mastery uncommon ICR upgrade row not found");
  }

  return {
    rareDupeGems: Number(dupe[1]),
    mythicDupeGems: Number(dupe[2]),
    mythicRates: parseMythicRates(html),
    wildcards: parseWildcardRates(html),
    dailyWinGold: parseDailyWinGold(html),
    icrRareToMythicRate: Number(icr[1]),
    masteryUncommonUpgradePct: Number(masteryUpgrade[1]),
  };
}

/** The per-set mythic upgrade rates, one `<li>` per rate. */
function parseMythicRates(html: string): MythicRateEntry[] {
  const anchor = html.indexOf("Rares may upgrade to a mythic rare");
  if (anchor === -1) throw new SourceError("drop rates: mythic upgrade list not found");
  const start = html.indexOf("<ul", anchor);
  const end = html.indexOf("</ul>", start);
  if (start === -1 || end === -1) {
    throw new SourceError("drop rates: mythic upgrade list is not a list any more");
  }

  const rates: MythicRateEntry[] = [];
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
function parseWildcardRates(html: string): DropRates["wildcards"] {
  const rows = tableNear(html, html.indexOf("may redeem for a Wildcard of the same rarity"));
  if (!rows) throw new SourceError("drop rates: wildcard rate table not found");

  const wildcards: Record<string, number> = {};
  for (const [, rarity, rate] of rows) {
    const m = rate && /1:([\d.]+)/.exec(rate);
    if (m && rarity) wildcards[rarity.toLowerCase()] = Number(m[1]);
  }
  for (const rarity of ["rare", "mythic"]) {
    if (!wildcards[rarity]) throw new SourceError(`drop rates: no ${rarity} wildcard rate`);
  }
  return wildcards as DropRates["wildcards"];
}

/** Gold at each daily win, first through last. */
function parseDailyWinGold(html: string): number[] {
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
