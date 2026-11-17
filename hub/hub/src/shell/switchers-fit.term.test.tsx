// The top bar's realm and computer triggers when the bar is short (80 columns, long computer name or long page title):
// a short realm label and the account initials stay whole, every trigger keeps its ▾, and the computer name takes
// the loss. The bar once drew a cut realm label beside a cut computer name, both carets gone.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../scripts/term/render';
import { layoutFaults } from '../term/prim/layoutcheck';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const topOf = async (page: string, fx: string | null, cols: number, rows: number): Promise<string> => {
  s = await renderPage({ page, fx, cols, rows });
  const top = (await s.settle()).split('\n')[0]!;
  const faults = layoutFaults(s.renderer.root as never, { cols, rows }).filter((f) => f.path.includes('hub-shell-topbar'));
  expect(faults).toEqual([]);
  return top;
};

test('home, long computer name, 80x24: realm whole, both carets, the computer name cut', async () => {
  const top = await topOf('home', 'longName', 80, 24);
  expect(top).toContain('◆ Personal ▾');
  expect(top).toMatch(/● production-[^ ]*… ▾/);
  expect(top).toContain('[A]');
}, 180_000);

test('billing, long title while computers load, 80x24: realm whole with its caret', async () => {
  const top = await topOf('billing', 'loading', 80, 24);
  expect(top).toContain('◆ Personal ▾');
  expect(top.match(/▾/g)?.length).toBe(2);
}, 180_000);

test('wide bar, 120x40: nothing is cut', async () => {
  const top = await topOf('home', 'longName', 120, 40);
  expect(top).toContain('◆ Personal ▾');
  expect(top).toContain('● production-build-runner-singapore');
  expect(top).not.toContain('…');
}, 180_000);
