import { describe, expect, it } from "vitest";

import { whiskerDomainMax } from "./CompareBankroll";

/*
 * Where the whisker chart's axis ends, mode by mode.
 *
 * Only the domain rule is tested, not the rendering: there is no DOM in this
 * suite, and what can go wrong here is where the axis stops rather than how
 * the boxes draw. The assertions are about the relationships the chart's doc
 * comment promises — headroom past the largest whisker, the events clamp, the
 * starting-balance line kept on the chart — not about the headroom constant,
 * which is free to be tuned without touching this file.
 */
describe("whiskerDomainMax", () => {
  it("runs just past the largest whisker, not to the run-length ceiling", () => {
    const max = whiskerDomainMax("events", [3, 8], { eventCap: 40, startValue: 0 });
    // Past the whisker, so its end cap sits inside the plot…
    expect(max).toBeGreaterThan(8);
    // …but nowhere near the cap: the dead space is the thing being removed.
    expect(max).toBeLessThan(10);
  });

  it("never runs the events axis past the cap, and meets it when the whiskers do", () => {
    // A run the ceiling stopped touches the right edge — the reading the old
    // fixed axis existed for, kept in exactly the case it occurs.
    expect(whiskerDomainMax("events", [12, 40], { eventCap: 40, startValue: 0 })).toBe(40);
  });

  it("lets the games axis die with the runs instead of stretching to the budget", () => {
    // The rule takes no budget at all: when every bankroll is gone by game 15
    // of a 100-game plan, the budget is the axis label's job, not empty plot.
    const max = whiskerDomainMax("games", [9, 15], { eventCap: 40, startValue: 0 });
    expect(max).toBeGreaterThan(15);
    expect(max).toBeLessThan(17);
  });

  it("follows a whisker past the games budget", () => {
    // A capped run can play out its last entry past the budget, and the axis
    // follows it there like any other whisker.
    expect(
      whiskerDomainMax("games", [104], { eventCap: 40, startValue: 0 }),
    ).toBeGreaterThan(104);
  });

  it("keeps the starting balance on the value axis when every run ends under it", () => {
    // The line the bars are judged against has to be on the chart.
    expect(whiskerDomainMax("value", [500], { eventCap: 40, startValue: 3000 })).toBe(3000);
  });

  it("follows the whiskers past the starting balance", () => {
    expect(
      whiskerDomainMax("value", [5000], { eventCap: 40, startValue: 3000 }),
    ).toBeGreaterThan(5000);
  });

  it("floors at 1 with nothing to reach past", () => {
    // Every row unaffordable is a chart of empty rows over a real axis; no
    // rows at all never renders, but the scale must stay finite either way.
    expect(whiskerDomainMax("events", [0, 0], { eventCap: 40, startValue: 0 })).toBe(1);
    expect(whiskerDomainMax("games", [], { eventCap: 40, startValue: 0 })).toBe(1);
  });
});
