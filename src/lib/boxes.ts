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

/** How many boxes of one kind a tier pays. */
export function boxCount(tier: PayoutTier, kind: BoxKind): number {
  return tier.boxes?.reduce((acc, b) => acc + (b.kind === kind ? 1 : 0), 0) ?? 0;
}

/** Gems a tier's boxes of one kind come to, each priced against its own set. */
export function tierBoxGems(
  config: EventConfig,
  tier: PayoutTier,
  kind: BoxKind,
): number {
  return (
    tier.boxes?.reduce(
      (acc, b) => (b.kind === kind ? acc + boxValueGems(config, b) : acc),
      0,
    ) ?? 0
  );
}

/** What a ladder's boxes come to at each win count, counted and priced. */
export type TierBoxes = {
  playBoxes: number;
  collectorBoxes: number;
  playBoxGems: number;
  collectorBoxGems: number;
};

const NO_BOXES: TierBoxes = {
  playBoxes: 0,
  collectorBoxes: 0,
  playBoxGems: 0,
  collectorBoxGems: 0,
};

/**
 * The ladder's boxes priced once, indexed by win count.
 *
 * The bankroll simulation prices boxes inside a loop that runs once per event
 * across a million runs, and pricing a box means a lookup by set code. Doing
 * that per event would be a table scan in the hottest loop in the app for an
 * answer that cannot change during a run.
 */
export function priceTiers(config: EventConfig): TierBoxes[] {
  const out: TierBoxes[] = [];
  for (const tier of config.payouts) {
    out[tier.wins] = tier.boxes?.length
      ? {
          playBoxes: boxCount(tier, "play"),
          collectorBoxes: boxCount(tier, "collector"),
          playBoxGems: tierBoxGems(config, tier, "play"),
          collectorBoxGems: tierBoxGems(config, tier, "collector"),
        }
      : NO_BOXES;
  }
  return out;
}

/** Boxes at a win count, for a table `priceTiers` built from the same config. */
export const tierBoxesAt = (priced: readonly TierBoxes[], wins: number): TierBoxes =>
  priced[wins] ?? NO_BOXES;

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
