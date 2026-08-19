/**
 * The drop-rates parsers and the derivations built on them, against the
 * fixture page. What it holds: that each section is found where the page puts
 * it, that a section going missing stops the run rather than pricing what
 * still matched, and that the two pack figures the page publishes in full
 * come out at the values `presets.ts` carries, from the same arithmetic.
 */

import { describe, expect, it } from "vitest";

import { SourceError } from "../shared/http.ts";
import { cubePackGems, mythicSlotGems, wildcardShare } from "./derive.ts";
import { CUBE_CONTENTS, MYTHIC_BOOSTER, dropRatesPage as page } from "./drop-rates.fixture.ts";
import { parseDropRates } from "./wizards.ts";

describe("parseDropRates", () => {
  it("reads the whole page, the two pack sections included", () => {
    const rates = parseDropRates(page());
    expect(rates.rareDupeGems).toBe(20);
    expect(rates.mythicDupeGems).toBe(40);
    expect(rates.wildcards.rare).toBe(30);
    expect(rates.wildcards.mythic).toBe(30);
    expect(rates.dailyWinGold).toEqual([250, 100, 0]);
    expect(rates.mythicRates).toEqual([
      { rate: 7, sets: ["Duskmourn", "Foundations"] },
      { rate: 8.1, sets: ["Marvel's Spider-Man"] },
    ]);
    expect(rates.mythicBoosterDisplacedBy).toBe("a Rare Wildcard");
    expect(rates.cubePrizePack).toEqual({
      timelessMythicRate: 6.5,
      bonusSheetMythicRate: 5,
      flex: { timelessRarePct: 20, timelessUncommonPct: 30, bonusSheetPct: 50 },
      bonusSheet: [
        { rarity: "Mythics", cards: "Dack Fayden, Leovold, Emissary of Trest, Tourach, Dread Cantor" },
        { rarity: "Rares", cards: "Glimmer Lens, Death-Greeter’s Champion, Upheaval" },
        { rarity: "Uncommons", cards: "Zuran Orb, Pyrokinesis" },
        { rarity: "Commons", cards: "Snuff Out" },
      ],
    });
  });

  it("accepts the mythic-booster sentence with a typographic apostrophe", () => {
    const curly = MYTHIC_BOOSTER.replace("&#39;", "’");
    expect(parseDropRates(page({ mythicBooster: curly })).mythicBoosterDisplacedBy).toBe(
      "a Rare Wildcard",
    );
  });

  it("stops if the mythic-booster rule is gone", () => {
    expect(() => parseDropRates(page({ mythicBooster: "" }))).toThrow(SourceError);
    expect(() => parseDropRates(page({ mythicBooster: "" }))).toThrow(/Mythic Booster/);
  });

  it("stops if the cube contents are gone, and names the slot that went", () => {
    expect(() => parseDropRates(page({ cube: "" }))).toThrow(/Cube Prize Pack contents/);
    const noFlex = CUBE_CONTENTS.replace(/<li>1 Flex card[\s\S]*?<\/li>\n<\/ul>\n<\/li>/, "");
    expect(() => parseDropRates(page({ cube: noFlex }))).toThrow(/flex slot/);
    const noBonusSlot = CUBE_CONTENTS.replace(/<li>1 Cube bonus sheet[\s\S]*?<\/ul>\n<\/li>/, "");
    expect(() => parseDropRates(page({ cube: noBonusSlot }))).toThrow(/bonus sheet slot/);
  });

  it("treats the bonus-sheet list as optional, but a heading with no list as broken", () => {
    expect(parseDropRates(page({ bonusSheet: "" })).cubePrizePack.bonusSheet).toBeNull();
    expect(() =>
      parseDropRates(page({ bonusSheet: "<p>The Cube Prize Pack bonus sheet contains:</p><p>tbd</p>" })),
    ).toThrow(/bonus sheet heading/);
  });

  it("is not fooled by the JSON copy of the body inside a script tag", () => {
    // The fixture's <script> carries both cube anchors ahead of the real ones,
    // as the page's JSON copy of itself does. Read unstripped, the bonus-sheet
    // anchor lands there and the "next <ul>" is the mythic-rate list, which
    // parses to no rarity lines at all.
    const rates = parseDropRates(page());
    expect(rates.cubePrizePack.timelessMythicRate).toBe(6.5);
    expect(rates.cubePrizePack.bonusSheet?.map((l) => l.rarity)).toEqual([
      "Mythics",
      "Rares",
      "Uncommons",
      "Commons",
    ]);
  });
});

describe("the pack derivations", () => {
  const rates = parseDropRates(page());

  it("prices a mythic pack as the mythic buyout less the pack's wildcard share", () => {
    const share = wildcardShare(rates.wildcards);
    expect(share).toBeCloseTo(2 / 30, 12);
    const exact = mythicSlotGems(rates.mythicDupeGems, rates.wildcards);
    expect(exact).toBeCloseTo(40 * (1 - 2 / 30), 12);
    // presets.ts: DEFAULT_MYTHIC_PACK_VALUE_GEMS = Math.round(40 * (1 - 2 / 30))
    expect(Math.round(exact)).toBe(37);
  });

  it("prices a Cube Prize Pack slot by slot, bonus-sheet half of the flex slot at nothing", () => {
    const parts = cubePackGems(rates.rareDupeGems, rates.mythicDupeGems, rates.cubePrizePack);
    expect(parts.timeless).toBeCloseTo(150 / 6.5, 12);
    expect(parts.bonusSheet).toBe(24);
    expect(parts.flexRare).toBe(4);
    // presets.ts: DEFAULT_CUBE_PACK_VALUE_GEMS = Math.round(150 / 6.5 + 24 + 0.2 * 20)
    expect(parts.total).toBeCloseTo(150 / 6.5 + 24 + 0.2 * 20, 12);
    expect(Math.round(parts.total)).toBe(51);
  });

  it("moves with the page's figures rather than restating them", () => {
    const moved = parseDropRates(
      page({
        cube: CUBE_CONTENTS.replace("1:6.5", "1:5").replace("Timeless Rare (20%)", "Timeless Rare (30%)"),
      }),
    ).cubePrizePack;
    const parts = cubePackGems(20, 40, moved);
    expect(parts.timeless).toBe(24);
    expect(parts.flexRare).toBe(6);
    expect(Math.round(parts.total)).toBe(54);
  });
});
