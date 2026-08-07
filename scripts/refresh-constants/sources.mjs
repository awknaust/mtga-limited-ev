/**
 * The only module that touches the network.
 *
 * Access is lazy and memoised, which is what lets `refresh-constants
 * GEMS_PER_USD` make no requests at all: a constant that needs no feed never
 * asks for one, and two constants that need the same feed share a fetch.
 */

import { SourceError } from "./errors.mjs";
import { indexSets, parseBoxPrices, parseDropRates } from "./parse.mjs";

export const SOURCE_URLS = {
  dropRates: "https://magic.wizards.com/en/mtgarena/drop-rates",
  sets: "https://api.scryfall.com/sets",
  boxPrices: "https://www.mtggoldfish.com/prices/paper/boosters",
};

/**
 * Names the script and links the repository.
 *
 * MTGGoldfish rejects a bare `curl` (406) but serves this; robots.txt allows
 * `*`, and this is reference use of three numbers, not a crawl. If it ever
 * starts refusing, take that as a no and read the page by hand rather than
 * dressing the request up as a browser.
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

  return {
    urls: SOURCE_URLS,
    once,
    dropRates: () =>
      once("dropRates", async () => parseDropRates(await request(SOURCE_URLS.dropRates))),
    sets: () => once("sets", async () => indexSets(await request(SOURCE_URLS.sets, { json: true }))),
    boxPrices: () =>
      once("boxPrices", async () => parseBoxPrices(await request(SOURCE_URLS.boxPrices))),
  };
}
