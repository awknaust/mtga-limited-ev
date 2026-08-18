import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SITE_TITLE } from "./title";

/*
 * `index.html` and `title.ts` hold the same title, and they have to, for
 * different reasons: the file is the title before any script runs and the one
 * a crawler without JS is served, while the module is what the app assigns
 * once it mounts. Nothing in the build ties the two together, since the HTML
 * cannot import a constant, so a rename that touches one and not the other
 * shows up only as a title that flickers on load. That is invisible in the dev
 * server and in every other test, and it has already happened once.
 */
describe("index.html", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  it("serves the same title the app will set on a bare load", () => {
    expect(html).toContain(`<title>${SITE_TITLE}</title>`);
  });
});
