/**
 * The only module that touches the network.
 *
 * Access is lazy and memoised, which is what lets `refresh-constants
 * GEMS_PER_USD` make no requests at all: a constant that needs no feed never
 * asks for one, and two constants that need the same feed share a fetch.
 */

import { SourceError } from "./errors.mjs";
import { extractBoxPrices, indexSets, indexTcgGroups, parseDropRates } from "./parse.mjs";

export const SOURCE_URLS = {
  dropRates: "https://magic.wizards.com/en/mtgarena/drop-rates",
  sets: "https://api.scryfall.com/sets",
  boxPrices: "https://tcgcsv.com/tcgplayer/1",
};

/**
 * How many sets the box-price feed covers: the newest released paper
 * expansions, this many of them.
 *
 * The bound exists because tcgcsv is priced per set — two requests each — and
 * the Worker's whole run must stay inside the free plan's 50 subrequests:
 * 1 Scryfall + 1 group list + 2 × 20 = 42. Twenty expansions is about three
 * years of Standard, which covers the newest-three default rule many times
 * over and any set an Arena Direct is likely to pay out in.
 *
 * Unreleased sets are not fetched at all: their products exist as presales,
 * presales have no sales history, and `extractBoxPrices` takes marketPrice or
 * nothing — so a preorder would spend two subrequests to learn null twice.
 */
const BOX_FEED_SETS = 20;

/** Fetches per batch against tcgcsv. Polite, and well under any burst limit. */
const BATCH_SIZE = 6;

/**
 * Names the script and links the repository. Every source here serves
 * anonymous traffic; identifying ourselves honestly is the cheap courtesy
 * that keeps it that way. If a source ever starts refusing this agent, take
 * that as a no and find another source rather than dressing the request up
 * as a browser.
 */
const USER_AGENT =
  "mtga-limited-ev-refresh/1.0 (+https://github.com/awknaust/mtga-limited-ev)";

const TIMEOUT_MS = 30_000;

async function request(url, { json = false } = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: json ? "application/json" : "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new SourceError(`${url}: ${cause.message}`);
  }
  if (!res.ok) throw new SourceError(`${url}: HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

/** Local calendar date, matching how the derivations read release dates. */
const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The sets whose boxes are worth pricing: released paper expansions, newest
 * first, capped at BOX_FEED_SETS, and only those TCGplayer actually has a
 * group for. Pure; exported for the doc value of being visible, used by
 * `boxPrices` below.
 */
export function pickBoxFeedSets(setsByCode, groupsByAbbreviation, now) {
  const today = isoDate(now);
  return [...setsByCode.values()]
    .filter(
      (set) =>
        set.setType === "expansion" &&
        !set.digital &&
        set.releasedAt !== null &&
        set.releasedAt <= today &&
        groupsByAbbreviation.has(set.code),
    )
    .sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1))
    .slice(0, BOX_FEED_SETS);
}

/**
 * A run's view of the outside world.
 *
 * `once` is shared with the derivations so that work computed from a feed — the
 * representative mythic rate, the chosen box sets — is also done once per run
 * rather than once per constant that wants it.
 */
export function createSources() {
  const pending = new Map();
  const once = (key, fn) => {
    if (!pending.has(key)) pending.set(key, fn());
    return pending.get(key);
  };

  const sets = () =>
    once("sets", async () => indexSets(await request(SOURCE_URLS.sets, { json: true })));

  /**
   * Box price rows, `{ code, kind, usd }`, one per set and box type.
   *
   * TCGplayer market prices via tcgcsv — the same marketplace Scryfall's USD
   * card prices come from, and a figure derived from sales rather than
   * listings. Any single set failing fails the whole feed: a partial answer
   * would quietly bias the averages toward whichever sets happened to load.
   */
  const boxPrices = () =>
    once("boxPrices", async () => {
      const [setsByCode, groupsJson] = await Promise.all([
        sets(),
        request(`${SOURCE_URLS.boxPrices}/groups`, { json: true }),
      ]);
      const groups = indexTcgGroups(groupsJson);
      const targets = pickBoxFeedSets(setsByCode, groups, new Date());
      if (targets.length === 0) {
        throw new SourceError("tcgcsv: no released expansion matched a TCGplayer group");
      }

      const rows = [];
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        const found = await Promise.all(
          batch.map(async (set) => {
            const { groupId } = groups.get(set.code);
            const base = `${SOURCE_URLS.boxPrices}/${groupId}`;
            const [products, prices] = await Promise.all([
              request(`${base}/products`, { json: true }),
              request(`${base}/prices`, { json: true }),
            ]);
            return { code: set.code, boxes: extractBoxPrices(products, prices) };
          }),
        );
        for (const { code, boxes } of found) {
          if (boxes.play !== null) rows.push({ code, kind: "play", usd: boxes.play });
          if (boxes.collector !== null) rows.push({ code, kind: "collector", usd: boxes.collector });
        }
      }

      if (rows.length === 0) throw new SourceError("tcgcsv: no box prices found at all");
      return rows;
    });

  return {
    urls: SOURCE_URLS,
    once,
    dropRates: () =>
      once("dropRates", async () => parseDropRates(await request(SOURCE_URLS.dropRates))),
    sets,
    boxPrices,
  };
}
