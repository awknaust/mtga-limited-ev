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
 * How many sets the box-price feed covers: the newest paper sets of the types
 * below, this many of them.
 *
 * The bound exists because tcgcsv is priced per set — two requests each — and
 * the Worker's whole run must stay inside the free plan's 50 subrequests:
 * 1 Scryfall + 1 group list + 2 × 20 = 42. Twenty sets reaches back about two
 * years, which covers the newest-three default rule many times over and any
 * set an Arena Direct is likely to pay out in. It is the one genuine
 * restriction left in the feed, and it is a budget, not a model.
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
 * Set types whose boxes the feed carries: everything sold as a draftable
 * paper set with its own boosters.
 *
 * Wider than the app's default rule on purpose. The default averages
 * Standard-legal expansions only, but the feed is data rather than an answer,
 * and Arena has already paid non-expansion boxes out — an Arena Direct ran
 * for Modern Horizons 3 (`draft_innovation`), and Foundations (`core`) is as
 * likely a future prize as any expansion. Restricting the *feed* to
 * expansions would have priced neither. Excluded types are the ones with no
 * box anyone drafts: Commander decks, Secret Lairs, promos, tokens, funny
 * sets, and everything digital.
 */
const BOX_FEED_SET_TYPES = new Set(["expansion", "core", "masters", "draft_innovation"]);

/**
 * The sets whose boxes are worth pricing: paper sets of the types above,
 * newest first, capped at BOX_FEED_SETS, and only those TCGplayer actually
 * has a group for. Unreleased sets are included on purpose — presale boxes
 * trade and carry real prices (even market prices: The Hobbit had one four
 * days before release), an Arena Direct can run in a set's release window,
 * and released-or-not is exactly the kind of question the feed leaves to its
 * consumers.
 *
 * Sets more than a few weeks out are ignored: TCGplayer opens presale pages
 * months ahead, and a slot spent on a set nobody can hold yet is a slot taken
 * from a set someone is actually pricing.
 */
const PRESALE_HORIZON_DAYS = 45;

export function pickBoxFeedSets(setsByCode, groupsByAbbreviation, now) {
  const horizon = new Date(now.getTime() + PRESALE_HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const cutoff = isoDate(horizon);
  return [...setsByCode.values()]
    .filter(
      (set) =>
        BOX_FEED_SET_TYPES.has(set.setType) &&
        !set.digital &&
        set.releasedAt !== null &&
        set.releasedAt <= cutoff &&
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
   * Box price rows, `{ code, kind, prices }`, one per set and box kind, where
   * `prices` is TCGplayer's full statistics object — market, low, mid, high,
   * directLow, each possibly null.
   *
   * Via tcgcsv — the same marketplace Scryfall's USD card prices come from.
   * Every statistic is carried and none is chosen here; which one a number
   * should rest on is a modelling question, and those belong to the
   * consumers. Any single set failing fails the whole feed: a partial answer
   * would quietly bias anything averaged over it toward whichever sets
   * happened to load.
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
        throw new SourceError("tcgcsv: no candidate set matched a TCGplayer group");
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
          for (const [kind, prices] of Object.entries(boxes)) {
            rows.push({ code, kind, prices });
          }
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
