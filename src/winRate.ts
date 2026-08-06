/**
 * Stepping the win rate slider by a fixed amount.
 *
 * Kept out of `src/lib` because it is a property of the control rather than of
 * the model, and out of the component because it is the only part of the
 * stepper with arithmetic worth pinning.
 */

/**
 * The slider's step as a denominator. `step={0.005}` is 1/200, so every win
 * rate the slider can produce is an integer count of half percentage points.
 */
const GRID = 200;

/**
 * Move `winRate` by `deltaPoints` percentage points, snapped to the slider's
 * grid and clamped to 0..1.
 *
 * The arithmetic runs in grid units rather than on the fraction because
 * `0.55 + 0.005` is 0.5549999999999999 in doubles, and that is a number the
 * share link would carry and read back as something else. Ten presses of +0.5
 * have to land exactly where two presses of +2.5 would. Rounding into those
 * units also absorbs the slop the other way — 0.615 is 122.99999999999999
 * grid units, which truncating would spend a whole press climbing back out of.
 *
 * Off-grid rates only arrive from a hand-edited link, and rounding is what a
 * range input does with one: `?wr=0.6234` already draws its thumb at 0.625
 * while the state holds 0.6234. Snapping the same way is what keeps a press
 * agreeing with the slider it sits under, and keeps +0.5 worth half a point
 * rather than however far the nearest grid line happens to be.
 */
export const stepWinRate = (winRate: number, deltaPoints: number): number => {
  const steps = Math.round((deltaPoints / 100) * GRID);
  const from = Math.round(winRate * GRID);
  return Math.min(GRID, Math.max(0, from + steps)) / GRID;
};
