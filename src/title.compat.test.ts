import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SITE_NAME, SITE_TITLE } from "./title";

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

  /*
   * The link preview is the same kind of copy: strings a scraper reads off
   * the HTML that nothing in the app can see are wrong. The site name is
   * pinned to the module for the same reason the title is, and the image
   * tags to the file they describe, because a renamed or re-rendered card
   * would otherwise fail only as a blank preview on somebody else's Discord.
   */
  it("names the site in the link preview as the app does", () => {
    expect(html).toContain(
      `<meta property="og:site_name" content="${SITE_NAME}" />`,
    );
  });

  it("paints link embeds with the app's own primary colour", () => {
    // Discord and mobile browsers read theme-color off the HTML, and the
    // colour it should be is defined once, in the stylesheet.
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const primary = css.match(/--bs-primary:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(primary).toBeDefined();
    expect(html).toContain(
      `<meta name="theme-color" content="${primary}" />`,
    );
  });

  it("describes the card image that public/ actually ships", () => {
    const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    expect(image).toBeDefined();
    const path = new URL(image!).pathname;
    expect(path).not.toBe("/");
    // The PNG header: an 8-byte signature, then IHDR's length and type, then
    // width and height as big-endian 32-bit integers at bytes 16 and 20.
    const png = readFileSync(new URL(`../public${path}`, import.meta.url));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(html).toContain(
      `<meta property="og:image:width" content="${width}" />`,
    );
    expect(html).toContain(
      `<meta property="og:image:height" content="${height}" />`,
    );
  });
});
