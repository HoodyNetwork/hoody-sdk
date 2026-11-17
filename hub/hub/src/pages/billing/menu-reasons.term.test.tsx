// Billing on a suspended account (fixture `banned`), Wallet & usage: the subscription row menu's disabled items say why
// (the kit's ActionMenu logs "disabled item(s) without a reason" otherwise). Pay now was disabled with no reason.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`banned at ${cols}x${rows}: no menu item is disabled without a reason`, async () => {
    s = await renderPage({ page: 'billing', fx: 'banned', path: '/billing?view=wallet', cols, rows });
    await s.settle();
    expect(s.failures).toEqual([]);
    expect(s.errors.filter((e) => e.includes('without a reason'))).toEqual([]);
  }, 120_000);
}
