import { describe, expect, it } from "vitest";

import { pickEvents, rankByBreakEven, withBreakEven } from "./compareEvents";
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
