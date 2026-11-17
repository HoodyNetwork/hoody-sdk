// Files with two panes in a terminal, under the strict DOM globals: the split's room is the measured row of
// twoPanes.term.tsx, never ResizeObserver (a global the terminal Hub does not have). Reading `typeof ResizeObserver`
// there traps and draws "This page could not be drawn" (goldens case shot-two-panes).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const TWO = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&b=atlas.00a1&bp=%2Fsrv';

for (const [cols, rows] of [[120, 40], [200, 50]] as const) {
  test(`${cols}x${rows}: two panes draw with no trap and no page error`, async () => {
    s = await renderPage({ page: 'files', path: TWO, cols, rows });
    const frame = await s.settle();
    expect(s.traps).toEqual([]);
    expect(s.failures).toEqual([]);
    expect(frame).not.toContain('could not be drawn');
  }, 120_000);
}
