import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COMPARE_GROUPS,
  COMPARE_SERIES_CLASSES,
  compareGroups,
  compareSeries,
} from "./compareSeries";
import { CUSTOM_PRESET, EVENT_GROUPS, PRESETS, type EventPreset } from "../lib";

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

/** A preset stripped to what the grouping reads. */
const stub = (name: string, group: EventPreset["group"]): EventPreset => ({
  name,
  group,
  entryCostGems: 0,
  structure: { kind: "rounds", rounds: 1 },
  payouts: [{ wins: 0, gems: 0, packs: 0 }],
});

describe("grouping the events", () => {
  /*
   * Driven with made-up presets rather than the real ones, because the
   * interesting cases are ones today's data does not contain: a group holding a
   * single event, and a group holding none. Asserting against `PRESETS` alone
   * cannot see either — every real group has at least two members, so a
   * drop-rule that discarded singletons would pass unnoticed until the day
   * somebody added one.
   */
  it("keeps a group holding a single event", () => {
    const groups = compareGroups([stub("Only One", "sealed"), stub("A", "draft")]);
    expect(groups.map((g) => g.names)).toEqual([["A"], ["Only One"]]);
  });

  it("drops a group holding none, rather than rendering it empty", () => {
    const groups = compareGroups([stub("A", "draft")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].names).toEqual(["A"]);
  });

  it("orders groups as EVENT_GROUPS does, whatever order the presets came in", () => {
    const backwards = [...EVENT_GROUPS].reverse().map((g, i) => stub(`e${i}`, g));
    const labels = compareGroups(backwards).map((g) => g.label);
    expect(labels).toEqual(compareGroups([...backwards].reverse()).map((g) => g.label));
    // ...and that shared order is EVENT_GROUPS', not either input's.
    expect(compareGroups(backwards).map((g) => g.names[0])).toEqual(
      EVENT_GROUPS.map((g) => backwards.find((p) => p.group === g)!.name),
    );
  });

  it("keeps events in the order they were given, within a group", () => {
    const groups = compareGroups([stub("B", "draft"), stub("A", "draft")]);
    expect(groups[0].names).toEqual(["B", "A"]);
  });

  it("offers every real preset exactly once", () => {
    expect(COMPARE_GROUPS.flatMap((g) => g.names).sort()).toEqual(
      PRESETS.map((p) => p.name).sort(),
    );
  });

  it("names every group it offers", () => {
    for (const group of COMPARE_GROUPS) expect(group.label).not.toBe("");
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
