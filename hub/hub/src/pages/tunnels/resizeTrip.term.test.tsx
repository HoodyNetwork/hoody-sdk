// A frame depends on its size and the data only, never on the sizes before it. Tunnels'
// "Shared as" cell is an inline row that wraps ("Web address" over "seen 09:00 AM") where the column is narrow; the
// one-line row drops the second line. The cell's need is the whole row on one line, whatever a wider window drew
// before, and the table keeps the largest need it hears: 120 → 200 → 120 must draw "Shared as" as a fresh 120 does,
// whole ("Web address seen 09:00 AM"). TableClip clipStateOf counts a wrapped row's one-line need.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const fresh = async (cols: number, rows: number): Promise<string> => {
  const one = await renderPage({ page: 'tunnels', cols, rows });
  try { return await one.settle(); } finally { one.close(); }
};

test('tunnels at 120x40: the reconnecting row reads whole, and the frame after 200x50 is the fresh one', async () => {
  const first = await fresh(120, 40);
  expect(first).toContain('Web address seen 09:00 AM');
  s = await renderPage({ page: 'tunnels', cols: 120, rows: 40 });
  await s.settle();
  await s.resize(200, 50);
  await s.settle();
  await s.resize(120, 40);
  const back = await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(back).toBe(first);
}, 240_000);

test('tunnels at 200x50: the frame after 120x40 (and after 80x24) is the fresh one', async () => {
  const first = await fresh(200, 50);
  for (const [c, r] of [[120, 40], [80, 24]] as const) {
    s = await renderPage({ page: 'tunnels', cols: 200, rows: 50 });
    await s.settle();
    await s.resize(c, r);
    await s.settle();
    await s.resize(200, 50);
    expect(await s.settle()).toBe(first);
    s.close(); s = null;
  }
}, 240_000);

// A cell's read queued under the row set before this one must report to the latest callback (ClipRow does), never throw
// away what the new row set's cells reported. A race like that shows in some runs only, more under load (Port keeping
// 12 cells for "3000" and the address losing 6), so this guard must never fail.
test('tunnels at 120x40: eight fresh renders are one frame', async () => {
  const frames = new Set<string>();
  for (let i = 0; i < 8; i++) frames.add(await fresh(120, 40));
  expect(frames.size).toBe(1);
}, 240_000);
