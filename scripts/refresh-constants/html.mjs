/**
 * Generic HTML reading. Nothing here knows which site it is looking at — the
 * source-specific extraction lives in `parse.mjs`.
 */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

export const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
    const key = name.toLowerCase();
    if (key in ENTITIES) return ENTITIES[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
    return whole;
  });

/**
 * Scripts and styles gone.
 *
 * Not cosmetic: the drop-rates page carries a second, JSON-escaped copy of its
 * own body inside a `<script>`, so an `indexOf` for a heading can land in the
 * duplicate and every offset after it is then meaningless.
 */
export const stripNoise = (html) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

/** Tags out, entities decoded, whitespace collapsed. */
export const textOf = (html) =>
  decode(stripNoise(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/**
 * Rows of cell text from the table nearest `anchor` — the one containing it if
 * the anchor is a heading cell, otherwise the next one down.
 *
 * Both directions are needed because the two tables this reads are anchored
 * differently: one by a sentence above it, one by its own first header cell.
 */
export function tableNear(html, anchor) {
  if (anchor < 0) return null;
  let start = html.lastIndexOf("<table", anchor);
  if (start === -1 || html.indexOf("</table>", start) < anchor) {
    start = html.indexOf("<table", anchor);
  }
  if (start === -1) return null;
  const end = html.indexOf("</table>", start);
  if (end === -1) return null;
  return [...html.slice(start, end).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...tr[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) => textOf(cell[2])),
  );
}

/**
 * Set names as they appear across the three sources, reduced to something
 * comparable.
 *
 * Wizards writes "Magic: The Gathering® | Marvel's Spider-Man" where Scryfall
 * writes "Marvel's Spider-Man", and hangs a ™ off Avatar. Dropping everything
 * but letters and digits and then shedding the brand prefix leaves the part
 * that actually names the set.
 */
export const normaliseSetName = (name) =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^magicthegathering/, "");
