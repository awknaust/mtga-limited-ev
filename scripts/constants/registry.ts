/**
 * One entry per constant in `src/lib/presets.ts` that is derived from a source
 * rather than chosen.
 *
 * Each entry knows three things: what it is called, how to compute it, and how
 * to justify the answer. Everything the CLI does — selecting a subset, printing
 * a table, explaining a derivation, emitting JSON — is a fold over this list,
 * so adding a constant means adding an entry and nothing else.
 *
 * A `compute` returns `{ value, explain }`. `explain` is built on every run
 * even though only `--verbose` prints it: it costs nothing, and a derivation
 * that is only assembled when asked for is a derivation that rots.
 *
 * Deliberately absent, twice over: the constants that are modelling choices
 * rather than sourced figures — the default win rate, matches behind it, and
 * events per day have no external answer to check against — and the two box
 * constants, whose data comes from the box-price feed (`scripts/box-prices/`)
 * and whose modelling lives in the app (`src/lib/boxPrices.ts`).
 */

import {
  DAILY_QUEST,
  DUAL_PRICED_EVENTS,
  GEM_BUNDLES,
  PLAY_IN_ENTRY,
} from "./by-hand.ts";
import {
  goldPerGem,
  rareSlotGems,
  representativeMythicRate,
  wildcardShare,
  type MythicRateSummary,
} from "./derive.ts";
import { SourceError } from "../shared/http.ts";
import type { SourceKey, Sources } from "./sources.ts";
import type { DropRates } from "./wizards.ts";

export type ConstantValue = number | readonly number[];

export type ConstantResult = {
  value: ConstantValue;
  /** How to print the value, when plain number formatting would mislead. */
  format?: (value: ConstantValue) => string;
  explain: string[];
};

export type Context = { sources: Sources; now: Date };

export type ConstantDef = {
  name: string;
  summary: string;
  sources: SourceKey[];
  compute(ctx: Context): ConstantResult | Promise<ConstantResult>;
};

const gems = (n: number): string => n.toLocaleString("en-US");
const usd = (n: number): string => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** A ratio in lowest terms, so a rate can be shown the way it is written in code. */
function reduce(a: number, b: number): [number, number] {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  const d = gcd(a, b);
  return [a / d, b / d];
}

// --- shared intermediate results -------------------------------------------
// Two constants come out of this, so it is computed once per run.

type PackBasis = {
  rates: DropRates;
  mythic: MythicRateSummary;
  raw: number;
  displaced: number;
  adjusted: number;
};

const packBasis = (ctx: Context): Promise<PackBasis> =>
  ctx.sources.once("packBasis", async () => {
    const rates = await ctx.sources.dropRates();
    const sets = await ctx.sources.sets();
    const mythic = representativeMythicRate(rates.mythicRates, sets, ctx.now);
    const raw = rareSlotGems(rates.rareDupeGems, rates.mythicDupeGems, mythic.rate);
    const displaced = wildcardShare(rates.wildcards);
    return { rates, mythic, raw, displaced, adjusted: raw * (1 - displaced) };
  });

/** Gems per dollar, from the by-hand ladder. */
function gemsPerUsd() {
  const rated = GEM_BUNDLES.rungs.map((r) => ({ ...r, rate: r.gems / r.usd }));
  const best = rated.reduce((a, b) => (b.rate > a.rate ? b : a));
  return { rated, best, value: Math.round(best.rate) };
}

function explainMythicRate(mythic: MythicRateSummary): string[] {
  const lines = [
    `mythic upgrade rate 1:${mythic.rate}, the rate covering the most sets released`,
    `  since ${mythic.window.from} (${mythic.buckets[0].sets.length} of ` +
      `${mythic.buckets.reduce((n, b) => n + b.sets.length, 0)})`,
  ];
  for (const bucket of mythic.buckets) {
    lines.push(
      `    1:${String(bucket.rate).padEnd(4)} ${bucket.sets.map((s) => s.code.toUpperCase()).join(", ")}`,
    );
  }
  if (mythic.tied) lines.push("  ** tie for the modal rate — the tally above decides nothing **");
  if (mythic.digital.length > 0) {
    lines.push(`  ${mythic.digital.length} digital sets skipped: ${mythic.digital.join(", ")}`);
  }
  if (mythic.undated.length > 0) {
    // A jump here means a set has been renamed and may be missing from the
    // tally, so the names are worth reading rather than just counting.
    lines.push(`  ${mythic.undated.length} set names could not be matched:`);
    for (const name of mythic.undated) lines.push(`    ${name}`);
  }
  return lines;
}

// --- the constants ----------------------------------------------------------

export const CONSTANTS: ConstantDef[] = [
  {
    name: "DEFAULT_PACK_VALUE_GEMS",
    summary: "gem value of a booster pack to a complete collection",
    sources: ["dropRates", "sets"],
    async compute(ctx) {
      const { rates, mythic, raw, displaced, adjusted } = await packBasis(ctx);

      // A judgement between two defensible numbers rather than one formula. The
      // raw slot value assumes every rare slot pays out; the adjusted one
      // assumes the wildcards that displace it are worth nothing to a complete
      // collection. Neither is right, and the shipped figure has always been
      // the round number between them.
      const value = Math.round((raw + adjusted) / 2);

      return {
        value,
        explain: [
          `duplicate protection pays ${rates.rareDupeGems} gems for a rare, ${rates.mythicDupeGems} for a mythic`,
          ...explainMythicRate(mythic),
          `rare slot, raw            ${rates.rareDupeGems} + ${rates.mythicDupeGems - rates.rareDupeGems}/${mythic.rate} = ${raw.toFixed(2)} gems`,
          `wildcard displacement     1:${rates.wildcards.rare} rare + 1:${rates.wildcards.mythic} mythic = ${(displaced * 100).toFixed(1)}% of packs`,
          `rare slot, adjusted       ${raw.toFixed(2)} x ${(1 - displaced).toFixed(4)} = ${adjusted.toFixed(2)} gems`,
          `midpoint of the two       ${((raw + adjusted) / 2).toFixed(2)}, rounded to ${value}`,
          "excludes vault progress from commons and uncommons, and bonus sheets,",
          "  which would push it nearer 25 on the sets that have them",
        ],
      };
    },
  },

  {
    name: "DEFAULT_DRAFT_PACK_VALUE_GEMS",
    summary: "gem value of one pack's worth of drafted cards",
    sources: ["dropRates", "sets"],
    async compute(ctx) {
      const { rates, mythic, raw } = await packBasis(ctx);
      return {
        value: Math.round(raw),
        explain: [
          "valued as a booster's rare slot, since that is where nearly all of it sits",
          ...explainMythicRate(mythic),
          `rare slot, raw            ${rates.rareDupeGems} + ${rates.mythicDupeGems - rates.rareDupeGems}/${mythic.rate} = ${raw.toFixed(2)} gems`,
          "no wildcard adjustment: a booster sometimes pays a wildcard in place of",
          "  the rare, whereas drafted cards have no such slot — which is why this",
          "  sits slightly above DEFAULT_PACK_VALUE_GEMS",
        ],
      };
    },
  },

  {
    name: "GEMS_PER_USD",
    summary: "gems per dollar, for pricing physical prizes",
    sources: [],
    compute() {
      const { rated, best, value } = gemsPerUsd();
      return {
        value,
        explain: [
          `the best rate on the store ladder, checked by hand on ${GEM_BUNDLES.checkedOn}:`,
          ...rated.map(
            (r) =>
              `  ${gems(r.gems).padStart(6)} gems  ${usd(r.usd).padStart(8)}  ${r.rate.toFixed(2)} gems/$` +
              (r === best ? "  <- best" : ""),
          ),
          "the best rate is not the largest bundle — the top two are the same to within",
          "  a rounding error and the larger is fractionally worse, so buying past",
          `  ${usd(best.usd)} stops paying`,
          "taking the best rate is the conservative way to value a physical prize: it",
          "  assumes the cheapest gems you could have bought instead",
        ],
      };
    },
  },

  {
    name: "GOLD_PER_GEM",
    summary: "gold per gem, for valuing a leftover gold balance",
    sources: [],
    compute() {
      const { rates, agrees, value } = goldPerGem(DUAL_PRICED_EVENTS.events);
      if (!agrees || value === null) {
        throw new SourceError(
          "dual-priced events no longer agree on a rate — see by-hand.ts; the model " +
            "needs a per-event rate, not a new constant",
        );
      }
      // Shown as the ratio the constant is actually written as. The decimal is
      // 6.666..., and no rounding of it is a value anyone should paste.
      const [gold, gem] = reduce(rates[0].gold, rates[0].gems);

      return {
        value,
        format: () => `${gold} / ${gem}`,
        explain: [
          `every event that prices both ways, checked by hand on ${DUAL_PRICED_EVENTS.checkedOn}:`,
          ...rates.map(
            (r) =>
              `  ${r.name.padEnd(18)}${gems(r.gold).padStart(7)} gold / ${gems(r.gems).padStart(5)} gems = ${r.ratio.toFixed(4)}`,
          ),
          `all ${rates.length} agree, so Arena sets the rate by what it charges: ${value.toFixed(4)}, or ${gold}/${gem}`,
          "holds only while you have something to spend gold on — gold cannot be",
          "  bought or sold, so this overstates a balance you are sitting on",
        ],
      };
    },
  },

  {
    name: "DAILY_WIN_GOLD",
    summary: "gold paid at each daily win, first through last",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      const gold = rates.dailyWinGold;
      const total = gold.reduce((a, b) => a + b, 0);
      return {
        value: gold,
        format: (v) => `[${(v as readonly number[]).join(", ")}]`,
        explain: [
          `read straight off the daily win table: ${gold.length} wins, ${total} gold in total`,
          `it front-loads hard — the first win alone is ${((gold[0] / total) * 100).toFixed(0)}% of the day`,
          "which is why gold is not a flat daily figure: what one event generates is",
          "  closer to its own few wins than to the full day's total",
          `a ${gold.length + 1}th win pays nothing`,
        ],
      };
    },
  },

  {
    name: "DEFAULT_PLAY_IN_POINT_VALUE_GEMS",
    summary: "gem value of one play-in point",
    sources: [],
    compute() {
      const { pointsPerEntry, gemsPerEntry } = PLAY_IN_ENTRY;
      return {
        value: Math.round(gemsPerEntry / pointsPerEntry),
        explain: [
          `priced off what the points are for, checked by hand on ${PLAY_IN_ENTRY.checkedOn}:`,
          `  ${pointsPerEntry} points buy an Arena Open play-in, which otherwise costs ${gems(gemsPerEntry)} gems`,
          `  ${gems(gemsPerEntry)} / ${pointsPerEntry} = ${Math.round(gemsPerEntry / pointsPerEntry)} gems a point`,
          "a replacement cost, not a market one: it holds only if you would have",
          "  entered the Open anyway, and points beyond a multiple of the entry are",
          "  stranded until you collect enough to redeem",
        ],
      };
    },
  },

  {
    name: "DEFAULT_OTHER_GOLD_PER_DAY",
    summary: "gold a day from everything other than the event's wins",
    sources: [],
    compute() {
      return {
        value: DAILY_QUEST.gold,
        explain: [
          `a daily quest, checked by hand on ${DAILY_QUEST.checkedOn}`,
          `  pays ${DAILY_QUEST.range[0]}–${DAILY_QUEST.range[1]} depending on which you draw, so ${DAILY_QUEST.gold} is the middle`,
          "this makes the field a budget rather than an attribution: what a day of",
          "  playing puts toward entries, whoever earned it. The strict reading is 0,",
          "  because a quest pays whether or not you draft.",
          "not neutral between events — a flat daily credit covers twice as much of a",
          "  5,000 gold entry as a 10,000 one, so it moves where the two cross",
        ],
      };
    },
  },
];

/**
 * The entries the user asked for, in registry order.
 *
 * Matching is case-insensitive but otherwise exact. A near miss is an error
 * naming the alternatives rather than a guess, because silently checking a
 * different constant than the one asked for is worse than not running.
 */
export function selectConstants(names: string[]): ConstantDef[] {
  if (names.length === 0) return CONSTANTS;

  const byKey = new Map(CONSTANTS.map((c) => [c.name.toLowerCase(), c]));
  const chosen = new Set<ConstantDef>();
  const unknown: string[] = [];
  for (const name of names) {
    const found = byKey.get(name.toLowerCase());
    if (found) chosen.add(found);
    else unknown.push(name);
  }
  if (unknown.length > 0) {
    throw new UnknownConstantError(
      unknown,
      CONSTANTS.map((c) => c.name),
    );
  }
  return CONSTANTS.filter((c) => chosen.has(c));
}

export class UnknownConstantError extends Error {
  override name = "UnknownConstantError";
  constructor(unknown: string[], known: string[]) {
    super(`Unknown constant: ${unknown.join(", ")}\nKnown constants:\n  ${known.join("\n  ")}`);
  }
}
