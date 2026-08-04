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

[MIT](LICENSE) — © 2026 Alex Knaust.
