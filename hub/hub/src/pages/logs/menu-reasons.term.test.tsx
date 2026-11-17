// The logs bar's ⋯ menu: Explain is disabled while no lines are shown (nothing loaded yet, an empty view, a failed
// read), and it now says why (act.explainWait / act.explainEmpty). The kit's ActionMenu logged "disabled item(s)
// without a reason: explain" in every such render.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const fx of ['empty', 'error', 'quiet'] as const) {
  for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
    test(`${fx} at ${cols}x${rows}: no menu item is disabled without a reason`, async () => {
      s = await renderPage({ page: 'logs', fx, path: '/logs', cols, rows });
      await s.settle();
      expect(s.failures).toEqual([]);
      expect(s.errors.filter((e) => e.includes('without a reason'))).toEqual([]);
    }, 120_000);
  }
}
