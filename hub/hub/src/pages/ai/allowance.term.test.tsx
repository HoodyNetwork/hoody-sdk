// The allowance table in the terminal: a lane's cell is one row, its percent and then its bar, and nothing in the table
// is drawn over something else or wrapped into a column too narrow for it.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { layoutFaults } from '../../term/prim/layoutcheck';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

for (const cols of [80, 100, 140]) test(`allowance at ${cols} cols: each lane reads percent then bar on one row, no overdraw`, async () => {
  s = await renderPage({ page: 'ai', path: '/ai/models', cols, rows: 110 });
  for (let i = 0; i < 3; i++) await s.settle();
  const faults = layoutFaults((s.renderer as unknown as { root: never }).root, { cols, rows: 110 });
  expect(faults.filter((f) => f.path.includes('AllowanceSection')).map((f) => `${f.kind} ${f.path} ${f.detail}`)).toEqual([]);
  const lines = s.frame.split('\n');
  // The table's row of that server: the line with its name and a reading.
  const row = (name: string) => lines.find((l) => l.includes(` ${name} `) && l.includes('%')) ?? '';
  // Every percent on the row stands whole, right before its own bar (a lit or an unlit block); a bar wider than its
  // column is cut once, at its end.
  for (const name of ['atlas', 'build-box']) {
    const r = row(name);
    expect(r, s.frame).toMatch(/\d+% [█░]/);
    expect(r.match(/\d+%/g)!.length, r).toBe(r.match(/\d+% [█░]/g)!.length);
    expect(r, r).not.toMatch(/[█░]…[█░]|…\d*%/);
  }
}, 180_000);
