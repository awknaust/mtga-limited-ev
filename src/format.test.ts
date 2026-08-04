import { describe, expect, it } from "vitest";

import { money } from "./format";

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

  it("leaves the formatters alone", () => {
    // inputText is for fields; fmt is for read-only figures and is unchanged.
    expect(money("usd", RATE).fmt(3400)).toBe("$8.50");
    expect(money("gems", RATE).fmt(3400)).toBe("3,400");
  });
});
