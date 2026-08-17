import { describe, expect, it } from "vitest";

import shipped from "../data/box-prices.json";
import {
  BAKED_BOX_PRICES,
  BOX_SAMPLE_SIZE,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  FALLBACK_BOX_PRICES,
  GEMS_PER_USD,
  boxPriceTable,
  liveBoxDefaults,
  parseBoxPriceFeed,
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
 * that use them can be checked against something outside this file. They
 * were the basis of the box constants when those were typed by hand; the
 * constants are derived from the shipped feed now, and these are a fixture.
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
 * that the defaults are what the live rules make of it, and that it is read
 * as of the day it was taken.
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

  it("derives the two defaults by the same rule as the live feed", () => {
    // The tie between the live path and the fallback. If this breaks, the
    // fallback has stopped meaning "the same answer, older" — fix the wiring,
    // not the test.
    const derived = liveBoxDefaults(BAKED_BOX_PRICES.feed, BAKED_BOX_PRICES.day);
    expect(derived).not.toBeNull();
    expect(DEFAULT_PLAY_BOX_VALUE_GEMS).toBe(derived?.playBoxValueGems);
    expect(DEFAULT_COLLECTOR_BOX_VALUE_GEMS).toBe(derived?.collectorBoxValueGems);
    expect(BAKED_BOX_PRICES.defaults).toEqual(derived);
    // And the rule was actually satisfied — three released expansions, none
    // of them a presale on the day the copy was taken.
    const day = shipped.generatedAt.slice(0, 10);
    expect(BAKED_BOX_PRICES.defaults.sets).toHaveLength(BOX_SAMPLE_SIZE);
    for (const set of BAKED_BOX_PRICES.defaults.sets) {
      expect(set.setType).toBe("expansion");
      expect(set.releasedAt).not.toBeNull();
      expect(set.releasedAt! <= day).toBe(true);
    }
  });

  it("keeps the two defaults in the range a box actually trades in", () => {
    // A unit check, not a price opinion: the band is wide enough that no
    // market move reaches it, and a slip that shipped cents, or forgot the
    // conversion, lands two orders of magnitude outside it either way. Play
    // boxes have traded from about $100 to $300 and collector boxes from
    // about $330 to $1,700 over the sets the feed carries.
    expect(DEFAULT_PLAY_BOX_VALUE_GEMS).toBeGreaterThan(50 * GEMS_PER_USD);
    expect(DEFAULT_PLAY_BOX_VALUE_GEMS).toBeLessThan(600 * GEMS_PER_USD);
    expect(DEFAULT_COLLECTOR_BOX_VALUE_GEMS).toBeGreaterThan(150 * GEMS_PER_USD);
    expect(DEFAULT_COLLECTOR_BOX_VALUE_GEMS).toBeLessThan(2500 * GEMS_PER_USD);
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

describe("liveBoxDefaults", () => {
  it("averages the newest three market prices at 200 gems to the dollar", () => {
    const live = liveBoxDefaults(
      feed([
        row({ code: "aaa", releasedAt: "2026-03-01", playUsd: 100, collectorUsd: 400 }),
        row({ code: "bbb", releasedAt: "2026-02-01", playUsd: 200, collectorUsd: 500 }),
        row({ code: "ccc", releasedAt: "2026-01-01", playUsd: 300, collectorUsd: 600 }),
        // Older than the sample; would move both averages if counted.
        row({ code: "ddd", releasedAt: "2025-01-01", playUsd: 900, collectorUsd: 9000 }),
      ]),
      NOW,
    );
    expect(live?.sets.map((s) => s.code)).toEqual(["aaa", "bbb", "ccc"]);
    expect(live?.playBoxValueGems).toBe(200 * 200);
    expect(live?.collectorBoxValueGems).toBe(500 * 200);
  });

  it("uses market price, never the listing spread", () => {
    // Same markets as BASIS but a wildly different ask spread. If any
    // low/mid/high leaks into the derivation, the values move.
    const askew = BASIS.map((r) => ({
      ...r,
      boxes: {
        play: { ...r.boxes.play!, low: 1, mid: 9999, high: 99999 },
        collector: { ...r.boxes.collector!, low: 1, mid: 9999, high: 99999 },
      },
    }));
    const live = liveBoxDefaults(feed(askew), NOW);
    // Worked from the three market prices by hand: (116.26 + 135.34 +
    // 112.72) / 3 = 121.44 a play box, (440.45 + 494.36 + 440.56) / 3 =
    // 458.457 a collector box, at 200 gems to the dollar.
    expect(live?.playBoxValueGems).toBe(24_288);
    expect(live?.collectorBoxValueGems).toBe(91_691);
  });

  it("drops a collector-box outlier and reaches past it", () => {
    // Final Fantasy, in miniature: one set at four times the going collector
    // rate. It must not enter the average, and the sample must refill from the
    // next set down rather than shrink.
    const fin = row({ code: "fin", releasedAt: "2026-05-01", playUsd: 250, collectorUsd: 2400 });
    const live = liveBoxDefaults(
      feed([
        row({ code: "msh", releasedAt: "2026-06-01", collectorUsd: 590 }),
        fin,
        row({ code: "eoe", releasedAt: "2025-11-01", collectorUsd: 800 }),
        row({ code: "dft", releasedAt: "2025-08-01", collectorUsd: 380 }),
        row({ code: "tdm", releasedAt: "2025-04-01", collectorUsd: 500 }),
        row({ code: "blb", releasedAt: "2025-01-01", collectorUsd: 550 }),
        row({ code: "dsk", releasedAt: "2024-10-01", collectorUsd: 700 }),
        row({ code: "otj", releasedAt: "2024-08-20", collectorUsd: 450 }),
      ]),
      NOW,
    );
    expect(live?.sets.map((s) => s.code)).toEqual(["msh", "eoe", "dft"]);
    expect(live?.outliers.map((s) => s.code)).toEqual(["fin"]);
  });

  it("keeps preorders, digital sets, non-expansions and marketless rows out", () => {
    const usable = [
      row({ code: "aaa", releasedAt: "2026-03-01" }),
      row({ code: "bbb", releasedAt: "2026-02-01" }),
      row({ code: "ccc", releasedAt: "2026-01-01" }),
    ];
    const excluded = [
      // A presale as the feed actually carries one: listings, no sales yet.
      // The feed publishes it — released-or-not is the app's call, and this
      // is where the call is made.
      row({ code: "pre", releasedAt: "2026-11-13", playUsd: null, collectorUsd: null }),
      row({ code: "dig", digital: true }),
      row({ code: "mh3", setType: "draft_innovation" }),
      row({ code: "old", releasedAt: null }),
      row({ code: "half", playUsd: null }), // collector sold, play never listed
    ];
    const live = liveBoxDefaults(feed([...excluded, ...usable]), NOW);
    expect(live?.sets.map((s) => s.code)).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("returns null rather than averaging fewer than three sets", () => {
    expect(liveBoxDefaults(feed(BASIS.slice(0, BOX_SAMPLE_SIZE - 1)), NOW)).toBeNull();
    expect(liveBoxDefaults(feed([]), NOW)).toBeNull();
  });

  it("counts a set released today as released", () => {
    const today = row({ code: "new", releasedAt: "2026-08-09" });
    const live = liveBoxDefaults(feed([today, ...BASIS]), NOW);
    expect(live?.sets.map((s) => s.code)).toEqual(["new", "msh", "sos"]);
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
