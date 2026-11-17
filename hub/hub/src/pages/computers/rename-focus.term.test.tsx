// Computers in a terminal: Rename opens on the name to type, as on the web. It opened on Cancel: a typed name went
// nowhere, and Enter cancelled.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const focused = (p: PageSession): { role: string; name: string } | null => {
  const n = focusedNode(tree(p));
  return n ? { role: n.role, name: n.name } : null;
};
async function press(p: PageSession, role: Role, name: string): Promise<void> {
  const found = queryAllByRole(tree(p), role, { name });
  expect(found.length).toBeGreaterThan(0);
  act(found[0]!, 'press');
  await p.settle();
}

test('120x40: Rename from the row menu opens on the New name field, and a typed key reaches it', async () => {
  s = await renderPage({ page: 'computers', path: '/computers', cols: 120, rows: 40 });
  await s.settle();
  await press(s, 'button', 'Row actions');
  await press(s, 'menuitem' as Role, strings['menu.rename']);
  const title = new RegExp(`^${strings['rename.title'].split('{{')[0]}\\S`);
  expect(queryAllByRole(tree(s), 'alertdialog', { name: title })).toHaveLength(1);
  expect(focused(s)).toEqual({ role: 'textbox', name: strings['rename.label'] });
  // Rename is off while the name is the computer's own; one typed key turns it on, so the key reached the field.
  const dialog = () => queryAllByRole(tree(s!), 'alertdialog', { name: title })[0]!;
  const go = () => queryAllByRole(dialog().children, 'button', { name: strings['rename.go'] })[0];
  expect(go()).toBeDefined();
  expect(go()?.states.disabled).toBe(true);
  await s.keys.type('2');
  await s.settle();
  expect(go()?.states.disabled).toBeUndefined();
  expect(queryAllByRole(tree(s), 'alertdialog', { name: title })).toHaveLength(1);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
