#!/usr/bin/env node
/**
 * Re-derives the constants in `src/lib/presets.ts` that stand behind the app's
 * Values & assumptions dialog and prints what they should be today.
 *
 *     npm run refresh:constants                            every constant
 *     npm run refresh:constants -- GEMS_PER_USD            just one
 *     npm run refresh:constants -- --verbose               with the workings
 *     npm run refresh:constants -- --json
 *     npm run refresh:constants -- --list                  the inventory, no fetching
 *
 * It reads nothing from the repository and writes nothing to it. Whether a
 * number here should replace the one in `presets.ts` is a judgement — most
 * moves are noise — so that call is left to whoever is reading, and the doc
 * comments they would have to update along with it.
 *
 * The list is the dialog's inventory (see `registry.ts`): every default the
 * reader can edit there is here, including the four that are choices or
 * refusals with nothing to fetch behind them — those print the figure and its
 * reasoning so the inventory has no holes, and a run cannot move them.
 *
 * Every value carries an "as of" date: the run date if its source was
 * fetched, the date it was last checked in the client if it is a by-hand
 * figure, none if it is a choice. It is a column in the table, a line under
 * `--verbose`, and `asOf` in the JSON.
 *
 * The two generic box constants are here too, and they are the heavy ones:
 * their source is the box-price feed (`scripts/box-prices/`, some forty
 * requests), fetched only when one of them is asked for. The per-set price
 * *table* is not a constant and is not here — the app ships a copy of the feed
 * for that (`npm run box:prices -- --write`).
 *
 * Exit codes: 0 printed a result, 2 could not — a source was unreachable, a
 * page changed shape, or the arguments named no constant this knows. There is
 * no exit code for "a number moved", because nothing here knows what the
 * previous number was.
 */

import { Command, InvalidArgumentError } from "commander";

import { isoDate } from "../shared/dates.ts";
import { SourceError } from "../shared/http.ts";
import {
  CONSTANTS,
  UnknownConstantError,
  selectConstants,
  type Context,
  type NamedConstantDef,
} from "./registry.ts";
import { renderJson, renderList, renderTable, renderVerbose, type NamedResult } from "./report.ts";
import { SOURCE_URLS, createSources } from "./sources.ts";

const EXIT_OK = 0;
const EXIT_CANNOT_ANSWER = 2;

function buildProgram(): Command {
  return new Command()
    .name("refresh-constants")
    .description(
      "Re-derive the constants behind the app's Values & assumptions dialog — from\n" +
        "Wizards' drop rates, Scryfall and the box-price feed, plus the in-client\n" +
        "figures recorded in by-hand.ts and the few that are choices with no source.",
    )
    .argument("[constant...]", "names to derive, case-insensitive; every constant if none are given")
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
async function derive(constants: NamedConstantDef[], ctx: Context): Promise<NamedResult[]> {
  return Promise.all(
    constants.map(async (constant) => ({
      name: constant.name,
      summary: constant.summary,
      sourceUrls: constant.sources.map((key) => SOURCE_URLS[key]),
      ...(await constant.compute(ctx)),
    })),
  );
}

async function main(argv: string[]): Promise<number> {
  const program = buildProgram();
  program.parse(argv);

  const options = program.opts<{ json?: boolean; verbose?: boolean; list?: boolean }>();
  const names = (program.processedArgs[0] ?? []) as string[];

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
