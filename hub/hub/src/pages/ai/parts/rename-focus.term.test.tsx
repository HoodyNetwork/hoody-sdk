// A chat in a terminal: Rename (the chat's ⋯ menu) opens on Chat name, as on the web. It opened on Cancel: a typed name
// went nowhere, and Enter cancelled.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../../term/prim/semantics';
import strings from './ConvMenu.strings.en.json';

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';

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
/** Waits for an enabled node of that role and name (the chat page loads its parts after the first frame), then presses
 *  it. */
async function press(p: PageSession, role: Role, name: string): Promise<void> {
  const end = performance.now() + 20_000;
  const find = (): SemNode[] => queryAllByRole(tree(p), role, { name }).filter((n) => !n.states.disabled);
  let found = find();
  while (found.length === 0 && performance.now() < end) {
    await new Promise((r) => setTimeout(r, 250));
    await p.settle();
    found = find();
  }
  expect(found.length).toBeGreaterThan(0);
  act(found[0]!, 'press');
  await p.settle();
}
const field = (p: PageSession): SemNode | undefined => queryAllByRole(tree(p), 'textbox', { name: strings['rename.label'] })[0];

test('120x40: Rename from the chat menu opens on Chat name, and a typed key lands there', async () => {
  const p = await renderPage({ page: 'ai', path: `/ai/c/s-today?computer=atlas.00a1&realm=${REALM}`, cols: 120, rows: 40, settleMs: 3000 });
  s = p;
  await p.settle();
  await press(p, 'button', strings['menu.label']);
  // A menu item that opens a dialog is named with "…" in the terminal (kit Menu.model menuLabel).
  await press(p, 'menuitem' as Role, `${strings['menu.rename']}…`);
  expect(queryAllByRole(tree(p), 'alertdialog', { name: strings['rename.title'] })).toHaveLength(1);
  expect(focused(p)).toEqual({ role: 'textbox', name: strings['rename.label'] });
  const before = field(p)?.value ?? '';
  await p.keys.type('x');
  await p.settle();
  const after = field(p)?.value ?? '';
  expect(after).not.toBe(before);
  expect(after).toContain('x');
  expect(queryAllByRole(tree(p), 'alertdialog', { name: strings['rename.title'] })).toHaveLength(1);
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
}, 240_000);
