import { CUSTOM_PRESET } from "../lib";
import { normalizeCompare } from "../share";
import { MultiSelect, type MultiSelectGroup } from "./MultiSelect";
import { COMPARE_GROUPS, compareSeries } from "./compareSeries";

/**
 * The Compare tab's event picker: the dropdown, and the selection spelled out
 * beneath it as chips.
 *
 * The chips are not decoration and not a duplicate of the dropdown. They are
 * the chart's legend — each carries its event's own line colour — so the reader
 * matches a curve to a name without opening anything, and drops one without
 * opening anything either. That is why they sit outside the panel.
 *
 * Every change is normalised on the way out, so the selection stays a set in
 * `PRESETS` order however it was assembled. Without that, toggling an event off
 * and back on would move its line to the end of the chart and rewrite the link
 * for no change in meaning.
 */
export function CompareSelector({
  selection,
  onChange,
  presetName,
}: {
  selection: string[];
  onChange: (next: string[]) => void;
  /** The sidebar's event, so a hand-edited ladder can be offered as a choice. */
  presetName: string;
}) {
  /*
   * "Custom" is offered only while the sidebar is actually on a custom event,
   * because it names that config rather than a preset — with a preset selected
   * there is no such ladder to draw, and an option that quietly meant "whatever
   * the sidebar last was" would be a different event on each visit.
   */
  const groups: MultiSelectGroup<string>[] = [
    ...(presetName === CUSTOM_PRESET
      ? [{ label: "Your event", options: [{ key: CUSTOM_PRESET, label: "Custom" }] }]
      : []),
    ...COMPARE_GROUPS.map((g) => ({
      label: g.label,
      options: g.names.map((name) => ({ key: name, label: name })),
    })),
  ];

  const summary =
    selection.length === 0
      ? "No events"
      : selection.length === 1
        ? selection[0]
        : `${selection.length} events`;

  return (
    <div className="mb-3">
      <MultiSelect
        label="Events to compare"
        groups={groups}
        selected={selection}
        onChange={(next) => onChange(normalizeCompare(next))}
        summary={summary}
      />
      {selection.length > 0 && (
        <ul className="compare-chips" aria-label="Selected events">
          {selection.map((name) => {
            const series = compareSeries(name);
            return (
              <li key={name}>
                <button
                  type="button"
                  className={`compare-chip ${series.colorClass}`}
                  aria-label={`Remove ${name}`}
                  onClick={() => onChange(selection.filter((n) => n !== name))}
                >
                  <span className="compare-chip-swatch" aria-hidden="true" />
                  {name}
                  <i className="bi bi-x" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
