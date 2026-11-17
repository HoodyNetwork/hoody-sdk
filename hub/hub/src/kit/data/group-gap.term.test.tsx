// A grouped list gives every top-level group header one blank row above it, not only the first (whose blank is the
// toolbar's): the AI chat list at 120x40 reads as one block per group. A short terminal (24 rows) keeps the rows for
// the list and draws none.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const body = (l: string): string => l.replace(/^.*│/, '').replace(/█/g, '');
const head = /^\s*▌?[▾▸] \S.* · \d+/;

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  const tall = rows >= 30;
  test(`${cols}x${rows}: AI chats: ${tall ? 'a blank row above every group header' : 'no blank row between groups'}`, async () => {
    s = await renderPage({ page: 'ai', cols, rows });
    const lines = (await s.settle()).split('\n').map(body);
    const heads = lines.flatMap((l, i) => (head.test(l) ? [i] : []));
    expect(heads.length).toBeGreaterThanOrEqual(3);
    for (const i of heads) expect(lines[i - 1]!.trim() === '', `above "${lines[i]!.trim()}"`).toBe(tall);
  }, 180_000);
}
