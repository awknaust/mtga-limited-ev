#!/usr/bin/env node
/**
 * Re-derives the sourced constants in `src/lib/presets.ts` from their sources
 * and prints what they should be today.
 *
 *     npm run refresh:constants                            every constant
 *     npm run refresh:constants -- GEMS_PER_USD            just one
 *     npm run refresh:constants -- --verbose               with the workings
 *     npm run refresh:constants -- --json
 *
 * It reads nothing from the repository and writes nothing to it. Whether a
 * number here should replace the one in `presets.ts` is a judgement — street
 * prices wander by a few percent between runs and most moves are noise — so
 * that call is left to whoever is reading, and the doc comments they would have
 * to update along with it.
 *
 * Run it every couple of weeks. The two box constants track street prices and
 * are the part that actually moves; the rest is cheap to compute alongside and
 * exists to catch the day Wizards changes a published rate quietly.
 *
 * Exit codes: 0 printed a result, 2 could not — a source was unreachable, a
 * page changed shape, or the arguments named no constant this knows. There is
 * no exit code for "a number moved", because nothing here knows what the
 * previous number was.
 */

import { Command, InvalidArgumentError } from "commander";

import { SourceError } from "./errors.mjs";
import { isoDate } from "./derive.mjs";
import { CONSTANTS, UnknownConstantError, selectConstants } from "./registry.mjs";
import { renderJson, renderList, renderTable, renderVerbose } from "./report.mjs";
import { SOURCE_URLS, createSources } from "./sources.mjs";

const EXIT_OK = 0;
const EXIT_CANNOT_ANSWER = 2;

function buildProgram() {
  return new Command()
    .name("refresh-constants")
    .description(
      "Re-derive the sourced constants in src/lib/presets.ts from Wizards' drop rates,\n" +
        "Scryfall and MTGGoldfish, plus the in-client figures recorded in by-hand.mjs.",
    )
    .argument(
      "[constant...]",
      "names to derive, case-insensitive; every constant if none are given",
    )
    .option("--json", "emit JSON instead of a table")
    .option("-v, --verbose", "show how each value was arrived at")
    .option("-l, --list", "list the constants this knows, without deriving them")
    .addHelpText(
      "after",
      `\nConstants:\n  ${CONSTANTS.map((c) => c.name).join("\n  ")}\n\n` +
        `Sources:\n  ${Object.values(SOURCE_URLS).join("\n  ")}\n`,
    );
}

/**
 * Runs the selected constants together.
 *
 * Concurrently, because the sources memoise: two constants that want the same
 * page share one request, and a constant that wants no page makes none. Asking
 * for GEMS_PER_USD alone touches the network zero times.
 */
async function derive(constants, ctx) {
  return Promise.all(
    constants.map(async (constant) => {
      const computed = await constant.compute(ctx);
      return {
        name: constant.name,
        summary: constant.summary,
        sourceUrls: constant.sources.map((key) => SOURCE_URLS[key]),
        ...computed,
      };
    }),
  );
}

async function main(argv) {
  const program = buildProgram();
  program.parse(argv);

  const options = program.opts();
  const names = program.processedArgs[0] ?? [];

  if (options.list) {
    console.log(renderList(CONSTANTS));
    return EXIT_OK;
  }

  const selected = selectConstants(names);
  const now = new Date();
  const results = await derive(selected, { sources: createSources(), now });

  if (options.json) {
    console.log(renderJson(results, { verbose: Boolean(options.verbose), generatedAt: isoDate(now) }));
  } else if (options.verbose) {
    console.log(renderVerbose(results));
  } else {
    console.log(renderTable(results));
  }
  return EXIT_OK;
}

try {
  process.exitCode = await main(process.argv);
} catch (err) {
  if (err instanceof SourceError) {
    console.error(`Could not derive: ${err.message}`);
    console.error("Nothing was checked, so nothing here says a number has moved.");
    process.exitCode = EXIT_CANNOT_ANSWER;
  } else if (err instanceof UnknownConstantError || err instanceof InvalidArgumentError) {
    console.error(err.message);
    process.exitCode = EXIT_CANNOT_ANSWER;
  } else {
    throw err;
  }
}
