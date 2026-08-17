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
import {
  CURRENT_MASTERY_TRACK,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  EMPTY_BOX_PRICES,
  PRESETS,
  effectiveEntryGems,
  goldPerEvent,
  grossValue,
  maxPossibleWins,
} from "./lib";

/**
 * A box value as a link means it: the number the link spelled out, or
 * `market` where it spelled none.
 *
 * The two box values are the one pair of defaults that are not a fixed
 * number. Left out of a link, a box value means "whatever boxes trade at" —
 * the app derives it from the feed it ships a copy of, and every build
 * refreshes that copy. So the resolved number moves with the market by
 * design, and printing it here would make this file fire on every build
 * while saying nothing about the link. What *is* the link's meaning — that it
 * left the value to the market, or that it fixed one — is what this prints.
 */
const boxValue = (gems: number, baked: number): string =>
  gems === baked ? "market" : String(gems);

/**
 * Everything a link resolves to, rendered compactly.
 *
 * A whole-object snapshot would run to fifty lines and bury the one that
 * moved. This keeps a diff pointing at the field that actually changed.
 */
function fingerprint(state: ShareState): string {
  const c = state.config;
  return [
    `preset     ${state.presetName}`,
    `winRate    ${c.winRate} over ${c.winRateMatches} matches`,
    `structure  ${JSON.stringify(c.structure)}`,
    `entry      ${c.entryCostGems} gems / ${c.entryCostGold} gold`,
    `draft      ${c.draftPacks} packs @ ${c.draftPackValueGems}`,
    `values     pack=${c.packValueGems} playIn=${c.playInPointValueGems} playBox=${boxValue(c.playBoxValueGems, DEFAULT_PLAY_BOX_VALUE_GEMS)} collBox=${boxValue(c.collectorBoxValueGems, DEFAULT_COLLECTOR_BOX_VALUE_GEMS)}`,
    `gold       other=${c.otherGoldPerDay}/day over ${c.eventsPerDay} events, goldPer10k=${c.gemsPer10kGold}`,
    /*
     * Derived rather than stored, and that is the point. A link pins inputs,
     * but what a reader cares about is the answer, and the two can come apart:
     * moving daily-win gold onto the ladder changed what `goldPerDay=0` means
     * without touching any field recorded above. Pinning the entry the model
     * actually charges closes that gap.
     */
    `charges    ${effectiveEntryGems(c).toFixed(1)} gems (${goldPerEvent(c).toFixed(1)} gold/event)`,
    `payouts    ${encodePayouts(c.payouts)}`,
    `bankroll   gems=${state.startingGems} gold=${state.startingGold} maxEvents=${state.maxEvents}`,
    `sim        trials=${state.trials} runs=${state.bankrollRuns} seed=${state.seed}`,
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
  /*
   * Counts past the ceilings, where raising a cap changes what an old link
   * says: `runs=999999` resolved to 200,000 before the simulations moved off
   * the main thread and resolves to itself after. Nothing else in the corpus
   * exceeds a cap, so without this row that break happens silently — which is
   * the one thing this file exists to prevent.
   */
  ["counts above the ceilings", "?trials=999999999&runs=999999&maxEvents=99999"],
  ["mastery tab", "?tab=mastery"],
  ["mastery rates, cosmetics priced", "?tab=mastery&orbValue=5&mythicIcrValue=60&draftTokenValue=0"],
  /*
   * Boxes that name their set, which is what a ladder pays once the live feed
   * can price one. The set codes are the contract here: a link naming `msh`
   * has to go on meaning a Marvel Super Heroes box, priced from the feed when
   * it has one and at the generic rate when it does not.
   */
  [
    "custom ladder naming its boxes",
    "?preset=custom&maxWins=3&maxLosses=2&payouts=0-0_0-0_0-0-play.msh_0-0-play.latest-collector.spm",
  ],
  /*
   * Boxes valued at nothing, which the generic rate says for named boxes too
   * — otherwise "zero these out" would leave an Arena Direct still paying for
   * its boxes at market, and this link would stop meaning what it says.
   */
  ["arena direct with boxes valued at nothing", "?preset=arena-direct-play&playBoxValue=0"],
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
        structure: { kind: "rounds", rounds: 4 },
        entryCostGems: 1,
        entryCostGold: 2,
        otherGoldPerDay: 3,
        eventsPerDay: 4,
        winRateMatches: 33,
        gemsPer10kGold: 5,
        draftPacks: 6,
        draftPackValueGems: 7,
        packValueGems: 8,
        playInPointValueGems: 9,
        playBoxValueGems: 10,
        collectorBoxValueGems: 11,
        draftTokenValueGems: 18,
        mythicIcrValueGems: 19,
        rareCardValueGems: 20,
        uncommonIcrValueGems: 21,
        orbValueGems: 22,
        cardStyleValueGems: 23,
        sleeveValueGems: 24,
        avatarValueGems: 25,
        companionValueGems: 26,
        payouts: [
          { wins: 0, gems: 1, packs: 1 },
          { wins: 1, gems: 2, packs: 2 },
          { wins: 2, gems: 3, packs: 3 },
          { wins: 3, gems: 4, packs: 4 },
          { wins: 4, gems: 5, packs: 5 },
        ],
      },
      trials: 12,
      bankrollRuns: 17,
      seed: 13,
      startingGems: 14,
      startingGold: 15,
      maxEvents: 16,
      tab: "about",
      // The only season there is, so it cannot differ from the default and
      // cannot appear in the link. The names list below says as much.
      masterySlug: CURRENT_MASTERY_TRACK.slug,
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
      "avatarValue",
      "cardStyleValue",
      "collectorBoxValue",
      "companionValue",
      "confMatches",
      "draftPackValue",
      "draftPacks",
      "draftTokenValue",
      "entry",
      "entryGold",
      "eventsPerDay",
      "gemsPerUsd",
      "goldPer10k",
      "goldPerDay",
      "maxEvents",
      "maxLosses",
      "maxWins",
      "mythicIcrValue",
      "orbValue",
      "packValue",
      "payouts",
      "playBoxValue",
      "playInValue",
      "preset",
      "rounds",
      "runs",
      "seed",
      "sleeveValue",
      "startGems",
      "startGold",
      "tab",
      "trials",
      "uncommonIcrValue",
      "unit",
      "wr",
    ]);
  });

  it("drops the retired spendWinnings without disturbing the rest", () => {
    /*
     * The one parameter that has been withdrawn rather than renamed. Two links
     * in the corpus below carry it, and what they now mean is a run that holds
     * its winnings — the only behaviour the model has left. The name is not
     * emitted and must never be reused for something else.
     */
    const state = decodeShareState("?spendWinnings=1&startGems=20000");
    expect(state.startingGems).toBe(20_000);
    expect(encodeShareState(state)).toBe("startGems=20000");
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
      "traditional-sealed",
      "contender-draft",
      "arena-direct-cube",
      "arena-direct-play",
      "arena-direct-collector",
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
      winRate    0.55 over 100 matches
      structure  {"kind":"elimination","maxWins":7,"maxLosses":3}
      entry      1500 gems / 10000 gold
      draft      3 packs @ 23
      values     pack=22 playIn=200 playBox=market collBox=market
      gold       other=600/day over 1 events, goldPer10k=1500
      charges    1336.7 gems (1088.8 gold/event)
      payouts    50-1_100-1_250-2_1000-2_1400-3_1600-4_1800-5_2200-6
      bankroll   gems=3000 gold=0 maxEvents=20
      sim        trials=100000 runs=10000 seed=1
      display    tab=bankroll unit=gems gemsPerUsd=200"
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

  /*
   * The one break this file has had to accept deliberately, pinned by value
   * rather than by spelling.
   *
   * Boxes used to be two counts in fixed positions on a payout row, and are
   * now a list naming what each box is. The canonical spelling of every old
   * link with a box in it therefore moved, and the snapshots above were
   * re-recorded for it. What must *not* have moved is what those links are
   * worth, and a fingerprint showing the payout string cannot say so — an
   * old count read as one box instead of two would re-encode differently and
   * look like the same kind of change.
   *
   * So this prices the ladder instead, against figures worked out from the
   * link's own numbers rather than from the decoder: an old link's boxes name
   * no set, so they are worth the generic rates the link itself spells out.
   */
  it("keeps an old positional box link worth exactly what it was worth", () => {
    const { config } = decodeShareState(CORPUS[6][1]);
    // From demo 5's own parameters: 132 a pack, 250 a point, 60,000 a play
    // box, 250,000 a collector box, and four draft packs at 110.
    const pool = 4 * 110;
    expect(grossValue(config, 0)).toBe(10 + 1 * 132 + pool);
    // `4000-3-0-1` — three packs and one play box.
    expect(grossValue(config, 3)).toBe(4000 + 3 * 132 + 60_000 + pool);
    // `5000-4-0-0-2` — four packs and two collector boxes.
    expect(grossValue(config, 4)).toBe(5000 + 4 * 132 + 2 * 250_000 + pool);
    // `12000-6-4-0-3` — six packs, four points and three collector boxes.
    expect(grossValue(config, 5)).toBe(
      12_000 + 6 * 132 + 4 * 250 + 3 * 250_000 + pool,
    );
  });

  it("keeps the Arena Direct ladders worth what they were, absent a feed", () => {
    /*
     * The presets moved from counting boxes to naming them, so the same
     * question applies to a link that names one. The table is never carried
     * in a URL, so what a decoded link prices its boxes from is whatever the
     * app holds when it is opened — the shipped copy of the feed, then the
     * live one. With neither, a named box is worth its kind's generic rate,
     * and these come to what they came to before boxes had names at all.
     */
    const bare = (search: string) => ({
      ...decodeShareState(search).config,
      boxPrices: EMPTY_BOX_PRICES,
    });
    const play = bare("?preset=arena-direct-play");
    expect(grossValue(play, 6)).toBe(
      DEFAULT_PLAY_BOX_VALUE_GEMS + 6 * play.draftPackValueGems,
    );
    expect(grossValue(play, 7)).toBe(
      2 * DEFAULT_PLAY_BOX_VALUE_GEMS + 6 * play.draftPackValueGems,
    );

    const collector = bare("?preset=arena-direct-collector");
    expect(grossValue(collector, 7)).toBe(
      DEFAULT_COLLECTOR_BOX_VALUE_GEMS + 6 * collector.draftPackValueGems,
    );

    // The cube is phantom, so nothing but the boxes is in its top two rows.
    const cube = bare("?preset=arena-direct-cube");
    expect(grossValue(cube, 6)).toBe(DEFAULT_PLAY_BOX_VALUE_GEMS);
    expect(grossValue(cube, 7)).toBe(2 * DEFAULT_PLAY_BOX_VALUE_GEMS);
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
