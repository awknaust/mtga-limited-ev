# Notes for Claude

An EV model for MTG Arena limited events. See [README.md](README.md) for the
model and layout, [TODO.md](TODO.md) for the backlog.

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

Those figures are what `DEFAULT_PACK_VALUE_GEMS` (22) is built on — the
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
  note it in `TODO.md`.

## Conventions

- The model in `src/lib` stays free of React and DOM imports; the tests run
  without a DOM because of it.
- Events are data-only modules in `src/data/presets`, one per file, checked with
  `satisfies EventPreset`. Adding an event should need no model change.
- Distributions and the seeded generator come from libraries (stdlib PMFs,
  `pure-rand`), not hand-rolled maths.
- Tooltips state what a field does and stop. Caveats and derivations belong in
  doc comments and the README, where length is free.
- Every number a user sees should be checkable: the closed-form column exists to
  keep the simulation honest, and hand-derived values are pinned by tests.
