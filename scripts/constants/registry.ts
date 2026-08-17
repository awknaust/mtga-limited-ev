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
 * Deliberately absent: the constants that are modelling choices rather than
 * sourced figures — the default win rate, matches behind it, events per day,
 * and DEFAULT_COSMETIC_VALUE_GEMS, whose zero is a refusal to invent a number
 * rather than a number. The two generic box constants *are* here: their data
 * is the box-price feed (`scripts/box-prices/`, fetched in full when they are
 * asked for), and the rule that turns it into two numbers is `derive.ts`'s
 * `genericBoxValues` — the app never recomputes them, so this is the one place
 * the rule runs.
 *
 * Mastery *track* data (`src/data/mastery/`) is also not covered: it is
 * presets-like data with its own provenance discipline, reconciliation tests
 * and transcription skill, not a constant.
 */

import {
  DAILY_QUEST,
  DUAL_PRICED_EVENTS,
  GEM_BUNDLES,
  PLAY_IN_ENTRY,
} from "./by-hand.ts";
import {
  BOX_OUTLIER_FACTOR,
  BOX_SAMPLE_SIZE,
  gemsPer10kGold,
  genericBoxValues,
  rareSlotGems,
  representativeMythicRate,
  wildcardShare,
  type GenericBoxValues,
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
const usd = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

/**
 * The generic box values, from the feed at the by-hand gems-per-dollar rate.
 * Two constants come out of this too, and the feed behind it is forty
 * requests, so it is computed once per run.
 */
const boxBasis = (ctx: Context): Promise<GenericBoxValues> =>
  ctx.sources.once("boxBasis", async () =>
    genericBoxValues(await ctx.sources.boxPrices(ctx.now), ctx.now, gemsPerUsd().value),
  );

/**
 * The lines the two box constants share: which sets were averaged and which
 * were set aside, then the paste-ready line for presets.ts.
 */
function explainBoxBasis(basis: GenericBoxValues, kind: "play" | "collector"): string[] {
  const priceOf = (s: GenericBoxValues["sets"][number]) => (kind === "play" ? s.playUsd : s.collectorUsd);
  const medianUsd = kind === "play" ? basis.medians.playUsd : basis.medians.collectorUsd;
  const meanUsd = kind === "play" ? basis.playUsd : basis.collectorUsd;
  const gemsValue = kind === "play" ? basis.playGems : basis.collectorGems;
  const rate = gemsPerUsd().value;
  const lines = [
    `TCGplayer market price of the ${kind} box, via tcgcsv: the newest ${BOX_SAMPLE_SIZE} released,`,
    "  Standard-legal expansions, newest first",
    ...basis.sets.map(
      (s) => `  ${s.code.toUpperCase().padEnd(5)} ${s.releasedAt}  ${usd(priceOf(s)).padStart(10)}  ${s.name}`,
    ),
  ];
  if (basis.outliers.length > 0) {
    lines.push(
      `set aside by the outlier rule (past ${BOX_OUTLIER_FACTOR}x the median of ${usd(medianUsd)} over the newest ${basis.medians.over}):`,
      ...basis.outliers.map(
        (s) => `  ${s.code.toUpperCase().padEnd(5)} ${s.releasedAt}  ${usd(priceOf(s)).padStart(10)}  ${s.name}`,
      ),
    );
  } else {
    lines.push(
      `nothing set aside: none past ${BOX_OUTLIER_FACTOR}x the median of ${usd(medianUsd)} over the newest ${basis.medians.over}`,
    );
  }
  lines.push(
    `mean ${usd(meanUsd)}, at ${rate} gems to the dollar = ${gems(gemsValue)} gems`,
    `for presets.ts: ${kind === "play" ? "PLAY_BOX_USD" : "COLLECTOR_BOX_USD"} = [${basis.sets.map((s) => priceOf(s).toFixed(2)).join(", ")}]`,
    "market, not the listing spread; released sets only; expansions only — a",
    "  named payout is priced from the live table and never sees this figure",
  );
  return lines;
}

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
    name: "GEMS_PER_10K_GOLD",
    summary: "gems 10,000 gold is worth, for valuing a leftover gold balance",
    sources: [],
    compute() {
      const { rates, agrees, value } = gemsPer10kGold(DUAL_PRICED_EVENTS.events);
      if (!agrees || value === null) {
        throw new SourceError(
          "dual-priced events no longer agree on a rate — see by-hand.ts; the model " +
            "needs a per-event rate, not a new constant",
        );
      }
      return {
        value,
        explain: [
          `every event that prices both ways, checked by hand on ${DUAL_PRICED_EVENTS.checkedOn}:`,
          ...rates.map(
            (r) =>
              `  ${r.name.padEnd(18)}${gems(r.gems).padStart(6)} gems / ${gems(r.gold).padStart(7)} gold = ${gems(r.per10k)} per 10,000`,
          ),
          `all ${rates.length} agree, so Arena sets the rate by what it charges: ${gems(value)} gems per 10,000 gold`,
          "stored as the finite reciprocal on purpose — unspent gold being worthless",
          "  is a rate of 0, with no Infinity anywhere in the model",
          "holds only while you have something to spend gold on — gold cannot be",
          "  bought or sold, so this overstates a balance you are sitting on",
        ],
      };
    },
  },

  {
    name: "DEFAULT_PLAY_BOX_VALUE_GEMS",
    summary: "gem value of a Play Booster box that names no set",
    sources: ["boxPrices", "sets"],
    async compute(ctx) {
      const basis = await boxBasis(ctx);
      return { value: basis.playGems, explain: explainBoxBasis(basis, "play") };
    },
  },

  {
    name: "DEFAULT_COLLECTOR_BOX_VALUE_GEMS",
    summary: "gem value of a Collector Booster box that names no set",
    sources: ["boxPrices", "sets"],
    async compute(ctx) {
      const basis = await boxBasis(ctx);
      return { value: basis.collectorGems, explain: explainBoxBasis(basis, "collector") };
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
    name: "DEFAULT_DRAFT_TOKEN_VALUE_GEMS",
    summary: "gem value of one Player Draft token",
    sources: [],
    compute() {
      const premier = DUAL_PRICED_EVENTS.events.find((e) => e.name === "Premier Draft");
      if (!premier) {
        throw new SourceError("by-hand: Premier Draft missing from DUAL_PRICED_EVENTS");
      }
      return {
        value: premier.gems,
        explain: [
          `the token is "redeemable for a Premier or Traditional Draft entry", and both`,
          `  cost ${gems(premier.gems)} gems — checked by hand on ${DUAL_PRICED_EVENTS.checkedOn}`,
          "replacement cost, on the same footing as DEFAULT_PLAY_IN_POINT_VALUE_GEMS:",
          "  it holds only for someone who would have paid for a draft anyway; a free",
          "  entry into a losing proposition is not worth its sticker",
          "in presets.ts this is derived from PREMIER_DRAFT.entryCostGems rather than",
          "  written out, so it follows the ladder data if the entry ever moves",
        ],
      };
    },
  },

  {
    name: "DEFAULT_MYTHIC_ICR_VALUE_GEMS",
    summary: "gem value of one mythic individual card reward",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      return {
        value: rates.mythicDupeGems,
        explain: [
          "the published duplicate-protection figure, unmodified: on a complete",
          `  collection a fifth mythic converts to ${rates.mythicDupeGems} gems`,
          "flat 40 where DEFAULT_PACK_VALUE_GEMS is 22 is not an inconsistency: a",
          "  booster's rare slot is sometimes a wildcard instead, which costs it the",
          "  gems; an ICR is a card award with no slot to lose",
          "a floor rather than a fair value — a mythic you actually want to play is",
          "  worth more than its buyout, and the model cannot know which those are",
        ],
      };
    },
  },

  {
    name: "DEFAULT_RARE_CARD_VALUE_GEMS",
    summary: "gem value of one rare card award",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      return {
        value: rates.rareDupeGems,
        explain: [
          `the published rare buyout: a fifth rare converts to ${rates.rareDupeGems} gems`,
          "  under duplicate protection, on a complete collection",
        ],
      };
    },
  },

  {
    name: "DEFAULT_UNCOMMON_ICR_VALUE_GEMS",
    summary: "gem value of one uncommon ICR — the reward past the mastery cap",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      const upgrade = rates.masteryUncommonUpgradePct / 100;
      const icrRate = rates.icrRareToMythicRate;
      const upgraded =
        ((icrRate - 1) / icrRate) * rates.rareDupeGems +
        (1 / icrRate) * rates.mythicDupeGems;
      const value = upgrade * upgraded;
      return {
        value,
        explain: [
          "an uncommon has no duplicate-protection gem value at all; it feeds vault",
          "  progress, which DEFAULT_PACK_VALUE_GEMS already excludes on purpose",
          `all that is left is the published ${rates.masteryUncommonUpgradePct}% upgrade chance on the mastery`,
          `  track's beyond-cap row, and an upgraded card is the rare/mythic mix at`,
          `  the ICR rate of 1:${icrRate}:`,
          `  ${upgrade} x ((${icrRate - 1}/${icrRate} x ${rates.rareDupeGems}) + (1/${icrRate} x ${rates.mythicDupeGems})) = ${value} gems`,
          "left unrounded, against the Math.round(160/7) precedent: rounding 22.9 to",
          "  23 is a 0.4% error, rounding 1.125 to 1 is 11%, and unlike the pack",
          "  figure this is never a number anyone types into a field",
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
