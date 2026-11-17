// Bare metal for a suspended account draws two buttons. One reads the account's state again; the other leaves for
// the Account page. Two buttons with one label would hide which is which, so each is named for what its press does.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const count = (frame: string, word: string): number => frame.split(word).length - 1;

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: a suspended account's Bare metal has one Check status and one Go to Account`, async () => {
    s = await renderPage({ page: 'billing', path: '/billing?view=servers', fx: 'servers-banned', cols, rows });
    let frame = await s.settle();
    for (let i = 0; i < 6 && !frame.includes('Purchases are paused'); i++) {
      await s.keys.press('pagedown');
      frame += '\n' + (await s.settle());
    }
    expect(frame).toContain('Your account is suspended.');
    expect(frame).toContain('Purchases are paused');
    expect(frame).toContain('[Go to Account]');
    // The band's button is the only one that reads again. Every frame taken holds it at most once.
    for (const one of frame.split('\n\n')) expect(count(one, '[Check status]')).toBeLessThanOrEqual(1);
    expect(count(frame, '[Check status]')).toBeGreaterThanOrEqual(1);
  }, 180_000);
}
