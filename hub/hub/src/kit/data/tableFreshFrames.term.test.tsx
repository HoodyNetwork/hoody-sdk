// A table's columns depend on the pane's width and the data only, never on the widths the table passed through while
// the page started. Before TableClip's need was made independent of the cell's current
// width, fresh renders of one page drew one of two column sets: scripts 160x45 3 of 6 ("Script" 19 or 26 cells),
// schedules 120x40 3 of 10 (Name 31 or 36). By chance on the old code, so these must never fail on the new.
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

for (const [page, cols, rows] of [['scripts', 160, 45], ['schedules', 120, 40]] as const) {
  test(`${page} ${cols}x${rows}: six fresh renders are one frame`, async () => {
    const frames = new Set<string>();
    for (let i = 0; i < 6; i++) { const s = await renderPage({ page, cols, rows }); try { frames.add(await s.settle()); } finally { s.close(); } }
    expect(frames.size).toBe(1);
  }, 300_000);
}
