import { describe, expect, it } from "vitest";

import { stepWinRate } from "./winRate";

describe("stepWinRate", () => {
  it("moves by the amount the button promises", () => {
    expect(stepWinRate(0.55, 0.5)).toBe(0.555);
    expect(stepWinRate(0.55, -0.5)).toBe(0.545);
    expect(stepWinRate(0.55, 5)).toBe(0.6);
    expect(stepWinRate(0.55, -5)).toBe(0.5);
  });

  it("does not drift over a run of presses", () => {
    // The reason for the grid arithmetic: added as fractions these land on
    // 0.6499999999999999, which the share link would carry verbatim.
    let rate = 0.55;
    for (let i = 0; i < 20; i++) rate = stepWinRate(rate, 0.5);
    expect(rate).toBe(0.65);

    let coarse = 0.55;
    for (let i = 0; i < 4; i++) coarse = stepWinRate(coarse, 5);
    expect(coarse).toBe(0.75);
  });

  it("steps a value the fraction cannot hold exactly", () => {
    // 0.615 is 122.99999999999999 grid units, so truncating it would spend the
    // press returning to 0.615 rather than moving off it.
    expect(stepWinRate(0.615, 0.5)).toBe(0.62);
    expect(stepWinRate(0.615, -0.5)).toBe(0.61);
  });

  it("clamps at both ends rather than running past them", () => {
    expect(stepWinRate(0.98, 5)).toBe(1);
    expect(stepWinRate(0.02, -5)).toBe(0);
    expect(stepWinRate(1, 5)).toBe(1);
    expect(stepWinRate(0, -5)).toBe(0);
  });

  it("reports no movement at the bound, which is what disables the button", () => {
    expect(stepWinRate(1, 0.5)).toBe(1);
    expect(stepWinRate(0, -0.5)).toBe(0);
    expect(stepWinRate(1, -0.5)).toBe(0.995);
    expect(stepWinRate(0, 0.5)).toBe(0.005);
  });

  it("snaps an off-grid link the way the slider already draws it", () => {
    // Nothing in the UI produces 0.6234; ?wr=0.6234 does, and the range input
    // puts its thumb at 0.625. Stepping from there keeps the two agreeing, and
    // keeps the press worth the amount on the button.
    expect(stepWinRate(0.6234, 0.5)).toBe(0.63);
    expect(stepWinRate(0.6234, -0.5)).toBe(0.62);
    expect(stepWinRate(0.6234, 5)).toBe(0.675);
    expect(stepWinRate(0.6234, -5)).toBe(0.575);
  });
});
