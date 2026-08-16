import { REAL_GEMS } from "../format";
import type { HoldingKey, MasteryRewardKind } from "../lib";

/**
 * How much of a holding there is, printed in that holding's own terms.
 *
 * Balances print in their own currency; counts print as counts. Nothing here
 * follows the display unit: these answer what a run is *holding*, and a gem
 * balance is a real amount rather than a valuation of one — putting a dollar
 * sign on it would price a wallet nobody can cash out. The conversion belongs
 * to the "worth ≈ …" figures beside them, which are the estimates. Gold is
 * exempt for the neighbouring reason: it is Arena-internal, with its own rate
 * against gems.
 *
 * `exact` is for the figures that are whole by construction — a median, a
 * smallest, a largest — since only an average can land between two boxes. A
 * range reading 0.0 to 8.0 boxes implies a precision the thing does not have.
 *
 * Shared rather than local because two places print these amounts and they
 * have to agree: the holding cards, and the hover label on the bar that
 * decomposes the ending value.
 *
 * Mastery rewards go through the same rule and need no case of their own: the
 * two currencies are spelled the same wherever they turn up, and every other
 * mastery reward is a count of things, which is what the fallthrough prints.
 */
export const amountText = (
  key: HoldingKey | MasteryRewardKind,
  n: number,
  exact = false,
): string => {
  if (key === "gems") return REAL_GEMS.fmt(n);
  if (key === "gold") return Math.round(n).toLocaleString();
  if (exact) return n.toLocaleString();
  return n.toFixed(n > 0 && n < 1 ? 2 : 1);
};
