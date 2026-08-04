# TODO

Rough backlog, unordered. Notes are pointers, not designs.

## 1. Sealed events — Sealed done, Traditional Sealed pulled

Sealed is in: 2,000 gems (gems only), BO1, 7 wins or 3 losses. Its structure
and entry cost are corroborated, and the 0-win and 7-win rows were confirmed
independently. The middle of the gem ladder came from a badly-extracted table
and is worth a check against the in-game screen.

Traditional Sealed was added and then removed — the payout data was not good
enough to ship. Structure and entry are known (2,000 gems, BO3, 4 match wins
or 2 match losses) and it is the one shape no preset now exercises: BO3 paired
with elimination. Add it back once the ladder and its play-in points are
confirmed in game.

## 2. Box events — done, mythic packs still open

Physical boxes are payout tier fields (`playBoxes`, `collectorBoxes`) with gem
rates in advanced settings, and Arena Direct (Powered Cube) is modelled.

Still open: **mythic packs**. Contender Draft's top two tiers pay them
alongside regular packs and they are folded into `packs` at face count, which
understates those tiers. A `mythicPacks` field with its own rate would fix it —
the same shape the play-in and box changes took.

Boxes are priced at the street average of the last three sets from MTGGoldfish.
Two things that still flatter Arena Direct: a box is only worth its street
price if you would sell it, and collector box prices are wildly volatile —
$475 to $900 across those same three sets.

## 3. Value for play-in points — done, one number to confirm

Play-in points are a third reward column alongside gems and packs, valued at
200 gems each by default (20 points buy a 4,000 gem Arena Open play-in), with
the rate editable in advanced settings.

Traditional Draft is the only event awarding them: 2 points for a 3-0.
Traditional Sealed also awards them but is not currently modelled — see item 1.

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
