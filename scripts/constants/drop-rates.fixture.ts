/**
 * A drop-rates page for tests: every section the parser reads, in the page's
 * own markup — the sentences and lists as Wizards' CMS emits them, nesting
 * and entities included, cut down to the parts read here.
 *
 * Shared by the parser test and the registry test so both derive from one
 * page. Nothing here is fetched; the figures are the ones the page carried on
 * 2026-08-18, chosen so the derived values land on what `presets.ts` holds.
 */

/** The Mythic Booster rule, with the `&#39;` apostrophe the CMS writes. */
export const MYTHIC_BOOSTER =
  "<p>Each Mythic Booster always has a Mythic Rare in the Rare slot, unless it&#39;s replaced with a Rare Wildcard.</p>";

export const CUBE_CONTENTS = `<p><strong>Cube Prize Packs</strong></p>
<p>Each Cube Prize Pack contains the following:</p>
<ul>
<li>1 Timeless Rare or Mythic from any* card legal in Timeless <em>(see exclusions below)</em><ul>
<li>Upgrades to Mythic at a rate of approximately 1:6.5</li>
</ul>
</li>
<li>1 Cube bonus sheet Rare or Mythic<ul>
<li>Upgrades to bonus sheet Mythic at a rate of approximately 1:5</li>
</ul>
</li>
<li>1 Flex card that contains:<ul>
<li>Any* Timeless Rare (20%)</li>
<li>Any* Timeless Uncommon (30%)</li>
<li>A card from the bonus sheet (50%)<ul>
<li>All bonus sheet cards have an equal chance of dropping from this slot.</li>
</ul>
</li>
</ul>
</li>
<li>2 Uncommons from any* card legal in Timeless</li>
<li>4 Commons from any* card legal in Timeless</li>
</ul>
<p>*Exceptions for cards listed as &quot;any* card legal in Timeless&quot; include the following:</p>
<ul>
<li>Any cards that are from <em>Universes Beyond</em> sets.</li>
</ul>`;

export const CUBE_BONUS_SHEET = `<p>The Cube Prize Pack bonus sheet contains:</p>
<ul>
<li>Mythics: Dack Fayden, Leovold, Emissary of Trest, Tourach, Dread Cantor</li>
<li>Rares: Glimmer Lens, Death-Greeter’s Champion, Upheaval</li>
<li>Uncommons: Zuran Orb, Pyrokinesis</li>
<li>Commons: Snuff Out</li>
</ul>`;

/**
 * The page, with any of three sections swapped for other markup (or for the
 * empty string, to take it out). The `<script>` at the top carries the cube
 * anchors ahead of the real ones, as the page's JSON copy of itself does.
 */
export const dropRatesPage = (parts: { mythicBooster?: string; cube?: string; bonusSheet?: string } = {}) =>
  `<html><body>
<script>{"body":"Each Cube Prize Pack contains the following: a decoy. The Cube Prize Pack bonus sheet contains: a decoy"}</script>
<p>Rares may upgrade to a mythic rare at the following rates:</p>
<ul>
<li>approximately 1:7 for Sets: Duskmourn, Foundations</li>
<li>approximately 1:8.1 for Sets: Marvel's Spider-Man</li>
</ul>
<p>One card in each rarity card slot may redeem for a Wildcard of the same rarity at the following expected rates:</p>
<table><thead><tr><th>#</th><th>Rarity</th><th>Rate</th></tr></thead>
<tbody>
<tr><td>1</td><td>Common</td><td>1:3</td></tr>
<tr><td>2</td><td>Uncommon</td><td>1:5</td></tr>
<tr><td>3</td><td>Rare</td><td>1:30*</td></tr>
<tr><td>4</td><td>Mythic</td><td>1:30*</td></tr>
</tbody></table>
<p>Once you have collected four copies you receive 20 Gems for rares, 40 Gems for mythic rares.</p>
${parts.mythicBooster ?? MYTHIC_BOOSTER}
${parts.cube ?? CUBE_CONTENTS}
${parts.bonusSheet ?? CUBE_BONUS_SHEET}
<h3>Daily Win Reward:</h3>
<table><tbody>
<tr><th>Win Number</th><th>Gold</th><th>ICR</th></tr>
<tr><td><strong>1</strong></td><td>250</td><td>0</td></tr>
<tr><td><strong>2</strong></td><td>100</td><td>0</td></tr>
<tr><td><strong>3</strong></td><td>0</td><td>1</td></tr>
</tbody></table>
<p>Standard ICRs that upgrade from Rare to Mythic Rare are approximately at a rate of 1:8.</p>
<table><tbody><tr><td>∞</td><td>Uncommon ICR – 5% Upgrade</td></tr></tbody></table>
</body></html>`;
