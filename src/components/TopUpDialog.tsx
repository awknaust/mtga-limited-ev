import { Dialog } from "./Dialog";
import { REAL_GEMS } from "../format";
import { STARTING_ENTRIES } from "../share";

/** An event the current balance cannot enter, and what to do about it. */
export type TopUp = {
  name: string;
  /**
   * The gem price, which the prompt is about: it offers to set the gem
   * balance, so an event with no gem price has nothing for it to offer and
   * never reaches here.
   */
  entryGems: number;
  /** Null where the event takes no gold, which changes what the prompt says. */
  goldPrice: number | null;
  /** Null where it takes no play-in points, which is every event but two. */
  pointPrice: number | null;
  suggested: number;
};

/**
 * Raised when a preset switch lands on an event the balance cannot enter.
 *
 * Declining is the plain-text option, since the balance on screen may be
 * exactly the one being asked about.
 */
export function TopUpDialog({
  ref,
  topUp,
  startingGems,
  onAccept,
}: {
  ref?: React.Ref<HTMLDivElement>;
  /** Null before the first prompt, and left standing after one — see `App`. */
  topUp: TopUp | null;
  startingGems: number;
  onAccept: (gems: number) => void;
}) {
  // Real gem amounts throughout: a price and a balance are figures Arena
  // quotes, so they are never converted to dollars.
  const gems = REAL_GEMS.fmt;
  return (
    <Dialog
      ref={ref}
      title="Not enough to enter"
      footer={
        topUp && (
          <>
            <button
              type="button"
              className="btn btn-outline-secondary"
              data-bs-dismiss="modal"
            >
              Leave it
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onAccept(topUp.suggested)}
            >
              Set to {gems(topUp.suggested)}
            </button>
          </>
        )
      }
    >
      {topUp && (
        <p className="mb-0">
          {topUp.name} costs {gems(topUp.entryGems)} and you have{" "}
          {gems(startingGems)}.
          {topUp.goldPrice !== null && (
            <>
              {" "}
              Your gold does not cover its {topUp.goldPrice.toLocaleString()} gold
              price either.
            </>
          )}
          {topUp.pointPrice !== null && (
            <>
              {" "}
              Nor do your play-in points cover its {topUp.pointPrice}.
            </>
          )}{" "}
          Set your balance to{" "}
          <span className="fw-semibold text-body">{gems(topUp.suggested)}</span> —
          enough for {STARTING_ENTRIES} entries?
        </p>
      )}
    </Dialog>
  );
}
