// The vault's held changes in the terminal (C9), pinned where no terminal test covered them:
// - a delete whose answer was lost: the entry shows "may have gone through" and offers NO Check again (a read cannot
//   prove a delete: Holds.tsx gives Check again to a held PUT only), exactly one DELETE was sent, and Stop tracking
//   asks first (hold.dismissTitle) and then ends the hold without sending anything;
// - a save whose answer was lost: Check again in the New entry drawer reads only (no second PUT) and says what the read
//   found (hold.unproven: the `unknown` state never applies a change). The form is filled as the shot new-entry-pending
//   fills it (focus, a frame, then the keys) and its buttons are clicked.
// Words come from the strings files; requests are counted through the fixture's requestLog.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import { fixtureWorld } from '@core';
import kitStrings from '@kit/strings.en.json';
import stateStrings from '@kit/states/strings.en.json';
import { REALM_A, requestLog } from './fixtures';
import vaultStrings from './strings.en.json';

const t = makeT(vaultStrings);
const kt = makeT(kitStrings);
const stt = makeT(stateStrings);
/** The partition's name as the page says it: the fixture realm REALM_A's name. */
const PARTITION = (fixtureWorld.realms.find((r) => r.id === REALM_A) as { name: string }).name;
/** The banner's dismiss: the kit's Stop tracking, a mark may follow (a warned dismiss asks first). */
const STOP = new RegExp(`^${stt('err.stopTracking')}`);
const ENTRY = 'deploy.notes';
const NEW_NAME = 'ci-token';
const NEW_VALUE = 'fixture-value-ci';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
const nodes = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  const out: SemNode[] = [];
  const walk = (ns: readonly SemNode[]): void => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(semanticsOf({ root: r.root, stdin: r.stdin }));
  return out;
};
const treeText = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semText(semanticsOf({ root: r.root, stdin: r.stdin }));
};
const under = (n: SemNode): SemNode[] => [n, ...n.children.flatMap(under)];
const nameIs = (n: SemNode, want: string | RegExp): boolean => (typeof want === 'string' ? norm(n.name) === norm(want) : want.test(norm(n.name)));
/** The frame (whitespace collapsed) and the tree, read after a settle. */
async function look(p: PageSession): Promise<{ frame: string; tree: SemNode[] }> {
  const frame = norm(await p.settle());
  return { frame, tree: nodes(p) };
}
/** Text on screen: in the frame, or as a node's name or description (a wrapped line inside a frame is split by its border). */
const says = (v: { frame: string; tree: SemNode[] }, text: string): boolean => {
  const w = norm(text);
  return v.frame.includes(w) || v.tree.some((n) => norm(n.name).includes(w) || norm(n.description ?? '').includes(w));
};
const pressable = (n: SemNode): boolean => !n.states.disabled && (n.actions.includes('press') || n.actions.includes('click') || n.role === 'button' || n.role === 'menuitem');
function press(n: SemNode): void {
  if (n.actions.includes('press')) act(n, 'press');
  else act(n, 'click', undefined, { force: true });
}
function find(tree: SemNode[], roles: readonly string[], name: string | RegExp): SemNode | undefined {
  return tree.find((n) => roles.includes(n.role) && nameIs(n, name) && pressable(n));
}
async function pressIn(p: PageSession, tree: SemNode[], roles: readonly string[], name: string | RegExp): Promise<void> {
  const n = find(tree, roles, name);
  if (!n) throw new Error(`no ${roles.join('/')} named ${String(name)}`);
  press(n);
  await p.settle();
}
const dialogNamed = (tree: SemNode[], title: string): SemNode | undefined =>
  tree.find((n) => (n.role === 'dialog' || n.role === 'alertdialog') && norm(n.name).includes(norm(title)));
const count = (method: string, tail?: string): number => requestLog.filter((r) => r.method === method && (tail === undefined || r.path.endsWith(tail))).length;
const BUTTONS = ['button'] as const;
/** A cell inside the node: its middle, as the shot replay clicks (scripts/term/shot-replay.ts). */
const middle = (n: SemNode): [number, number] => [n.box[0] + Math.max(0, Math.floor((n.box[2] - 1) / 2)), n.box[1] + Math.max(0, Math.floor((n.box[3] - 1) / 2))];
/** A mouse click on the node: it lands where it is drawn, whichever field holds the keyboard. */
async function clickOn(p: PageSession, n: SemNode): Promise<void> {
  const [x, y] = middle(n);
  await p.click(x, y);
}
/** Types into a field as a person does: the focus moves there and lands on a frame, then the keys follow. (Focus and
 *  keys in the same tick send the keys to the field focused before: the shot replay's fill step settles between.)
 *  A field whose text the tree carries then holds exactly what was typed; a secret says only that it is filled. */
async function typeInto(p: PageSession, find: () => SemNode, text: string): Promise<void> {
  act(find(), 'type', '');
  await p.settle();
  for (let i = 0; i < 20 && !find().states.focused; i++) await p.settle();
  await p.keys.type(text);
  const n = find();
  if (n.value !== undefined) expect(n.value).toBe(text);
  else if (n.states.secret) expect(n.filled).toBe(true);
}

/** Opens deploy.notes' Delete… (the entry's own button, or its More actions menu) and confirms it. */
async function deleteEntry(p: PageSession): Promise<void> {
  let v = await look(p);
  const direct = find(v.tree, BUTTONS, t('action.delete'));
  if (direct) press(direct);
  else {
    await pressIn(p, v.tree, BUTTONS, kt('action.more'));
    v = await look(p);
    await pressIn(p, v.tree, ['menuitem', 'button'], t('action.delete'));
  }
  v = await look(p);
  const confirm = dialogNamed(v.tree, t('delete.title', { key: ENTRY }));
  expect(confirm).toBeDefined();
  await pressIn(p, under(confirm!), BUTTONS, t('delete.confirm'));
}

test('held delete: "may have gone through", no Check again, one DELETE sent', async () => {
  s = await renderPage({ page: 'vault', fx: 'unknown', cols: 120, rows: 40, path: `/vault?sel=${ENTRY}` });
  await s.settle();
  await deleteEntry(s);
  const v = await look(s);
  expect(says(v, t('hold.title.delete', { key: ENTRY, partition: PARTITION }))).toBe(true);
  expect(says(v, t('hold.bodyDelete'))).toBe(true);
  // A delete cannot be proved by a read: nothing on the page offers Check again for it.
  expect(v.tree.some((n) => n.role === 'button' && nameIs(n, kt('outcome.pending.check')))).toBe(false);
  // Stop tracking is the only way out.
  expect(v.tree.some((n) => n.role === 'button' && nameIs(n, STOP))).toBe(true);
  expect(count('DELETE', `/vault/keys/${ENTRY}`)).toBe(1);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('held delete: Stop tracking asks first, then ends the hold; nothing more is sent', async () => {
  s = await renderPage({ page: 'vault', fx: 'unknown', cols: 120, rows: 40, path: `/vault?sel=${ENTRY}` });
  await s.settle();
  await deleteEntry(s);
  let v = await look(s);
  const before = requestLog.filter((r) => r.method !== 'GET').length;
  // The banner's Stop tracking (outside any dialog).
  const dialogs = v.tree.filter((n) => n.role === 'dialog' || n.role === 'alertdialog').flatMap(under);
  const stop = v.tree.find((n) => n.role === 'button' && nameIs(n, STOP) && !dialogs.includes(n) && pressable(n));
  expect(stop).toBeDefined();
  press(stop!);
  v = await look(s);
  // It asks; nothing has ended yet.
  const ask = dialogNamed(v.tree, t('hold.dismissTitle'));
  expect(ask).toBeDefined();
  expect(says(v, t('hold.title.delete', { key: ENTRY, partition: PARTITION }))).toBe(true);
  await pressIn(s, under(ask!), BUTTONS, t('hold.dismissConfirm'));
  v = await look(s);
  expect(dialogNamed(v.tree, t('hold.dismissTitle'))).toBeUndefined();
  expect(says(v, t('hold.title.delete', { key: ENTRY, partition: PARTITION }))).toBe(false);
  // Stopping tracking sends nothing: still the one DELETE, no other change.
  expect(requestLog.filter((r) => r.method !== 'GET').length).toBe(before);
  expect(count('DELETE', `/vault/keys/${ENTRY}`)).toBe(1);
  expect(s.failures).toEqual([]);
}, 240_000);

test('held save: Check again in the drawer reads only (no second PUT) and says the read proved nothing', async () => {
  s = await renderPage({ page: 'vault', fx: 'unknown', cols: 120, rows: 40, path: '/vault' });
  let v = await look(s);
  await pressIn(s, v.tree, BUTTONS, t('action.new'));
  v = await look(s);
  const drawer = dialogNamed(v.tree, t('edit.newTitle'));
  expect(drawer).toBeDefined();
  const field = (label: string): SemNode => {
    const n = nodes(s!).find((x) => x.role === 'textbox' && nameIs(x, label) && x.actions.includes('type'));
    if (!n) throw new Error(`no field ${label}`);
    return n;
  };
  await typeInto(s, () => field(t('edit.name')), NEW_NAME);
  await typeInto(s, () => field(t('edit.value')), NEW_VALUE);
  v = await look(s);
  // Save is clicked, as the shot new-entry-pending does: a key press would go to the field that holds the keyboard.
  const save = find(under(dialogNamed(v.tree, t('edit.newTitle'))!), BUTTONS, t('edit.save'));
  expect(save).toBeDefined();
  await clickOn(s, save!);
  v = await look(s);
  for (let i = 0; i < 40 && !says(v, t('hold.title.put', { key: NEW_NAME, partition: PARTITION })); i++) {
    await new Promise((r) => setTimeout(r, 100));
    v = await look(s);
  }
  expect(says(v, t('hold.title.put', { key: NEW_NAME, partition: PARTITION }))).toBe(true);
  expect(count('PUT')).toBe(1);
  // Check again inside the drawer (clicked, like Save).
  const check = find(under(dialogNamed(v.tree, t('edit.newTitle'))!), BUTTONS, new RegExp(`${kt('outcome.pending.check')}$`));
  expect(check).toBeDefined();
  await clickOn(s, check!);
  v = await look(s);
  for (let i = 0; i < 40 && !says(v, t('hold.unproven')); i++) {
    await new Promise((r) => setTimeout(r, 100));
    v = await look(s);
  }
  expect(says(v, t('hold.unproven'))).toBe(true);
  // Read only: still the one PUT, and the value never reached the frame or the tree.
  expect(count('PUT')).toBe(1);
  expect(v.frame.includes(NEW_VALUE)).toBe(false);
  expect(treeText(s).includes(NEW_VALUE)).toBe(false);
  expect(s.failures).toEqual([]);
}, 240_000);
