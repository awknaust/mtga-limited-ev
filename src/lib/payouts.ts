/** Turning a win count into gems, via the config's payout table. */

import {
  boxHoldingKey,
  boxValueGems,
  priceTiers,
  tierBoxesAt,
  type LadderBoxes,
} from "./boxes";
import { exactDistribution } from "./distribution";
import { DAILY_WIN_CAP, DAILY_WIN_GOLD, DAILY_WIN_ICR } from "./presets";
import { matchWinRate } from "./structure";
import type { HoldingKey } from "./holdings";
import type { EventConfig, PayoutTier } from "./types";

export function payoutFor(config: EventConfig, wins: number): PayoutTier {
  const tier = config.payouts.find((t) => t.wins === wins);
  return tier ?? { wins, gems: 0, packs: 0 };
}

/** Play-in points awarded at a win count; absent means none. */
export function playInPointsFor(config: EventConfig, wins: number): number {
  return payoutFor(config, wins).playInPoints ?? 0;
}

/** Mythic packs awarded at a win count; absent means none. */
export function mythicPacksFor(config: EventConfig, wins: number): number {
  return payoutFor(config, wins).mythicPacks ?? 0;
}

/** Cube Prize Packs awarded at a win count; absent means none. */
export function cubePacksFor(config: EventConfig, wins: number): number {
  return payoutFor(config, wins).cubePacks ?? 0;
}

/** Qualifier Weekend tokens awarded at a win count; absent means none. */
export function qualifierTokensFor(config: EventConfig, wins: number): number {
  return payoutFor(config, wins).qualifierTokens ?? 0;
}

/**
 * Gross value in gems for a given win count.
 *
 * Three of its terms are not payout tier rewards and are flat across every win
 * count: the cards kept from the pool, which you get for entering however the
 * event goes, and the two things a day's play credits the entry — the gold and
 * the individual card rewards off the daily-win ladder, see `goldValueGems`
 * and `icrValueGems`. All three are earnings of the entry, so all three sit in
 * the gross, and net is then simply gross less the gem price.
 */
export function grossValue(config: EventConfig, wins: number): number {
  const tier = payoutFor(config, wins);
  // Boxes are summed one at a time rather than counted and multiplied: a row
  // can pay two boxes of different sets, worth different amounts.
  const boxes = (tier.boxes ?? []).reduce(
    (acc, box) => acc + boxValueGems(config, box),
    0,
  );
  return (
    config.draftPacks * config.draftPackValueGems +
    goldValueGems(config) +
    icrValueGems(config) +
    tier.gems +
    tier.packs * config.packValueGems +
    (tier.mythicPacks ?? 0) * config.mythicPackValueGems +
    (tier.cubePacks ?? 0) * config.cubePackValueGems +
    (tier.playInPoints ?? 0) * config.playInPointValueGems +
    (tier.qualifierTokens ?? 0) * config.qualifierTokenValueGems +
    boxes
  );
}

/**
 * Means over the win counts, each weighted by its exact chance at the config's
 * own win rate. The distribution is computed once and the closure reused for
 * every term a caller wants averaged.
 */
function meanOverWins(config: EventConfig): (of: (wins: number) => number) => number {
  const dist = exactDistribution(matchWinRate(config), config.structure);
  return (of) => dist.reduce((acc, p, wins) => acc + p * of(wins), 0);
}

/**
 * Expected gross per event, split into what it is made of.
 *
 * `grossValue` folds its terms into one number, and by the time it reaches the
 * screen there is no telling whether a gross of 1,128 is mostly gems or mostly
 * packs — outcomes that feel nothing alike to whoever has to open the packs to
 * realise the value. This takes the same terms and reports them separately,
 * weighted by how often each win count happens.
 *
 * Keyed by holding so it lines up with the bankroll breakdown. Gold is the
 * one entry that is not read off the ladder: it is the per-event credit at
 * the config's rate, the same figure `grossValue` adds, so it is flat across
 * win counts and zero wherever gold is priced at nothing. Callers drop the
 * empty entries.
 *
 * These sum to `eventExpectation(config).meanGross` by construction, since
 * they are that same sum with the weights distributed over its terms and the
 * probabilities summing to one. `model.test.ts` pins that rather than
 * trusting it, because a figure drawn under a total has to add up to the
 * total.
 */
export function grossSplit(config: EventConfig): Record<HoldingKey, number> {
  const mean = meanOverWins(config);

  const priced = priceTiers(config);
  return {
    gems: mean((wins) => payoutFor(config, wins).gems),
    // Credited to the entry rather than paid by a ladder row, so not a mean
    // over the win counts — the same flat terms `grossValue` carries.
    gold: goldValueGems(config),
    dailyIcrs: icrValueGems(config),
    packs: mean((wins) => payoutFor(config, wins).packs) * config.packValueGems,
    mythicPacks:
      mean((wins) => mythicPacksFor(config, wins)) * config.mythicPackValueGems,
    cubePacks: mean((wins) => cubePacksFor(config, wins)) * config.cubePackValueGems,
    playInPoints:
      mean((wins) => playInPointsFor(config, wins)) * config.playInPointValueGems,
    qualifierTokens:
      mean((wins) => qualifierTokensFor(config, wins)) * config.qualifierTokenValueGems,
    // One entry per box the ladder pays, each at its own price — two play
    // boxes of different sets are different amounts and different rows.
    ...boxSplit(priced, (i) =>
      mean((wins) => (tierBoxesAt(priced, wins)[i] ?? 0) * priced.prices[i]),
    ),
    // Flat across win counts: the pool is kept for entering, however it goes.
    draftPacks: config.draftPacks * config.draftPackValueGems,
  };
}

/** One entry per box the ladder pays, keyed as a holding. */
const boxSplit = (
  priced: LadderBoxes,
  of: (index: number) => number,
): Record<string, number> =>
  Object.fromEntries(priced.products.map((box, i) => [boxHoldingKey(box), of(i)]));

/**
 * How many of each reward an event pays on average, alongside what they came
 * to. The bar built from `grossSplit` names both — "6.2 packs" and what they
 * are worth answer different questions, and neither implies the other.
 */
export function grossCounts(config: EventConfig): Record<HoldingKey, number> {
  const mean = meanOverWins(config);

  const priced = priceTiers(config);
  return {
    gems: mean((wins) => payoutFor(config, wins).gems),
    gold: goldPerEvent(config),
    dailyIcrs: icrsPerEvent(config),
    packs: mean((wins) => payoutFor(config, wins).packs),
    mythicPacks: mean((wins) => mythicPacksFor(config, wins)),
    cubePacks: mean((wins) => cubePacksFor(config, wins)),
    playInPoints: mean((wins) => playInPointsFor(config, wins)),
    qualifierTokens: mean((wins) => qualifierTokensFor(config, wins)),
    ...boxSplit(priced, (i) => mean((wins) => tierBoxesAt(priced, wins)[i] ?? 0)),
    draftPacks: config.draftPacks,
  };
}

/**
 * Gold from the daily-win ladder for a number of wins in a day.
 *
 * The wins are game wins — the unit the ladder itself counts, each game of a
 * best-of-three on its own; see DAILY_WIN_GOLD.
 *
 * Fractional wins are interpolated within the step they fall in. A win count is
 * an expectation rather than a whole number of games, and rounding it would put
 * a visible stair-step in the EV curve where the model has no real
 * discontinuity.
 */
export function dailyWinGold(wins: number): number {
  return ladderTotal(DAILY_WIN_GOLD, wins);
}

/**
 * Individual card rewards from the daily-win ladder for a number of wins in a
 * day.
 *
 * The gold ladder's other column, read the same way and interpolated the same
 * way — see DAILY_WIN_ICR for which wins pay one. The two interleave, so a day
 * short of the fifth win earns gold and no cards at all, and the cards arrive
 * exactly where the gold stops.
 */
export function dailyWinIcrs(wins: number): number {
  return ladderTotal(DAILY_WIN_ICR, wins);
}

/**
 * A daily ladder summed to a win count, interpolating within the step the
 * count falls in.
 *
 * One reader for both columns, so the gold and the cards cannot come to
 * disagree about what "6.6 wins" means. `DAILY_WIN_CAP` is the length of the
 * gold ladder and both are the same table, which `model.test.ts` pins rather
 * than assumes.
 */
function ladderTotal(ladder: readonly number[], wins: number): number {
  const capped = Math.min(Math.max(wins, 0), DAILY_WIN_CAP);
  const whole = Math.floor(capped);
  let total = 0;
  for (let i = 0; i < whole; i++) total += ladder[i];
  if (whole < DAILY_WIN_CAP) total += (capped - whole) * ladder[whole];
  return total;
}

/** Expected match wins from one run of the event, at its configured win rate. */
export function meanWinsPerEvent(config: EventConfig): number {
  return meanOverWins(config)((wins) => wins);
}

/**
 * Mean matches one event lasts, at the config's own win rate.
 *
 * Wald's identity, not a sum over the finishing records. The event ends at a
 * stopping time on a sequence of matches each won with probability `p`, so
 * the expected wins are `p` times the expected matches, and
 *
 *     E[matches] = E[wins] / p
 *
 * The right-hand side is a sum over the ordinary win-count distribution —
 * the same one `meanWinsPerEvent` takes — which is what makes this the
 * plain-arithmetic answer rather than the ten-row one: a win count does not
 * fix how many matches were played (7-0 and 7-2 are one row and seven or
 * nine matches), so summing `wins + losses` over the records was the other
 * route, and this one needs no records at all.
 *
 * The one endpoint the division cannot reach: a player who never wins has
 * `E[wins] = 0` and `p = 0`, and the identity reads just as well from the
 * losses' side — `E[matches] = E[losses] / (1 − p)` — where it says they bust
 * out after exactly `maxLosses` matches. A fixed-rounds event plays every
 * round whatever `p` is, and comes out at its round count on either side.
 */
export function meanRoundsPerEvent(config: EventConfig): number {
  const p = matchWinRate(config);
  const { structure } = config;
  if (structure.kind === "rounds") return structure.rounds;
  if (p <= 0) return structure.maxLosses;
  return meanWinsPerEvent(config) / p;
}

/** Mean games one event lasts: its matches at the games each of them takes. */
export function meanGamesPerEvent(config: EventConfig): number {
  return meanRoundsPerEvent(config) * config.gamesPerMatch;
}

/**
 * Events a day of `gamesPerDay` games holds, on average.
 *
 * The day is an amount of play rather than a number of entries, so how many
 * events it comes to depends on the event: a best-of-three run of the same
 * length in matches takes `gamesPerMatch` times the games, and fills the day
 * `gamesPerMatch` times as fast. This is the divisor the day's gold is spread
 * across in `goldPerEvent`, and the figure the Advanced dialog shows beside
 * the knob.
 */
export function meanEventsPerDay(config: EventConfig): number {
  const games = meanGamesPerEvent(config);
  return games > 0 ? config.gamesPerDay / games : 0;
}

/**
 * Gold credited to one event.
 *
 * Two sources, and they behave differently enough that lumping them into a
 * flat daily figure was the whole problem. Daily-win gold is *caused by* the
 * day's play — climbed win by win until the ladder's cap — while everything
 * else arrives whether or not you entered; both are divided across the events
 * the day holds rather than earned flat per entry.
 *
 * The day is `gamesPerDay` games, and the ladder counts *game* wins — each
 * game of a best-of-three on its own (see DAILY_WIN_GOLD) — so a day's wins
 * are `gamesPerDay × winRate`. For best-of-one that is exact: a round is a
 * game, and the rate is the rate. For best-of-three the configured match rate
 * stands in for the per-game rate the ladder strictly wants, the same refusal
 * to convert between the two that `matchWinRate` records; with matches
 * counted at BO3_GAMES_PER_MATCH the two rates are close enough that the
 * stand-in moves the day's gold by less than the rate's own uncertainty.
 *
 * One event's share is the day's gold over `meanEventsPerDay`. Playing more
 * games earns more in total and less per event, and the second effect only
 * bites near the cap rather than immediately — which a flat figure divided
 * across the day got backwards. A best-of-three event is credited more per
 * entry than a best-of-one at the same rate, because its matches take more of
 * the day: fewer entries split the same gold.
 */
export function goldPerEvent(config: EventConfig): number {
  if (config.gamesPerDay <= 0) return 0;
  return (dailyWinGold(dailyWins(config)) + config.otherGoldPerDay) * dayShare(config);
}

/**
 * Wins a day of games comes to, which is what climbs both ladder columns.
 *
 * `gamesPerDay × winRate`, and the caveat about which rate that is belongs to
 * `goldPerEvent` above. Factored out because the gold and the cards have to
 * be read off the same day: two copies of this multiplication is how the two
 * columns would come to disagree about how far the day got.
 */
const dailyWins = (config: EventConfig): number =>
  config.gamesPerDay * matchWinRate(config);

/**
 * How much of the day one event is, as a fraction.
 *
 * The other half of the same arrangement: whatever the day earned, an event
 * is credited this much of it. Guarded by the `gamesPerDay <= 0` check in both
 * callers, which is the switch for pricing an event in gems alone.
 */
const dayShare = (config: EventConfig): number =>
  meanGamesPerEvent(config) / config.gamesPerDay;

/**
 * Individual card rewards credited to one event.
 *
 * `goldPerEvent`'s twin, off the same table and divided the same way — the
 * day's wins read against DAILY_WIN_ICR, and this event's share of them. The
 * one difference is that there is no counterpart to `otherGoldPerDay`: a quest
 * pays gold, so nothing outside the win ladder pays cards, and an event that
 * does not fill the day is credited only what its own share of the wins earned.
 *
 * These sit further up the ladder than most of the gold, so they are the term
 * most sensitive to how long the day is: a day short of five wins is credited
 * no cards at all, and the sixth card needs fifteen.
 */
export function icrsPerEvent(config: EventConfig): number {
  if (config.gamesPerDay <= 0) return 0;
  return dailyWinIcrs(dailyWins(config)) * dayShare(config);
}

/**
 * What the cards credited to one event are worth, in gems.
 *
 * `icrsPerEvent` at the config's rate, which is the same arrangement gold has
 * with `gemsPer10kGold`: one rate for the reward wherever it appears, and a
 * rate of 0 says the cards a day's wins pay are worth nothing — in the
 * per-event gross and in a bankroll run's ending value alike.
 *
 * Flat across win counts for the reason the gold is: it is a long-run average
 * per event rather than what one finish paid. `gamesPerDay: 0` zeroes it along
 * with the gold.
 */
export function icrValueGems(config: EventConfig): number {
  return icrsPerEvent(config) * config.dailyWinIcrValueGems;
}

/**
 * What the gold credited to one event is worth, in gems.
 *
 * `goldPerEvent` at the config's exchange rate — the same rate that prices a
 * leftover gold balance on the Bankroll tab and that the About tab lists
 * beside every other reward. One rate for gold wherever it appears, so a rate
 * of 0 says gold is worth nothing everywhere rather than in one place.
 *
 * Gold used to enter the per-event figures as a *discount on the entry*
 * instead: the long-run share of entries the accrual could pay for, at the
 * event's own gold price, taken off the gem price before net was struck. That
 * was the same arithmetic for every dual-priced preset — 10,000 gold against
 * 1,500 gems is the rate — but it split gold from every other reward. Gross
 * left it out, net folded it in, ROI divided by a discounted entry, and the
 * outcome table never named it, so gross less net came to a figure that was
 * not the entry anyone was quoted. Counting it as earnings puts every gold
 * figure on the same side of the ledger as the packs: gross includes it, net
 * is gross less the full gem price, and ROI divides by that price.
 *
 * Two things follow that the discount could not say. An event that takes no
 * gold — Sealed, Arena Direct — is credited the gold its play earns all the
 * same, since a day of daily wins is worth the same whichever queue paid it,
 * which is what the Bankroll tab already assumed. And there is no cap at the
 * entry price: earning more gold than an entry costs is more gold, not a free
 * entry and change thrown away.
 *
 * Flat across win counts, like the cards kept from the pool: it is a long-run
 * average per event, not what one finish paid, and `goldPerEvent` says why.
 * `gamesPerDay: 0` still prices an event in gems alone.
 */
export function goldValueGems(config: EventConfig): number {
  return (goldPerEvent(config) * config.gemsPer10kGold) / 10000;
}

/**
 * Net result in gems for a given win count: the gross, gold included, less
 * the gem price of the entry.
 *
 * The gem price and nothing else. Gold is on the earnings side, above. The
 * play-in points a Qualifier Play-In charges are deliberately not here either:
 * gold is a *flow* that accrues daily whether or not you enter, and so
 * belongs in a per-event figure, but points are a *stock* — no event here
 * both pays them and charges them, so a balance drains and never refills. A
 * banked stock changes how far a bankroll goes, which is the bankroll
 * simulation's question; it does not change what an entry costs in the
 * steady state, which is this one.
 */
export function netValue(config: EventConfig, wins: number): number {
  return grossValue(config, wins) - (config.entryCostGems ?? 0);
}
