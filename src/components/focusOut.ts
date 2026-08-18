/**
 * Whether a `focusout` is focus genuinely leaving a control, or only letting
 * go of it.
 *
 * A popover that closes when focus leaves has to tell those two apart, and the
 * obvious test — "did focus land outside my root?" — gets it wrong on Safari,
 * which is what broke the Compare tab's All and None buttons on an iPad.
 * Safari does not move focus to a `<button>` when it is tapped, so focus falls
 * back to the document body; `relatedTarget` is then the body, which is
 * outside the control by any reading, and the panel closed before the tap's
 * `click` could reach the button that was no longer there. Every tap on those
 * two buttons did nothing at all.
 *
 * The options escaped it because they are not focusable — a `role="option"`
 * div never takes focus from the listbox, so tapping one fires no `focusout`.
 * That is why the report was about those two buttons specifically and not
 * about the control.
 *
 * So: the body and the document element are *nowhere*, not somewhere else, and
 * neither is a null `relatedTarget` — which is what Chrome reports for the same
 * situation, and what a browser reports when focus leaves the page entirely.
 * A control is only really left when focus lands on some other element that can
 * hold it. Pointer dismissal does not rely on any of this: a press outside is
 * caught on `pointerdown` at the document, which is the reliable path and the
 * one that closes the panel when someone taps the page. This test is only what
 * makes tabbing out close it too.
 *
 * Structurally typed rather than taking `Node` and `Document`, so it is
 * testable in a suite that has no DOM — which is every suite here.
 */
export function focusLeftControl(
  /** `FocusEvent.relatedTarget`: where focus is going, if anywhere. */
  to: Node | null,
  /** The control's root; null once it has unmounted. */
  root: { contains(node: Node): boolean } | null,
  /** The document, for the two nodes that mean "nowhere". */
  doc: { body: Node | null; documentElement: Node | null },
): boolean {
  if (to === null || to === doc.body || to === doc.documentElement) return false;
  return root !== null && !root.contains(to);
}
