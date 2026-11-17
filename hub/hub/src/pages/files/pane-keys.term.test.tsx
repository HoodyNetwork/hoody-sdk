// Files, a folder pane's own keys in the terminal (folderKeys.term.ts): Backspace goes up, Shift+N makes a folder, for
// the pane that holds the focus, as on the web (folderKeys.ts listens on the pane's box). Before, both panes declared
// the same keys and the page shortcut store kept the first-mounted copy: with pane B's list focused, Backspace moved
// pane A up and Shift+N asked for a folder in pane A's folder.
//
// | # | Panes | Focus | Key | Wants |
// |---|---|---|---|---|
// | 1 | A /srv/app, B /srv | B's list | Backspace | B shows / (etc), A still /srv/app (server.js) |
// | 2 | A /srv/app, B /srv | B's list | Shift+N | "Make a folder in srv." (B's folder), never "in app." |
// | 3 | A /srv/app alone | its list | Backspace | A shows /srv (media) |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const TWO = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp&b=atlas.00a1&bp=%2Fsrv';
const ONE = '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp';

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: unknown; stdin: unknown };
  return semanticsOf({ root: r.root, stdin: r.stdin } as never);
};
const rows = (p: PageSession): SemNode[] => queryAllByRole(tree(p), 'row');
/** The listing row whose words hold `name` (fixtures: server.js and public in /srv/app, media in /srv, etc in /). */
const rowNamed = (p: PageSession, name: string): SemNode | null => rows(p).find((r) => r.name.includes(name)) ?? null;
/** The row names of the pane whose rows start at column `x` (the two panes sit side by side). */
const paneRows = (p: PageSession, x: number): string[] => rows(p).filter((r) => r.box[0] === x).map((r) => r.name);

/** Settles until `ok`, a few seconds at most (a folder move reads the new folder first). */
async function until(p: PageSession, ok: () => boolean): Promise<void> {
  await p.settle();
  for (let i = 0; i < 30 && !ok(); i++) { await new Promise((q) => setTimeout(q, 100)); await p.settle(); }
}

async function twoPanes(): Promise<{ p: PageSession; a: number; b: SemNode }> {
  const p = await renderPage({ page: 'files', path: TWO, cols: 200, rows: 50 });
  s = p;
  await until(p, () => rowNamed(p, 'server.js') !== null && rowNamed(p, 'media') !== null);
  const a = rowNamed(p, 'server.js');
  const b = rowNamed(p, 'media');
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  // Pane A on the left, pane B on the right.
  expect(b!.box[0]).toBeGreaterThan(a!.box[0]);
  return { p, a: a!.box[0], b: b! };
}

test('two panes: Backspace with pane B focused moves pane B up and leaves pane A where it was', async () => {
  const { p, a, b } = await twoPanes();
  const bx = b.box[0];
  act(b, 'focus');
  await p.settle();
  await p.keys.press('backspace');
  await until(p, () => paneRows(p, bx).some((n) => n.includes('etc')));
  expect(paneRows(p, bx).some((n) => n.includes('etc'))).toBe(true);
  expect(paneRows(p, a).some((n) => n.includes('server.js'))).toBe(true);
  expect(paneRows(p, a).some((n) => n.includes('media'))).toBe(false);
  expect(p.failures).toEqual([]);
}, 120_000);

test('two panes: Shift+N with pane B focused asks for a folder in pane B\'s folder', async () => {
  const { p, b } = await twoPanes();
  act(b, 'focus');
  await p.settle();
  await p.keys.press('N');
  await until(p, () => p.frame.includes('Make a folder in'));
  expect(p.frame).toContain('Make a folder in srv.');
  expect(p.frame).not.toContain('Make a folder in app.');
  expect(p.failures).toEqual([]);
}, 120_000);

test('one pane: Backspace in its list still goes up', async () => {
  s = await renderPage({ page: 'files', path: ONE, cols: 200, rows: 50 });
  const p = s;
  await until(p, () => rowNamed(p, 'server.js') !== null);
  const row = rowNamed(p, 'server.js');
  expect(row).not.toBeNull();
  act(row!, 'focus');
  await p.settle();
  await p.keys.press('backspace');
  await until(p, () => rowNamed(p, 'media') !== null);
  expect(rowNamed(p, 'media')).not.toBeNull();
  expect(rowNamed(p, 'server.js')).toBeNull();
  expect(p.failures).toEqual([]);
}, 120_000);
