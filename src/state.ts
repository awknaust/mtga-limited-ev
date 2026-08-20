/**
 * The state the whole app runs on, and what a fresh load starts it at.
 *
 * The shape and its defaults sit together, in one place and apart from the
 * codec: `share.ts` writes only what differs from these, so a default that
 * disagreed with the encoder's baseline would be written into every link. That
 * makes the dependency one-way — the codec imports the defaults to measure
 * against, and nothing here knows a URL exists.
 *
 * Pure, like `format.ts`: no React, no `location`, no `history`. App.tsx holds
 * one of these in one `useState` and the browser side is its own.
 */

import type { Unit } from "./format";
import {
  CURRENT_MASTERY_TRACK,
  CUSTOM_PRESET,
  GEMS_PER_USD,
  PICK_TWO_DRAFT,
  PREMIER_DRAFT,
  PRESETS,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_DRAFT,
  defaultConfig,
  type EventConfig,
} from "./lib";

export type Tab = "bankroll" | "event" | "mastery" | "about" | "compare";

/** Everything a link restores. */
export type ShareState = {
  presetName: string;
  config: EventConfig;
  /** How many runs the Bankroll tab plays, each a whole sequence of events. */
  bankrollRuns: number;
  seed: number;
  startingGems: number;
  startingGold: number;
  /** Play-in points banked at the start; only the Play-Ins spend them. */
  startingPlayInPoints: number;
  maxEvents: number;
  tab: Tab;
  /**
   * Which Set Mastery season the Mastery tab prices, by its stable slug.
   *
   * A slug rather than a name because it is the thing that has to survive a
   * relabelling, and it is what the URL carries either way.
   */
  masterySlug: string;
  /**
   * Which events the Compare tab draws, by preset name, `CUSTOM_PRESET`
   * included where the reader's own ladder is one of them.
   *
   * Names rather than slugs, like `presetName` — the slug is a spelling the URL
   * uses and nothing else reads. Held in `PRESETS` order however it was picked,
   * so the chart's series order is stable under toggling and a link does not
   * change because two events were chosen in the other order.
   *
   * The empty list is a real value, and distinct from the default: see
   * `encodeShareState`.
   */
  compareSelection: string[];
  unit: Unit;
  gemsPerUsd: number;
};

/**
 * The balance the top-up prompt offers, counted in entries to the event being
 * switched to.
 *
 * Two rather than a round number of gems, because what decides whether the
 * Bankroll tab says anything is how many times you can play, not the balance
 * itself. One entry busts at the first bad event and the histogram collapses
 * to a single bar; two is the smallest balance that can survive one.
 *
 * It priced the opening balance too until that became a wallet rather than a
 * multiple of one entry — see `defaultShareState`. What it offers now is still
 * derived from the event, which is the point: the prompt fires because the
 * balance in hand does not cover *that* event, so the figure it suggests has
 * to be in that event's own units.
 */
export const STARTING_ENTRIES = 2;

/**
 * The ceilings the simulation inputs hold, in one place because two things
 * apply them: the Advanced dialog's fields and the URL decoder below. Split
 * across both, a raised cap in one is a link that resolves differently from
 * the field it fills.
 *
 * What the numbers answer has changed. They were picked when every simulation
 * ran synchronously during render, so a cap was really a budget for how long
 * the page was allowed to freeze. The simulation runs in a worker now,
 * cancelled within about ten milliseconds by a superseding edit, so nothing
 * here blocks paint and the question is only how long someone is willing to
 * wait for a number that keeps getting better.
 *
 * Measured at roughly 56–66 ns per simulated event. `bankrollRuns` costs in
 * proportion to *events played*, so it multiplies with `maxEvents`, and the
 * two maxed together is a wait of minutes. That corner is left reachable
 * rather than designed away: capping the product instead would say what
 * actually costs time, but it is a different shape of control than a number
 * in a box, and this change is only the ceilings.
 *
 * Memory is not what bounds either. A `BankrollResult` is summary statistics
 * plus a fixed hundred recorded runs, so its size tracks `maxEvents` and not
 * the run count at all.
 */
export const SIM_LIMITS = {
  bankrollRuns: 1_000_000,
  maxEvents: 2_000,
} as const;

/**
 * The events the Compare tab opens on: the limited events a player picking
 * something to queue is usually picking between.
 *
 * Five, which the chart can still label at the ends — sixteen lines at once is
 * a shape nobody can read, and the selector is right there for the rest. Which
 * five is a judgement about what is usually being weighed up, not a claim about
 * which is worth playing; the tab exists because that second question is the
 * reader's own rates to answer.
 *
 * In `PRESETS` order, which is the order `normalizeCompare` puts any selection
 * in. A default written in some other order would draw one way on a fresh load
 * and another after a link round-trip.
 *
 * By reference to the presets rather than by string, so renaming one moves this
 * with it instead of silently dropping it from the default.
 */
const DEFAULT_COMPARE: string[] = [
  PREMIER_DRAFT.name,
  QUICK_DRAFT.name,
  TRADITIONAL_DRAFT.name,
  PICK_TWO_DRAFT.name,
  SEALED.name,
];

/**
 * A compare selection in canonical form: deduped, and in `PRESETS` order with
 * `CUSTOM_PRESET` — which is in no such order — ahead of them.
 *
 * Applied on the way in and on the way out, so the selection is a set that
 * happens to have an order rather than a sequence that has to be preserved.
 * That is what keeps toggling an event off and on from moving its line to the
 * end of the chart, and keeps two readers who picked the same events in
 * different orders on the same link.
 */
export function normalizeCompare(names: readonly string[]): string[] {
  const rank = (name: string): number =>
    name === CUSTOM_PRESET ? -1 : PRESETS.findIndex((p) => p.name === name);
  return [...new Set(names)]
    .filter((name) => name === CUSTOM_PRESET || PRESETS.some((p) => p.name === name))
    .sort((a, b) => rank(a) - rank(b));
}

/**
 * The state a fresh load starts in.
 *
 * App.tsx seeds its state from this rather than repeating the literals,
 * because a default that disagrees with this module would be silently written
 * into every link.
 */
export function defaultShareState(): ShareState {
  // The event the app opens on.
  const opening = PRESETS[0];
  return {
    presetName: opening.name,
    config: defaultConfig(),
    bankrollRuns: 10_000,
    seed: 1,
    /*
     * A plausible wallet rather than a multiple of one entry: gems enough for
     * two Premier Drafts and change, gold enough for one Quick Draft but not
     * the 10,000 a Premier costs. Chosen figures rather than derived ones, and
     * what they have to be is a balance someone could be holding — the
     * Bankroll tab asks what happens to a real one, and a balance that divides
     * evenly into entries reads as a worked example instead.
     *
     * The gold is non-zero because it is an input someone has to be shown to
     * know it exists, and showing it costs nothing: Premier Draft's gold door
     * is 10,000, so it sits in the starting-bankroll tile until a run earns
     * its way up to an entry or the reader switches to an event that takes it,
     * and from then on it is spent ahead of gems (see `bankroll.ts`).
     *
     * The points do not get the same treatment, and the asymmetry is the
     * point. They are priced at DEFAULT_PLAY_IN_POINT_VALUE_GEMS, the
     * Play-In's gem door over its twenty points, so a Play-In's worth of them
     * would be the larger part of the starting bankroll on an event that
     * cannot spend them. `startingValue` counts them and a run hands them
     * back untouched, so the net would be unchanged and the ROI would not:
     * the tab would lead with a return measured against a stake that was
     * never at risk. Zero until the reader says otherwise.
     */
    startingGems: 3400,
    startingGold: 5000,
    startingPlayInPoints: 0,
    maxEvents: 20,
    tab: "bankroll",
    masterySlug: CURRENT_MASTERY_TRACK.slug,
    compareSelection: DEFAULT_COMPARE,
    unit: "gems",
    // The same rate the box values are converted at, so the Display field's
    // default and the constant behind it cannot drift apart.
    gemsPerUsd: GEMS_PER_USD,
  };
}

/**
 * Advanced settings back to a fresh load's values, leaving the rest alone.
 *
 * Written as what the dialog does *not* own rather than as a list of what it
 * does, and the direction is the whole point. Knobs accumulate in Advanced
 * settings, so a field added there is restored by this without anyone
 * remembering to come back here — whereas the list-what-it-owns version fails
 * silently, leaving one field untouched by a button that says it resets
 * everything. The three groups kept below fail loudly instead: forget one and
 * the payout table, the balance or the win rate visibly moves on a press.
 *
 * The fields it restores are all preset-independent — `configFromPreset` sets
 * only the ones kept here — so "default" means the same thing whichever event
 * is selected.
 */
export function resetAdvanced(state: ShareState): ShareState {
  const fresh = defaultShareState();
  return {
    ...fresh,
    presetName: state.presetName,
    config: {
      ...fresh.config,
      /*
       * The Event card's own fields: everything a preset defines, plus the win
       * rate, whose slider sits above the Advanced button rather than inside
       * the dialog.
       */
      winRate: state.config.winRate,
      structure: state.config.structure,
      gamesPerMatch: state.config.gamesPerMatch,
      entryCostGems: state.config.entryCostGems,
      entryCostGold: state.config.entryCostGold,
      entryCostPlayInPoints: state.config.entryCostPlayInPoints,
      draftPacks: state.config.draftPacks,
      payouts: state.config.payouts,
      /*
       * Not a setting at all: it is what the feed said, fetched once on load
       * and never edited. Dropping it here would quietly return every named
       * box to its generic average — a reset that changed the answer without
       * changing any field, and one no parameter would record, since the
       * table is never written to a link.
       */
      boxPrices: state.config.boxPrices,
    },
    // The Bankroll card's.
    startingGems: state.startingGems,
    startingGold: state.startingGold,
    startingPlayInPoints: state.startingPlayInPoints,
    maxEvents: state.maxEvents,
    // Where the page is pointed, which is not a setting to restore.
    tab: state.tab,
    masterySlug: state.masterySlug,
    // Which events are being compared is the same kind of thing as which tab is
    // open: a question the reader is asking, not a value the dialog owns. Reset
    // would otherwise empty the Compare tab back to its three from a button
    // that names none of this.
    compareSelection: state.compareSelection,
    unit: state.unit,
  };
}
