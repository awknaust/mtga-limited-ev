import { useRef } from "react";

/**
 * A tab strip, wired for assistive tech and the keyboard.
 *
 * Hand-rolled rather than Bootstrap's tab plugin: the panels are React state
 * already, and letting the plugin toggle classes on nodes React owns is the
 * fight the D3 charts avoid by the same reasoning. What the plugin does give
 * you for free is the ARIA and the arrow keys, so those are here instead —
 * `role="tab"` alone tells a screen reader a tab exists and nothing about what
 * it controls.
 *
 * Selection follows focus, which is the expected behaviour when switching a
 * panel is cheap. The panel ids come from `panelId` so the caller can label
 * its own panel with the matching `tabId`.
 */

export const tabId = (group: string, key: string): string => `${group}-tab-${key}`;
export const panelId = (group: string, key: string): string => `${group}-panel-${key}`;

export function Tabs<K extends string>({
  group,
  items,
  active,
  onSelect,
  label,
  variant = "tabs",
  trailing,
}: {
  /** Prefix for the generated ids; must be unique on the page. */
  group: string;
  items: readonly { key: K; label: string }[];
  active: K;
  onSelect: (key: K) => void;
  /** Names the strip itself, since the tabs only name themselves. */
  label: string;
  /**
   * Segmented is the secondary form, for a strip inside a panel: a pill
   * track that shows every option as the button it is, where Bootstrap's
   * pills leave the inactive ones looking like hyperlinks.
   */
  variant?: "tabs" | "segmented";
  /** Anything to sit at the far end of the strip, such as a caption. */
  trailing?: React.ReactNode;
}) {
  const refs = useRef(new Map<K, HTMLButtonElement | null>());

  const step = (delta: number) => {
    const from = items.findIndex((i) => i.key === active);
    // -1 (nothing selected) steps to the first tab rather than the last.
    const next = items[(Math.max(0, from) + delta + items.length) % items.length];
    if (!next) return;
    onSelect(next.key);
    refs.current.get(next.key)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const jump: Record<string, () => void> = {
      ArrowRight: () => step(1),
      ArrowLeft: () => step(-1),
      Home: () => step(-items.length),
      End: () => step(items.length - 1),
    };
    const move = jump[e.key];
    if (!move) return;
    e.preventDefault();
    move();
  };

  return (
    <ul className={`nav nav-${variant} mb-3`} role="tablist" aria-label={label}>
      {items.map((item) => (
        // Bootstrap's list markup is not part of the tab pattern, so the li
        // steps out of the way rather than sitting in the tablist as a
        // listitem.
        <li className="nav-item" key={item.key} role="presentation">
          <button
            ref={(el) => {
              refs.current.set(item.key, el);
            }}
            type="button"
            role="tab"
            id={tabId(group, item.key)}
            aria-controls={panelId(group, item.key)}
            aria-selected={active === item.key}
            // One tab stop for the strip; the arrow keys move within it.
            tabIndex={active === item.key ? 0 : -1}
            className={`nav-link ${active === item.key ? "active" : ""}`}
            onClick={() => onSelect(item.key)}
            onKeyDown={onKeyDown}
          >
            {item.label}
          </button>
        </li>
      ))}
      {trailing ? (
        <li className="ms-auto d-flex align-items-center" role="presentation">
          {trailing}
        </li>
      ) : null}
    </ul>
  );
}

/** The panel a `Tabs` strip controls. Pairs with the tab of the same key. */
export function TabPanel({
  group,
  active,
  labelled = true,
  children,
}: {
  group: string;
  active: string;
  /**
   * False where the strip has been left out because there was only ever one
   * choice. The content is then just content: labelling it as a panel would
   * point `aria-labelledby` at a tab that was never rendered.
   */
  labelled?: boolean;
  children: React.ReactNode;
}) {
  if (!labelled) return <>{children}</>;
  return (
    <div
      role="tabpanel"
      id={panelId(group, active)}
      aria-labelledby={tabId(group, active)}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
