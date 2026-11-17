// A note's addresses in the terminal. The row menu's Copy link copies the note's own address in its computer's Notes
// (logic.ts noteLink, the address Open note opens) and Copy read-only link the same with Notes' read-only view, each
// exactly; the copy is read off the renderer (prim/testing.ts copiesOf), never kept. A computer whose Notes has no web
// address (fixture noAddress: atlas has no routing host) leaves Open note and both copy items disabled, their one reason
// said once in the menu, and choosing one copies nothing; the note opened there says it has no web address, keeps Open
// in a new tab off and draws no hand-off. A link to a note on a computer the list does not hold says so (NoteMissing).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { copiesOf } from '../../term/prim/testing';
import { act, queryAllByRole, queryAllByText, semanticsOf, type Role, type RoleQuery, type SemNode } from '../../term/prim/semantics';
import kit from '../../kit/strings.en.json';
import notesTerm from './parts/notesTerm.strings.en.json';
import strings from './strings.en.json';

/** Weekly plan on atlas, the first row (fixtures.ts default; opened.term.test.tsx opens the same address). */
const NOTE_URL = 'https://6a0000000000000000000001-c0a7150000000000000000a1-notes-1.n12.fixture.invalid/notebook/a1b2c3d4e5f6a7b8c9d0e1f2/a1b2c3d4e5f6a7b8c9d0e1f1';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const all = (role: Role, name: string | RegExp, o: Omit<RoleQuery, 'name'> = {}): SemNode[] => queryAllByRole(tree(), role, { name, ...o });
/** How many text runs say `text` (whole, however the frame wraps it). */
const said = (text: string): number => queryAllByText(tree(), text).length;
function clean(p: PageSession): void {
  expect(p.failures).toEqual([]);
  expect(p.trapsAt).toEqual([]);
}

/** The first row's menu (atlas's Weekly plan), open. */
async function rowMenu(): Promise<void> {
  act(all('button', kit['table.rowActions'])[0]!, 'press');
  await s!.settle();
}
async function choose(label: string): Promise<void> {
  await rowMenu();
  const item = all('menuitem', label);
  expect(item).toHaveLength(1);
  act(item[0]!, 'press');
  await s!.settle();
}

test('Copy link and Copy read-only link copy exactly the note\'s own address', async () => {
  s = await renderPage({ page: 'notes', cols: 140, rows: 60 });
  await s.settle();
  const copies = copiesOf(s.renderer);
  await choose(strings['action.copyLink']);
  expect(copies).toEqual([NOTE_URL]);
  await s.keys.press('escape');
  await choose(strings['action.copyReadOnly']);
  expect(copies).toEqual([NOTE_URL, `${NOTE_URL}?mode=readonly`]);
  clean(s);
}, 180_000);

test('no web address: Open note and both copy items are off, their reason said once, and choosing one copies nothing', async () => {
  s = await renderPage({ page: 'notes', fx: 'noAddress', cols: 140, rows: 60 });
  await s.settle();
  const copies = copiesOf(s.renderer);
  await rowMenu();
  for (const label of [strings['action.openNote'], strings['action.copyLink'], strings['action.copyReadOnly']]) {
    const item = all('menuitem', label);
    expect(item).toHaveLength(1);
    expect(item[0]!.states.disabled).toBe(true);
  }
  // One reason for the three, said once at the menu's top (Menu.model notes), never once per item.
  expect(said(strings['action.noAddress'])).toBe(1);
  // Open here still works: it opens the note beside the list.
  expect(all('menuitem', strings['action.openHere'], { disabled: false })).toHaveLength(1);
  act(all('menuitem', strings['action.copyLink'])[0]!, 'press', undefined, { force: true });
  await s.settle();
  expect(copies).toEqual([]);
  clean(s);
}, 180_000);

test('no web address: the open note says so, Open in a new tab is off, and no hand-off is drawn', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'notes', fx: 'noAddress', cols: 120, rows: 40, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  await choose(strings['action.openHere']);
  expect(said(strings['action.noAddress'])).toBeGreaterThan(0);
  expect(all('button', strings['action.openNoteTab'], { disabled: true })).toHaveLength(1);
  // The hand-off stands in for a frame of the note's address; with no address there is no frame and no hand-off.
  expect(said(notesTerm['term.note.reason'])).toBe(0);
  expect(said(strings['note.cantShow'])).toBe(0);
  expect(opened).toEqual([]);
  clean(s);
}, 180_000);

test('a link to a note whose computer is not in the list says so, and offers no address', async () => {
  s = await renderPage({ page: 'notes', path: '/notes?sel=nocomputer~0a1b2c3d4e5f6a7b8c9d0e1fff', cols: 120, rows: 40 });
  await s.settle();
  expect(said(strings['note.noComputer'])).toBeGreaterThan(0);
  expect(said(strings['note.gone'])).toBe(0);
  expect(said(strings['note.reading'])).toBe(0);
  expect(all('button', strings['action.openNoteTab'])).toHaveLength(0);
  clean(s);
}, 180_000);
