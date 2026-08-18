import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COMPARE_GROUPS,
  COMPARE_SERIES_CLASSES,
  compareSeries,
} from "./compareSeries";
import { CUSTOM_PRESET, PRESETS } from "../lib";

/*
 * The two lists the Compare tab depends on and cannot check for itself.
 *
 * Both failures are silent, and both happen on the same commit: the one that
 * adds an event. A preset missing from `COMPARE_GROUPS` never appears in the
 * selector — the tab simply cannot compare it, and nothing anywhere says so. A
 * preset sharing another's (colour, dash) draws two lines a reader has no way
 * to tell apart, which is worse than not drawing one, because it looks like an
 * answer.
 *
 * The stylesheet is read as text rather than through a DOM, for the reason
 * `ValueSplitBar.test.ts` gives at length: no jsdom in this suite, and Vitest
 * stubs a CSS import to an empty string.
 */

const CSS = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

const DEFINED = new Set(
  [...CSS.matchAll(/\.(compare-series-[A-Za-z0-9]+)\s*\{/g)].map((m) => m[1]),
);

describe("every event is offered", () => {
  const grouped = COMPARE_GROUPS.flatMap((g) => g.names);

  it.each(PRESETS.map((p) => p.name))("lists %s in exactly one group", (name) => {
    expect(grouped.filter((n) => n === name)).toEqual([name]);
  });

  it("offers nothing that is not a preset", () => {
    for (const name of grouped) {
      expect(PRESETS.map((p) => p.name)).toContain(name);
    }
  });

  it("offers every preset and no more", () => {
    expect(grouped.length).toBe(PRESETS.length);
  });
});

describe("every event is drawn distinguishably", () => {
  it("gives no two presets the same colour and dash", () => {
    const seen = new Map<string, string>();
    for (const preset of PRESETS) {
      const { colorClass, dash } = compareSeries(preset.name);
      const signature = `${colorClass}|${dash ?? "solid"}`;
      const clash = seen.get(signature);
      expect(
        clash,
        `${preset.name} and ${clash} would draw identically. The ramp is full: ` +
          "add a dash pattern to DASHES, or a hue and its .compare-series-* rule.",
      ).toBeUndefined();
      seen.set(signature, preset.name);
    }
  });

  it("keeps the reader's own ladder apart from every preset", () => {
    const custom = compareSeries(CUSTOM_PRESET);
    for (const preset of PRESETS) {
      expect(compareSeries(preset.name).colorClass).not.toBe(custom.colorClass);
    }
  });

  it("draws each preset in a colour the stylesheet defines", () => {
    for (const preset of PRESETS) {
      expect(DEFINED).toContain(compareSeries(preset.name).colorClass);
    }
    expect(DEFINED).toContain(compareSeries(CUSTOM_PRESET).colorClass);
  });

  it("defines every class the ramp can return, used today or not", () => {
    // The uniqueness check above only reaches the classes the current preset
    // count happens to use. This one covers the whole ramp, so shrinking
    // `PRESETS` cannot leave a rule missing for the class that comes back when
    // it grows again.
    for (const cls of COMPARE_SERIES_CLASSES) expect(DEFINED).toContain(cls);
  });

  it("finds the rules at all, so a passing suite means something", () => {
    expect(DEFINED.size).toBeGreaterThan(4);
    expect(DEFINED).toContain("compare-series-0");
  });
});
