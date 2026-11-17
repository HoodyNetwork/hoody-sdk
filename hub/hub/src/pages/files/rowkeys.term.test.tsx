// The keys a Files row declares (view.tsx: Rename `key: 'F2'`, Delete `key: 'Delete'`) work in the terminal as on the
// web. A row action's `key` is the web's KeyboardEvent.key; the terminal table matched it against the engine's own key
// name ('f2', 'delete'), so both keys did nothing there. Letter keys ('p', 't') were never affected: both names agree.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** /srv/app with the table's cursor on package.json, its second row (after the public folder; opened.term.test.tsx). */
async function onPackageJson(): Promise<PageSession> {
  const p = await renderPage({ page: 'files', path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp', cols: 120, rows: 40 });
  await p.settle();
  await p.keys.press('down');
  await p.settle();
  return p;
}

async function waitFor(p: PageSession, want: string): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < 30 && !frame.includes(want); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await p.settle(); }
  return frame;
}

test('F2 on a row opens Rename for that row', async () => {
  s = await onPackageJson();
  expect(s.frame).not.toContain('Rename package.json');
  await s.keys.press('f2');
  const frame = await waitFor(s, 'Rename package.json');
  expect(frame).toContain('Rename package.json');
  expect(s.trapsAt).toEqual([]);
}, 180_000);

test('Delete on a row opens Delete for that row', async () => {
  s = await onPackageJson();
  expect(s.frame).not.toContain('Delete package.json?');
  await s.keys.press('delete');
  const frame = await waitFor(s, 'Delete package.json?');
  expect(frame).toContain('Delete package.json?');
  expect(s.trapsAt).toEqual([]);
}, 180_000);
