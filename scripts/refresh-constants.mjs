#!/usr/bin/env node
/**
 * Re-derives the sourced constants in `src/lib/presets.ts` from their sources
 * and reports what has drifted. It changes nothing — the output is a report and
 * an exit code.
 *
 *     npm run refresh:constants          human-readable report
 *     npm run refresh:constants -- --json
 *
 * Exit codes: 0 nothing drifted, 1 something drifted, 2 a source could not be
 * fetched or parsed. The split matters if this ever becomes a scheduled job: a
 * site being down should not read as a price move.
 *
 * Run it every couple of weeks. The street prices behind the two box constants
 * are the volatile part and move within a fortnight; everything else is a cheap
 * check riding along, and its whole value is catching the day Wizards changes a
 * published rate without anyone noticing.
 *
 * ## What it can and cannot do
 *
 * Three of the constants are not on the open web at all — the gem bundle
 * ladder, the Arena Open entry fee and the daily quest payout are in-client
 * numbers. They are listed under "By hand" at the end of the report with the
 * date each was last confirmed, so staleness at least becomes visible. Adding a
 * community wiki as a source for them would trade a known gap for an unknown
 * error, which is the wrong direction for this repo.
 *
 * ## On fetching
 *
 * The user agent below names the script and links the repository, and no source
 * is fetched more than once a run. MTGGoldfish rejects a bare `curl` (406) but
 * serves that agent; robots.txt allows `*`, and this is reference use of three
 * numbers, not a crawl. If it ever starts refusing, take that as a no and go
 * back to reading the page by hand rather than dressing the request up as a
 * browser.
 */

import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const USER_AGENT =
  "mtga-limited-ev-refresh/1.0 (+https://github.com/awknaust/mtga-limited-ev)";

const SOURCES = {
  dropRates: "https://magic.wizards.com/en/mtgarena/drop-rates",
  sets: "https://api.scryfall.com/sets",
  boxes: "https://www.mtggoldfish.com/prices/paper/boosters",
};

/**
 * How many sets feed the box averages, and how far back a set counts as recent.
 *
 * Three is what the shipped constants were built on. The window is only used to
 * decide which mythic upgrade rate is the representative one; two years covers
 * roughly the Standard rotation, so the answer tracks what someone drafting now
 * actually opens.
 */
const BOX_SAMPLE_SIZE = 3;
const RECENT_SET_MONTHS = 24;

/**
 * A box is dropped from the average when its price exceeds this multiple of the
 * candidate pool's median.
 *
 * This is the rule that excluded Final Fantasy by hand — at $2,399 a collector
 * box it roughly doubled the collector average on its own. Encoding it as a
 * ratio rather than a name means the next Final Fantasy is caught too, and the
 * report always prints what was dropped so the call stays visible.
 */
const OUTLIER_FACTOR = 2;
const OUTLIER_POOL_SIZE = 8;

/** Street prices move; a box constant is only worth changing past this. */
const DEFAULT_TOLERANCE_PCT = 5;

/**
 * The numbers no page publishes, with the date each was last confirmed in the
 * client. Update the date when you check one, whether or not it moved — the
 * point of the field is to show how old the answer is.
 */
const BY_HAND = [
  {
    constant: "GEMS_PER_USD",
    checkedOn: "2026-08-06",
    where: "MTG Arena store, Gems tab",
    look: "the whole gem bundle ladder — the constant is the best rate on it, which is no longer the largest bundle",
    ladder: [
      { gems: 40000, usd: 199.99 },
      { gems: 20000, usd: 99.99 },
      { gems: 9200, usd: 49.99 },
      { gems: 3400, usd: 19.99 },
      { gems: 1600, usd: 9.99 },
      { gems: 750, usd: 4.99 },
    ],
  },
  {
    constant: "DEFAULT_PLAY_IN_POINT_VALUE_GEMS",
    checkedOn: "2026-08-06",
    where: "https://magic.wizards.com/en/news/mtg-arena/arena-open-terms-and-conditions",
    look: "the play-in entry: 20 points or 4,000 gems, so 200 gems a point",
  },
  {
    constant: "DEFAULT_OTHER_GOLD_PER_DAY",
    checkedOn: "2026-08-06",
    where: "MTG Arena, daily quest",
    look: "a quest pays 500 or 750 depending on which you draw; 600 is the rough middle",
  },
];

// ---------------------------------------------------------------------------
// Fetching and HTML helpers
// ---------------------------------------------------------------------------

class SourceError extends Error {}

async function fetchText(url, { json = false } = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: json ? "application/json" : "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    throw new SourceError(`${url}: ${cause.message}`);
  }
  if (!res.ok) throw new SourceError(`${url}: HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
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
const stripNoise = (html) =>
  html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

/** Tags out, entities decoded, whitespace collapsed. */
const textOf = (html) =>
  decode(stripNoise(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/**
 * Rows of cell text from the table nearest `anchor` — the one containing it if
 * the anchor is a heading cell, otherwise the next one down.
 */
function tableNear(html, anchor) {
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

/**
 * Set names as they appear across the three sources, reduced to something
 * comparable.
 *
 * Wizards writes "Magic: The Gathering® | Marvel's Spider-Man" where Scryfall
 * writes "Marvel's Spider-Man", and hangs a ™ off Avatar. Dropping everything
 * but letters and digits and then shedding the brand prefix leaves the part
 * that actually names the set.
 */
const normaliseSetName = (name) =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^magicthegathering/, "");

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * The three figures the pack constants are built from, read off Wizards' page:
 * what a duplicate rare and mythic convert to, how often the rare slot upgrades
 * to a mythic, and how often it pays a wildcard instead of anything at all.
 * Plus the daily win ladder, which is pinned in code and worth watching.
 */
function parseDropRates(rawHtml) {
  const html = stripNoise(rawHtml);
  const text = textOf(html);

  const dupe = /(\d+)\s*Gems for rares,\s*(\d+)\s*Gems for mythic rares/i.exec(text);
  if (!dupe) throw new SourceError("drop rates: duplicate protection gems not found");

  const listStart = html.indexOf("Rares may upgrade to a mythic rare");
  if (listStart === -1) throw new SourceError("drop rates: mythic upgrade list not found");
  const ulStart = html.indexOf("<ul", listStart);
  const ulEnd = html.indexOf("</ul>", ulStart);
  if (ulStart === -1 || ulEnd === -1) {
    throw new SourceError("drop rates: mythic upgrade list is not a list any more");
  }
  const mythicRates = [];
  for (const li of html.slice(ulStart, ulEnd).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const entry = textOf(li[1]);
    const m = /approximately 1:([\d.]+)\s+for\s+(?:Sets:)?\s*(.+)/i.exec(entry);
    if (!m) continue;
    mythicRates.push({
      rate: Number(m[1]),
      sets: m[2]
        .split(",")
        .map((s) => s.replace(/\.\s*$/, "").trim())
        .filter(Boolean),
    });
  }
  if (mythicRates.length === 0) throw new SourceError("drop rates: no mythic rates parsed");

  const wildcardAnchor = html.indexOf("may redeem for a Wildcard of the same rarity");
  const wildcardRows = tableNear(html, wildcardAnchor);
  if (!wildcardRows) throw new SourceError("drop rates: wildcard rate table not found");
  const wildcards = {};
  for (const row of wildcardRows) {
    const [, rarity, rate] = row;
    const m = rate && /1:([\d.]+)/.exec(rate);
    if (m) wildcards[rarity.toLowerCase()] = Number(m[1]);
  }
  for (const rarity of ["rare", "mythic"]) {
    if (!wildcards[rarity]) throw new SourceError(`drop rates: no ${rarity} wildcard rate`);
  }

  const dailyRows = tableNear(html, html.indexOf("Win Number"));
  const dailyHeader = dailyRows?.[0]?.map((c) => c.toLowerCase()) ?? [];
  if (!dailyRows || dailyHeader[0] !== "win number" || dailyHeader[1] !== "gold") {
    // A shape check, not a formality: the page has a dozen tables, and the one
    // above this in the source is a fifty-row mastery track that parses to
    // plausible-looking rubbish if it is picked up by mistake.
    throw new SourceError(
      `drop rates: daily win table not found (nearest header: ${dailyHeader.join("/") || "none"})`,
    );
  }
  const dailyWinGold = dailyRows
    .slice(1)
    .filter((row) => row.length >= 2 && /^\d+$/.test(row[0]))
    .map((row) => Number(row[1]));
  if (dailyWinGold.length === 0 || dailyWinGold.some((g) => !Number.isFinite(g))) {
    throw new SourceError("drop rates: daily win gold column is not all numbers");
  }

  return {
    rareDupeGems: Number(dupe[1]),
    mythicDupeGems: Number(dupe[2]),
    mythicRates,
    wildcards,
    dailyWinGold,
  };
}

/** Scryfall, for the two things Goldfish does not say: when a set came out, and what kind it is. */
function indexSets(payload) {
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
 * Play and Collector booster box prices per set.
 *
 * The page prints two price columns, EV and Retail, and leaves EV blank for
 * recent sets. Retail is the one the constants are built on — what a box sells
 * for, not what the singles inside are thought to be worth — so the column is
 * located by its heading rather than by position.
 */
function parseBoxPrices(html) {
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
      const id = /data-card-id="([^"]*)"/.exec(row);
      if (!id) continue;
      const label = decode(id[1]);
      const kind = /\bPlay Booster Box\b/.test(label)
        ? "play"
        : /\bCollector Booster Box\b/.test(label)
          ? "collector"
          : null;
      if (!kind) continue;
      const code = /\[([A-Z0-9]+)\]\s*$/.exec(label);
      if (!code) continue;

      const prices = [
        ...row.matchAll(/priceList-price-price-wrapper'>\s*(?:\$\s*([\d,.]+))?/g),
      ].map((m) => (m[1] ? Number(m[1].replace(/,/g, "")) : null));
      const usd = prices[retail];
      if (usd == null || !Number.isFinite(usd)) continue;

      rows.push({ code: code[1].toLowerCase(), kind, usd });
    }
  }
  if (rows.length === 0) throw new SourceError("mtggoldfish: no booster box prices parsed");
  return rows;
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * What one rare slot is worth to a complete collection: a rare unless it
 * upgrades, and the upgrade happens about once every `packsPerMythic` packs.
 */
const rareSlotGems = (rareDupeGems, mythicDupeGems, packsPerMythic) =>
  rareDupeGems + (mythicDupeGems - rareDupeGems) / packsPerMythic;

/**
 * Which mythic upgrade rate to treat as today's.
 *
 * Wizards lists a rate per set, and the spread is real — 1:5.8 to 1:8.4 among
 * sets released in the last two years. The representative figure is the one
 * covering the most of those sets, which is a mode rather than an average
 * because Wizards sets these per set rather than sampling a distribution. Ties
 * go to the rate covering the newest set.
 */
function representativeMythicRate(mythicRates, setsByCode, now) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RECENT_SET_MONTHS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const paper = [...setsByCode.values()].filter((s) => !s.digital && s.releasedAt);
  const exact = new Map();
  for (const set of paper) {
    const key = normaliseSetName(set.name);
    if (!exact.has(key)) exact.set(key, set);
  }

  const resolve = (name) => {
    const key = normaliseSetName(name);
    if (exact.has(key)) return exact.get(key);
    const hits = paper.filter((s) => {
      const other = normaliseSetName(s.name);
      return other.length > 3 && (key.includes(other) || other.includes(key));
    });
    return hits.length === 1 ? hits[0] : null;
  };

  const tally = new Map();
  const unmatched = [];
  for (const { rate, sets } of mythicRates) {
    for (const name of sets) {
      const set = resolve(name);
      if (!set) {
        unmatched.push(name);
        continue;
      }
      if (set.releasedAt < cutoffIso || set.releasedAt > today) continue;
      const entry = tally.get(rate) ?? { rate, sets: [] };
      entry.sets.push(set);
      tally.set(rate, entry);
    }
  }

  const buckets = [...tally.values()].sort(
    (a, b) =>
      b.sets.length - a.sets.length ||
      Math.max(...b.sets.map((s) => Date.parse(s.releasedAt))) -
        Math.max(...a.sets.map((s) => Date.parse(s.releasedAt))),
  );
  if (buckets.length === 0) {
    throw new SourceError(
      "drop rates: no set in the mythic rate list could be dated to the last " +
        `${RECENT_SET_MONTHS} months`,
    );
  }

  return {
    rate: buckets[0].rate,
    buckets,
    unmatched,
    tied: buckets.length > 1 && buckets[1].sets.length === buckets[0].sets.length,
    windowStart: cutoffIso,
  };
}

/**
 * The sets whose box prices feed the averages: released, physical, Standard
 * legal, newest first, outliers set aside.
 *
 * "Standard legal" is `set_type === "expansion"`, which is also what keeps
 * Modern Horizons and the Remastered sets out. Taking the newest three keeps
 * them in rotation without needing a rotation calendar.
 */
function chooseBoxSets(priceRows, setsByCode, now) {
  const today = now.toISOString().slice(0, 10);
  const byCode = new Map();
  for (const row of priceRows) {
    const entry = byCode.get(row.code) ?? { code: row.code };
    entry[row.kind] = row.usd;
    byCode.set(row.code, entry);
  }

  const candidates = [];
  for (const entry of byCode.values()) {
    if (entry.play == null || entry.collector == null) continue;
    const set = setsByCode.get(entry.code);
    if (!set || !set.releasedAt) continue;
    if (set.digital || set.setType !== "expansion") continue;
    if (set.releasedAt > today) continue; // still a preorder, so the price is a guess
    candidates.push({ ...entry, name: set.name, releasedAt: set.releasedAt });
  }
  candidates.sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1));

  const pool = candidates.slice(0, OUTLIER_POOL_SIZE);
  if (pool.length === 0) throw new SourceError("mtggoldfish: no released set has both box types");
  const limits = {
    play: median(pool.map((c) => c.play)) * OUTLIER_FACTOR,
    collector: median(pool.map((c) => c.collector)) * OUTLIER_FACTOR,
  };

  const used = [];
  const dropped = [];
  for (const candidate of candidates) {
    if (used.length === BOX_SAMPLE_SIZE) break;
    const over = ["play", "collector"].filter((kind) => candidate[kind] > limits[kind]);
    if (over.length > 0) dropped.push({ ...candidate, over });
    else used.push(candidate);
  }
  if (used.length < BOX_SAMPLE_SIZE) {
    throw new SourceError(
      `mtggoldfish: only ${used.length} usable set(s), need ${BOX_SAMPLE_SIZE}`,
    );
  }
  return { used, dropped, limits, candidates };
}

/**
 * The gold-per-gem rate, read off the events that price both ways.
 *
 * Local, not fetched: the entry costs are already in the repo, and the constant
 * is only true so long as they all agree. Two events disagreeing means Arena
 * has stopped charging a single rate and the constant has to become per-event.
 */
function goldPerGemFromPresets(presets) {
  const ratios = presets
    .filter((p) => p.entryCostGold && p.entryCostGems)
    .map((p) => ({ name: p.name, ratio: p.entryCostGold / p.entryCostGems }));
  const distinct = [...new Set(ratios.map((r) => r.ratio.toFixed(6)))];
  return { ratios, agrees: distinct.length === 1, value: ratios[0]?.ratio ?? null };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const usd = (n) => `$${n.toLocaleString("en-US")}`;
const gems = (n) => n.toLocaleString("en-US");
const pct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const pad = (s, n) => String(s).padEnd(n);
const padStart = (s, n) => String(s).padStart(n);

function render(report) {
  const out = [];
  const say = (line = "") => out.push(line);

  say(`mtga-limited-ev — constants refresh, ${report.date}`);
  say();

  const { packs, boxes, goldPerGem } = report;

  say("Booster pack rare slot");
  say(`  duplicate protection      rare ${packs.rareDupeGems} gems, mythic ${packs.mythicDupeGems} gems`);
  say(
    `  mythic upgrade, recent    1:${packs.mythicRate}  ` +
      `(${packs.mythicBuckets[0].count} of ${packs.recentSetCount} sets since ${packs.windowStart})`,
  );
  for (const bucket of packs.mythicBuckets.slice(1)) {
    say(`                            1:${pad(bucket.rate, 5)} ${bucket.count}: ${bucket.sets.join(", ")}`);
  }
  if (packs.tied) say("                            ** tie for the modal rate — read the tally above **");
  if (packs.unmatchedSetNames.length > 0) {
    // Normally all Alchemy, which is digital and has no paper release date to
    // match against. A jump here means Wizards has renamed something, and a
    // set may be missing from the tally: --json lists them.
    say(
      `  undated set names         ${packs.unmatchedSetNames.length} ` +
        `(${packs.unmatchedSetNames.slice(0, 3).join(", ")}${packs.unmatchedSetNames.length > 3 ? ", ..." : ""})`,
    );
  }
  say(`  rare slot, raw            ${packs.rawSlotGems.toFixed(2)} gems`);
  say(
    `  wildcard displacement     1:${packs.wildcards.rare} rare + 1:${packs.wildcards.mythic} mythic ` +
      `= ${(packs.wildcardShare * 100).toFixed(1)}% of packs`,
  );
  say(`  rare slot, adjusted       ${packs.adjustedSlotGems.toFixed(2)} gems`);
  say(
    `  band over recent rates    ${packs.band.low.toFixed(2)} (1:${packs.band.lowRate}) .. ` +
      `${packs.band.high.toFixed(2)} (1:${packs.band.highRate})`,
  );
  say();

  say(`Physical box street prices (retail, released Standard-legal sets, newest ${BOX_SAMPLE_SIZE})`);
  for (const set of boxes.used) {
    say(
      `  ${pad(set.code.toUpperCase(), 5)}${pad(set.name, 30)} ${set.releasedAt}   ` +
        `play ${padStart(usd(set.play), 7)}   collector ${padStart(usd(set.collector), 8)}`,
    );
  }
  for (const set of boxes.dropped) {
    say(
      `  ${pad(set.code.toUpperCase(), 5)}${pad(set.name, 30)} ${set.releasedAt}   ` +
        `play ${padStart(usd(set.play), 7)}   collector ${padStart(usd(set.collector), 8)}   ` +
        `dropped: ${set.over.join(" and ")} over ${OUTLIER_FACTOR}x median`,
    );
  }
  say(
    `  averages                  play ${usd(Math.round(boxes.playMean))}   ` +
      `collector ${usd(Math.round(boxes.collectorMean))}   at ${boxes.gemsPerUsd} gems/$`,
  );
  say();

  say("Constants");
  say(`  ${pad("", 34)}${padStart("shipped", 9)}${padStart("recomputed", 12)}${padStart("delta", 9)}  verdict`);
  for (const c of report.constants) {
    say(
      `  ${pad(c.name, 34)}${padStart(c.shippedText, 9)}${padStart(c.computedText, 12)}` +
        `${padStart(c.deltaText, 9)}  ${c.verdict}${c.note ? `  ${c.note}` : ""}`,
    );
  }
  say();

  say("By hand — no page publishes these");
  for (const item of report.byHand) {
    say(`  ${pad(item.constant, 34)}last checked ${item.checkedOn}`);
    say(`    ${item.where}`);
    say(`    ${item.look}`);
    // Printed in full rather than summarised: the ladder carried a bundle that
    // had not existed for some time, and it went unnoticed precisely because
    // only the derived rate was ever on screen.
    for (const rung of item.ladder ?? []) {
      say(
        `      ${padStart(gems(rung.gems), 6)} gems  ${padStart(`$${rung.usd.toFixed(2)}`, 8)}  ` +
          `${(rung.gems / rung.usd).toFixed(2)} gems/$`,
      );
    }
  }
  say();

  if (goldPerGem.ratios.length > 0) {
    say(
      `Gold-per-gem agreement: ${goldPerGem.ratios.length} events price both ways` +
        (goldPerGem.agrees ? ", all at the same rate." : " and they DISAGREE:"),
    );
    if (!goldPerGem.agrees) {
      for (const r of goldPerGem.ratios) say(`  ${pad(r.name, 30)}${r.ratio.toFixed(4)}`);
    }
    say();
  }

  const drifted = report.constants.filter((c) => c.verdict === "DRIFT");
  if (drifted.length === 0) {
    say("Nothing drifted. No change needed.");
  } else {
    say(`${drifted.length} constant(s) drifted past ${report.tolerancePct}%:`);
    for (const c of drifted) say(`  ${c.name}  ${c.shippedText} -> ${c.computedText}`);
    say();
    say("Paste into src/lib/presets.ts, and update the doc comments' worked numbers:");
    for (const c of drifted) if (c.patch) say(`  ${c.patch}`);
    say();
    say("Check the prices above against the source page before committing them.");
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadShippedConstants() {
  // Vite rather than a TypeScript runner: it is already a devDependency, and it
  // resolves the extensionless imports in presets.ts the same way the app does.
  const { createServer } = await import("vite");
  const server = await createServer({
    root: ROOT,
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });
  try {
    return await server.ssrLoadModule("/src/lib/presets.ts");
  } finally {
    await server.close();
  }
}

function compare({ name, shipped, computed, tolerancePct, format = gems, patch }) {
  const delta = shipped === 0 ? 0 : ((computed - shipped) / shipped) * 100;
  const drift = Math.abs(delta) > tolerancePct;
  return {
    name,
    shipped,
    computed,
    shippedText: format(shipped),
    computedText: format(computed),
    deltaText: shipped === computed ? "—" : pct(delta),
    verdict: drift ? "DRIFT" : "ok",
    patch: drift ? patch?.(computed) : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      [
        "Usage: npm run refresh:constants [-- --json] [-- --tolerance=<pct>]",
        "",
        "  --json             emit the whole report as JSON",
        `  --tolerance=<pct>  box price drift allowed before a DRIFT verdict (default ${DEFAULT_TOLERANCE_PCT})`,
        "",
        "Exit: 0 clean, 1 something drifted, 2 a source failed.",
      ].join("\n"),
    );
    return 0;
  }
  const asJson = args.includes("--json");
  const toleranceArg = args.find((a) => a.startsWith("--tolerance="));
  const tolerancePct = toleranceArg ? Number(toleranceArg.split("=")[1]) : DEFAULT_TOLERANCE_PCT;
  if (!Number.isFinite(tolerancePct) || tolerancePct < 0) {
    console.error(`Bad --tolerance: ${toleranceArg}`);
    return 2;
  }

  const now = new Date();
  const shipped = await loadShippedConstants();

  const [dropRatesHtml, setsJson, boxesHtml] = await Promise.all([
    fetchText(SOURCES.dropRates),
    fetchText(SOURCES.sets, { json: true }),
    fetchText(SOURCES.boxes),
  ]);

  const rates = parseDropRates(dropRatesHtml);
  const setsByCode = indexSets(setsJson);
  const boxPrices = parseBoxPrices(boxesHtml);

  // Pack constants.
  const mythic = representativeMythicRate(rates.mythicRates, setsByCode, now);
  const rawSlotGems = rareSlotGems(rates.rareDupeGems, rates.mythicDupeGems, mythic.rate);
  const wildcardShare = 1 / rates.wildcards.rare + 1 / rates.wildcards.mythic;
  const adjustedSlotGems = rawSlotGems * (1 - wildcardShare);
  const bandValues = mythic.buckets.map((b) => ({
    rate: b.rate,
    value: rareSlotGems(rates.rareDupeGems, rates.mythicDupeGems, b.rate),
  }));
  const low = bandValues.reduce((a, b) => (b.value < a.value ? b : a));
  const high = bandValues.reduce((a, b) => (b.value > a.value ? b : a));

  // Box constants, priced at the shipped gems-per-dollar so this isolates the
  // price move; a change to GEMS_PER_USD is its own line below.
  const boxes = chooseBoxSets(boxPrices, setsByCode, now);
  const playMean = mean(boxes.used.map((s) => s.play));
  const collectorMean = mean(boxes.used.map((s) => s.collector));

  const goldPerGem = goldPerGemFromPresets(shipped.PRESETS);

  const constants = [];

  // The pack figure is a judgement between two defensible numbers rather than
  // one formula, so it is checked as a window: the raw slot value above, the
  // wildcard-adjusted value below. The midpoint is what the shipped 22 rounds
  // from, and it is offered as the replacement, not as a rule Wizards states.
  const packMid = (rawSlotGems + adjustedSlotGems) / 2;
  const packWindow = [Math.round(adjustedSlotGems), Math.round(rawSlotGems)];
  const packInWindow =
    shipped.DEFAULT_PACK_VALUE_GEMS >= packWindow[0] &&
    shipped.DEFAULT_PACK_VALUE_GEMS <= packWindow[1];
  constants.push({
    name: "DEFAULT_PACK_VALUE_GEMS",
    shipped: shipped.DEFAULT_PACK_VALUE_GEMS,
    computed: Math.round(packMid),
    shippedText: gems(shipped.DEFAULT_PACK_VALUE_GEMS),
    computedText: gems(Math.round(packMid)),
    deltaText: `${packWindow[0]}..${packWindow[1]}`,
    verdict: packInWindow ? "ok" : "DRIFT",
    note: packInWindow ? "inside the adjusted..raw window" : "outside the adjusted..raw window",
    patch: packInWindow
      ? null
      : `export const DEFAULT_PACK_VALUE_GEMS = ${Math.round(packMid)};`,
  });

  // Kept in the `rare x rate + upgrade` form the constant is written in, so the
  // arithmetic in the doc comment still reads as the arithmetic in the code.
  const draftNumerator =
    rates.rareDupeGems * mythic.rate + (rates.mythicDupeGems - rates.rareDupeGems);
  constants.push(
    compare({
      name: "DEFAULT_DRAFT_PACK_VALUE_GEMS",
      shipped: shipped.DEFAULT_DRAFT_PACK_VALUE_GEMS,
      computed: Math.round(rawSlotGems),
      tolerancePct: 0,
      patch: () =>
        "export const DEFAULT_DRAFT_PACK_VALUE_GEMS = " +
        `Math.round(${draftNumerator} / ${mythic.rate});`,
    }),
  );

  constants.push(
    compare({
      name: "DEFAULT_PLAY_BOX_VALUE_GEMS",
      shipped: shipped.DEFAULT_PLAY_BOX_VALUE_GEMS,
      computed: Math.round(playMean * shipped.GEMS_PER_USD),
      tolerancePct,
      patch: () => `const PLAY_BOX_USD = [${boxes.used.map((s) => s.play).join(", ")}];`,
    }),
    compare({
      name: "DEFAULT_COLLECTOR_BOX_VALUE_GEMS",
      shipped: shipped.DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
      computed: Math.round(collectorMean * shipped.GEMS_PER_USD),
      tolerancePct,
      patch: () => `const COLLECTOR_BOX_USD = [${boxes.used.map((s) => s.collector).join(", ")}];`,
    }),
  );

  const goldPerGemOk =
    goldPerGem.agrees &&
    goldPerGem.value != null &&
    Math.abs(goldPerGem.value - shipped.GOLD_PER_GEM) < 1e-9;
  constants.push({
    name: "GOLD_PER_GEM",
    shipped: shipped.GOLD_PER_GEM,
    computed: goldPerGem.value,
    shippedText: shipped.GOLD_PER_GEM.toFixed(4),
    computedText: goldPerGem.value == null ? "—" : goldPerGem.value.toFixed(4),
    deltaText: "—",
    verdict: goldPerGemOk ? "ok" : "DRIFT",
    note: goldPerGem.agrees
      ? `${goldPerGem.ratios.length} presets price both ways`
      : "presets no longer agree — the rate may have to become per-event",
    patch: goldPerGemOk ? null : `export const GOLD_PER_GEM = ${goldPerGem.value};`,
  });

  const dailyMatches =
    rates.dailyWinGold.length === shipped.DAILY_WIN_GOLD.length &&
    rates.dailyWinGold.every((g, i) => g === shipped.DAILY_WIN_GOLD[i]);
  constants.push({
    name: "DAILY_WIN_GOLD",
    shipped: shipped.DAILY_WIN_GOLD,
    computed: rates.dailyWinGold,
    shippedText: `${shipped.DAILY_WIN_GOLD.length} wins`,
    computedText: `${rates.dailyWinGold.length} wins`,
    deltaText: dailyMatches ? "—" : "differs",
    verdict: dailyMatches ? "ok" : "DRIFT",
    note: `sums to ${rates.dailyWinGold.reduce((a, b) => a + b, 0)} gold`,
    patch: dailyMatches
      ? null
      : `export const DAILY_WIN_GOLD: readonly number[] = [${rates.dailyWinGold.join(", ")}];`,
  });

  const ladder = BY_HAND.find((h) => h.constant === "GEMS_PER_USD").ladder;
  const bestRate = Math.round(Math.max(...ladder.map((b) => b.gems / b.usd)));
  const gemsPerUsdOk = bestRate === shipped.GEMS_PER_USD;
  constants.push({
    name: "GEMS_PER_USD",
    shipped: shipped.GEMS_PER_USD,
    computed: bestRate,
    shippedText: gems(shipped.GEMS_PER_USD),
    computedText: gems(bestRate),
    deltaText: "—",
    verdict: gemsPerUsdOk ? "ok" : "DRIFT",
    note: "best of the by-hand ladder below",
    patch: gemsPerUsdOk ? null : `export const GEMS_PER_USD = ${bestRate};`,
  });

  const report = {
    date: now.toISOString().slice(0, 10),
    tolerancePct,
    sources: SOURCES,
    packs: {
      rareDupeGems: rates.rareDupeGems,
      mythicDupeGems: rates.mythicDupeGems,
      mythicRate: mythic.rate,
      windowStart: mythic.windowStart,
      tied: mythic.tied,
      recentSetCount: mythic.buckets.reduce((n, b) => n + b.sets.length, 0),
      mythicBuckets: mythic.buckets.map((b) => ({
        rate: b.rate,
        count: b.sets.length,
        sets: b.sets.map((s) => s.code.toUpperCase()),
      })),
      unmatchedSetNames: mythic.unmatched,
      wildcards: rates.wildcards,
      wildcardShare,
      rawSlotGems,
      adjustedSlotGems,
      band: { low: low.value, lowRate: low.rate, high: high.value, highRate: high.rate },
    },
    boxes: {
      used: boxes.used,
      dropped: boxes.dropped,
      playMean,
      collectorMean,
      gemsPerUsd: shipped.GEMS_PER_USD,
    },
    goldPerGem,
    constants,
    byHand: BY_HAND,
  };

  console.log(asJson ? JSON.stringify(report, null, 2) : render(report));
  return constants.some((c) => c.verdict === "DRIFT") ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (err) {
  if (err instanceof SourceError) {
    console.error(`Source unavailable or changed shape: ${err.message}`);
    console.error("Nothing was checked. This is not a price move.");
    process.exitCode = 2;
  } else {
    throw err;
  }
}
