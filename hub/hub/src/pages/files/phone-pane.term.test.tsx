// Two panes on a narrow terminal (80x24) show one at a time under a From / To switch (view.tsx, s.phone). The pane and
// its folder are `flex: 1` (a zero basis) in a column whose height is its content's: the terminal drew both at no
// height, so the switch stood over an empty pane (section.pane 78x1 inside a 78x2 box). The translator's dom.ts now
// sizes an unset-height column item by its content.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const TWO = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&b=atlas.00a1&bp=%2Fsrv';

test('80x24 From side: the pane shows its folder', async () => {
  s = await renderPage({ page: 'files', path: TWO, cols: 80, rows: 24 });
  const frame = await s.settle();
  expect(s.failures).toEqual([]);
  expect(frame).toContain('From');
  for (const name of ['public', 'package.json', 'server.js']) expect(frame).toContain(name);
}, 120_000);

test('80x24 To side: the pane shows its folder', async () => {
  s = await renderPage({ page: 'files', path: `${TWO}&side=b`, cols: 80, rows: 24 });
  const frame = await s.settle();
  expect(s.failures).toEqual([]);
  expect(frame).toContain('app');
  expect(frame).toMatch(/\d+ items?/);
}, 120_000);
