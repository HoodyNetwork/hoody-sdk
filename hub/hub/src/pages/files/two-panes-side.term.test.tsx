// Two panes sit side by side in a terminal: twoPanes.term.tsx draws pane A, the Splitter and pane B as one row, at the
// even split until the Splitter moves it (split-moves.term.test.tsx). A grid with no tracks drew pane B under pane A and
// the Splitter over a pane (census: overdraw).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const TWO = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&b=atlas.00a1&bp=%2Fsrv';

test('200x50: both panes share their rows (path bars on one line)', async () => {
  s = await renderPage({ page: 'files', path: TWO, cols: 200, rows: 50 });
  const frame = await s.settle();
  const bars = frame.split('\n').filter((l) => l.includes('Up one folder'));
  expect(bars.length).toBe(1);
  expect(bars[0]!.split('Up one folder').length - 1).toBe(2);
  expect(s.failures).toEqual([]);
}, 120_000);
