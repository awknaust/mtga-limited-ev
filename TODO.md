# TODO

Rough backlog, unordered. Notes are pointers, not designs.

## 1. Sealed events

Add Sealed and Traditional Sealed presets. Both should fall out of the existing
structure union with no model change — Sealed is elimination, Traditional Sealed
is fixed rounds — so this is a `PRESETS` addition in `src/lib/draft.ts` plus
verified entry costs and payout tables.

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
