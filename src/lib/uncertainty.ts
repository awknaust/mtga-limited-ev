/**
 * The win rate as something the player is estimating, rather than a number they
 * know.
 *
 * Every other figure in this model is exact once a win rate is fixed, so what
 * is not known about the rate is the whole of the uncertainty worth reporting,
 * and it is large: on Premier Draft a hundred matches of record leaves a span
 * of roughly 770 gems around expected net, and that span crosses zero. The
 * record is the data and the rate is a posterior over it.
 */

import betaQuantile from "@stdlib/stats-base-dists-beta-quantile";

import { expectedNetAt } from "./simulate";
import type { EventConfig } from "./types";

/**
 * The prior, as a Beta centred on a coin flip and worth twenty matches.
 *
 * Beta(10, 10) rather than the uniform Beta(1, 1). Uniform sounds like the
 * neutral choice, but it asserts that a 5% win rate and a 95% one are as
 * plausible beforehand as 50% — and in a matchmade queue neither is. Arena
 * pairs players by rank, which is a mechanism for pushing everyone toward an
 * even record, so "average until your record says otherwise" is both the more
 * realistic belief and the easier one to defend.
 *
 * Its strength is deliberate, not incidental. At twenty prior matches it
 * carries about as much weight as the default record, which means a 14-6 run
 * reads as a 55% player running hot rather than a 70% player — usually the
 * truth. By a few hundred matches the data has swamped it entirely.
 *
 * The visible cost is shrinkage: set the slider to 70% with twenty matches
 * behind it and the plausible range centres nearer 60%, not 70%. That is the
 * prior working rather than misbehaving, and the asymmetry it puts in the band
 * is doing useful work — it shows which way a short record is likely to be
 * flattering you.
 */
export const PRIOR_ALPHA = 10;
export const PRIOR_BETA = 10;

/**
 * How many posterior draws the interval is read off.
 *
 * Stratified rather than random: the sample is the quantiles at (i + ½)/N, so
 * it is deterministic, needs no seed, and cannot wobble between renders the way
 * a drawn sample would. `expectedNetAt` is closed form and the EV curve already
 * evaluates it ~120 times a render, so this costs about three of those.
 */
const DRAWS = 400;

/**
 * How much of the posterior the reported ranges cover.
 *
 * Ninety rather than ninety-five, because the ranges are read as "what could
 * happen to me" rather than tested against, and the last five points of cover
 * buy a great deal of width at the tails for very little meaning.
 *
 * These are credible intervals, not confidence intervals, and the difference is
 * the one that matters when writing the label: a credible interval genuinely
 * does mean the true rate lies inside it with that probability. The frequentist
 * reading — that the *procedure* covers the truth nine times in ten — is what
 * people usually assume a confidence interval says and is not what it says. So
 * the plain-language phrasing is available here honestly.
 */
export const CREDIBLE_LEVEL = 0.9;

/** A Beta posterior over the match win rate. */
export type Posterior = { alpha: number; beta: number };

/**
 * The posterior implied by a stated rate and the number of matches behind it.
 *
 * The stated rate is read as a record — `matches` played at that rate — which
 * is what makes one number stand in for two. Null when the player has called
 * the rate certain, which asks for point estimates throughout.
 */
export function winRatePosterior(config: EventConfig): Posterior | null {
  const matches = config.winRateMatches;
  if (!Number.isFinite(matches) || matches <= 0) return null;
  const wins = config.winRate * matches;
  return {
    alpha: PRIOR_ALPHA + wins,
    beta: PRIOR_BETA + (matches - wins),
  };
}

/** A central interval on the win rate itself, for the band under the curve. */
export function winRateInterval(
  posterior: Posterior,
  level = CREDIBLE_LEVEL,
): [lo: number, hi: number] {
  const tail = (1 - level) / 2;
  return [
    betaQuantile(tail, posterior.alpha, posterior.beta),
    betaQuantile(1 - tail, posterior.alpha, posterior.beta),
  ];
}

/**
 * Expected net at each of `DRAWS` posterior win rates, sorted.
 *
 * Sorting is what lets the quantiles come off the values rather than off the
 * rates, and that distinction is load-bearing. Reading them off the rates
 * assumes expected net rises with the win rate — true of every preset here, and
 * what `breakEvenWinRate` leans on, but false one click away. Zero the box
 * values and Arena Direct pays only boxes past five wins, so winning more
 * destroys value and the curve humps: worst at both ends, best in the middle.
 * Quantiles mapped through that can come out inverted. Sorting the values is
 * correct either way and costs nothing.
 */
function sortedNets(config: EventConfig, posterior: Posterior): number[] {
  const nets = Array.from({ length: DRAWS }, (_, i) => {
    const p = betaQuantile((i + 0.5) / DRAWS, posterior.alpha, posterior.beta);
    return expectedNetAt(config, p);
  });
  return nets.sort((a, b) => a - b);
}

/** Central credible interval on expected net, or null if the rate is certain. */
export function netInterval(
  config: EventConfig,
  level = CREDIBLE_LEVEL,
): [lo: number, hi: number] | null {
  const posterior = winRatePosterior(config);
  if (!posterior) return null;
  const nets = sortedNets(config, posterior);
  const at = (q: number) => nets[Math.min(nets.length - 1, Math.floor(q * nets.length))];
  const tail = (1 - level) / 2;
  return [at(tail), at(1 - tail)];
}

/**
 * Share of the posterior where the event is worth entering at all.
 *
 * The figure the break-even rate implies but never states: not "the event turns
 * a profit above 62%" but "you are above that in a third of what your record
 * supports". Counted over the draws rather than as one minus the CDF at the
 * break-even point, for the same reason the interval is: it does not assume the
 * curve only ever rises.
 */
export function probProfitable(config: EventConfig): number | null {
  const posterior = winRatePosterior(config);
  if (!posterior) return null;
  const nets = sortedNets(config, posterior);
  return nets.filter((n) => n > 0).length / nets.length;
}
