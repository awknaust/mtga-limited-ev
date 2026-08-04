# MTGA Limited EV

Local web UI for modelling the outcome of an MTG Arena limited event.

```bash
npm install && npm run dev
```

Then open http://localhost:5173.

React + TypeScript, built with Vite. The UI is Bootstrap 5 in dark mode
(`data-bs-theme="dark"` on `<html>`); `src/styles.css` only retunes Bootstrap's
CSS variables and adds the few pieces it has no component for. The model in
`src/lib` has no UI imports and depends only on `pure-rand` for the seeded
generator and stdlib for the two distributions.

## Layout

```
src/lib/            the model — no React, no DOM, runs anywhere
  types.ts          domain types
  structure.ts      event shape helpers, BO3 conversion, payout resizing
  payouts.ts        win count → gems
  distribution.ts   closed-form outcome distributions
  rng.ts            seeded PRNG
  simulate.ts       Monte Carlo run, expected value, break-even
  presets.ts        named events + the pack-value derivation
  index.ts          barrel; import from "./lib"
src/data/presets/   one event per file, data only, `satisfies EventPreset`
src/App.tsx         the entire UI
```

Adding an event means adding a file under `src/data/presets` and listing it in
`PRESETS` — no model changes, as long as its shape is elimination or fixed
rounds. `satisfies` means a wrong field name, a bad structure kind or a
mistyped value is a compile error pointing at the offending line.

## Model

An event is a sequence of rounds, each won with the match win rate implied by
your per-game win rate. `simulate()` runs N events with a seeded PRNG;
`exactDistribution()` computes the same distribution in closed form, so the two
sit side by side in the UI as a check on each other.

### Structures

**Elimination** — play until `maxWins` wins or `maxLosses` losses (Premier,
Quick, Cube). The run ends on the deciding round, so:

- finishing with `k < maxWins` wins: the last round is the deciding loss, and
  the preceding `k + maxLosses - 1` rounds hold exactly `k` wins →
  `C(k + maxLosses - 1, k) · p^k · q^maxLosses`
- finishing with `maxWins` wins: the last round is the deciding win, with
  `l = 0..maxLosses-1` losses before it →
  `Σ_l C(maxWins + l - 1, l) · p^maxWins · q^l`

**Fixed rounds** — play exactly `rounds` rounds with no early exit (Traditional
Draft). Plainly binomial: `C(n, k) · p^k · q^(n-k)`. Every win count keeps
non-zero probability, since an 0-2 start still plays round three.

Neither is hand-rolled. The binomial and negative binomial come from stdlib's
distribution packages, and the seeded generator is `pure-rand`'s xoroshiro128+.
The one thing handled locally is the pair of degenerate win rates, 0 and 1,
which sit outside the negative binomial's support but make the run
deterministic anyway.

### BO1 vs BO3

Win rate is always entered **per game**. For a BO3 event it is converted to a
per-match rate before anything else runs:

```
P(match) = p²(3 − 2p)      // win 2-0, or 2-1 in either order
```

This amplifies an edge — 55% of games is 57.5% of matches — so the longer
format rewards the better deck. 0, 0.5 and 1 are fixed points.

## Inputs

| Input | Notes |
| --- | --- |
| Structure | Elimination (wins/losses thresholds) or fixed rounds |
| Match format | Best of 1 or best of 3 |
| Expected win rate | Per-game, applied independently to every game |
| Entry cost | Gems; set by the preset, editable |
| Pack value | Gems per booster; **defaults to 22** (see below). Set to 0 to price events in gems alone |
| Payout schedule | Editable gems + packs per win count; resizes with the structure |
| N | Number of simulated events |
| Seed | Same seed ⇒ same run |

### Presets

Each preset sets entry cost, format, structure and payout schedule; win rate,
pack value, N and seed are left alone when switching.

| Preset | Entry | Structure | Schedule |
| --- | --- | --- | --- |
| Premier Draft | 1,500 | BO1, to 7 wins / 3 losses | 50 / 100 / 250 / 1000 / 1400 / 1600 / 1800 / 2200 gems, 1–6 packs |
| Quick Draft | 750 | BO1, to 7 wins / 3 losses | 50 / 100 / 200 / 300 / 450 / 650 / 850 / 950 gems, 1–2 packs |
| Cube Draft | 1,500 | BO1, to 7 wins / 3 losses | Same as Premier |
| Traditional Draft | 1,500 | BO3, 3 fixed rounds | 0 / 0 / 1000 / 3000 gems, 1 / 1 / 4 / 6 packs |
| Pick Two Draft | 900 | BO1, to 4 wins / 2 losses | 50 / 150 / 800 / 1000 / 1300 gems, 1 / 1 / 1 / 2 / 3 packs |
| Sealed | 2,000 | BO1, to 7 wins / 3 losses | 200 / 200 / 600 / 1200 / 1200 / 1200 / 2200 / 2200 gems, 3 packs flat |
| Traditional Sealed | 2,000 | BO3, to 4 wins / 2 losses | 200 / 200 / 200 / 200 / 2200 gems, 1–5 packs |
| Custom | — | Keeps whatever is on screen | |

Editing any structural or payout field moves the selector to **Custom**, and
undoing the edit snaps it back to the preset. Premier and Cube are structurally
identical, so the app remembers which one you picked rather than inferring it
from the values.

The payout table is tied to the structure: lowering the win ceiling drops the
rows above it, and raising it again adds empty rows rather than restoring the
old numbers. Re-selecting a preset refills the table.

## Outputs

Expected net and gross per event, ROI, break-even win rate, P(profit), mean
rounds per event, the full distribution of outcomes by win count (simulated vs.
exact), each outcome's contribution to EV, and the percentile spread of a
single event.

## A note on entry costs

The preset entry costs are Arena's **gem** prices: 2,000 for both Sealed events,
1,500 for Premier, Traditional and Cube, 900 for Pick Two, 750 for Quick. The
draft events can be entered with gold instead — 10,000, 6,000 and 5,000
respectively — so enter that if it's how you buy in, keeping in mind that gold
and gems aren't interchangeable at a fixed rate. The Sealed events take gems
only.

The model values only gems and whatever you assign to packs — never the drafted
card pool, which is where much of a draft's real return sits.

## A note on pack value

Packs default to **22 gems**, not the 200 they cost. That figure assumes a
complete collection of the set, where the rare/mythic slot pays gems rather than
a card — 20 for a rare, 40 for a mythic, which at the usual ~1:7 mythic upgrade
rate averages ≈22.9 a slot, or ≈21.3 once the occasional wildcard in that slot
is accounted for. It excludes vault progress and bonus sheets, both of which
would push it higher. The full derivation is on `DEFAULT_PACK_VALUE_GEMS` in
[src/lib/presets.ts](src/lib/presets.ts).

It is the most subjective input here. A ±10 gem error moves expected net by
roughly 30 gems an event; break-even win rates barely move. Set it to 0 to price
events in gems alone.

## Tests

```bash
npm test
```

Covers both distributions (sums to 1, hand-checked values, degenerate p=0 and
p=1), Monte Carlo convergence to each, the BO3 conversion, structure helpers,
payout resizing and aliasing, preset integrity, seed determinism, and the
break-even solver.
