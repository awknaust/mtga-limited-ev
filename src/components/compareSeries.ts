/**
 * Which events the Compare tab offers, how they are grouped, and what each one
 * is drawn in.
 *
 * Presentation, so it lives here rather than in `src/lib` — the model has no
 * opinion about colour, and `src/lib` stays free of anything a stylesheet reads.
 *
 * Two things are kept honest by `compareSeries.test.ts` rather than by care:
 * every preset appears in exactly one group, and every preset gets a
 * (colour, dash) pair no other preset has. Both fail loudly when an event is
 * added, which is the point — the alternative is an event that silently never
 * appears in the selector, or two lines a reader cannot tell apart.
 */

import {
  ARENA_DIRECT,
  ARENA_DIRECT_COLLECTOR,
  ARENA_DIRECT_PLAY,
  CONSTRUCTED_EVENT,
  CONTENDER_DRAFT,
  CUSTOM_PRESET,
  PICK_TWO_DRAFT,
  PREMIER_CUBE_DRAFT,
  PREMIER_DRAFT,
  PRESETS,
  QUALIFIER_PLAY_IN_BO1,
  QUALIFIER_PLAY_IN_BO3,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_CONSTRUCTED_EVENT,
  TRADITIONAL_CUBE_DRAFT,
  TRADITIONAL_DRAFT,
  TRADITIONAL_SEALED,
} from "../lib";

export type CompareGroup = {
  label: string;
  /** Preset names, in the order the selector lists them. */
  names: string[];
};

/**
 * The selector's groups, following the ordering already argued for in
 * `presets.ts` — drafts, sealed, the Directs together, the two constructed
 * events, then the Play-Ins.
 *
 * By reference to each preset rather than by string, so a rename moves the
 * grouping with it instead of dropping an event out of the selector. A group is
 * a label and nothing more: it says what kind of event these are, not which is
 * worth entering.
 */
export const COMPARE_GROUPS: CompareGroup[] = [
  {
    label: "Draft",
    names: [
      PREMIER_DRAFT.name,
      QUICK_DRAFT.name,
      TRADITIONAL_DRAFT.name,
      PREMIER_CUBE_DRAFT.name,
      TRADITIONAL_CUBE_DRAFT.name,
      PICK_TWO_DRAFT.name,
      CONTENDER_DRAFT.name,
    ],
  },
  { label: "Sealed", names: [SEALED.name, TRADITIONAL_SEALED.name] },
  {
    label: "Arena Direct",
    names: [ARENA_DIRECT.name, ARENA_DIRECT_PLAY.name, ARENA_DIRECT_COLLECTOR.name],
  },
  {
    label: "Constructed",
    names: [CONSTRUCTED_EVENT.name, TRADITIONAL_CONSTRUCTED_EVENT.name],
  },
  {
    label: "Qualifier Play-In",
    names: [QUALIFIER_PLAY_IN_BO1.name, QUALIFIER_PLAY_IN_BO3.name],
  },
];

/**
 * How many hues the ramp carries, and the dash patterns that extend it.
 *
 * Eight is about as many lines as can be told apart by colour at once, and the
 * dash is a second channel rather than a decoration: eight hues times two
 * patterns is sixteen distinct series, which is exactly `PRESETS.length` today.
 *
 * That the two numbers meet exactly is why the uniqueness test matters. A
 * seventeenth preset has nowhere to go, and the test says so on the build that
 * adds it; the fix is one more entry in `DASHES` (worth eight more series) or
 * one more hue, plus the matching `.compare-series-*` rule in `styles.css`.
 */
const RAMP_LENGTH = 8;

/** `stroke-dasharray` per lap through the ramp; `null` is a solid line. */
const DASHES: (string | null)[] = [null, "6 4"];

export type CompareSeries = {
  /** Carries the hue as `--series`; see the `.compare-series-*` rules. */
  colorClass: string;
  /** `stroke-dasharray`, or null for a solid line. */
  dash: string | null;
};

/**
 * What one event is drawn in — stable for the life of the app, not assigned by
 * position in the current selection.
 *
 * Stability is the whole requirement. Colour by position and toggling one event
 * off repaints every line below it, so the reader loses track of which curve
 * they were following mid-comparison. Keyed off the preset's index instead, so
 * Premier Draft is the same colour on every visit and in everyone's screenshot.
 *
 * The reader's own hand-edited ladder gets its own slot rather than a place in
 * the ramp: it is the one series that is not a fixed event, and there is
 * exactly one of it.
 */
export function compareSeries(name: string): CompareSeries {
  if (name === CUSTOM_PRESET) return { colorClass: "compare-series-custom", dash: null };
  const i = PRESETS.findIndex((p) => p.name === name);
  // An unknown name is not a thrown error: the selector and the codec both
  // filter to known presets already, so reaching here means a caller found a
  // way past them, and a drawn line in the fallback colour is a better failure
  // than a blank tab.
  if (i < 0) return { colorClass: "compare-series-custom", dash: null };
  return {
    colorClass: `compare-series-${i % RAMP_LENGTH}`,
    dash: DASHES[Math.floor(i / RAMP_LENGTH) % DASHES.length],
  };
}

/** Every class `compareSeries` can return, for the stylesheet's test to check. */
export const COMPARE_SERIES_CLASSES: string[] = [
  ...Array.from({ length: RAMP_LENGTH }, (_, i) => `compare-series-${i}`),
  "compare-series-custom",
];
