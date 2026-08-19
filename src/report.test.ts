import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BUG_REPORT_URL, REPO_URL, wrongNumberIssueUrl } from "./report";

describe("wrongNumberIssueUrl", () => {
  const link = "https://mtga.fyi/?event=Quick+Draft&winRate=0.62&tab=event";
  const url = wrongNumberIssueUrl({ eventName: "Quick Draft", link });
  const parsed = new URL(url);

  it("opens a new issue on the repository, on the wrong-number form", () => {
    expect(url.startsWith(`${REPO_URL}/issues/new?`)).toBe(true);
    expect(parsed.searchParams.get("template")).toBe("wrong-number.yml");
  });

  it("names the event in the title and in the form's own field", () => {
    expect(parsed.searchParams.get("title")).toBe("Wrong number: Quick Draft");
    expect(parsed.searchParams.get("event")).toBe("Quick Draft");
  });

  it("carries the page's link intact, query string and all", () => {
    // The link has its own `?` and `&`; they must survive being a parameter
    // of another URL, or the issue arrives pointing at a different state.
    expect(parsed.searchParams.get("link")).toBe(link);
  });

  /*
   * GitHub matches a query parameter to a form field by the field's `id`, so
   * the names written here have to be the ones the template declares — a
   * rename on either side leaves the form opening blank, which nothing but a
   * person filing a report would notice.
   */
  it("names fields the issue form declares", () => {
    const form = readFileSync(
      new URL("../.github/ISSUE_TEMPLATE/wrong-number.yml", import.meta.url),
      "utf8",
    );
    const ids = new Set(
      [...form.matchAll(/^\s+id:\s*(\S+)\s*$/gm)].map((m) => m[1]),
    );
    for (const name of [...parsed.searchParams.keys()]) {
      // `template` and `title` are GitHub's own parameters, not fields.
      if (name === "template" || name === "title") continue;
      expect(ids, `field "${name}"`).toContain(name);
    }
  });

  it("and the bug link names a form that exists too", () => {
    const template = new URL(BUG_REPORT_URL).searchParams.get("template");
    expect(template).toBeTruthy();
    expect(() =>
      readFileSync(
        new URL(`../.github/ISSUE_TEMPLATE/${template}`, import.meta.url),
      ),
    ).not.toThrow();
  });
});
