/**
 * The tabs of the results panel, in the order they answer the page's
 * questions: what a balance does over a run, what one entry is worth, how the
 * events compare, what the pass pays, and then how all of it is worked out.
 *
 * A module of its own, with no DOM in it, so that what needs the list without
 * the panel — the page title in App, the sitemap test — can have it without
 * importing the components. It is still the one place tabs are named: the
 * tab strip renders from it and the title takes its label from it, so a tab
 * added or renamed here is added or renamed everywhere at once. `Tab` itself
 * belongs to state.ts, since the key is part of what a link carries; `satisfies`
 * holds every key here to one that grammar knows.
 */

import type { Tab } from "./state";

export const RESULT_TABS = [
  { key: "bankroll" as const, label: "Bankroll" },
  { key: "event" as const, label: "Expected value" },
  { key: "compare" as const, label: "Compare" },
  { key: "mastery" as const, label: "Mastery" },
  { key: "about" as const, label: "About" },
] satisfies readonly { key: Tab; label: string }[];
