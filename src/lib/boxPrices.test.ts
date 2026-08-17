import { describe, expect, it } from "vitest";

import {
  BOX_SAMPLE_SIZE,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  DEFAULT_LATEST_SET,
  FALLBACK_BOX_PRICES,
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
 * The three sets the shipped constants were derived from, priced as the doc
 * comment on PLAY_BOX_USD records them: TCGplayer market as of 2026-08-10.
 */
const SHIPPED_BASIS = [
  row({ code: "msh", releasedAt: "2026-06-26", playUsd: 116.26, collectorUsd: 440.45 }),
  row({ code: "sos", releasedAt: "2026-04-24", playUsd: 135.34, collectorUsd: 494.36 }),
  row({ code: "tmt", releasedAt: "2026-03-06", playUsd: 112.72, collectorUsd: 440.56 }),
];

describe("liveBoxDefaults", () => {
  it("reproduces the shipped constants from the sets they were derived from", () => {
    // The tie between the live path and the fallback. If this breaks, the two
    // rules have diverged and "fallback" no longer means "the same answer,
    // older" — fix the rule, not the test.
    const live = liveBoxDefaults(feed(SHIPPED_BASIS), NOW);
    expect(live?.playBoxValueGems).toBe(DEFAULT_PLAY_BOX_VALUE_GEMS);
    expect(live?.collectorBoxValueGems).toBe(DEFAULT_COLLECTOR_BOX_VALUE_GEMS);
  });

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
    // Same markets as SHIPPED_BASIS but a wildly different ask spread. If any
    // low/mid/high leaks into the derivation, the values move.
    const askew = SHIPPED_BASIS.map((r) => ({
      ...r,
      boxes: {
        play: { ...r.boxes.play!, low: 1, mid: 9999, high: 99999 },
        collector: { ...r.boxes.collector!, low: 1, mid: 9999, high: 99999 },
      },
    }));
    const live = liveBoxDefaults(feed(askew), NOW);
    expect(live?.playBoxValueGems).toBe(DEFAULT_PLAY_BOX_VALUE_GEMS);
    expect(live?.collectorBoxValueGems).toBe(DEFAULT_COLLECTOR_BOX_VALUE_GEMS);
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
    expect(liveBoxDefaults(feed(SHIPPED_BASIS.slice(0, BOX_SAMPLE_SIZE - 1)), NOW)).toBeNull();
    expect(liveBoxDefaults(feed([]), NOW)).toBeNull();
  });

  it("counts a set released today as released", () => {
    const today = row({ code: "new", releasedAt: "2026-08-09" });
    const live = liveBoxDefaults(feed([today, ...SHIPPED_BASIS]), NOW);
    expect(live?.sets.map((s) => s.code)).toEqual(["new", "msh", "sos"]);
  });
});

describe("boxPriceTable", () => {
  it("prices every set the feed carries, newest first", () => {
    const table = boxPriceTable(feed(SHIPPED_BASIS), NOW);
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
        ...SHIPPED_BASIS,
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
        ...SHIPPED_BASIS,
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
        ...SHIPPED_BASIS,
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
   * same way — no prices, but still naming the newest set from the baked
   * snapshot, since which set an event ships is knowable without the feed.
   */
  it("falls back to the baked table when the feed prices nothing", () => {
    expect(boxPriceTable(feed([]), NOW)).toEqual(FALLBACK_BOX_PRICES);
    expect(boxPriceTable(feed([row({ code: "dig", digital: true })]), NOW)).toEqual(
      FALLBACK_BOX_PRICES,
    );
    // And that table names a set even though it prices none.
    expect(FALLBACK_BOX_PRICES.sets).toEqual([]);
    expect(FALLBACK_BOX_PRICES.latest.play).toBe(DEFAULT_LATEST_SET);
  });
});

describe("parseBoxPriceFeed", () => {
  // Deep-cloned: several cases below mutate what they are handed, and the
  // rows in SHIPPED_BASIS are shared with the derivation tests above.
  const good = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(feed(SHIPPED_BASIS))) as Record<string, unknown>;

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
