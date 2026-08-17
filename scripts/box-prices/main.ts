#!/usr/bin/env node
/**
 * The box-price feed by hand: fetches exactly what the Worker would publish,
 * prints it, and on request bakes it into the app.
 *
 *     npm run box:prices              a table, one line per set and box kind
 *     npm run box:prices -- --json    the raw payload, as KV would store it
 *     npm run box:prices -- --write   ...and write that payload to BAKED_FEED
 *
 * `--write` is the one thing here that writes anywhere, and what it writes is
 * the app's own copy of the feed: `src/data/box-prices.json`, the fallback
 * for when `/api/box-prices` cannot be reached — previews, dev without the
 * proxy, an outage. It is the same bytes KV would hold, and the app reads it
 * through the same validator as the live payload, so a preview is production
 * with an older feed and nothing more. CI runs this once at the top of every
 * build, so a deploy ships the newest feed it could reach; running it by hand
 * is how the checked-in copy is refreshed. A source being down writes
 * nothing and exits 2, and the checked-in copy stands.
 *
 * The Worker (`worker/`) is the deployment of this same module; if the
 * numbers here look wrong, the feed is wrong, and the place to look is
 * `scripts/box-prices/`. What any of these numbers *mean* is not this
 * module's business — the modelling (market vs listing, released or not,
 * which sets feed a default) lives in `src/lib/boxPrices.ts`, and it is
 * applied to the baked copy there, not here.
 *
 * Exit codes: 0 printed (and written), 2 a source was unreachable or changed
 * shape.
 */

import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { SourceError } from "../shared/http.ts";
import { fetchBoxPriceFeed } from "./fetch.ts";
import type { BoxPriceFeed } from "./feed.ts";

/**
 * Where the app keeps its copy of the feed. Under `src/data` beside the
 * presets and the mastery track: it is data the app ships, and like them it
 * is read by the model layer and never edited by hand.
 */
export const BAKED_FEED = new URL("../../src/data/box-prices.json", import.meta.url);

const usd = (n: number | null): string => (n === null ? "—" : n.toFixed(2));

function render(feed: BoxPriceFeed): string {
  const lines: string[] = [];
  lines.push(`box-price feed — generated ${feed.generatedAt}`);
  lines.push("");
  // HIGH gets extra room: it is where the shill listings live, and a
  // $169,420.69 collector box has actually appeared there.
  const header = `${"SET".padEnd(6)}${"RELEASED".padEnd(12)}${"TYPE".padEnd(18)}${"KIND".padEnd(11)}${"MARKET".padStart(8)}${"LOW".padStart(9)}${"MID".padStart(9)}${"HIGH".padStart(11)}${"DIRECT".padStart(8)}`;
  lines.push(header);
  lines.push("─".repeat(header.length));
  for (const set of feed.boxes) {
    const kinds = Object.entries(set.boxes);
    if (kinds.length === 0) {
      lines.push(`${set.code.toUpperCase().padEnd(6)}${(set.releasedAt ?? "—").padEnd(12)}${set.setType.padEnd(18)}(no boxes tracked)`);
      continue;
    }
    for (const [i, [kind, stats]] of kinds.entries()) {
      const label =
        i === 0
          ? `${set.code.toUpperCase().padEnd(6)}${(set.releasedAt ?? "—").padEnd(12)}${set.setType.padEnd(18)}`
          : " ".repeat(36);
      lines.push(
        label +
          kind.padEnd(11) +
          usd(stats?.market ?? null).padStart(8) +
          usd(stats?.low ?? null).padStart(9) +
          usd(stats?.mid ?? null).padStart(9) +
          usd(stats?.high ?? null).padStart(11) +
          usd(stats?.directLow ?? null).padStart(8),
      );
    }
  }
  if (feed.unmatched.length > 0) {
    lines.push("");
    lines.push(`unmatched by scryfall: ${feed.unmatched.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Replaces the app's copy of the feed with this one and says what moved.
 *
 * Only ever reached with a feed `buildFeed` was willing to publish, so a
 * source outage or a half-parsed page never gets this far and the file on
 * disk is left as it was. The previous stamp is reported because the age of
 * what was there is the thing a reader of the CI log wants to know.
 */
async function write(feed: BoxPriceFeed): Promise<string> {
  const path = fileURLToPath(BAKED_FEED);
  const previous = await readFile(path, "utf8").then(
    (text) => (JSON.parse(text) as { generatedAt?: unknown }).generatedAt,
    () => undefined,
  );
  await writeFile(path, `${JSON.stringify(feed, null, 2)}\n`);
  const was = typeof previous === "string" ? `, replacing one generated ${previous}` : "";
  return `wrote ${relative(process.cwd(), path)}: ${feed.boxes.length} sets, generated ${feed.generatedAt}${was}`;
}

async function main(argv: string[]): Promise<number> {
  const program = new Command()
    .name("box-prices")
    .description(
      "Fetch the box-price feed the Worker would publish — every box kind TCGplayer\n" +
        "tracks for the newest draftable sets, with full price statistics.",
    )
    .option("--json", "emit the raw feed payload instead of a table")
    .option("--write", "also write the payload to src/data/box-prices.json, the app's baked copy");
  program.parse(argv);

  const feed = await fetchBoxPriceFeed();
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
