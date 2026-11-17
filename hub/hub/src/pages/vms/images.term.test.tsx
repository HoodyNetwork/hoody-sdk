// The VMs page in a terminal: the Images view and "KVM on computers" (the web views drawn by the terminal kit;
// fixtures only).
//  1. Images: every image by what it is with its state; each download with its state and the one thing to do with it;
//     a download that cannot be cleared yet says why. Empty and failed lists say so.
//  2. Delete an image: asked first by name; cancel sends nothing; confirm sends once and the image leaves the list. A
//     refusal says why in the page's words. A lost answer is held: no other delete can be sent, nothing is sent again.
//  3. Add from a link: a bad link is never sent; a good one is sent once. A lost answer is held by the site's name.
//  4. Cancel a download: asked first; keep sends nothing; confirm sends once.
//  5. KVM on computers: each computer's state, the one action it calls for; turning KVM on sends once for that computer.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { fixtureWorld } from '@core';
import './fixtures';
import { imageLog, resetImageFixtures } from './fixtures.images';
import { kvmLog, resetKvmFixtures } from './fixtures.kvm';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => { resetImageFixtures(); resetKvmFixtures(); imageLog.length = 0; kvmLog.length = 0; });
afterEach(() => { s?.close(); s = null; });

const say = (key: keyof typeof strings, vars: Record<string, string> = {}): string =>
  strings[key].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
async function until(ok: () => boolean): Promise<void> { for (let i = 0; i < 8 && !ok(); i++) await s!.settle(); }
async function open(fx: string, view: 'images' | 'kvm' = 'images', cols = 120, rows = 40): Promise<string> {
  s = await renderPage({ page: 'vms', fx, path: `/vms?view=${view}`, cols, rows });
  return s.settle();
}
/** The row that starts with these words (after the cursor mark), in the table of this name. */
function row(table: string, starts: string): SemNode {
  const t = all('table', table)[0];
  expect(t).toBeDefined();
  const r = flat(t!.children).find((n) => n.role === 'row' && n.name.replace(/^› /, '').startsWith(starts));
  expect(r).toBeDefined();
  return r!;
}
const inRow = (r: SemNode, name: string): SemNode | undefined => flat(r.children).find((n) => n.role === 'button' && n.name === name);
/** As a person with a mouse (a click moves the focus off a field first). */
async function click(n: SemNode | undefined): Promise<string> {
  expect(n).toBeDefined();
  act(n!, 'click');
  return s!.settle();
}
async function button(name: string | RegExp): Promise<SemNode> {
  await until(() => all('button', name).length > 0);
  const b = all('button', name);
  expect(b.length).toBeGreaterThan(0);
  return b[b.length - 1]!;
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}
const IMAGES = say('images.label', { name: 'atlas' });
const DOWNLOADS = say('images.dl.label', { name: 'atlas' });
const sent = (change: string) => imageLog.filter((x) => x.change === change);
async function askDelete(name: string): Promise<void> {
  await click(inRow(row(IMAGES, name), strings['images.row.delete']));
  await until(() => says(say('images.remove.title', { name })));
  expect(says(say('images.remove.title', { name }))).toBe(true);
}

// ── 1. The lists ─────────────────────────────────────────────────────────────────────────
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: images by what they are, downloads by state, and why one cannot be cleared`, async () => {
    await open('images-many', 'images', cols, rows);
    clean();
    expect(row(IMAGES, 'Debian 13').name).toContain('Ready');
    expect(row(IMAGES, 'Ubuntu 24.04').name).toContain('Other machine type');
    expect(row(IMAGES, 'Unnamed image').name).toContain('Uploading');
    expect(row(DOWNLOADS, 'releases.ubuntu.com').name).toContain('38%');
    expect(inRow(row(DOWNLOADS, 'releases.ubuntu.com'), 'Cancel')).toBeDefined();
    expect(row(DOWNLOADS, 'downloads.example.net').name).toContain('Failed');
    // A download being checked can be neither cancelled nor cleared, and its off action says why.
    const checking = row(DOWNLOADS, 'cdimage.debian.org ● Checking');
    const clear = inRow(checking, 'Clear');
    expect(clear).toBeDefined();
    expect(clear!.states.disabled).toBe(true);
    expect(clear!.description ?? '').toContain('being checked');
    expect(inRow(checking, 'Cancel')).toBeUndefined();
  }, 120_000);
}

test('empty lists say so; a failed image list fails alone', async () => {
  let frame = await open('images-empty');
  clean();
  expect(frame).toContain(strings['images.empty.title']);
  expect(frame).toContain(strings['images.dl.empty']);
  s!.close();
  frame = await open('images-error');
  clean();
  expect(all('table', IMAGES).length).toBe(0);
  expect(row(DOWNLOADS, 'releases.ubuntu.com')).toBeDefined();
}, 120_000);

// ── 2. Delete an image ────────────────────────────────────────────────────────────────────
test('delete asks first by name; cancel sends nothing; confirm sends once and the image leaves the list', async () => {
  await open('images-many');
  await askDelete('Debian 13');
  expect(says(say('images.remove.body', { computer: 'atlas' }))).toBe(true);
  await click(await button(/^Cancel$/));
  expect(imageLog).toEqual([]);
  await askDelete('Debian 13');
  await click(await button(strings['images.remove.go']));
  await until(() => sent('remove').length > 0 && !flat(all('table', IMAGES)).some((n) => n.role === 'row' && n.name.includes('Debian 13')));
  clean();
  expect(sent('remove').length).toBe(1);
  expect(sent('remove')[0]!.path.endsWith(`/${'a'.repeat(64)}`)).toBe(true);
  expect(flat(all('table', IMAGES)).some((n) => n.role === 'row' && n.name.includes('Debian 13'))).toBe(false);
}, 120_000);

test('a refused delete says why in the page\'s words; the image stays', async () => {
  await open('images-remove-refused');
  await askDelete('Debian 13');
  await click(await button(strings['images.remove.go']));
  await until(() => says(strings['images.err.remove.BadState']));
  clean();
  expect(says(strings['images.err.remove.BadState'])).toBe(true);
  expect(says('attached to VM')).toBe(false);
  expect(sent('remove').length).toBe(1);
  expect(row(IMAGES, 'Debian 13')).toBeDefined();
}, 120_000);

test('a delete whose answer is lost is held: no other delete can be sent, and a check sends nothing again', async () => {
  await open('images-remove-lost-kept');
  await askDelete('Debian 13');
  await click(await button(strings['images.remove.go']));
  const held = say('images.held.remove', { name: 'Debian 13' });
  await until(() => says(held));
  clean();
  expect(says(held)).toBe(true);
  const other = inRow(row(IMAGES, 'Ubuntu 24.04'), strings['images.row.delete']);
  expect(other).toBeDefined();
  expect(other!.states.disabled).toBe(true);
  act(other!, 'press', undefined, { force: true });
  await s!.settle();
  await click(await button(/^Check/));
  await s!.settle();
  expect(says(held)).toBe(true);
  expect(sent('remove').length).toBe(1);
}, 120_000);

// ── 3. Add from a link ───────────────────────────────────────────────────────────────────
async function openAdd(url: string): Promise<void> {
  await click(await button(strings['images.add.open']));
  await until(() => all('textbox', strings['images.add.url']).length > 0);
  const field = all('textbox', strings['images.add.url'])[0];
  expect(field).toBeDefined();
  act(field!, 'setValue', url);
  await s!.settle();
}

test('a link that is not a public web link is never sent; a good one is sent once', async () => {
  await open('images-many');
  await openAdd('ftp://mirror.example.org/x.iso');
  // The send button is off while the link is not one; a press that reaches it anyway sends nothing.
  const off = await button(strings['images.add.go']);
  expect(says(strings['images.add.url.invalid'])).toBe(true);
  expect(off.states.disabled).toBe(true);
  act(off, 'press', undefined, { force: true });
  await s!.settle();
  expect(sent('add')).toEqual([]);
  const field = all('textbox', strings['images.add.url'])[0]!;
  act(field, 'setValue', 'https://mirror.example.org/x/new.iso');
  await s!.settle();
  await click(await button(strings['images.add.go']));
  await until(() => sent('add').length > 0);
  clean();
  expect(sent('add').length).toBe(1);
  expect(sent('add')[0]!.body).toEqual({ url: 'https://mirror.example.org/x/new.iso' });
}, 120_000);

test('an add whose answer is lost is held by the site\'s name, never the link, and is not sent again', async () => {
  await open('images-add-lost');
  await openAdd('https://mirror.example.org/x/new.iso?key=secret');
  await click(await button(strings['images.add.go']));
  const held = say('images.held.add', { site: 'mirror.example.org' });
  await until(() => says(held));
  clean();
  expect(says(held)).toBe(true);
  expect(says('key=secret')).toBe(false);
  expect(s!.frame).not.toContain('key=secret');
  expect(sent('add').length).toBe(1);
  const add = all('button', strings['images.add.open'])[0];
  if (add) { act(add, 'press', undefined, { force: true }); await s!.settle(); }
  const go = all('button', strings['images.add.go'])[0];
  if (go) { act(go, 'press', undefined, { force: true }); await s!.settle(); }
  expect(sent('add').length).toBe(1);
}, 120_000);

// ── 4. Cancel a download ─────────────────────────────────────────────────────────────────
test('cancelling a download asks first; keep sends nothing; confirm sends once', async () => {
  await open('images-many');
  await click(inRow(row(DOWNLOADS, 'releases.ubuntu.com'), 'Cancel'));
  await until(() => says(strings['images.stop.title']));
  expect(says(say('images.stop.body', { site: 'releases.ubuntu.com' }))).toBe(true);
  await click(await button(strings['images.stop.keep']));
  expect(sent('stop')).toEqual([]);
  await click(inRow(row(DOWNLOADS, 'releases.ubuntu.com'), 'Cancel'));
  await until(() => says(strings['images.stop.title']));
  await click(await button(strings['images.stop.go']));
  await until(() => sent('stop').length > 0);
  clean();
  expect(sent('stop').length).toBe(1);
}, 120_000);

// ── 5. KVM on computers ─────────────────────────────────────────────────────────────────
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: KVM on each computer, and the one action each calls for`, async () => {
    const frame = await open('kvm-tab', 'kvm', cols, rows);
    clean();
    const T = strings['kvm.tab.label'];
    expect(row(T, 'atlas').name).toContain(strings['kvm.pill.on']);
    expect(inRow(row(T, 'atlas'), 'Open VMs')).toBeDefined();
    expect(row(T, 'cedar').name).toContain(strings['kvm.pill.off']);
    expect(inRow(row(T, 'cedar'), 'Turn on KVM')).toBeDefined();
    const shared = flat(all('table', T)).find((n) => n.role === 'row' && n.name.includes(strings['kvm.pill.no.shared']));
    expect(shared).toBeDefined();
    expect(flat(shared!.children).some((n) => n.role === 'button' && n.name === 'Turn on KVM')).toBe(false);
    // The VM list is not drawn in this view.
    expect(frame).not.toContain(strings['host.title']);
  }, 120_000);
}

test('turning KVM on from the list sends once, for that computer, and the row reads On', async () => {
  await open('kvm-tab', 'kvm');
  const T = strings['kvm.tab.label'];
  await click(inRow(row(T, 'cedar'), 'Turn on KVM'));
  const cedar = fixtureWorld.computer('cedar').id;
  await until(() => kvmLog.length > 0 && row(T, 'cedar').name.includes(`● ${strings['kvm.pill.on']}`));
  clean();
  expect(kvmLog).toEqual([{ id: cedar, kvm: true }]);
  expect(row(T, 'cedar').name).toContain(`● ${strings['kvm.pill.on']}`);
}, 120_000);
