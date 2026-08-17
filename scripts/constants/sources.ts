/**
 * The only module here that touches the network.
 *
 * Access is lazy and memoised, which is what lets `refresh-constants
 * GEMS_PER_USD` make no requests at all: a constant that needs no feed never
 * asks for one, and two constants that need the same feed share a fetch.
 *
 * The box-price feed is the heavy one — it is `scripts/box-prices/` run in
 * full, some forty requests to tcgcsv plus a Scryfall set list of its own —
 * so it is only ever fetched when a box constant was asked for, and once.
 */

import { fetchBoxPriceFeed } from "../box-prices/fetch.ts";
import type { BoxPriceFeed } from "../box-prices/feed.ts";
import { TCGCSV_BASE_URL } from "../box-prices/tcgcsv.ts";
import { request } from "../shared/http.ts";
import { SCRYFALL_SETS_URL, fetchSets, type ScryfallSet } from "../shared/scryfall.ts";
import { parseDropRates, type DropRates } from "./wizards.ts";

export const SOURCE_URLS = {
  dropRates: "https://magic.wizards.com/en/mtgarena/drop-rates",
  sets: SCRYFALL_SETS_URL,
  boxPrices: TCGCSV_BASE_URL,
} as const;

export type SourceKey = keyof typeof SOURCE_URLS;

export type Sources = {
  urls: typeof SOURCE_URLS;
  /**
   * Shared memoisation, also used by the registry for work computed *from* a
   * feed — the representative mythic rate is derived once per run rather than
   * once per constant that wants it.
   */
  once: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
  dropRates: () => Promise<DropRates>;
  sets: () => Promise<Map<string, ScryfallSet>>;
  /**
   * The box-price feed as the Worker would publish it, built by the same
   * module. Takes the run's `now` because the feed's own selection has a
   * presale horizon measured from it.
   */
  boxPrices: (now: Date) => Promise<BoxPriceFeed>;
};

/** A run's view of the outside world. */
export function createSources(): Sources {
  const pending = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (!pending.has(key)) pending.set(key, fn());
    return pending.get(key) as Promise<T>;
  };

  return {
    urls: SOURCE_URLS,
    once,
    dropRates: () =>
      once("dropRates", async () => parseDropRates((await request(SOURCE_URLS.dropRates)) as string)),
    sets: () => once("sets", fetchSets),
    boxPrices: (now) => once("boxPrices", () => fetchBoxPriceFeed(now)),
  };
}
