/**
 * Scryfall's set list — the one source both modules join against, for the two
 * things no price source says: when a set came out, and what kind of set it
 * is.
 *
 * @see https://scryfall.com/docs/api/sets
 */

import { SourceError, request } from "./http.ts";

export const SCRYFALL_SETS_URL = "https://api.scryfall.com/sets";

export type ScryfallSet = {
  /** Lowercase set code — the join key everything else uses. */
  code: string;
  name: string;
  releasedAt: string | null;
  setType: string;
  digital: boolean;
};

export function indexSets(payload: unknown): Map<string, ScryfallSet> {
  const data = (payload as { data?: unknown[] })?.data ?? [];
  const byCode = new Map<string, ScryfallSet>();
  for (const raw of data) {
    const set = raw as {
      code?: unknown;
      name?: unknown;
      released_at?: unknown;
      set_type?: unknown;
      digital?: unknown;
    };
    if (typeof set.code !== "string" || typeof set.name !== "string") continue;
    byCode.set(set.code.toLowerCase(), {
      code: set.code.toLowerCase(),
      name: set.name,
      releasedAt: typeof set.released_at === "string" ? set.released_at : null,
      setType: typeof set.set_type === "string" ? set.set_type : "",
      digital: Boolean(set.digital),
    });
  }
  if (byCode.size === 0) throw new SourceError("scryfall: no sets returned");
  return byCode;
}

export async function fetchSets(): Promise<Map<string, ScryfallSet>> {
  return indexSets(await request(SCRYFALL_SETS_URL, { json: true }));
}
