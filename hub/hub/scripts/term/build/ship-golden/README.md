# Ship goldens: the built bundle on two fake accounts

Each frame is the built terminal bundle (`hub-term.js`) mounted by `ship-run.ts` on the measure harness's fake client
(`scripts/term/build/measure.ts`), one set per mode:

- `<page>.120x40.txt`, mode `error`: the client answers only the boot reads (a minimal signed-in account) and refuses
  every page read with 404. Every frame is the page's refusal state ("Could not load your computers", "This didn't
  load", …): the shipped bundle draws each error path without a crash or a loading screen that never ends.
- `empty/<page>.120x40.txt`, mode `empty`: the page reads are answered as an account that owns nothing (no computers,
  subscriptions, rentals or keys; zero balances), from `scripts/term/build/fake-empty.ts`. Each answer follows the API's
  response schema of its route (checked by `fake-empty.term.test.ts`), never a page's fixtures.

The gate fails a page whose two modes draw the same frame, and `ship-gate.term.test.ts` checks that every page has both
goldens and that they differ.

Written by `bun scripts/term/build/ship-gate.ts --update` (`--modes empty` for one set); review each frame before committing
a change. A new page read that the empty set does not answer still gets 404 in mode `empty`: add it to `fake-empty.ts`.
