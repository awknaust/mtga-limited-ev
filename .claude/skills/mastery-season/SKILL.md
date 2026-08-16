---
name: mastery-season
description: Add or update an MTG Arena Set Mastery season in this repo — source the reward track, reconcile it against published totals, ask the user for in-game screenshots where the sources fall short, transcribe it into src/data/mastery, and wire the picker, URL contract and tests. Use when a new set releases, when the user asks to add or refresh a mastery pass, or when the mastery reconciliation tests start failing.
---

# Adding a Set Mastery season

This skill exists because the first season (The Hobbit, Aug 2026) took three
sources to get right and two of them contradicted each other. Everything below
was learned the hard way in that session; trust it over improvisation.

The deliverable is one data module — `src/data/mastery/<set-slug>.ts`,
`satisfies MasteryTrack` — plus its wiring. The model needs no changes unless
the new pass invents a reward kind (see §6).

## 1. Sources, in order of authority

**A. The drop-rates page** — <https://magic.wizards.com/en/mtgarena/drop-rates>
Publishes the level-by-level reward track as a two-column table (`Set Mastery`
free / `Set Mastery Pass` paid). This is the primary source for per-level rows
and for the extended-levels sentence ("All levels past level N will earn…").

⚠️ **Read it out of the page's own `<table>` element**, via the browser tools
(`javascript_tool` over `document.querySelectorAll('table')`). A WebFetch text
extraction of this page returned the two reward columns **shuffled against each
other** — plausible-looking, wrong, and invisible unless you already know the
answer. Never transcribe from a text extraction of this page.

Expect the table to be **incomplete and to contain errors** (§3).

**B. The set's "Mastery Details" article** —
`magic.wizards.com/en/news/mtg-arena/<set>-mastery-details` (find it with
WebSearch, `allowed_domains: ["magic.wizards.com"]`). Publishes **per-column
season totals** (packs by set, gems, gold, ICRs, orbs, styles, sleeves,
avatars, companions, event tokens) and the level caps ("goes up to Level N; all
players receive rewards through Level F"). No per-level rows. This is the
checksum for source A, and it is what the reconciliation tests pin.

**C. In-game screenshots from the user.** The only source for whatever A stops
short of or gets wrong. Ask for them (§4); do not fill gaps from community
sites — per CLAUDE.md, third-party tables extract badly and have burned this
repo before.

Also record while you are there: the pass **price** (has been 3,400 gems for
years, equal to the $19.99 bundle at 170 gems/$ — but it is stored per-track
because it can move), and the extended-levels reward with its upgrade rate.

## 2. Method: totals and rows check each other

Neither source suffices alone, and that is the strength of using both:

1. Transcribe the table's rows (source A), level by level, keeping Wizards'
   verbatim cell text in `MasteryColumn.text` beside the parsed counts.
2. Sum every reward kind over the rows and diff against the totals (source B).
3. The residual tells you exactly what the missing/wrong rows contain. In the
   Hobbit season the table stopped at 40 of 45 levels, and the residual named
   the tail's contents precisely — 4 boosters, 600 gems, 3 orbs, cosmetics.
4. Get the *placement* of the residual from screenshots (source C).
5. When everything reconciles kind-for-kind, the transcription is right. Write
   that reconciliation as the season's tests before touching any UI.

Corroborating overlap matters as much as the residual: kinds that match
exactly across A and B (gold, ICRs, tokens) are what make the subtraction
credible rather than a guess.

## 3. Known failure modes of the published table

Both happened in the Hobbit table; assume the pattern, not the instances:

- **A cell printed blank that is not empty.** Level 40 pass was blank but held
  600 gems — required for the published 1,200-gem total. A blank cell where
  the totals demand something is a table error, not an empty level.
- **A row repeating its neighbour's text verbatim.** Levels 35 and 36 both
  read "Thorin Oakenshield Card Style, Orb"; 36 was actually the Thorin
  *companion* (in game: a paw icon). Repeated adjacent text is a transcription
  slip on Wizards' side until proven otherwise. The tell was arithmetic before
  it was visual: styles came to published+1 and companions to published−1,
  and one reading fixed both counts at once.
- **The table stops before the caps.** Published rows ended at 40; the track
  ran to 42 free / 45 pass.

If a correction can only be *reasoned* (elimination, reconciliation) rather
than *seen*, say so in a comment at that row and make it the named suspect if
the totals ever stop reconciling.

## 4. When to ask the user for screenshots

Use AskUserQuestion / ask directly, and be specific about which levels. Ask
when:

- the published table stops short of the caps (it will) — ask for the tail;
- the totals do not reconcile with the rows — ask for the disputed levels;
- adjacent rows repeat text verbatim — ask for those levels;
- an icon is ambiguous (§5) — ask the user to identify it rather than guess;
  offer your best candidates with the count-based reasoning for each, the way
  a multiple-choice question does. The counts usually constrain the answer to
  one or two possibilities before anyone looks at a pixel.

Reading a screenshot: **top row = free track, bottom row = pass track**; a
padlock badge marks pass slots (locked until purchased); the **∞ column** at
the right end is the repeating past-cap reward. Screenshots overlap-check just
like sources: when two screenshots share levels, or a screenshot overlaps the
published rows, verify they agree before trusting either further.

## 5. Icon glossary (from the Hobbit-season screenshots)

| Icon | Reward |
| --- | --- |
| Card with the set's booster art and logo | 1 booster of that set |
| Dark card art with a white number (e.g. "4") | that many boosters of the set shown in the art — identify the set by its art/logo |
| Green-gold glowing sphere | 1 Mastery Orb |
| Sparkling Arena card frame (purple/blue shimmer) | card style (usually paired with an orb in the same cell) |
| Orange **paw print** | companion |
| Blue gem cluster with a number | that many gems |
| Gold coin stack with a number | that many gold |
| Amber/orange stacked cards with the white Arena "A" | card sleeve |
| Classic Magic card back (brown/orange) | ICR — in the ∞ slot, the repeating uncommon ICR |
| Character portrait tile | avatar |

Styles/cosmetics past the published rows have no printed names — record them
**by kind** (`text: "Card Style, Orb"`), never invent a name. Where a specific
identity is inferred by elimination (e.g. which of three named companions),
the *kind* is observed but the *name* is yours: say so in the row's comment.

## 6. Wiring checklist (the code side)

Read `src/data/mastery/the-hobbit.ts` first — it is the template, including
the provenance doc-comment style (sources, read date, corrections, what is
inferred vs seen).

1. **Data module** `src/data/mastery/<slug>.ts`: `name` (display, the set),
   `slug` (**stable forever** — it is the URL token; never derive it from the
   name), `priceGems`, `freeCap`, `passCap`, `levels` 1..passCap contiguous,
   `beyond`.
2. **Register** in `src/lib/mastery.ts`: add to `MASTERY_TRACKS`, newest
   first. `CURRENT_MASTERY_TRACK` is `[0]`, so ordering is what makes the new
   season the default.
3. **Tests** in `src/lib/mastery.test.ts`: a reconciliation block for the new
   season pinning the published totals kind-by-kind, contiguity 1..passCap,
   caps, price, and "non-empty `text` ⇒ non-empty `rewards`" (catches a row
   pasted but not parsed). Keep the Hobbit's tests — old seasons are
   regression anchors.
4. **URL contract**: the share test asserting `MASTERY_TRACKS` has length 1
   ("keeps the mastery season out of a link while there is only one") **will
   fail — that is its job**, as a reminder. Replace it with the two-season
   truth (only a non-default season writes `mastery=`), and add a corpus entry
   `["mastery <slug>", "?tab=mastery&mastery=<slug>"]` to
   `share.compat.test.ts`. The snapshot re-record must add entries and move
   none; if an existing entry moves, find out whose change that is first
   (CLAUDE.md names this file as a two-agent collision point).
5. **Default drift**: making the new season the default changes what a bare
   `?tab=mastery` link shows. That is intended (Arena has moved on too), but
   the corpus entry for the *old* season is what keeps old links restorable —
   which is why step 4's corpus entry matters even for the outgoing season.
6. **New reward kind only** (e.g. a pass that pays wildcards): add to
   `MASTERY_REWARD_KINDS` (types.ts) → the `masteryRate` switch makes the
   build fail until a case exists (that is deliberate — no `default:`) → rate
   field on `EventConfig` → default constant in presets.ts with a derivation
   comment in the house style (duplicate-protection values are the usual
   basis; cosmetics default to 0) → `defaultConfig` → Advanced settings input
   in App.tsx → About rate-table row → `CONFIG_NUMBERS` in share.ts → label in
   `MASTERY_REWARD_LABELS` → `.slice-<kind>` colour in styles.css (the split
   bar drops zero-worth slices, but a priced kind must not draw uncoloured).

## 7. Verify

`npm test` — the reconciliation tests are the real gate. Then in the app
(`preview_start`, `npm install` in the worktree first per CLAUDE.md): the new
season is the picker default with its price beside it; the strip, split bar,
breakdown table and reward track all agree with each other; the old season
still selects and computes; `?tab=mastery&mastery=<old-slug>` round-trips.

Sanity-check the headline before believing it: gems + gold + token alone have
historically covered ~97% of the price. A wildly different answer means a
transcription error, not a different market.
