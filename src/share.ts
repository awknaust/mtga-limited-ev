/**
 * `ShareState` as a query string, so a configuration can be linked.
 *
 * The codec and nothing else. What the state *is* and what it starts at are
 * `state.ts`, which this imports to measure against — a delta encoder needs a
 * baseline, and having it here as well is how the two silently disagree.
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
  CUSTOM_PRESET,
  PRESETS,
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
import {
  SIM_LIMITS,
  defaultShareState,
  normalizeCompare,
  resetAdvanced,
  type ShareState,
  type Tab,
} from "./state";

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
