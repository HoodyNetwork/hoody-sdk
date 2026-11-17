// The top bar's brand is never cut: when the row is short of room something else gives way with "…", never "HOODY" (at
// 60 columns it drew "HOOD": the word shrank with the row and lost its last letter). 80x24 is the smallest frame the
// shell draws (TooSmall.tsx); Billing while the computers load is a short row there (the computer trigger is cut).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { layoutFaults } from '../prim/layoutcheck';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('billing while computers load, 80x24: "HOODY" whole, the row gives way elsewhere', async () => {
  s = await renderPage({ page: 'billing', fx: 'loading', cols: 80, rows: 24 });
  const top = (await s.settle()).split('\n')[0]!;
  expect(top).toContain('HOODY ');
  expect(top).toContain('…');
  const faults = layoutFaults(s.renderer.root as never, { cols: 80, rows: 24 }).filter((f) => f.path.includes('hub-shell-topbar'));
  expect(faults).toEqual([]);
}, 180_000);
