# Notes for Claude

An EV model for MTG Arena limited events. The backlog is in
[GitHub issues](https://github.com/awknaust/mtga-limited-ev/issues), labelled
`data`, `model` and `ui`.

```bash
npm install && npm run dev    # Vite prints the URL; the port is not fixed
npm test
```

## Source Arena numbers from Wizards first

**<https://magic.wizards.com/en/mtgarena/drop-rates>** is the authoritative
source for reward and drop-rate data, and it is where the constants in
`src/lib/presets.ts` are derived from. Prefer it, and other articles on
`magic.wizards.com`, over community sites. Reach for third-party pages only for
things Wizards does not publish — chiefly the per-event payout ladders — and say
so when you do.

What that page publishes:

| | |
| --- | --- |
| Pack contents | 5 commons, 2 uncommons, 1 mythic/rare |
| Mythic upgrade rate | ~1:5 to ~1:9.4, set by set; recent sets ~1:7 |
| Duplicate protection | Rare → **20 gems**, mythic → **40 gems**, once the set is complete |
| Wildcard drop rates | Common 1:3, uncommon 1:5, rare 1:30, mythic 1:30 |
| Wildcard track | 1 progress per pack; uncommon and rare/mythic tracks trigger at 6 |
| Vault progress | Common duplicate 1 point, uncommon 3; vault opens at 1000 |
| Vault contents | 1 mythic, 2 rare, 3 uncommon wildcards |
| Daily win rewards | Gold and uncommon ICRs to 15 wins, upgrading rare 1:10, mythic 1:8 |

Those figures are what `DEFAULT_PACK_VALUE_GEMS` (22) and
`DEFAULT_DRAFT_PACK_VALUE_GEMS` (23) are built on — the
derivation is in the doc comment on that constant, and it should be re-checked
against this page rather than rewritten from memory.

### Where payout ladders live

Wizards publishes ladders for **premium and limited-time events only**. The
evergreen events are documented in game and nowhere else — the set event
schedules list them by name and format but say nothing about rewards. That is
why the Premier, Quick, Cube, Pick Two and Sealed tables here come from
community sites, and it is the standing weak point in this repo's data.

| Source | Covers | Detail |
| --- | --- | --- |
| [Arena Open terms and conditions](https://magic.wizards.com/en/news/mtg-arena/arena-open-terms-and-conditions) | Arena Open, both days | Complete, quoted tables; also archives past events, which have been running the same structures |
| Set event schedules, e.g. [Secrets of Strixhaven](https://magic.wizards.com/en/news/mtg-arena/secrets-of-strixhaven-event-schedule) | Contender Draft and other timed events | Full entry cost and ladder; evergreen events listed but rewards "not detailed" |
| [Arena Direct](https://magic.wizards.com/en/news/mtg-arena/arena-direct) | Arena Direct | Partial — gems and packs at 3–5 wins, physical boxes at 6+ |
| Announcement posts under `/news/mtg-arena/` | Changes to entries and rewards | Worth checking when a number looks stale |

Search this domain first when a payout is needed:
`WebSearch` with `allowed_domains: ["magic.wizards.com"]`.

## Data provenance discipline

Payout ladders are not published by Wizards, so they come from community sites
and have burned us. Three things to hold to:

- **Verify before shipping a number.** Gem and gold prices were once written
  backwards here (Premier Draft is 1,500 **gems** or 10,000 **gold**, not the
  reverse), which inverted the conclusion about whether draft is ever
  gem-positive.
- **Third-party tables extract badly.** Draftsim renders prize tracks as
  screenshots, and one MTG Arena Zone table came through with duplicated rows
  and a pack column collapsed into a range. If an extraction looks self
  contradictory, it is.
- **Leave it out rather than guess.** Traditional Sealed was added and then
  removed for exactly this. An absent preset is better than a confidently wrong
  one. When a number is inferred rather than sourced, say so in the commit and
  open an issue.

### Live box prices

The two box values are the one input that goes stale in weeks, so they do not
ride on deploys: a scheduled Worker (`worker/`) reads TCGplayer market prices
(via tcgcsv.com, a public JSON mirror of TCGplayer's API — the same
marketplace Scryfall's USD card prices come from) and Scryfall daily,
publishes the newest twenty draftable paper sets — Modern Horizons and
Foundations included, since Arena Directs have paid such boxes, and presales
too — to KV, and serves the payload at
`/api/box-prices` on the production origin. Each set carries every box kind
TCGplayer tracks with the full price statistics — market, low, mid, high,
directLow — and the feed chooses among none of them: **the worker publishes
data, and every modelling question lives in the app.** The twenty-set cap is
what keeps a refresh inside the Workers free plan's 50 subrequests — the
arithmetic is in `scripts/refresh-constants/sources.mjs` — and it is a
budget, not a model. The app fetches the feed once at load and makes its
choices in `src/lib/boxPrices.ts`: market price (sales-derived, 15–25% under
listings; the basis change from MTGGoldfish's listing figures was
deliberate), released sets only (presales trade at hype prices that settle
later), newest three Standard-legal expansions, outliers past twice the pool
median set aside. Publishing data rather than an answer is deliberate twice
over — changing a rule is an app change, not a data migration, and the
per-set rows are the shape a future "this payout is a box of set X" feature
would price against.

Boundaries that should outlive any refactor:

- **The route is same-origin because the CSP says so.** `connect-src 'self'`
  is not to be amended for this; the Worker's route on
  `mtga-limited-ev.awknaust.me/api/*` is what makes the fetch legal. Preview
  deploys and offline dev have no route and *fall back* to
  `DEFAULT_PLAY_BOX_VALUE_GEMS` / `DEFAULT_COLLECTOR_BOX_VALUE_GEMS` — the
  baked snapshot of the same rule. A missing feed must never be worse than
  the constants were alone. (`npm run dev` proxies `/api` to production, so
  dev normally sees live data anyway.)
- **Share links never depend on the feed.** Encode measures against the fixed
  constants and decode falls back to them, so live values are always written
  into links explicitly, and an old link means what it meant the day it was
  written. The app only overwrites a box value that still sits at its baked
  default — a link's explicit value and a user's edit both survive the fetch
  resolving late.
- **The Worker parses with `scripts/refresh-constants/`'s modules**, imported
  relatively, not copied. Fixing a parser fixes both consumers; a second copy
  would drift.
- A failed refresh — cron or on-demand — leaves the previous KV value
  serving. Yesterday's street prices are not a degradation; a half-parsed
  page would be, which is why `worker/src/dataset.mjs` refuses to publish a
  stump.

The Worker deploys from `deploy.yml` on pushes to main, same credentials as
the Pages upload. Its KV namespace id sits in `worker/wrangler.jsonc` and is
not a secret.

### Re-deriving the constants

```bash
npm run refresh:constants
```

`scripts/refresh-constants/` prints what the sourced constants in
`src/lib/presets.ts` should be today: a table of names and values, `--verbose`
for how each was arrived at, `--json` for either, and constant names as
positional arguments to narrow it. `--list` names them without fetching
anything. Run it every couple of weeks — the two box constants track street
prices and are the part that actually moves.

It reads nothing from this repository and writes nothing to it. **Deciding
whether a value here should replace the one in `presets.ts` is a person's job**,
along with the doc comment that has to change with it: street prices wander a
few percent between runs and most of that is noise. So there is no drift check
and no exit code for "a number moved" — 0 means it printed, 2 means it could
not, and the two are kept apart so an outage never reads as a price crash.

Sources are Wizards' drop-rates page (duplicate-protection gems, mythic upgrade
rates, wildcard rates, the daily win ladder), Scryfall (release dates and set
types), and TCGplayer via tcgcsv.com (box market prices). Fetching is lazy, so asking for one
constant only pays for the feeds it needs, and `GEMS_PER_USD` touches the
network not at all.

The layering is worth keeping: `html` → `parse` → `sources` (the only module
that fetches) → `derive` (pure maths) → `registry` → `report`/`main`. A constant
is one entry in `registry.mjs` carrying its own `compute` and its own
explanation, and every mode is a fold over that list, so adding one means adding
an entry and nothing else.

The judgement calls the constants were written with are encoded rather than
redone by hand: newest three released Standard-legal sets, retail column not EV,
anything over twice the pool median dropped as an outlier — the rule that took
Final Fantasy out. Figures only in the client live in `by-hand.mjs` with the
date each was last confirmed, and `--verbose` prints them in full. That file
going stale is not hypothetical: the gem ladder carried a bundle Arena had
already replaced, and nothing surfaced it because only the rate derived from it
was ever on screen.

## Conventions

- The model in `src/lib` stays free of React and DOM imports; the tests run
  without a DOM because of it.
- Events are data-only modules in `src/data/presets`, one per file, checked with
  `satisfies EventPreset`. Adding an event should need no model change.
- Distributions and the seeded generator come from libraries (stdlib PMFs,
  `pure-rand`), not hand-rolled maths.
- Tooltips state what a field does and stop. Caveats and derivations belong in
  doc comments, where length is free.
- React Compiler memoises the components, so nothing reaches for `React.memo`.
  Existing `useMemo` and `useCallback` calls stay where they are — React's
  guidance is to leave manual memoisation alone in code that already has it. Two
  things to know before touching the toolchain: `@babel/core` is pinned to 7
  because the compiler bails out on `{ className = "" }` under Babel 8
  (react/react#36868), and a bailout is *silent* — the build succeeds and the
  bundle simply carries less memoisation. `react-compiler.test.ts` is the alarm,
  and `vite.config.ts` has the details.
- Every number a user sees should be checkable: the closed-form column exists to
  keep the simulation honest, and hand-derived values are pinned by tests.
- The build loads nothing off-origin, and the CSP in `public/_headers` enforces
  it — no `unsafe-inline` anywhere, which the app only earns by having no inline
  script or style and no external font or stylesheet. A CDN tag, a web font or
  an analytics snippet means amending that policy, and the friction is the
  point. The single off-origin entry is `static.cloudflareinsights.com` in
  `script-src`, and it is not something the build chose: Web Analytics runs on
  the zone with `auto_install`, so Cloudflare injects that beacon at the edge
  regardless of what this policy says. Allowing it is what makes the injected
  script work; the way to be rid of it is to disable auto_install in the
  dashboard, not to tighten the header. The long comment in `public/_headers`
  has the details, including why the host is named without a path. Workflow
  actions are pinned to commit SHAs for the same reason as the rest of this;
  let Dependabot move them rather than reverting to tags.

## More than one agent works here at once

Assume you are not alone. Several sessions run against this repository
concurrently, and the failures that causes are quiet ones — files changing
between two of your own commands, a commit absorbing work you did not write, a
dev server dying because someone else claimed its port. Every rule below comes
from that happening.

- **Never work in the main checkout.** Start with `EnterWorktree`, or take an
  `isolation: "worktree"` agent. `/Users/awknaust/mtga-limited-ev` is shared
  ground: switching branches there rewrites files under every other session and
  under the running dev server. Main is somewhere to merge into, not to work in.
- **Fetch, and branch from `origin/main`.** Not from local `main`, and not from
  whatever the shared tree happens to have checked out — that has been seventeen
  commits behind, and a branch cut from it is born needing a rebase.
  `EnterWorktree` already branches from `origin/<default>`, so mostly this means
  not overriding it. Take the same care rebasing: a branch here once read as
  nine commits behind its own remote, and replaying it onto main as it stood
  would have dropped all nine.
- **Never `git add -A`, and never `git commit -a`.** Stage paths you name. In an
  isolated tree those commands are harmless; in a shared one they have picked up
  another session's worktree as a gitlink, and unrelated edits to
  `.claude/launch.json`.
- **Do not fix the dev server's port.** `launch.json` is tracked, so a port
  written there is a port every worktree fights over. `autoPort` lets Vite take
  a free one. For the same reason, no document here should name a port: read it
  off the server's own output.
- **`npm install` in the worktree before `npm run dev`.** A fresh worktree has
  no `node_modules`, so imports resolve up into the main checkout's — which is
  enough for `npm test` and `tsc`, and that is the trap. Nothing complains until
  an asset has to be *served* rather than imported: Vite's dev server refuses
  any path outside its root, so `bootstrap-icons.woff2` comes back **403
  Restricted** and every `<i class="bi">` in the app renders as tofu. It reads
  as a CSS bug and is not one — `npm run build` inlines the font and ships fine,
  and only this worktree's preview is affected. Check
  `document.fonts.check('16px bootstrap-icons')` before believing an icon is
  broken.
- **Say which area you are taking.** Branches keep commits apart but not
  attention. `src/__snapshots__/share.compat.test.ts.snap`, `src/lib/presets.ts`
  and `src/App.tsx` are where two agents collide, and two sessions re-recording
  the same snapshot against different bases will conflict every time.

One thing that already works, worth not weakening: `share.compat.test.ts` fails
loudly when a link's meaning moves. That guard is how a starting-gems change
was caught after it had been swept into an unrelated commit whose message never
mentioned it. If it fires for a change you did not make, find out whose it is
before re-recording.

## Settled, and not worth reopening

These are decisions rather than backlog, so they are not issues. Each has been
proposed at least once.

- **The fun input is inert on purpose.** "Fun (gems / game)" is a joke that
  feeds into nothing, and the model should not grow a term for it. If anyone is
  tempted by a "priceless" option, note that infinity is genuinely load-bearing:
  expected net becomes +∞, ROI undefined and break-even 0%, and every figure in
  the results panel would need an answer instead of rendering `Infinity` and
  `NaN` through the formatters.
- **No pie chart.** A pie of the outcome distribution says less than the bars,
  which already carry the closed-form check alongside.
- **D3 computes, React renders.** Scales and ticks from D3, SVG from React, so
  neither library fights the other for the DOM.
- **Deploy is Cloudflare Pages, not S3 and CloudFront.** It ships from
  `.github/workflows/deploy.yml`: tests, one build, then a direct upload of that
  same artifact, so what ships is what passed. `main` publishes to
  <https://mtga-limited-ev.awknaust.me>; every other branch gets its own preview
  URL. Direct uploads do not count against Cloudflare's 500 builds/month, which
  is the point of building in Actions rather than letting Pages do it.
- **`index.html` must never be cached.** `public/_headers` makes `/assets/*`
  immutable for a year, safe because Vite fingerprints those filenames, and
  leaves `index.html` on Pages' `max-age=0, must-revalidate`. It is the file
  naming the new hashes, so a cached copy pins a visitor to the previous deploy
  with no way to dislodge it. Do not add a dashboard Cache Rule on the custom
  domain either — Cloudflare's own docs warn it reintroduces exactly this.
