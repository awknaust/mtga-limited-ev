import { describe, expect, it } from "vitest";

import {
  SIM_LIMITS,
  decodePayouts,
  decodeShareState,
  defaultShareState,
  encodePayouts,
  encodeShareState,
  isAdvancedDefault,
  presetSlug,
  resetAdvanced,
  type ShareState,
} from "./share";
import {
  CUSTOM_PRESET,
  MASTERY_TRACKS,
  PRESETS,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_DRAFT,
  configFromPreset,
  defaultConfig,
  maxPossibleWins,
} from "./lib";

/** The default state with one thing changed, which is the case links are for. */
const withState = (patch: Partial<ShareState>): ShareState => ({
  ...defaultShareState(),
  ...patch,
});

const roundTrip = (state: ShareState): ShareState =>
  decodeShareState(encodeShareState(state));

describe("preset slugs", () => {
  it("are unique across every preset and Custom", () => {
    const slugs = [...PRESETS.map((p) => p.name), CUSTOM_PRESET].map(presetSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("read as the event does", () => {
    expect(presetSlug("Premier Draft")).toBe("premier-draft");
    expect(presetSlug("Arena Direct (Cube)")).toBe("arena-direct-cube");
    expect(presetSlug(CUSTOM_PRESET)).toBe("custom");
  });
});

describe("encoding only what was touched", () => {
  it("writes nothing at all for an untouched load", () => {
    expect(encodeShareState(defaultShareState())).toBe("");
  });

  it("writes one parameter for one changed field", () => {
    const state = withState({
      config: { ...defaultConfig(), winRate: 0.62 },
    });
    expect(encodeShareState(state)).toBe("wr=0.62");
  });

  it("names a preset without restating the ladder it implies", () => {
    const state = withState({
      presetName: QUICK_DRAFT.name,
      config: configFromPreset(QUICK_DRAFT, defaultConfig()),
    });
    // Entry cost, payouts and draft packs all differ from Premier's, and none
    // of them belongs in the URL — the preset already says what they are.
    expect(encodeShareState(state)).toBe("preset=quick-draft");
  });

  it("writes the delta from the preset, not from the model default", () => {
    const state = withState({
      presetName: SEALED.name,
      config: { ...configFromPreset(SEALED, defaultConfig()), entryCostGems: 2500 },
    });
    expect(encodeShareState(state)).toBe("preset=sealed&entry=2500");
  });

  it("keeps a bankroll setting out until it moves", () => {
    // Read off the defaults rather than written out: this asserts that an
    // untouched field stays out of the URL, which is a different claim from
    // what the default happens to be. share.compat.test.ts pins the value.
    const { startingGems } = defaultShareState();
    expect(encodeShareState(withState({ startingGems }))).toBe("");
    expect(encodeShareState(withState({ startingGems: 10000 }))).toBe("startGems=10000");
  });

  it("spells the flags only when they are off their default", () => {
    expect(encodeShareState(withState({ tab: "event", unit: "usd" }))).toBe(
      "tab=event&unit=usd",
    );
  });

  /*
   * There is one mastery season, so the picker cannot be off its default and
   * `mastery=` cannot appear in a link yet. Both halves are asserted: the second
   * is what will start failing the day a second season lands, which is the point
   * — it is a reminder to add a corpus entry for the new slug, not a bug.
   */
  it("keeps the mastery season out of a link while there is only one", () => {
    for (const track of MASTERY_TRACKS) {
      expect(encodeShareState(withState({ masterySlug: track.slug }))).toBe("");
    }
    expect(MASTERY_TRACKS).toHaveLength(1);
  });
});

describe("the mastery season", () => {
  it("round-trips every season by its slug", () => {
    for (const track of MASTERY_TRACKS) {
      const state = withState({ masterySlug: track.slug });
      expect(roundTrip(state).masterySlug).toBe(track.slug);
    }
  });

  /*
   * A slug this build does not carry — an older link, or a newer one — falls
   * back to the current season rather than leaving the tab pricing nothing.
   * Slugs are written out on the track for exactly this reason: relabelling a
   * season must not quietly turn every link naming it into this case.
   */
  it("falls back to the current season on a slug it does not know", () => {
    const fallback = defaultShareState().masterySlug;
    expect(decodeShareState("?mastery=some-future-set").masterySlug).toBe(fallback);
    expect(decodeShareState("?mastery=").masterySlug).toBe(fallback);
    expect(decodeShareState("").masterySlug).toBe(fallback);
  });
});

describe("round trips", () => {
  it("restores an untouched load from an empty query", () => {
    expect(decodeShareState("")).toEqual(defaultShareState());
  });

  it("restores every preset unchanged", () => {
    for (const preset of PRESETS) {
      const state = withState({
        presetName: preset.name,
        config: configFromPreset(preset, defaultConfig()),
      });
      expect(roundTrip(state)).toEqual(state);
    }
  });

  it("restores a fully hand-edited custom event", () => {
    const state = withState({
      presetName: CUSTOM_PRESET,
      config: {
        ...defaultConfig(),
        winRate: 0.6125,
        structure: { kind: "rounds", rounds: 4 },
        entryCostGems: 1234,
        entryCostGold: 9000,
        otherGoldPerDay: 900,
        eventsPerDay: 2,
        gemsPer10kGold: 2000,
        draftPacks: 4,
        draftPackValueGems: 110,
        packValueGems: 132,
        playInPointValueGems: 250,
        playBoxValueGems: 60000,
        collectorBoxValueGems: 250000,
        payouts: [
          { wins: 0, gems: 10, packs: 1 },
          { wins: 1, gems: 20, packs: 1 },
          { wins: 2, gems: 30, packs: 2, playInPoints: 1 },
          { wins: 3, gems: 40, packs: 3, boxes: [{ kind: "play", set: "latest" }] },
          {
            wins: 4,
            gems: 50,
            packs: 4,
            boxes: [{ kind: "collector", set: "msh" }, { kind: "collector" }],
          },
        ],
      },
      trials: 25_000,
      seed: 7,
      startingGems: 12_000,
      startingGold: 5_000,
      maxEvents: 50,
      tab: "event",
      unit: "usd",
      gemsPerUsd: 350,
    });
    expect(roundTrip(state)).toEqual(state);
  });

  it("restores a best-of-three win rate, which comes off a bisection", () => {
    // The per-game rate behind a 57.5% match rate is not a round number, and
    // six decimal places is well below anything the screen resolves.
    const state = withState({
      presetName: TRADITIONAL_DRAFT.name,
      config: { ...configFromPreset(TRADITIONAL_DRAFT, defaultConfig()), winRate: 0.5500001 },
    });
    expect(roundTrip(state).config.winRate).toBeCloseTo(0.5500001, 6);
  });

  it("restores gold counted as worthless", () => {
    const state = withState({
      config: { ...defaultConfig(), gemsPer10kGold: 0 },
    });
    expect(encodeShareState(state)).toBe("goldPer10k=0");
    expect(roundTrip(state).config.gemsPer10kGold).toBe(0);
  });
});

describe("resetting advanced settings", () => {
  /**
   * A state with every parameter the encoder can write off its default.
   *
   * The reset is measured against this rather than against a state with one
   * field moved, because the interesting failure is a field it *misses*, and a
   * field that was never touched cannot be missed.
   */
  const fullyEdited = (): ShareState =>
    withState({
      presetName: CUSTOM_PRESET,
      config: {
        ...defaultConfig(),
        winRate: 0.61,
        winRateMatches: 20,
        structure: { kind: "rounds", rounds: 4 },
        entryCostGems: 1234,
        entryCostGold: 9000,
        draftPacks: 4,
        draftPackValueGems: 110,
        packValueGems: 132,
        playInPointValueGems: 250,
        playBoxValueGems: 60_000,
        collectorBoxValueGems: 250_000,
        otherGoldPerDay: 900,
        eventsPerDay: 2,
        gemsPer10kGold: 2000,
        draftTokenValueGems: 900,
        mythicIcrValueGems: 60,
        rareCardValueGems: 30,
        uncommonIcrValueGems: 3,
        orbValueGems: 1,
        cardStyleValueGems: 2,
        sleeveValueGems: 25,
        avatarValueGems: 100,
        companionValueGems: 7,
        payouts: [
          { wins: 0, gems: 10, packs: 1 },
          { wins: 1, gems: 20, packs: 1 },
          { wins: 2, gems: 30, packs: 2, playInPoints: 1 },
          { wins: 3, gems: 40, packs: 3, boxes: [{ kind: "play", set: "latest" }] },
          {
            wins: 4,
            gems: 50,
            packs: 4,
            boxes: [{ kind: "collector", set: "msh" }, { kind: "collector" }],
          },
        ],
      },
      trials: 25_000,
      bankrollRuns: 2_500,
      seed: 7,
      startingGems: 12_000,
      startingGold: 5_000,
      maxEvents: 50,
      tab: "event",
      unit: "usd",
      gemsPerUsd: 350,
    });

  it("leaves a fresh load exactly as it was", () => {
    expect(resetAdvanced(defaultShareState())).toEqual(defaultShareState());
    expect(isAdvancedDefault(defaultShareState())).toBe(true);
  });

  /*
   * The scope, read off the link rather than asserted field by field: a
   * parameter that survives is a field the reset did not restore, and one that
   * disappears is a field it restored and should not have.
   *
   * The one blind spot is the payout table, which stays in the link either way
   * — restored to Premier's ladder it still differs from the Custom baseline,
   * because that baseline is resized to the structure and Premier's is not.
   * That is what the test below pins by value.
   */
  it("clears every advanced parameter and no other", () => {
    const touched = fullyEdited();
    const before = new URLSearchParams(encodeShareState(touched));
    const after = new URLSearchParams(encodeShareState(resetAdvanced(touched)));

    expect([...before.keys()].filter((k) => !after.has(k)).sort()).toEqual([
      "avatarValue",
      "cardStyleValue",
      "collectorBoxValue",
      "companionValue",
      "confMatches",
      "draftPackValue",
      "draftTokenValue",
      "eventsPerDay",
      "gemsPerUsd",
      "goldPer10k",
      "goldPerDay",
      "mythicIcrValue",
      "orbValue",
      "packValue",
      "playBoxValue",
      "playInValue",
      "rareCardValue",
      "runs",
      "seed",
      "sleeveValue",
      "trials",
      "uncommonIcrValue",
    ]);
    // The event on screen, the balance it is played from, and where the page
    // is pointed — none of which the dialog shows.
    expect([...after.keys()].sort()).toEqual([
      "draftPacks",
      "entry",
      "entryGold",
      "maxEvents",
      "payouts",
      "preset",
      "rounds",
      "startGems",
      "startGold",
      "tab",
      "unit",
      "wr",
    ]);
  });

  it("restores the values the dialog shows", () => {
    const reset = resetAdvanced(fullyEdited());
    const { config, ...ui } = defaultShareState();
    expect(reset.config.winRateMatches).toBe(config.winRateMatches);
    expect(reset.config.packValueGems).toBe(config.packValueGems);
    expect(reset.config.draftPackValueGems).toBe(config.draftPackValueGems);
    expect(reset.config.playInPointValueGems).toBe(config.playInPointValueGems);
    expect(reset.config.playBoxValueGems).toBe(config.playBoxValueGems);
    expect(reset.config.collectorBoxValueGems).toBe(config.collectorBoxValueGems);
    // The Mastery rewards group, which the reset reaches for the same reason it
    // reaches the rest: `resetAdvanced` names what it keeps, not what it clears,
    // so a rate added to the dialog is restored without anyone editing it.
    expect(reset.config.draftTokenValueGems).toBe(config.draftTokenValueGems);
    expect(reset.config.mythicIcrValueGems).toBe(config.mythicIcrValueGems);
    expect(reset.config.rareCardValueGems).toBe(config.rareCardValueGems);
    expect(reset.config.uncommonIcrValueGems).toBe(config.uncommonIcrValueGems);
    expect(reset.config.orbValueGems).toBe(config.orbValueGems);
    expect(reset.config.cardStyleValueGems).toBe(config.cardStyleValueGems);
    expect(reset.config.sleeveValueGems).toBe(config.sleeveValueGems);
    expect(reset.config.avatarValueGems).toBe(config.avatarValueGems);
    expect(reset.config.companionValueGems).toBe(config.companionValueGems);
    expect(reset.config.otherGoldPerDay).toBe(config.otherGoldPerDay);
    expect(reset.config.eventsPerDay).toBe(config.eventsPerDay);
    expect(reset.config.gemsPer10kGold).toBe(config.gemsPer10kGold);
    expect(reset.gemsPerUsd).toBe(ui.gemsPerUsd);
    expect(reset.trials).toBe(ui.trials);
    expect(reset.bankrollRuns).toBe(ui.bankrollRuns);
    expect(reset.seed).toBe(ui.seed);
  });

  it("keeps the event, the balance and the win rate", () => {
    const touched = fullyEdited();
    const reset = resetAdvanced(touched);
    expect(reset.presetName).toBe(touched.presetName);
    expect(reset.config.winRate).toBe(touched.config.winRate);
    expect(reset.config.structure).toEqual(touched.config.structure);
    expect(reset.config.entryCostGems).toBe(touched.config.entryCostGems);
    expect(reset.config.entryCostGold).toBe(touched.config.entryCostGold);
    expect(reset.config.draftPacks).toBe(touched.config.draftPacks);
    expect(reset.config.payouts).toEqual(touched.config.payouts);
    expect(reset.startingGems).toBe(touched.startingGems);
    expect(reset.startingGold).toBe(touched.startingGold);
    expect(reset.maxEvents).toBe(touched.maxEvents);
    expect(reset.tab).toBe(touched.tab);
    expect(reset.unit).toBe(touched.unit);
  });

  /*
   * The live box prices are not a setting — nobody typed them, and they are
   * never written to a link. Dropping them here would return every named box
   * to its generic average, changing the numbers on screen without changing
   * any field, and `isAdvancedDefault` could not report it: what it compares
   * is the two links, and neither carries the table.
   */
  it("keeps the live box prices, which are not a setting to reset", () => {
    const feed = {
      sets: [
        {
          code: "msh",
          name: "Marvel Super Heroes",
          releasedAt: "2026-06-26",
          boxes: { play: 23_444 },
        },
      ],
      latest: { play: "msh" },
      generatedAt: "2026-08-16T00:00:00.000Z",
    };
    const state = withState({ config: { ...defaultShareState().config, boxPrices: feed } });
    expect(resetAdvanced(state).config.boxPrices).toEqual(feed);
  });

  it("has nothing left to do once it has run", () => {
    expect(isAdvancedDefault(resetAdvanced(fullyEdited()))).toBe(true);
    expect(isAdvancedDefault(fullyEdited())).toBe(false);
  });

  it("counts only what the dialog owns as touched", () => {
    // Outside it: the balance, and the win rate its slider sets.
    expect(isAdvancedDefault(withState({ startingGems: 99_000 }))).toBe(true);
    expect(
      isAdvancedDefault(withState({ config: { ...defaultConfig(), winRate: 0.7 } })),
    ).toBe(true);
    // Inside it, one field from each group the dialog is divided into.
    expect(isAdvancedDefault(withState({ seed: 9 }))).toBe(false);
    expect(isAdvancedDefault(withState({ gemsPerUsd: 175 }))).toBe(false);
    expect(
      isAdvancedDefault(
        withState({ config: { ...defaultConfig(), winRateMatches: 20 } }),
      ),
    ).toBe(false);
    expect(
      isAdvancedDefault(
        withState({ config: { ...defaultConfig(), packValueGems: 0 } }),
      ),
    ).toBe(false);
    expect(
      isAdvancedDefault(
        withState({ config: { ...defaultConfig(), eventsPerDay: 3 } }),
      ),
    ).toBe(false);
  });
});

describe("payout table codec", () => {
  it("drops the trailing columns an event does not award", () => {
    expect(encodePayouts([{ wins: 0, gems: 50, packs: 1 }])).toBe("50-1");
  });

  it("names the boxes a row pays, and drops the empty points slot before them", () => {
    expect(
      encodePayouts([
        {
          wins: 0,
          gems: 0,
          packs: 0,
          boxes: [{ kind: "collector", set: "msh" }, { kind: "collector" }],
        },
      ]),
    ).toBe("0-0-collector.msh-collector");
  });

  it("keeps a zero that sits before a slot that is used", () => {
    expect(
      encodePayouts([{ wins: 0, gems: 0, packs: 0, playInPoints: 2 }]),
    ).toBe("0-0-2");
  });

  it("round-trips a ladder with points and boxes", () => {
    const payouts = [
      { wins: 0, gems: 0, packs: 1 },
      { wins: 1, gems: 250, packs: 1 },
      { wins: 2, gems: 1000, packs: 3, playInPoints: 2 },
      {
        wins: 3,
        gems: 2500,
        packs: 6,
        boxes: [
          { kind: "play" as const, set: "latest" },
          { kind: "collector" as const, set: "spm" },
          { kind: "collector" as const },
        ],
      },
    ];
    expect(decodePayouts(encodePayouts(payouts))).toEqual(payouts);
  });

  /*
   * Links written before a box could name its set spelled two counts in fixed
   * positions. They still have to mean what they meant, which is that many
   * boxes of no particular set — the same thing the generic rate prices today.
   */
  it("reads the old positional box counts as generic boxes", () => {
    expect(decodePayouts("0-0-0-1-2")).toEqual([
      {
        wins: 0,
        gems: 0,
        packs: 0,
        boxes: [{ kind: "play" }, { kind: "collector" }, { kind: "collector" }],
      },
    ]);
    // And a row that spelled points as well keeps them.
    expect(decodePayouts("5000-4-3-2")).toEqual([
      {
        wins: 0,
        gems: 5000,
        packs: 4,
        playInPoints: 3,
        boxes: [{ kind: "play" }, { kind: "play" }],
      },
    ]);
  });

  it("refuses a malformed box rather than guessing at it", () => {
    // A kind nothing pays.
    expect(decodePayouts("0-0-jumpstart.msh")).toBeNull();
    // A set code that is not one.
    expect(decodePayouts("0-0-play.MSH")).toBeNull();
    expect(decodePayouts("0-0-play.")).toBeNull();
    // Too many dots to be a kind and a set.
    expect(decodePayouts("0-0-play.msh.foil")).toBeNull();
    // A number after a box is not a sixth field.
    expect(decodePayouts("0-0-play-3")).toBeNull();
    // And the old limits still hold on the numbers themselves.
    expect(decodePayouts("0-0-0-0-0-0")).toBeNull();
  });

  it("survives form encoding with a set code in it", () => {
    const encoded = encodePayouts([
      { wins: 0, gems: 0, packs: 0, boxes: [{ kind: "play", set: "msh" }] },
    ]);
    expect(new URLSearchParams({ payouts: encoded }).toString()).toBe(
      `payouts=${encoded}`,
    );
  });

  it("survives form encoding untouched", () => {
    const encoded = encodePayouts([
      { wins: 0, gems: 50, packs: 1 },
      { wins: 1, gems: 100, packs: 2 },
    ]);
    expect(new URLSearchParams({ payouts: encoded }).toString()).toBe(
      `payouts=${encoded}`,
    );
  });

  it.each([
    ["", "empty"],
    ["50", "a row missing its pack count"],
    ["50-1-0-0-0-0", "a row with more columns than exist"],
    ["50-x", "a row that is not numeric"],
    ["50-1_", "a trailing separator"],
  ])("rejects %s (%s)", (raw) => {
    expect(decodePayouts(raw)).toBeNull();
  });
});

describe("input from a URL is not trusted", () => {
  it("falls back to the default preset for an unknown one", () => {
    expect(decodeShareState("preset=not-an-event").presetName).toBe(
      defaultShareState().presetName,
    );
  });

  it("clamps a win rate above 1", () => {
    expect(decodeShareState("wr=42").config.winRate).toBe(1);
  });

  it("drops values that are not numbers", () => {
    const fallback = defaultShareState();
    expect(decodeShareState("wr=banana").config.winRate).toBe(fallback.config.winRate);
    expect(decodeShareState("trials=NaN").trials).toBe(fallback.trials);
    expect(decodeShareState("seed=").seed).toBe(fallback.seed);
  });

  /*
   * The same ceilings the Advanced fields clamp to, which is why they are
   * asserted through `SIM_LIMITS` rather than as literals: a link and the
   * field it fills disagreeing is the failure worth catching, not the
   * particular number either of them lands on.
   */
  it("holds the ceilings the inputs hold", () => {
    expect(decodeShareState("trials=999999999").trials).toBe(SIM_LIMITS.trials);
    expect(decodeShareState("trials=0").trials).toBe(1);
    expect(decodeShareState("runs=9999999").bankrollRuns).toBe(SIM_LIMITS.bankrollRuns);
    expect(decodeShareState("runs=0").bankrollRuns).toBe(1);
    expect(decodeShareState("maxEvents=99999").maxEvents).toBe(SIM_LIMITS.maxEvents);
  });

  it("keeps the preset's ladder when the payout table is malformed", () => {
    const config = decodeShareState("preset=quick-draft&payouts=nonsense").config;
    expect(config.payouts).toEqual(configFromPreset(QUICK_DRAFT, defaultConfig()).payouts);
  });

  it("rejects a negative amount rather than feeding it to the model", () => {
    expect(decodePayouts("50--1")).toBeNull();
    expect(decodeShareState("entry=-500").config.entryCostGems).toBe(0);
  });

  it("keeps a row per reachable win count however the two disagree", () => {
    // A hand-edited URL naming a four-round event and a two-row ladder.
    const config = decodeShareState("rounds=4&payouts=50-1_100-2").config;
    expect(config.payouts).toHaveLength(maxPossibleWins(config.structure) + 1);
    expect(config.payouts.map((t) => t.wins)).toEqual([0, 1, 2, 3, 4]);
  });

  it("ignores a structure field for the kind it did not name", () => {
    const config = decodeShareState("rounds=3&maxWins=99").config;
    expect(config.structure).toEqual({ kind: "rounds", rounds: 3 });
  });

  it("falls back to a sane elimination shape from a rounds preset", () => {
    const config = decodeShareState("preset=traditional-draft&maxWins=5").config;
    expect(config.structure).toEqual({ kind: "elimination", maxWins: 5, maxLosses: 3 });
  });
});
