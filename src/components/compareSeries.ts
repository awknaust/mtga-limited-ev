import {
  CUSTOM_PRESET,
  EVENT_GROUPS,
  PRESETS,
  type EventGroup,
  type EventPreset,
} from "../lib";

export type CompareGroup = {
  label: string;
  /** Preset names, in the order the selector lists them. */
  names: string[];
};

/**
 * What each group is called on screen.
 *
 * The only part of the grouping that is presentation: the keys and their order
 * are on the preset and in `EVENT_GROUPS`, because which kind of event
 * something is is a fact about the event. A label says nothing about which is
 * worth entering — it says what kind of thing it is.
 *
 * Typed against `EventGroup`, so adding a group to the model without naming it
 * here does not compile.
 */
const GROUP_LABELS: Record<EventGroup, string> = {
  draft: "Draft",
  sealed: "Sealed",
  direct: "Arena Direct",
  constructed: "Constructed",
  "play-in": "Qualifier Play-In",
};

/**
 * The selector's groups, derived rather than listed.
 *
 * Every preset names its own group, so this cannot omit one, cannot list one
 * twice, and cannot name something that is not a preset — the three things the
 * hand-written version needed a test to promise. Adding an event now means
 * adding its file and nothing else, and forgetting the group is a compile
 * error in that file rather than a failure somewhere else.
 *
 * Groups come out in `EVENT_GROUPS` order and presets within a group in
 * `PRESETS` order, both of which are already deliberate.
 *
 * A group nothing is in is dropped rather than rendered empty, which is what
 * lets a group exist in the model before any event uses it.
 */
export function compareGroups(presets: readonly EventPreset[]): CompareGroup[] {
  return EVENT_GROUPS.map((group) => ({
    label: GROUP_LABELS[group],
    names: presets.filter((p) => p.group === group).map((p) => p.name),
  })).filter((g) => g.names.length > 0);
}

export const COMPARE_GROUPS: CompareGroup[] = compareGroups(PRESETS);

/**
 * How many hues the ramp carries, and the treatments that extend it.
 *
 * Eight is about as many series as can be told apart by colour at once, and a
 * lap's treatment is a second channel rather than a decoration: eight hues
 * times two laps is sixteen distinct series, which is exactly `PRESETS.length`
 * today.
 *
 * That the two numbers meet exactly is why the uniqueness test matters. A
 * seventeenth preset has nowhere to go, and the test says so on the build that
 * adds it; the fix is one more entry in `LAPS` (worth eight more series) or one
 * more hue, plus the matching `.compare-series-*` rule in `styles.css`.
 */
const RAMP_LENGTH = 8;

/**
 * What each lap through the ramp looks like, in both the channels a chart here
 * can use.
 *
 * Two channels rather than one because the tab draws two kinds of mark and
 * neither treatment carries to the other: a `stroke-dasharray` means nothing to
 * a filled box, and a hatch means nothing to a plotted line. They are one entry
 * per lap rather than two parallel arrays so that a lap cannot be half added —
 * the failure that would ship a curve telling two events apart and a bar chart
 * beneath it that could not.
 */
type Lap = {
  /** `stroke-dasharray` for a plotted line; null is solid. */
  dash: string | null;
  /** Whether a filled shape is slashed through; see `CompareHatch`. */
  hatched: boolean;
};

const LAPS: Lap[] = [
  { dash: null, hatched: false },
  { dash: "6 4", hatched: true },
];

export type CompareSeries = Lap & {
  /** Carries the hue as `--series`; see the `.compare-series-*` rules. */
  colorClass: string;
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
  const own = { colorClass: "compare-series-custom", ...LAPS[0] };
  if (name === CUSTOM_PRESET) return own;
  const i = PRESETS.findIndex((p) => p.name === name);
  // An unknown name is not a thrown error: the selector and the codec both
  // filter to known presets already, so reaching here means a caller found a
  // way past them, and a drawn line in the fallback colour is a better failure
  // than a blank tab.
  if (i < 0) return own;
  return {
    colorClass: `compare-series-${i % RAMP_LENGTH}`,
    ...LAPS[Math.floor(i / RAMP_LENGTH) % LAPS.length],
  };
}

/** Every class `compareSeries` can return, for the stylesheet's test to check. */
export const COMPARE_SERIES_CLASSES: string[] = [
  ...Array.from({ length: RAMP_LENGTH }, (_, i) => `compare-series-${i}`),
  "compare-series-custom",
];
