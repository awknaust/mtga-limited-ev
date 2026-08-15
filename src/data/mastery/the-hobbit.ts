import type { MasteryTrack } from "../../lib/types";

/**
 * The Magic: The Gathering | The Hobbit Set Mastery, released 11 August 2026.
 *
 * Two Wizards pages are needed, and neither is sufficient alone — which is the
 * point, because between them they check each other.
 *
 * The **drop-rates page** prints the reward track as a two-column table, free
 * and pass, but only through **level 40**. Levels 1–40 below are transcribed
 * from that table's `text` verbatim, read out of the page's own `<table>`
 * element. Do not re-derive them from a text extraction of that page: one
 * returned the two columns shuffled against each other, which is exactly the
 * failure the repo's provenance note warns about, and it is invisible unless
 * you already know the answer.
 *
 * The **Mastery Details page** prints per-column totals for the whole track,
 * which runs to 42 free and 45 pass — more than levels 1–40 account for.
 *
 * **Levels 39–45 were then read off the track in game**, from a screenshot, so
 * the tail is observed rather than inferred. That reading confirms the columns
 * line up where they overlap — level 39 pass is a card style and an orb, level
 * 40 free is a booster, both as printed — and it corrects two things the
 * published table gets wrong:
 *
 *   - **Level 40 pass is 600 gems.** The drop-rates table prints that cell
 *     blank. It has to be somewhere for the published 1,200-gem total to hold.
 *   - **Level 36 pass is the Thorin Oakenshield *companion*, not a second
 *     Thorin Oakenshield card style.** The table prints level 35's text twice.
 *     Taken at face value that gives 26 card styles against a published 25, and
 *     2 companions against a published 3; reading level 36 as the companion
 *     settles both at once, and Thorin is otherwise the one companion of the
 *     three with nowhere to live. This is the only entry below that is reasoned
 *     rather than seen — the screenshot starts at level 39 — so it is the first
 *     thing to check if these totals ever stop reconciling.
 *
 * With those corrections every published total reconciles exactly, and
 * `mastery.test.ts` asserts all ten of them. That is the check standing between
 * a mis-transcribed row and a wrong headline.
 *
 * One item appears on the drop-rates table and not in the Details totals: the
 * four Gandalf, Party Guest cards at level 6. The Details page's card list names
 * only packs and ICRs, while the drop-rates page's pass-content list does say
 * "Rare cards" and "4x The Hobbit Scene Box Rare Card". Kept, since the row is
 * printed; worth re-checking when the set turns over.
 *
 * The Player Draft token is "redeemable for a Premier or Traditional Draft
 * entry" — both 1,500 gems, which is what `DEFAULT_DRAFT_TOKEN_VALUE_GEMS`
 * prices it at.
 *
 * Read 15 August 2026.
 *
 * @see https://magic.wizards.com/en/mtgarena/drop-rates
 * @see https://magic.wizards.com/en/news/mtg-arena/the-hobbit-mastery-details
 */
export const THE_HOBBIT_MASTERY = {
  set: "Magic: The Gathering | The Hobbit",
  priceGems: 3400,
  freeCap: 42,
  passCap: 45,
  // "Level 46+: 1 Uncommon ICR", at a 5% upgrade rate per the drop-rates page.
  beyond: { uncommonIcr: 1 },
  levels: [
    {
      level: 1,
      free: { text: "", rewards: {} },
      pass: {
        text: "Bilbo Avatar, Dwarven Cook Companion, Basic Sleeve",
        rewards: { avatars: 1, companions: 1, sleeves: 1 },
      },
    },
    {
      level: 2,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Bilbo Baggins, Burglar Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 3,
      free: { text: "", rewards: {} },
      pass: { text: "2× HOB Mythic ICR", rewards: { mythicIcr: 2 } },
    },
    {
      level: 4,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Bilbo's Deadly Slice Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 5,
      free: { text: "Orb", rewards: { orbs: 1 } },
      pass: {
        text: "Bard the Bowman Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 6,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: { text: "4× Gandalf, Party Guest Card", rewards: { rareCard: 4 } },
    },
    {
      level: 7,
      free: { text: "", rewards: {} },
      pass: {
        text: "Smaug, the Great Calamity Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 8,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Bolg of the North Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 9,
      free: { text: "", rewards: {} },
      pass: { text: "3× Orb", rewards: { orbs: 3 } },
    },
    {
      level: 10,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: { text: "2000 Gold", rewards: { gold: 2000 } },
    },
    {
      level: 11,
      free: { text: "", rewards: {} },
      pass: {
        text: "Wood Elves Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 12,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: { text: "2× HOB Mythic ICR", rewards: { mythicIcr: 2 } },
    },
    {
      level: 13,
      free: { text: "Orb", rewards: { orbs: 1 } },
      pass: {
        text: "The Chief Warg Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 14,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Magnificent End Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 15,
      free: { text: "", rewards: {} },
      pass: { text: "Player Draft Token", rewards: { draftToken: 1 } },
    },
    {
      level: 16,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Patient Instructor Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 17,
      free: { text: "", rewards: {} },
      pass: { text: "3× HOB Mythic ICR", rewards: { mythicIcr: 3 } },
    },
    {
      level: 18,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Bifur, Melodic Rider Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 19,
      free: { text: "", rewards: {} },
      pass: { text: "600 Gems", rewards: { gems: 600 } },
    },
    {
      level: 20,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Goblin Plate Mail Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 21,
      free: { text: "", rewards: {} },
      pass: { text: "HOB Booster ×4", rewards: { packs: 4 } },
    },
    {
      level: 22,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Thranduil, Sindarin Liege Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 23,
      free: { text: "Orb", rewards: { orbs: 1 } },
      pass: {
        text: "Dwarven Smith Companion, Orb",
        rewards: { companions: 1, orbs: 1 },
      },
    },
    {
      level: 24,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Duskwatch Hunter Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 25,
      free: { text: "", rewards: {} },
      pass: {
        text: "Eagle's Rescue Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 26,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: { text: "3× HOB Mythic ICR", rewards: { mythicIcr: 3 } },
    },
    {
      level: 27,
      free: { text: "", rewards: {} },
      pass: {
        text: "Nori, Teller of Tales Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 28,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      // Secrets of Strixhaven. The model values every pack alike, so the set
      // only matters to a reader.
      pass: { text: "SOS Booster ×4", rewards: { packs: 4 } },
    },
    {
      level: 29,
      free: { text: "", rewards: {} },
      pass: {
        text: "Fearsome Goblin Pair Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 30,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: { text: "2000 Gold", rewards: { gold: 2000 } },
    },
    {
      level: 31,
      free: { text: "", rewards: {} },
      pass: {
        text: "Mirkwood Nurturer Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 32,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Large Bear Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 33,
      free: { text: "Orb", rewards: { orbs: 1 } },
      // Lorwyn Eclipsed.
      pass: { text: "ECL Booster ×4", rewards: { packs: 4 } },
    },
    {
      level: 34,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: {
        text: "Lake-town Lookout Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 35,
      free: { text: "", rewards: {} },
      pass: {
        text: "Thorin Oakenshield Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 36,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      /*
       * The drop-rates table prints level 35's text again here. Read as the
       * companion instead: at face value the track carries 26 card styles and 2
       * companions, where Wizards publishes 25 and 3, and this one row settles
       * both. Thorin is also the only one of the three companions the printed
       * table never places. The wording is ours, following level 23's form.
       */
      pass: {
        text: "Thorin Oakenshield Companion, Orb",
        rewards: { companions: 1, orbs: 1 },
      },
    },
    {
      level: 37,
      free: { text: "", rewards: {} },
      pass: {
        text: "Plunder the Trollshaws Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    {
      level: 38,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      // Edge of Eternities.
      pass: { text: "EOE Booster ×4", rewards: { packs: 4 } },
    },
    {
      level: 39,
      free: { text: "", rewards: {} },
      pass: {
        text: "Rage into the Valley Card Style, Orb",
        rewards: { cardStyles: 1, orbs: 1 },
      },
    },
    /*
     * From here down the drop-rates table stops and the in-game screenshot
     * takes over. Card styles past this point are named only by their art in
     * game, so they are recorded by kind rather than invented a name for.
     */
    {
      level: 40,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      pass: { text: "600 Gems", rewards: { gems: 600 } },
    },
    {
      level: 41,
      free: { text: "Orb", rewards: { orbs: 1 } },
      pass: { text: "Card Style, Orb", rewards: { cardStyles: 1, orbs: 1 } },
    },
    {
      level: 42,
      free: { text: "HOB Booster", rewards: { packs: 1 } },
      // The second of the two published sleeves; the first is at level 1.
      pass: { text: "Card Sleeve", rewards: { sleeves: 1 } },
    },
    {
      level: 43,
      free: { text: "", rewards: {} },
      pass: { text: "Card Style, Orb", rewards: { cardStyles: 1, orbs: 1 } },
    },
    {
      level: 44,
      free: { text: "", rewards: {} },
      // Tarkir: Dragonstorm, the fifth and last of the pass's five pack sets.
      pass: { text: "TDM Booster ×4", rewards: { packs: 4 } },
    },
    {
      level: 45,
      free: { text: "", rewards: {} },
      pass: { text: "Card Style, Orb", rewards: { cardStyles: 1, orbs: 1 } },
    },
  ],
} satisfies MasteryTrack;
