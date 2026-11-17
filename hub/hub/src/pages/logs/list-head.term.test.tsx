// Logs list in the terminal: each heading sits over its own column. The rows end one cell early for the scrollbar and
// the heading row did not, so "Visitor" stood one cell right of its addresses and "Took" ended three cells before
// its values.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const END = /[\s█▀▄░▒▓│┃]+$/u;

for (const [fx, cols, rows] of [['many', 120, 40], ['long', 200, 50]] as const) {
  test(`${fx} at ${cols}x${rows}: Took ends where its values end`, async () => {
    s = await renderPage({ page: 'logs', fx, cols, rows });
    const lines = (await s.settle()).split('\n').map((l) => l.replace(END, ''));
    const head = lines.find((l) => /What happened\s+.*Took$/.test(l)) ?? '';
    const took = lines.filter((l) => /\d ms$/.test(l));
    expect(head).not.toBe('');
    expect(took.length).toBeGreaterThan(3);
    for (const r of took) expect([...r].length).toBe([...head].length);
    expect(s.failures).toEqual([]);
  }, 180_000);
}
