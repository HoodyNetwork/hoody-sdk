// Computers in a terminal: the delete confirm and the create drawer's answers, as on the web.
// - Delete asks for the computer's name: Delete computer stays off until it is typed; Esc closes and deletes nothing.
// - Get computer whose answer is lost: the drawer says the computer may already have been made, offers Check again,
//   and never offers Get computer again (it is never sent twice).
// - Get computer refused for a name in use: the drawer says so in its own words.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, queryAllByText, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
async function press(p: PageSession, role: Role, name: string, within?: SemNode): Promise<void> {
  const found = queryAllByRole(within ? within.children : tree(p), role, { name });
  expect(found.length).toBeGreaterThan(0);
  act(found[0]!, 'press');
  await p.settle();
}
const dialogs = (p: PageSession, role: Role, name: RegExp | string): SemNode[] => queryAllByRole(tree(p), role, { name });
function clean(p: PageSession): void {
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
  expect(p.frame).not.toContain('could not be drawn');
}
const before = (key: string): string => key.split('{{')[0]!;

test('120x40: Delete waits for the typed name, and Esc closes it with nothing deleted', async () => {
  s = await renderPage({ page: 'computers', path: '/computers', cols: 120, rows: 40 });
  expect(await s.settle()).toContain('8 computers');
  // The first row is atlas (as in opened.term.test.tsx).
  await press(s, 'button', 'Row actions');
  await press(s, 'menuitem' as Role, strings['menu.delete']);
  const title = `${before(strings['delete.title'])}atlas`;
  expect(dialogs(s, 'alertdialog', title)).toHaveLength(1);
  expect(queryAllByText(tree(s), strings['delete.c1'])).not.toHaveLength(0);
  expect(queryAllByText(tree(s), strings['delete.c2'])).not.toHaveLength(0);
  // It opens on the typed field, never on the action.
  expect(focusedNode(tree(s))?.role).toBe('textbox');
  const go = () => queryAllByRole(dialogs(s!, 'alertdialog', title)[0]!.children, 'button', { name: strings['delete.go'] })[0];
  expect(go()).toBeDefined();
  expect(go()?.states.disabled).toBe(true);
  await s.keys.type('atlas');
  await s.settle();
  expect(go()?.states.disabled).toBeUndefined();
  await s.keys.press('escape');
  await s.settle();
  expect(dialogs(s, 'alertdialog', title)).toHaveLength(0);
  expect(s.frame).toContain('8 computers');
  clean(s);
}, 240_000);

test('120x40: a create whose answer is lost is held: Check again offered, Get computer never again', async () => {
  s = await renderPage({ page: 'computers', path: '/computers', cols: 120, rows: 40, fx: 'pendingOps' });
  await s.settle();
  await press(s, 'button', strings['action.get']);
  const drawer = () => dialogs(s!, 'dialog', strings['create.title'])[0];
  expect(drawer()).toBeDefined();
  await press(s, 'button', strings['create.go'], drawer());
  const held = new RegExp(strings['held.create'].split('}}')[1]!.trim().split('.')[0]!);
  expect(queryAllByText(tree(s), held)).not.toHaveLength(0);
  expect(queryAllByRole(drawer()!.children, 'button', { name: strings['held.check'] })).not.toHaveLength(0);
  const again = queryAllByRole(drawer()!.children, 'button', { name: strings['create.go'] }).filter((n) => n.states.disabled !== true);
  expect(again).toEqual([]);
  clean(s);
}, 240_000);

test('120x40: a create refused for a name in use says so in the drawer', async () => {
  s = await renderPage({ page: 'computers', path: '/computers', cols: 120, rows: 40, fx: 'failedOps' });
  await s.settle();
  await press(s, 'button', strings['action.get']);
  const drawer = () => dialogs(s!, 'dialog', strings['create.title'])[0];
  expect(drawer()).toBeDefined();
  await press(s, 'button', strings['create.go'], drawer());
  expect(queryAllByText(tree(s), strings['create.refused.COMPUTER_NAME_IN_USE'])).not.toHaveLength(0);
  expect(drawer()).toBeDefined();
  clean(s);
}, 240_000);
