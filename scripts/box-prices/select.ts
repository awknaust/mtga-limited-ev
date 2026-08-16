/**
 * Which sets the feed covers. This is the one place the feed narrows at all,
 * and every rule here is a budget or a data-availability fact — never a
 * modelling opinion. The modelling (market vs listing, released or not,
 * which set types count toward a default) lives in the app.
 */

import { isoDate } from "../shared/dates.ts";
import type { ScryfallSet } from "../shared/scryfall.ts";
import type { TcgGroup } from "./tcgcsv.ts";

/**
 * How many sets the feed covers: the newest paper sets of the types below,
 * this many of them.
 *
 * The bound exists because tcgcsv is priced per set — two requests each — and
 * the Worker's whole refresh must stay inside the free plan's 50 subrequests:
 * 1 Scryfall + 1 group list + 2 × 20 = 42. Twenty sets reaches back about two
 * years, which covers the app's newest-three default rule many times over and
 * any set an Arena Direct is likely to pay out in. It is the one genuine
 * restriction in the feed, and it is a budget, not a model.
 */
export const BOX_FEED_SETS = 20;

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
export const BOX_FEED_SET_TYPES: ReadonlySet<string> = new Set([
  "expansion",
  "core",
  "masters",
  "draft_innovation",
]);

/**
 * Sets more than this far out are ignored: TCGplayer opens presale pages
 * months ahead, and a slot spent on a set nobody can hold yet is a slot taken
 * from a set someone is actually pricing. Sets inside the horizon are
 * included on purpose — presale boxes trade and carry real prices (even
 * market prices: The Hobbit had one four days before release), an Arena
 * Direct can run in a set's release window, and released-or-not is exactly
 * the kind of question the feed leaves to its consumers.
 */
export const PRESALE_HORIZON_DAYS = 45;

/**
 * The sets whose boxes are worth pricing: paper sets of the types above,
 * newest first, capped at BOX_FEED_SETS, and only those TCGplayer actually
 * has a group for.
 */
export function pickBoxFeedSets(
  setsByCode: Map<string, ScryfallSet>,
  groupsByAbbreviation: Map<string, TcgGroup>,
  now: Date,
): ScryfallSet[] {
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
    .sort((a, b) => (a.releasedAt! < b.releasedAt! ? 1 : -1))
    .slice(0, BOX_FEED_SETS);
}
