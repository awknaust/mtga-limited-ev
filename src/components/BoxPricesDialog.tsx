import { BoxPrices } from "./BoxPrices";
import { Dialog } from "./Dialog";
import { BAKED_BOX_PRICES, type BoxPriceFeed, type EventConfig } from "../lib";

/**
 * Where the two box values come from, opened from the About tab.
 *
 * Scrollable and wide: it is twenty rows of six columns, and a dialog that
 * grew to fit them would run off a laptop screen.
 */
export function BoxPricesDialog({
  ref,
  boxFeed,
  config,
  gemsPerUsd,
  now,
}: {
  ref?: React.Ref<HTMLDivElement>;
  /** The live feed, or null where there is none — see `App`. */
  boxFeed: BoxPriceFeed | null;
  config: EventConfig;
  gemsPerUsd: number;
  /** Stamped when the dialog opened, for the "as of" line above the table. */
  now: Date;
}) {
  /*
   * The payload itself, not the two defaults derived from it, since the table
   * quotes prices and says nothing about which of them were averaged. The live
   * one where the feed could be reached, else the copy the app shipped with,
   * and only the note above the table says which.
   */
  return (
    <Dialog ref={ref} title="Box prices by set" size="lg" scrollable>
      <BoxPrices
        feed={boxFeed ?? BAKED_BOX_PRICES.feed}
        live={boxFeed !== null}
        playBoxValueGems={config.playBoxValueGems}
        collectorBoxValueGems={config.collectorBoxValueGems}
        gemsPerUsd={gemsPerUsd}
        now={now}
      />
    </Dialog>
  );
}
