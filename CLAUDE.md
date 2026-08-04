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

## Conventions

- The model in `src/lib` stays free of React and DOM imports; the tests run
  without a DOM because of it.
- Events are data-only modules in `src/data/presets`, one per file, checked with
  `satisfies EventPreset`. Adding an event should need no model change.
- Distributions and the seeded generator come from libraries (stdlib PMFs,
  `pure-rand`), not hand-rolled maths.
- Tooltips state what a field does and stop. Caveats and derivations belong in
  doc comments, where length is free.
- Every number a user sees should be checkable: the closed-form column exists to
  keep the simulation honest, and hand-derived values are pinned by tests.
- Nothing loads off-origin, and the CSP in `public/_headers` enforces it — no
  `unsafe-inline` anywhere, which the app only earns by having no inline script
  or style and no external script, font or stylesheet. A CDN tag, a web font or
  an analytics snippet means amending that policy, and the friction is the
  point. Workflow actions are pinned to commit SHAs for the same reason; let
  Dependabot move them rather than reverting to tags.

## More than one agent works here at once

Assume you are not alone. Several sessions run against this repository
concurrently, and the failures that causes are quiet ones — files changing
between two of your own commands, a commit absorbing work you did not write, a
dev server dying because someone else claimed its port. All four rules below
come from that happening.

- **Never work in the main checkout.** Start with `EnterWorktree`, or take an
  `isolation: "worktree"` agent. `/Users/awknaust/mtga-limited-ev` is shared
  ground: switching branches there rewrites files under every other session and
  under the running dev server. Main is somewhere to merge into, not to work in.
- **Never `git add -A`, and never `git commit -a`.** Stage paths you name. In an
  isolated tree those commands are harmless; in a shared one they have picked up
  another session's worktree as a gitlink, and unrelated edits to
  `.claude/launch.json`.
- **Do not fix the dev server's port.** `launch.json` is tracked, so a port
  written there is a port every worktree fights over. `autoPort` lets Vite take
  a free one. For the same reason, no document here should name a port: read it
  off the server's own output.
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
