# mtga.fyi

What MTG Arena events and passes really pay at your win rate, and where the
break-even sits.

**<https://mtga.fyi>**

![The app: win rate, balances and the event's payout schedule on the left; on
the right a bankroll run, with summary figures, a histogram of events played
before running out, the distribution of ending value, and one sampled run
broken out match by match.](docs/screenshot.png)

Give it a win rate and it works out what an MTG Arena event returns:
the entry cost against gems, packs, gold, play-in points and physical boxes.

It also runs a bankroll forward: from a starting balance it replays the event,
each payout funding the next entry, until you cannot afford one. That is the
gambler's ruin problem, and ten thousand runs give its shape rather than its
average — how many events the balance buys, where you tend to end up, and the
risk of ruin, the share of runs that go broke inside your event limit.

```bash
npm install && npm run dev    # Vite prints the URL it picked
npm test
```

Reward and drop-rate figures come from [Wizards' published drop
rates](https://magic.wizards.com/en/mtgarena/drop-rates). The per-event payout
ladders are not published anywhere official and are community-sourced; they are
the softest data here, and some still want confirming against the in-game
screens.

## License

[MIT](LICENSE) — © 2026 Alex Knaust.
