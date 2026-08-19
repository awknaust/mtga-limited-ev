/**
 * The document title, derived from the same state the link is.
 *
 * A title has two jobs here and they pull apart. In a browser tab strip it is
 * a name, clipped to a couple of dozen characters, and what has to survive is
 * whatever tells one open tab from another. In a search result it is the
 * site's own heading, and what has to survive is what the site is.
 *
 * The default state gets the second and every other state gets the first. The
 * gate is the encoded query being empty, which is exactly the bare origin: the
 * URL a crawler fetches and a first visit lands on, where the title should say
 * what this is rather than name whichever preset happens to be selected. A
 * query string was written by somebody choosing something, and they are the
 * one with two tabs open.
 *
 * Pure, like `share.ts`. App.tsx owns the assignment to `document.title`.
 */

import type { Tab } from "./state";

/** The site's name, as it appears in the title, the heading and the notice. */
export const SITE_NAME = "mtga.fyi";

/**
 * What a bare load is called.
 *
 * Deliberately the opposite order to every other title here: the name leads,
 * and the descriptor follows for the benefit of anyone meeting the site in a
 * list of search results, where `mtga.fyi` alone says nothing about what is
 * behind it. The reversal below is for a tab strip, which clips the end and so
 * has to be given what differs first; the bare origin is one page with nothing
 * to be told apart from.
 *
 * `index.html` carries this string too, since it is the title before any
 * script runs and the one a crawler is served. `title.compat.test.ts` is what
 * keeps the two copies saying the same thing.
 */
export const SITE_TITLE = `${SITE_NAME} | MTGA Value`;

/*
 * The tabs whose answer is about a single event, and so the ones worth
 * spending title characters naming it in. Compare draws several at once and
 * naming one of them would be picking a favourite the tab does not have;
 * Mastery prices a season rather than an event; About is about neither.
 */
const NAMES_THE_EVENT: readonly Tab[] = ["bankroll", "event"];

/**
 * The title for a given state.
 *
 * `tabLabel` is passed in rather than looked up here so that the tab strip
 * stays the one place tabs are named, and `isDefault` is the caller's answer
 * to "is the query string empty", since that is a fact about the link rather
 * than about the title.
 *
 * Ordering is what makes this work in a tab strip: the event first, because it
 * is what differs between two tabs somebody opened to compare two events, then
 * the view, then the site. Clipping takes the site name off first, which is
 * the part every tab shares and the part the reader can already see in the
 * address bar.
 */
export const pageTitle = ({
  tab,
  tabLabel,
  eventName,
  isDefault,
}: {
  tab: Tab;
  tabLabel: string;
  eventName: string;
  isDefault: boolean;
}): string => {
  if (isDefault) return SITE_TITLE;
  const lead = NAMES_THE_EVENT.includes(tab)
    ? `${eventName} · ${tabLabel}`
    : tabLabel;
  return `${lead} | ${SITE_NAME}`;
};
