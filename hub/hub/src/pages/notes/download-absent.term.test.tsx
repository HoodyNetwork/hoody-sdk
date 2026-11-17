// Notes in the terminal offers no "Download Markdown". A download saves a file to the device through the page's document
// (core save), which a terminal does not have (core/host-env.ts `files`): pressing it read `document`, which ends a live
// mount, and on fixtures it said "Downloaded" with nothing written. The row menu and the open note's ⋯ menu are built
// from the same list (view.tsx actions), so both leave it out; the web keeps it (download.toast.test.tsx).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

function all(role: Role, name: string | RegExp) {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
}
const itemNames = (): string[] => all('menuitem' as Role, /./).map((n) => n.name);

test('row menu: no Download item (Weekly plan has a body, so the web offers it)', async () => {
  s = await renderPage({ page: 'notes', path: '/notes', cols: 140, rows: 60 });
  await s.settle();
  act(all('button', 'Row actions')[0]!, 'press');
  await s.settle();
  const names = itemNames();
  // The menu is open: its first item is there (opened.term.test.tsx presses it).
  expect(names.some((n) => n.startsWith('Open note'))).toBe(true);
  expect(names.filter((n) => /^Download/.test(n))).toEqual([]);
  expect(s.traps).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

test('an open note\'s ⋯ menu: no Download item', async () => {
  s = await renderPage({ page: 'notes', path: '/notes?sel=c0a7150000000000000000a1~a1b2c3d4e5f6a7b8c9d0e1f1', cols: 120, rows: 40 });
  expect(await s.settle()).toContain('Weekly plan');
  // The "More actions" on screen are opened from the last one back (the detail header's ⋯ comes after the list) until
  // the note's menu is found; each is closed again.
  const seen: string[] = [];
  const count = all('button', /^More actions/).length;
  for (let i = count - 1; i >= 0 && !seen.some((n) => n.startsWith('Delete note')); i--) {
    const b = all('button', /^More actions/)[i];
    if (!b) continue;
    act(b, 'press');
    await s.settle();
    seen.push(...itemNames());
    await s.keys.press('escape');
    await s.settle();
  }
  // The note's menu was among them: it holds Delete note (removeItems), which no other menu here has.
  expect(seen.some((n) => n.startsWith('Delete note'))).toBe(true);
  expect(seen.filter((n) => /^Download/.test(n))).toEqual([]);
  expect(s.traps).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);
