// A folder's repository in a terminal: New branch and Add a worktree open on the field to type, as on the web. They
// opened on Cancel: a typed name went nowhere.
import { afterEach, expect, test } from 'bun:test';
import { computerHandle, fixtureWorld } from '@core';
import { renderPage, type PageSession } from '../../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../../term/prim/semantics';
import { folderKey } from './key';
import strings from './strings.en.json';

const borealis = fixtureWorld.computers.find((c) => c.name === 'borealis')!;
const SHOP = '/home/ada/projects/shop';
const URL_ = `/ai/f/${folderKey(SHOP)}?${new URLSearchParams({ computer: computerHandle(borealis), realm: borealis.realm_ids[0]!, tab: 'repository' }).toString()}`;

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
/** Waits for an enabled node of that role and name (the repository tab loads its data after the first frame), then
 *  presses it. */
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
/** The folder's repository, on one of its views (Branches, Worktrees). */
async function openView(view: string): Promise<PageSession> {
  const p = await renderPage({ page: 'ai', path: URL_, cols: 120, rows: 40, settleMs: 3000 });
  s = p;
  await p.settle();
  await press(p, 'radio', view);
  return p;
}
function clean(p: PageSession): void {
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
  expect(p.frame).not.toContain('could not be drawn');
}
const valueOf = (p: PageSession, label: string): string | undefined => queryAllByRole(tree(p), 'textbox', { name: label })[0]?.value;

test('120x40: New branch opens on Branch name, and a typed name lands there', async () => {
  const p = await openView(strings['repo.branches']);
  await press(p, 'button', strings['branches.new']);
  expect(queryAllByRole(tree(p), 'alertdialog', { name: strings['branches.new.title'] })).toHaveLength(1);
  expect(focused(p)).toEqual({ role: 'textbox', name: strings['branches.new.name'] });
  await p.keys.type('next');
  await p.settle();
  expect(valueOf(p, strings['branches.new.name'])).toBe('next');
  expect(queryAllByRole(tree(p), 'alertdialog', { name: strings['branches.new.title'] })).toHaveLength(1);
  clean(p);
}, 240_000);

test('120x40: Add a worktree opens on Location, and a typed path lands there', async () => {
  const p = await openView(strings['repo.worktrees']);
  await press(p, 'button', strings['worktrees.new']);
  expect(queryAllByRole(tree(p), 'alertdialog', { name: strings['worktrees.new.title'] })).toHaveLength(1);
  expect(focused(p)).toEqual({ role: 'textbox', name: strings['worktrees.new.path'] });
  await p.keys.type('/home/ada/next');
  await p.settle();
  expect(valueOf(p, strings['worktrees.new.path'])).toBe('/home/ada/next');
  expect(queryAllByRole(tree(p), 'alertdialog', { name: strings['worktrees.new.title'] })).toHaveLength(1);
  clean(p);
}, 240_000);
