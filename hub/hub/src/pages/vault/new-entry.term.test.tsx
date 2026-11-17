// New entry with "Encrypt with a password", and Import's paste box, in the terminal (no terminal test covered them):
// - two different passwords: refused with password.mismatch, nothing sent; the press empties BOTH password fields
//   (EditDrawer.submit clears them on every press) and keeps the name and the value;
// - Import: Read empties the paste box at once, the preview shows names and the mask only, nothing is sent before Send.
// The form is filled as the shots fill it (focus, a frame, then the keys) and Save is clicked. Values and passwords
// here are fixture text, compared as booleans only.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import { fixtureWorld } from '@core';
import { REALM_A, requestLog } from './fixtures';
import vaultStrings from './strings.en.json';

const t = makeT(vaultStrings);
/** The partition's name as the page says it: the fixture realm REALM_A's name. */
const PARTITION = (fixtureWorld.realms.find((r) => r.id === REALM_A) as { name: string }).name;
const NAME = 'ci-token';
const VALUE = 'fixture-value-ci';
const PW_A = 'fixture-pass-aaaa';
const PW_B = 'fixture-pass-bbbb';
const LINES = ['A_ONE=fixture-import-v1', 'B_TWO=fixture-import-v2'];
const IMPORT_VALUE_PART = 'fixture-import-v';

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
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const says = (p: PageSession, frame: string, text: string): boolean =>
  norm(frame).includes(norm(text)) || nodes(p).some((n) => norm(n.name).includes(norm(text)) || norm(n.description ?? '').includes(norm(text)));
const dialogNamed = (p: PageSession, title: string): SemNode | undefined =>
  nodes(p).find((n) => (n.role === 'dialog' || n.role === 'alertdialog') && norm(n.name).includes(norm(title)));
function press(n: SemNode): void {
  if (n.actions.includes('press')) act(n, 'press');
  else act(n, 'click', undefined, { force: true });
}
async function pressNamed(p: PageSession, roles: readonly string[], name: string, within?: SemNode): Promise<string> {
  const pool = within ? under(within) : nodes(p);
  const n = pool.find((x) => roles.includes(x.role) && norm(x.name) === norm(name) && !x.states.disabled);
  if (!n) throw new Error(`no ${roles.join('/')} named ${name}`);
  press(n);
  return p.settle();
}
/** A text field by its label (secret ones too); the tree read fresh, so the node is the live one. */
const field = (p: PageSession, label: string): SemNode => {
  const n = nodes(p).find((x) => x.role === 'textbox' && norm(x.name) === norm(label));
  if (!n) throw new Error(`no field ${label}`);
  return n;
};
/** Types into a field as a person does: the focus moves there and lands on a frame, then the keys follow. (Focus and
 *  keys in the same tick send the keys to the field focused before: the shot replay's fill step settles between.)
 *  A field whose text the tree carries then holds exactly what was typed; a secret says only that it is filled. */
async function typeInto(p: PageSession, label: string, text: string): Promise<void> {
  act(field(p, label), 'type', '');
  await p.settle();
  for (let i = 0; i < 20 && !field(p, label).states.focused; i++) await p.settle();
  await p.keys.type(text);
  const n = field(p, label);
  if (n.value !== undefined) expect(n.value).toBe(text);
  else if (n.states.secret) expect(n.filled).toBe(true);
}
/** A mouse click in the middle of the node, as the shot replay clicks: it lands where it is drawn, whichever field
 *  holds the keyboard (a key press would go to that field). */
async function clickNamed(p: PageSession, name: string, within: SemNode): Promise<string> {
  const n = under(within).find((x) => x.role === 'button' && norm(x.name) === norm(name) && !x.states.disabled);
  if (!n) throw new Error(`no button named ${name}`);
  await p.click(n.box[0] + Math.max(0, Math.floor((n.box[2] - 1) / 2)), n.box[1] + Math.max(0, Math.floor((n.box[3] - 1) / 2)));
  return p.settle();
}
const puts = (): number => requestLog.filter((r) => r.method === 'PUT').length;

/** Opens New entry, fills name and value, ticks Encrypt and types the two passwords. */
async function encryptForm(p: PageSession, pw: string, again: string): Promise<SemNode> {
  await p.settle();
  await pressNamed(p, ['button'], t('action.new'));
  const drawer = dialogNamed(p, t('edit.newTitle'));
  expect(drawer).toBeDefined();
  await typeInto(p, t('edit.name'), NAME);
  await typeInto(p, t('edit.value'), VALUE);
  const box = nodes(p).find((n) => n.role === 'checkbox' && norm(n.name).startsWith(t('edit.encrypt')));
  expect(box).toBeDefined();
  press(box!);
  await p.settle();
  expect(nodes(p).some((n) => n.role === 'checkbox' && norm(n.name).startsWith(t('edit.encrypt')) && n.states.checked === true)).toBe(true);
  await typeInto(p, t('edit.password'), pw);
  await typeInto(p, t('edit.repeat'), again);
  expect(field(p, t('edit.password')).filled).toBe(true);
  expect(field(p, t('edit.repeat')).filled).toBe(true);
  return dialogNamed(p, t('edit.newTitle'))!;
}

test('Encrypt, two different passwords: refused, nothing sent; both password fields emptied, name and value kept', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: '/vault' });
  const drawer = await encryptForm(s, PW_A, PW_B);
  const frame = await clickNamed(s, t('edit.save'), drawer);
  expect(says(s, frame, t('password.mismatch'))).toBe(true);
  expect(puts()).toBe(0);
  // The refused press cleared both passwords; the name and the value are kept for the next try.
  expect(field(s, t('edit.password')).filled).toBe(false);
  expect(field(s, t('edit.repeat')).filled).toBe(false);
  expect(field(s, t('edit.value')).filled).toBe(true);
  const name = field(s, t('edit.name'));
  expect(name.value === NAME || norm(frame).includes(NAME)).toBe(true);
  // Still the open form: the drawer did not close.
  expect(dialogNamed(s, t('edit.newTitle'))).toBeDefined();
  for (const secret of [VALUE, PW_A, PW_B]) {
    expect(norm(frame).includes(secret)).toBe(false);
    expect(treeText(s).includes(secret)).toBe(false);
  }
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);

test('Import: Read empties the paste box, the preview shows names and the mask only, nothing is sent', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40, path: '/vault' });
  await s.settle();
  await pressNamed(s, ['button'], t('action.more'));
  await pressNamed(s, ['menuitem', 'button'], t('action.import'));
  const dlg = dialogNamed(s, t('import.title', { partition: PARTITION }));
  expect(dlg).toBeDefined();
  // Two lines: the paste box is a multiline editor (Enter is a line end there).
  act(field(s, t('import.paste')), 'type', LINES[0]);
  await s.settle();
  await s.keys.press('return');
  act(field(s, t('import.paste')), 'type', LINES[1]);
  await s.settle();
  expect(field(s, t('import.paste')).filled).toBe(true);
  let frame = await pressNamed(s, ['button'], t('import.read'), dialogNamed(s, t('import.title', { partition: PARTITION })));
  for (let i = 0; i < 40 && !says(s, frame, t('import.list')); i++) { await sleep(50); frame = await s.settle(); }
  // The preview: both names, each with its line and the mask; no value anywhere.
  expect(says(s, frame, 'A_ONE')).toBe(true);
  expect(says(s, frame, 'B_TWO')).toBe(true);
  expect(says(s, frame, t('import.mask'))).toBe(true);
  expect(says(s, frame, t('import.line', { line: 2 }))).toBe(true);
  expect(norm(frame).includes(IMPORT_VALUE_PART)).toBe(false);
  expect(treeText(s).includes(IMPORT_VALUE_PART)).toBe(false);
  expect(puts()).toBe(0);
  // Back: the paste box is there again, and empty (Read emptied it before parsing).
  frame = await pressNamed(s, ['button'], t('import.back'), dialogNamed(s, t('import.title', { partition: PARTITION })));
  expect(field(s, t('import.paste')).filled).toBe(false);
  expect(norm(frame).includes(IMPORT_VALUE_PART)).toBe(false);
  expect(puts()).toBe(0);
  expect(s.failures).toEqual([]);
}, 240_000);
