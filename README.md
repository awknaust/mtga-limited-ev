# MTGA Limited EV

Local web UI for modelling the outcome of an MTG Arena limited event.

```bash
npm install && npm run dev
```

Then open http://localhost:5173.

## Model

An event is a sequence of independent BO1 games, each won with probability
`winRate`, played until 7 wins or 3 losses (both configurable). `simulate()`
runs N such events with a seeded PRNG; `exactDistribution()` computes the same
distribution in closed form so the two can be compared side by side:

- finishing with `k < maxWins` wins: the last game is the deciding loss, so the
  preceding `k + maxLosses - 1` games hold exactly `k` wins →
  `C(k + maxLosses - 1, k) · p^k · q^maxLosses`
- finishing with `maxWins` wins: the last game is the deciding win, with
  `l = 0..maxLosses-1` losses before it →
  `Σ_l C(maxWins + l - 1, l) · p^maxWins · q^l`

## Inputs

| Input | Notes |
| --- | --- |
| Expected win rate | Per-game, applied independently to every game |
| Entry cost | Gems; set by the preset, editable |
| Pack value | Gems per booster; **defaults to 0**, so packs are counted but contribute no value |
| Payout schedule | Editable gems + packs per win count |
| N | Number of simulated events |
| Seed | Same seed ⇒ same run |

### Presets

Each preset sets the entry cost and payout schedule; win rate, pack value, N and
seed are left alone when switching.

| Preset | Entry | Schedule |
| --- | --- | --- |
| Premier Draft | 1,500 | 50 / 100 / 250 / 1000 / 1400 / 1600 / 1800 / 2200 gems, 1–6 packs |
| Quick Draft | 750 | 50 / 100 / 200 / 300 / 450 / 650 / 850 / 950 gems, 1–2 packs |
| Cube Draft | 1,500 | Same as Premier |
| Custom | — | Keeps whatever is on screen |

Editing any entry-cost or payout field moves the selector to **Custom**, and
undoing the edit snaps it back to the preset. Premier and Cube are structurally
identical, so the app remembers which one you picked rather than inferring it
from the values.

## Outputs

Expected net and gross per event, ROI, break-even win rate, P(profit), mean
games per event, the full distribution of outcomes by win count (simulated vs.
exact), each outcome's contribution to EV, and the percentile spread of a
single event.

## A note on the entry costs

The preset entry costs are Arena's **gold** prices (1,500 / 750), expressed in
the gems field so that cost and payout share one unit. Paying with gems instead
costs 10,000 for Premier and Cube and 5,000 for Quick — enter those directly if
that's how you buy in. It matters: at the gem price the top payout (2,200 for a
7-0) can't cover entry, so the event is negative-EV at *every* win rate and the
break-even card reads "unreachable".

Either way, the model values only gems and whatever you assign to packs — never
the drafted card pool, which is where much of a draft's real return sits.

## Tests

```bash
npm test
```

Covers the closed-form distribution (sums to 1, hand-checked values at p=0.5,
degenerate p=0 and p=1), Monte Carlo convergence to it, seed determinism, and
the break-even solver.
