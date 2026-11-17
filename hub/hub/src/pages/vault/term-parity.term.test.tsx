// Vault in the terminal does what the web does: with one pane (too narrow for list and detail) the open entry has only
// its way back, no list control; the empty vault's import button names what the terminal's import takes; opening an
// encrypted entry with no password puts the caret in Password.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};
const tabTo = async (p: PageSession, name: string): Promise<void> => {
  for (let i = 0; i < 160 && focused(p) !== name; i++) await p.keys.press('tab');
  expect(focused(p)).toBe(name);
};

test('80x24, one pane: the open entry shows its way back and no Hide list / Show list; \\ changes nothing', async () => {
  s = await renderPage({ page: 'vault', cols: 80, rows: 24, path: '/vault?sel=deploy.notes' });
  const f = await s.settle();
  expect(f).toContain('‹ ');
  expect(f).not.toContain('Hide list');
  expect(f).not.toContain('Show list');
  await s.keys.press('\\');
  const g = await s.settle();
  expect(g).not.toContain('Show list');
  expect(g).not.toContain('Hide list');
}, 240_000);

test('160x45, both panes: the open entry keeps Hide list', async () => {
  s = await renderPage({ page: 'vault', cols: 160, rows: 45, path: '/vault?sel=deploy.notes' });
  expect(await s.settle()).toContain('Hide list');
}, 240_000);

test('120x40, empty vault: the import button says Import entries…', async () => {
  s = await renderPage({ page: 'vault', fx: 'empty', cols: 120, rows: 40 });
  const f = await s.settle();
  expect(f).toContain('Import entries…');
  expect(f).not.toContain('Import .env');
}, 240_000);

test('120x40, encrypted entry: Open with no password says so and puts the caret in Password', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: '/vault?sel=db-password' });
  await tabTo(s, 'Value');
  await s.keys.press('enter');
  await s.settle();
  await tabTo(s, 'Open');
  await s.keys.press('enter');
  expect(await s.settle()).toContain('Type the password first.');
  expect(focused(s)).toBe('Password');
}, 240_000);
