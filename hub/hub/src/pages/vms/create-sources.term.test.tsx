// "New VM" in a terminal: every disk source draws its own field under it (the RadioGroup `reveal`), so a VM can be
// made from an image, a template, a copy or a file, not only from an empty disk. Before the kit drew the reveal, the
// default source ("Install from an image") showed "Next: pick an image to install from." with no picker anywhere.
//  1. The default source offers this computer's images; picking one sends that image, once.
//  2. A disk file: its path field is drawn under it; the path typed is the one sent.
//  3. An image file instead of the store: the store's picker gives way to the path field.
//  4. 80x24: the image picker is drawn in the full-screen drawer too.
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

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
async function open(fx: string, cols = 120, rows = 40): Promise<string> {
  s = await renderPage({ page: 'vms', fx, path: '/vms?new=1', cols, rows });
  return s.settle();
}
async function find(role: Role, name: string | RegExp): Promise<SemNode> {
  let n = all(role, name)[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n, `${role} ${String(name)}`).toBeDefined();
  return n!;
}
/** With the keyboard: the control is focused (and scrolled into the drawer's view) first, so it works below the fold. */
async function press(role: Role, name: string | RegExp): Promise<string> {
  act(await find(role, name), 'press');
  return s!.settle();
}
/** The footer's send button, always in view: as a person with a mouse (a click moves the focus off a typed field). */
async function send(): Promise<void> {
  act(await find('button', strings['create.go']), 'click');
  await s!.settle();
  for (let i = 0; i < 5 && createLog.length === 0; i++) await s!.settle();
}
async function type(name: string, text: string): Promise<void> {
  act(await find('textbox', name), 'setValue', text);
  await s!.settle();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}
const sources = (): unknown[] => createLog.map((b) => (b as { source?: unknown }).source);
/** The image picker: a button named by what it shows and its name (the web's React Aria trigger). */
const IMAGE_PICKER = new RegExp(`${strings['create.image']}$`);
const DEBIAN = 'a'.repeat(64);

test('the default source offers this computer\'s images; the one picked is sent, once', async () => {
  await open('create-ok');
  clean();
  expect((await find('radio', strings['create.source.image'])).states.checked).toBe(true);
  expect(all('radio', strings['create.imageFrom.store']).length).toBe(1);
  // Open the picker and take the first image it offers (the first ready one: Debian 13).
  await press('button', IMAGE_PICKER);
  expect((await find('option', /^Debian 13 /)).name).toContain('Debian 13');
  await s!.keys.press('enter');
  await s!.settle();
  expect((await find('button', IMAGE_PICKER)).name).toContain('Debian 13');
  await type(strings['create.name'], 'new-1');
  await send();
  clean();
  expect(sources()).toHaveLength(1);
  expect(sources()[0]).toMatchObject({ type: 'iso', sha256: DEBIAN });
}, 120_000);

test('a disk file: its path field is drawn under it, and the path typed is the one sent', async () => {
  await open('create-ok');
  expect(all('textbox', strings['create.filePath']).length).toBe(0);
  await press('radio', strings['create.source.file']);
  expect((await find('radio', strings['create.source.file'])).states.checked).toBe(true);
  expect(all('textbox', strings['create.filePath']).length).toBe(1);
  // The image's picker went with its source.
  expect(all('button', IMAGE_PICKER).length).toBe(0);
  await type(strings['create.filePath'], '/root/disk.qcow2');
  await type(strings['create.name'], 'new-2');
  await send();
  clean();
  expect(sources()).toEqual([{ type: 'offline-file', path: '/root/disk.qcow2' }]);
}, 120_000);

test('an image file instead of the store: the path field takes the picker\'s place', async () => {
  await open('create-ok');
  await press('radio', strings['create.imageFrom.path']);
  expect(all('textbox', strings['create.imagePath']).length).toBe(1);
  expect(all('button', IMAGE_PICKER).length).toBe(0);
  expect(createLog.length).toBe(0);
}, 120_000);

test('80x24: the image picker is drawn in the full-screen drawer too', async () => {
  await open('create-ok', 80, 24);
  clean();
  expect(all('button', IMAGE_PICKER).length).toBe(1);
  expect(all('radio', strings['create.imageFrom.store']).length).toBe(1);
}, 120_000);
