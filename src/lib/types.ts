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
   * Mythic packs, whose rare slot is always a mythic rare. Only Contender
   * Draft's top two tiers pay them, so this is optional and absent means none.
   *
   * A field of its own rather than a count folded into `packs`, which is what
   * it was: the two are different products on different rates, and a count
   * that added them could be priced only by picking one of the two.
   */
  mythicPacks?: number;
  /**
   * Cube Prize Packs, which the cube drafts pay in place of ordinary packs
   * rather than alongside them — so a cube ladder's `packs` is zero and this
   * carries the whole count.
   *
   * Absent means none, and that is every event but the two cube drafts.
   */
  cubePacks?: number;
  /**
   * Play-in points toward a Qualifier Play-In entry — twenty of them buy one.
   * Only the traditional events award them, so this is optional and absent
   * means none.
   */
  playInPoints?: number;
  /**
   * Qualifier Weekend tokens. Only the Qualifier Play-Ins award them, at their
   * top win count and nowhere else, so this is optional and absent means none.
   *
   * Counted rather than summed into gems because there is no price to sum it
   * at: nothing sells one, and the only thing it converts to is a seat at a
   * tournament. `DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS` is 0 for that reason and
   * says why.
   *
   * Worth knowing when reading a mean of these: Wizards is explicit that "all
   * Qualifier Tokens earned beyond the first are redundant", so a run that won
   * two did not win twice. That is why the app reports a *chance* of one and
   * never an expected count.
   */
  qualifierTokens?: number;
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
 * There is always one: the app ships a copy of the feed and reads its table
 * from that, so previews, dev without the proxy and outages hold the build's
 * table rather than an empty one. The empty table still exists as the honest
 * state for a config with no feed at all, and every box then prices at its
 * kind's generic value — exactly what the app did before the feed existed.
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
/**
 * The kinds of event there are, in the order they are offered.
 *
 * A fact about the event rather than about any screen: Sealed is a sealed
 * event whether or not anything is grouping it. What each key is *called* is
 * presentation and lives with the component that shows it — this is the key
 * and the order, which is what has to be agreed on.
 *
 * The order is the one `PRESETS` already sits in, and the reasoning for it is
 * in the comments there.
 */
export const EVENT_GROUPS = [
  "draft",
  "sealed",
  "direct",
  "constructed",
  "play-in",
] as const;

export type EventGroup = (typeof EVENT_GROUPS)[number];

export type EventPreset = {
  name: string;
  /**
   * Which kind of event this is.
   *
   * Required, and that is the point: a new preset that names no group is a
   * compile error in the file being written, rather than a list somewhere else
   * that quietly stopped covering everything. It is why this is here and not
   * in the tab that groups by it.
   */
  group: EventGroup;
  /**
   * Gem price, where the event takes gems — which is every event here so far.
   *
   * Absent means the door does not open to gems at all, and that is the rule
   * for all three prices: an absent price is a currency the event does not
   * take, which is not the same as a price of nothing. `configFromPreset`
   * spells that absence `null`; the reasoning is on `EventConfig`.
   */
  entryCostGems?: number;
  /** Gold price, where the event takes gold. Absent means it does not. */
  entryCostGold?: number;
  /**
   * Play-in point price, where the event takes points. Absent means it does
   * not, which is every event but the Qualifier Play-Ins.
   */
  entryCostPlayInPoints?: number;
  /**
   * Whether a round is a single game or a best-of-three match.
   *
   * Required for the same reason `group` is: a preset that does not say is a
   * compile error in the file being written rather than a guess somewhere
   * else. Read once, in `configFromPreset`, where it becomes the config's
   * `gamesPerMatch` — how much of a day of games one round takes, and so how
   * many of these events a day holds.
   */
  bestOf: 1 | 3;
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
  /**
   * Gem price of one entry, or `null` where the event does not take gems.
   *
   * `null` is the door refusing a currency; a number is what it charges. Zero
   * is neither, and is not a value any of the three prices holds: an entry
   * that takes nothing is an entry not paid in gems, which is the absence.
   * Every way in normalises it that way — a preset's absent field, a cleared
   * editor field, an old link's `0` — so there is one spelling for "no" and
   * the model never has to work out which zero it is looking at.
   *
   * An event naming no price at all is free rather than unenterable, which is
   * the one place the difference shows: see `simulateBankroll`.
   */
  entryCostGems: number | null;
  /** Gold price, or `null` where the event does not take gold. */
  entryCostGold: number | null;
  /**
   * Play-in point price, or `null` where the event does not take them.
   *
   * The third way to pay for an entry, and unlike the other two it buys
   * nothing else in Arena — which is why the bankroll spends these first. It
   * is a stock rather than a flow: no event here pays points *and* charges
   * them, so a balance drains and never refills. That is the reason it moves
   * the bankroll simulation and leaves the per-event `netValue` alone; see
   * the note there.
   */
  entryCostPlayInPoints: number | null;
  /**
   * Gold earned in a day from everything *except* this event's own wins —
   * quests, and games played outside it.
   *
   * A daily quest by default, so this is the day's *budget* toward entries
   * rather than what the entry itself earned back. Set it to 0 for the
   * stricter reading, where an event is credited only the gold its own wins
   * generate.
   *
   * Divided across the events the day's games fill, since it does not repeat
   * per event — see `goldPerEvent`.
   */
  otherGoldPerDay: number;
  /**
   * Games played per day, across however many events they fill.
   *
   * The day is counted in games rather than events because games are what
   * take the time and what the daily-win ladder pays on: a best-of-three
   * match is two or three of them where a best-of-one round is exactly one.
   * Sets how far the day's wins get through the ladder before it caps at
   * fifteen, so playing more earns more in total but less per event, and how
   * many events share `otherGoldPerDay`. Zero credits no gold at all, which
   * is how you price an event in gems alone.
   */
  gamesPerDay: number;
  /**
   * Games one match of this event takes, on average.
   *
   * 1 for best-of-one, where a round is a single game, and
   * BO3_GAMES_PER_MATCH (2.5) for best-of-three — filled in from the
   * preset's `bestOf` by `configFromPreset`. It is what turns a day of games
   * into a number of events: `gamesPerDay` holds
   * `gamesPerDay / (mean matches × this)` runs, which is the divisor
   * `goldPerEvent` spreads the day's gold across.
   */
  gamesPerMatch: number;
  /**
   * Gems 10,000 gold is worth.
   *
   * One rate for gold wherever it turns up: the gold a day's play credits an
   * event, which goes into the per-event gross, and the balance a bankroll
   * run is left holding. Zero counts gold as worthless in both places, the
   * same reading `playBoxValueGems: 0` has for boxes.
   */
  gemsPer10kGold: number;
  /** Packs' worth of cards kept per entry; 0 for phantom events. */
  draftPacks: number;
  /** Gem value of one pack's worth of drafted cards. */
  draftPackValueGems: number;
  /** Gem value assigned to one booster pack (0 = packs counted but valued at nothing). */
  packValueGems: number;
  /**
   * Gem value assigned to one mythic pack — a booster whose rare slot is
   * always a mythic rare.
   *
   * Its own rate rather than a multiple of `packValueGems`, so someone who
   * reprices ordinary packs is not silently repricing these too. The two
   * differ in one slot and nothing else, which is what the default says.
   */
  mythicPackValueGems: number;
  /**
   * Gem value assigned to one Cube Prize Pack.
   *
   * Its own rate for the same reason the mythic one is: these are a different
   * product at a different price, and the cube drafts pay nothing else.
   */
  cubePackValueGems: number;
  /** Gem value assigned to one play-in point. */
  playInPointValueGems: number;
  /**
   * Gem value of one Qualifier Weekend token.
   *
   * Zero by default, and the default is the honest one — see
   * `DEFAULT_QUALIFIER_TOKEN_VALUE_GEMS`, which carries the figure to type here
   * for anyone who wants the seat priced at what it returns.
   *
   * One caveat if you do set it. Tokens are valued linearly like every other
   * holding, so a run that won two counts twice — and a second token is
   * redundant. The count is right; the valuation is generous by however many
   * repeats a long run picked up.
   */
  qualifierTokenValueGems: number;
  /**
   * Gem value of a *generic* Play Booster box — one that names no set.
   *
   * Two jobs. It prices the boxes a custom ladder pays, which name nothing;
   * and it is what a named box falls back to when the feed cannot price it,
   * so a missing feed is never worse than having no feed at all.
   *
   * Zero means boxes are worth nothing, and it says so for *every* box
   * including named ones — the same reading `gemsPer10kGold: 0` has for
   * gold. Without that, "zero these out" would leave an Arena Direct
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
   * The field is `rareCard` and not `rareIcr` because a card is what it is: the
   * only track row paying these is level 6's four copies of Gandalf, Party
   * Guest, a card Wizards names, where an ICR is a random card of a rarity.
   *
   * On screen it is labelled a Rare ICR alongside the mythic and uncommon
   * ones, which is a deliberate choice and not an oversight to correct back.
   * All three are priced the same way — a rate per card that the reader sets —
   * and no term in the model asks which card arrives, so the distinction
   * changes no figure the app reports. Three labels, one of which quietly
   * disagreed with the other two, cost more in confusion than the precision
   * bought. It is recorded here instead, where length is free.
   *
   * The name stays: it is in the URL as `rareCardValue`, which
   * `share.compat.test.ts` pins, and it is what the reward actually is.
   */
  rareCardValueGems: number;
  /** Gem value of one uncommon individual card reward. */
  uncommonIcrValueGems: number;
  /**
   * Gem value of one individual card reward from the daily-win ladder.
   *
   * Its own rate rather than the uncommon one above, because the two are the
   * same card on different terms: the daily wins upgrade at about 1:10 where
   * the mastery track's beyond-cap reward upgrades at 5%, so someone
   * repricing one should not silently reprice the other.
   *
   * Zero by default, which counts the cards a day's wins pay as worth nothing
   * and leaves the gold — a refusal rather than a reading, since no one here
   * has read that 1:10 from Wizards' page. The cards are still counted, so
   * what is being left out stays on screen; see
   * DEFAULT_DAILY_WIN_ICR_VALUE_GEMS for what to type instead.
   */
  dailyWinIcrValueGems: number;
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
