import type { EventPreset } from "../../lib/types";

/**
 * Limited Open, Draft 1: 5,000 gems or 25,000 gold, three-pack draft,
 * best-of-one, to 7 wins or 2 losses.
 *
 * The first of the two events an Arena Limited Open is made of. Nothing pays
 * below four wins; four, five and six pay gems, and seven pays gems and the
 * token that enters Draft 2. Wizards names the two stages Draft 1 and Draft 2
 * rather than Day One and Day Two — they run across the same weekend, and a
 * token is good for an entry rather than for the one day — so the name here
 * follows theirs. The set changes run to run and is no part of the name; the
 * first run, September 11–14 2026, drafted The Hobbit.
 *
 * Entry, structure and the whole ladder are quoted from the Limited Open
 * terms: "Entry is 25,000 gold or 5,000 gems per entry", "The Draft 1 entry
 * is valid until 7 wins or 2 losses, whichever comes first", and the prize
 * table down to "7 wins: 5,500 gems and token for entry to Draft 2". The
 * in-game entry screen for the first run shows the same — nothing to three
 * wins, gems from four, a token beside the gems at seven — at the same two
 * prices.
 *
 * Rung for rung it is the Arena Limited Championship Qualifier's Draft 1 —
 * same entry, same cut, same gems — which the event schedule says outright
 * ("structured similarly to the popular new Arena Limited Championship
 * Qualifier events") while adding that it "is not an Arena Limited
 * Championship Qualifier event". Where they differ is past the token, in what
 * Draft 2 pays.
 *
 * One thing carries over from the Play-Ins, and one deliberately does not.
 *
 * The gold price breaks the ratio every draft holds: 25,000 gold against
 * 5,000 gems is 2,000 per 10,000, the Play-Ins' rate rather than the 1,500 of
 * `GEMS_PER_10K_GOLD`. The tests that hold presets to that rate name this one
 * in their exemption, as they name the Play-Ins.
 *
 * And the top rung pays a token the model cannot price: the Invitation Token,
 * Wizards' name for a Draft 2 entry. It is `invitationTokens`, a field of its
 * own rather than the Play-Ins' `qualifierTokens`, because it is a different
 * seat — Draft 2 rather than a Qualifier Weekend — with its own rate,
 * `DEFAULT_INVITATION_TOKEN_VALUE_GEMS`, which is 0 until the reader says
 * otherwise. And a second one is not redundant here — "You may participate in
 * Draft 2 as many times as your tokens allow" — so it is counted like the
 * packs rather than reported as a chance. Draft 2 is 6 wins or 2 losses and
 * pays 6,500 / 7,500 / 8,500 / 10,000 gems at one to four wins, then $1,000
 * at five and $2,000 at six; what that comes to is on the constant.
 *
 * `draftPacks: 3` is the one figure assumed rather than sourced. The terms say
 * nothing about the collection either way, and neither do the Qualifier's, so
 * this follows every other draft here, as ARENA_DIRECT_PLAY follows SEALED.
 * If the event turns out to be phantom it should be 0, worth about 69 gems an
 * entry at the default draft-pack rate.
 *
 * @see https://magic.wizards.com/en/news/mtg-arena/limited-open-terms-and-conditions
 * @see https://magic.wizards.com/en/news/mtg-arena/the-hobbit-event-schedule
 * @see https://magic.wizards.com/en/news/mtg-arena/announcements-september-8-2026
 */
export const LIMITED_OPEN_DRAFT_1 = {
  name: "Limited Open (Draft 1)",
  group: "draft",
  bestOf: 1,
  entryCostGems: 5000,
  entryCostGold: 25000,
  draftPacks: 3,
  structure: { kind: "elimination", maxWins: 7, maxLosses: 2 },
  payouts: [
    { wins: 0, gems: 0, packs: 0 },
    { wins: 1, gems: 0, packs: 0 },
    { wins: 2, gems: 0, packs: 0 },
    { wins: 3, gems: 0, packs: 0 },
    { wins: 4, gems: 1000, packs: 0 },
    { wins: 5, gems: 2500, packs: 0 },
    { wins: 6, gems: 5000, packs: 0 },
    { wins: 7, gems: 5500, packs: 0, invitationTokens: 1 },
  ],
} satisfies EventPreset;
