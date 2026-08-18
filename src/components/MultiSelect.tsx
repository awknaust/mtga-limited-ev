import { useEffect, useId, useRef, useState } from "react";

/**
 * A dropdown that picks several things at once, wired for assistive tech and
 * the keyboard.
 *
 * Hand-rolled for the reason `Tabs` is: the panel's contents are React state
 * already, and letting Bootstrap's dropdown plugin toggle classes on nodes
 * React owns is the fight the D3 charts avoid by the same reasoning. What a
 * plugin would have given for free is the ARIA and the arrow keys, so those are
 * here instead — and a multi-select needs listbox semantics the dropdown plugin
 * does not carry anyway.
 *
 * Not `PickerDialog`, which is the other "choose from a grouped list" control
 * here. That one is a modal `<dialog>` with a backdrop and a focus trap, right
 * for a picker buried inside a payout cell inside another dialog, and far too
 * heavy for a control that sits at the top of a tab and gets opened constantly.
 *
 * **Selection does not follow focus**, which is the opposite of `Tabs`. There,
 * switching a panel is cheap and instant feedback is the point; here an arrow
 * key that toggled as it moved would make it impossible to walk the list and
 * pick the fourth item. Arrows move, Space and Enter commit.
 *
 * **Toggling never closes the panel.** Picking several things is the entire
 * purpose, and a control that shuts after each one turns choosing four events
 * into four round trips.
 */

export type MultiSelectGroup<K extends string> = {
  label: string;
  options: readonly { key: K; label: string }[];
};

export function MultiSelect<K extends string>({
  label,
  groups,
  selected,
  onChange,
  summary,
  triggerClassName = "form-select text-start",
}: {
  /** Names the trigger and the listbox; neither names itself. */
  label: string;
  groups: readonly MultiSelectGroup<K>[];
  selected: readonly K[];
  onChange: (next: K[]) => void;
  /** What the closed trigger reads. */
  summary: React.ReactNode;
  triggerClassName?: string;
}) {
  const uid = useId();
  const listId = `${uid}-listbox`;
  const optionId = (key: string) => `${uid}-option-${key}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLDivElement>(null);

  // One flat list beside the grouped one: the groups are how the options are
  // presented, and the arrow keys move through them as though they were not
  // there. Every index below is into this.
  const flat = groups.flatMap((g) => g.options);
  const chosen = new Set<string>(selected);

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };

  const openPanel = () => {
    // Land on something already chosen where there is one, so opening the panel
    // starts where the reader left off rather than at the top of a long list.
    const first = flat.findIndex((o) => chosen.has(o.key));
    setActive(first === -1 ? 0 : first);
    setOpen(true);
  };

  // Focus moves into the listbox once it exists, which is the commit after
  // `open` flips rather than the handler that flipped it.
  useEffect(() => {
    if (open) listbox.current?.focus();
  }, [open]);

  /*
   * A pointer landing outside closes the panel. On pointerdown rather than
   * click, so a press that begins outside dismisses without also having to
   * complete there, and capture so it is heard before anything inside the page
   * stops it.
   *
   * The trigger is inside `root`, so its own press is not treated as an outside
   * one — it toggles, and would otherwise close here and reopen there.
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const toggle = (key: K) => {
    const next = chosen.has(key) ? selected.filter((k) => k !== key) : [...selected, key];
    onChange([...next]);
  };

  /*
   * From the previous value rather than the one this render closed over, so a
   * burst of keys arriving in one batch steps once per key. Reading `active`
   * here instead would have every handler in the batch start from the same
   * index and the last one win.
   */
  const move = (step: (from: number) => number) => {
    if (flat.length === 0) return;
    setActive((from) => {
      const to = step(from);
      return ((to % flat.length) + flat.length) % flat.length;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move((i) => i + 1),
      ArrowUp: () => move((i) => i - 1),
      Home: () => move(() => 0),
      End: () => move(() => flat.length - 1),
      Escape: () => close(true),
      Enter: () => flat[active] && toggle(flat[active].key),
      " ": () => flat[active] && toggle(flat[active].key),
    };
    const run = keys[e.key];
    if (!run) return;
    // Space scrolls the page and Enter submits a form; neither is wanted from
    // inside a listbox, and Escape must not reach a dialog above this one.
    e.preventDefault();
    e.stopPropagation();
    run();
  };

  /*
   * Tabbing out of the panel closes it, which is what a disclosure is expected
   * to do. `relatedTarget` is where focus is going: null when it leaves the
   * document entirely, which is not a reason to close — switching windows and
   * coming back should find the panel as it was left.
   */
  const onBlur = (e: React.FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && !root.current?.contains(to)) setOpen(false);
  };

  return (
    <div className="multiselect" ref={root} onBlur={onBlur}>
      <button
        ref={trigger}
        type="button"
        className={`multiselect-trigger ${triggerClassName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => (open ? close(false) : openPanel())}
        onKeyDown={(e) => {
          // The arrows open the panel from the trigger, as a select does.
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          openPanel();
        }}
      >
        {summary}
      </button>

      {open && (
        <div className="multiselect-panel">
          <div className="multiselect-actions">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => onChange(flat.map((o) => o.key))}
            >
              All
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => onChange([])}
            >
              None
            </button>
          </div>
          <div
            ref={listbox}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            aria-activedescendant={flat[active] ? optionId(flat[active].key) : undefined}
            tabIndex={0}
            className="multiselect-list"
            onKeyDown={onKeyDown}
          >
            {groups.map((group) => (
              <div key={group.label} role="group" aria-label={group.label}>
                {/* The group's own label is on the group, so this is decoration
                    and must not be read a second time as an option. */}
                <div className="multiselect-group-label" aria-hidden="true">
                  {group.label}
                </div>
                {group.options.map((option) => {
                  const isActive = flat[active]?.key === option.key;
                  const isChosen = chosen.has(option.key);
                  return (
                    <div
                      key={option.key}
                      id={optionId(option.key)}
                      role="option"
                      aria-selected={isChosen}
                      className={`multiselect-option${isActive ? " is-active" : ""}`}
                      // The listbox owns the keyboard, so the option needs no
                      // tab stop of its own — this is the pointer's way in.
                      onClick={() => {
                        setActive(flat.findIndex((o) => o.key === option.key));
                        toggle(option.key);
                      }}
                    >
                      <i
                        className={`bi ${isChosen ? "bi-check-square" : "bi-square"}`}
                        aria-hidden="true"
                      />
                      <span>{option.label}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
