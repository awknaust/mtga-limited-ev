#!/usr/bin/env node
/**
 * The calendar feed by hand: fetches exactly what the Worker would publish,
 * prints it, and on request bakes it into the app.
 *
 *     npm run calendar              a table, one line per entry
 *     npm run calendar -- --json    the raw payload, as KV would store it
 *     npm run calendar -- --write   ...and write that payload to BAKED_FEED
 *
 * Takes its credentials from the environment, under the same names the Worker
 * holds them as secrets. Locally that means a `.env` — `cp .env.example .env`
 * and fill it in; the npm script loads it with Node's own
 * `--env-file-if-exists`, so a missing file is not an error and nothing here
 * depends on a dotenv package:
 *
 *     npm run calendar
 *
 * The shell still wins. Node does not let the file override a variable that is
 * already set, which is what lets CI pass the same two names in as secrets on
 * the workflow step and run this exact script — and what stops a stale `.env`
 * on a developer's machine from quietly overriding one.
 *
 * `--write` is the one thing here that writes anywhere, and what it writes is
 * the app's own copy of the feed: `src/data/mtg-calendar.json`, the fallback
 * for when `/api/calendar` cannot be reached — previews, dev without the
 * proxy, an outage. It is the same bytes KV would hold, and the app reads it
 * through the same validator as the live payload. A source being down writes
 * nothing and exits 2, and the checked-in copy stands.
 *
 * The Worker (`worker/`) is the deployment of this same module; if what the
 * strip draws looks wrong, the feed is where to look. What any of it *means* —
 * which days the reader sees, what counts as past — is not this module's
 * business and lives in `src/lib/calendar.ts`.
 *
 * Exit codes: 0 printed (and written), 2 a source was unreachable, changed
 * shape, or the credentials were not in the environment.
 */

import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { SourceError } from "../shared/http.ts";
import { fetchCalendarFeed } from "./fetch.ts";
import type { CalendarFeed } from "./feed.ts";

/**
 * Where the app keeps its copy of the feed. Under `src/data` beside the
 * presets, the mastery tracks and the box prices: data the app ships, read by
 * the model layer and never edited by hand.
 */
export const BAKED_FEED = new URL("../../src/data/mtg-calendar.json", import.meta.url);

/** The day before an exclusive end, which is what a reader means by "to". */
function lastDay(end: string): string {
  const [y, m, d] = end.split("-").map(Number);
  const at = new Date(y, m - 1, d - 1);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
    at.getDate(),
  ).padStart(2, "0")}`;
}

function render(feed: CalendarFeed): string {
  const lines: string[] = [];
  lines.push(`calendar feed — generated ${feed.generatedAt}`);
  lines.push("");
  if (feed.entries.length === 0) {
    lines.push("(no entries in the window — an empty calendar is a real state)");
    return lines.join("\n");
  }
  // Wide enough for the longest token in CALENDAR_EVENT_TYPES, plus air.
  const TYPE_COL = 17;
  const header =
    `${"FROM".padEnd(12)}${"TO".padEnd(12)}${"DAYS".padStart(5)}  ` +
    `${"TYPE".padEnd(TYPE_COL)}TITLE`;
  lines.push(header);
  lines.push("─".repeat(Math.max(header.length, 56)));
  for (const entry of feed.entries) {
    const days = Math.round(
      (Date.parse(`${entry.end}T00:00:00Z`) - Date.parse(`${entry.start}T00:00:00Z`)) / 86_400_000,
    );
    // Ends are exclusive in the payload and inclusive to a reader, so the
    // table shows the last day the entry actually covers.
    const to = days === 1 ? "" : lastDay(entry.end);
    lines.push(
      entry.start.padEnd(12) +
        to.padEnd(12) +
        String(days).padStart(5) +
        "  " +
        entry.type.padEnd(TYPE_COL) +
        entry.title,
    );
  }
  const noted = feed.entries.filter((e) => e.note !== undefined).length;
  lines.push("");
  lines.push(`${feed.entries.length} entries, ${noted} with a description`);
  return lines.join("\n");
}

/**
 * Replaces the app's copy of the feed with this one and says what moved.
 *
 * Only ever reached with a feed `buildCalendarFeed` was willing to publish, so
 * a source outage or a changed payload shape never gets this far and the file
 * on disk is left as it was.
 */
async function write(feed: CalendarFeed): Promise<string> {
  const path = fileURLToPath(BAKED_FEED);
  const previous = await readFile(path, "utf8").then(
    (text) => (JSON.parse(text) as { generatedAt?: unknown }).generatedAt,
    () => undefined,
  );
  await writeFile(path, `${JSON.stringify(feed, null, 2)}\n`);
  const was = typeof previous === "string" ? `, replacing one generated ${previous}` : "";
  return `wrote ${relative(process.cwd(), path)}: ${feed.entries.length} entries, generated ${feed.generatedAt}${was}`;
}

/**
 * A credential from the environment, or a `SourceError` naming it.
 *
 * A SourceError rather than a plain throw so a missing variable exits 2 like
 * an unreachable source does: both mean "this run found nothing out", and
 * neither should read as the calendar having emptied.
 */
function credential(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new SourceError(
      `${name} is not set — copy .env.example to .env and fill it in, ` +
        "or see the calendar section of CLAUDE.md",
    );
  }
  return value;
}

async function main(argv: string[]): Promise<number> {
  const program = new Command()
    .name("calendar")
    .description(
      "Fetch the MTG Arena event calendar the Worker would publish, normalised to\n" +
        "whole days. Reads GOOGLE_CALENDAR_ID and GOOGLE_API_KEY from the environment.",
    )
    .option("--json", "emit the raw feed payload instead of a table")
    .option("--write", "also write the payload to src/data/mtg-calendar.json, the app's baked copy");
  program.parse(argv);

  const feed = await fetchCalendarFeed(
    credential("GOOGLE_CALENDAR_ID"),
    credential("GOOGLE_API_KEY"),
  );
  const opts = program.opts<{ json?: boolean; write?: boolean }>();
  console.log(opts.json ? JSON.stringify(feed, null, 2) : render(feed));
  if (opts.write) console.log(await write(feed));
  return 0;
}

try {
  process.exitCode = await main(process.argv);
} catch (err) {
  if (err instanceof SourceError) {
    console.error(`Could not build the feed: ${err.message}`);
    process.exitCode = 2;
  } else {
    throw err;
  }
}
