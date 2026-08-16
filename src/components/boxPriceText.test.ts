import { describe, expect, it } from "vitest";

import { feedAgeText, feedStampText } from "./boxPriceText";

describe("feedAgeText", () => {
  const built = "2026-08-16T03:36:58.387Z";
  const at = (iso: string) => feedAgeText(built, new Date(iso));

  it("says how old the prices are in the unit that carries meaning", () => {
    expect(at("2026-08-16T03:37:20.000Z")).toBe("just now");
    expect(at("2026-08-16T03:38:00.000Z")).toBe("1 minute ago");
    expect(at("2026-08-16T04:20:00.000Z")).toBe("43 minutes ago");
    expect(at("2026-08-16T04:40:00.000Z")).toBe("1 hour ago");
    expect(at("2026-08-16T14:00:00.000Z")).toBe("10 hours ago");
    expect(at("2026-08-17T05:00:00.000Z")).toBe("1 day ago");
    expect(at("2026-08-20T03:00:00.000Z")).toBe("3 days ago");
  });

  it("reads a clock behind the Worker's as just now, never as negative", () => {
    expect(at("2026-08-16T02:00:00.000Z")).toBe("just now");
  });

  it("declines a stamp that is not a date, which the validator allows", () => {
    // parseBoxPriceFeed checks that generatedAt is a string and stops there.
    expect(feedAgeText("whenever", new Date())).toBeNull();
    expect(feedStampText("whenever")).toBeNull();
  });

  it("prints the exact instant in UTC beside it", () => {
    expect(feedStampText(built)).toBe("16 Aug 2026, 03:36 UTC");
  });
});
