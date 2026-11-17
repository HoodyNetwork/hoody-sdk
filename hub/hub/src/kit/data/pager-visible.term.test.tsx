// A paged list keeps its pager on the page's first screen: a table flowing in the page scroll (Bots) gives up rows so
// "1–20 of 23 ‹ ›" stays above the fold; a table filling its pane (Demo) keeps its footer as it was.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [page, range] of [['bots', '1–20 of 23'], ['demo', '1–50 of 120']] as const) {
  for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
    test(`${page} ${cols}x${rows}: the pager "${range}" is on the first screen`, async () => {
      s = await renderPage({ page, cols, rows });
      const frame = await s.settle();
      expect(frame).toMatch(new RegExp(`${range}\\s+‹ ›`));
    }, 180_000);
  }
}
