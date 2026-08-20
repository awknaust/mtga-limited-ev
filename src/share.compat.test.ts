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
  encodePayouts,
  encodeShareState,
  presetSlug,
} from "./share";
import { defaultShareState, type ShareState } from "./state";
import {
  CURRENT_MASTERY_TRACK,
  DEFAULT_COLLECTOR_BOX_VALUE_GEMS,
  DEFAULT_PLAY_BOX_VALUE_GEMS,
  EMPTY_BOX_PRICES,
  PRESETS,
  goldPerEvent,
  goldValueGems,
  icrValueGems,
  grossValue,
  maxPossibleWins,
  meanGamesPerEvent,
  type EventConfig,
} from "./lib";

/**
 * Everything a link resolves to, rendered compactly.
 *
 * A whole-object snapshot would run to fifty lines and bury the one that
 * moved. This keeps a diff pointing at the field that actually changed.
 */
function fingerprint(state: ShareState): string {
  const c = state.config;
  // A price or no price at all, spelled the way a link spells it — "none"
  // rather than a bare `null`, so the two readings are told apart on sight.
  const price = (p: number | null): string => (p === null ? "none" : String(p));
  return [
    `preset     ${state.presetName}`,
    `winRate    ${c.winRate} over ${c.winRateMatches} matches`,
    `structure  ${JSON.stringify(c.structure)}`,
    `entry      ${price(c.entryCostGems)} gems / ${price(c.entryCostGold)} gold / ${price(c.entryCostPlayInPoints)} points`,
    `draft      ${c.draftPacks} packs @ ${c.draftPackValueGems}`,
    `values     pack=${c.packValueGems} mythicPack=${c.mythicPackValueGems} cubePack=${c.cubePackValueGems} playIn=${c.playInPointValueGems} qualToken=${c.qualifierTokenValueGems} playBox=${c.playBoxValueGems} collBox=${c.collectorBoxValueGems} dailyIcr=${c.dailyWinIcrValueGems}`,
    `gold       other=${c.otherGoldPerDay}/day over ${c.gamesPerDay} games at ${c.gamesPerMatch}/match, goldPer10k=${c.gemsPer10kGold}`,
    /*
     * Derived rather than stored, and that is the point. A link pins inputs,
     * but what a reader cares about is the answer, and the two can come apart:
     * moving daily-win gold onto the ladder changed what `goldPerDay=0` means
     * without touching any field recorded above. Pinning what the model
     * credits an entry closes that gap. This line used to pin the entry the
     * gold *discounted*; gold is counted as earnings now, so it pins the
     * credit instead — the same gold, on the other side of the ledger.
     */
    `credits    ${goldPerEvent(c).toFixed(1)} gold/event = ${goldValueGems(c).toFixed(1)} gems, cards = ${icrValueGems(c).toFixed(1)} gems`,
    `payouts    ${encodePayouts(c.payouts)}`,
    `bankroll   gems=${state.startingGems} gold=${state.startingGold} points=${state.startingPlayInPoints} maxGames=${state.maxGames}`,
    `sim        runs=${state.bankrollRuns} seed=${state.seed}`,
    `display    tab=${state.tab} unit=${state.unit} gemsPerUsd=${state.gemsPerUsd}`,
    /*
     * Here for the same reason the derived entry above is. No link in the
     * corpus carries a `compare` parameter — they all predate the tab — so
     * every one of them resolves to whatever the default selection happens to
     * be, and changing that default silently changes what all of them show.
     * Recorded, so moving it takes a decision.
     */
    `compare    ${state.compareSelection.join(", ") || "(none)"}`,
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
  /*
   * The three entry prices, which a link could only spell as a number until
   * a price could be absent. Zero was how a cleared one was written, and it
   * still decodes to the same thing it always meant — a currency the event
   * does not take — so these three pin that the change of spelling was not a
   * change of meaning.
   */
  ["gold price cleared, in the old spelling", "?entryGold=0"],
  ["gold price cleared, in the new one", "?entryGold=none"],
  ["no price named in any currency, which is a free entry", "?entry=0&entryGold=0"],
  ["display only", "?tab=about&unit=usd&gemsPerUsd=350"],
  ["bankroll only", "?startGems=20000&startGold=15000&maxEvents=200&spendWinnings=1"],
  ["custom elimination shape", "?preset=custom&maxWins=5&maxLosses=2&payouts=0-0_100-1_200-2_400-3_800-4_1600-5"],
  /*
   * Counts past the ceilings, where raising a cap changes what an old link
   * says: `runs=999999` resolved to 200,000 before the simulations moved off
   * the main thread and resolves to itself after. Nothing else in the corpus
   * exceeds a cap, so without this row that break happens silently — which is
   * the one thing this file exists to prevent. `trials` is retired and reads
   * as nothing at all now, which the fingerprint records — and `maxEvents`
   * has since joined it, so this row's snapshot shows the default budget.
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
  /*
   * Mythic packs, which arrived after this file did. Contender Draft's ladder
   * paid them from the start and spelled them as ordinary packs — 14 and 22 at
   * the top two rungs — until the model could price the two apart. Both
   * spellings are pinned here: the preset's own, and a link that carries the
   * old fold and must go on meaning fourteen ordinary packs.
   */
  [
    "a custom ladder paying mythic packs",
    "?preset=custom&maxWins=3&maxLosses=2&payouts=0-0_0-0_1400-3_4200-10-mythic.4&mythicPackValue=45",
  ],
  [
    "the old fold, where mythic packs were spelled as packs",
    "?preset=custom&maxWins=3&maxLosses=2&payouts=0-0_0-0_1400-3_4200-14",
  ],
  /*
   * Cube Prize Packs, which arrived with the mythic ones. Same pair: a ladder
   * spelling them, and a link from when the cube drafts counted them as
   * ordinary packs. The second is the one that matters — `?preset=
   * premier-cube-draft` moved underneath every link naming it, and this is
   * what someone who had spelled the old ladder out by hand still holds.
   */
  [
    "a custom ladder paying cube packs",
    "?preset=custom&maxWins=3&maxLosses=2&payouts=0-0_0-0_1000-0-cube.2_2200-0-cube.7&cubePackValue=60",
  ],
  [
    "the cube ladder as it was spelled before cube packs existed",
    "?preset=custom&maxWins=3&maxLosses=2&payouts=50-1_100-1_250-2_2200-7",
  ],
  /*
   * All three kinds of pack on one row. No real ladder pays that and none is
   * expected to, but the codec has to say which is which whatever it is
   * handed, and the tokens are order-independent — so this pins that a row
   * naming them in an order the encoder would not choose still decodes to the
   * same three counts.
   */
  [
    "every kind of pack at once, in an order the encoder would not write",
    "?preset=custom&maxWins=2&maxLosses=2&payouts=0-0_0-0_500-3-cube.5-mythic.4",
  ],
  /*
   * The third entry currency, and the token nothing prices. Three things here
   * have to go on meaning what they mean: `startPoints` is a banked stock the
   * run spends, `entryPoints` is a price rather than a reward, and `token.1`
   * in the ladder is a Qualifier token rather than a number in a positional
   * slot. The last is the one with teeth — the slots it sits past belong to
   * the old `gems-packs-points-playBoxes-collectorBoxes` form, still read
   * above, so a count there would re-read every link written before boxes
   * named their sets.
   */
  ["qualifier play-in — points in, token out", "?preset=qualifier-play-in-bo1&startPoints=60"],
  [
    "custom ladder paying a qualifier token",
    "?preset=custom&maxWins=3&maxLosses=1&payouts=0-0_0-0_0-0_6000-0-token.1&entryPoints=20&qualifierTokenValue=4830",
  ],
  /*
   * The day knob in its old unit, written when the field was events rather
   * than games. An author who wrote `eventsPerDay=1` chose one event a day,
   * and the decoder honours that by converting at the event's own length —
   * exactly, for a best-of-one event, so the gold these links credit did not
   * move when the unit did. Zero still switches gold off entirely.
   */
  ["the day knob in its old unit, one event a day", "?eventsPerDay=1"],
  ["gold priced out, in the old unit", "?eventsPerDay=0"],
  /*
   * The stop knob, in both units. The old one is the break this file has had
   * to accept a second time: `maxEvents` counted entries, the knob counts
   * games, and the old value is not converted — a link carrying it falls back
   * to the default budget. Pinned so the fallback itself stays a promise.
   */
  ["the stop knob in games", "?maxGames=300"],
  ["the stop knob in its old unit, which no longer reads", "?maxEvents=200"],
  /*
   * The retired `format` parameter, which named the match format back when
   * the win rate was converted per game. Its meaning — this is a best-of-three
   * event — is what `gamesPerMatch` carries now, so an old custom link that
   * spelled it out decodes to a day of best-of-three play.
   */
  ["a best-of-three day, in the old spellings", "?preset=custom&format=bo3&rounds=3&eventsPerDay=2"],
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
        entryCostPlayInPoints: 27,
        otherGoldPerDay: 3,
        gamesPerDay: 4,
        gamesPerMatch: 2.5,
        winRateMatches: 33,
        gemsPer10kGold: 5,
        draftPacks: 6,
        draftPackValueGems: 7,
        packValueGems: 8,
        mythicPackValueGems: 27,
        cubePackValueGems: 28,
        playInPointValueGems: 9,
        qualifierTokenValueGems: 28,
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
      bankrollRuns: 17,
      seed: 13,
      startingGems: 14,
      startingGold: 15,
      startingPlayInPoints: 29,
      maxGames: 16,
      tab: "about",
      // The only season there is, so it cannot differ from the default and
      // cannot appear in the link. The names list below says as much.
      masterySlug: CURRENT_MASTERY_TRACK.slug,
      // Anything but the default three, so the parameter is emitted at all.
      compareSelection: [PRESETS[1].name],
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
      "compare",
      "confMatches",
      "cubePackValue",
      "draftPackValue",
      "draftPacks",
      "draftTokenValue",
      "entry",
      "entryGold",
      "entryPoints",
      "gamesPerDay",
      "gamesPerMatch",
      "gemsPerUsd",
      "goldPer10k",
      "goldPerDay",
      "maxGames",
      "maxLosses",
      "maxWins",
      "mythicIcrValue",
      "mythicPackValue",
      "orbValue",
      "packValue",
      "payouts",
      "playBoxValue",
      "playInValue",
      "preset",
      "qualifierTokenValue",
      "rounds",
      "runs",
      "seed",
      "sleeveValue",
      "startGems",
      "startGold",
      "startPoints",
      "tab",
      "uncommonIcrValue",
      "unit",
      "wr",
    ]);
  });

  it("drops the retired parameters without disturbing the rest", () => {
    /*
     * Two parameters have been withdrawn rather than renamed, and links in
     * the corpus below carry both. `spendWinnings` decodes to a run that
     * holds its winnings — the only behaviour the model has left. `trials`
     * sized a per-event Monte Carlo that no longer exists; the tab it fed is
     * closed form, so a link carrying it means exactly what it did. Neither
     * name is emitted, and neither may ever be reused for something else.
     */
    const state = decodeShareState("?spendWinnings=1&trials=250000&startGems=20000");
    expect(state.startingGems).toBe(20_000);
    expect(encodeShareState(state)).toBe("startGems=20000");
  });

  it("drops the retired stop knob, whose unit changed out from under it", () => {
    /*
     * `maxEvents` counted the stopping point in entries; the knob counts games
     * now, and unlike `eventsPerDay` the old value is *not* converted — the
     * deliberate break `share.ts` records. A link carrying it falls back to
     * the default games budget, exactly as a misspelling would, and the name
     * may never be reused.
     */
    const state = decodeShareState("?maxEvents=200&startGems=20000");
    expect(state.maxGames).toBe(defaultShareState().maxGames);
    expect(encodeShareState(state)).toBe("startGems=20000");
  });

  it("reads the day knob's old unit, converting events to games at the event's own length", () => {
    /*
     * `eventsPerDay` is legacy rather than retired: the field it set still
     * exists, in a new unit, so the old spelling is converted instead of
     * dropped. For a best-of-one event the conversion is exact — n events'
     * worth of games at the same rate climbs the ladder to the same rung the
     * old model read — which is what the gold figure below pins: one Premier
     * Draft a day was 489 gold off the ladder plus the 600 quest, and still is.
     */
    const one = decodeShareState("?eventsPerDay=1").config;
    expect(one.gamesPerDay).toBeCloseTo(meanGamesPerEvent(one), 4);
    expect(goldPerEvent(one)).toBeCloseTo(1089, 0);
    // Zero still means gold counts for nothing, as it always did.
    expect(decodeShareState("?eventsPerDay=0").config.gamesPerDay).toBe(0);
    expect(goldPerEvent(decodeShareState("?eventsPerDay=0").config)).toBe(0);
    // The new parameter wins wherever a link carries both.
    expect(decodeShareState("?eventsPerDay=3&gamesPerDay=7").config.gamesPerDay).toBe(7);
  });

  it("reads the retired format parameter as the games a match takes", () => {
    // `format` chose best-of-three back when the win rate converted per game;
    // choosing best-of-three is exactly what gamesPerMatch says now, so the
    // old name keeps its old meaning rather than being dropped — and yields
    // to the new parameter, like the day knob above.
    expect(decodeShareState("?preset=custom&format=bo3").config.gamesPerMatch).toBe(2.5);
    expect(decodeShareState("?preset=traditional-draft&format=bo1").config.gamesPerMatch).toBe(1);
    expect(
      decodeShareState("?preset=custom&format=bo3&gamesPerMatch=3").config.gamesPerMatch,
    ).toBe(3);
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
      "constructed-event",
      "traditional-constructed-event",
      "qualifier-play-in-bo1",
      "qualifier-play-in-bo3",
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
      entry      1500 gems / 10000 gold / none points
      draft      3 packs @ 23
      values     pack=22 mythicPack=37 cubePack=51 playIn=200 qualToken=0 playBox=29866 collBox=120116 dailyIcr=0
      gold       other=600/day over 12 games at 1/match, goldPer10k=1500
      credits    616.0 gold/event = 92.4 gems, cards = 0.0 gems
      payouts    50-1_100-1_250-2_1000-2_1400-3_1600-4_1800-5_2200-6
      bankroll   gems=3400 gold=5000 points=0 maxGames=120
      sim        runs=10000 seed=1
      display    tab=bankroll unit=gems gemsPerUsd=200
      compare    Premier Draft, Quick Draft, Traditional Draft, Pick Two Draft, Sealed"
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
    // box, 250,000 a collector box, and four draft packs at 110 — plus the
    // day's gold, which every entry is credited since gold became earnings
    // rather than a discount on the entry. That move is the one deliberate
    // shift in what these links are worth; the box terms did not move.
    const flat = 4 * 110 + goldValueGems(config) + icrValueGems(config);
    expect(grossValue(config, 0)).toBeCloseTo(10 + 1 * 132 + flat, 9);
    // `4000-3-0-1` — three packs and one play box.
    expect(grossValue(config, 3)).toBeCloseTo(4000 + 3 * 132 + 60_000 + flat, 9);
    // `5000-4-0-0-2` — four packs and two collector boxes.
    expect(grossValue(config, 4)).toBeCloseTo(5000 + 4 * 132 + 2 * 250_000 + flat, 9);
    // `12000-6-4-0-3` — six packs, four points and three collector boxes.
    expect(grossValue(config, 5)).toBeCloseTo(
      12_000 + 6 * 132 + 4 * 250 + 3 * 250_000 + flat,
      9,
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
    // Plus what the day credits in every row — the gold, and the cards off
    // the same ladder — which every entry has been credited since gold became
    // earnings rather than a discount on the entry. The box terms did not
    // move, which is what this is here to say.
    const day = (c: EventConfig) => goldValueGems(c) + icrValueGems(c);
    const play = bare("?preset=arena-direct-play");
    expect(grossValue(play, 6)).toBeCloseTo(
      DEFAULT_PLAY_BOX_VALUE_GEMS + 6 * play.draftPackValueGems + day(play),
      9,
    );
    expect(grossValue(play, 7)).toBeCloseTo(
      2 * DEFAULT_PLAY_BOX_VALUE_GEMS + 6 * play.draftPackValueGems + day(play),
      9,
    );

    const collector = bare("?preset=arena-direct-collector");
    expect(grossValue(collector, 7)).toBeCloseTo(
      DEFAULT_COLLECTOR_BOX_VALUE_GEMS +
        6 * collector.draftPackValueGems +
        day(collector),
      9,
    );

    // The cube is phantom, so nothing but the boxes and the day's credits is
    // in its top two rows.
    const cube = bare("?preset=arena-direct-cube");
    expect(grossValue(cube, 6)).toBeCloseTo(DEFAULT_PLAY_BOX_VALUE_GEMS + day(cube), 9);
    expect(grossValue(cube, 7)).toBeCloseTo(
      2 * DEFAULT_PLAY_BOX_VALUE_GEMS + day(cube),
      9,
    );
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
    ["an absurd magnitude", "?trials=1e308&maxGames=1e308&entry=1e308"],
    ["a percent-encoded separator", "?payouts=50%2D1"],
    ["a payout table with no rows", "?payouts="],
  ])("decodes %s to a usable state", (_name, search) => {
    const state = decodeShareState(search);
    expect(Number.isFinite(state.config.winRate)).toBe(true);
    expect(Number.isFinite(state.maxGames)).toBe(true);
    expect(state.maxGames).toBeGreaterThanOrEqual(1);
    /*
     * A price or no price at all, never a number the model cannot use: a
     * negative amount is damage, and it lands on the absence rather than on a
     * gem price below zero.
     */
    const entry = state.config.entryCostGems;
    expect(entry === null || (Number.isFinite(entry) && entry > 0)).toBe(true);
    expect(state.config.payouts).toHaveLength(
      maxPossibleWins(state.config.structure) + 1,
    );
  });
});
