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

## 1b. Bankroll simulation — rough edges

Plays a sequence from a starting balance until it runs dry. Still crude:

- gold and gems are the only spendable currencies. Packs, points and boxes
  accumulate and count toward ending value but cannot fund an entry, which is
  right for packs and wrong for play-in points once you have twenty.
- the run cap is a hard 500 and is not exposed in the UI.
- a run plays one event type forever. Real players switch when a better one is
  available, which is most of the point of comparing events.
- ending value counts unspent gold at zero, the same gap the per-event view has.

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

## 4. Gold entry fees — done

Presets carry both prices, and the simulation runs a gold balance across the
sequence: it accrues `goldPerEvent` each time and pays an entry outright once
enough has built up. Gems cover the rest.

Because the accrual does not depend on how an event goes, the long-run share of
free entries is just `goldPerEvent / entryCostGold`, which the closed form uses
and a test holds the simulation to.

Still rough:
- the 1,350 default assumes one event a day. Daily win gold caps at fifteen
  wins and quests do not repeat, so playing more events a day earns less per
  event — the model has no notion of events per day.
- the quest half of that figure (~600) is not on Wizards' drop-rates page.
- gold accrued on gem-only events is simply wasted rather than banked toward
  something else.
- the balance starts at zero, which slightly overstates early entries' cost.

## 5. Charts (d3) — done

Both charts are D3 in `src/components`: the outcome distribution, and expected
net against win rate with the break-even crossing and your current position
marked. D3 computes scales and ticks, React renders the SVG, so neither library
fights the other for the DOM.

No pie chart. A pie of the outcome distribution says less than the bars, which
already carry the closed-form check alongside.

Worth considering next: overlaying every preset on the EV curve to compare
events at a glance. The obstacle is scale — Arena Direct's curve runs to six
figures while the others sit in the low thousands, so one axis cannot show
both readably.

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
