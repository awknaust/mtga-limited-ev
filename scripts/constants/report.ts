/**
 * Rendering. Three shapes over the same results: a table, the table with each
 * derivation spelled out, and JSON.
 *
 * Nothing here computes anything — a number that appears in the output was
 * produced by `registry.ts` and is only being formatted.
 */

import type { ConstantResult, ConstantValue, NamedConstantDef } from "./registry.ts";

/** A computed constant, carrying everything the renderers need. */
export type NamedResult = ConstantResult & {
  name: string;
  summary: string;
  sourceUrls: string[];
};

const defaultFormat = (value: ConstantValue): string =>
  typeof value === "number" ? value.toLocaleString("en-US") : `[${value.join(", ")}]`;

export const displayValue = (result: ConstantResult): string =>
  (result.format ?? defaultFormat)(result.value);

type Column = { header: string; align: "left" | "right"; maxWidth?: number };

/**
 * A plain aligned table.
 *
 * Hand-rolled rather than another dependency: the whole requirement is column
 * widths, and right-aligning the values is what makes a column of numbers
 * readable.
 *
 * A column may set `maxWidth`, above which a cell no longer gets a say in how
 * wide the column is and simply overflows. That exists for one row:
 * DAILY_WIN_GOLD is a fifteen-element array in a column of short numbers, and
 * letting it set the width pushes every other value fifty characters right,
 * defeating the point of a column. Columns without `maxWidth` — the names, all
 * of them long — fit their contents as usual.
 */
function table(columns: Column[], rows: string[][]): string {
  const widths = columns.map((column, i) =>
    Math.max(
      column.header.length,
      ...rows.map((row) => (row[i] ?? "").length).filter((w) => w <= (column.maxWidth ?? Infinity)),
    ),
  );
  const line = (cells: string[]): string =>
    cells
      .map((cell, i) => {
        const text = cell ?? "";
        if (text.length > widths[i]) return text;
        return columns[i].align === "right" ? text.padStart(widths[i]) : text.padEnd(widths[i]);
      })
      .join("  ")
      .trimEnd();

  return [
    line(columns.map((c) => c.header)),
    line(widths.map((w) => "─".repeat(w))),
    ...rows.map(line),
  ].join("\n");
}

/** `asOf` as printed: the date, or a dash for a value with no dated input. */
const displayAsOf = (result: ConstantResult): string => result.asOf ?? "—";

/**
 * The default output: what each constant should be, and as of when.
 *
 * The date sits before the value so that the one value allowed to overflow
 * its column (DAILY_WIN_GOLD, see `maxWidth`) runs off the end of its line
 * rather than through the middle of it.
 */
export function renderTable(results: NamedResult[]): string {
  return table(
    [
      { header: "Constant", align: "left" },
      { header: "As of", align: "left" },
      { header: "Value", align: "right", maxWidth: 24 },
    ],
    results.map((r) => [r.name, displayAsOf(r), displayValue(r)]),
  );
}

/** The same, with each value's derivation under it. */
export function renderVerbose(results: NamedResult[]): string {
  return results
    .map((result) => {
      const heading = `${result.name} = ${displayValue(result)}`;
      return [
        heading,
        "─".repeat(heading.length),
        result.summary,
        `as of ${displayAsOf(result)}`,
        "",
        ...result.explain.map((line) => `  ${line}`),
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * JSON, keyed by constant name so a caller can look one up without scanning.
 *
 * The derivation is included only under `--verbose`, so the shape matches what
 * the text output would have shown.
 */
export function renderJson(
  results: NamedResult[],
  opts: { verbose: boolean; generatedAt: string },
): string {
  const constants: Record<string, unknown> = {};
  for (const result of results) {
    constants[result.name] = {
      value: result.value,
      display: displayValue(result),
      asOf: result.asOf,
      summary: result.summary,
      sources: result.sourceUrls,
      ...(opts.verbose ? { derivation: result.explain } : {}),
    };
  }
  return JSON.stringify({ generatedAt: opts.generatedAt, constants }, null, 2);
}

/** `--list`: the names, without fetching anything. */
export function renderList(constants: NamedConstantDef[]): string {
  return table(
    [
      { header: "Constant", align: "left" },
      { header: "What it is", align: "left" },
    ],
    constants.map((c) => [c.name, c.summary]),
  );
}
