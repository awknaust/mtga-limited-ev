/**
 * The orchestration: sources in, feed out.
 *
 * This is the module's front door and the only function the Worker calls.
 * Any single set failing fails the whole feed — a partial answer would
 * quietly bias anything averaged over it toward whichever sets happened to
 * load — and the Worker turns that into "keep serving yesterday's KV value".
 */

import { request } from "../shared/http.ts";
import { fetchSets } from "../shared/scryfall.ts";
import { buildFeed, type BoxPriceFeed } from "./feed.ts";
import { pickBoxFeedSets } from "./select.ts";
import { TCGCSV_BASE_URL, extractBoxPrices, indexTcgGroups, type BoxPrices } from "./tcgcsv.ts";

/** Fetches per batch against tcgcsv. Polite, and well under any burst limit. */
const BATCH_SIZE = 6;

export async function fetchBoxPriceFeed(now: Date = new Date()): Promise<BoxPriceFeed> {
  const [setsByCode, groupsJson] = await Promise.all([
    fetchSets(),
    request(`${TCGCSV_BASE_URL}/groups`, { json: true }),
  ]);
  const groups = indexTcgGroups(groupsJson);
  const targets = pickBoxFeedSets(setsByCode, groups, now);

  const priced: { code: string; boxes: BoxPrices }[] = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    priced.push(
      ...(await Promise.all(
        batch.map(async (set) => {
          const { groupId } = groups.get(set.code)!;
          const base = `${TCGCSV_BASE_URL}/${groupId}`;
          const [products, prices] = await Promise.all([
            request(`${base}/products`, { json: true }),
            request(`${base}/prices`, { json: true }),
          ]);
          return { code: set.code, boxes: extractBoxPrices(products, prices) };
        }),
      )),
    );
  }

  return buildFeed(priced, setsByCode, now);
}
