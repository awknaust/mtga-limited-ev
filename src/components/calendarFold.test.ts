import { describe, expect, it } from "vitest";

import { calendarStartsOpen } from "./calendarFold";

describe("calendarStartsOpen", () => {
  it("mounts folded when nothing was remembered", () => {
    expect(calendarStartsOpen(null, false)).toBe(false);
  });

  it("honours a remembered open on a bare visit", () => {
    expect(calendarStartsOpen("0", false)).toBe(true);
  });

  it("keeps a remembered fold folded", () => {
    expect(calendarStartsOpen("1", false)).toBe(false);
  });

  /*
   * The reported bug, pinned: a share link opened on a device that had left
   * the calendar open arrived with the strip unfolded above the numbers the
   * link was about. Arriving with a query starts folded whatever is stored.
   */
  it("starts folded on a share link whatever was remembered", () => {
    expect(calendarStartsOpen("0", true)).toBe(false);
    expect(calendarStartsOpen("1", true)).toBe(false);
    expect(calendarStartsOpen(null, true)).toBe(false);
  });

  it("reads any other stored value as no remembered open", () => {
    // A value written by an older build or another hand fails safe, to folded.
    expect(calendarStartsOpen("true", false)).toBe(false);
    expect(calendarStartsOpen("", false)).toBe(false);
  });
});
