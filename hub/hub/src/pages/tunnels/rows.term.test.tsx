// Tunnels in the terminal at 80 columns: a row's mark (New) stays on the row's own line, and the Setup drawer names
// its first step once.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};
const count = (frame: string, words: string): number => frame.split(words).length - 1;

test('80x24, Setup: "What to connect" is said once, by the step', async () => {
  s = await renderPage({ page: 'tunnels', cols: 80, rows: 24, path: '/tunnels?setup=new' });
  const f = await s.settle();
  expect(f).toContain('Put a laptop app online');
  expect(count(f, 'What to connect')).toBe(1);
}, 240_000);

test('80x24, rows that appeared: New sits beside "Inside this computer", never on a line of its own', async () => {
  s = await renderPage({ page: 'tunnels', fx: 'appears', cols: 80, rows: 24, path: '/tunnels?setup=new' });
  await s.settle();
  await s.keys.press('escape');
  await s.settle();
  for (let i = 0; i < 160 && focused(s) !== 'Refresh'; i++) await s.keys.press('tab');
  expect(focused(s)).toBe('Refresh');
  await s.keys.press('enter');
  let f = await s.settle();
  for (let i = 0; i < 20 && !f.includes('127.0.0.2:5432'); i++) { await new Promise((r) => setTimeout(r, 250)); f = await s.settle(); }
  expect(f).toContain('Inside this computer ◆ New');
  expect(f.split('\n').filter((line) => /^[\s█▌]*◆ New[\s█]*$/.test(line))).toEqual([]);
}, 240_000);
