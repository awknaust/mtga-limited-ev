import { describe, expect, it } from "vitest";

import { optionGroups } from "./BoxCell";
import {
  EMPTY_BOX_PRICES,
  LATEST_SET,
  boxChip,
  boxFullName,
  boxLabel,
  type BoxPriceTable,
} from "../lib";

/**
 * The box picker's option list.
 *
 * Only the list is tested, not the rendering: there is no DOM in this suite,
 * and what can go wrong here is what the list contains rather than how it
 * draws. The rest of the component is a `<select>` around this.
 */

const TABLE: BoxPriceTable = {
  sets: [
    { code: "hob", name: "The Hobbit", releasedAt: "2026-08-14", boxes: { play: 38_658, collector: 164_554 } },
    { code: "msh", name: "Marvel Super Heroes", releasedAt: "2026-06-26", boxes: { play: 23_444 } },
  ],
  latest: { play: "hob", collector: "hob" },
  generatedAt: "2026-08-16T00:00:00.000Z",
};

const tokens = (groups: ReturnType<typeof optionGroups>): string[] =>
  groups.flatMap((g) => g.options.map((o) => o.token));

describe("the box picker's options", () => {
  it("offers a set-less box of each kind even with no feed at all", () => {
    // Previews and dev without the proxy land here, and the control still has
    // to be usable — these two are the boxes that need no set to be named.
    const groups = optionGroups(EMPTY_BOX_PRICES, []);
    expect(tokens(groups)).toEqual(["play", "collector"]);
    expect(groups[0].options.map((o) => o.label)).toEqual([
      "Play (generic)",
      "Collector (generic)",
    ]);
  });

  it("lists each set under the kind it is priced in", () => {
    const groups = optionGroups(TABLE, []);
    expect(groups.map((g) => g.label)).toEqual(["Any set", "Play boxes", "Collector boxes"]);
    // MSH has no collector price, so it appears once rather than twice.
    expect(tokens(groups)).toEqual([
      "play",
      "collector",
      "play.hob",
      "play.msh",
      "collector.hob",
    ]);
  });

  /*
   * "Newest" is a fact about how the presets are written, not something a
   * reader should have to hold: what they want to know is which box this row
   * ships, and today that is a particular set.
   */
  it("never offers `latest` as a thing to pick", () => {
    const groups = optionGroups(TABLE, [{ kind: "play", set: LATEST_SET }]);
    expect(tokens(groups)).not.toContain("play.latest");
    expect(groups.flatMap((g) => g.options.map((o) => o.label)).join(" ")).not.toMatch(
      /newest|latest/i,
    );
  });

  it("counts a newest box as the set it resolves to, not as a missing one", () => {
    // It resolves to HOB, which the list already offers, so nothing is added.
    const groups = optionGroups(TABLE, [{ kind: "play", set: LATEST_SET }]);
    expect(groups.map((g) => g.label)).not.toContain("Not in the feed");
  });

  /*
   * A set can leave the feed's twenty-set window while a link naming it is
   * still in someone's bookmarks. Without an option to hold it, the control
   * would show the first entry instead — and the ladder would silently become
   * a different one the moment the row was touched.
   */
  it("keeps a chosen set the feed no longer carries", () => {
    const groups = optionGroups(TABLE, [{ kind: "play", set: "spm" }]);
    expect(groups[groups.length - 1]).toEqual({
      label: "Not in the feed",
      options: [{ token: "play.spm", label: "SPM Play" }],
    });
  });

  it("offers a set once however many of its boxes a row pays", () => {
    // The cube's seven-win row pays two boxes, and a row paying two of the
    // same one must not list it twice — a duplicate option is a duplicate
    // React key as well as a confusing list.
    const groups = optionGroups(TABLE, [
      { kind: "play", set: "spm" },
      { kind: "play", set: "spm" },
    ]);
    const all = tokens(groups);
    expect(all.filter((t) => t === "play.spm")).toHaveLength(1);
    expect(new Set(all).size).toBe(all.length);
  });

  it("does not repeat a chosen box the list already offers", () => {
    const groups = optionGroups(TABLE, [
      { kind: "play", set: "hob" },
      { kind: "play" },
      { kind: "collector", set: LATEST_SET },
    ]);
    expect(groups.map((g) => g.label)).not.toContain("Not in the feed");
    const all = tokens(groups);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("the chips a payout row shows", () => {
  it("is the set code, with the kind left to the styling", () => {
    expect(boxChip(TABLE, { kind: "play", set: "msh" })).toBe("MSH");
    expect(boxChip(TABLE, { kind: "collector", set: "hob" })).toBe("HOB");
  });

  it("resolves a newest box to the set it currently means", () => {
    expect(boxChip(TABLE, { kind: "play", set: LATEST_SET })).toBe("HOB");
    expect(boxLabel(TABLE, { kind: "play", set: LATEST_SET })).toBe("HOB Play");
  });

  it("says `Any` where there is no set to name", () => {
    // A generic box, and a newest box with no feed to resolve it — both are
    // priced at the generic rate, and both read as what they are.
    expect(boxChip(TABLE, { kind: "play" })).toBe("Any");
    expect(boxChip(EMPTY_BOX_PRICES, { kind: "play", set: LATEST_SET })).toBe("Any");
  });

  /*
   * The chip is a set code and the kind is a shimmer, so the name carries the
   * whole answer — it is the chip's title and, on a custom ladder where the
   * chip deletes itself, its accessible name.
   */
  it("keeps the kind in the name, which is what is read aloud", () => {
    expect(boxLabel(TABLE, { kind: "collector", set: "hob" })).toBe("HOB Collector");
    expect(boxLabel(TABLE, { kind: "play", set: "msh" })).toBe("MSH Play");
    expect(boxLabel(TABLE, { kind: "collector" })).toBe("Collector");
  });

  it("spells the product out in full for the hover and the reader", () => {
    expect(boxFullName(TABLE, { kind: "play", set: "hob" })).toBe(
      "The Hobbit Play Booster box",
    );
    expect(boxFullName(TABLE, { kind: "collector", set: LATEST_SET })).toBe(
      "The Hobbit Collector Booster box",
    );
    expect(boxFullName(TABLE, { kind: "play", set: "msh" })).toBe(
      "Marvel Super Heroes Play Booster box",
    );
  });

  it("falls back to the code for a set the feed cannot name", () => {
    // Names live only in the feed, so a set that has aged out of it has none.
    expect(boxFullName(TABLE, { kind: "play", set: "spm" })).toBe(
      "SPM Play Booster box",
    );
    expect(boxFullName(EMPTY_BOX_PRICES, { kind: "play", set: "hob" })).toBe(
      "HOB Play Booster box",
    );
  });

  it("says which box a set-less one is, since that is what it prices as", () => {
    expect(boxFullName(TABLE, { kind: "play" })).toBe("Play Booster box, any set");
    expect(boxFullName(EMPTY_BOX_PRICES, { kind: "collector", set: LATEST_SET })).toBe(
      "Collector Booster box, any set",
    );
  });
});
