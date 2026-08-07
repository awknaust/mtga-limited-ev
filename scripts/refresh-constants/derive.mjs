/**
 * The arithmetic, and the judgement calls that go with it.
 *
 * Pure: everything here takes parsed data and returns numbers. Which constant
 * uses which derivation is `registry.mjs`; where the data came from is
 * `sources.mjs`.
 */

import { SourceError } from "./errors.mjs";
import { normaliseSetName } from "./html.mjs";

/** How many sets feed the box averages. Three is what the constants were built on. */
export const BOX_SAMPLE_SIZE = 3;

/**
 * How far back a set still counts as recent, for picking the mythic rate.
 *
 * Two years covers roughly the Standard rotation, so the answer tracks what
 * someone drafting now actually opens.
 */
export const RECENT_SET_MONTHS = 24;

/**
 * A box is dropped from the average when its price exceeds this multiple of the
 * candidate pool's median.
 *
 * This is the rule that excluded Final Fantasy by hand — at $2,399 a collector
 * box it roughly doubled the collector average on its own. Encoding it as a
 * ratio rather than a name means the next Final Fantasy is caught too.
 */
export const OUTLIER_FACTOR = 2;
const OUTLIER_POOL_SIZE = 8;

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function median(xs) {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Local calendar date, so the report agrees with the clock on the wall. */
export const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * What one rare slot is worth to a complete collection.
 *
 * Once you hold playsets of every rare and mythic, the slot pays gems instead
 * of a card. It is a rare unless it upgrades, and it upgrades about once every
 * `packsPerMythic` packs.
 */
export const rareSlotGems = (rareDupeGems, mythicDupeGems, packsPerMythic) =>
  rareDupeGems + (mythicDupeGems - rareDupeGems) / packsPerMythic;

/**
 * How often the rare slot pays a wildcard rather than a card or gems.
 *
 * Both a rare and a mythic wildcard can displace it, so the two rates add.
 */
export const wildcardShare = (wildcards) => 1 / wildcards.rare + 1 / wildcards.mythic;

/**
 * Which mythic upgrade rate to treat as today's.
 *
 * Wizards lists a rate per set and the spread is real — 1:5.8 to 1:8.4 among
 * sets released in the last two years. The representative figure is the one
 * covering the most of those sets, which is a mode rather than an average
 * because Wizards sets these per set rather than sampling a distribution. Ties
 * go to the rate covering the newest set.
 */
export function representativeMythicRate(mythicRates, setsByCode, now) {
  const resolve = setResolver(setsByCode);

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RECENT_SET_MONTHS);
  const from = isoDate(cutoff);
  const to = isoDate(now);

  const tally = new Map();
  const undated = [];
  const digital = [];
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
      if (set.releasedAt < from || set.releasedAt > to) continue;
      const bucket = tally.get(rate) ?? { rate, sets: [] };
      if (!bucket.sets.some((s) => s.code === set.code)) bucket.sets.push(set);
      tally.set(rate, bucket);
    }
  }

  const newest = (bucket) => Math.max(...bucket.sets.map((s) => Date.parse(s.releasedAt)));
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
 * Matches a set name written by one source to a set known to another.
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
function setResolver(setsByCode) {
  const known = [...setsByCode.values()].filter((s) => s.releasedAt);
  const exact = new Map();
  for (const set of known) {
    const key = normaliseSetName(set.name);
    if (!exact.has(key)) exact.set(key, set);
  }

  return (name) => {
    const key = normaliseSetName(name);
    if (exact.has(key)) return exact.get(key);
    const hits = known.filter((set) => {
      const other = normaliseSetName(set.name);
      return other.length > 3 && (key.includes(other) || other.includes(key));
    });
    return hits.length === 1 ? hits[0] : null;
  };
}

/**
 * The sets whose box prices feed the averages: released, physical, Standard
 * legal, newest first, outliers set aside.
 *
 * "Standard legal" is `set_type === "expansion"`, which is also what keeps
 * Modern Horizons and the Remastered sets out. Taking the newest few keeps them
 * in rotation without needing a rotation calendar. A set whose release date is
 * still ahead is a preorder, and its price is a guess.
 */
export function chooseBoxSets(priceRows, setsByCode, now) {
  const today = isoDate(now);

  const merged = new Map();
  for (const row of priceRows) {
    const entry = merged.get(row.code) ?? { code: row.code };
    entry[row.kind] = row.usd;
    merged.set(row.code, entry);
  }

  const candidates = [];
  for (const entry of merged.values()) {
    if (entry.play == null || entry.collector == null) continue;
    const set = setsByCode.get(entry.code);
    if (!set?.releasedAt) continue;
    if (set.digital || set.setType !== "expansion") continue;
    if (set.releasedAt > today) continue;
    candidates.push({ ...entry, name: set.name, releasedAt: set.releasedAt });
  }
  candidates.sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1));

  const pool = candidates.slice(0, OUTLIER_POOL_SIZE);
  if (pool.length === 0) throw new SourceError("mtggoldfish: no released set has both box types");
  const limits = {
    play: median(pool.map((c) => c.play)) * OUTLIER_FACTOR,
    collector: median(pool.map((c) => c.collector)) * OUTLIER_FACTOR,
  };

  const used = [];
  const dropped = [];
  for (const candidate of candidates) {
    if (used.length === BOX_SAMPLE_SIZE) break;
    const over = ["play", "collector"].filter((kind) => candidate[kind] > limits[kind]);
    if (over.length > 0) dropped.push({ ...candidate, over });
    else used.push(candidate);
  }
  if (used.length < BOX_SAMPLE_SIZE) {
    throw new SourceError(
      `mtggoldfish: only ${used.length} usable set(s), need ${BOX_SAMPLE_SIZE}`,
    );
  }

  return { used, dropped, limits };
}

/** Gold per gem, and whether the events that price both ways still agree on it. */
export function goldPerGem(events) {
  const rates = events.map((e) => ({ ...e, ratio: e.gold / e.gems }));
  const distinct = [...new Set(rates.map((r) => r.ratio.toFixed(9)))];
  return { rates, agrees: distinct.length === 1, value: rates[0]?.ratio ?? null };
}
