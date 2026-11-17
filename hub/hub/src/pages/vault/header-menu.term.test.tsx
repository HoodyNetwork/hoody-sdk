// Vault at 80x24: More vault actions is the page header's own ⋯ (PageHeader `menu`), drawn on the header's end side in
// the terminal too, and it opens with Import and Clear; a terminal leaves Export out (export-menu.term.test.tsx).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};

test('at 80x24 the vault header ⋯ is reachable and opens Import and Clear', async () => {
  s = await renderPage({ page: 'vault', cols: 80, rows: 24 });
  await s.settle();
  for (let i = 0; i < 160 && focused(s) !== 'More vault actions'; i++) await s.keys.press('tab');
  expect(focused(s)).toBe('More vault actions');
  await s.keys.press('enter');
  const frame = await s.settle();
  expect(frame).toContain('Import entries…');
  expect(frame).toContain('Clear vault…');
  expect(frame).not.toContain('Export vault…');
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
