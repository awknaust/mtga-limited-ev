/**
 * The whole app state as a query string, so a configuration can be linked.
 *
 * Pure, like `format.ts` — it reads and writes strings and knows nothing about
 * `location` or `history`. App.tsx owns the browser side.
 *
 * Two rules shape the encoding:
 *
 * **Only deltas are written.** A parameter appears when its value differs from
 * what the selected preset implies, so a link to an untouched Premier Draft is
 * the bare origin and a link that moves one slider carries one parameter. The
 * baseline is `configFromPreset(preset, defaultConfig())` — the state you land
 * in when you pick that preset on a fresh load — not the model's own defaults,
 * so switching to Quick Draft does not spell out its whole ladder.
 *
 * **Nothing is compressed.** A shared link should be readable and editable by
 * hand, for the same reason every figure on the Long-term value tab is closed
 * form: a number you cannot check is a number you have to trust.
 */

import type { Unit } from "./format";
import {
  BOX_KINDS,
  CURRENT_MASTERY_TRACK,
  CUSTOM_PRESET,
  PICK_TWO_DRAFT,
  PREMIER_DRAFT,
  PRESETS,
  QUICK_DRAFT,
  SEALED,
  TRADITIONAL_DRAFT,
  masteryBySlug,
  configFromPreset,
  defaultConfig,
  entryPrice,
  maxPossibleWins,
  resizePayouts,
  type BoxKind,
  type EventConfig,
  type EventStructure,
  type PayoutBox,
  type PayoutTier,
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
 * The state a fresh load starts in. App.tsx seeds its `useState` calls from
 * this rather than repeating the literals, because a default that disagrees
 * with this module would be silently written into every link.
 */
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
    gemsPerUsd: 200,
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

/**
 * Whether the reset has anything left to do, which is what greys its button.
 *
 * Compared as the links the two states write rather than field by field, so it
 * cannot fall out of step with `resetAdvanced` by listing one field fewer: a
 * value the reset moved writes a different parameter, and one it kept writes
 * the same. The comparison inherits the encoder's six decimal places, which is
 * four more than any field on screen resolves.
 */
export const isAdvancedDefault = (state: ShareState): boolean =>
  encodeShareState(resetAdvanced(state)) === encodeShareState(state);

/** Preset name to the token that names it in a URL. */
export const presetSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const presetBySlug = (slug: string): string | null => {
  if (slug === presetSlug(CUSTOM_PRESET)) return CUSTOM_PRESET;
  return PRESETS.find((p) => presetSlug(p.name) === slug)?.name ?? null;
};

/**
 * A compare selection as it is spelled in a link: slugs joined with `_`.
 *
 * The separator is the one `encodePayouts` puts between rows, for the same
 * reason — `-` is unavailable, since it is already inside every slug.
 *
 * The empty selection encodes to the empty string, which is a value and not an
 * absence. `encodeShareState` writes it as a bare `compare=`; see the note
 * there about what that costs the decoder.
 */
const encodeCompare = (names: readonly string[]): string =>
  normalizeCompare(names).map(presetSlug).join("_");

/**
 * The config a preset implies on a fresh load, which is what its parameters are
 * measured against. Custom has no preset of its own, so it measures against the
 * model default — a custom event that happens to match Premier writes nothing
 * but `preset=custom`.
 */
function baselineConfig(presetName: string): EventConfig {
  const preset = PRESETS.find((p) => p.name === presetName);
  return preset ? configFromPreset(preset, defaultConfig()) : defaultConfig();
}

/**
 * Rounded to six places on the way out.
 *
 * The win rate can carry many decimals once it has been dragged, and six
 * places is four more than any figure on screen resolves.
 */
const num = (n: number): string =>
  Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : "0";

/** Scalar config fields, as they are named in a URL. */
const CONFIG_NUMBERS = [
  // Per *game*, as the model stores it — not the per-match figure the slider
  // shows for best-of-three.
  ["wr", "winRate"],
  ["draftPacks", "draftPacks"],
  ["draftPackValue", "draftPackValueGems"],
  ["packValue", "packValueGems"],
  ["mythicPackValue", "mythicPackValueGems"],
  ["cubePackValue", "cubePackValueGems"],
  ["playInValue", "playInPointValueGems"],
  ["qualifierTokenValue", "qualifierTokenValueGems"],
  ["playBoxValue", "playBoxValueGems"],
  ["collectorBoxValue", "collectorBoxValueGems"],
  /*
   * The mastery rates. Nothing but the Mastery tab reads them, but they are
   * ordinary reward values sitting in Advanced settings beside the rest, and a
   * link that restored every rate except these would be lying about what it
   * carries. They only ever appear in a URL once someone has changed one.
   */
  ["draftTokenValue", "draftTokenValueGems"],
  ["mythicIcrValue", "mythicIcrValueGems"],
  ["rareCardValue", "rareCardValueGems"],
  ["uncommonIcrValue", "uncommonIcrValueGems"],
  ["orbValue", "orbValueGems"],
  ["cardStyleValue", "cardStyleValueGems"],
  ["sleeveValue", "sleeveValueGems"],
  ["avatarValue", "avatarValueGems"],
  ["companionValue", "companionValueGems"],
  // The field became `otherGoldPerDay` when daily-win gold started coming off
  // the ladder instead. The parameter keeps its old spelling deliberately —
  // renaming it would strand every link already written, and the mapping is
  // here precisely so a field can be renamed without one.
  ["goldPerDay", "otherGoldPerDay"],
  ["eventsPerDay", "eventsPerDay"],
  // 0 means gold counts for nothing — the credit an event earns and a
  // balance a run is left with alike.
  ["goldPer10k", "gemsPer10kGold"],
  // 0 means "certain", which is how a URL spells the absence of uncertainty —
  // the same trick `goldPer10k` uses for gold that is worth nothing.
  ["confMatches", "winRateMatches"],
] as const satisfies readonly (readonly [string, keyof EventConfig])[];

/**
 * What an entry costs, in each currency — the fields a link can spell as *no
 * price at all*, which is why they are not in the list above.
 *
 * A price is a number or `null`, and the codec needs a token for the second.
 * It is `none`, and it is new; what is not new is the meaning. Every link
 * written before there was a token spelled a currency the event does not take
 * as `0`, so `0` decodes to exactly that, here as it always did:
 * `entryGold=0` said gold could not buy an entry then and says it now. The
 * token is for writing, so that a price and its absence are told apart in a
 * URL the way they are told apart in the model.
 */
const CONFIG_PRICES = [
  ["entry", "entryCostGems"],
  ["entryGold", "entryCostGold"],
  ["entryPoints", "entryCostPlayInPoints"],
] as const satisfies readonly (readonly [string, keyof EventConfig])[];

/** How a link spells a currency the event does not take. */
const NO_PRICE = "none";

/**
 * Bankroll and display fields, which sit outside the config.
 *
 * Two of these are retired, and neither name may be given a new meaning — an
 * old link would then say something its author never chose:
 *
 *  - `spendWinnings` let packs, points and boxes fund further entries, which
 *    nothing in Arena does. A link still carrying it decodes to a run that
 *    holds its winnings instead of spending them, and that is the intended
 *    reading rather than an oversight.
 *  - `trials` was the Long-term value tab's Monte Carlo count. Every figure
 *    on that tab is closed form now, so there is nothing for the number to
 *    size; a link carrying it decodes to the same event it always did, exactly.
 */
const UI_NUMBERS = [
  ["startGems", "startingGems"],
  ["startGold", "startingGold"],
  ["startPoints", "startingPlayInPoints"],
  ["maxEvents", "maxEvents"],
  ["gemsPerUsd", "gemsPerUsd"],
  ["runs", "bankrollRuns"],
  ["seed", "seed"],
] as const satisfies readonly (readonly [string, keyof ShareState])[];

/**
 * A payout table as `gems-packs[-points][-count.n…][-box…]` per row, rows in
 * win order joined by `_`. The win count is the row's position, so it is not
 * repeated.
 *
 * A box is `kind` or `kind.set` — `play`, `collector.latest`,
 * `collector.msh` — one token per box, since a row can pay two boxes of
 * different sets. What a link carries is which *product* was won, never what
 * it was worth: the price comes from the feed on the day the link is opened,
 * and from the generic rate when the feed has nothing to say. The generic
 * rates themselves are ordinary parameters, so a link that spells one out
 * still means exactly what it said.
 *
 * The counted rewards past the first three are named tokens — `mythic.4`,
 * `cube.7` — at most one of each a row, and named rather than positional for
 * a reason worth recording. The natural place for a fourth count is a fourth
 * number, and that place is taken: `4000-3-0-1` is a link written before boxes
 * named their sets, and it means one play box. A named token cannot collide
 * with it, so old links go on meaning exactly what they meant, every reward
 * added after this one costs no position, and the row stays legible besides.
 *
 * `-`, `_` and `.` are used because form encoding leaves them alone: a
 * separator of `,` or `:` would come back as `%2C` or `%3A` and cost the
 * table its readability. No number can be negative, so `-` is unambiguous,
 * and every named token starts with a letter, so none can be read as one of
 * the numbers.
 *
 * Links written before boxes named their sets spelled two counts positionally,
 * `gems-packs-points-playBoxes-collectorBoxes`. Those still decode, as that
 * many generic boxes — see `decodePayouts`.
 */
export function encodePayouts(payouts: PayoutTier[]): string {
  return payouts
    .map((t) => {
      const boxes = (t.boxes ?? []).map((b) => (b.set ? `${b.kind}.${b.set}` : b.kind));
      // Written only when there are some, like the boxes: a row paying none
      // says nothing about them, so no existing link's spelling moves.
      const counts = COUNT_TOKENS.filter(([, field]) => t[field]).map(
        ([token, field]) => `${token}.${num(t[field] as number)}`,
      );
      const fields = [t.gems, t.packs, t.playInPoints ?? 0];
      // The points slot goes when it is zero, tokens or no tokens: what
      // follows is named, so nothing is counting places.
      while (fields.length > 2 && fields[fields.length - 1] === 0) fields.pop();
      return [...fields.map(num), ...counts, ...boxes].join("-");
    })
    .join("_");
}

/** The box kinds a link may name, as they are spelled in one. */
const BOX_KIND_TOKENS = new Set<string>(BOX_KINDS);

/**
 * The counted rewards a row names rather than counts into a position, and the
 * token each is spelled with.
 *
 * None of these is a box kind, so this and `BOX_KIND_TOKENS` partition the
 * named tokens between them — a token is one or the other, and anything in
 * neither is malformed. Adding a reward is adding a line here; nothing else
 * in the codec knows how many there are.
 *
 * A token, once shipped, is fixed: it is what links already written say.
 */
const COUNT_TOKENS = [
  ["mythic", "mythicPacks"],
  ["cube", "cubePacks"],
  ["token", "qualifierTokens"],
] as const satisfies readonly (readonly [string, keyof PayoutTier])[];

/** The tier fields those tokens write, which are all optional counts. */
type CountField = (typeof COUNT_TOKENS)[number][1];

const COUNT_FIELDS = new Map<string, CountField>(COUNT_TOKENS);

/** Inverse of `encodePayouts`. Null on anything malformed, never a partial table. */
export function decodePayouts(raw: string): PayoutTier[] | null {
  const rows = raw.split("_");
  const out: PayoutTier[] = [];
  for (const [wins, row] of rows.entries()) {
    const parts = row.split("-");
    /*
     * Matched rather than handed to `Number`, which is far too willing: it
     * reads "" as 0, so `50--1` would parse as a well-formed 50/0/1 row
     * instead of the malformed thing it is, and it also takes "0x10" and
     * " 7 ". Only what `encodePayouts` writes is accepted back.
     */
    const isNumber = (p: string): boolean => /^\d+(\.\d+)?$/.test(p);
    // The leading run of numbers, which is where the old positional box
    // counts live; everything after it names a box, and a number turning up
    // again past that point is malformed rather than a sixth field.
    const lead = parts.findIndex((p) => !isNumber(p));
    const count = lead === -1 ? parts.length : lead;
    if (count < 2 || count > 5) return null;
    if (parts.slice(count).some(isNumber)) return null;

    const fields = parts.slice(0, count).map(Number);
    if (fields.some((n) => !Number.isFinite(n))) return null;
    const [gems, packs, playInPoints = 0, playBoxes = 0, collectorBoxes = 0] = fields;

    const boxes: PayoutBox[] = [];
    // A count of anonymous boxes is what old links carry, and repeating the
    // box that many times says the same thing in the shape used now.
    for (let i = 0; i < playBoxes; i++) boxes.push({ kind: "play" });
    for (let i = 0; i < collectorBoxes; i++) boxes.push({ kind: "collector" });
    const counts = new Map<CountField, number>();
    for (const token of parts.slice(count)) {
      const [name, tail, ...rest] = token.split(".");
      const field = COUNT_FIELDS.get(name);
      if (field) {
        // A count, where a box token is a product — so it takes a whole
        // number and a row may carry only one of each. Two would be a row
        // saying the same count twice, which is malformed rather than a sum.
        if (counts.has(field) || rest.length || tail === undefined || !/^\d+$/.test(tail)) {
          return null;
        }
        counts.set(field, Number(tail));
        continue;
      }
      if (rest.length || !BOX_KIND_TOKENS.has(name)) return null;
      // Scryfall codes are lowercase alphanumeric, and so is LATEST_SET.
      if (tail !== undefined && !/^[a-z0-9]+$/.test(tail)) return null;
      boxes.push(
        tail === undefined ? { kind: name as BoxKind } : { kind: name as BoxKind, set: tail },
      );
    }

    const tier: PayoutTier = { wins, gems, packs };
    // Left off entirely when empty, matching how the presets are written.
    for (const [field, n] of counts) if (n) tier[field] = n;
    if (playInPoints) tier.playInPoints = playInPoints;
    if (boxes.length) tier.boxes = boxes;
    out.push(tier);
  }
  return out.length ? out : null;
}

/** The structure as it is spelled in a URL: one kind's fields, never both. */
function encodeStructure(params: URLSearchParams, s: EventStructure): void {
  if (s.kind === "rounds") {
    params.set("rounds", num(s.rounds));
  } else {
    params.set("maxWins", num(s.maxWins));
    params.set("maxLosses", num(s.maxLosses));
  }
}

const sameStructure = (a: EventStructure, b: EventStructure): boolean =>
  a.kind === "rounds" && b.kind === "rounds"
    ? a.rounds === b.rounds
    : a.kind === "elimination" && b.kind === "elimination"
      ? a.maxWins === b.maxWins && a.maxLosses === b.maxLosses
      : false;

/**
 * State to query string, without a leading `?`. Empty when nothing has been
 * touched, which is what keeps an unmodified link to the bare origin.
 */
export function encodeShareState(state: ShareState): string {
  const params = new URLSearchParams();
  const fallback = defaultShareState();
  const base = baselineConfig(state.presetName);

  if (state.presetName !== fallback.presetName) {
    params.set("preset", presetSlug(state.presetName));
  }

  for (const [key, field] of CONFIG_NUMBERS) {
    const value = state.config[field] as number;
    if (value !== base[field]) params.set(key, num(value));
  }

  for (const [key, field] of CONFIG_PRICES) {
    const value = state.config[field];
    if (value !== base[field]) params.set(key, value === null ? NO_PRICE : num(value));
  }

  if (!sameStructure(state.config.structure, base.structure)) {
    encodeStructure(params, state.config.structure);
  }

  const payouts = encodePayouts(state.config.payouts);
  // Compared encoded rather than field by field: the two tables can differ in
  // length, and the string is the thing that has to round-trip anyway.
  if (payouts !== encodePayouts(resizePayouts(base.payouts, maxPossibleWins(state.config.structure)))) {
    params.set("payouts", payouts);
  }

  for (const [key, field] of UI_NUMBERS) {
    const value = state[field] as number;
    if (value !== (fallback[field] as number)) params.set(key, num(value));
  }

  if (state.tab !== fallback.tab) params.set("tab", state.tab);
  if (state.masterySlug !== fallback.masterySlug) {
    params.set("mastery", state.masterySlug);
  }

  /*
   * The one parameter whose *empty* value carries meaning, so it is the one
   * place the delta rule needs saying out loud.
   *
   * Three selections have to stay distinct: the default three, some other set,
   * and none at all — which the selector's None button reaches, and which is a
   * legitimate thing to link to. Absent means the default, as everywhere else
   * here; a bare `compare=` means none. The cost lands on the decoder, where
   * `params.get("compare")` returns `""` for that — falsy, and testing it for
   * truthiness rather than for null silently springs an empty selection back to
   * the default. `decodeShareState` tests `=== null`; `share.test.ts` pins it
   * both ways.
   */
  const compare = encodeCompare(state.compareSelection);
  if (compare !== encodeCompare(fallback.compareSelection)) params.set("compare", compare);

  if (state.unit !== fallback.unit) params.set("unit", state.unit);

  return params.toString();
}

/** A finite number in range, or the fallback. Values arrive from a URL. */
function numberFrom(
  params: URLSearchParams,
  key: string,
  fallback: number,
  { min = 0, max = Number.MAX_SAFE_INTEGER, int = false } = {},
): number {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return int ? Math.round(clamped) : clamped;
}

/**
 * An entry price in range, or the fallback. Values arrive from a URL.
 *
 * `none` is the absence written out; so is anything at or below zero, which
 * is both what old links spell it as and the model's own rule that a price of
 * nothing is not a price. An unparseable value falls back like any other,
 * since a mistyped price is not a claim that the event is free.
 */
function priceFrom(
  params: URLSearchParams,
  key: string,
  fallback: number | null,
): number | null {
  const raw = params.get(key)?.trim();
  if (raw === undefined || raw === "") return fallback;
  if (raw === NO_PRICE) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? entryPrice(n) : fallback;
}

const oneOf = <T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  const raw = params.get(key);
  return allowed.includes(raw as T) ? (raw as T) : fallback;
};

/**
 * Query string back to state, filling anything absent from the defaults.
 *
 * Nothing here trusts its input. A value out of range is clamped, an
 * unparseable one is dropped, and a malformed structure or payout table falls
 * back to the preset's — the model's invariants (a payout row per reachable
 * win count, contiguous from zero) hold on the way out whatever went in.
 */
export function decodeShareState(search: string): ShareState {
  const params = new URLSearchParams(search);
  const fallback = defaultShareState();

  const presetName = presetBySlug(params.get("preset") ?? "") ?? fallback.presetName;
  const base = baselineConfig(presetName);

  const structure = decodeStructure(params, base.structure);
  const decoded = params.has("payouts") ? decodePayouts(params.get("payouts") ?? "") : null;
  // Resized either way: a hand-edited URL can name a structure whose ceiling
  // does not match the table it also names, and the model requires that it does.
  const payouts = resizePayouts(decoded ?? base.payouts, maxPossibleWins(structure));

  // Win rate is a probability; the rest are unbounded non-negative amounts.
  const numbers = Object.fromEntries(
    CONFIG_NUMBERS.map(([key, field]) => [
      field,
      numberFrom(params, key, base[field] as number, {
        max: field === "winRate" ? 1 : undefined,
      }),
    ]),
  ) as Pick<EventConfig, (typeof CONFIG_NUMBERS)[number][1]>;

  const prices = Object.fromEntries(
    CONFIG_PRICES.map(([key, field]) => [field, priceFrom(params, key, base[field])]),
  ) as Pick<EventConfig, (typeof CONFIG_PRICES)[number][1]>;

  const config: EventConfig = {
    ...base,
    ...numbers,
    ...prices,
    structure,
    payouts,
  };

  return {
    presetName,
    config,
    bankrollRuns: numberFrom(params, "runs", fallback.bankrollRuns, {
      min: 1,
      max: SIM_LIMITS.bankrollRuns,
      int: true,
    }),
    seed: numberFrom(params, "seed", fallback.seed, { int: true }),
    startingGems: numberFrom(params, "startGems", fallback.startingGems),
    startingGold: numberFrom(params, "startGold", fallback.startingGold),
    startingPlayInPoints: numberFrom(
      params,
      "startPoints",
      fallback.startingPlayInPoints,
    ),
    maxEvents: numberFrom(params, "maxEvents", fallback.maxEvents, {
      min: 1,
      max: SIM_LIMITS.maxEvents,
      int: true,
    }),
    /*
     * The allow-list is a runtime one, and TypeScript will not check it against
     * `Tab`: `oneOf<T>` takes `readonly T[]`, which a subset satisfies. A tab
     * missing from here compiles cleanly and silently falls back to Bankroll,
     * so the list and the union have to be kept in step by hand.
     */
    tab: oneOf<Tab>(
      params,
      "tab",
      ["bankroll", "event", "mastery", "about", "compare"],
      fallback.tab,
    ),
    /*
     * Checked against the tracks that exist rather than taken as written, so a
     * link naming a season this build does not carry falls back to the current
     * one instead of pricing nothing.
     */
    masterySlug:
      masteryBySlug(params.get("mastery") ?? "")?.slug ?? fallback.masterySlug,
    /*
     * `=== null` and not `??`, deliberately: a bare `compare=` is the empty
     * selection and must survive as one, and it is falsy. See the note in the
     * encoder.
     *
     * Unknown slugs drop rather than throw, so a link written by a build
     * carrying an event this one does not still opens — with the events it
     * does know, which is the same degradation an unknown parameter gets.
     */
    compareSelection: (() => {
      const raw = params.get("compare");
      if (raw === null) return fallback.compareSelection;
      return normalizeCompare(
        raw.split("_").map(presetBySlug).filter((name): name is string => name !== null),
      );
    })(),
    unit: oneOf<Unit>(params, "unit", ["gems", "usd"], fallback.unit),
    gemsPerUsd: numberFrom(params, "gemsPerUsd", fallback.gemsPerUsd, { min: 1 }),
  };
}

function decodeStructure(params: URLSearchParams, base: EventStructure): EventStructure {
  if (params.has("rounds")) {
    return { kind: "rounds", rounds: numberFrom(params, "rounds", 3, { min: 1, max: 50, int: true }) };
  }
  if (params.has("maxWins") || params.has("maxLosses")) {
    const from = base.kind === "elimination" ? base : { maxWins: 7, maxLosses: 3 };
    return {
      kind: "elimination",
      maxWins: numberFrom(params, "maxWins", from.maxWins, { min: 1, max: 50, int: true }),
      maxLosses: numberFrom(params, "maxLosses", from.maxLosses, { min: 1, max: 50, int: true }),
    };
  }
  return base;
}
