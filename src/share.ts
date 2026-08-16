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
 * hand, for the same reason the closed-form column sits beside the simulated
 * one: a number you cannot check is a number you have to trust.
 */

import type { Unit } from "./format";
import {
  CURRENT_MASTERY_TRACK,
  CUSTOM_PRESET,
  PRESETS,
  masteryBySlug,
  configFromPreset,
  defaultConfig,
  maxPossibleWins,
  resizePayouts,
  type EventConfig,
  type EventStructure,
  type PayoutTier,
} from "./lib";

export type Tab = "bankroll" | "event" | "mastery" | "about";

/** Everything a link restores. */
export type ShareState = {
  presetName: string;
  config: EventConfig;
  trials: number;
  /**
   * Bankroll runs, which are counted separately from `trials` because they
   * cost far more: one is a whole sequence of events rather than a single one.
   */
  bankrollRuns: number;
  seed: number;
  startingGems: number;
  startingGold: number;
  maxEvents: number;
  tab: Tab;
  /**
   * Which Set Mastery season the Mastery tab prices, by its stable slug.
   *
   * A slug rather than a name because it is the thing that has to survive a
   * relabelling, and it is what the URL carries either way.
   */
  masterySlug: string;
  unit: Unit;
  gemsPerUsd: number;
};

/**
 * The state a fresh load starts in. App.tsx seeds its `useState` calls from
 * this rather than repeating the literals, because a default that disagrees
 * with this module would be silently written into every link.
 */
/**
 * Starting gems, counted in entries to the event the app opens on.
 *
 * Two rather than a round number of gems, because what decides whether the
 * Bankroll tab says anything is how many times you can play, not the balance
 * itself. One entry busts at the first bad event and the histogram collapses
 * to a single bar; two is the smallest balance that can survive one.
 *
 * The coupling runs the other way too, and is the cost of deriving it:
 * repricing the opening preset now moves this figure, and with it every saved
 * link that did not spell out `startGems`. `share.compat.test.ts` is what makes
 * that audible.
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
 * the page was allowed to freeze. Simulations run in workers now, cancelled
 * within about ten milliseconds by a superseding edit, so nothing here blocks
 * paint and the question is only how long someone is willing to wait for a
 * number that keeps getting better.
 *
 * Measured at roughly 56–66 ns per trial, which puts `trials` at its ceiling
 * near six seconds for a standard error under half what five million gave —
 * cheap, and the result stays a few kB whatever the count. `bankrollRuns`
 * costs in proportion to *events played*, so it multiplies with `maxEvents`,
 * and the two maxed together is a wait of minutes. That corner is left
 * reachable rather than designed away: capping the product instead would say
 * what actually costs time, but it is a different shape of control than a
 * number in a box, and this change is only the ceilings.
 *
 * Memory is not what bounds any of these. A `BankrollResult` is summary
 * statistics plus a fixed hundred recorded runs, so its size tracks
 * `maxEvents` and not the run count at all.
 */
export const SIM_LIMITS = {
  trials: 25_000_000,
  bankrollRuns: 1_000_000,
  maxEvents: 2_000,
} as const;

export function defaultShareState(): ShareState {
  // The event the app opens on, which the starting balance is priced against.
  const opening = PRESETS[0];
  return {
    presetName: opening.name,
    config: defaultConfig(),
    trials: 100_000,
    bankrollRuns: 10_000,
    seed: 1,
    startingGems: STARTING_ENTRIES * opening.entryCostGems,
    startingGold: 0,
    maxEvents: 20,
    tab: "bankroll",
    masterySlug: CURRENT_MASTERY_TRACK.slug,
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
      draftPacks: state.config.draftPacks,
      payouts: state.config.payouts,
    },
    // The Bankroll card's.
    startingGems: state.startingGems,
    startingGold: state.startingGold,
    maxEvents: state.maxEvents,
    // Where the page is pointed, which is not a setting to restore.
    tab: state.tab,
    masterySlug: state.masterySlug,
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

const presetBySlug = (slug: string): string | null => {
  if (slug === presetSlug(CUSTOM_PRESET)) return CUSTOM_PRESET;
  return PRESETS.find((p) => presetSlug(p.name) === slug)?.name ?? null;
};

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
  ["entry", "entryCostGems"],
  ["entryGold", "entryCostGold"],
  ["draftPacks", "draftPacks"],
  ["draftPackValue", "draftPackValueGems"],
  ["packValue", "packValueGems"],
  ["playInValue", "playInPointValueGems"],
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
  // 0 means unspent gold counts for nothing.
  ["goldPer10k", "gemsPer10kGold"],
  // 0 means "certain", which is how a URL spells the absence of uncertainty —
  // the same trick `goldPer10k` uses for gold that is worth nothing.
  ["confMatches", "winRateMatches"],
] as const satisfies readonly (readonly [string, keyof EventConfig])[];

/**
 * Bankroll and display fields, which sit outside the config.
 *
 * `spendWinnings` was one of these and is retired: it let packs, points and
 * boxes fund further entries, which nothing in Arena does. A link still
 * carrying it decodes to a run that holds its winnings instead of spending
 * them, and that is the intended reading rather than an oversight. The name
 * must not be given a new meaning — an old link would then say something its
 * author never chose.
 */
const UI_NUMBERS = [
  ["startGems", "startingGems"],
  ["startGold", "startingGold"],
  ["maxEvents", "maxEvents"],
  ["gemsPerUsd", "gemsPerUsd"],
  ["trials", "trials"],
  ["runs", "bankrollRuns"],
  ["seed", "seed"],
] as const satisfies readonly (readonly [string, keyof ShareState])[];

/**
 * A payout table as `gems-packs[-points[-playBoxes[-collectorBoxes]]]` per row,
 * rows in win order joined by `_`. The win count is the row's position, so it
 * is not repeated.
 *
 * `-` and `_` are used because form encoding leaves them alone: a separator of
 * `,` or `:` would come back as `%2C` or `%3A` and cost the table its
 * readability. No field can be negative, so `-` is unambiguous.
 */
export function encodePayouts(payouts: PayoutTier[]): string {
  return payouts
    .map((t) => {
      const fields = [
        t.gems,
        t.packs,
        t.playInPoints ?? 0,
        t.playBoxes ?? 0,
        t.collectorBoxes ?? 0,
      ];
      while (fields.length > 2 && fields[fields.length - 1] === 0) fields.pop();
      return fields.map(num).join("-");
    })
    .join("_");
}

/** Inverse of `encodePayouts`. Null on anything malformed, never a partial table. */
export function decodePayouts(raw: string): PayoutTier[] | null {
  const rows = raw.split("_");
  const out: PayoutTier[] = [];
  for (const [wins, row] of rows.entries()) {
    const parts = row.split("-");
    if (parts.length < 2 || parts.length > 5) return null;
    /*
     * Matched rather than handed to `Number`, which is far too willing: it
     * reads "" as 0, so `50--1` would parse as a well-formed 50/0/1 row
     * instead of the malformed thing it is, and it also takes "0x10" and
     * " 7 ". Only what `encodePayouts` writes is accepted back.
     */
    if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return null;
    const fields = parts.map(Number);
    if (fields.some((n) => !Number.isFinite(n))) return null;
    const [gems, packs, playInPoints = 0, playBoxes = 0, collectorBoxes = 0] = fields;
    const tier: PayoutTier = { wins, gems, packs };
    // Left off entirely when zero, matching how the presets are written.
    if (playInPoints) tier.playInPoints = playInPoints;
    if (playBoxes) tier.playBoxes = playBoxes;
    if (collectorBoxes) tier.collectorBoxes = collectorBoxes;
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

  const config: EventConfig = {
    ...base,
    ...numbers,
    structure,
    payouts,
  };

  return {
    presetName,
    config,
    trials: numberFrom(params, "trials", fallback.trials, {
      min: 1,
      max: SIM_LIMITS.trials,
      int: true,
    }),
    bankrollRuns: numberFrom(params, "runs", fallback.bankrollRuns, {
      min: 1,
      max: SIM_LIMITS.bankrollRuns,
      int: true,
    }),
    seed: numberFrom(params, "seed", fallback.seed, { int: true }),
    startingGems: numberFrom(params, "startGems", fallback.startingGems),
    startingGold: numberFrom(params, "startGold", fallback.startingGold),
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
    tab: oneOf<Tab>(params, "tab", ["bankroll", "event", "mastery", "about"], fallback.tab),
    /*
     * Checked against the tracks that exist rather than taken as written, so a
     * link naming a season this build does not carry falls back to the current
     * one instead of pricing nothing.
     */
    masterySlug:
      masteryBySlug(params.get("mastery") ?? "")?.slug ?? fallback.masterySlug,
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
