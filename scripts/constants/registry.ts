/**
 * One entry per constant in `src/lib/presets.ts` that stands behind a field of
 * the app's Values & assumptions dialog, plus the few model constants beside
 * them (the daily win ladder, the dollar rate).
 *
 * Each entry knows three things: what it is called, how to compute it, and how
 * to justify the answer. Everything the CLI does — selecting a subset, printing
 * a table, explaining a derivation, emitting JSON — is a fold over this list,
 * so adding a constant means adding an entry and nothing else.
 *
 * A `compute` returns `{ value, explain }`. `explain` is built on every run
 * even though only `--verbose` prints it: it costs nothing, and a derivation
 * that is only assembled when asked for is a derivation that rots. It is the
 * derivation and nothing else — the inputs, the source and its date, the
 * arithmetic, what was left out — with no caveats, comparisons or advice.
 * What a figure means, and how far to trust it, is the doc comment on the
 * constant in `presets.ts`; this prints how the number was arrived at.
 *
 * The list is the dialog's inventory, and it is complete by construction:
 * `ConstantName` is every numeric export of `src/lib/presets.ts` and
 * `src/lib/boxes.ts`, read at the type level and nowhere else, and `REGISTRY`
 * must satisfy `Record<ConstantName, ConstantDef>` — so a default added to
 * the app without an entry here, or an entry whose name matches no export,
 * fails `tsc -p scripts` (which `npm run build` runs) rather than quietly
 * going unlisted. The import is `import type` on purpose and must stay so:
 * this tool never executes app code and never learns a constant's current
 * value, which is why it has no exit code for "a number moved". `explain` is
 * a non-empty tuple for the same reason — an entry cannot be typed without a
 * derivation — and `asOf` is required for the same reason again: a value has
 * to say what date its inputs were read on, or that it has none.
 *
 * Most entries are sourced — Wizards' drop-rates page, Scryfall, the
 * box-price feed — or read off the client and recorded with a date in
 * `by-hand.ts`. Six are neither: DEFAULT_WIN_RATE_MATCHES,
 * DEFAULT_GAMES_PER_DAY and BO3_GAMES_PER_MATCH are modelling choices about
 * the reader and the format, and DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS,
 * DEFAULT_COSMETIC_VALUE_GEMS and DEFAULT_DAILY_WIN_ICR_VALUE_GEMS are zeros
 * that refuse to invent a number rather than numbers — the last of those
 * refusing for want of a source rather than for want of arithmetic, and its
 * derivation prints the figure it would otherwise be. Those six have nothing
 * to fetch, so their `compute` returns the figure with the reasoning and no
 * source, and they are here so the inventory has no holes — not because
 * running this can move them.
 *
 * The two generic box constants are the heavy ones: their data is the
 * box-price feed (`scripts/box-prices/`, fetched in full when they are asked
 * for), and the rule that turns it into two numbers is `derive.ts`'s
 * `genericBoxValues` — the app never recomputes them, so this is the one place
 * the rule runs.
 *
 * Not covered, and not gaps: the win-rate slider and the Bankroll card's
 * balances, which sit outside the dialog and are starting points rather than
 * assumptions; the simulation's run count and seed, which are controls; the
 * fun field, which is inert by decision; and mastery *track* data
 * (`src/data/mastery/`), which is presets-like data with its own provenance
 * discipline, reconciliation tests and transcription skill, not a constant.
 */

import {
  DAILY_QUEST,
  DAILY_WIN_ICR_UPGRADE,
  DUAL_PRICED_EVENTS,
  GEM_BUNDLES,
  PLAY_IN_ENTRY,
} from "./by-hand.ts";
import {
  BOX_OUTLIER_FACTOR,
  BOX_SAMPLE_SIZE,
  cubePackGems,
  gemsPer10kGold,
  genericBoxValues,
  mythicSlotGems,
  rareSlotGems,
  representativeMythicRate,
  wildcardShare,
  type GenericBoxValues,
  type MythicRateSummary,
} from "./derive.ts";
import { isoDate } from "../shared/dates.ts";
import { SourceError } from "../shared/http.ts";
import type { SourceKey, Sources } from "./sources.ts";
import type { DropRates } from "./wizards.ts";
// Types only — see the header. Nothing from the app runs here, and nothing
// here can read a constant's value; what crosses is the list of names.
import type * as boxes from "../../src/lib/boxes.ts";
import type * as presets from "../../src/lib/presets.ts";

export type ConstantValue = number | readonly number[];

/**
 * The exports of a module whose value is a constant in this tool's sense — a
 * number, or a list of them like DAILY_WIN_GOLD. Functions, strings, presets
 * and tables fall out.
 */
type NumericExports<M> = { [K in keyof M]-?: M[K] extends ConstantValue ? K : never }[keyof M];

/**
 * Every constant this tool must account for: what `presets.ts` and `boxes.ts`
 * export as a number. Adding one there and not here is a type error.
 */
export type ConstantName = NumericExports<typeof presets> | NumericExports<typeof boxes>;

/** A derivation, one line per row of `--verbose`. Never empty, by type. */
export type Explanation = [string, ...string[]];

export type ConstantResult = {
  value: ConstantValue;
  /** How to print the value, when plain number formatting would mislead. */
  format?: (value: ConstantValue) => string;
  /**
   * The date the value's inputs were read, ISO `YYYY-MM-DD`: the run date for
   * a fetched source, the by-hand record's `checkedOn` for a figure read off
   * the client, the date a choice was last made where one is recorded, and
   * `null` where nothing dates the value. Where an entry mixes the two, the
   * date of the input that sets the value.
   */
  asOf: string | null;
  explain: Explanation;
};

export type Context = { sources: Sources; now: Date };

/** The `asOf` of anything fetched in this run. */
const fetchedOn = (ctx: Context): string => isoDate(ctx.now);

export type ConstantDef = {
  summary: string;
  sources: SourceKey[];
  compute(ctx: Context): ConstantResult | Promise<ConstantResult>;
};

/** An entry with the key it was registered under, which is what the CLI folds over. */
export type NamedConstantDef = ConstantDef & { name: ConstantName };

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
function explainBoxBasis(basis: GenericBoxValues, kind: "play" | "collector"): Explanation {
  const priceOf = (s: GenericBoxValues["sets"][number]) => (kind === "play" ? s.playUsd : s.collectorUsd);
  const medianUsd = kind === "play" ? basis.medians.playUsd : basis.medians.collectorUsd;
  const meanUsd = kind === "play" ? basis.playUsd : basis.collectorUsd;
  const gemsValue = kind === "play" ? basis.playGems : basis.collectorGems;
  const rate = gemsPerUsd().value;
  const lines: Explanation = [
    `TCGplayer market price of the ${kind} box (via tcgcsv), the newest ${BOX_SAMPLE_SIZE} released Standard-legal expansions:`,
    ...basis.sets.map(
      (s) => `  ${s.code.toUpperCase().padEnd(5)} ${s.releasedAt}  ${usd(priceOf(s)).padStart(10)}  ${s.name}`,
    ),
  ];
  if (basis.outliers.length > 0) {
    lines.push(
      `set aside, past ${BOX_OUTLIER_FACTOR}x the median of ${usd(medianUsd)} over the newest ${basis.medians.over}:`,
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
    `mean ${usd(meanUsd)} x ${rate} gems/$ = ${gems(gemsValue)} gems`,
    `for presets.ts: ${kind === "play" ? "PLAY_BOX_USD" : "COLLECTOR_BOX_USD"} = [${basis.sets.map((s) => priceOf(s).toFixed(2)).join(", ")}]`,
  );
  return lines;
}

/** Gems per dollar, from the by-hand ladder. */
function gemsPerUsd() {
  const rated = GEM_BUNDLES.rungs.map((r) => ({ ...r, rate: r.gems / r.usd }));
  const best = rated.reduce((a, b) => (b.rate > a.rate ? b : a));
  return { rated, best, value: Math.round(best.rate) };
}

function explainMythicRate(mythic: MythicRateSummary): Explanation {
  const lines: Explanation = [
    `mythic upgrade rate 1:${mythic.rate} — the rate covering the most sets released since ` +
      `${mythic.window.from} (${mythic.buckets[0].sets.length} of ` +
      `${mythic.buckets.reduce((n, b) => n + b.sets.length, 0)}):`,
  ];
  for (const bucket of mythic.buckets) {
    lines.push(
      `    1:${String(bucket.rate).padEnd(4)} ${bucket.sets.map((s) => s.code.toUpperCase()).join(", ")}`,
    );
  }
  if (mythic.tied) lines.push("  ** tie for the modal rate **");
  if (mythic.digital.length > 0) {
    lines.push(`  ${mythic.digital.length} digital sets skipped: ${mythic.digital.join(", ")}`);
  }
  if (mythic.undated.length > 0) {
    // A jump here means a set has been renamed and may be missing from the
    // tally, so the names are worth reading rather than just counting.
    lines.push(`  ${mythic.undated.length} set names not matched to Scryfall, left out of the tally:`);
    for (const name of mythic.undated) lines.push(`    ${name}`);
  }
  return lines;
}

// --- the constants ----------------------------------------------------------

/**
 * Keyed by constant name and checked against `ConstantName` both ways: a key
 * that is not a numeric export is an excess property, a numeric export with
 * no key is a missing one. Declaration order is output order.
 */
export const REGISTRY = {
  DEFAULT_PACK_VALUE_GEMS: {
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
        asOf: fetchedOn(ctx),
        explain: [
          `duplicate protection pays ${rates.rareDupeGems} gems for a rare, ${rates.mythicDupeGems} for a mythic`,
          ...explainMythicRate(mythic),
          `rare slot, raw            ${rates.rareDupeGems} + ${rates.mythicDupeGems - rates.rareDupeGems}/${mythic.rate} = ${raw.toFixed(2)} gems`,
          `wildcard displacement     1:${rates.wildcards.rare} rare + 1:${rates.wildcards.mythic} mythic = ${(displaced * 100).toFixed(1)}% of packs`,
          `rare slot, adjusted       ${raw.toFixed(2)} x ${(1 - displaced).toFixed(4)} = ${adjusted.toFixed(2)} gems`,
          `midpoint of the two       ${((raw + adjusted) / 2).toFixed(2)}, rounded to ${value}`,
          "commons and uncommons (vault progress) and bonus sheets not counted",
        ],
      };
    },
  },

  DEFAULT_MYTHIC_PACK_VALUE_GEMS: {
    summary: "gem value of one mythic pack to a complete collection",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      const displaced = wildcardShare(rates.wildcards);
      const exact = mythicSlotGems(rates.mythicDupeGems, rates.wildcards);
      const rareOnly = rates.mythicDupeGems * (1 - 1 / rates.wildcards.rare);
      return {
        value: Math.round(exact),
        asOf: fetchedOn(ctx),
        explain: [
          `the rare slot always holds a mythic: ${rates.mythicDupeGems} gems under duplicate protection`,
          `wildcard displacement     1:${rates.wildcards.rare} rare + 1:${rates.wildcards.mythic} mythic = ${(displaced * 100).toFixed(1)}% of packs, as for an ordinary pack`,
          `mythic slot, adjusted     ${rates.mythicDupeGems} x ${(1 - displaced).toFixed(4)} = ${exact.toFixed(2)} gems, rounded to ${Math.round(exact)}`,
          `the page names only "${rates.mythicBoosterDisplacedBy}" as displacing it; deducting the rare rate alone gives ${rareOnly.toFixed(2)}, rounded to ${Math.round(rareOnly)}`,
          "commons and uncommons (vault progress) and bonus sheets not counted; the displaced wildcard at nothing",
        ],
      };
    },
  },

  DEFAULT_CUBE_PACK_VALUE_GEMS: {
    summary: "gem value of one Cube Prize Pack to a complete collection",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      const pack = rates.cubePrizePack;
      const parts = cubePackGems(rates.rareDupeGems, rates.mythicDupeGems, pack);
      const rare = rates.rareDupeGems;
      const mythic = rates.mythicDupeGems;
      const flexUncounted = pack.flex.timelessUncommonPct + pack.flex.bonusSheetPct;
      const explain: Explanation = [
        "summed slot by slot at the duplicate-protection buyouts; commons and uncommons at nothing",
        `Timeless rare slot        ${rare} + ${mythic - rare}/${pack.timelessMythicRate} = ${parts.timeless.toFixed(2)} gems  (mythic ~1:${pack.timelessMythicRate})`,
        `bonus sheet rare slot     ${rare} + ${mythic - rare}/${pack.bonusSheetMythicRate} = ${parts.bonusSheet.toFixed(2)} gems  (mythic ~1:${pack.bonusSheetMythicRate})`,
        `flex slot, rare part      ${pack.flex.timelessRarePct}% x ${rare} = ${parts.flexRare.toFixed(2)} gems  (Timeless rare ${pack.flex.timelessRarePct}%, no upgrade named)`,
        `flex slot, the rest       ${flexUncounted}% at nothing: uncommon ${pack.flex.timelessUncommonPct}%, a bonus sheet card ${pack.flex.bonusSheetPct}%`,
        `sum                       ${parts.total.toFixed(2)}, rounded to ${Math.round(parts.total)}`,
        "no wildcard displacement deducted: whether these packs feed the wildcard tracks is not published",
      ];
      if (pack.bonusSheet) {
        explain.push(
          "the bonus sheet as the page lists it, not counted above (names contain commas):",
          ...pack.bonusSheet.map((line) => `  ${line.rarity}: ${line.cards}`),
        );
      } else {
        explain.push("the page lists no bonus sheet contents");
      }
      return { value: Math.round(parts.total), asOf: fetchedOn(ctx), explain };
    },
  },

  DEFAULT_DRAFT_PACK_VALUE_GEMS: {
    summary: "gem value of one pack's worth of drafted cards",
    sources: ["dropRates", "sets"],
    async compute(ctx) {
      const { rates, mythic, raw } = await packBasis(ctx);
      return {
        value: Math.round(raw),
        asOf: fetchedOn(ctx),
        explain: [
          "valued as a booster's rare slot",
          ...explainMythicRate(mythic),
          `rare slot, raw            ${rates.rareDupeGems} + ${rates.mythicDupeGems - rates.rareDupeGems}/${mythic.rate} = ${raw.toFixed(2)} gems, rounded to ${Math.round(raw)}`,
          "no wildcard adjustment: drafted cards have no wildcard slot",
        ],
      };
    },
  },

  GEMS_PER_USD: {
    summary: "gems per dollar, for pricing physical prizes",
    sources: [],
    compute() {
      const { rated, best, value } = gemsPerUsd();
      return {
        value,
        asOf: GEM_BUNDLES.checkedOn,
        explain: [
          "the best rate on the store's gem ladder, checked by hand:",
          ...rated.map(
            (r) =>
              `  ${gems(r.gems).padStart(6)} gems  ${usd(r.usd).padStart(8)}  ${r.rate.toFixed(2)} gems/$` +
              (r === best ? "  <- best" : ""),
          ),
          `${best.rate.toFixed(2)}, rounded to ${value}`,
        ],
      };
    },
  },

  GEMS_PER_10K_GOLD: {
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
        asOf: DUAL_PRICED_EVENTS.checkedOn,
        explain: [
          "every event priced in both currencies, checked by hand:",
          ...rates.map(
            (r) =>
              `  ${r.name.padEnd(18)}${gems(r.gems).padStart(6)} gems / ${gems(r.gold).padStart(7)} gold = ${gems(r.per10k)} per 10,000`,
          ),
          `all ${rates.length} agree: ${gems(value)} gems per 10,000 gold`,
        ],
      };
    },
  },

  DEFAULT_PLAY_BOX_VALUE_GEMS: {
    summary: "gem value of a Play Booster box that names no set",
    sources: ["boxPrices", "sets"],
    async compute(ctx) {
      const basis = await boxBasis(ctx);
      return { value: basis.playGems, asOf: fetchedOn(ctx), explain: explainBoxBasis(basis, "play") };
    },
  },

  DEFAULT_COLLECTOR_BOX_VALUE_GEMS: {
    summary: "gem value of a Collector Booster box that names no set",
    sources: ["boxPrices", "sets"],
    async compute(ctx) {
      const basis = await boxBasis(ctx);
      return {
        value: basis.collectorGems,
        asOf: fetchedOn(ctx),
        explain: explainBoxBasis(basis, "collector"),
      };
    },
  },

  DAILY_WIN_GOLD: {
    summary: "gold paid at each daily win, first through last",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      const gold = rates.dailyWinGold;
      const total = gold.reduce((a, b) => a + b, 0);
      return {
        value: gold,
        format: (v) => `[${(v as readonly number[]).join(", ")}]`,
        asOf: fetchedOn(ctx),
        explain: [`the gold column of the daily win table: ${gold.length} wins, ${total} gold in total`],
      };
    },
  },

  DAILY_WIN_ICR: {
    summary: "individual card rewards at each daily win, first through last",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      const icr = rates.dailyWinIcr;
      const total = icr.reduce((a, b) => a + b, 0);
      const at = icr.flatMap((n, i) => (n > 0 ? [i + 1] : []));
      return {
        value: icr,
        format: (v) => `[${(v as readonly number[]).join(", ")}]`,
        asOf: fetchedOn(ctx),
        explain: [
          `the ICR column of the daily win table: ${total} cards across ${icr.length} wins`,
          `paid at wins             ${at.join(", ") || "none"}`,
          `the gold column pays     ${rates.dailyWinGold.filter((g) => g > 0).length} of those ${icr.length} wins, so the two columns interleave`,
        ],
      };
    },
  },

  DAILY_WIN_CAP: {
    summary: "wins after which the daily ladder pays nothing more",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      return {
        value: rates.dailyWinGold.length,
        asOf: fetchedOn(ctx),
        explain: [`the length of DAILY_WIN_GOLD: ${rates.dailyWinGold.length} rows in the daily win table`],
      };
    },
  },

  DEFAULT_DRAFT_TOKEN_VALUE_GEMS: {
    summary: "gem value of one Player Draft token",
    sources: [],
    compute() {
      const premier = DUAL_PRICED_EVENTS.events.find((e) => e.name === "Premier Draft");
      if (!premier) {
        throw new SourceError("by-hand: Premier Draft missing from DUAL_PRICED_EVENTS");
      }
      return {
        value: premier.gems,
        asOf: DUAL_PRICED_EVENTS.checkedOn,
        explain: [
          `redeemable for a Premier or Traditional Draft entry; both cost ${gems(premier.gems)} gems, checked by hand`,
        ],
      };
    },
  },

  DEFAULT_MYTHIC_ICR_VALUE_GEMS: {
    summary: "gem value of one mythic individual card reward",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      return {
        value: rates.mythicDupeGems,
        asOf: fetchedOn(ctx),
        explain: [`the published duplicate-protection figure: a fifth mythic converts to ${rates.mythicDupeGems} gems`],
      };
    },
  },

  DEFAULT_RARE_CARD_VALUE_GEMS: {
    summary: "gem value of one rare card award",
    sources: ["dropRates"],
    async compute(ctx) {
      const rates = await ctx.sources.dropRates();
      return {
        value: rates.rareDupeGems,
        asOf: fetchedOn(ctx),
        explain: [`the published duplicate-protection figure: a fifth rare converts to ${rates.rareDupeGems} gems`],
      };
    },
  },

  DEFAULT_UNCOMMON_ICR_VALUE_GEMS: {
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
        asOf: fetchedOn(ctx),
        explain: [
          "an uncommon has no duplicate-protection value; only its upgrade chance counts",
          `upgrade chance            ${rates.masteryUncommonUpgradePct}%, the mastery track's beyond-cap row`,
          `upgraded card             the rare/mythic mix at the ICR rate of 1:${icrRate}`,
          `${upgrade} x ((${icrRate - 1}/${icrRate} x ${rates.rareDupeGems}) + (1/${icrRate} x ${rates.mythicDupeGems})) = ${value} gems, left unrounded`,
        ],
      };
    },
  },

  DEFAULT_DAILY_WIN_ICR_VALUE_GEMS: {
    summary: "gem value of one daily-win ICR — zero by refusal",
    sources: [],
    compute() {
      /*
       * The one refusal here that is not for want of a figure. The others
       * price things nothing converts to; this one has arithmetic and is
       * missing a primary reading of the rate underneath it, which is a
       * different thing to be honest about — so the derivation prints the
       * figure it would be, and the value stays at nothing until someone can
       * open the page.
       */
      const upgradeRate = DAILY_WIN_ICR_UPGRADE.rareUpgradeRate;
      return {
        value: 0,
        asOf: null,
        explain: [
          "zero by refusal: the cards are counted, and what one is worth rests on an upgrade rate",
          "  no one here has read from Wizards' page — see DAILY_WIN_ICR_UPGRADE in by-hand.ts",
          `at 1:${upgradeRate} to a rare, and a rare that is a mythic 1:8, one card would be`,
          `  ${1 / upgradeRate} x ((7/8 x 20) + (1/8 x 40)) = ${(1 / upgradeRate) * ((7 / 8) * 20 + (1 / 8) * 40)} gems`,
        ],
      };
    },
  },

  DEFAULT_PLAY_IN_POINT_VALUE_GEMS: {
    summary: "gem value of one play-in point",
    sources: [],
    compute() {
      const { pointsPerEntry, gemsPerEntry, goldPerEntry } = PLAY_IN_ENTRY;
      const value = Math.round(gemsPerEntry / pointsPerEntry);
      const explain: Explanation = [
        `${pointsPerEntry} points buy a Qualifier Play-In, which otherwise costs ${gems(gemsPerEntry)} gems, checked by hand`,
        `${gems(gemsPerEntry)} / ${pointsPerEntry} = ${value} gems a point, at the gem door`,
      ];
      // The gold door too, when the dual-priced events still agree on a rate
      // to convert it at.
      const gold = gemsPer10kGold(DUAL_PRICED_EVENTS.events);
      if (gold.agrees && gold.value !== null) {
        const goldAsGems = (goldPerEntry / 10_000) * gold.value;
        explain.push(
          `the gold door is ${gems(goldPerEntry)}: at ${gems(gold.value)} per 10,000 that is ${gems(goldAsGems)} gems, or ${Math.round(goldAsGems / pointsPerEntry)} a point`,
        );
      }
      return { value, asOf: PLAY_IN_ENTRY.checkedOn, explain };
    },
  },

  DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS: {
    summary: "gem value of one Qualifier Weekend token — zero by refusal",
    sources: [],
    compute() {
      return {
        value: 0,
        asOf: null,
        explain: ["zero: a token is not sold, not bought, and converts to nothing Arena pays out"],
      };
    },
  },

  DEFAULT_COSMETIC_VALUE_GEMS: {
    summary: "gem value of an orb, style, sleeve, avatar or companion — zero by refusal",
    sources: [],
    compute() {
      return {
        value: 0,
        asOf: null,
        explain: [
          "zero, behind the orb, card style, sleeve, avatar and companion fields: none has a gem price,",
          "  a duplicate-protection value or any other conversion Arena performs",
        ],
      };
    },
  },

  DEFAULT_OTHER_GOLD_PER_DAY: {
    summary: "gold a day from everything other than the event's wins",
    sources: [],
    compute() {
      return {
        value: DAILY_QUEST.gold,
        asOf: DAILY_QUEST.checkedOn,
        explain: [
          `one daily quest, checked by hand: pays ${DAILY_QUEST.range[0]}–${DAILY_QUEST.range[1]} depending on the quest drawn; ${DAILY_QUEST.gold} is the middle`,
        ],
      };
    },
  },

  DEFAULT_GAMES_PER_DAY: {
    summary: "games played a day — a modelling choice",
    sources: [],
    compute() {
      return {
        value: 12,
        asOf: "2026-08-19",
        explain: [
          "a modelling choice, not derived from any source: a game runs about ten minutes, so twelve is",
          "  roughly two hours of play — about two best-of-one drafts' worth, which is what the",
          "  two-events-a-day default it replaces said",
        ],
      };
    },
  },

  BO3_GAMES_PER_MATCH: {
    summary: "games a best-of-three match is counted as — a modelling choice",
    sources: [],
    compute() {
      return {
        value: 2.5,
        asOf: null,
        explain: [
          "a modelling choice, not derived from any source: a match runs two or three games and 2.5 is the",
          "  midpoint; independent games at rate g would say 2 + 2g(1 − g), which is 2.5 at an even rate,",
          "  and sideboarding is why no per-rate figure is derived",
        ],
      };
    },
  },

  DEFAULT_WIN_RATE_MATCHES: {
    summary: "matches the default win rate rests on — a modelling choice",
    sources: [],
    compute() {
      return {
        value: 100,
        asOf: null,
        explain: ["a modelling choice, not derived from any source: a hundred matches, a season of regular play"],
      };
    },
  },
} satisfies Record<ConstantName, ConstantDef>;

/** The registry as the CLI reads it: every entry, named, in declaration order. */
export const CONSTANTS: NamedConstantDef[] = (Object.keys(REGISTRY) as ConstantName[]).map(
  (name) => ({ name, ...REGISTRY[name] }),
);

/**
 * The entries the user asked for, in registry order.
 *
 * Matching is case-insensitive but otherwise exact. A near miss is an error
 * naming the alternatives rather than a guess, because silently checking a
 * different constant than the one asked for is worse than not running.
 */
export function selectConstants(names: string[]): NamedConstantDef[] {
  if (names.length === 0) return CONSTANTS;

  const byKey = new Map(CONSTANTS.map((c) => [c.name.toLowerCase(), c]));
  const chosen = new Set<NamedConstantDef>();
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
