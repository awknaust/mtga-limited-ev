#!/usr/bin/env node
/**
 * Manual inspection of the box-price feed: fetches exactly what the Worker
 * would publish and prints it.
 *
 *     npm run box:prices              a table, one line per set and box kind
 *     npm run box:prices -- --json    the raw payload, as KV would store it
 *
 * It writes nothing anywhere. The Worker (`worker/`) is the deployment of
 * this same module; if the numbers here look wrong, the feed is wrong, and
 * the place to look is `scripts/box-prices/`.
 *
 * What any of these numbers *mean* is not this module's business — the
 * modelling (market vs listing, released or not, which sets feed a default)
 * lives in `src/lib/boxPrices.ts`. The doc comment on PLAY_BOX_USD in
 * `src/lib/presets.ts` records how to turn this output into the baked
 * fallback constants when refreshing them by hand.
 *
 * Exit codes: 0 printed, 2 a source was unreachable or changed shape.
 */

import { Command } from "commander";

import { SourceError } from "../shared/http.ts";
import { fetchBoxPriceFeed } from "./fetch.ts";
import type { BoxPriceFeed } from "./feed.ts";

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

async function main(argv: string[]): Promise<number> {
  const program = new Command()
    .name("box-prices")
    .description(
      "Fetch the box-price feed the Worker would publish — every box kind TCGplayer\n" +
        "tracks for the newest draftable sets, with full price statistics.",
    )
    .option("--json", "emit the raw feed payload instead of a table");
  program.parse(argv);

  const feed = await fetchBoxPriceFeed();
  const opts = program.opts<{ json?: boolean }>();
  console.log(opts.json ? JSON.stringify(feed, null, 2) : render(feed));
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
