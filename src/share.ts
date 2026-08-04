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
  CUSTOM_PRESET,
  PRESETS,
  configFromPreset,
  defaultConfig,
  maxPossibleWins,
  resizePayouts,
  type EventConfig,
  type EventFormat,
  type EventStructure,
  type PayoutTier,
} from "./lib";

export type Tab = "bankroll" | "event" | "about";

/** Everything a link restores. */
export type ShareState = {
  presetName: string;
  config: EventConfig;
  trials: number;
  seed: number;
  startingGems: number;
  startingGold: number;
  maxEvents: number;
  spendWinnings: boolean;
  tab: Tab;
  unit: Unit;
  gemsPerUsd: number;
};

/**
 * The state a fresh load starts in. App.tsx seeds its `useState` calls from
 * this rather than repeating the literals, because a default that disagrees
 * with this module would be silently written into every link.
 */
export function defaultShareState(): ShareState {
  return {
    presetName: PRESETS[0].name,
    config: defaultConfig(),
    trials: 100_000,
    seed: 1,
    // The Mastery Pass price, which is the balance most players are deciding
    // how to spend.
    startingGems: 3400,
    startingGold: 0,
    maxEvents: 20,
    spendWinnings: false,
    tab: "bankroll",
    unit: "gems",
    gemsPerUsd: 400,
  };
}

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
 * Best-of-three win rates come off a bisection, so the stored per-game rate is
 * a full-precision double that would otherwise spell out seventeen digits. Six
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
  ["goldPerDay", "goldPerDay"],
  ["eventsPerDay", "eventsPerDay"],
] as const satisfies readonly (readonly [string, keyof EventConfig])[];

/** Bankroll and display fields, which sit outside the config. */
const UI_NUMBERS = [
  ["startGems", "startingGems"],
  ["startGold", "startingGold"],
  ["maxEvents", "maxEvents"],
  ["gemsPerUsd", "gemsPerUsd"],
  ["trials", "trials"],
  ["seed", "seed"],
] as const satisfies readonly (readonly [string, keyof ShareState])[];

/**
 * Gold's exchange rate is written the way the field reads it — gems per 10,000
 * gold — rather than as the `goldPerGem` the model stores. Counting unspent
 * gold as worthless is an infinite `goldPerGem`, which has no useful spelling
 * in a URL; as a rate it is plainly 0.
 */
const gemsPer10kGold = (goldPerGem: number): number =>
  Number.isFinite(goldPerGem) && goldPerGem > 0 ? Math.round(10000 / goldPerGem) : 0;

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

  if (state.config.format !== base.format) params.set("format", state.config.format);

  if (!sameStructure(state.config.structure, base.structure)) {
    encodeStructure(params, state.config.structure);
  }

  const payouts = encodePayouts(state.config.payouts);
  // Compared encoded rather than field by field: the two tables can differ in
  // length, and the string is the thing that has to round-trip anyway.
  if (payouts !== encodePayouts(resizePayouts(base.payouts, maxPossibleWins(state.config.structure)))) {
    params.set("payouts", payouts);
  }

  const rate = gemsPer10kGold(state.config.goldPerGem);
  if (rate !== gemsPer10kGold(base.goldPerGem)) params.set("goldPer10k", num(rate));

  for (const [key, field] of UI_NUMBERS) {
    const value = state[field] as number;
    if (value !== (fallback[field] as number)) params.set(key, num(value));
  }

  if (state.spendWinnings !== fallback.spendWinnings) params.set("spendWinnings", "1");
  if (state.tab !== fallback.tab) params.set("tab", state.tab);
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
    format: oneOf<EventFormat>(params, "format", ["bo1", "bo3"], base.format),
    goldPerGem: decodeGoldPerGem(params, base.goldPerGem),
  };

  return {
    presetName,
    config,
    trials: numberFrom(params, "trials", fallback.trials, { min: 1, max: 5_000_000, int: true }),
    seed: numberFrom(params, "seed", fallback.seed, { int: true }),
    startingGems: numberFrom(params, "startGems", fallback.startingGems),
    startingGold: numberFrom(params, "startGold", fallback.startingGold),
    maxEvents: numberFrom(params, "maxEvents", fallback.maxEvents, { min: 1, max: 2000, int: true }),
    spendWinnings: params.get("spendWinnings") === "1",
    tab: oneOf<Tab>(params, "tab", ["bankroll", "event", "about"], fallback.tab),
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

/** A rate of 0 means unspent gold counts for nothing, which the model spells ∞. */
function decodeGoldPerGem(params: URLSearchParams, base: number): number {
  if (!params.has("goldPer10k")) return base;
  const rate = numberFrom(params, "goldPer10k", gemsPer10kGold(base), { min: 0 });
  return rate > 0 ? 10000 / rate : Number.POSITIVE_INFINITY;
}
