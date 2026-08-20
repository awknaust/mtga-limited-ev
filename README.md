# mtga.fyi

The quest to go infinite. An analyzer for the value of Magic: The Gathering
Arena events and passes.

**<https://mtga.fyi>**

![The app: win rate, balances and the event's payout schedule on the left; on
the right a bankroll run, with summary figures, a histogram of events played
before running out, the distribution of ending value, and one sampled run
broken out match by match.](docs/screenshot.png)

A client-side based web app that has a model of different "reward values" and 
event structures in MTGA. You control a set of a parameters - your estimated win
rate, your starting bankroll (gold, gems, etc.) and it will help you understand:
* **Bankroll simulation** - how many events you can expect to play given your starting bankroll, a somewhat novel analysis that helps you understand for example how a realistic season of drafts could look given your budget
* **Expected Value** - If you were to play forever - how profitable is playing an event
* **Event Comparison** - is a collector-box arena direct better than a play-box one? [yes]
* **The Mastery Pass** - is it worth it.

## Development
  

```bash
npm install && npm run dev    # Vite prints the URL it picked
npm test
```

Reward and drop-rate figures come from [Wizards' published drop
rates](https://magic.wizards.com/en/mtgarena/drop-rates) when possible. 

## License

mtga.fyi and mtga-limited-ev is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

[MIT](LICENSE) — © 2026 Alex Knaust.
