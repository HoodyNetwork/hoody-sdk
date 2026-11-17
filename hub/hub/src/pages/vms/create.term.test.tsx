// "New VM" in a terminal (the web drawer drawn by the terminal kit; fixtures only).
//  1. The form draws, comes to rest and fits at both sizes: what you get, then the groups.
//  2. A create the VM program accepts is sent once and opens the new VM's screen.
//  3. A create whose answer is lost is held: the drawer says a VM may have been made, nothing can be sent again, and
//     a check that does not find it says so (still nothing sent).
//  4. A refusal says why in the page's words; the form stays for a second try.
//  5. Nothing is sent while the name is missing; the form says what is missing.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
// fixtures first: fixtures.create reads it while it loads (a cycle that only resolves in this order).
import './fixtures';
import { createLog, resetCreateFixtures } from './fixtures.create';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => { resetCreateFixtures(); });
afterEach(() => { s?.close(); s = null; });

const say = (key: keyof typeof strings, vars: Record<string, string> = {}): string =>
  strings[key].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
async function open(fx: string, cols = 120, rows = 40): Promise<string> {
  s = await renderPage({ page: 'vms', fx, path: '/vms?new=1', cols, rows });
  return s.settle();
}
async function find(role: Role, name: string | RegExp): Promise<SemNode> {
  let n = all(role, name)[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n).toBeDefined();
  return n!;
}
/** As a person with a mouse: a click moves the focus off the name field first (a press sent by the test harness
 *  right after typing reaches the field too, as a space). */
async function press(role: Role, name: string | RegExp): Promise<string> {
  act(await find(role, name), 'click');
  return s!.settle();
}
/** Take an empty disk (with the keyboard: the picked source's own fields are drawn under it, so the disk sources can
 *  sit below the drawer's fold), name the VM, send. */
async function fillAndSend(name: string): Promise<string> {
  await blank();
  act(await find('textbox', strings['create.name']), 'setValue', name);
  await s!.settle();
  return press('button', strings['create.go']);
}
async function blank(): Promise<void> {
  act(await find('radio', strings['create.source.blank']), 'press');
  await s!.settle();
  expect((await find('radio', strings['create.source.blank'])).states.checked).toBe(true);
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}
const names = (): unknown[] => createLog.map((b) => (b as { name?: unknown }).name);

// ── 1. The form ─────────────────────────────────────────────────────────────────────────
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: the form comes to rest, with what you get and its groups`, async () => {
    const frame = await open('create-ok', cols, rows);
    clean();
    // The groups take their width from their rows: a row that flips between beside and stacked never rests.
    expect(await s!.settle()).toBe(frame);
    expect(frame).toContain(say('create.title', { name: 'atlas' }));
    expect(frame).toContain(strings['create.go']);
    expect(all('textbox', strings['create.name']).length).toBe(1);
    expect(all('group', strings['create.g.vm']).length).toBe(1);
    expect(all('group', strings['create.g.disk']).length).toBe(1);
    expect(all('group', strings['create.g.size']).length).toBe(1);
    expect(all('radio', strings['create.source.blank']).length).toBe(1);
    // No group of the form reaches past the drawer's own column (the summary card spans it).
    const edge = (n: SemNode): number => n.box[0] + n.box[2];
    const summary = all('group', /^What you get$/i)[0];
    expect(summary).toBeDefined();
    for (const k of ['create.g.vm', 'create.g.disk', 'create.g.size'] as const) expect(edge(all('group', strings[k])[0]!)).toBeLessThan(edge(summary!));
    expect(createLog.length).toBe(0);
  }, 120_000);
}

// ── 2. Accepted ────────────────────────────────────────────────────────────────────────
test('a create the VM program accepts is sent once and opens the new VM', async () => {
  await open('create-ok');
  await fillAndSend('new-1');
  for (let i = 0; i < 5 && all('heading', 'new-1').length === 0; i++) await s!.settle();
  clean();
  expect(names()).toEqual(['new-1']);
  expect(all('heading', 'new-1').length).toBeGreaterThan(0);
  expect(all('button', strings['create.go']).length).toBe(0);
}, 120_000);

// ── 3. Lost answer: held, never sent again ──────────────────────────────────────────────────
test('a create whose answer is lost is held: it says so, cannot be sent again, and a check that finds nothing says so', async () => {
  await open('create-lost-nothing');
  await fillAndSend('new-1');
  const held = say('create.held', { vm: 'new-1', name: 'atlas' });
  for (let i = 0; i < 5 && !says(held); i++) await s!.settle();
  clean();
  expect(names()).toEqual(['new-1']);
  expect(says(held)).toBe(true);
  // The form is gone while the create is held; the send button is off.
  expect(all('textbox', strings['create.name']).length).toBe(0);
  const go = all('button', strings['create.go'])[0];
  if (go) {
    expect(go.states.disabled).toBe(true);
    act(go, 'press', undefined, { force: true });
    await s!.settle();
  }
  expect(names()).toEqual(['new-1']);
  // Check now: the VM is not in the list; nothing is sent.
  const check = flat(tree()).find((n) => n.role === 'button' && /^Check/.test(n.name));
  expect(check).toBeDefined();
  act(check!, 'press');
  await s!.settle();
  for (let i = 0; i < 5 && !says(strings['create.held.notYet']); i++) await s!.settle();
  expect(says(strings['create.held.notYet'])).toBe(true);
  expect(says(held)).toBe(true);
  expect(names()).toEqual(['new-1']);
}, 120_000);

// ── 4. Refused ─────────────────────────────────────────────────────────────────────────
test('a refused create says why and keeps the form', async () => {
  await open('create-refused');
  await fillAndSend('new-1');
  const why = 'A VM with this name exists already';
  for (let i = 0; i < 5 && !says(why); i++) await s!.settle();
  clean();
  expect(names()).toEqual(['new-1']);
  expect(says(why)).toBe(true);
  const name = all('textbox', strings['create.name'])[0];
  expect(name).toBeDefined();
  expect(name!.value).toBe('new-1');
}, 120_000);

// ── 5. Missing name ──────────────────────────────────────────────────────────────────────
test('nothing is sent without a name', async () => {
  await open('create-ok');
  await blank();
  await press('button', strings['create.go']);
  clean();
  expect(createLog.length).toBe(0);
  const name = all('textbox', strings['create.name'])[0];
  expect(name).toBeDefined();
  expect(name!.states.invalid).toBe(true);
}, 120_000);
