import { describe, expect, it } from "vitest";

import { GEM_SIGN, gemTick, money, tickAmount } from "./format";

// The default rate: 20,000 gems for $49.99, the largest bundle.
const RATE = 400;

describe("money", () => {
  describe("usd input text", () => {
    const m = money("usd", RATE);

    it("keeps both places on an amount whose cents end in zero", () => {
      // 3,400 gems is $8.50 — the case a bare number renders as "8.5".
      expect(m.toInput(3400)).toBe(8.5);
      expect(m.inputText(3400)).toBe("8.50");
    });

    it("keeps both places on a whole number of dollars", () => {
      expect(m.inputText(RATE)).toBe("1.00");
      expect(m.inputText(0)).toBe("0.00");
    });

    it("still shows the cents it always did", () => {
      expect(m.inputText(252133)).toBe("630.33");
    });

    it("snaps a sub-cent value to the nearest cent, as toInput does", () => {
      // A pack at 22 gems is $0.055, which no cents field can hold.
      expect(m.inputText(22)).toBe("0.06");
      expect(m.toInput(22)).toBe(0.06);
    });

    it("round-trips through an edit", () => {
      expect(m.fromInput(m.toInput(3400))).toBe(3400);
    });
  });

  describe("gems input text", () => {
    const m = money("gems", RATE);

    it("is the plain number — gems have no sub-unit to pad", () => {
      expect(m.inputText(3400)).toBe("3400");
      expect(m.inputText(0)).toBe("0");
    });
  });

  it("keeps fields and labels separate", () => {
    // inputText is for form fields; fmt is for read-only figures.
    expect(money("usd", RATE).fmt(3400)).toBe("$8.50");
    // Against the constant, not the glyph: which character stands in for a
    // gem is a design choice, while the sign leading a grouped figure is not.
    expect(money("gems", RATE).fmt(3400)).toBe(`${GEM_SIGN}\u202F3,400`);
  });

  describe("gem display", () => {
    const m = money("gems", RATE);

    it("signs a gem figure the way it signs a dollar one", () => {
      // Minus outside the currency sign, matching −$8.50.
      expect(m.fmt(-3400)).toBe(`−${GEM_SIGN}\u202F3,400`);
      expect(m.fmt1(-3400.5)).toBe(`−${GEM_SIGN}\u202F3,400.5`);
    });

    it("keeps the sign out of the value a field shows", () => {
      // A number input rejects it, so inputText stays a bare number.
      expect(m.inputText(3400)).toBe("3400");
    });
  });

  describe("usd display", () => {
    it("groups thousands, as the gem formatter always did", () => {
      expect(money("usd", RATE).fmt(500_000)).toBe("$1,250.00");
      expect(money("usd", RATE).fmt(4_000_000)).toBe("$10,000.00");
      // The case that motivated this: a low rate pushes a box over $1,000.
      expect(money("usd", 40).fmt(252133)).toBe("$6,303.33");
    });

    it("still gives small amounts more places than large ones", () => {
      // A pack is worth fractions of a cent; two places would read as $0.06.
      expect(money("usd", RATE).fmt(22)).toBe("$0.055");
      expect(money("usd", RATE).fmt(1)).toBe("$0.0025");
    });

    it("gives zero two places, not the small-amount treatment", () => {
      // Zero has no significant digits to keep, and $0.0000 on an axis whose
      // other ticks read $250.00 looks like a rendering fault.
      expect(money("usd", RATE).fmt(0)).toBe("$0.00");
    });

    it("signs a negative with a real minus, not a hyphen", () => {
      const s = money("usd", RATE).fmt(-3400);
      expect(s).toBe("−$8.50");
      expect(s.startsWith("−")).toBe(true);
    });

    it("does not group or decorate the value a field shows", () => {
      // A number input rejects "$" and ",", and its separator is always ".".
      const text = money("usd", 40).inputText(252133);
      expect(text).toBe("6303.33");
      expect(Number.isNaN(Number(text))).toBe(false);
    });
  });
});

describe("axis ticks", () => {
  it("abbreviates thousands, and only thousands", () => {
    // The point of the abbreviation: three characters where six were, which is
    // what stops a stretched axis running its labels together.
    expect(tickAmount(20_000)).toBe("20k");
    expect(tickAmount(1000)).toBe("1k");
    // Below a thousand there is nothing to abbreviate, and rounding to the
    // nearest one would flatten the low end of every axis to zero.
    expect(tickAmount(999)).toBe("999");
    expect(tickAmount(0)).toBe("0");
  });

  it("signs a negative with a real minus, ahead of the marker", () => {
    // Not "💎 −10k": the sign belongs to the figure, and the marker names the
    // currency it is a figure of.
    expect(tickAmount(-10_000, GEM_SIGN)).toBe(`−${GEM_SIGN}10k`);
  });

  it("marks gems and leaves gold bare", () => {
    // Gold has no sign of its own, so the two axes cannot be read as each
    // other's where the breakdown sits them side by side.
    expect(gemTick(money("gems", RATE), 20_000)).toContain(GEM_SIGN);
    expect(tickAmount(20_000)).not.toContain(GEM_SIGN);
  });

  it("prints dollars whole instead of abbreviating them", () => {
    // 20,000 gems is $50 — three orders of magnitude smaller, so it fits as it
    // is, and rounding it to the nearest thousand would read as "0k".
    expect(gemTick(money("usd", RATE), 20_000)).toBe("$50.00");
    expect(gemTick(money("usd", RATE), 250_000)).toBe("$625.00");
  });
});
