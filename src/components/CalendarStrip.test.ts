/**
 * That every class the strip renders is a class the stylesheet defines.
 *
 * Only the names are tested, not the rendering: there is no DOM in this suite.
 * `ValueSplitBar.test.ts` reads `styles.css` the same way and for the same
 * reason — the strip is positioned almost entirely by CSS, so a class renamed
 * on one side of that line and not the other produces no error anywhere. It
 * produces bars stacked on top of each other, or names with no bar under them,
 * and the first anyone hears of it is a screenshot.
 *
 * Read with `readFileSync` rather than an import: Vitest stubs CSS imports to
 * an empty string, so `?raw` gives nothing back.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CalendarStrip.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

/** Every `calendar-*` class named anywhere in the component. */
const rendered = [...source.matchAll(/"(calendar-[a-z-]+)"/g)].map((m) => m[1]);

describe("CalendarStrip", () => {
  it("names some classes at all", () => {
    // Guards the regex above: a component rewritten to build its class names
    // some other way would otherwise make every assertion below vacuous.
    expect(new Set(rendered).size).toBeGreaterThan(8);
  });

  it("renders no class the stylesheet does not define", () => {
    const missing = [...new Set(rendered)].filter((cls) => !styles.includes(`.${cls}`));
    expect(missing).toEqual([]);
  });

  it("keeps the row pitch in the stylesheet", () => {
    /*
     * The division of labour the layout depends on. Rows are stacked in normal
     * flow and sized by `--calendar-row`, which is why nothing in JS multiplies
     * a row index by a height — see `groupRows`. A pixel row height appearing
     * in the component would mean that had been undone.
     */
    expect(styles).toMatch(/--calendar-row:\s*\d+px/);
    expect(source).not.toMatch(/rowHeight|ROW_H|row\s*\*\s*\d/);
  });
});
