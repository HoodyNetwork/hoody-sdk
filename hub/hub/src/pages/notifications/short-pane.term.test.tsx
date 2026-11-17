// A short terminal: the inbox has few lines for its rows. The table asks its parent for the lines it still has below
// the window; that ask was a bottom margin on the rows' own box, and once it was larger than the pane the rows were
// laid out 0 tall: at 20 rows the list and the table drew eight blank lines beside the scrollbar. 24 rows is the least
// the shell draws its frame in (TooSmall.tsx): checked there without the sidebar and with it (a narrower pane).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[80, 24], [100, 24]] as const) {
  test(`${cols}x${rows}: the inbox draws its rows`, async () => {
    s = await renderPage({ page: 'notifications', cols, rows });
    const frame = await s.settle();
    expect(frame).toContain('Computer atlas stopped');
    expect(frame).toContain('Payment received for borealis');
    expect(s.failures).toEqual([]);
  }, 180_000);
}
