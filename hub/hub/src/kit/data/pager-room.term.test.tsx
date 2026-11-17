// A list that flows with the page and stops to leave its pager on the first screen stops on a whole item (the last
// row shown keeps its second line), and a tall terminal puts one blank row between it and the pager.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const body = (l: string): string => l.replace(/^.*│/, '').replace(/[░▀▄█]/g, '');

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: Bots: the row above the pager is ${rows >= 30 ? 'blank, and the one above it ends an item' : 'the end of an item, not a name line'}`, async () => {
    s = await renderPage({ page: 'bots', cols, rows });
    const lines = (await s.settle()).split('\n');
    const at = lines.findIndex((l) => /1–20 of 23/.test(l));
    expect(at).toBeGreaterThan(0);
    let i = at - 1;
    if (rows >= 30) { expect(body(lines[i]!).trim()).toBe(''); i--; }
    // A name line carries the Bot's state (● …); an item's later lines never do.
    expect(body(lines[i]!)).not.toContain('●');
    expect(body(lines[i]!).trim()).not.toBe('');
  }, 240_000);
}
