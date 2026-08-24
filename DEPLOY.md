# Deploying

The app is a static client-side bundle on Cloudflare Pages, plus one Cloudflare
Worker that serves the two data feeds from KV on the same origin. Both ship from
`.github/workflows/deploy.yml`; nothing deploys from a laptop.

## Architecture

```mermaid
flowchart LR
  subgraph gh["GitHub Actions (deploy.yml)"]
    test["test: npm ci → refresh feeds → npm test → npm run build"]
    pages["deploy: wrangler pages deploy dist"]
    wkr["deploy-worker: wrangler deploy (worker/)"]
    test --> pages
    test --> wkr
  end

  subgraph cf["Cloudflare (zone mtga.fyi)"]
    P["Pages project<br/>mtga-limited-ev<br/>serves everything but /api/*"]
    W["Worker<br/>mtga-limited-ev-box-prices<br/>route mtga.fyi/api/*"]
    KV1[("KV: BOX_PRICES")]
    KV2[("KV: CALENDAR")]
    W --- KV1
    W --- KV2
  end

  pages --> P
  wkr --> W
  W -- "daily cron" --> src["tcgcsv.com · Scryfall<br/>Google Calendar API"]
  browser(["Browser"]) --> P
  browser -- "/api/box-prices<br/>/api/calendar" --> W
```

- **Static SPA on Cloudflare Pages**, published from GitHub Actions on every
  push: `--branch=main` is production, every other branch gets a preview URL.
- **Cloudflare KV serves `/api/`** through one Worker routed at `mtga.fyi/api/*`,
  which takes precedence over Pages for those paths. The app fetches both feeds
  same-origin (the CSP is `connect-src 'self'`) and falls back to the copies in
  `src/data/` where the route does not exist — previews and local dev.
- **Two Cloudflare crons update the KV** daily: box prices from tcgcsv.com and
  Scryfall, and the event calendar from a **public Google Calendar** read through
  the Calendar API.

## The pipeline

| Job | Runs on | Does |
| --- | --- | --- |
| `test` | every push, PR, and `workflow_dispatch` | `npm ci`, refresh the two shipped feed copies, `npm test`, `npm run build`, upload `dist` |
| `deploy` | push / dispatch / same-repo PR, non-Dependabot | downloads that `dist` and uploads it to Pages |
| `deploy-worker` | `main` only, push or dispatch | `wrangler deploy` from `worker/` |

## Secrets and configuration

### GitHub repository secrets

Four, all under **Settings → Secrets and variables → Actions**:

| Secret | Used by | What it is |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `deploy`, `deploy-worker` | API token, scopes below |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy`, `deploy-worker` | account id from the Cloudflare dashboard |
| `GOOGLE_CALENDAR_ID` | `test`, on non-PR runs | the public calendar's id |
| `GOOGLE_API_KEY` | `test`, on non-PR runs | Google Cloud API key, Calendar API enabled |

The two Google secrets are deliberately **not** passed on pull requests: that job
runs lifecycle scripts from an unreviewed lockfile. Their absence is not an
error — the refresh step is `continue-on-error` and the build ships the
checked-in calendar copy with a warning.

### Cloudflare API token scopes

Create at **My Profile → API Tokens** with:

| Scope | Level | Needed for |
| --- | --- | --- |
| Account → Cloudflare Pages | Edit | `wrangler pages deploy` |
| Account → Workers Scripts | Edit | `wrangler deploy` |
| Account → Workers KV Storage | Edit | the Worker's two KV bindings |
| Zone → Workers Routes (zone `mtga.fyi`) | Edit | the `mtga.fyi/api/*` route |

### Worker secrets

Two, set out of band and in no committed file. From `worker/`:

```bash
npx wrangler secret put GOOGLE_CALENDAR_ID
npx wrangler secret put GOOGLE_API_KEY
```

They are typed by hand in `worker/env.d.ts` — `wrangler types` only knows what
`wrangler.jsonc` declares. Do not declare them as `vars` in `wrangler.jsonc`
instead: a `var` is committed plaintext and silently overrides the secret of the
same name.

### Google Cloud

- The calendar must be **public**. Its id comes from **Settings and sharing →
  Integrate calendar → Calendar ID**.
- The API key needs the **Google Calendar API** enabled, and should be restricted
  to it. Required even though the calendar is public.

### Local development

Only `npm run calendar` needs credentials. Copy the template and fill it in:

```bash
cp .env.example .env    # gitignored; .env.example is not
```

`package.json` loads it with Node's `--env-file-if-exists`, so a missing file is
a note rather than an error, and the **shell wins** — an exported variable is not
overridden by the file. Agents are blocked from reading or writing `.env` by
`.claude/settings.json` and a `PreToolUse` hook.

To exercise the live feed path in dev, point Vite at a local Worker:

```bash
cd worker && npx wrangler dev          # one shell
MTGA_EV_API_PROXY=http://localhost:8787 npm run dev   # the other
```

Wrangler prints the port it took; name that one. Without the variable, dev
behaves like a preview and uses the shipped copies.

## Resources created once, by hand

Not in code, and needed to stand this up from scratch:

- The Cloudflare **zone** `mtga.fyi`.
- The **Pages project** `mtga-limited-ev`, production branch `main`, with
  `mtga.fyi` attached as a custom domain.
- Two **KV namespaces**; their ids are in `worker/wrangler.jsonc` and are not
  secrets.
- **Web Analytics** on the zone with `auto_install`, which is why
  `static.cloudflareinsights.com` appears in the CSP's `script-src`.
- GitHub **environments** `production` and `preview` (public repos only on the
  free plan), which give the deploy a tracked URL.
