/**
 * Domain types for an MTG Arena limited event, and for the Set Mastery track
 * that runs alongside one.
 *
 * Two event shapes are supported:
 *
 *  - `elimination` — keep playing until `maxWins` wins or `maxLosses` losses,
 *    whichever lands first (Premier, Quick, Cube, Pick Two).
 *  - `rounds` — play a fixed number of rounds regardless of record, with no
 *    early exit (Traditional Draft).
 *
 * The mastery types at the foot are a season rather than an event: indexed by
 * level, not by win count, and bought once rather than entered repeatedly. They
 * live here for the same reason `EventPreset` does — the data modules import the
 * type and the model imports the data, so a third home would be a cycle.
 */

/** The two booster-box kinds an event has ever paid. */
export type BoxKind = "play" | "collector";

/**
 * One physical booster box a payout row pays.
 *
 * `set` is a Scryfall set code, or `LATEST_SET` for "whatever the newest
 * released expansion is when this is read" — the standing arrangement for
 * Arena Direct, which pays boxes of the set it is run alongside. Absent means
 * a *generic* box of its kind, priced at the config's average rather than at
 * any one set's market.
 *
 * A box per entry rather than `{ set, count }`: a row pays one or two, and the
 * two are not always the same product — the August 2026 Powered Cube paid a
 * Spider-Man box at six wins and a Spider-Man *and* a Marvel Super Heroes box
 * at seven.
 */
export type PayoutBox = { kind: BoxKind; set?: string };

export type PayoutTier = {
  /** Number of match wins this tier pays out for. */
  wins: number;
  gems: number;
  packs: number;
  /**
   * Play-in points toward an Arena Open. Only the traditional events award
   * them, so this is optional and absent means none.
   */
  playInPoints?: number;
  /**
   * Physical booster boxes, shipped after the event. Arena Direct only, so
   * this is optional and absent means none.
   */
  boxes?: PayoutBox[];
};

/** What one set's boxes are worth, in gems, by kind. */
export type BoxPriceSet = {
  code: string;
  name: string;
  releasedAt: string;
  /** Absent for a kind this set was not sold in, or has no market price for. */
  boxes: Partial<Record<BoxKind, number>>;
};

/**
 * What the live feed says each set's boxes are worth today.
 *
 * Carried on the config rather than fetched where it is needed, because every
 * function that prices a payout already takes a config — and because the
 * worker's cache key is the config, so a price change invalidates a cached
 * simulation without anyone maintaining a list. It is never written to a share
 * link: a link names a *product*, and the feed prices it on the day it is
 * opened.
 *
 * The empty table is the honest state, not a broken one. Previews, dev without
 * the proxy and outages all land there, and every box then prices at its
 * kind's generic average — exactly what the app did before the feed existed.
 */
export type BoxPriceTable = {
  /** Priced sets, newest first. */
  sets: BoxPriceSet[];
  /** Which set `LATEST_SET` means, per kind; absent when nothing qualifies. */
  latest: Partial<Record<BoxKind, string>>;
  /** When the feed was built, or null for the empty table. */
  generatedAt: string | null;
};

/** Play until a win or loss threshold is hit. */
export type EliminationStructure = {
  kind: "elimination";
  maxWins: number;
  maxLosses: number;
};

/** Play a fixed number of rounds; record never ends the event early. */
export type RoundsStructure = {
  kind: "rounds";
  rounds: number;
};

export type EventStructure = EliminationStructure | RoundsStructure;

/** A named event definition, as stored in src/data/presets. */
export type EventPreset = {
  name: string;
  entryCostGems: number;
  /** Gold price, where the event takes gold. Absent means gems only. */
  entryCostGold?: number;
  /**
   * Packs' worth of cards you keep from the pool you played with. Zero for
   * phantom events, where the cards are borrowed for the event only.
   */
  draftPacks?: number;
  structure: EventStructure;
  payouts: PayoutTier[];
};

export type EventConfig = {
  /**
   * How many matches the win rate above is based on, or 0 for "certain".
   *
   * The rate is a guess, and this says how much of a guess. It is read as a
   * record — this many matches played at that rate — which is what lets one
   * number carry the uncertainty without asking for a second. Zero switches the
   * intervals off and returns every figure to a point estimate.
   */
  winRateMatches: number;

  /** Probability of winning one match, 0..1. A round is a match in every event. */
  winRate: number;
  structure: EventStructure;
  /** Entry cost in gems. */
  entryCostGems: number;
  /** Gold price, or 0 where the event takes gems only. */
  entryCostGold: number;
  /**
   * Gold earned in a day from everything *except* this event's own wins —
   * quests, and games played outside it.
   *
   * A daily quest by default, so this is the day's *budget* toward entries
   * rather than what the entry itself earned back. Set it to 0 for the
   * stricter reading, where an event is credited only the gold its own wins
   * generate.
   *
   * Divided across `eventsPerDay`, since it does not repeat per event.
   */
  otherGoldPerDay: number;
  /**
   * Events played per day.
   *
   * Sets how far the day's wins get through the daily-win ladder before it
   * caps at fifteen, so playing more earns more in total but less per event.
   * Zero credits no gold at all, which is how you price an event in gems
   * alone.
   */
  eventsPerDay: number;
  /** Gems 10,000 gold is worth, for valuing a leftover balance; 0 counts unspent gold as worthless. */
  gemsPer10kGold: number;
  /** Packs' worth of cards kept per entry; 0 for phantom events. */
  draftPacks: number;
  /** Gem value of one pack's worth of drafted cards. */
  draftPackValueGems: number;
  /** Gem value assigned to one booster pack (0 = packs counted but valued at nothing). */
  packValueGems: number;
  /** Gem value assigned to one play-in point. */
  playInPointValueGems: number;
  /**
   * Gem value of a *generic* Play Booster box — one that names no set.
   *
   * Two jobs. It prices the boxes a custom ladder pays, which name nothing;
   * and it is what a named box falls back to when the feed cannot price it,
   * so a missing feed is never worse than having no feed at all.
   *
   * Zero means boxes are worth nothing, and it says so for *every* box
   * including named ones — the same reading `gemsPer10kGold: 0` has for
   * leftover gold. Without that, "zero these out" would leave an Arena Direct
   * still paying for its boxes at market.
   */
  playBoxValueGems: number;
  /** Gem value of a generic Collector Booster box; see `playBoxValueGems`. */
  collectorBoxValueGems: number;
  /**
   * What each set's boxes trade for, from the live feed.
   *
   * Empty until the fetch lands, and empty for good on previews and in dev
   * without the proxy — every box then prices at the generic rate above.
   */
  boxPrices: BoxPriceTable;
  /**
   * Gem value of one Player Draft token — a free Premier Draft entry.
   *
   * Only the Mastery Pass pays these; no event ladder does. Kept on the config
   * with the other rates so it is editable in the same place as the rest.
   */
  draftTokenValueGems: number;
  /** Gem value of one mythic rare individual card reward. */
  mythicIcrValueGems: number;
  /**
   * Gem value of one rare card award.
   *
   * Named a card rather than an ICR because that is what it is: the only track
   * row paying these is level 6's four copies of Gandalf, Party Guest, a card
   * Wizards names. An ICR is a random card of a rarity, so calling this one
   * would claim the pass pays something it does not. The sibling fields are
   * ICRs and say so.
   */
  rareCardValueGems: number;
  /** Gem value of one uncommon individual card reward. */
  uncommonIcrValueGems: number;
  /**
   * Gem value of one Mastery Orb, and of each cosmetic kind below.
   *
   * All default to zero, and they are separate fields rather than one because a
   * single "cosmetics" rate would hide what is being zeroed. Someone who thinks
   * a sleeve is worth something can say so without also repricing orbs.
   */
  orbValueGems: number;
  cardStyleValueGems: number;
  sleeveValueGems: number;
  avatarValueGems: number;
  companionValueGems: number;
  /** Payout table, one entry per possible win count (0..maxPossibleWins). */
  payouts: PayoutTier[];
};

export type WinBucket = {
  wins: number;
  count: number;
  /** Empirical frequency from the simulation. */
  probability: number;
  /** Closed-form probability, for comparison. */
  exactProbability: number;
  grossGems: number;
  netGems: number;
  packs: number;
  playInPoints: number;
  /**
   * Boxes paid at this win count, all products together.
   *
   * A total rather than a count per product, because what a bucket is asked is
   * how often a box turns up at all — the breakdown that cares *which* box
   * prices them one at a time, off the ladder rather than off a bucket.
   */
  boxes: number;
};

/**
 * A finishing record — the wins and losses an event ended on.
 *
 * Win count alone does not name a finish in an elimination event. Anything
 * short of the ceiling ended by being eliminated, so it carries exactly
 * `maxLosses` losses and the record follows from the wins; but a run that
 * reaches the ceiling stopped on its last *win*, with anything up to
 * `maxLosses - 1` losses behind it. That is why 7-0, 7-1 and 7-2 are three
 * records and one win count, and why only the top of the ladder splits.
 *
 * A `rounds` event never splits: every round is played, so losses are always
 * `rounds - wins`.
 */
export type OutcomeRecord = {
  wins: number;
  losses: number;
};

/** A closed-form probability attached to the record it belongs to. */
export type RecordProbability = OutcomeRecord & { probability: number };

/** One finishing record, and how often the simulation landed on it. */
export type RecordBucket = OutcomeRecord & {
  count: number;
  /** Empirical frequency from the simulation. */
  probability: number;
  /** Closed-form probability, for comparison. */
  exactProbability: number;
};

export type SimResult = {
  trials: number;
  buckets: WinBucket[];
  /**
   * The same events split by record rather than by win count, ordered by wins
   * ascending and then losses ascending.
   *
   * Payouts read off the win count alone, so this carries no money — it exists
   * because "7 wins" hides how the run got there, and the chart says so. Group
   * it by wins and it collapses back to `buckets`.
   */
  records: RecordBucket[];
  /** Mean net gems per event (simulated). */
  meanNet: number;
  /** Mean net gems per event (closed form). */
  exactMeanNet: number;
  meanGross: number;
  meanPacks: number;
  /** Mean boxes per event, both kinds together; a double-box finish counts as two. */
  meanBoxes: number;
  /** Mean rounds (matches) played per event. */
  meanRounds: number;
  /** Standard deviation of net gems across events. */
  stdDevNet: number;
  /** Standard error of meanNet. */
  stdErrNet: number;
  /** Fraction of events with a positive net result. */
  probProfit: number;
  /** Mean net / entry cost. */
  roi: number;
  /** Total net gems across all simulated events. */
  totalNet: number;
  /** Share of entries the simulated gold balance covered. */
  goldEntryFraction: number;
  /** Mean gems actually paid to enter, after gold-funded entries. */
  meanEntryGems: number;
  percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
};

/**
 * Everything a Set Mastery track can pay.
 *
 * A superset of what an event pays, because the pass hands out things no ladder
 * does — card rewards, an event token, and a great deal of cosmetics. The
 * cosmetic kinds are listed separately even though all four price at zero by
 * default: one `cosmetics` kind would fold thirty orbs and fifteen card styles
 * into a single silent row, and it is seeing them counted that makes the zero
 * an admission rather than an omission.
 */
export const MASTERY_REWARD_KINDS = [
  "gems",
  "gold",
  "packs",
  "draftToken",
  "mythicIcr",
  "rareCard",
  "uncommonIcr",
  "orbs",
  "cardStyles",
  "sleeves",
  "avatars",
  "companions",
] as const;

export type MasteryRewardKind = (typeof MASTERY_REWARD_KINDS)[number];

/**
 * What one cell pays, by kind. An absent kind is none of it.
 *
 * A record rather than a list of `{ kind, count }` pairs because the track is
 * hand-maintained: `{ cardStyles: 1, orbs: 1 }` is a row somebody can check
 * against Wizards' page at a glance, and the pair form of the same thing is
 * three times as long across forty-five rows.
 */
export type MasteryRewards = Partial<Record<MasteryRewardKind, number>>;

/** One column's cell at one level: what Wizards printed, and what it is worth. */
export type MasteryColumn = {
  /**
   * The cell's text, verbatim from Wizards' table.
   *
   * Kept beside the parsed rewards for two reasons. It is what the reward table
   * shows, so a reader sees "Bilbo Baggins, Burglar Card Style, Orb" rather than
   * a lossy re-rendering of the counts; and it is the provenance, so the whole
   * track can be diffed against the page when the set turns over. A non-empty
   * `text` with empty `rewards` is a row somebody copied and forgot to parse,
   * which is a test rather than a comment.
   */
  text: string;
  rewards: MasteryRewards;
};

export type MasteryLevel = {
  level: number;
  free: MasteryColumn;
  pass: MasteryColumn;
};

/** A season's Set Mastery, as stored in src/data/mastery. */
export type MasteryTrack = {
  /** What the picker calls it — the set, not the full product name. */
  name: string;
  /**
   * The token that names this track in a URL.
   *
   * Written out rather than derived from `name`, so rewording the label cannot
   * silently retarget every link that already names this season. Once shipped it
   * is fixed; a season is not renamed, it is superseded.
   */
  slug: string;
  /**
   * What this pass was sold for.
   *
   * On the track rather than as a global constant: the price is a property of a
   * particular season, and it has moved before.
   */
  priceGems: number;
  /** Last level the free track pays at. */
  freeCap: number;
  /** Last level the pass track pays a listed reward at. */
  passCap: number;
  levels: MasteryLevel[];
  /** What each level past `passCap` pays, repeating without end. */
  beyond: MasteryRewards;
};
