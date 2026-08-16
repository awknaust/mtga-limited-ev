import { describe, expect, it } from "vitest";
import {
  CURRENT_MASTERY_TRACK,
  DEFAULT_COSMETIC_VALUE_GEMS,
  DEFAULT_DRAFT_TOKEN_VALUE_GEMS,
  DEFAULT_MYTHIC_ICR_VALUE_GEMS,
  DEFAULT_PACK_VALUE_GEMS,
  DEFAULT_RARE_CARD_VALUE_GEMS,
  DEFAULT_UNCOMMON_ICR_VALUE_GEMS,
  GEMS_PER_10K_GOLD,
  MASTERY_REWARD_KINDS,
  PREMIER_DRAFT,
  THE_HOBBIT_MASTERY,
  defaultConfig,
  masteryRate,
  masteryValue,
  type EventConfig,
} from "./index";

const track = THE_HOBBIT_MASTERY;
const config = (over: Partial<EventConfig> = {}): EventConfig => ({
  ...defaultConfig(),
  ...over,
});
const value = (over: Partial<EventConfig> = {}) => masteryValue(track, config(over));

/**
 * What the two Wizards pages agree the whole season pays.
 *
 * These are read off the Mastery Details article, which publishes column totals
 * and nothing per level. The track data is transcribed from the *other* page,
 * which publishes levels 1-40 and no totals. Asserting one against the other is
 * the only independent check either source gets, and it is what makes the
 * inferred levels 41-45 defensible rather than a guess.
 */
const PUBLISHED_FREE_TOTALS = { packs: 21, orbs: 5 };
const PUBLISHED_PASS_TOTALS = {
  packs: 20,
  gems: 1200,
  gold: 4000,
  mythicIcr: 10,
  draftToken: 1,
  orbs: 30,
  cardStyles: 25,
  sleeves: 2,
  avatars: 1,
  companions: 3,
};

describe("the Hobbit mastery track", () => {
  it("sums to the totals Wizards publishes for the season", () => {
    const v = value();
    for (const [kind, count] of Object.entries(PUBLISHED_FREE_TOTALS)) {
      expect(v.freeTotals[kind as keyof typeof v.freeTotals]).toBe(count);
    }
    for (const [kind, count] of Object.entries(PUBLISHED_PASS_TOTALS)) {
      expect(v.passTotals[kind as keyof typeof v.passTotals]).toBe(count);
    }
  });

  /*
   * The tail, which came off an in-game screenshot rather than the published
   * table and so has no second source of its own. Pinned by the shape of the
   * curve: level 40's 600 gems is the last large step, levels 41-43 and 45 are
   * cosmetics worth nothing, and the four Tarkir boosters at 44 are the only
   * thing left that moves it.
   */
  it("closes out the track with the gems at 40 and the boosters at 44", () => {
    const at = (level: number) =>
      value().levelValues.find((l) => l.level === level)?.cumulativePassGems ?? 0;
    expect(at(39)).toBeCloseTo(3532, 9);
    expect(at(40)).toBeCloseTo(4132, 9); // + 600 gems
    expect(at(43)).toBeCloseTo(4132, 9); // cosmetics only
    expect(at(44)).toBeCloseTo(4220, 9); // + 4 packs × 22
    expect(at(45)).toBeCloseTo(4220, 9);
    expect(value().pass).toBeCloseTo(4220, 9);
  });

  /*
   * Wizards' table prints level 35's text again at 36; in game the slot shows a
   * paw print, so it is a companion. The reconciliation test above said so first
   * — taken literally the table gives 26 card styles against a published 25, and
   * 2 companions against a published 3 — which is the case for keeping that test
   * even though it looks like it only restates the data.
   */
  it("reads level 36 as the Thorin companion, not a repeated card style", () => {
    const lvl = track.levels.find((l) => l.level === 36);
    expect(lvl?.pass.rewards).toEqual({ companions: 1, orbs: 1 });
    expect(lvl?.free.rewards).toEqual({ packs: 1 });
  });

  it("covers every level from 1 to the pass cap, exactly once", () => {
    expect(track.levels.map((l) => l.level)).toEqual(
      Array.from({ length: track.passCap }, (_, i) => i + 1),
    );
    expect(track.freeCap).toBe(42);
    expect(track.passCap).toBe(45);
    expect(track.priceGems).toBe(3400);
  });

  /*
   * A row someone pasted the text of and forgot to parse would be worth nothing
   * and would look perfectly fine on screen — the reward table shows `text`.
   * This is the only thing that would catch it.
   */
  it("parses every level whose text says it pays something", () => {
    for (const lvl of track.levels) {
      for (const column of [lvl.free, lvl.pass]) {
        if (column.text !== "") {
          expect(Object.keys(column.rewards).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("knows every reward kind the track actually uses", () => {
    const used = new Set<string>();
    for (const lvl of track.levels) {
      for (const column of [lvl.free, lvl.pass]) {
        for (const kind of Object.keys(column.rewards)) used.add(kind);
      }
    }
    for (const kind of used) {
      expect(MASTERY_REWARD_KINDS).toContain(kind);
    }
  });
});

describe("mastery reward rates", () => {
  it("prices ICRs at Arena's published duplicate protection", () => {
    // "20 Gems for rares, 40 Gems for mythic Rares".
    expect(DEFAULT_MYTHIC_ICR_VALUE_GEMS).toBe(40);
    expect(DEFAULT_RARE_CARD_VALUE_GEMS).toBe(20);
  });

  it("prices an uncommon ICR at its 5% upgrade alone", () => {
    expect(DEFAULT_UNCOMMON_ICR_VALUE_GEMS).toBeCloseTo(1.125, 10);
    expect(DEFAULT_UNCOMMON_ICR_VALUE_GEMS).toBe(
      0.05 * ((7 / 8) * 20 + (1 / 8) * 40),
    );
  });

  /*
   * Pinned as a literal *and* as the derivation, the way the box values are.
   * The derivation alone would have happily agreed with itself while the entry
   * cost was wrong, which is the failure DEFAULT_PLAY_BOX_VALUE_GEMS documents.
   */
  it("prices a draft token at the Premier Draft entry it replaces", () => {
    expect(DEFAULT_DRAFT_TOKEN_VALUE_GEMS).toBe(1500);
    expect(DEFAULT_DRAFT_TOKEN_VALUE_GEMS).toBe(PREMIER_DRAFT.entryCostGems);
  });

  it("prices cosmetics at nothing by default", () => {
    expect(DEFAULT_COSMETIC_VALUE_GEMS).toBe(0);
    const c = config();
    for (const kind of ["orbs", "cardStyles", "sleeves", "avatars", "companions"] as const) {
      expect(masteryRate(kind, c)).toBe(0);
    }
  });

  it("takes gems, gold and packs from the model's own holding rates", () => {
    const c = config();
    expect(masteryRate("gems", c)).toBe(1);
    expect(masteryRate("gold", c)).toBe(GEMS_PER_10K_GOLD / 10000);
    expect(masteryRate("packs", c)).toBe(DEFAULT_PACK_VALUE_GEMS);
    // Gold valued at nothing, which the config spells as a rate of zero.
    expect(masteryRate("gold", config({ gemsPer10kGold: 0 }))).toBe(0);
  });
});

describe("masteryValue", () => {
  /*
   * Hand-derived, and every term checkable against the track:
   *
   *     1,200 gems                          = 1,200
   *     1 draft token × 1,500               = 1,500
   *     4,000 gold ÷ (20/3)                 =   600
   *     20 packs × 22                       =   440
   *     10 mythic ICR × 40                  =   400
   *     4 rare cards × 20                   =    80
   *     30 orbs + 31 other cosmetics × 0    =     0
   *                                           -----
   *                                           4,220
   */
  it("values the pass column at the published rates", () => {
    const v = value();
    expect(v.pass).toBeCloseTo(1200 + 1500 + 600 + 440 + 400 + 80, 9);
    expect(v.pass).toBeCloseTo(4220, 9);
  });

  it("values the free column at its 21 packs alone", () => {
    // The 5 orbs are cosmetics and worth nothing, so the whole free track is packs.
    expect(value().free).toBeCloseTo(21 * DEFAULT_PACK_VALUE_GEMS, 9);
    expect(value().free).toBeCloseTo(462, 9);
  });

  /*
   * The load-bearing semantic. Buying the pass does not cause the free column —
   * you get that either way, and Wizards grants pass rewards retroactively for
   * levels already earned — so crediting it here would overstate the purchase by
   * the free track's whole value.
   */
  it("nets the pass column against the price, and never the free column", () => {
    const v = value();
    expect(v.net).toBeCloseTo(v.pass - v.price, 9);
    expect(v.net).toBeCloseTo(820, 9);
    expect(v.net).not.toBeCloseTo(v.free + v.pass - v.price, 1);
    expect(v.roi).toBeCloseTo(820 / 3400, 9);
  });

  it("breaks even at level 33, and not before", () => {
    const v = value();
    expect(v.breakEvenLevel).toBe(33);

    const at = (level: number) =>
      v.levelValues.find((l) => l.level === level)?.cumulativePassGems ?? 0;
    expect(at(32)).toBeLessThan(v.price);
    expect(at(33)).toBeGreaterThanOrEqual(v.price);
    // Exactly one row is flagged, and it is that one.
    expect(v.levelValues.filter((l) => l.breakEven).map((l) => l.level)).toEqual([33]);
  });

  it("never breaks even once every reward is worth nothing", () => {
    const v = value({
      packValueGems: 0,
      gemsPer10kGold: 0,
      draftTokenValueGems: 0,
      mythicIcrValueGems: 0,
      rareCardValueGems: 0,
    });
    // Only the 1,200 gems survive, which does not cover 3,400.
    expect(v.pass).toBeCloseTo(1200, 9);
    expect(v.breakEvenLevel).toBeNull();
    expect(v.net).toBeCloseTo(-2200, 9);
  });

  it("accumulates monotonically to the column totals", () => {
    const v = value();
    let prev = -1;
    for (const lvl of v.levelValues) {
      expect(lvl.cumulativePassGems).toBeGreaterThanOrEqual(prev);
      prev = lvl.cumulativePassGems;
    }
    const last = v.levelValues[v.levelValues.length - 1];
    expect(last.cumulativePassGems).toBeCloseTo(v.pass, 9);
    expect(last.cumulativeFreeGems).toBeCloseTo(v.free, 9);
  });

  it("breaks the pass total into lines that add back up to it", () => {
    const v = value();
    const summed = v.lines.reduce((a, l) => a + l.gems, 0);
    expect(summed).toBeCloseTo(v.pass, 9);
    for (const line of v.lines) {
      expect(line.gems).toBeCloseTo(line.passCount * line.rate, 9);
    }
    // Largest first, so the cosmetics fall into a zero-valued tail.
    for (let i = 1; i < v.lines.length; i++) {
      expect(v.lines[i - 1].gems).toBeGreaterThanOrEqual(v.lines[i].gems);
    }
  });

  /*
   * The claim the tab makes about its own robustness: almost the whole price is
   * covered before anything anyone could argue about is valued at all.
   */
  it("covers 97% of the price from gems, gold and the token alone", () => {
    const v = value();
    expect(v.certain).toBeCloseTo(1200 + 600 + 1500, 9);
    expect(v.certain).toBeCloseTo(3300, 9);
    expect(v.certain / v.price).toBeGreaterThan(0.95);
    expect(v.certain).toBeLessThan(v.price);
  });

  it("moves by exactly the count when a rate moves", () => {
    const base = value();
    expect(value({ packValueGems: 0 }).pass).toBeCloseTo(base.pass - 20 * 22, 9);
    expect(value({ gemsPer10kGold: 0 }).pass).toBeCloseTo(
      base.pass - 600,
      9,
    );
    // Thirty orbs, counted all along and priced at nothing until now.
    expect(value({ orbValueGems: 1 }).pass).toBeCloseTo(base.pass + 30, 9);
  });

  it("counts cosmetics even while valuing them at nothing", () => {
    const v = value();
    const orbs = v.lines.find((l) => l.kind === "orbs");
    expect(orbs?.passCount).toBe(30);
    expect(orbs?.gems).toBe(0);
  });

  it("prices one level past the cap at a single uncommon ICR", () => {
    expect(value().beyondPerLevel).toBeCloseTo(DEFAULT_UNCOMMON_ICR_VALUE_GEMS, 9);
  });

  /*
   * A real property of this design, not an accident of the current data. The
   * obvious "improvement" — pricing the draft token off what a Premier run
   * returns rather than off its entry — would make every figure on the tab drift
   * with the slider, and nothing else would notice.
   */
  it("does not depend on the win rate", () => {
    const at = (winRate: number) => value({ winRate });
    const base = at(0.55);
    for (const rate of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const v = at(rate);
      expect(v.pass).toBeCloseTo(base.pass, 9);
      expect(v.free).toBeCloseTo(base.free, 9);
      expect(v.net).toBeCloseTo(base.net, 9);
      expect(v.breakEvenLevel).toBe(base.breakEvenLevel);
    }
  });

  it("prices the track the app ships with", () => {
    expect(CURRENT_MASTERY_TRACK).toBe(THE_HOBBIT_MASTERY);
  });
});
