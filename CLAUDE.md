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

Box prices are the one input that goes stale in weeks, so the per-set table
does not ride on deploys: a scheduled Worker (`worker/`) reads TCGplayer market prices
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
arithmetic is in `scripts/box-prices/select.ts` — and it is a
budget, not a model. The app fetches the feed once at load and makes one
choice from it in `src/lib/boxPrices.ts`.

**What is *this* box worth** — `boxPriceTable`, for a payout that names its
set. A payout row lists the boxes it ships (`PayoutBox`, a kind and a set
code), and each is priced against that set's own row. Every priced paper set
is listed, presales and Masters sets included, with no outlier rule: naming a
set is saying which box, and the answer is its price however startling. This
is what the "a box of set X" shape was reserved for, and `src/lib/boxes.ts`
is where a box becomes a number.

**What is a box worth, roughly** — the two *generic* values,
`DEFAULT_PLAY_BOX_VALUE_GEMS` and `DEFAULT_COLLECTOR_BOX_VALUE_GEMS`, for a
ladder naming no set and as the stand-in for a named set the table cannot
price. These are **constants in `presets.ts`**, like every other default:
typed by a person, never recomputed by the app, never moved by the feed.
Every preset box names a set or `latest`, so only a custom ladder reads them,
and a figure a few months old is fine for that. They are in the constants
registry like the rest — `npm run refresh:constants -- DEFAULT_PLAY_BOX_VALUE_GEMS
DEFAULT_COLLECTOR_BOX_VALUE_GEMS --verbose` prints today's values, the sets
behind them and the two arrays to paste — and the rule lives in
`scripts/constants/derive.ts` (`genericBoxValues`): market price
(sales-derived, 15–25% under listings; the basis change from MTGGoldfish's
listing figures was deliberate), released sets only (presales trade at hype
prices that settle later), the newest three Standard-legal expansions,
anything past twice the median of the newest eight set aside. Moving them is
a deliberate change to a default, and `share.compat.test.ts` fires for it as
for any other.

Two consequences worth holding on to. A generic rate of **0 zeroes named
boxes too** — otherwise "zero these out" would leave an Arena Direct still
paying for its boxes at market, and `?playBoxValue=0` links would quietly
stop meaning what they say.

And **a box holding is one product, not one kind**. "Play boxes" stopped
being a thing worth a rate the moment a ladder could pay two sets of them, so
the results report `box:play.spm` and `box:play.msh` separately — one
breakdown card, one bar segment and one run-log chip each, each at its own
market price. `ladderBoxes` is the list of them and `HOLDING_KEYS` is
everything else; a run carries `boxes[]` counts indexed by the first, which
is what keeps the breakdown summing to the total it breaks down. Note the
contract the static keys keep and the box keys do not: every static holding
is reported whether or not the event pays it, so `holdings.packs` is a row of
zeroes on a ladder paying no packs rather than absent. Filtering that list
once shipped a blank page.

Boundaries that should outlive any refactor:

- **The route is same-origin because the CSP says so.** `connect-src 'self'`
  is not to be amended for this; the Worker's route on
  `mtga-limited-ev.awknaust.me/api/*` is what makes the fetch legal. Preview
  deploys and offline dev are on other hostnames, match no route, and *fall
  back* to the copy of the feed the app ships — see the next bullet. A missing
  feed must never be worse than an old one. Note the shape of the miss on
  Pages: `/api/box-prices` there returns **200 with the SPA's HTML**, not a
  404, so the fetch fails at `res.json()` rather than at `res.ok`.
  `fetchBoxPriceFeed` catches both and returns null, which is why the two
  cases need no telling apart. Dev behaves like a preview by default; to
  exercise the live path, name a proxy target per shell —
  `MTGA_EV_API_PROXY=http://localhost:8787 npm run dev` against `wrangler
  dev` — rather than baking the production origin into the build config.
- **The fallback is a copy of the feed, not a transcription of it.**
  `src/data/box-prices.json` is the Worker's payload, byte for byte, and the
  bottom of `src/lib/boxPrices.ts` reads it through the same validator and
  the same two rules as the live one — as of the day the copy was taken, so
  a presale then stays a presale and the copy means one thing wherever it is
  read. `FALLBACK_BOX_PRICES` is *derived* from it, and there is no separate
  "latest set" constant: the copy names the newest set and prices it, so a
  preview says "HOB" and prices a Hobbit box at what one cost when the build
  was made. It is written by
  `npm run box:prices -- --write`; CI runs that once at the top of every
  build, before the tests, so a deploy ships the newest feed it could reach
  and the tests, the typecheck and the bundle all see the same copy. A source
  being down is not a red build — the step is `continue-on-error` and a
  warning says the checked-in copy shipped instead — which is why the
  checked-in copy still gets refreshed by hand now and then: it is what a
  build without network gets. One rule follows. **No test may pin a number,
  a set code or a date from the copy** — it moves on every build, and the
  tests were mutation-checked against a copy with every price up 37% and a
  new newest set. `share.compat.test.ts` reads nothing from it: the two box
  values it prints are the constants in `presets.ts`, and the table is never
  in a link.
- **The feed is fetched before the first render, not after it.** `index.html`
  preloads `/api/box-prices` (`as="fetch" crossorigin` — without `crossorigin`
  the browser will not hand the response to `fetch()`), so the request leaves
  with the HTML and rides alongside the bundle; `main.tsx` awaits that same
  request, bounded by `BOX_FEED_BUDGET_MS`, and hands the result to `<App>` as
  a prop. App applies it to the decoded link *inside its state initialiser*
  (`withLiveBoxPrices`, a pure function in `src/lib/boxPrices.ts` with its own
  tests) — so the first paint is the live table, and there is no effect that
  corrects the shipped copy a moment later and no second simulation run. Where
  there is no feed the await resolves null at once and the app mounts on the
  shipped copy; if the budget elapses it mounts on the shipped copy and does
  not go back for the feed, since a late correction is exactly the re-render
  this exists to avoid. Do not move the fetch back into a `useEffect`.
- **The live feed supplies the per-set table and nothing else.** The two
  generic box values — what a box naming no set is worth, which only a custom
  ladder pays — are constants in `presets.ts`, and only the reader moves
  them. They used to follow the live feed while they still sat at their
  default, and that made a fresh load read as edited: the reset button lit
  and the values were written into the link, for a number nothing on a preset
  ladder reads. Do not reintroduce that, and do not derive them from the
  shipped copy either — that was tried and made a build's defaults move on
  every deploy for the sake of a custom-ladder input.
- **Decoding a link never *requires* the feed.** Encode measures against the
  constants and decode falls back to them, so a generic rate is written into
  a link only when someone changed it, and a link that spelled one out means
  what it meant the day it was written. A link never carries the
  price table; what it carries is which *product* was won, and the feed
  prices that on the day the link is opened. So a link naming a set does move
  with the market, deliberately — with no live feed it prices from the
  shipped copy, and a set the copy does not carry prices at the generic rate,
  which is the pre-feed answer. The rule underneath all of it is the one
  above: a missing feed must never be worse than an old one.
  `share.compat.test.ts` pins the old positional box counts (`0-0-0-1-2`) as
  generic boxes and prices them, so the spelling could change and the meaning
  could not.
- **The Worker is a deployment of `scripts/box-prices/`, not a program of its
  own.** It imports the module relatively, never copies it, so the feed the
  Worker publishes and the one `npm run box:prices` prints are the same code
  path; `worker/src/index.ts` knows only the KV key and the route.
- A failed refresh — cron or on-demand — leaves the previous KV value
  serving. Yesterday's street prices are not a degradation; a half-parsed
  page would be, which is why `scripts/box-prices/feed.ts` refuses to publish
  a stump.

The Worker deploys from `deploy.yml` on pushes to main, same credentials as
the Pages upload. Its KV namespace id sits in `worker/wrangler.jsonc` and is
not a secret.

### The two tool modules

Everything under `scripts/` is TypeScript, run directly by Node's type
stripping (Node 23.6+; no build step), and typechecked in CI by `npm run
build`. There are two modules, each with a small driver for manual
inspection, standing on a thin `scripts/shared/` floor (http, Scryfall,
dates):

```bash
npm run refresh:constants        # scripts/constants/  — every sourced constant, box values included
npm run box:prices               # scripts/box-prices/ — the feed the Worker publishes
npm run box:prices -- --write    # ...and write it to src/data/box-prices.json, the app's copy
```

**`scripts/constants/`** prints what the sourced constants in
`src/lib/presets.ts` should be today: a table of names and values, `--verbose`
for how each was arrived at, `--json` for either, constant names as positional
arguments to narrow it, `--list` to name them without fetching. It reads
nothing from this repository and writes nothing to it. **Deciding whether a
value here should replace the one in `presets.ts` is a person's job**, along
with the doc comment that has to change with it — so there is no drift check
and no exit code for "a number moved": 0 means it printed, 2 means it could
not, kept apart so an outage never reads as a price crash. Sources are
Wizards' drop-rates page, Scryfall, and — for the two box constants only —
the box-price feed, built by `scripts/box-prices/` in full; fetching is lazy
and memoised, so `GEMS_PER_USD` alone touches the network not at all and the
feed is only fetched when a box constant was asked for. A constant is one entry
in `registry.ts` carrying its own `compute` and its own explanation, and every
output mode is a fold over that list — adding one means adding an entry and
nothing else. Figures only in the client live in `by-hand.ts` with the date
each was last confirmed, and `--verbose` prints them in full. That file going
stale is not hypothetical: the gem ladder carried a bundle Arena had already
replaced, and nothing surfaced it because only the rate derived from it was
ever on screen.

**`scripts/box-prices/`** is the feed: `tcgcsv.ts` reads TCGplayer's mirror,
`select.ts` picks which sets are worth two requests (a budget, never a
model), `feed.ts` joins and refuses to publish stumps, `fetch.ts` is the
front door the Worker and the driver both call. The two generic box constants
read this feed too, through the constants registry (`sources.ts` calls the
same `fetchBoxPriceFeed`), so `refresh:constants` and `box:prices` never
disagree about the data. The driver's `--write` is the one thing under
`scripts/` that writes into the repository: it replaces
`src/data/box-prices.json`, the copy of the feed the app ships its per-set
price table from, and it is how that copy is refreshed — by CI before every
build, and by hand when the checked-in copy is wanted current. Nothing is
derived in the script; a source being down writes nothing and exits 2.

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
- Every number a user sees should be checkable. The Per event tab is closed
  form throughout (`src/lib/expectation.ts`) — nothing on it is sampled, so
  there is no trial count and no seed behind it, and it should stay that way.
  The bankroll is the one simulation, because a stopped random walk has no
  PMF to sum over; `bankroll.validation.test.ts` holds it to closed forms
  built by other routes, and hand-derived values are pinned by tests.
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
  `src/data/box-prices.json` moves wholesale on a refresh, so refresh it only
  in a change that is about it — CI refreshes the shipped artifact anyway.

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
