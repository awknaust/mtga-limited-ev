# TODO

Rough backlog, unordered. Notes are pointers, not designs.

Only open work lives here. Where a number is settled, its derivation and its
caveats belong in the doc comment on the constant — `src/lib/presets.ts` already
carries the box price volatility, the play-in point's replacement-cost basis and
the soft quest half of the gold figure.

## Data to confirm

**Traditional Sealed.** Added once and removed: the payout data was not good
enough to ship, and a confidently wrong preset is worse than an absent one.
Structure and entry are known — 2,000 gems, BO3, 4 match wins or 2 match losses
— so what is missing is the ladder and the play-in points. Worth doing beyond
completeness: it is the one shape no preset now exercises, BO3 paired with
elimination.

**Sealed's middle ladder.** The 0-win and 7-win rows were confirmed
independently, but the rows between them came from a badly-extracted table.
Check them against the in-game screen.

## Model gaps

**Mythic packs.** Contender Draft's top two tiers pay them alongside regular
packs, and they are currently folded into `packs` at face count, which
understates those tiers. A `mythicPacks` field with its own rate would fix it,
the same shape the play-in and box changes took.

**Win rate is a point estimate.** The outputs are exact given a number the user
is guessing at. Treating it as a distribution — a Beta prior from a played
record? — and propagating that through would widen the intervals honestly. The
uncertainty in `p` almost certainly dominates the Monte Carlo error the
confidence interval currently reports.

**Bankroll simulation.** Plays a sequence from a starting balance until it runs
dry. Still crude in three ways:

- gold and gems are the only spendable currencies. Packs, points and boxes
  accumulate toward ending value but cannot fund an entry — right for packs,
  wrong for play-in points once you have twenty.
- a run plays one event type forever. Real players switch when a better one is
  available, which is most of the point of comparing events.
- ending value counts unspent gold at zero, the same gap the per-event view has.

**Gold.** The accrual works and a test pins the simulation to the closed form's
`goldPerEvent / entryCostGold`, but gold earned on gem-only events is simply
wasted rather than banked toward anything, and the balance starts at zero, which
slightly overstates what early entries cost.

## Interface

**Persist global settings.** Store the global inputs — win rate, pack value, N,
seed — in localStorage so they survive a reload. Event and preset state probably
should not persist.

**Every preset on one EV curve.** Overlaying them would compare events at a
glance. The obstacle is scale: Arena Direct's curve runs to six figures while
the others sit in the low thousands, so one linear axis cannot show both
readably.

## Settled, and not worth reopening

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
- **Deploy is Cloudflare Pages, not S3 and CloudFront.** The original plan, and
  the static bundle needs nothing the free tier withholds. It ships from
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
