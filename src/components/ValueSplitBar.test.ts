import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { sliceColor, type ValueSliceKey } from "./ValueSplitBar";
import { HOLDING_KEYS, MASTERY_REWARD_KINDS, boxHoldingKey } from "../lib";

/*
 * That every segment the bar can draw has a colour to draw it in.
 *
 * The failure this catches is silent and was shipped once. `--slice` is a
 * custom property set by a `.slice-<name>` rule, and `background: var(--slice)`
 * with no such rule is not an error: the property has no value, the background
 * falls back to the bar's own dark track, and the segment is there at the right
 * width and invisible. Nothing throws, nothing logs, and the bar still sums to
 * the figure above it — so the only sign is someone noticing a gap in a rule
 * six pixels tall. Adding a holding is exactly when it happens, since the
 * holding works everywhere else on the page.
 *
 * The stylesheet is read as text rather than through a DOM, which keeps this
 * test in the same shape as the rest of the suite: no jsdom, no rendering, just
 * the two lists that have to agree.
 *
 * Read off disk rather than imported. Vitest stubs a CSS import to an empty
 * string — `css` is off by default, since nothing here renders — and `?raw`
 * does not escape that: the import succeeds, the text is empty, and every
 * assertion below fails for a reason that has nothing to do with the colours.
 */

/** Every `.slice-<name>` the stylesheet defines. */
const CSS = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

const DEFINED = new Set(
  [...CSS.matchAll(/\.slice-([A-Za-z]+)\s*\{/g)].map((m) => m[1]),
);

describe("every segment has a colour", () => {
  /*
   * A ladder names its own boxes, so this is one of them rather than the list:
   * they all resolve to the same name, which is the point of them sharing it.
   */
  const KEYS: ValueSliceKey[] = [
    ...HOLDING_KEYS,
    boxHoldingKey({ kind: "play", set: "msh" }),
    ...MASTERY_REWARD_KINDS,
  ];

  it.each(KEYS)("draws %s in a colour the stylesheet defines", (key) => {
    expect(DEFINED).toContain(sliceColor(key));
  });

  it("finds the rules at all, so a passing suite means something", () => {
    // Guards the regex above: were it to stop matching, every assertion here
    // would fail loudly rather than the set quietly emptying — but only if the
    // set is known not to be empty for an unrelated reason.
    expect(DEFINED.size).toBeGreaterThan(10);
    expect(DEFINED).toContain("gems");
  });

  it("gives the packs one colour between them, and keeps them separate", () => {
    // What the bar says about a Contender run: two kinds of pack, one hue,
    // two segments. The hue is shared deliberately, so it is pinned rather
    // than left to whichever rule happens to exist.
    expect(sliceColor("mythicPacks")).toBe(sliceColor("packs"));
    expect(sliceColor("cubePacks")).toBe(sliceColor("packs"));
    // The pool you keep is not a pack you won, and keeps its own colour.
    expect(sliceColor("draftPacks")).not.toBe(sliceColor("packs"));
  });
});
