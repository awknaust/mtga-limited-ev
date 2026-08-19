import { useId, useState } from "react";

import { Dialog } from "./Dialog";
import { EventFields } from "./EventFields";
import { InfoTip } from "./InfoTip";
import { PRESETS, configFromPreset, type EventConfig } from "../lib";

/**
 * The custom event's editor: the same fields the column shows, with the locks
 * off.
 *
 * It is a dialog rather than part of the sidebar because the payout table is a
 * table — up to twenty rows of five columns, three of them number fields — and
 * a third of a page is not where that is legible. Scrollable and wide for the
 * same reason the box-price table is.
 */
export function CustomEventDialog({
  ref,
  isCustom,
  config,
  onChange,
}: {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Whether the event on screen is the one you own. The button that opens this
   * appears on exactly the same condition, so there is no state in which the
   * dialog is reachable and empty — and nothing is built otherwise, so the app
   * never holds a second, editable copy of a preset's own numbers.
   */
  isCustom: boolean;
  config: EventConfig;
  onChange: (config: EventConfig) => void;
}) {
  const id = useId();
  /*
   * Bumped when "Copy values from" loads another event, and used as the
   * fields' `key`, which is React's way of saying "this is a different thing
   * now, start it over". What starts over is which payout columns are on
   * screen: those are the editor's own state rather than the config's, and
   * copying an Arena Direct should bring its boxes column along while copying
   * a draft leaves it behind. Nothing about the model, so it is not in the
   * share state — two links that copied different events and ended up at the
   * same ladder are the same link.
   */
  const [copyGeneration, setCopyGeneration] = useState(0);

  return (
    <Dialog ref={ref} title="Custom event" size="lg" scrollable>
      {isCustom && (
        <>
          <div className="mb-3">
            <label htmlFor={id} className="form-label">
              Copy values from
              <InfoTip
                label="About copying values"
                content="Loads a real event's entry cost and payout schedule into this one, as a starting point to edit."
              />
            </label>
            {/*
             * The select resets to its placeholder after each use, and PRESETS
             * never contains Custom, so it cannot copy from itself.
             */}
            <select
              id={id}
              className="form-select"
              value=""
              onChange={(e) => {
                const preset = PRESETS.find((p) => p.name === e.target.value);
                if (!preset) return;
                onChange(configFromPreset(preset, config));
                setCopyGeneration(copyGeneration + 1);
              }}
            >
              <option value="">Choose an event…</option>
              {PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <EventFields
            key={copyGeneration}
            config={config}
            locked={false}
            onChange={onChange}
          />
        </>
      )}
    </Dialog>
  );
}
