import { describe, expect, it } from "vitest";

import shipped from "../data/box-prices.json";
import {
  BAKED_BOX_PRICES,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  FALLBACK_BOX_PRICES,
  boxPriceTable,
  defaultConfig,
  parseBoxPriceFeed,
  withLiveBoxPrices,
  type BoxPriceFeed,
  type BoxPriceRow,
  type BoxPriceStats,
} from ".";

/** The date every test asks the question on. */
const NOW = new Date(2026, 7, 9); // 2026-08-09, local time like the code under test

/** Stats with only the market set — the common case in these tests. */
const market = (usd: number | null): BoxPriceStats => ({
  market: usd,
  low: usd === null ? null : usd * 0.95,
  mid: usd === null ? null : usd * 1.2,
  high: usd === null ? null : usd * 2,
  directLow: null,
});

const row = (
  overrides: Partial<Omit<BoxPriceRow, "boxes">> & {
    code: string;
    playUsd?: number | null;
    collectorUsd?: number | null;
  },
): BoxPriceRow => {
  const { playUsd = 150, collectorUsd = 600, ...rest } = overrides;
  return {
    name: overrides.code.toUpperCase(),
    releasedAt: "2026-01-01",
    setType: "expansion",
    digital: false,
    ...rest,
    boxes: { play: market(playUsd), collector: market(collectorUsd) },
  };
};

const feed = (boxes: BoxPriceRow[]): BoxPriceFeed => ({
  version: 1,
  generatedAt: "2026-08-09T10:43:00.000Z",
  boxes,
});

/**
 * Three released expansions at their TCGplayer market prices as of
 * 2026-08-10 — real figures on a real day, so the arithmetic in the tests
 * that use them can be checked against something outside this file.
 */
const BASIS = [
  row({ code: "msh", releasedAt: "2026-06-26", playUsd: 116.26, collectorUsd: 440.45 }),
  row({ code: "sos", releasedAt: "2026-04-24", playUsd: 135.34, collectorUsd: 494.36 }),
  row({ code: "tmt", releasedAt: "2026-03-06", playUsd: 112.72, collectorUsd: 440.56 }),
];

/*
 * The copy of the feed the app ships — `src/data/box-prices.json`, written
 * by `npm run box:prices -- --write` and refreshed by CI before every build.
 * Nothing here pins a price, a set code or a date from it: the copy moves
 * with the market on every refresh, and a test that fixed one of its numbers
 * would go red on the next build for no reason anyone wants to hear about.
 * What is pinned is the shape of the arrangement — that the copy is a feed,
 * that the table is what the live rule makes of it, and that it is read as
 * of the day it was taken.
 */
describe("the shipped copy of the feed", () => {
  it("is the Worker's payload, and passes the live validator", () => {
    // Read through `parseBoxPriceFeed` like a fetched one, so it is trusted
    // exactly as far as the network is and no further.
    expect(shipped.version).toBe(1);
    expect(BAKED_BOX_PRICES.feed).toEqual(parseBoxPriceFeed(shipped));
    expect(BAKED_BOX_PRICES.feed.generatedAt).toBe(shipped.generatedAt);
  });

  it("is read as of the day it was taken, wherever it is read", () => {
    // The UTC date on the stamp, built as a local day — so the local-date
    // reading the rules use lands on that calendar day in every zone.
    const [y, m, d] = shipped.generatedAt.slice(0, 10).split("-").map(Number);
    expect(BAKED_BOX_PRICES.day.getTime()).toBe(new Date(y, m - 1, d).getTime());
  });

  it("is the table the app holds before the live feed, read on its own day", () => {
    expect(FALLBACK_BOX_PRICES).toBe(BAKED_BOX_PRICES.table);
    expect(FALLBACK_BOX_PRICES).toEqual(
      boxPriceTable(BAKED_BOX_PRICES.feed, BAKED_BOX_PRICES.day),
    );
    expect(FALLBACK_BOX_PRICES.generatedAt).toBe(shipped.generatedAt);
    // It prices sets and names the newest — which is what lets a preview say
    // "a Hobbit box" and price it, rather than "any box" at an average.
    expect(FALLBACK_BOX_PRICES.sets.length).toBeGreaterThan(0);
    for (const kind of ["play", "collector"] as const) {
      const code = FALLBACK_BOX_PRICES.latest[kind];
      expect(code).toBeDefined();
      const set = FALLBACK_BOX_PRICES.sets.find((s) => s.code === code);
      expect(set?.boxes[kind]).toBeGreaterThan(0);
    }
  });
});

describe("boxPriceTable", () => {
  it("prices every set the feed carries, newest first", () => {
    const table = boxPriceTable(feed(BASIS), NOW);
    expect(table.sets.map((s) => s.code)).toEqual(["msh", "sos", "tmt"]);
    // Market at 200 gems to the dollar, the same conversion the averages use.
    expect(table.sets[0].boxes).toEqual({
      play: Math.round(116.26 * 200),
      collector: Math.round(440.45 * 200),
    });
    expect(table.generatedAt).toBe("2026-08-09T10:43:00.000Z");
  });

  /*
   * Wider than the averaging rule on every axis that matters, and each of
   * these is a set somebody's payout could name: Arena Direct has paid Modern
   * Horizons boxes, and it runs alongside a release, so the release week's
   * presale is exactly the box in question.
   */
  it("keeps the sets the averages leave out, since a payout can name one", () => {
    const table = boxPriceTable(
      feed([
        row({ code: "pre", releasedAt: "2026-11-13", playUsd: 210 }),
        row({ code: "mh3", setType: "draft_innovation", playUsd: 293 }),
        row({ code: "fin", releasedAt: "2026-05-01", collectorUsd: 1728 }),
        ...BASIS,
      ]),
      NOW,
    );
    // The presale, the non-expansion and the outlier are all priced.
    expect(table.sets.map((s) => s.code)).toContain("pre");
    expect(table.sets.map((s) => s.code)).toContain("mh3");
    expect(table.sets.find((s) => s.code === "fin")?.boxes.collector).toBe(1728 * 200);
  });

  it("leaves out what has no paper box or no price", () => {
    const table = boxPriceTable(
      feed([
        row({ code: "dig", digital: true }),
        row({ code: "tbd", releasedAt: null }),
        row({ code: "none", playUsd: null, collectorUsd: null }),
        ...BASIS,
      ]),
      NOW,
    );
    expect(table.sets.map((s) => s.code)).toEqual(["msh", "sos", "tmt"]);
  });

  it("keeps a set priced in one kind only, in that kind only", () => {
    const table = boxPriceTable(feed([row({ code: "half", playUsd: null })]), NOW);
    expect(table.sets[0].boxes).toEqual({ collector: 600 * 200 });
  });

  /*
   * `latest` is what a preset's "newest set" box resolves to, and it is the
   * one narrow reading in this table: released, so a preset cannot price this
   * week's event at next month's preorder, and an expansion, because that is
   * the cadence Arena Direct follows.
   */
  it("points latest at the newest released expansion, per kind", () => {
    const table = boxPriceTable(
      feed([
        row({ code: "pre", releasedAt: "2026-11-13" }),
        row({ code: "mh3", releasedAt: "2026-07-01", setType: "draft_innovation" }),
        row({ code: "new", releasedAt: "2026-06-30", collectorUsd: null }),
        ...BASIS,
      ]),
      NOW,
    );
    // "new" is the newest released expansion, but has no collector price, so
    // the two kinds resolve to different sets.
    expect(table.latest).toEqual({ play: "new", collector: "msh" });
  });

  it("has no latest to offer when nothing qualifies", () => {
    const table = boxPriceTable(
      feed([row({ code: "mh3", setType: "draft_innovation" })]),
      NOW,
    );
    expect(table.sets.map((s) => s.code)).toEqual(["mh3"]);
    expect(table.latest).toEqual({});
  });

  /*
   * A feed that priced nothing is no better than no feed, so it resolves the
   * same way — to the shipped copy's table, which names the newest set and
   * prices it, rather than to an empty table that would turn every named box
   * back into "any box".
   */
  it("falls back to the shipped table when the feed prices nothing", () => {
    expect(boxPriceTable(feed([]), NOW)).toBe(FALLBACK_BOX_PRICES);
    expect(boxPriceTable(feed([row({ code: "dig", digital: true })]), NOW)).toBe(
      FALLBACK_BOX_PRICES,
    );
    // And not by accident of the shipped table happening to be empty.
    expect(FALLBACK_BOX_PRICES.sets.length).toBeGreaterThan(0);
  });
});

/*
 * The feed applied to a config — what App does to the decoded link before its
 * first render. Only the table lands. The two generic values are the build's
 * and stay put whatever the feed says: they price a box that names no set,
 * and nothing but a custom ladder pays one of those.
 */
describe("withLiveBoxPrices", () => {
  const live = feed([
    row({ code: "aaa", releasedAt: "2026-03-01", playUsd: 100, collectorUsd: 400 }),
    row({ code: "bbb", releasedAt: "2026-02-01", playUsd: 200, collectorUsd: 500 }),
    row({ code: "ccc", releasedAt: "2026-01-01", playUsd: 300, collectorUsd: 600 }),
  ]);

  it("installs the feed's table and touches nothing else", () => {
    const fresh = defaultConfig();
    const applied = withLiveBoxPrices(fresh, live, NOW);
    expect(applied.boxPrices).toEqual(boxPriceTable(live, NOW));
    expect({ ...applied, boxPrices: fresh.boxPrices }).toEqual(fresh);
  });

  it("leaves the two generic values where they were, at the default or not", () => {
    // The feed prices boxes far from the two constants; neither the constant
    // nor a value the reader typed moves — a fresh load must not read as
    // edited, and an edit must survive.
    const fresh = withLiveBoxPrices(defaultConfig(), live, NOW);
    expect(fresh.playBoxValueGems).toBe(DEFAULT_PLAY_BOX_VALUE_GEMS);
    expect(fresh.collectorBoxValueGems).toBe(DEFAULT_COLLECTOR_BOX_VALUE_GEMS);
    const typed = withLiveBoxPrices(
      { ...defaultConfig(), playBoxValueGems: 0, collectorBoxValueGems: 123_456 },
      live,
      NOW,
    );
    expect(typed.playBoxValueGems).toBe(0);
    expect(typed.collectorBoxValueGems).toBe(123_456);
  });

  it("is what a fresh load already holds when the feed is the shipped copy", () => {
    // Applying the shipped feed on its own day changes nothing, so a preview
    // and production on deploy day open on the same state.
    const fresh = defaultConfig();
    expect(withLiveBoxPrices(fresh, BAKED_BOX_PRICES.feed, BAKED_BOX_PRICES.day)).toEqual(fresh);
  });
});

describe("parseBoxPriceFeed", () => {
  // Deep-cloned: several cases below mutate what they are handed, and the
  // rows in BASIS are shared with the derivation tests above.
  const good = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(feed(BASIS))) as Record<string, unknown>;

  const firstBoxes = (d: Record<string, unknown>): Record<string, unknown> =>
    (d.boxes as Record<string, unknown>[])[0].boxes as Record<string, unknown>;

  it("accepts the worker's payload shape", () => {
    expect(parseBoxPriceFeed(good())).not.toBeNull();
  });

  it("tolerates fields and box kinds it does not know", () => {
    // The Worker deploys separately from the app; a newer payload with more
    // metadata must not read as corrupt to an older app.
    const data = good();
    data.unmatched = ["xyz"];
    firstBoxes(data).jumpstart = { market: 120, low: 110, mid: 130, high: 200, directLow: null };
    firstBoxes(data).bundle = { market: 40 }; // even with stats missing
    const parsed = parseBoxPriceFeed(data);
    expect(parsed).not.toBeNull();
    expect(parsed?.boxes[0].boxes.jumpstart?.market).toBe(120);
    expect(parsed?.boxes[0].boxes.bundle?.low).toBeNull();
  });

  it("keeps a presale's listing prices alongside its null market", () => {
    const data = good();
    firstBoxes(data).play = { market: null, low: 189.99, mid: 219.99, high: 300, directLow: null };
    const parsed = parseBoxPriceFeed(data);
    expect(parsed?.boxes[0].boxes.play?.market).toBeNull();
    expect(parsed?.boxes[0].boxes.play?.low).toBe(189.99);
  });

  it.each([
    ["not an object", () => null],
    ["wrong version", () => ({ ...good(), version: 2 })],
    ["boxes not an array", () => ({ version: 1, generatedAt: "x", boxes: {} })],
    [
      "a price that is a string",
      () => {
        const d = good();
        (firstBoxes(d).play as Record<string, unknown>).market = "147";
        return d;
      },
    ],
    [
      "a negative price",
      () => {
        const d = good();
        (firstBoxes(d).collector as Record<string, unknown>).low = -1;
        return d;
      },
    ],
    [
      "a box kind that is not an object",
      () => {
        const d = good();
        firstBoxes(d).play = 147;
        return d;
      },
    ],
  ])("rejects %s", (_name, data) => {
    expect(parseBoxPriceFeed(data())).toBeNull();
  });
});
