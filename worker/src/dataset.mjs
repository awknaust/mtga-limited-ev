/**
 * The feed's payload: every set with a tracked Play or Collector box price,
 * joined to what Scryfall knows about the set.
 *
 * Deliberately *not* an answer. The old approach averaged the newest three
 * sets at publish time, which meant the rule was frozen into the data; this
 * publishes the whole table with enough metadata — release date, set type,
 * digital flag — for the app to apply whatever rule it holds today. The same
 * shape is what a future "this payout is a box of set X" feature would read,
 * priced per set rather than as an average.
 *
 * Pure join, no fetching: testable under plain Node against fixture rows.
 */

import { SourceError } from "../../scripts/refresh-constants/errors.mjs";

export const KV_KEY = "box-prices:v1";

/**
 * The floor under "the parse worked". The feed targets the twenty newest
 * released expansions and TCGplayer has market prices for nearly all of them
 * — nineteen sets, fourteen with Play boxes, on the day this was written — so
 * numbers far below these mean the source changed shape and the parse is
 * returning fragments. Better to keep serving yesterday's data than to
 * publish a stump.
 */
const MIN_SETS = 12;
const MIN_PLAY_PRICES = 3;

/**
 * @param priceRows rows from `parseBoxPrices`: `{ code, kind, usd }`
 * @param setsByCode the Map from `indexSets`
 * @returns the JSON-ready feed object
 */
export function buildDataset(priceRows, setsByCode, now = new Date()) {
  const merged = new Map();
  for (const row of priceRows) {
    const entry = merged.get(row.code) ?? { code: row.code };
    entry[row.kind] = row.usd;
    merged.set(row.code, entry);
  }

  const boxes = [];
  const unmatched = [];
  for (const entry of merged.values()) {
    const set = setsByCode.get(entry.code);
    if (!set) {
      // A code the price source used that Scryfall does not know. Kept visible in the
      // payload rather than dropped silently — a growing list here is the
      // early sign the join is rotting.
      unmatched.push(entry.code);
      continue;
    }
    boxes.push({
      code: entry.code,
      name: set.name,
      releasedAt: set.releasedAt,
      setType: set.setType,
      digital: set.digital,
      playUsd: entry.play ?? null,
      collectorUsd: entry.collector ?? null,
    });
  }

  // Newest first, undated last — the consumers all start from "most recent".
  boxes.sort((a, b) => {
    if (a.releasedAt === b.releasedAt) return a.code < b.code ? -1 : 1;
    if (a.releasedAt === null) return 1;
    if (b.releasedAt === null) return -1;
    return a.releasedAt < b.releasedAt ? 1 : -1;
  });

  const playCount = boxes.filter((b) => b.playUsd !== null).length;
  if (boxes.length < MIN_SETS || playCount < MIN_PLAY_PRICES) {
    throw new SourceError(
      `dataset: only ${boxes.length} sets (${playCount} with play boxes) — ` +
        "the source page has probably changed shape",
    );
  }

  return {
    version: 1,
    generatedAt: now.toISOString(),
    boxes,
    unmatched,
  };
}
