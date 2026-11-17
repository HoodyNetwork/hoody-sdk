// The checkout's footer while the wallet is charged, in a terminal: the sentence starts right after the drawer's edge.
// The web draws a small lock before it; the terminal draws no icon there, and the room kept for it left a second
// space in front of "Charging". Fixtures only: nothing is sent.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: one space before "Charging your wallet"`, async () => {
    s = await renderPage({ page: 'billing', path: '/billing?checkout=buy&plan=fam-plus', fx: 'send-slow', cols, rows });
    await s.settle();
    await s.keys.press('end');
    const end = await s.settle();
    const y = end.split('\n').findIndex((l) => l.includes('I understand'));
    expect(y).toBeGreaterThan(0);
    await s.click(end.split('\n')[y]!.indexOf('I understand') + 2, y);
    await s.settle();
    await s.keys.press('tab');
    await s.keys.press('tab');
    await s.keys.press('return');
    const frame = await s.settle();
    const line = frame.split('\n').find((l) => l.includes('Charging your wallet')) ?? '';
    expect(line).toContain('Charging your wallet');
    expect(line).not.toMatch(/\s{2}Charging/);
  }, 180_000);
}
