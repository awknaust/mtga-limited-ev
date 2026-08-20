/**
 * Every registry entry, run against stubbed sources.
 *
 * The type system already holds the inventory: `REGISTRY` must carry a key
 * for every numeric export of `presets.ts` and `boxes.ts`, and every entry an
 * `Explanation`, or `tsc -p scripts` fails. What the types cannot see is
 * whether a `compute` body actually runs — a `find` that misses, a field read
 * under the wrong name, an arithmetic slip that returns NaN — so this feeds
 * every entry the fixture page, a small set list and a small feed, and asks
 * for a finite value and its derivation. Nothing here touches the network.
 *
 * The values pinned are the ones the fixtures determine: the drop-rates
 * arithmetic, and the stub feed's averages. Figures that come out of
 * `by-hand.ts` — the store ladder, the entry prices, the daily quest — are
 * asserted finite and left unpinned, since a test that restated them would
 * fail on the day someone checked the client and moved one, which is the
 * one moment nothing here should get in the way of.
 */

import { describe, expect, it } from "vitest";

import type { BoxPriceFeed } from "../box-prices/feed.ts";
import type { ScryfallSet } from "../shared/scryfall.ts";
import {
  DAILY_QUEST,
  DAILY_WIN_ICR_UPGRADE,
  DUAL_PRICED_EVENTS,
  GEM_BUNDLES,
  PLAY_IN_ENTRY,
} from "./by-hand.ts";
import { dropRatesPage } from "./drop-rates.fixture.ts";
import { CONSTANTS, REGISTRY, selectConstants, type ConstantName, type Context } from "./registry.ts";
import { SOURCE_URLS, type Sources } from "./sources.ts";
import { parseDropRates } from "./wizards.ts";

/** Sets the fixture page names, dated inside the mythic-rate window. */
const SETS: ScryfallSet[] = [
  { code: "dsk", name: "Duskmourn: House of Horror", releasedAt: "2024-09-27", setType: "expansion", digital: false },
  { code: "fdn", name: "Foundations", releasedAt: "2024-11-15", setType: "core", digital: false },
  { code: "spm", name: "Marvel's Spider-Man", releasedAt: "2025-09-26", setType: "expansion", digital: false },
  { code: "aaa", name: "Alpha Test Set", releasedAt: "2026-01-16", setType: "expansion", digital: false },
  { code: "bbb", name: "Beta Test Set", releasedAt: "2026-04-10", setType: "expansion", digital: false },
  { code: "ccc", name: "Gamma Test Set", releasedAt: "2026-07-03", setType: "expansion", digital: false },
];

/** Three released expansions with both boxes at a market price. */
const price = (market: number) => ({ market, low: null, mid: null, high: null, directLow: null });
const FEED: BoxPriceFeed = {
  version: 1,
  generatedAt: "2026-08-18T00:00:00Z",
  boxes: SETS.filter((s) => s.code.length === 3 && /^[abc]{3}$/.test(s.code)).map((s, i) => ({
    ...s,
    boxes: { play: price(100 + 20 * i), collector: price(400 + 100 * i) },
  })),
  unmatched: [],
};

const NOW = new Date("2026-08-18T12:00:00Z");

function stubSources(): Sources & { requested: string[] } {
  const pending = new Map<string, Promise<unknown>>();
  const requested: string[] = [];
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (!pending.has(key)) pending.set(key, fn());
    return pending.get(key) as Promise<T>;
  };
  return {
    urls: SOURCE_URLS,
    once,
    requested,
    dropRates: () =>
      once("dropRates", async () => {
        requested.push("dropRates");
        return parseDropRates(dropRatesPage());
      }),
    sets: () =>
      once("sets", async () => {
        requested.push("sets");
        return new Map(SETS.map((s) => [s.code, s]));
      }),
    boxPrices: () =>
      once("boxPrices", async () => {
        requested.push("boxPrices");
        return FEED;
      }),
  };
}

const finite = (v: number | readonly number[]): boolean =>
  typeof v === "number" ? Number.isFinite(v) : v.length > 0 && v.every(Number.isFinite);

type Computed = { value: number | readonly number[]; asOf: string | null; explain: string[] };

async function computeAll(): Promise<Map<ConstantName, Computed>> {
  const ctx: Context = { sources: stubSources(), now: NOW };
  const out = new Map<ConstantName, Computed>();
  for (const c of CONSTANTS) out.set(c.name, await c.compute(ctx));
  return out;
}

describe("the registry", () => {
  it("lists every entry once, under its own key, in declaration order", () => {
    const keys = Object.keys(REGISTRY);
    expect(CONSTANTS.map((c) => c.name)).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(selectConstants([])).toBe(CONSTANTS);
    expect(selectConstants(["daily_win_cap", "GEMS_PER_USD"]).map((c) => c.name)).toEqual([
      "GEMS_PER_USD",
      "DAILY_WIN_CAP",
    ]);
  });

  it("computes every entry to a finite value with a derivation", async () => {
    const results = await computeAll();
    expect(results.size).toBe(CONSTANTS.length);
    for (const [name, r] of results) {
      expect(finite(r.value), `${name} = ${String(r.value)}`).toBe(true);
      expect(r.explain.length, `${name} has no derivation`).toBeGreaterThan(0);
      for (const line of r.explain) expect(typeof line, `${name}: ${String(line)}`).toBe("string");
    }
  });

  it("dates every value: the run date if fetched, the by-hand check date if read off the client, none if a choice", async () => {
    const r = await computeAll();
    const runDate = "2026-08-18";
    for (const c of CONSTANTS) {
      const asOf = r.get(c.name)!.asOf;
      if (asOf !== null) expect(asOf, c.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (c.sources.length > 0) expect(asOf, c.name).toBe(runDate);
    }
    expect(r.get("GEMS_PER_USD")!.asOf).toBe(GEM_BUNDLES.checkedOn);
    expect(r.get("GEMS_PER_10K_GOLD")!.asOf).toBe(DUAL_PRICED_EVENTS.checkedOn);
    expect(r.get("DEFAULT_DRAFT_TOKEN_VALUE_GEMS")!.asOf).toBe(DUAL_PRICED_EVENTS.checkedOn);
    expect(r.get("DEFAULT_PLAY_IN_POINT_VALUE_GEMS")!.asOf).toBe(PLAY_IN_ENTRY.checkedOn);
    expect(r.get("DEFAULT_OTHER_GOLD_PER_DAY")!.asOf).toBe(DAILY_QUEST.checkedOn);
    for (const name of [
      "DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS",
      "DEFAULT_COSMETIC_VALUE_GEMS",
      "DEFAULT_WIN_RATE_MATCHES",
    ] as const) {
      expect(r.get(name)!.asOf, name).toBeNull();
    }
    /*
     * A choice carries the date it was made, where one is recorded — which is
     * every choice made since the rule was written down. The three left null
     * above predate it, and a date invented for them now would be a lie about
     * when anyone last thought about them.
     */
    expect(r.get("DEFAULT_GAMES_PER_DAY")!.asOf).toBe("2026-08-19");
    expect(r.get("BO3_GAMES_PER_MATCH")!.asOf).toBe("2026-08-19");
    expect(r.get("DEFAULT_DAILY_WIN_ICR_VALUE_GEMS")!.asOf).toBe("2026-08-20");
    // The check date lives in the field, not the prose. (Other dates — the
    // mythic-rate window, set releases — are derivation inputs and stay.)
    for (const [name, c] of r) expect(c.explain.join("\n"), name).not.toMatch(/checked by hand on/);
  });

  it("only fetches what the selected entries need", async () => {
    const sources = stubSources();
    const ctx: Context = { sources, now: NOW };
    for (const c of selectConstants(["GEMS_PER_USD", "DEFAULT_WIN_RATE_MATCHES"])) await c.compute(ctx);
    expect(sources.requested).toEqual([]);
    for (const c of selectConstants(["DEFAULT_MYTHIC_ICR_VALUE_GEMS"])) await c.compute(ctx);
    expect(sources.requested).toEqual(["dropRates"]);
  });

  it("derives the pack and card figures the fixture page implies", async () => {
    const r = await computeAll();
    const v = (name: ConstantName) => r.get(name)!.value;
    // rare slot 20 + 20/7 = 22.857; wildcards 2/30; midpoint of raw and
    // adjusted is 22.10 — presets.ts holds 22
    expect(v("DEFAULT_PACK_VALUE_GEMS")).toBe(22);
    expect(v("DEFAULT_DRAFT_PACK_VALUE_GEMS")).toBe(23);
    expect(v("DEFAULT_MYTHIC_PACK_VALUE_GEMS")).toBe(37);
    expect(v("DEFAULT_CUBE_PACK_VALUE_GEMS")).toBe(51);
    expect(v("DEFAULT_MYTHIC_ICR_VALUE_GEMS")).toBe(40);
    expect(v("DEFAULT_RARE_CARD_VALUE_GEMS")).toBe(20);
    expect(v("DEFAULT_UNCOMMON_ICR_VALUE_GEMS")).toBeCloseTo(0.05 * ((7 / 8) * 20 + (1 / 8) * 40), 12);
    expect(v("DAILY_WIN_GOLD")).toEqual([250, 100, 0]);
    expect(v("DAILY_WIN_ICR")).toEqual([0, 0, 1]);
    expect(v("DAILY_WIN_CAP")).toBe(3);
  });

  it("names the modal mythic rate and the sets behind it", async () => {
    const r = await computeAll();
    const lines = r.get("DEFAULT_PACK_VALUE_GEMS")!.explain.join("\n");
    expect(lines).toMatch(/mythic upgrade rate 1:7/);
    expect(lines).toMatch(/1:7 +DSK, FDN/);
    expect(lines).toMatch(/1:8\.1 +SPM/);
  });

  it("averages the stub feed's three released expansions for the generic boxes", async () => {
    const r = await computeAll();
    const rate = r.get("GEMS_PER_USD")!.value as number;
    // play 100, 120, 140 → 120; collector 400, 500, 600 → 500
    expect(r.get("DEFAULT_PLAY_BOX_VALUE_GEMS")!.value).toBe(Math.round(120 * rate));
    expect(r.get("DEFAULT_COLLECTOR_BOX_VALUE_GEMS")!.value).toBe(Math.round(500 * rate));
    expect(r.get("DEFAULT_PLAY_BOX_VALUE_GEMS")!.explain.join("\n")).toMatch(/PLAY_BOX_USD = \[140\.00, 120\.00, 100\.00\]/);
  });

  it("holds the six unsourced entries at their figures, each saying what kind of number it is", async () => {
    const r = await computeAll();
    for (const name of [
      "DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS",
      "DEFAULT_COSMETIC_VALUE_GEMS",
      "DEFAULT_DAILY_WIN_ICR_VALUE_GEMS",
    ] as const) {
      expect(r.get(name)!.value).toBe(0);
      expect(REGISTRY[name].sources).toEqual([]);
      expect(r.get(name)!.explain[0]).toMatch(/^zero/);
    }
    /*
     * The daily-win ICR refuses for want of a source rather than for want of
     * arithmetic, so its derivation has to carry the figure it would be —
     * otherwise the zero is a dead end for a reader who wants to price it.
     */
    const icr = r.get("DEFAULT_DAILY_WIN_ICR_VALUE_GEMS")!.explain.join("\n");
    expect(icr).toMatch(
      new RegExp(String.raw`= ${(1 / DAILY_WIN_ICR_UPGRADE.rareUpgradeRate) * 22.5} gems`),
    );
    for (const name of [
      "DEFAULT_GAMES_PER_DAY",
      "BO3_GAMES_PER_MATCH",
      "DEFAULT_WIN_RATE_MATCHES",
    ] as const) {
      expect(REGISTRY[name].sources).toEqual([]);
      expect(r.get(name)!.explain[0]).toMatch(/^a modelling choice, not derived from any source/);
    }
    expect(r.get("DEFAULT_GAMES_PER_DAY")!.value).toBe(12);
    expect(r.get("BO3_GAMES_PER_MATCH")!.value).toBe(2.5);
    expect(r.get("DEFAULT_WIN_RATE_MATCHES")!.value).toBe(100);
  });
});
