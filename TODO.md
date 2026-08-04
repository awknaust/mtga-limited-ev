# TODO

Rough backlog, unordered. Notes are pointers, not designs.

## 1. Sealed events — done, but check the payout numbers

Sealed and Traditional Sealed are in. Both fell out of the existing structure
union with no model change, as expected — though note Traditional Sealed is
BO3 *elimination* (4 wins / 2 losses), not fixed rounds like Traditional Draft.

Structures and entry costs (2,000 gems, gems only) are corroborated across
sources and can be trusted. **The payout tables are less certain.** They came
from a page whose table extracted badly — duplicated rows, a pack column that
came through as a range — and only the 7-win Sealed row (2,200 gems, 3 packs)
was independently confirmed. Worth checking both ladders against the in-game
event screen; they are two data files and take a minute to correct.

## 2. Box events (including value)

Events paying a fixed box of packs rather than a win-scaled ladder. Needs a
think about whether this is just a payout table with flat rows, or a genuinely
different reward shape that the `PayoutTier` type does not cover.

## 3. Value for play-in points

Arena Open / Qualifier play-in points are a reward currency the model currently
ignores. Likely a third column alongside gems and packs, with a user-set gem
value — same treatment `packValueGems` already gets.

## 4. Gold entry fees, and prefer gold when available

Bigger than it looks. Today `entryCostGems` is a single number. Events cost
*either* gems or gold (Premier: 1,500 gems / 10,000 gold; Quick: 750 / 5,000;
Pick Two: 900 / 6,000), and the two are not interchangeable at a fixed rate.

Wants:
- presets carry both prices
- the model accrues gold (from dailies/weeklies?) and spends it in preference to
  gems, so a run of events draws down whichever currency it should
- this makes EV path-dependent rather than per-event independent, which is a
  real change to what `simulate()` returns

## 5. Charts (d3)

Pie chart of outcome distribution, and better charts generally. The bar chart is
currently Bootstrap `.progress` elements in `src/App.tsx`. d3 would also make an
EV-vs-win-rate curve easy, which is probably more useful than a pie.

## 6. Model confidence in the win rate

Right now win rate is a point estimate, so the outputs are exact given a number
the user is guessing at. Treating it as a distribution (Beta prior from a played
record?) and propagating that through would widen the intervals honestly — the
uncertainty in `p` almost certainly dominates the Monte Carlo error the CI
currently reports.

## 7. Persist global settings

Store the global inputs (win rate, pack value, N, seed) in localStorage so they
survive a reload. Event/preset state probably should not persist.

## 8. Gem value of having fun — done, and deliberately not wired

The "Fun (gems / game)" input exists in the global inputs. It is a joke and
feeds into nothing: the model has no term for it and should not grow one. Leave
it inert.

If anyone is ever tempted by a "priceless" option, note that infinity is
genuinely load-bearing — it makes expected net +∞, ROI undefined and break-even
0%, and every figure in the results panel would need an answer for it instead
of rendering `Infinity` and `NaN` through the formatters.

## 9. Deploy to AWS/S3

`npm run build` already emits a fully static `dist/` — no server, no API, no
env vars — so S3 static hosting plus CloudFront in front of it is enough.

Worth settling first:
- bucket stays private, served through CloudFront with an Origin Access
  Control, rather than a public website-endpoint bucket
- cache headers: Vite fingerprints the assets, so those can be immutable and
  long-lived, but `index.html` must be short-lived or a deploy won't be picked
  up
- how it ships — a GitHub Actions workflow on push to `main` (sync `dist/`,
  then invalidate `/index.html`) beats deploying from a laptop
- whether it needs a domain and certificate, or a CloudFront URL is fine
