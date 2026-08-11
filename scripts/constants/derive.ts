/**
 * The arithmetic, and the judgement calls that go with it.
 *
 * Pure: everything here takes parsed data and returns numbers. Which constant
 * uses which derivation is `registry.ts`; where the data came from is
 * `sources.ts`. Nothing about box prices lives here — that is its own module,
 * `scripts/box-prices/`, and its modelling lives in the app.
 */

import { isoDate } from "../shared/dates.ts";
import { SourceError } from "../shared/http.ts";
import type { ScryfallSet } from "../shared/scryfall.ts";
import type { MythicRateEntry } from "./wizards.ts";

/**
 * How far back a set still counts as recent, for picking the mythic rate.
 *
 * Two years covers roughly the Standard rotation, so the answer tracks what
 * someone drafting now actually opens.
 */
export const RECENT_SET_MONTHS = 24;

/**
 * What one rare slot is worth to a complete collection.
 *
 * Once you hold playsets of every rare and mythic, the slot pays gems instead
 * of a card. It is a rare unless it upgrades, and it upgrades about once every
 * `packsPerMythic` packs.
 */
export const rareSlotGems = (
  rareDupeGems: number,
  mythicDupeGems: number,
  packsPerMythic: number,
): number => rareDupeGems + (mythicDupeGems - rareDupeGems) / packsPerMythic;

/**
 * How often the rare slot pays a wildcard rather than a card or gems.
 *
 * Both a rare and a mythic wildcard can displace it, so the two rates add.
 */
export const wildcardShare = (wildcards: { rare: number; mythic: number }): number =>
  1 / wildcards.rare + 1 / wildcards.mythic;

export type MythicRateSummary = {
  rate: number;
  buckets: { rate: number; sets: ScryfallSet[] }[];
  /** Names that matched no Scryfall set — worth reading, not just counting. */
  undated: string[];
  /** Codes of digital sets skipped, normally the Alchemy variants. */
  digital: string[];
  tied: boolean;
  window: { from: string; to: string };
};

/**
 * Which mythic upgrade rate to treat as today's.
 *
 * Wizards lists a rate per set and the spread is real — 1:5.8 to 1:8.4 among
 * sets released in the last two years. The representative figure is the one
 * covering the most of those sets, which is a mode rather than an average
 * because Wizards sets these per set rather than sampling a distribution. Ties
 * go to the rate covering the newest set.
 */
export function representativeMythicRate(
  mythicRates: MythicRateEntry[],
  setsByCode: Map<string, ScryfallSet>,
  now: Date,
): MythicRateSummary {
  const resolve = setResolver(setsByCode);

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RECENT_SET_MONTHS);
  const from = isoDate(cutoff);
  const to = isoDate(now);

  const tally = new Map<number, { rate: number; sets: ScryfallSet[] }>();
  const undated: string[] = [];
  const digital: string[] = [];
  for (const { rate, sets } of mythicRates) {
    for (const name of sets) {
      const set = resolve(name);
      if (!set) {
        undated.push(name);
        continue;
      }
      // Alchemy sets carry their own rate and are listed alongside the paper
      // set they draw from. They are excluded because this figure is about what
      // a limited player opens, and counting them also double-counts: matching
      // them loosely would fold "Alchemy: Aetherdrift" back onto Aetherdrift
      // and let one set vote twice.
      if (set.digital) {
        digital.push(set.code);
        continue;
      }
      if (set.releasedAt === null || set.releasedAt < from || set.releasedAt > to) continue;
      const bucket = tally.get(rate) ?? { rate, sets: [] };
      if (!bucket.sets.some((s) => s.code === set.code)) bucket.sets.push(set);
      tally.set(rate, bucket);
    }
  }

  const newest = (bucket: { sets: ScryfallSet[] }): number =>
    Math.max(...bucket.sets.map((s) => Date.parse(s.releasedAt!)));
  const buckets = [...tally.values()].sort(
    (a, b) => b.sets.length - a.sets.length || newest(b) - newest(a),
  );
  if (buckets.length === 0) {
    throw new SourceError(
      `drop rates: no set in the mythic rate list could be dated to the last ${RECENT_SET_MONTHS} months`,
    );
  }

  return {
    rate: buckets[0].rate,
    buckets,
    undated,
    digital: [...new Set(digital)],
    tied: buckets.length > 1 && buckets[1].sets.length === buckets[0].sets.length,
    window: { from, to },
  };
}

/**
 * Set names as Wizards writes them, reduced to something comparable with
 * Scryfall's: Wizards writes "Magic: The Gathering® | Marvel's Spider-Man"
 * where Scryfall writes "Marvel's Spider-Man", and hangs a ™ off Avatar.
 * Dropping everything but letters and digits and then shedding the brand
 * prefix leaves the part that actually names the set.
 */
const normaliseSetName = (name: string): string =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^magicthegathering/, "");

/**
 * Matches a set name written by Wizards to a set known to Scryfall.
 *
 * Digital sets are in the pool deliberately, even though nothing downstream
 * counts them: leaving them out does not make them go away, it makes
 * "Alchemy: Aetherdrift" fall through to a loose match on Aetherdrift. Being
 * able to name a set and then discard it beats mistaking it for another.
 *
 * Exact first. Containment only where it is unambiguous, because "Strixhaven"
 * matches both "Strixhaven: School of Mages" and "Secrets of Strixhaven", and
 * guessing between them would file a set under the wrong upgrade rate.
 */
function setResolver(setsByCode: Map<string, ScryfallSet>): (name: string) => ScryfallSet | null {
  const known = [...setsByCode.values()].filter((s) => s.releasedAt !== null);
  const exact = new Map<string, ScryfallSet>();
  for (const set of known) {
    const key = normaliseSetName(set.name);
    if (!exact.has(key)) exact.set(key, set);
  }

  return (name) => {
    const key = normaliseSetName(name);
    const hit = exact.get(key);
    if (hit) return hit;
    const hits = known.filter((set) => {
      const other = normaliseSetName(set.name);
      return other.length > 3 && (key.includes(other) || other.includes(key));
    });
    return hits.length === 1 ? hits[0] : null;
  };
}

export type GoldPerGem = {
  rates: { name: string; gems: number; gold: number; ratio: number }[];
  agrees: boolean;
  value: number | null;
};

/** Gold per gem, and whether the events that price both ways still agree on it. */
export function goldPerGem(
  events: readonly { name: string; gems: number; gold: number }[],
): GoldPerGem {
  const rates = events.map((e) => ({ ...e, ratio: e.gold / e.gems }));
  const distinct = [...new Set(rates.map((r) => r.ratio.toFixed(9)))];
  return { rates, agrees: distinct.length === 1, value: rates[0]?.ratio ?? null };
}
