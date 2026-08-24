/**
 * The closed set of categories a calendar event may carry, and the one place
 * it is written down.
 *
 * Every event's description holds an `[mtga-meta]` block naming one of these
 * as its `eventType` (see `scripts/calendar/feed.ts`), and the strip lanes
 * and colours by it. The set is closed on purpose: **an event whose type is
 * missing or not on this list is dropped whole at every parse point** —
 * untyped events are not possible — so a typo in the calendar loses one entry
 * rather than inventing a lane, and adding a category is a deliberate change
 * here, not a side effect of an edit in Google Calendar.
 *
 * Shared by the feed builder (which the Worker deploys) and the app's own
 * validator, so the two can never disagree about what a type is. Keep this
 * module dependency-free for that reason — it is imported from both sides of
 * the repository.
 */
export const EVENT_TYPES = [
  /** Contender Draft. */
  "contender_draft",
  /** Flashback Draft. */
  "flashback_draft",
  /** Any other draft — Premier, Mixed-Up, and the like. */
  "other_draft",
  /** Arena Powered Cube. */
  "cube",
  /** Qualifier Play-Ins and Qualifier Weekends, any format. */
  "qualifier",
  /** Arena Direct. */
  "arena_direct",
  /** Limited Open and similar cash/prize Limited tournaments. */
  "limited_open",
  /**
   * A set arriving on Arena. The one type the strip singles out: a release
   * is drawn as a dated rule across the whole plot rather than a bar in a
   * lane — see MARKER_TYPE in `calendarLayout.ts`.
   */
  "set_release",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const isEventType = (value: string): value is EventType =>
  (EVENT_TYPES as readonly string[]).includes(value);
