import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RESULT_TABS } from "./tabs";
import { encodeShareState } from "./share";
import { defaultShareState } from "./state";

/*
 * `public/sitemap.xml` names one address per tab, and the addresses have to
 * be the ones the app itself writes — a search result that lands on a query
 * string the decoder does not recognise is a search result for the default
 * page under the wrong title. Neither the file nor the tab strip can import
 * the other, so this holds them together: every tab, in the strip's order,
 * spelled as `share.ts` spells it, and nothing besides.
 */
describe("public/sitemap.xml", () => {
  const xml = readFileSync(
    new URL("../public/sitemap.xml", import.meta.url),
    "utf8",
  );
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );

  it("lists each tab once, at the address the app writes for it", () => {
    const expected = RESULT_TABS.map(({ key }) => {
      const query = encodeShareState({ ...defaultShareState(), tab: key });
      return `https://mtga.fyi/${query ? `?${query}` : ""}`;
    });
    expect(locs).toEqual(expected);
  });

  it("is what robots.txt points at", () => {
    const robots = readFileSync(
      new URL("../public/robots.txt", import.meta.url),
      "utf8",
    );
    expect(robots).toContain("Sitemap: https://mtga.fyi/sitemap.xml");
  });
});
