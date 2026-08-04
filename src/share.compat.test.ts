/**
 * Backwards compatibility of the link format.
 *
 * A link that someone saved a year ago has to keep meaning what it meant, and
 * the ways it can stop meaning that are all silent:
 *
 *  - **Rename a parameter** and the old name is simply not read. The field
 *    falls back to its default and the page renders a different simulation
 *    with no error anywhere.
 *  - **Change a default** and every link that omitted that parameter — which
 *    is most of them, since only deltas are written — shifts underneath.
 *  - **Change a preset** and every link naming that preset shifts too, because
 *    a link stores the delta from the preset rather than the values.
 *
 * None of those throws, so none of them is caught by a test that only checks
 * that decoding works. What is pinned below is the contract itself: the exact
 * set of names, the exact defaults, the exact preset definitions, and a corpus
 * of real captured links with everything they resolve to.
 *
 * A failure here is not necessarily a bug. It is the decision the change
 * needs: either restore compatibility, or accept the break and re-record the
 * snapshot deliberately. What it must not be is silent.
 */

import { describe, expect, it } from "vitest";

import {
  decodeShareState,
  defaultShareState,
  encodePayouts,
  encodeShareState,
  presetSlug,
  type ShareState,
} from "./share";
import { PRESETS, maxPossibleWins } from "./lib";

/**
 * Everything a link resolves to, rendered compactly.
 *
 * A whole-object snapshot would run to fifty lines and bury the one that
 * moved. This keeps a diff pointing at the field that actually changed.
 */
function fingerprint(state: ShareState): string {
  const c = state.config;
  const goldRate = Number.isFinite(c.goldPerGem) ? c.goldPerGem.toFixed(4) : "worthless";
  return [
    `preset     ${state.presetName}`,
    `winRate    ${c.winRate} (${c.format})`,
    `structure  ${JSON.stringify(c.structure)}`,
    `entry      ${c.entryCostGems} gems / ${c.entryCostGold} gold`,
    `draft      ${c.draftPacks} packs @ ${c.draftPackValueGems}`,
    `values     pack=${c.packValueGems} playIn=${c.playInPointValueGems} playBox=${c.playBoxValueGems} collBox=${c.collectorBoxValueGems}`,
    `gold       ${c.goldPerDay}/day over ${c.eventsPerDay} events, goldPerGem=${goldRate}`,
    `payouts    ${encodePayouts(c.payouts)}`,
    `bankroll   gems=${state.startingGems} gold=${state.startingGold} maxEvents=${state.maxEvents} spend=${state.spendWinnings}`,
    `sim        trials=${state.trials} seed=${state.seed}`,
    `display    tab=${state.tab} unit=${state.unit} gemsPerUsd=${state.gemsPerUsd}`,
  ].join("\n");
}

/**
 * Links captured in the wild, including the five handed over for review.
 *
 * Add to this list, never edit an entry: each one is a promise that a URL
 * someone holds still works.
 */
const CORPUS: [name: string, search: string][] = [
  ["bare origin", ""],
  ["one slider moved", "?wr=0.62"],
  ["preset switch only", "?preset=quick-draft"],
  [
    "demo 2 — premier, gems only, no gold",
    "?draftPackValue=0&packValue=0&playInValue=0&playBoxValue=0&collectorBoxValue=0&goldPerDay=0&tab=event",
  ],
  [
    "demo 3 — quick, gems only, no gold",
    "?preset=quick-draft&draftPackValue=0&packValue=0&playInValue=0&playBoxValue=0&collectorBoxValue=0&goldPerDay=0&tab=event",
  ],
  ["demo 4 — premier at the post's card values", "?draftPackValue=110&packValue=132&goldPerDay=0&tab=event"],
  [
    "demo 5 — full custom worst case",
    "?preset=custom&wr=0.6125&entry=1234&entryGold=9000&draftPacks=4&draftPackValue=110&packValue=132&playInValue=250&playBoxValue=60000&collectorBoxValue=250000&goldPerDay=900&eventsPerDay=2&format=bo3&rounds=5&payouts=10-1_20-1_300-2-1_4000-3-0-1_5000-4-0-0-2_12000-6-4-0-3&goldPer10k=2000&startGems=12000&startGold=5000&maxEvents=50&gemsPerUsd=350&trials=250000&seed=77&spendWinnings=1&tab=event&unit=usd",
  ],
  ["traditional draft — bo3, fixed rounds, play-in points", "?preset=traditional-draft"],
  ["arena direct — physical boxes in the ladder", "?preset=arena-direct-cube"],
  ["unspent gold counted as worthless", "?goldPer10k=0"],
  ["display only", "?tab=about&unit=usd&gemsPerUsd=350"],
  ["bankroll only", "?startGems=20000&startGold=15000&maxEvents=200&spendWinnings=1"],
  ["custom elimination shape", "?preset=custom&maxWins=5&maxLosses=2&payouts=0-0_100-1_200-2_400-3_800-4_1600-5"],
];

describe("the parameter names are the contract", () => {
  /*
   * Every name the encoder can emit. A rename that is not reflected here is
   * exactly the silent break this file exists to catch: the old name stops
   * being read, and the field quietly reverts to its default.
   *
   * The two structure kinds are mutually exclusive in one URL, so the set is
   * the union over both.
   */
  it("emits only these, ever", () => {
    const base = defaultShareState();
    const touched: ShareState = {
      presetName: "Custom",
      config: {
        ...base.config,
        winRate: 0.4321,
        format: "bo3",
        structure: { kind: "rounds", rounds: 4 },
        entryCostGems: 1,
        entryCostGold: 2,
        goldPerDay: 3,
        eventsPerDay: 4,
        goldPerGem: 5,
        draftPacks: 6,
        draftPackValueGems: 7,
        packValueGems: 8,
        playInPointValueGems: 9,
        playBoxValueGems: 10,
        collectorBoxValueGems: 11,
        payouts: [
          { wins: 0, gems: 1, packs: 1 },
          { wins: 1, gems: 2, packs: 2 },
          { wins: 2, gems: 3, packs: 3 },
          { wins: 3, gems: 4, packs: 4 },
          { wins: 4, gems: 5, packs: 5 },
        ],
      },
      trials: 12,
      seed: 13,
      startingGems: 14,
      startingGold: 15,
      maxEvents: 16,
      spendWinnings: true,
      tab: "about",
      unit: "usd",
      gemsPerUsd: 17,
    };
    const elimination: ShareState = {
      ...touched,
      config: {
        ...touched.config,
        structure: { kind: "elimination", maxWins: 5, maxLosses: 2 },
      },
    };
    const names = new Set([
      ...new URLSearchParams(encodeShareState(touched)).keys(),
      ...new URLSearchParams(encodeShareState(elimination)).keys(),
    ]);
    expect([...names].sort()).toEqual([
      "collectorBoxValue",
      "draftPackValue",
      "draftPacks",
      "entry",
      "entryGold",
      "eventsPerDay",
      "format",
      "gemsPerUsd",
      "goldPer10k",
      "goldPerDay",
      "maxEvents",
      "maxLosses",
      "maxWins",
      "packValue",
      "payouts",
      "playBoxValue",
      "playInValue",
      "preset",
      "rounds",
      "seed",
      "spendWinnings",
      "startGems",
      "startGold",
      "tab",
      "trials",
      "unit",
      "wr",
    ]);
  });

  it("ignores a name it does not know, which is why the list above is frozen", () => {
    // The whole hazard in one assertion: a misspelling reads as a default, not
    // as an error.
    expect(decodeShareState("winRate=0.9").config.winRate).toBe(
      defaultShareState().config.winRate,
    );
    expect(decodeShareState("wr=0.9").config.winRate).toBe(0.9);
  });

  it("decodes a link written by a later version, keeping what it recognises", () => {
    // Reserved for a future migration: absence of `v` means the format below.
    const state = decodeShareState("v=2&wr=0.6&unrecognisedFutureField=42");
    expect(state.config.winRate).toBe(0.6);
    expect(state.presetName).toBe(defaultShareState().presetName);
  });

  it("keeps the preset slugs a link names", () => {
    expect(PRESETS.map((p) => presetSlug(p.name))).toEqual([
      "premier-draft",
      "quick-draft",
      "premier-cube-draft",
      "traditional-draft",
      "traditional-cube-draft",
      "pick-two-draft",
      "sealed",
      "contender-draft",
      "arena-direct-cube",
    ]);
  });
});

describe("the defaults are the contract", () => {
  /*
   * Only deltas are written, so an omitted parameter *is* the default. Moving
   * one rewrites the meaning of every link that left it out.
   */
  it("pins what an omitted parameter resolves to", () => {
    expect(fingerprint(defaultShareState())).toMatchInlineSnapshot(`
      "preset     Premier Draft
      winRate    0.55 (bo1)
      structure  {"kind":"elimination","maxWins":7,"maxLosses":3}
      entry      1500 gems / 10000 gold
      draft      3 packs @ 23
      values     pack=22 playIn=200 playBox=61867 collBox=252133
      gold       1350/day over 1 events, goldPerGem=6.6667
      payouts    50-1_100-1_250-2_1000-2_1400-3_1600-4_1800-5_2200-6
      bankroll   gems=3400 gold=0 maxEvents=20 spend=false
      sim        trials=100000 seed=1
      display    tab=bankroll unit=gems gemsPerUsd=400"
    `);
  });
});

describe("the preset definitions are the contract", () => {
  /*
   * A link stores the delta from a preset, not the preset's values, so editing
   * a ladder silently changes every link naming it. That has already happened
   * once here — the Traditional Draft comment records its table being wrong in
   * three places — and it would have gone unnoticed by any test but this one.
   *
   * Changing a preset is often right. Doing it without noticing that old links
   * moved is not.
   */
  it.each(PRESETS.map((p) => [presetSlug(p.name), p.name] as const))(
    "pins what ?preset=%s resolves to",
    (slug) => {
      expect(fingerprint(decodeShareState(`?preset=${slug}`))).toMatchSnapshot();
    },
  );
});

describe("the captured corpus", () => {
  it.each(CORPUS)("pins everything %s resolves to", (_name, search) => {
    expect(fingerprint(decodeShareState(search))).toMatchSnapshot();
  });

  /*
   * Re-encoding is compared on meaning rather than on the string: a captured
   * link need not be in canonical parameter order, and reordering is not a
   * break. What would be a break is a value moving on the way through.
   */
  it.each(CORPUS)("re-encodes %s without drift", (_name, search) => {
    const once = decodeShareState(search);
    const twice = decodeShareState(encodeShareState(once));
    expect(fingerprint(twice)).toBe(fingerprint(once));
    // And canonical form is a fixed point, so an address bar does not churn.
    expect(encodeShareState(twice)).toBe(encodeShareState(once));
  });

  it.each(CORPUS)("holds the model's invariants for %s", (_name, search) => {
    const { config } = decodeShareState(search);
    expect(config.payouts).toHaveLength(maxPossibleWins(config.structure) + 1);
    expect(config.payouts.map((t) => t.wins)).toEqual(
      config.payouts.map((_, i) => i),
    );
    expect(config.winRate).toBeGreaterThanOrEqual(0);
    expect(config.winRate).toBeLessThanOrEqual(1);
  });
});

describe("a link that arrives damaged", () => {
  /*
   * Links get truncated by chat clients, wrapped by mail readers and clipped
   * when copied. Every prefix of a real link has to decode to *something*
   * usable — losing a field is acceptable, throwing on the way to first paint
   * is not.
   */
  const LONGEST = CORPUS[6][1];

  it("decodes every prefix of the worst-case link without throwing", () => {
    for (let i = 0; i <= LONGEST.length; i++) {
      const prefix = LONGEST.slice(0, i);
      expect(() => decodeShareState(prefix), `prefix of length ${i}`).not.toThrow();
      const { config } = decodeShareState(prefix);
      expect(config.payouts, `prefix of length ${i}`).toHaveLength(
        maxPossibleWins(config.structure) + 1,
      );
    }
  });

  it("survives a truncated payout table by keeping the preset's", () => {
    // The ladder is the one variable-length field, so it is where a clipped
    // URL does the most damage.
    const clipped = decodeShareState("?preset=quick-draft&payouts=50-1_100-1_200-");
    expect(encodePayouts(clipped.config.payouts)).toBe(
      encodePayouts(decodeShareState("?preset=quick-draft").config.payouts),
    );
  });

  it.each([
    ["a repeated parameter", "?wr=0.6&wr=0.7"],
    ["an empty value", "?wr=&entry="],
    ["a stray ampersand", "?&&wr=0.6&&"],
    ["a value that is not a number", "?wr=banana&entry=%20&trials=1e999"],
    ["a negative amount", "?entry=-500&startGems=-1"],
    ["an absurd magnitude", "?trials=1e308&maxEvents=1e308&entry=1e308"],
    ["a percent-encoded separator", "?payouts=50%2D1"],
    ["a payout table with no rows", "?payouts="],
  ])("decodes %s to a usable state", (_name, search) => {
    const state = decodeShareState(search);
    expect(Number.isFinite(state.config.winRate)).toBe(true);
    expect(Number.isFinite(state.trials)).toBe(true);
    expect(state.trials).toBeGreaterThanOrEqual(1);
    expect(state.config.entryCostGems).toBeGreaterThanOrEqual(0);
    expect(state.config.payouts).toHaveLength(
      maxPossibleWins(state.config.structure) + 1,
    );
  });
});
