/**
 * Rendering. Three shapes over the same results: a table, the table with each
 * derivation spelled out, and JSON.
 *
 * Nothing here computes anything — a number that appears in the output was
 * produced by `registry.mjs` and is only being formatted.
 */

const defaultFormat = (value) =>
  typeof value === "number" ? value.toLocaleString("en-US") : String(value);

export const displayValue = (result) => (result.format ?? defaultFormat)(result.value);

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
function table(columns, rows) {
  const widths = columns.map((column, i) =>
    Math.max(
      column.header.length,
      ...rows
        .map((row) => String(row[i] ?? "").length)
        .filter((width) => width <= (column.maxWidth ?? Infinity)),
    ),
  );
  const line = (cells) =>
    cells
      .map((cell, i) => {
        const text = String(cell ?? "");
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

/** The default output: what each constant should be. */
export function renderTable(results) {
  return table(
    [
      { header: "Constant", align: "left" },
      { header: "Value", align: "right", maxWidth: 24 },
    ],
    results.map((r) => [r.name, displayValue(r)]),
  );
}

/** The same, with each value's derivation under it. */
export function renderVerbose(results) {
  return results
    .map((result) => {
      const heading = `${result.name} = ${displayValue(result)}`;
      return [
        heading,
        "─".repeat(heading.length),
        result.summary,
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
export function renderJson(results, { verbose, generatedAt }) {
  const constants = {};
  for (const result of results) {
    constants[result.name] = {
      value: result.value,
      display: displayValue(result),
      summary: result.summary,
      sources: result.sourceUrls,
      ...(verbose ? { derivation: result.explain } : {}),
    };
  }
  return JSON.stringify({ generatedAt, constants }, null, 2);
}

/** `--list`: the names, without fetching anything. */
export function renderList(constants) {
  return table(
    [
      { header: "Constant", align: "left" },
      { header: "What it is", align: "left" },
    ],
    constants.map((c) => [c.name, c.summary]),
  );
}
