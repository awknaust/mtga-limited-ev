import type { EventPreset } from "../../lib/types";

/**
 * Traditional Sealed: 2,000 gems, BO3, to 4 match wins or 2 match losses.
 *
 * The same pool and the same price as SEALED, played as best-of-three and cut
 * to a far shorter run. Where the best-of-one event pays a flat 3 packs and
 * moves only the gems, this one climbs both together — one pack at no wins up
 * to five at four.
 *
 * The only preset pairing best-of-three with elimination. Every other BO3 event
 * here is fixed rounds, and every other elimination event is best-of-one, so
 * this is the one shape that exercises `exactDistribution` against a match win
 * rate and a two-loss cut at the same time.
 *
 * Winning a single game does not advance the track — the match does, which is
 * what the best-of-three conversion on the win-rate slider already accounts
 * for.
 *
 * This preset was added once before and removed, because the ladder was not
 * good enough to ship. What is different now is corroboration. Two independent
 * sources agree on the name, the 2,000 gem entry, the four-wins-or-two-losses
 * structure, the 200-to-2,200 gem range and the one-to-five pack range: the MTG
 * Wiki's events page and MTG Arena Zone's queue guide.
 *
 * The three interior gem values — 500, 1,200 and 1,800 at one, two and three
 * wins — rest on the wiki alone, and are the weakest numbers in this directory.
 * Only the ends are corroborated: 200 and 2,200 are pinned by the gem range
 * both sources give, and the pack column is pinned by its one-to-five range
 * across exactly five rows.
 *
 * Do not read more into the wiki than it has earned. It matched Premier Draft
 * and Quick Draft exactly and was right about Sealed where this repo was wrong
 * — but it is also wrong about Pick Two Draft's two-win pack count, checked
 * against the client. So it is a good transcription that is not a reliable one,
 * and these three values should be confirmed in game before anything is
 * concluded from them.
 *
 * One figure seen elsewhere disagrees and is not used. A search result put the
 * February 2021 Kaldheim queue at 3,000 gems or 15,000 gold, against 2,000 in
 * both sources above. That reads as the Arena Open's own sealed entry rather
 * than the practice queue's, since the wiki describes this queue as sharing the
 * best-of-one event's entry and rules.
 *
 * No play-in points. Neither source lists any, unlike Traditional Draft.
 *
 * @see https://mtg.wiki/page/Magic:_The_Gathering_Arena/Events
 * @see https://mtgazone.com/formats-queues-events/
 */
export const TRADITIONAL_SEALED = {
  name: "Traditional Sealed",
  group: "sealed",
  entryCostGems: 2000,
  draftPacks: 6,
  structure: { kind: "elimination", maxWins: 4, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 200, packs: 1 },
    { wins: 1, gems: 500, packs: 2 },
    { wins: 2, gems: 1200, packs: 3 },
    { wins: 3, gems: 1800, packs: 4 },
    { wins: 4, gems: 2200, packs: 5 },
  ],
} satisfies EventPreset;
