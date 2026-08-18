import { CUSTOM_PRESET, PRESETS, breakEvenWinRate, configFromPreset } from "../lib";
import type { EventConfig } from "../lib";

/**
 * What the Compare tab compares, and the order it draws them in.
 *
 * Pure, and in its own module rather than in `Compare.tsx`, for two reasons
 * that both turned out to be the same one. `App` needs `pickEvents` — it owns
 * the grid simulation, because that has to outlive the tab's unmount — and a
 * component importing from another component to get a helper is a graph nobody
 * can follow. And nothing in a `.tsx` file here is reachable from the test
 * suite at all: there is no DOM, so importing one throws on `document` before a
 * single assertion runs. A helper that cannot be tested or measured is one
 * nobody will check.
 */

/** One selected event: the name the reader sees, and the config it prices. */
export type CompareEvent = { name: string; config: EventConfig };

/** One event as the two ranked charts draw it, with the figure they sort on. */
export type CompareRow = CompareEvent & { breakEven: number | null };

/**
 * The selection as configs, under the reader's own rates.
 *
 * "Custom" names the sidebar's own config, which is already what `config` is —
 * so it needs no preset applied, and there is no preset to apply. Every other
 * entry takes its event fields from the named preset and keeps every rate and
 * the win rate it was handed, which is what makes the comparison the reader's
 * own rather than a table of defaults.
 *
 * A name matching no preset is dropped rather than thrown on: the selector and
 * the link codec both filter to known presets already, so reaching here means
 * something got past them, and a tab one event short beats a blank one.
 */
export function pickEvents(
  selection: readonly string[],
  config: EventConfig,
): CompareEvent[] {
  return selection
    .map((name) => {
      if (name === CUSTOM_PRESET) return { name: "Custom", config };
      const preset = PRESETS.find((p) => p.name === name);
      return preset ? { name, config: configFromPreset(preset, config) } : null;
    })
    .filter((e): e is CompareEvent => e !== null);
}

/**
 * The selection with each event's break-even rate, in the order it was picked.
 *
 * Computed once for the whole tab, and that is the point rather than a tidiness
 * argument: `breakEvenWinRate` is a bisection over the closed-form expectation,
 * and it is the most expensive thing this tab does per render — measured at
 * 2.7 ms for five events and 9.1 ms for sixteen, against a whole-tab render of
 * roughly 43 and 52 ms. It used to be run twice, once inside the chart that
 * plots it and once inside the table that lists it, which is most of a frame
 * spent computing a number that was already on the page.
 */
export function withBreakEven(picked: readonly CompareEvent[]): CompareRow[] {
  return picked.map((e) => ({ ...e, breakEven: breakEvenWinRate(e.config) }));
}

/**
 * The order the tab's two bar charts share, easiest bar to clear at the top.
 *
 * One ordering because they are stacked with the same names down the same left
 * margin: a reader checking an event's break-even against how far their balance
 * went in it is reading across two charts, and would read across the wrong row
 * if the two disagreed.
 *
 * A copy, so the caller keeps the picked order for the table — which opens
 * agreeing with the chips and then ranks by whichever column the reader decides
 * settles it.
 *
 * An event with no break-even sorts to the end whichever kind of null it is —
 * one that never crosses zero and one already ahead at every rate — and the
 * chart's own label says which. The sort is stable, so events the ranking
 * cannot separate keep the order the chips show them in.
 */
export function rankByBreakEven(rows: readonly CompareRow[]): CompareRow[] {
  return [...rows].sort((a, b) => (a.breakEven ?? Infinity) - (b.breakEven ?? Infinity));
}

/**
 * How many characters of an event's name a chart's row label shows.
 *
 * Sized from the data rather than from the look of it, because the names are
 * near-duplicates of each other and a cap that is too tight does not merely
 * abbreviate — it makes two rows read as the same event. `Qualifier Play-In
 * (Bo1)` and `(Bo3)` are twenty-three characters that differ in the
 * twenty-second, so anything under that turns the two into one label twice,
 * which is worse on a chart whose whole job is telling events apart than a
 * wide margin ever was. Twenty-four clears that and clips exactly one of
 * today's sixteen.
 *
 * The budget it has to fit inside is the left margin less its gap, measured at
 * the *larger* of the two sizes `.chart-tick` takes — 11px, which is what
 * narrow viewports get — where twenty-four characters come to about 132 units
 * against a 136-unit budget.
 */
const LABEL_MAX = 24;

/**
 * An event's name, clipped to fit a row label.
 *
 * The ellipsis is a real one rather than three dots, and the charts pair this
 * with a `<title>` carrying the whole name, so nothing is actually lost — the
 * chips above and the table below both spell every name out in full anyway.
 */
export const rowLabel = (name: string): string =>
  name.length > LABEL_MAX ? `${name.slice(0, LABEL_MAX - 1).trimEnd()}\u2026` : name;
