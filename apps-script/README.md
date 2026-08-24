# The calendar copier

An Apps Script that mirrors the **staging** calendar (the one cowork writes,
`[mtga-meta]` blocks and all) onto the **clean public calendar** that humans
subscribe to and the Worker reads: meta blocks stripped from descriptions, a
named calendar label per category (the script keeps the definitions in the
calendar's `labelProperties`, matching by name so a human recolouring one in
the UI is not fought), and the category in
`extendedProperties.shared.mtgaEventType` where no human ever sees it. That
shared property is the **only** channel the app's feed reads — the
`[mtga-meta]` format never leaves this script. The architecture and its
boundaries are documented in the calendar section of the repo's `CLAUDE.md`;
the guard is `calendar-sync.test.ts` beside this file.

Layout: `calendar-sync/` is exactly what `clasp push` uploads (`Code.js` and
the `appsscript.json` manifest — the manifest is what enables the advanced
Calendar service). `.clasp.json` names the script project; the id is an
address, not a credential. `tsconfig.json` typechecks `Code.js` as JSDoc'd
JavaScript under the Apps Script globals, as part of `npm run build`.

## How it ships

Merges to `main` touching `apps-script/**` run
`.github/workflows/apps-script.yml`, which writes the `CLASPRC_JSON` repo
secret to `~/.clasprc.json` and runs `clasp push --force` — the same
"shipping is a merge" rule as everything else here. Triggers and script
properties live outside the pushed files, so a push never disturbs a running
installation.

clasp is pinned to **2.5.0** (the last 2.x) in the workflow *and* in the
login step below: v3 changed the credential file's shape, so the version that
logs in and the version that pushes must move together.

## One-time bootstrap

1. **Create the script project.** Enable the Apps Script API for the account
   at <https://script.google.com/home/usersettings>, then from `apps-script/`:

   ```bash
   npx @google/clasp@2.5.0 login
   ```

   Create the project (`npx @google/clasp@2.5.0 create --type standalone
   --title "mtga.fyi calendar sync" --rootDir calendar-sync`, or make one in
   the editor) and put its script id in `.clasp.json` in place of the
   placeholder — the workflow skips with a warning until that lands. Push
   once by hand (`npx @google/clasp@2.5.0 push --force`) or merge and let CI
   do it.

2. **Give CI the credential.** Store the contents of `~/.clasprc.json` as the
   `CLASPRC_JSON` GitHub Actions secret. It is an OAuth refresh token on the
   owning Google account — same trust class as the Cloudflare token already
   there. Rotate it if it ever leaks; if Google invalidates it, the symptom
   is a failed Actions run and the previous script keeps running meanwhile.
   (Blast-radius upgrade, any time: create a dedicated Google account, share
   both calendars with it, and mint the token there instead.)

3. **Configure and install, in the script editor.** Project Settings →
   Script Properties:

   | Property | Value |
   | --- | --- |
   | `STAGING_CALENDAR_ID` | the calendar cowork writes — the value the Worker's `GOOGLE_CALENDAR_ID` secret held before the cutover |
   | `TARGET_CALENDAR_ID` | `c3fce5ebd85fb199a59badc1d32c5d2f5b93aa417729aefe00c846db3006423c@group.calendar.google.com` |

   Then run `install()` once (grants the OAuth scopes on first run; creates
   the change trigger on the staging calendar plus an hourly backstop) and
   run `sync()` once as the backfill — the trigger only fires for changes
   made after it exists.

   The consent prompt asks for the granular scopes named in
   `calendar-sync/appsscript.json` — events on calendars *you own*, plus
   calendar properties — rather than full Calendar access. A scope cannot
   name a single calendar, so that is as narrow as Google's model goes
   without a dedicated account; if a permission error ever names a missing
   scope, widen that one line and re-run `install()`.

4. **Verify before repointing anything.**
   - Labels came through: the first `sync()` creates the label definitions
     (`ensureLabels_` refuses loudly if `labelProperties` does not survive a
     write — the labels API is new surface, and its availability on a
     consumer calendar is the one thing this design could not verify from
     documentation), and events on the clean calendar show their label in
     the Google Calendar UI.
   - The clean calendar is public ("See all event details"), and a keyless
     read returns the annotation — with no fallback in the feed this is the
     assumption everything leans on, so check it first:

     ```bash
     curl -s -H "X-goog-api-key: $GOOGLE_API_KEY" "https://www.googleapis.com/calendar/v3/calendars/c3fce5ebd85fb199a59badc1d32c5d2f5b93aa417729aefe00c846db3006423c%40group.calendar.google.com/events?maxResults=3" | grep -o "mtgaEventType"
     ```

   - Point a local `.env` at the clean calendar and `npm run calendar` —
     one entry per typed staging event. (Pointing it at staging is not a
     comparison worth making any more: staging events carry no
     extendedProperties, so the feed refuses the lot.)
   - Labels survive to subscribers: open the calendar from a second account
     or an incognito embed and confirm the label names and colours show.
     (Plain iCal subscribers won't see them at all — known limitation; a
     title prefix would be the fix if it ever matters.)
   - Edit one staging event and watch the clean calendar follow within about
     a minute; delete it and watch the copy disappear.

5. **Repoint production.** `wrangler secret put GOOGLE_CALENDAR_ID` from
   `worker/` (a person's job — agent hooks block it), update the same-named
   GitHub Actions secret the CI calendar refresh uses, then refresh
   `src/data/mtg-calendar.json` (`npm run calendar -- --write`) in its own
   commit.

If the copier ever breaks, the clean calendar goes stale and the feed keeps
serving it — a stale calendar, not an outage, the same shape as any source
being down. There is deliberately no fallback to staging: the feed knows
nothing of `[mtga-meta]`, so staging is not a calendar it can read, and the
fix is fixing the copier.
