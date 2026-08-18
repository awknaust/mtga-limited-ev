import { describe, expect, it } from "vitest";

import { pickEvents, rankByBreakEven, rowLabelLines, withBreakEven } from "./compareEvents";
import { CUSTOM_PRESET, PRESETS, breakEvenWinRate, defaultConfig } from "../lib";

const base = defaultConfig();
const names = PRESETS.map((p) => p.name);

describe("pickEvents", () => {
  /*
   * The property the whole tab rests on: every event is priced with the
   * reader's numbers and differs from the others only in what an event is. A
   * regression here would not look like a bug — it would look like a table of
   * plausible figures answering a question nobody asked.
   */
  it("keeps every rate the reader owns, and swaps only the event", () => {
    const edited = { ...base, packValueGems: 41, winRate: 0.63, gemsPer10kGold: 1234 };
    for (const { config } of pickEvents(names, edited)) {
      expect(config.packValueGems).toBe(41);
      expect(config.winRate).toBe(0.63);
      expect(config.gemsPer10kGold).toBe(1234);
    }
    // ...and the events really are different events, not one repeated.
    const entries = new Set(pickEvents(names, edited).map((e) => e.config.entryCostGems));
    expect(entries.size).toBeGreaterThan(1);
  });

  it("gives Custom the sidebar's own config, untouched", () => {
    const edited = { ...base, entryCostGems: 4321 };
    const [custom] = pickEvents([CUSTOM_PRESET], edited);
    expect(custom.name).toBe("Custom");
    expect(custom.config).toBe(edited);
  });

  it("keeps the selection's order", () => {
    const picked = pickEvents([names[3], names[0], names[1]], base);
    expect(picked.map((e) => e.name)).toEqual([names[3], names[0], names[1]]);
  });

  it("drops a name no preset answers to, rather than throwing", () => {
    const picked = pickEvents([names[0], "Vintage Cube Sprint", names[1]], base);
    expect(picked.map((e) => e.name)).toEqual([names[0], names[1]]);
  });
});

const ranked = (picked: ReturnType<typeof pickEvents>) =>
  rankByBreakEven(withBreakEven(picked));

describe("withBreakEven and rankByBreakEven", () => {
  it("leaves the picked order alone, so the table can keep it", () => {
    const picked = pickEvents([names[3], names[0], names[1]], base);
    expect(withBreakEven(picked).map((r) => r.name)).toEqual(picked.map((e) => e.name));
  });

  it("puts the easiest bar to clear first", () => {
    const rates = ranked(pickEvents(names, base)).map((r) => r.breakEven ?? Infinity);
    expect([...rates].sort((a, b) => a - b)).toEqual(rates);
  });

  it("carries the rate the model computes, not one of its own", () => {
    for (const row of withBreakEven(pickEvents(names, base))) {
      expect(row.breakEven).toBe(breakEvenWinRate(row.config));
    }
  });

  it("sinks an event with no break-even to the end", () => {
    /*
     * A ladder paying nothing never crosses zero, so `breakEvenWinRate` is
     * null — which must sort last rather than first, the way `Infinity` does
     * and the way `0` would not.
     */
    const broke = { name: "Pays nothing", config: { ...base, payouts: [{ wins: 0, gems: 0, packs: 0 }] } };
    expect(breakEvenWinRate(broke.config)).toBeNull();
    expect(ranked([broke, ...pickEvents([names[0]], base)]).map((r) => r.name)).toEqual([
      names[0],
      "Pays nothing",
    ]);
  });

  it("leaves two events it cannot separate in the order they came", () => {
    const [a] = pickEvents([names[0]], base);
    const order = ranked([
      { ...a, name: "first" },
      { ...a, name: "second" },
    ]);
    expect(order.map((r) => r.name)).toEqual(["first", "second"]);
  });

  it("ranks every selected event exactly once", () => {
    const picked = pickEvents(names, base);
    expect(ranked(picked).map((r) => r.name).sort()).toEqual(picked.map((e) => e.name).sort());
  });
});

describe("rowLabelLines", () => {
  it("leaves a short name on one line", () => {
    expect(rowLabelLines("Premier Draft")).toEqual(["Premier Draft"]);
  });

  /*
   * The cap is one character below the widest line any preset needs, so that
   * this name wraps rather than setting the margin single-handed. It is the
   * measurement the margin was chosen from; changing the cap moves it.
   */
  it("wraps the name that would otherwise be the widest line on the chart", () => {
    expect(rowLabelLines("Premier Cube Draft")).toEqual(["Premier", "Cube Draft"]);
  });

  it("cannot make any preset's longest line shorter than Constructed Event", () => {
    // The floor: `Traditional Constructed Event` has no two-line split with a
    // shorter long half, so no smaller cap helps and a smaller one only clips.
    const longest = Math.max(...names.flatMap((n) => rowLabelLines(n).map((l) => l.length)));
    expect(longest).toBe("Constructed Event".length);
  });

  it("splits a long one where the longer line comes out shortest", () => {
    // Not at the first space, which would leave "Constructed Event" paired
    // with "Traditional" the other way round and a 23-character second line.
    expect(rowLabelLines("Traditional Constructed Event")).toEqual([
      "Traditional",
      "Constructed Event",
    ]);
    expect(rowLabelLines("Qualifier Play-In (Bo1)")).toEqual(["Qualifier", "Play-In (Bo1)"]);
  });

  it("keeps every character of every preset's name", () => {
    for (const name of [...names, CUSTOM_PRESET]) {
      expect(rowLabelLines(name).join(" ")).toBe(name);
    }
  });

  it("never draws a line wider than the margin was sized for", () => {
    for (const name of [...names, CUSTOM_PRESET]) {
      for (const line of rowLabelLines(name)) expect(line.length).toBeLessThanOrEqual(17);
    }
  });

  it("never needs more than the two lines a row has height for", () => {
    for (const name of [...names, CUSTOM_PRESET]) {
      expect(rowLabelLines(name).length).toBeLessThanOrEqual(2);
    }
  });

  /*
   * What wrapping buys over clipping, and the reason for it. Several presets
   * differ only in a trailing parenthetical, and a label that collapsed two of
   * them would show one name on two rows — which reads as the model repeating
   * itself rather than as a chart running out of room.
   */
  it("keeps every preset's label distinct from every other's", () => {
    const labels = names.map((n) => rowLabelLines(n).join("\n"));
    expect(new Set(labels).size).toBe(names.length);
  });

  it("clips a single word that cannot wrap, rather than overrunning", () => {
    const lines = rowLabelLines("Supercalifragilisticexpialidocious");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(17);
    expect(lines[0].endsWith("\u2026")).toBe(true);
  });

  it("leaves no space stranded before an ellipsis", () => {
    expect(rowLabelLines("Qualifier Play-In (Bo1) Extra").every((l) => !/ \u2026$/.test(l))).toBe(
      true,
    );
  });
});
