/**
 * What a payout row's physical boxes are, and what each is worth.
 *
 * A payout row names its boxes — "a Marvel Super Heroes Play Booster box" —
 * rather than counting anonymous ones, and each is priced against that set's
 * own market price from the live feed. Two boxes on one row can be different
 * products, which is why the ladder carries a list rather than a count per
 * kind, and why nothing here can be expressed as "count × one rate".
 *
 * Three ways a box gets a price, in order:
 *
 *  - the generic rate is zero, and then so is the box, whatever it names —
 *    valuing boxes at nothing is a thing people do, and it has to mean it;
 *  - the feed knows the set, and the box is worth what that box trades at;
 *  - otherwise the generic rate for its kind, which is the average the app
 *    used before it could name a set at all.
 *
 * So the feed makes prices sharper and its absence makes them blunter, and
 * neither makes the app worse than the constants alone.
 */

import type {
  BoxKind,
  BoxPriceTable,
  EventConfig,
  PayoutBox,
  PayoutTier,
} from "./types";

export const BOX_KINDS = ["play", "collector"] as const satisfies readonly BoxKind[];

/**
 * The set code standing for "whatever is newest when this is read".
 *
 * Arena Direct pays boxes of the set it runs alongside, so its presets name
 * the arrangement rather than a set — a preset naming last quarter's set would
 * be wrong within the quarter, and a link carrying it would age the same way.
 * A real set code can never collide: Scryfall's are three or four characters.
 */
export const LATEST_SET = "latest";

/** No feed: every box prices at its kind's generic rate. */
export const EMPTY_BOX_PRICES: BoxPriceTable = {
  sets: [],
  latest: {},
  generatedAt: null,
};

/** The config field holding a kind's generic rate. */
const GENERIC_RATE = {
  play: "playBoxValueGems",
  collector: "collectorBoxValueGems",
} as const satisfies Record<BoxKind, keyof EventConfig>;

/** What a generic box of this kind is worth. */
export function genericBoxValueGems(config: EventConfig, kind: BoxKind): number {
  return config[GENERIC_RATE[kind]];
}

/** Which set a box names, with `LATEST_SET` resolved; null when it names none. */
export function boxSetCode(table: BoxPriceTable, box: PayoutBox): string | null {
  if (box.set === undefined) return null;
  if (box.set === LATEST_SET) return table.latest[box.kind] ?? null;
  return box.set;
}

/** The feed's row for a set, or undefined when it has none. */
export const boxPriceSet = (table: BoxPriceTable, code: string) =>
  table.sets.find((s) => s.code === code);

/**
 * Gems one box is worth.
 *
 * The zero check comes first deliberately: a generic rate of zero means boxes
 * are worth nothing, and a named box is still a box.
 */
export function boxValueGems(config: EventConfig, box: PayoutBox): number {
  const generic = genericBoxValueGems(config, box.kind);
  if (generic === 0) return 0;
  const code = boxSetCode(config.boxPrices, box);
  if (code === null) return generic;
  return boxPriceSet(config.boxPrices, code)?.boxes[box.kind] ?? generic;
}

/** A box's identity, which is its kind and the set it names. */
export const boxId = (box: PayoutBox): string => `${box.kind}.${box.set ?? ""}`;

/**
 * How a box names itself among the things a run can hold.
 *
 * Prefixed, because the other holdings are a fixed list and these are not:
 * which boxes exist depends on the ladder, so a key has to carry the box
 * rather than be one of a handful the code knows. The prefix is what lets
 * anything walking a holding key tell the two apart.
 */
export const BOX_HOLDING = "box:";

export const boxHoldingKey = (box: PayoutBox): string => `${BOX_HOLDING}${boxId(box)}`;

export const isBoxHolding = (key: string): boolean => key.startsWith(BOX_HOLDING);

/**
 * Every distinct box a ladder pays, in the order they first appear.
 *
 * The results report boxes one product at a time — "0.05 Marvel Super Heroes
 * Play boxes" rather than "0.21 play boxes" — because that is what a run comes
 * away holding, and because two play boxes of different sets are worth
 * different amounts. This list is the set of things there are to report, and
 * the order everything downstream indexes by.
 */
export function ladderBoxes(payouts: readonly PayoutTier[]): PayoutBox[] {
  const seen = new Set<string>();
  const out: PayoutBox[] = [];
  for (const tier of payouts) {
    for (const box of tier.boxes ?? []) {
      const id = boxId(box);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(box);
    }
  }
  return out;
}

/**
 * A ladder's boxes, counted and priced once.
 *
 * `products` is the ladder's distinct boxes; `prices` is what each is worth;
 * `counts[wins]` is how many of each that win count pays, indexed the same
 * way. Everything downstream carries the counts array and nothing else, so a
 * run's boxes are as cheap to tally as a number.
 *
 * Built once per simulation because the bankroll loop runs once per event
 * across a million runs, and pricing a box means a lookup by set code — a
 * table scan in the hottest loop in the app, for an answer that cannot change
 * during a run.
 */
export type LadderBoxes = {
  products: PayoutBox[];
  prices: number[];
  counts: number[][];
};

const NONE: number[] = [];

export function priceTiers(config: EventConfig): LadderBoxes {
  const products = ladderBoxes(config.payouts);
  const prices = products.map((box) => boxValueGems(config, box));
  const index = new Map(products.map((box, i) => [boxId(box), i]));

  const counts: number[][] = [];
  for (const tier of config.payouts) {
    if (!tier.boxes?.length) {
      counts[tier.wins] = NONE;
      continue;
    }
    const row = new Array<number>(products.length).fill(0);
    for (const box of tier.boxes) row[index.get(boxId(box)) as number]++;
    counts[tier.wins] = row;
  }
  return { products, prices, counts };
}

/** How many of each box a win count pays; empty where it pays none. */
export const tierBoxesAt = (priced: LadderBoxes, wins: number): number[] =>
  priced.counts[wins] ?? NONE;

/** Gems a win count's boxes come to. */
export function tierBoxGems(priced: LadderBoxes, wins: number): number {
  const counts = tierBoxesAt(priced, wins);
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += counts[i] * priced.prices[i];
  return total;
}

const KIND_LABEL = { play: "Play", collector: "Collector" } as const;

/**
 * What to call a box on screen: "MSH Play", "Play".
 *
 * Set codes rather than set names, because these sit in a payout row's cell
 * beside three number fields — "Marvel's Spider-Man Play Booster box" is the
 * name of the product and would be the widest thing on the page.
 *
 * `LATEST_SET` is resolved rather than named. It is how a preset stays correct
 * as sets turn over, which is a fact about the data and not something a reader
 * has to hold: what they want to know is which box this row ships, and today
 * that is a particular set. Unresolved — no feed — there is no set to name and
 * this reads as the bare kind, which is also what it prices as.
 */
export function boxLabel(table: BoxPriceTable, box: PayoutBox): string {
  const kind = KIND_LABEL[box.kind];
  const code = boxSetCode(table, box);
  return code === null ? kind : `${code.toUpperCase()} ${kind}`;
}

/**
 * The same box as a chip: "MSH", "HOB", "Any".
 *
 * For the payout row, where a box sits inline beside three number fields and
 * has a column an inch wide to do it in. A set that cannot be named — no feed,
 * or a box that names no set — reads "Any", which is both what it is and what
 * it prices as.
 *
 * The kind is not in the text. A collector chip is drawn as foil instead,
 * which is what the product itself looks like and reads at a glance where
 * a `:C` has to be decoded. The full name is on the chip's title and its
 * accessible name, so nothing depends on seeing the shimmer.
 */
export function boxChip(table: BoxPriceTable, box: PayoutBox): string {
  const code = boxSetCode(table, box);
  return code === null ? "Any" : code.toUpperCase();
}

/**
 * The box named in full: "The Hobbit Play Booster box".
 *
 * What a chip is short for, and what a reader gets on hover or through a
 * screen reader — so the code and the foil are an abbreviation of something
 * spelled out rather than the only statement of it.
 *
 * The set's name comes from the feed, which is the only place it exists; a set
 * the feed cannot name falls back to its code, and a box naming no set says
 * so, since "any Play Booster box" is exactly what it prices as.
 */
export function boxFullName(table: BoxPriceTable, box: PayoutBox): string {
  const kind = KIND_LABEL[box.kind];
  const code = boxSetCode(table, box);
  if (code === null) return `${kind} Booster box, any set`;
  const name = boxPriceSet(table, code)?.name ?? code.toUpperCase();
  return `${name} ${kind} Booster box`;
}
