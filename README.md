# MTGA Limited EV

What draft and sealed events really pay at your win rate — and where the
break-even sits.

**<https://mtga-limited-ev.awknaust.me>**

Give it a win rate and it works out what an MTG Arena limited event returns:
the entry cost against gems, packs, gold, play-in points and physical boxes.
Every figure is simulated and then checked against a closed form computed
beside it, so the two can be read against each other. It also runs a bankroll
forward — how many events a starting balance buys before it runs dry.

```bash
npm install && npm run dev    # http://localhost:5173
npm test
```

Reward and drop-rate figures come from [Wizards' published drop
rates](https://magic.wizards.com/en/mtgarena/drop-rates). The per-event payout
ladders are not published anywhere official and are community-sourced; they are
the softest data here, and some still want confirming against the in-game
screens.

## License

[GNU Affero General Public License v3.0 or later](LICENSE) — © 2026 Alex Knaust.

AGPL rather than something permissive because this is a hosted web app: plain
GPL's copyleft triggers on distribution, and running a modified copy on a server
is not distribution. Section 13 closes that gap, so anyone serving a modified
version owes its users the source. The footer's "Source on GitHub" link is that
offer.
