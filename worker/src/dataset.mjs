/**
 * The feed's payload: every set with any tracked booster-box price, joined to
 * what Scryfall knows about the set, with TCGplayer's full price statistics
 * per box kind.
 *
 * Deliberately *not* an answer, twice over. The set list is every draftable
 * set the budget covers — presales included — with release date, set type and
 * digital flag, so released-or-not is the reader's call. And each box carries
 * the whole statistics object (market, low, mid, high, directLow) rather than
 * one chosen number, so market-versus-listing is the reader's call too. The
 * modelling lives in the app; this file only refuses to publish data that
 * looks broken.
 *
 * Pure join, no fetching: testable under plain Node against fixture rows.
 */

import { SourceError } from "../../scripts/refresh-constants/errors.mjs";

export const KV_KEY = "box-prices:v1";

/**
 * The floor under "the parse worked". The feed targets the twenty newest
 * draftable sets and TCGplayer tracks boxes for nearly all of them — twenty
 * sets, seventeen with play-box market prices, on the day this was written —
 * so numbers far below these mean the source changed shape and the parse is
 * returning fragments. Better to keep serving yesterday's data than to
 * publish a stump.
 */
const MIN_SETS = 12;
const MIN_PLAY_MARKETS = 3;

/**
 * @param priceRows rows from the sources module: `{ code, kind, prices }`,
 *   where `prices` is `{ market, low, mid, high, directLow }`, each nullable
 * @param setsByCode the Map from `indexSets`
 * @returns the JSON-ready feed object
 */
export function buildDataset(priceRows, setsByCode, now = new Date()) {
  const merged = new Map();
  for (const row of priceRows) {
    const entry = merged.get(row.code) ?? { code: row.code, boxes: {} };
    entry.boxes[row.kind] = row.prices;
    merged.set(row.code, entry);
  }

  const sets = [];
  const unmatched = [];
  for (const entry of merged.values()) {
    const set = setsByCode.get(entry.code);
    if (!set) {
      // A code the price source used that Scryfall does not know. Kept
      // visible in the payload rather than dropped silently — a growing list
      // here is the early sign the join is rotting.
      unmatched.push(entry.code);
      continue;
    }
    sets.push({
      code: entry.code,
      name: set.name,
      releasedAt: set.releasedAt,
      setType: set.setType,
      digital: set.digital,
      boxes: entry.boxes,
    });
  }

  // Newest first, undated last — the consumers all start from "most recent".
  sets.sort((a, b) => {
    if (a.releasedAt === b.releasedAt) return a.code < b.code ? -1 : 1;
    if (a.releasedAt === null) return 1;
    if (b.releasedAt === null) return -1;
    return a.releasedAt < b.releasedAt ? 1 : -1;
  });

  const playMarkets = sets.filter((s) => s.boxes.play?.market != null).length;
  if (sets.length < MIN_SETS || playMarkets < MIN_PLAY_MARKETS) {
    throw new SourceError(
      `dataset: only ${sets.length} sets (${playMarkets} with play-box market prices) — ` +
        "the source has probably changed shape",
    );
  }

  return {
    version: 1,
    generatedAt: now.toISOString(),
    boxes: sets,
    unmatched,
  };
}
