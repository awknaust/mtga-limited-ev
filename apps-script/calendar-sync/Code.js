/**
 * The calendar copier: the staging calendar in, the clean public one out.
 *
 * Cowork parses the Wizards schedule into a staging calendar, but its
 * connector cannot set event colours or extendedProperties, so its category
 * annotation rides as an `[mtga-meta]` block in each description. This script
 * mirrors staging onto the calendar humans subscribe to and the Worker reads:
 * the meta block is stripped from the text, the category becomes an event
 * colour and `extendedProperties.shared.mtgaEventType`, and the staging
 * event's id rides along as `mtgaSourceId` — the key the reconcile diffs on.
 *
 * This file is a deliberate *port* of rules whose home is the repository —
 * the meta regex and strip order from `scripts/calendar/feed.ts`, the closed
 * type set from `src/lib/calendarEventTypes.ts` — because Apps Script cannot
 * import repo modules. `../calendar-sync.test.ts` holds the port to the
 * originals: everything above the "Apps Script services" marker is pure and
 * is evaluated by that test under Node, so edit either side and the build
 * says whether they still agree.
 *
 * Deployment is `clasp push` from `.github/workflows/apps-script.yml`, on
 * merges to main only. Triggers and script properties live outside the
 * pushed files (see `install` and `config_`), so a push never disturbs a
 * running installation.
 */

/**
 * One colour per category — the human-facing half of what the app's strip
 * does with lanes. Keys are the closed set in `src/lib/calendarEventTypes.ts`,
 * and the guard test fails the build the moment the two disagree in either
 * direction. Values are Google's fixed event-colour palette (colorId 1–11),
 * one each, so no two categories read as one.
 *
 * @type {Record<string, string>}
 */
const COLOR_BY_TYPE = {
  contender_draft: "9", // Blueberry
  flashback_draft: "1", // Lavender
  other_draft: "7", // Peacock
  cube: "3", // Grape
  qualifier: "11", // Tomato
  arena_direct: "6", // Tangerine
  limited_open: "5", // Banana
  set_release: "10", // Basil
};

/**
 * The reconcile window. It must stay a superset of the feed's fetch window
 * (−31/+120 days in `scripts/calendar/fetch.ts`): the app reads the clean
 * calendar, so any day the feed can ask about must be a day this script keeps
 * mirrored. Wider on both sides deliberately — at the far edge a staging
 * event drifting across a shared boundary would be deleted and re-created on
 * consecutive runs, and humans scroll further ahead than the strip draws; at
 * the near edge, events older than this fall out of management and simply
 * remain on the clean calendar as history, since the copier deletes only what
 * it still lists.
 */
const COPY_BACK_DAYS = 60;
const COPY_AHEAD_DAYS = 365;

/**
 * The named entities this port decodes, alongside numeric references. The
 * app-side strip leans on the `entities` package for the full vocabulary; up
 * here the text is headed for human eyes rather than a parser, so a rare name
 * surviving literally is ugly rather than wrong — with one exception that
 * matters: `&quot;`/`&#39;`, which Google's UI writes into an HTML-ified
 * description and without which the meta block's JSON cannot be read. The
 * guard test pins parity with `feed.ts` on exactly those cases.
 *
 * @type {Record<string, string>}
 */
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  deg: "°",
  times: "×",
  trade: "™",
  copy: "©",
};

/**
 * A description reduced to one line of text: tags stripped while entities are
 * still encoded, then one decoding pass — the same order as `stripHtml` in
 * `feed.ts` and for the same reason: an escaped entity in the source
 * (`&amp;lt;`) must survive as the text it was rather than decode twice into
 * a tag.
 *
 * @param {string} html
 * @returns {string}
 */
function stripHtmlText(html) {
  const decoded = html
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,30}));/g,
      (match, dec, hex, name) => {
        if (dec !== undefined) {
          const cp = Number(dec);
          return cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
        }
        if (hex !== undefined) {
          const cp = parseInt(hex, 16);
          return cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
        }
        return Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : match;
      },
    );
  return decoded.replace(/\s+/g, " ").trim();
}

/** The machine-readable block, exactly as `feed.ts` matches it. */
const META_RE = /\[mtga-meta\](.*?)\[\/mtga-meta\]/g;

/**
 * The block's `eventType`, or null when no block names one on the closed set.
 * Same verdict semantics as `readEventType` in `feed.ts`: the first block
 * naming a recognised token wins, unreadable blocks and unknown tokens are
 * passed over, and null means the event is dropped whole — the clean calendar
 * carries no lane-less events for the same reason the strip draws none.
 *
 * @param {string} text
 * @returns {string | null}
 */
function readEventTypeFrom(text) {
  for (const match of text.matchAll(META_RE)) {
    try {
      const meta = JSON.parse(match[1]);
      if (typeof meta === "object" && meta !== null) {
        const type = /** @type {Record<string, unknown>} */ (meta).eventType;
        if (typeof type === "string") {
          const token = type.trim();
          if (Object.prototype.hasOwnProperty.call(COLOR_BY_TYPE, token)) return token;
        }
      }
    } catch {
      // Fall through to the next block, if any.
    }
  }
  return null;
}

/**
 * The description a human gets: the staging text with every meta block
 * removed and whitespace collapsed. No length cap — `feed.ts` caps its copy
 * at 200 characters because that copy is a tooltip; this one is the event a
 * subscriber opens.
 *
 * @param {string} text
 * @returns {string}
 */
function cleanDescription(text) {
  return text.replace(META_RE, " ").replace(/\s+/g, " ").trim();
}

/** @typedef {{ date?: string, dateTime?: string, timeZone?: string }} EventTime */

/**
 * A start/end copied through with nothing added: an all-day event stays a
 * bare date, a timed one keeps its instant and zone. Anything else is null.
 *
 * @param {GoogleAppsScript.Calendar.Schema.EventDateTime | undefined} at
 * @returns {EventTime | null}
 */
function timeOf(at) {
  if (at === undefined) return null;
  if (typeof at.date === "string" && at.date !== "") return { date: at.date };
  if (typeof at.dateTime === "string" && at.dateTime !== "") {
    return typeof at.timeZone === "string" && at.timeZone !== ""
      ? { dateTime: at.dateTime, timeZone: at.timeZone }
      : { dateTime: at.dateTime };
  }
  return null;
}

/**
 * A staging row narrowed to what the copier reads, or null for a row it
 * cannot — the same skips as `extractEvents` in `google.ts` (no id, no
 * title, no readable times), because a calendar collects odd entries and one
 * of them is not a reason to stop mirroring.
 *
 * @param {GoogleAppsScript.Calendar.Schema.Event} event
 * @returns {{ id: string, summary: string, start: EventTime, end: EventTime, text: string } | null}
 */
function candidateOf(event) {
  if (event.status === "cancelled") return null;
  if (typeof event.id !== "string" || event.id === "") return null;
  if (typeof event.summary !== "string" || event.summary.trim() === "") return null;
  const start = timeOf(event.start);
  const end = timeOf(event.end);
  if (start === null || end === null) return null;
  return {
    id: event.id,
    summary: event.summary.trim(),
    start,
    end,
    text: typeof event.description === "string" ? stripHtmlText(event.description) : "",
  };
}

/**
 * What the clean calendar should hold for one staging row. Three answers,
 * mirroring the feed's reading of the same rows: null for a row that is not
 * a candidate at all; `{ sourceId, body: null }` for a candidate whose
 * annotation is missing, unreadable or off the list — dropped whole, at the
 * cost of one entry; and a full body to insert or patch. The gap between the
 * first two is what the all-untyped refusal in `reconcile_` counts.
 *
 * @param {GoogleAppsScript.Calendar.Schema.Event} event
 * @returns {{ sourceId: string, body: GoogleAppsScript.Calendar.Schema.Event | null } | null}
 */
function desiredFor(event) {
  const row = candidateOf(event);
  if (row === null) return null;
  const type = readEventTypeFrom(row.text);
  if (type === null) return { sourceId: row.id, body: null };
  return {
    sourceId: row.id,
    body: {
      summary: row.summary,
      description: cleanDescription(row.text),
      start: row.start,
      end: row.end,
      colorId: COLOR_BY_TYPE[type],
      extendedProperties: { shared: { mtgaEventType: type, mtgaSourceId: row.id } },
    },
  };
}

/**
 * Whether two starts or ends name the same point on the calendar. Whole days
 * compare as the bare date; instants compare as epoch millis, deliberately
 * ignoring the `timeZone` field and the offset's spelling — Google re-renders
 * both, and patching over a rendering is the churn `differs` exists to avoid.
 *
 * @param {GoogleAppsScript.Calendar.Schema.EventDateTime | undefined} a
 * @param {GoogleAppsScript.Calendar.Schema.EventDateTime | undefined} b
 * @returns {boolean}
 */
function timesEqual(a, b) {
  if (a === undefined || b === undefined) return a === b;
  if (typeof a.date === "string" || typeof b.date === "string") return a.date === b.date;
  if (typeof a.dateTime === "string" && typeof b.dateTime === "string") {
    return new Date(a.dateTime).getTime() === new Date(b.dateTime).getTime();
  }
  return false;
}

/**
 * Whether a managed field moved, with absent read as empty. Only the fields
 * this script writes are compared, so anything Google adds to its copy — id,
 * etag, creator, sequence — never reads as a difference.
 *
 * @param {GoogleAppsScript.Calendar.Schema.Event} body
 * @param {GoogleAppsScript.Calendar.Schema.Event} existing
 * @returns {boolean}
 */
function differs(body, existing) {
  const wantShared = (body.extendedProperties && body.extendedProperties.shared) || {};
  const haveShared = (existing.extendedProperties && existing.extendedProperties.shared) || {};
  return (
    (existing.summary || "") !== (body.summary || "") ||
    (existing.description || "") !== (body.description || "") ||
    (existing.colorId || "") !== (body.colorId || "") ||
    haveShared.mtgaEventType !== wantShared.mtgaEventType ||
    !timesEqual(body.start, existing.start) ||
    !timesEqual(body.end, existing.end)
  );
}

// ---------------------------------------------------------------------------
// Apps Script services. Nothing below here is evaluated by the guard test.

/**
 * One page's size and how many pages before refusing — the same
 * belt-and-braces as `fetch.ts`: 2500 is far above a calendar of Arena
 * events, so still paging after four is a broken source, not a big one, and
 * mirroring a truncation would delete real events from the clean calendar.
 */
const PAGE_SIZE = 2500;
const MAX_PAGES = 4;

/**
 * The two calendar ids, from Script Properties (Project Settings → Script
 * Properties; see ../README.md). Properties rather than code, so the pushed
 * files never carry an id and re-pointing needs no deploy.
 *
 * @returns {{ stagingId: string, targetId: string }}
 */
function config_() {
  const props = PropertiesService.getScriptProperties();
  const stagingId = props.getProperty("STAGING_CALENDAR_ID");
  const targetId = props.getProperty("TARGET_CALENDAR_ID");
  if (stagingId === null || stagingId === "" || targetId === null || targetId === "") {
    throw new Error(
      "calendar-sync: set STAGING_CALENDAR_ID and TARGET_CALENDAR_ID in Script Properties",
    );
  }
  return { stagingId, targetId };
}

/**
 * The advanced Calendar service, which `appsscript.json` enables — but a
 * copy of this project made without that manifest would find the global
 * missing, so say what is wrong rather than throw a ReferenceError.
 */
function eventsService_() {
  const events = typeof Calendar === "undefined" || Calendar === undefined
    ? undefined
    : Calendar.Events;
  if (events === undefined) {
    throw new Error("calendar-sync: the Calendar advanced service is not enabled");
  }
  return events;
}

/**
 * Every event in the window, across pages. `nextPageToken` is the only
 * completeness signal there is — a short page is not evidence there is no
 * more — so the cursor is followed until it stops, and running past the page
 * bound throws rather than reconciles against half a calendar.
 *
 * @param {ReturnType<typeof eventsService_>} events
 * @param {string} calendarId
 * @param {string} timeMin
 * @param {string} timeMax
 * @returns {GoogleAppsScript.Calendar.Schema.Event[]}
 */
function listWindow_(events, calendarId, timeMin, timeMax) {
  /** @type {GoogleAppsScript.Calendar.Schema.Event[]} */
  const rows = [];
  /** @type {string | undefined} */
  let pageToken;
  for (let page = 0; page < MAX_PAGES; page++) {
    const reply = events.list(calendarId, {
      timeMin,
      timeMax,
      // Instances rather than RRULEs, mirroring fetch.ts, so nothing here
      // has to understand recurrence; each instance is its own source id.
      singleEvents: true,
      showDeleted: false,
      maxResults: PAGE_SIZE,
      ...(pageToken === undefined ? {} : { pageToken }),
    });
    if (reply.items !== undefined) rows.push(...reply.items);
    if (typeof reply.nextPageToken !== "string" || reply.nextPageToken === "") return rows;
    pageToken = reply.nextPageToken;
  }
  throw new Error(
    `calendar-sync: ${calendarId} still paging after ${MAX_PAGES} pages (${rows.length} events)`,
  );
}

/**
 * One full pass: staging read, desired state computed, target diffed by
 * `mtgaSourceId`, and only then written. The order matters — the refusal
 * below fires before the first mutation, so a broken annotation scheme
 * leaves the clean calendar exactly as it was, the same way the Worker keeps
 * serving yesterday's KV value.
 *
 * Target events without a `mtgaSourceId` are invisible to all of this: an
 * event a human added to the clean calendar by hand is not something the
 * copier may touch. Duplicate copies of one source — possible only after a
 * crash between an insert and the next read — collapse to the first, and the
 * extras are removed.
 */
function reconcile_() {
  const { stagingId, targetId } = config_();
  const events = eventsService_();
  const timeMin = new Date(Date.now() - COPY_BACK_DAYS * 864e5).toISOString();
  const timeMax = new Date(Date.now() + COPY_AHEAD_DAYS * 864e5).toISOString();

  const staging = listWindow_(events, stagingId, timeMin, timeMax);
  let candidates = 0;
  /** @type {Map<string, GoogleAppsScript.Calendar.Schema.Event>} */
  const desired = new Map();
  for (const row of staging) {
    const want = desiredFor(row);
    if (want === null) continue;
    candidates++;
    if (want.body !== null) desired.set(want.sourceId, want.body);
  }

  // The feed's refusal, mirrored: every candidate arriving untyped at once is
  // the annotation scheme broken, not a quiet week. An empty window, by
  // contrast, is a real state and propagates — deletes included.
  if (candidates > 0 && desired.size === 0) {
    throw new Error(
      `calendar-sync: ${candidates} staging events, none carrying a recognised ` +
        "[mtga-meta] eventType — refusing to touch the clean calendar",
    );
  }

  /** @type {Map<string, GoogleAppsScript.Calendar.Schema.Event>} */
  const managed = new Map();
  /** @type {GoogleAppsScript.Calendar.Schema.Event[]} */
  const extras = [];
  for (const row of listWindow_(events, targetId, timeMin, timeMax)) {
    const sourceId =
      row.extendedProperties && row.extendedProperties.shared
        ? row.extendedProperties.shared.mtgaSourceId
        : undefined;
    if (typeof sourceId !== "string" || sourceId === "") continue;
    if (managed.has(sourceId)) extras.push(row);
    else managed.set(sourceId, row);
  }

  let created = 0;
  let patched = 0;
  let deleted = 0;
  for (const [sourceId, body] of desired) {
    const existing = managed.get(sourceId);
    if (existing === undefined) {
      events.insert(body, targetId);
      created++;
    } else if (typeof existing.id === "string" && differs(body, existing)) {
      events.patch(body, targetId, existing.id);
      patched++;
    }
  }
  for (const [sourceId, row] of managed) {
    if (!desired.has(sourceId) && typeof row.id === "string") {
      events.remove(targetId, row.id);
      deleted++;
    }
  }
  for (const row of extras) {
    if (typeof row.id === "string") {
      events.remove(targetId, row.id);
      deleted++;
    }
  }

  console.log(
    JSON.stringify({
      event: "reconciled",
      staging: staging.length,
      candidates,
      desired: desired.size,
      created,
      patched,
      deleted,
    }),
  );
}

/**
 * The handler both triggers point at. The calendar trigger carries no
 * payload — it says *that* something changed, never what — so there is
 * nothing to be smarter with than a full pass; the lock is what turns a
 * burst of firings from a batch edit into consecutive runs rather than
 * interleaved ones. A run is seconds, so two minutes outwaits any burst,
 * and timing out throws — which lands in the trigger-failure email like
 * every other error here.
 */
function sync() {
  const lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    reconcile_();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Run once by hand after the script properties are set: replaces this
 * project's triggers with the two the copier needs — change on the staging
 * calendar, and an hourly backstop for anything a trigger outage misses.
 * Idempotent, so re-running after changing STAGING_CALENDAR_ID re-points the
 * calendar trigger. The trigger only fires for changes made after it exists;
 * running `sync` once by hand is the backfill.
 */
function install() {
  const { stagingId } = config_();
  for (const trigger of ScriptApp.getProjectTriggers()) {
    ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger("sync").forUserCalendar(stagingId).onEventUpdated().create();
  ScriptApp.newTrigger("sync").timeBased().everyHours(1).create();
}
