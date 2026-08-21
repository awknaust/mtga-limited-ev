/**
 * The grid against the simulation it is made of.
 *
 * Nothing here re-derives a bankroll figure, and deliberately: every one of
 * them is already held to six independent closed forms by
 * `bankroll.validation.test.ts`, and re-checking a mean against a second
 * hand-rolled mean would only pin this file to the same arithmetic twice. What
 * is genuinely new in this module is three claims, and they are what is tested:
 * each row *is* `simulateBankrolls` for that config, every row is played at the
 * *same* seed, and a row carries the summary fields and no others.
 */

import { describe, expect, it } from "vitest";

import { bankrollConfigFor, simulateBankrolls } from "./bankroll";
import {
  bankrollSummary,
  simulateBankrollGrid,
  simulateBankrollGridSteps,
} from "./bankrollGrid";
import { PRESETS, configFromPreset, defaultConfig } from "./presets";
import type { EventConfig } from "./types";

const base = defaultConfig();
const roll = { startingGems: 3000, startingGold: 500, startingPlayInPoints: 0, maxGames: 75 };
const RUNS = 400;

/**
 * What "the same simulation" means since the stopping point became a games
 * budget: the plan resolved against each row's own config, which is the one
 * step the grid performs that a bare `simulateBankrolls` call does not.
 */
const rolled = (config: EventConfig, runs: number, seed: number) =>
  simulateBankrolls(config, bankrollConfigFor(config, roll), runs, seed);

const preset = (name: string): EventConfig => {
  const p = PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`no preset named ${name}`);
  return configFromPreset(p, base);
};

/*
 * Three events that end differently under one balance — a short expensive one,
 * a long cheap one, and one nothing here can afford an entry to — so a row
 * matched against the wrong config would show it.
 */
const premier = preset("Premier Draft");
const quick = preset("Quick Draft");
const direct = preset("Arena Direct (Play)");

describe("simulateBankrollGrid", () => {
  it("gives each config exactly what simulateBankrolls gives it", () => {
    const grid = simulateBankrollGrid([premier, quick, direct], roll, RUNS, 7);
    expect(grid).toEqual([
      bankrollSummary(rolled(premier, RUNS, 7)),
      bankrollSummary(rolled(quick, RUNS, 7)),
      bankrollSummary(rolled(direct, RUNS, 7)),
    ]);
  });

  /*
   * The seed above is one number for the whole grid, so the row-by-row
   * equality already fails if the grid advances it per event. This says the
   * same thing from the other side, and is the one that reads as the claim:
   * two rows are the same simulation up to the config, which is what makes
   * their difference the events rather than the draws.
   */
  it("plays every event at the same seed, not one seed per position", () => {
    const [a, b] = simulateBankrollGrid([premier, premier], roll, RUNS, 3);
    expect(a).toEqual(b);
    // And the shared seed is the one asked for, not the first position's.
    expect(a).toEqual(bankrollSummary(rolled(premier, RUNS, 3)));
  });

  it("resolves the games budget against each row's own event", () => {
    /*
     * The one step the grid adds to `simulateBankrolls`, so the one step a
     * test has to be able to see failing. The rows above cannot: Premier and
     * Quick share a structure and so a cap, and the Direct row can afford no
     * entry, so a grid that resolved the plan once — against its first config
     * — would pass them all. A best-of-three event converts the same budget
     * to a different cap, and the balance here is deep enough that runs
     * actually reach both caps rather than busting short of either.
     */
    const traditional = preset("Traditional Draft");
    const deep = { ...roll, startingGems: 30_000 };
    expect(bankrollConfigFor(premier, deep).maxEvents).not.toBe(
      bankrollConfigFor(traditional, deep).maxEvents,
    );
    const grid = simulateBankrollGrid([premier, traditional], deep, RUNS, 9);
    expect(grid).toEqual([
      bankrollSummary(simulateBankrolls(premier, bankrollConfigFor(premier, deep), RUNS, 9)),
      bankrollSummary(
        simulateBankrolls(traditional, bankrollConfigFor(traditional, deep), RUNS, 9),
      ),
    ]);
    // The caps are exercised, not merely different: runs reach them.
    expect(grid[0].survivedFraction).toBeGreaterThan(0);
    expect(grid[1].survivedFraction).toBeGreaterThan(0);
  });

  it("answers positionally, so reordering the configs reorders the rows", () => {
    const forward = simulateBankrollGrid([premier, quick], roll, RUNS, 5);
    const reversed = simulateBankrollGrid([quick, premier], roll, RUNS, 5);
    expect(reversed).toEqual([forward[1], forward[0]]);
  });

  it("carries the summary fields and nothing else", () => {
    /*
     * A key-set assertion rather than a type: an object with extra properties
     * still satisfies `BankrollSummary`, so the compiler cannot see a spread
     * of the whole result — and `samples` alone is why a BankrollResult is
     * ~4.3 MB and a summary is not.
     */
    const [row] = simulateBankrollGrid([premier], roll, RUNS, 1);
    expect(Object.keys(row).sort()).toEqual([
      "eventPercentiles",
      "gamePercentiles",
      "meanEvents",
      "meanFinalValue",
      "medianFinalValue",
      "survivedFraction",
      "trials",
      "valuePercentiles",
    ]);
  });

  it("returns nothing for no configs, rather than failing", () => {
    expect(simulateBankrollGrid([], roll, RUNS, 1)).toEqual([]);
  });
});

describe("simulateBankrollGridSteps", () => {
  /*
   * The claim the worker's cancellation rides on. A grid that stopped yielding
   * once its first event finished would be uncancelable for the remaining
   * fifteen, so what matters is not that it yields but that it keeps yielding
   * across the boundary — which is what a count carried over the whole grid,
   * rather than restarted per event, is able to say.
   */
  it("keeps yielding a climbing run count past the first event's last run", () => {
    const gen = simulateBankrollGridSteps([premier, quick], roll, RUNS, 7);
    const yields: number[] = [];
    for (;;) {
      const step = gen.next();
      if (step.done) break;
      yields.push(step.value);
    }
    expect(yields.length).toBeGreaterThan(1);
    expect([...yields].sort((a, b) => a - b)).toEqual(yields);
    // Yields land in the second event too, and the count never overshoots.
    expect(yields.at(-1)).toBeGreaterThan(RUNS);
    expect(yields.at(-1)).toBeLessThanOrEqual(2 * RUNS);
  });

  /*
   * Where a drain stops changes nothing about the answer, because a yield
   * touches no state — the same contract `simulateBankrollsSteps` keeps, read
   * one level up. Drained a chunk at a time with work in between, it must
   * still equal the straight-through answer.
   */
  it("is unaffected by being drained in pieces", () => {
    const gen = simulateBankrollGridSteps([premier, quick, direct], roll, RUNS, 7);
    let step = gen.next();
    while (!step.done) {
      // Something else consuming a PRNG between chunks, which is what a worker
      // yielding to the event loop amounts to.
      Math.random();
      step = gen.next();
    }
    expect(step.value).toEqual([
      bankrollSummary(rolled(premier, RUNS, 7)),
      bankrollSummary(rolled(quick, RUNS, 7)),
      bankrollSummary(rolled(direct, RUNS, 7)),
    ]);
  });
});
