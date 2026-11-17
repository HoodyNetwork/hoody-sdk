// The Bot pane in the terminal, small frame first: what a person must be able to read is on screen and whole.
// - a frozen link says why beside its state at 80x24 (the reason sat in a notice below the first screen);
// - a change still going out says how far it is beside the state at 80x24;
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

const SEL = 'sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

async function frame(o: { fx?: string; tab: string; cols: number; rows: number; has: string }): Promise<string> {
  s = await renderPage({ page: 'bots', ...(o.fx ? { fx: o.fx } : {}), path: `/bots?${SEL}&tab=${o.tab}`, cols: o.cols, rows: o.rows, settleMs: 3000 });
  const end = performance.now() + 30_000;
  while (!s.frame.includes(o.has) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
  return s.frame;
}
// A sentence the frame may have wrapped: read with the frame's rules dropped and every run of spaces as one space.
const flat = (f: string) => f.replace(/[│▌█▀▄]/g, ' ').replace(/\s+/g, ' ');

test('80x24: a frozen link says why and what to do on the first screen', async () => {
  const f = await frame({ fx: 'linkFrozen', tab: 'link', cols: 80, rows: 24, has: 'Frozen' });
  expect(flat(f), f).toContain('The account has an unpaid balance.');
  expect(flat(f), f).toContain('write to Support');
}, 180_000);

test('80x24: a change still going out says how far it is on the first screen', async () => {
  const f = await frame({ fx: 'linkPropagating', tab: 'link', cols: 80, rows: 24, has: 'At a glance' });
  expect(flat(f), f).toContain('Applying: 1 of 3 computers done');
}, 180_000);
