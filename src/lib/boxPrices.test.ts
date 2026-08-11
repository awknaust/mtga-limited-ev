import { describe, expect, it } from "vitest";

import {
  BOX_SAMPLE_SIZE,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  liveBoxDefaults,
  parseBoxPriceFeed,
  type BoxPriceFeed,
  type BoxPriceRow,
} from ".";

/** The date every test asks the question on. */
const NOW = new Date(2026, 7, 9); // 2026-08-09, local time like the code under test

const row = (overrides: Partial<BoxPriceRow> & { code: string }): BoxPriceRow => ({
  name: overrides.code.toUpperCase(),
  releasedAt: "2026-01-01",
  setType: "expansion",
  digital: false,
  playUsd: 150,
  collectorUsd: 600,
  ...overrides,
});

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

  it("averages the newest three and prices at 200 gems to the dollar", () => {
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

  it("keeps preorders, digital sets, non-expansions and half-priced rows out", () => {
    const usable = [
      row({ code: "aaa", releasedAt: "2026-03-01" }),
      row({ code: "bbb", releasedAt: "2026-02-01" }),
      row({ code: "ccc", releasedAt: "2026-01-01" }),
    ];
    const excluded = [
      row({ code: "pre", releasedAt: "2026-11-13" }), // future: price is speculation
      row({ code: "dig", digital: true }),
      row({ code: "mh3", setType: "masters" }),
      row({ code: "old", releasedAt: null }),
      row({ code: "half", playUsd: null }), // collector tracked, play not
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

describe("parseBoxPriceFeed", () => {
  // Deep-cloned: several cases below mutate what they are handed, and the
  // rows in SHIPPED_BASIS are shared with the derivation tests above.
  const good = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(feed(SHIPPED_BASIS))) as Record<string, unknown>;

  it("accepts the worker's payload shape", () => {
    expect(parseBoxPriceFeed(good())).not.toBeNull();
  });

  it("tolerates fields it does not know", () => {
    // The Worker deploys separately from the app; a newer payload with more
    // metadata must not read as corrupt to an older app.
    const data = good();
    data.unmatched = ["xyz"];
    (data.boxes as Record<string, unknown>[])[0].draftUsd = 300;
    expect(parseBoxPriceFeed(data)).not.toBeNull();
  });

  it.each([
    ["not an object", () => null],
    ["wrong version", () => ({ ...good(), version: 2 })],
    ["boxes not an array", () => ({ version: 1, generatedAt: "x", boxes: {} })],
    [
      "a price that is a string",
      () => {
        const d = good();
        (d.boxes as Record<string, unknown>[])[0].playUsd = "147";
        return d;
      },
    ],
    [
      "a negative price",
      () => {
        const d = good();
        (d.boxes as Record<string, unknown>[])[0].playUsd = -1;
        return d;
      },
    ],
  ])("rejects %s", (_name, data) => {
    expect(parseBoxPriceFeed(data())).toBeNull();
  });
});
