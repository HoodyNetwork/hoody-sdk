// Billing sheets in a terminal, under the strict DOM globals: the funds sheet's legal links (legal.term.ts: the
// addresses live on the web document) and a reserve checkout's lock check (core commerce-pure: hostEnv().locks, not
// navigator.locks) read no DOM global. A DOM global there would trap and stop the Hub (goldens: shot-funds `document`,
// shot-checkout-baremetal-setup `navigator`).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import shots from './shots';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const name of ['funds', 'checkout-baremetal-setup']) {
  const shot = shots.find((x) => x.name === name)!;
  for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
    test(`${name} at ${cols}x${rows}: no DOM global read`, async () => {
      s = await renderPage({ page: 'billing', fx: shot.state ?? null, path: '/billing' + (shot.path ?? ''), cols, rows });
      await s.settle();
      expect(s.traps).toEqual([]);
      expect(s.failures).toEqual([]);
    }, 120_000);
  }
}
