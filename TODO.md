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

## Deploy — workflow written, account side pending

`.github/workflows/deploy.yml` runs the tests, builds once, and direct-uploads
that artifact to Cloudflare Pages with `wrangler pages deploy`. `main`
publishes; every other branch gets its own preview URL off the same `--branch`
flag. `public/_headers` settles caching: `/assets/*` is fingerprinted by Vite so
it is `immutable` for a year, while `index.html` keeps Pages' default
`max-age=0, must-revalidate`, since it is the file that names the new hashes and
a cached copy would pin a visitor to the previous deploy.

Nothing here is free-tier sensitive — static asset requests are unmetered, and
building in Actions means Cloudflare's 500 builds/month cap is never touched.

What is left is all on the Cloudflare account rather than in this repo:

- the Pages project and the API token behind `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` must exist before the first run
- the custom domain is not attached, so it serves from `.pages.dev`
- no `environment:` in the workflow: GitHub Free allows those only on public
  repos and this one is private. Worth adding back if that changes.

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
- **Deploy is Cloudflare Pages, not S3 and CloudFront.** The original plan; the
  static bundle needs nothing the free tier withholds.
