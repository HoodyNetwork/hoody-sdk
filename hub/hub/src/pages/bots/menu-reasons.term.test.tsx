// Bots list (fixture `idle`): a Bot with no link yet has Copy address disabled in its row menu; it says why ("No link
// yet") instead of the kit's ActionMenu diagnostic "disabled item(s) without a reason: copy".
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`idle at ${cols}x${rows}: no row menu item is disabled without a reason`, async () => {
    s = await renderPage({ page: 'bots', fx: 'idle', path: '/bots', cols, rows });
    await s.settle();
    expect(s.failures).toEqual([]);
    expect(s.errors.filter((e) => e.includes('without a reason'))).toEqual([]);
  }, 120_000);
}
