import { useId, useState, type ReactNode } from "react";

import { BoxCell } from "./BoxCell";
import { InfoTip } from "./InfoTip";
import {
  AddonInput,
  GemInput,
  GoldInput,
  NumberInput,
  PointsInput,
  clampInt,
} from "./Inputs";
import { PickerDialog } from "./PickerDialog";
import {
  maxPossibleWins,
  paysBoxes,
  resizePayouts,
  type EventConfig,
  type EventStructure,
  type PayoutBox,
  type PayoutTier,
} from "../lib";

/**
 * The columns a payout row is edited in, in the order a row lists what it
 * pays.
 *
 * `key` is the `PayoutTier` field, so adding a reward to the model is adding a
 * line here and nothing else — and a field spelled wrong is a compile error
 * rather than a column of zeroes. All but the last are a count in a box, which
 * is what lets them share a cell; the boxes are the exception, because a row
 * *names* the boxes it pays rather than counting them, so that column holds
 * chips.
 *
 * `cleared` is the row patch that takes a column away: 0 for the two fields a
 * tier always has, absent for the ones it may not, which is how the presets
 * are written and how a link serialises them.
 */
type PayoutColumn = {
  key: Exclude<keyof PayoutTier, "wins">;
  label: string;
  icon: string;
  cleared: Partial<PayoutTier>;
};

const PAYOUT_COLUMNS: PayoutColumn[] = [
  { key: "gems", label: "Gems", icon: "bi-gem", cleared: { gems: 0 } },
  { key: "packs", label: "Packs", icon: "bi-stack", cleared: { packs: 0 } },
  {
    key: "mythicPacks",
    label: "Mythic",
    icon: "bi-stars",
    cleared: { mythicPacks: undefined },
  },
  { key: "cubePacks", label: "Cube", icon: "bi-box", cleared: { cubePacks: undefined } },
  {
    key: "playInPoints",
    label: "Points",
    icon: "bi-ticket-perforated",
    cleared: { playInPoints: undefined },
  },
  {
    key: "qualifierTokens",
    label: "Tokens",
    icon: "bi-trophy",
    cleared: { qualifierTokens: undefined },
  },
  {
    key: "boxes",
    label: "Boxes",
    icon: "bi-box-seam",
    cleared: { boxes: undefined },
  },
];

/** Whether a ladder pays a column's reward at any win count. */
const paidBy = (payouts: PayoutTier[], col: PayoutColumn): boolean =>
  col.key === "boxes"
    ? paysBoxes(payouts)
    : payouts.some((t) => ((t[col.key] as number | undefined) ?? 0) > 0);

/**
 * The columns an editor opens with: gems and packs, plus whatever else the
 * ladder in front of it pays.
 *
 * Gems and packs are the shape of a payout table — nearly every event pays
 * both, and a fresh custom ladder should have somewhere to type them while
 * they are still zero. The rest are the exceptions they were before they were
 * columns anyone could add: mythic packs belong to Contender's top two rungs,
 * Cube Prize Packs to the cube drafts, points to the traditional events,
 * Qualifier tokens to the Play-Ins' top win count, and boxes to the Arena
 * Directs. A ladder paying none of them has no use for five columns of
 * nothing.
 */
const defaultColumns = (payouts: PayoutTier[]): PayoutColumn["key"][] =>
  PAYOUT_COLUMNS.filter(
    (c) => c.key === "gems" || c.key === "packs" || paidBy(payouts, c),
  ).map((c) => c.key);

/**
 * What an event *is*: its structure, what entering costs, and what each
 * finishing record pays.
 *
 * One component for the two places that show it, because they show the same
 * thing and have to agree about it — the sidebar's folded panel, which is a
 * record of the event being priced, and the Custom dialog, which is the only
 * place any of it can be typed. The difference between them is `locked` and
 * nothing else, so a field cannot exist in one and not the other.
 *
 * It carries its own ids rather than taking them, because both instances sit
 * in the document at once: a Bootstrap dialog is mounted whether or not it is
 * showing, so shared ids would be duplicated ids and every label in the
 * sidebar would point at a control inside the hidden dialog.
 */
export function EventFields({
  config,
  locked,
  onChange,
}: {
  config: EventConfig;
  /**
   * Whether this is the record rather than the editor.
   *
   * Every preset describes a real event, so there is no editor for one at
   * all; Custom has both, and the sidebar's copy of it stays locked like the
   * rest. `onChange` is never called while this is set.
   */
  locked: boolean;
  onChange: (config: EventConfig) => void;
}) {
  const uid = useId();
  const ids = {
    structure: `${uid}-structure`,
    maxWins: `${uid}-max-wins`,
    maxLosses: `${uid}-max-losses`,
    rounds: `${uid}-rounds`,
    entry: `${uid}-entry`,
    entryGold: `${uid}-entry-gold`,
    entryPoints: `${uid}-entry-points`,
    draftPacks: `${uid}-draft-packs`,
  };

  const set = <K extends keyof EventConfig>(key: K, value: EventConfig[K]) =>
    onChange({ ...config, [key]: value });

  const setTier = (wins: number, patch: Partial<PayoutTier>) =>
    onChange({
      ...config,
      payouts: config.payouts.map((t) => (t.wins === wins ? { ...t, ...patch } : t)),
    });

  /**
   * Replace one row's boxes, dropping the field when none are left.
   *
   * Absent rather than empty, so an edited row serialises the way the presets
   * are written and a row that had its last box removed is indistinguishable
   * from one that never had any.
   */
  const setBoxes = (wins: number, boxes: PayoutBox[]) =>
    setTier(wins, boxes.length ? { boxes } : { boxes: undefined });

  /**
   * Changing the structure changes how many win counts are reachable, so the
   * payout table has to be resized to match — rows that still exist keep their
   * values.
   */
  const setStructure = (structure: EventStructure) =>
    onChange({
      ...config,
      structure,
      payouts: resizePayouts(config.payouts, maxPossibleWins(structure)),
    });

  const structure = config.structure;

  /*
   * Which reward columns the editor is showing. State rather than a reading
   * of the ladder, because an editor's columns must not come and go with
   * whatever happens to be typed in them: zeroing the last gem payout is
   * something people do on the way to typing another one, and a column that
   * vanished under the caret would take the rest of its figures with it.
   *
   * A record has no such problem and needs no such state. It shows a column
   * for what the event pays and nothing else, which is the rule every preset
   * has always been shown under — and it is what makes a removed column read
   * as removed on both sides of the page.
   *
   * Seeded once per mount, and the mount is the point: App gives this a `key`
   * that moves when "Copy values from" loads another event, so copying an
   * Arena Direct brings its Boxes column with it, and copying a draft leaves
   * behind the columns that event has no use for.
   */
  const [shown, setShown] = useState(() => defaultColumns(config.payouts));
  const columns = PAYOUT_COLUMNS.filter((c) =>
    locked ? paidBy(config.payouts, c) : shown.includes(c.key),
  );
  const hidden = PAYOUT_COLUMNS.filter((c) => !shown.includes(c.key));

  /**
   * Take a column away, and everything in it with it.
   *
   * Hiding without clearing would leave the ladder paying something nobody
   * can see: the results would go on counting boxes this table no longer
   * mentions. So the × says the column is going and means the payout is —
   * which is also why the record beside it stops showing the column, for the
   * honest reason that the event no longer pays one.
   */
  const removeColumn = (col: PayoutColumn) => {
    setShown(shown.filter((k) => k !== col.key));
    onChange({
      ...config,
      payouts: config.payouts.map((t) => ({ ...t, ...col.cleared })),
    });
  };

  /*
   * Added back in the order the columns are declared in rather than the order
   * they were chosen, so a ladder that grew Points and then Boxes reads like
   * one that always had them.
   */
  const addColumn = (col: PayoutColumn) =>
    setShown(
      PAYOUT_COLUMNS.filter((c) => c.key === col.key || shown.includes(c.key)).map(
        (c) => c.key,
      ),
    );

  /**
   * One row's cell for one column.
   *
   * Every counted reward is the same control with the column's own icon in
   * front of it, which is what makes adding a reward a line in the list above
   * and nothing else. Boxes are the one branch, because a row names them.
   */
  const cell = (col: PayoutColumn, t: PayoutTier): ReactNode =>
    col.key === "boxes" ? (
      <BoxCell
        boxes={t.boxes ?? []}
        table={config.boxPrices}
        locked={locked}
        onChange={(boxes) => setBoxes(t.wins, boxes)}
      />
    ) : (
      <AddonInput
        compact
        addon={<i className={`bi ${col.icon}`} aria-hidden="true" />}
        disabled={locked}
        value={(t[col.key] as number | undefined) ?? 0}
        onChange={(n) => setTier(t.wins, { [col.key]: n })}
      />
    );

  return (
    <>
      <div className="row g-2 mb-3">
        <div className="col-6">
          <label htmlFor={ids.structure} className="form-label">
            Structure
          </label>
          <select
            id={ids.structure}
            className="form-select"
            disabled={locked}
            value={structure.kind}
            onChange={(e) =>
              setStructure(
                e.target.value === "rounds"
                  ? { kind: "rounds", rounds: 3 }
                  : { kind: "elimination", maxWins: 7, maxLosses: 3 },
              )
            }
          >
            <option value="elimination">Wins / losses</option>
            <option value="rounds">Fixed rounds</option>
          </select>
        </div>
      </div>

      <div className="row g-2 mb-3">
        {structure.kind === "elimination" ? (
          <>
            <div className="col-6">
              <label htmlFor={ids.maxWins} className="form-label">
                Wins to finish
              </label>
              <NumberInput
                id={ids.maxWins}
                disabled={locked}
                min={1}
                value={structure.maxWins}
                onChange={(n) =>
                  setStructure({ ...structure, maxWins: clampInt(n, 1, 20) })
                }
              />
            </div>
            <div className="col-6">
              <label htmlFor={ids.maxLosses} className="form-label">
                Losses to bust
              </label>
              <NumberInput
                id={ids.maxLosses}
                disabled={locked}
                min={1}
                value={structure.maxLosses}
                onChange={(n) =>
                  setStructure({ ...structure, maxLosses: clampInt(n, 1, 20) })
                }
              />
            </div>
          </>
        ) : (
          <div className="col-6">
            <label htmlFor={ids.rounds} className="form-label">
              Rounds
            </label>
            <NumberInput
              id={ids.rounds}
              disabled={locked}
              min={1}
              value={structure.rounds}
              onChange={(n) => setStructure({ kind: "rounds", rounds: clampInt(n, 1, 20) })}
            />
          </div>
        )}
      </div>

      <div className="row g-2 mb-3">
        <div className="col-6">
          <label htmlFor={ids.entry} className="form-label">
            Entry cost (gems)
          </label>
          <GemInput
            id={ids.entry}
            disabled={locked}
            value={config.entryCostGems}
            onChange={(n) => set("entryCostGems", n)}
          />
        </div>
        <div className="col-6">
          <label htmlFor={ids.entryGold} className="form-label">
            Entry cost (gold)
            <InfoTip
              label="About the gold entry"
              content="The entry price in gold, for events that take it. Set 0 for events that do not. A bankroll run pays in gold whenever enough has built up; the per-event figures price the entry in gems and count gold earned as winnings."
            />
          </label>
          <GoldInput
            id={ids.entryGold}
            disabled={locked}
            value={config.entryCostGold}
            onChange={(n) => set("entryCostGold", n)}
          />
        </div>
        <div className="col-6">
          <label htmlFor={ids.entryPoints} className="form-label">
            Entry cost (points)
            <InfoTip
              label="About the points entry"
              content="The entry price in play-in points, for the Qualifier Play-Ins. Set 0 for events that do not take them. Banked points are spent before gold or gems, since nothing else in Arena takes them."
            />
          </label>
          <PointsInput
            id={ids.entryPoints}
            disabled={locked}
            value={config.entryCostPlayInPoints}
            onChange={(n) => set("entryCostPlayInPoints", n)}
          />
        </div>
        <div className="col-6">
          <label htmlFor={ids.draftPacks} className="form-label">
            Draft packs kept
            <InfoTip
              label="About draft packs kept"
              content="How many packs' worth of cards you keep from the pool you played: three for a draft, six for sealed, zero for phantom events like cube."
            />
          </label>
          <AddonInput
            addon={<i className="bi bi-stack" aria-hidden="true" />}
            id={ids.draftPacks}
            disabled={locked}
            value={config.draftPacks}
            onChange={(n) => set("draftPacks", n)}
          />
        </div>
      </div>

      <h3 className="section-title mt-4">
        Payout schedule
        <InfoTip
          label="About the payout schedule"
          content="What the event pays for finishing on each win count. You get one row, not the rows below it. On Custom the rows follow the win ceiling, so lowering it drops the top ones."
        />
      </h3>
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Wins</th>
              {/*
                Every heading is held to one line: each column is as narrow as
                the input under it, so a two-word heading wraps and doubles the
                height of the whole header row. The counts are read from the
                right, as their figures are; the boxes column holds chips and
                is not.
              */}
              {columns.map((col) => (
                <th
                  scope="col"
                  className={`text-nowrap${col.key === "boxes" ? "" : " text-end"}`}
                  key={col.key}
                >
                  <i className={`bi ${col.icon} me-1`} aria-hidden="true" />
                  {col.label}
                  {/*
                    The column's own delete, in its heading, because what it
                    removes is the column: an × per cell would be eight ways
                    of asking the same question. It empties every row on the
                    way out, which the name says — a control that hid a
                    payout while the model kept paying it would be a lie the
                    results would tell.
                  */}
                  {!locked && (
                    <button
                      type="button"
                      className="payout-col-remove"
                      // The same words for the hover and the accessible name:
                      // this one has to say what it takes with it, and there
                      // is no shorter way to say it than the long way.
                      aria-label={`Remove the ${col.label} column, clearing it from every row`}
                      title={`Remove the ${col.label} column, clearing it from every row`}
                      onClick={() => removeColumn(col)}
                    >
                      ×
                    </button>
                  )}
                </th>
              ))}
              {/*
                The rightmost column is the one that adds a column, and it is
                there only while there is one left to add. A picker rather
                than a menu, matching the box cell's `+` and drawn the same
                way: in the top layer, out of reach of this table's own
                horizontal scroller.
              */}
              {!locked && hidden.length > 0 && (
                <th scope="col" className="text-nowrap payout-add-head">
                  <PickerDialog
                    label="Add a payout"
                    triggerClassName="payout-add"
                    trigger={
                      <>
                        <span aria-hidden="true">+ </span>
                        payout
                      </>
                    }
                  >
                    {(close) => (
                      <div className="d-flex flex-wrap gap-2">
                        {hidden.map((col) => (
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            key={col.key}
                            onClick={() => {
                              addColumn(col);
                              close();
                            }}
                          >
                            <i className={`bi ${col.icon} me-1`} aria-hidden="true" />
                            {col.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </PickerDialog>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {config.payouts.map((t) => (
              <tr key={t.wins}>
                <td className="fw-semibold text-primary">{t.wins}</td>
                {columns.map((col) => (
                  <td key={col.key}>{cell(col, t)}</td>
                ))}
                {/* Under the add-a-column heading, which pays nothing. */}
                {!locked && hidden.length > 0 && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/*
        A ladder can be emptied down to its win counts, and an editor showing
        nothing but those looks broken rather than empty. Say which it is.
      */}
      {!locked && columns.length === 0 && (
        <div className="form-text">
          This event pays nothing. Add a payout column to give it something to
          award.
        </div>
      )}
    </>
  );
}
