import { describe, expect, it } from "vitest";

import { SITE_NAME, SITE_TITLE, pageTitle } from "./title";

describe("pageTitle", () => {
  it("keeps the site title for a bare load", () => {
    // What a crawler fetches and a first visit lands on. Naming the default
    // preset here would spend the homepage's title on an arbitrary event.
    expect(
      pageTitle({
        tab: "bankroll",
        tabLabel: "Bankroll",
        eventName: "Premier Draft",
        isDefault: true,
      }),
    ).toBe(SITE_TITLE);
  });

  it("names the event first on the tabs that are about one", () => {
    expect(
      pageTitle({
        tab: "bankroll",
        tabLabel: "Bankroll",
        eventName: "Quick Draft",
        isDefault: false,
      }),
    ).toBe(`Quick Draft · Bankroll | ${SITE_NAME}`);
    expect(
      pageTitle({
        tab: "event",
        tabLabel: "Long-term value",
        eventName: "Sealed",
        isDefault: false,
      }),
    ).toBe(`Sealed · Long-term value | ${SITE_NAME}`);
  });

  it("leaves the event out of the tabs that are not about one", () => {
    // Compare draws several events, Mastery prices a season and About is
    // about neither, so a preset name in any of them would be describing
    // something the reader is not looking at.
    for (const tab of ["compare", "mastery", "about"] as const) {
      const label = tab[0].toUpperCase() + tab.slice(1);
      expect(
        pageTitle({
          tab,
          tabLabel: label,
          eventName: "Premier Draft",
          isDefault: false,
        }),
      ).toBe(`${label} | ${SITE_NAME}`);
    }
  });

  it("puts what differs between two tabs ahead of what they share", () => {
    // The whole reason for the ordering: a tab strip clips the end, so the
    // site name is what goes first and the event is what survives.
    const of = (eventName: string) =>
      pageTitle({
        tab: "bankroll",
        tabLabel: "Bankroll",
        eventName,
        isDefault: false,
      });
    const [a, b] = [of("Premier Draft"), of("Quick Draft")];
    expect(a.slice(0, 8)).not.toBe(b.slice(0, 8));
    expect(a.endsWith(SITE_NAME)).toBe(true);
    expect(b.endsWith(SITE_NAME)).toBe(true);
  });
});
