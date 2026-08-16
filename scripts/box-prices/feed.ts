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
 * modelling lives in the app (`src/lib/boxPrices.ts` validates this shape and
 * derives the defaults from it); this module only refuses to publish data
 * that looks broken.
 *
 * Pure join, no fetching: testable under plain Node against fixture rows.
 */

import { SourceError } from "../shared/http.ts";
import type { ScryfallSet } from "../shared/scryfall.ts";
import type { BoxPrices } from "./tcgcsv.ts";

export type FeedSet = {
  code: string;
  name: string;
  releasedAt: string | null;
  setType: string;
  digital: boolean;
  boxes: BoxPrices;
};

export type BoxPriceFeed = {
  version: 1;
  /** ISO timestamp of the run that built the payload. */
  generatedAt: string;
  boxes: FeedSet[];
  /** Set codes the price source used that Scryfall does not know. */
  unmatched: string[];
};

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

export function buildFeed(
  priced: { code: string; boxes: BoxPrices }[],
  setsByCode: Map<string, ScryfallSet>,
  now: Date,
): BoxPriceFeed {
  const sets: FeedSet[] = [];
  const unmatched: string[] = [];
  for (const entry of priced) {
    const set = setsByCode.get(entry.code);
    if (!set) {
      // Kept visible in the payload rather than dropped silently — a growing
      // list here is the early sign the join is rotting.
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
      `feed: only ${sets.length} sets (${playMarkets} with play-box market prices) — ` +
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
