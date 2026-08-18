/** Turning a win count into gems, via the config's payout table. */

import {
  boxHoldingKey,
  boxValueGems,
  priceTiers,
  tierBoxesAt,
  type LadderBoxes,
} from "./boxes";
import { exactDistribution } from "./distribution";
import { DAILY_WIN_CAP, DAILY_WIN_GOLD } from "./presets";
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
 * Two of its terms are not payout tier rewards and are flat across every win
 * count: the cards kept from the pool, which you get for entering however the
 * event goes, and the gold a day's play credits the entry — see
 * `goldValueGems`. Both are earnings of the entry, so both sit in the gross,
 * and net is then simply gross less the gem price.
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
    // over the win counts — the same flat term `grossValue` carries.
    gold: goldValueGems(config),
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
 * Fractional wins are interpolated within the step they fall in. A win count is
 * an expectation rather than a whole number of matches, and rounding it would put
 * a visible stair-step in the EV curve where the model has no real
 * discontinuity.
 */
export function dailyWinGold(wins: number): number {
  const capped = Math.min(Math.max(wins, 0), DAILY_WIN_CAP);
  const whole = Math.floor(capped);
  let total = 0;
  for (let i = 0; i < whole; i++) total += DAILY_WIN_GOLD[i];
  if (whole < DAILY_WIN_CAP) total += (capped - whole) * DAILY_WIN_GOLD[whole];
  return total;
}

/** Expected match wins from one run of the event, at its configured win rate. */
export function meanWinsPerEvent(config: EventConfig): number {
  return meanOverWins(config)((wins) => wins);
}

/**
 * Gold credited to one event.
 *
 * Two sources, and they behave differently enough that lumping them into a
 * flat daily figure was the whole problem. Daily-win gold is *caused by* the
 * event — it comes from the event's own wins, and it saturates once the day's
 * wins reach the ladder's cap. Everything else arrives whether or not you
 * entered, so it is divided across the day's events rather than earned by any
 * of them.
 *
 * A day's wins are `eventsPerDay × meanWins`, which is what climbs the ladder;
 * dividing the result back out gives one event's share. So playing more earns
 * more in total and less each, and the second effect only bites near the cap
 * rather than immediately — which a flat figure divided by `eventsPerDay` got
 * backwards.
 */
export function goldPerEvent(config: EventConfig): number {
  if (config.eventsPerDay <= 0) return 0;
  const dailyWins = config.eventsPerDay * meanWinsPerEvent(config);
  return (dailyWinGold(dailyWins) + config.otherGoldPerDay) / config.eventsPerDay;
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
 * `eventsPerDay: 0` still prices an event in gems alone.
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
  return grossValue(config, wins) - config.entryCostGems;
}
