// A frame depends on its size and the data only, never on the sizes before it. The Bare
// metal table must not keep its 120-column widths after the window shrinks to 80: a cell with its
// own width could report that width as its need even where the column squeezed it, and the table keeps the largest need
// it heard. TableClip counts a need only up to the room its box has; this pins the whole frame.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

const PATH = '/billing?view=servers';
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const fresh = async (cols: number, rows: number): Promise<string> => {
  const one = await renderPage({ page: 'billing', path: PATH, cols, rows });
  try { return await one.settle(); } finally { one.close(); }
};

for (const [from, to] of [[[120, 40], [80, 40]], [[160, 45], [80, 40]], [[120, 40], [80, 24]], [[80, 24], [120, 40]]] as const) {
  test(`Bare metal: ${from[0]}x${from[1]} resized to ${to[0]}x${to[1]} is the fresh ${to[0]}x${to[1]} frame`, async () => {
    const first = await fresh(to[0], to[1]);
    expect(first).toContain('Location');
    s = await renderPage({ page: 'billing', path: PATH, cols: from[0], rows: from[1] });
    await s.settle();
    await s.resize(to[0], to[1]);
    const after = await s.settle();
    expect(s.trapsAt).toEqual([]);
    expect(after).toBe(first);
  }, 240_000);
}

// A taller-only bounce: 80x24 → 80x60 → 80x24 is the fresh 80x24 frame too.
test('Bare metal: 80x24 bounced through 80x60 is the fresh 80x24 frame', async () => {
  const first = await fresh(80, 24);
  s = await renderPage({ page: 'billing', path: PATH, cols: 80, rows: 24 });
  await s.settle();
  await s.resize(80, 60);
  await s.settle();
  await s.resize(80, 24);
  const after = await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(after).toBe(first);
}, 240_000);
