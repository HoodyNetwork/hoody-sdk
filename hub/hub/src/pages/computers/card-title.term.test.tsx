// Computers in Cards view: the page's name cell is two stacked lines (the name; the project and the Current chip). The
// terminal draws a card as a list row whose name takes ONE row, so the second line was dropped and every name ended
// in "…" ("atlas…") with room to spare. The kit lays a card's stacked title on that row instead, " · " between the
// lines, as the page's own one-line variant reads; "…" only when the row is too narrow for it.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 30], [120, 40]] as const) {
  test(`${cols}x${rows}: a card's name row holds the name, the project and the chip, with no cut`, async () => {
    s = await renderPage({ page: 'computers', cols, rows });
    const lines = (await s.settle()).split('\n');
    const atlas = lines.find((l) => l.includes('atlas ·') && l.includes('Running')) ?? '';
    expect(atlas).toContain('atlas · Home base · Current');
    const cedar = lines.find((l) => l.includes('cedar')) ?? '';
    expect(cedar).toContain('cedar · Home base');
    // No name is cut: there is room for every one of them.
    expect(lines.filter((l) => /\b(atlas|borealis|cedar|dune|ember|fjord)…/.test(l))).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 180_000);
}
