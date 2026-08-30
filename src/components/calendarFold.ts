/**
 * Whether the calendar strip mounts open or folded.
 *
 * Folded is the default: the strip is a glance, and the folded row already
 * answers it. Only an explicit open — the stored "0" the strip's own toggle
 * writes — is remembered as one, and even that is honoured only on a bare
 * visit. A page opened on a URL that already carries a query is a share link,
 * or a reload of an edited page, and its subject is the numbers the query
 * spells out; the calendar unfolding above them on arrival pushes that
 * subject down the page for a preference the link never expressed. A fold
 * changes nothing about what the numbers mean — which is exactly why it rides
 * in localStorage rather than the URL, and why the URL's presence wins over
 * the memory here rather than the other way round.
 *
 * Pure and fed strings like `focusLeftControl` is fed nodes, and for the same
 * reason: this suite has no DOM, so what is tested is the decision, with the
 * component owning the one localStorage read that feeds it.
 */
export function calendarStartsOpen(
  /** What localStorage holds for the collapse key; "0" is a remembered open. */
  stored: string | null,
  /** Whether the page was opened on a URL already carrying a query. */
  arrivedOnShareLink: boolean,
): boolean {
  return !arrivedOnShareLink && stored === "0";
}
