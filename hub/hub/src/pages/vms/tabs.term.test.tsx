// A VM's Snapshots, Logs, Settings, Storage and Ports tabs in a terminal (the web tabs drawn by the terminal kit;
// fixtures only).
//  1. Snapshots: the list, why a snapshot cannot be restored; taking one sends once; a lost answer is held and never
//     sent again; restore asks first (cancel sends nothing).
//  2. Logs: the console's text; no line can be sent empty (the button says why); a line is sent once with Enter added;
//     a line that may have arrived is held and cannot be sent again.
//  3. Settings: nothing to save until something changed; a change is saved once, with only what changed; a refusal
//     says why; a lost answer is held and Save stays off.
//  4. Storage and Ports: the drives and the ports; why ports cannot be edited while the VM runs; "Open" hands the
//     address to the terminal's own opener.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, sendKeys, type Role, type SemNode } from '../../term/prim/semantics';
import { requestLog } from './fixtures';
import { logReads, sentLines } from './fixtures.logs';
import { changeLog, resetChangeFixtures } from './fixtures.ports';
import { resetSnapFixtures, snapLog } from './fixtures.snap';
import strings from './strings.en.json';

let s: PageSession | null = null;
const opened: string[] = [];
beforeEach(() => { resetSnapFixtures(); resetChangeFixtures(); snapLog.length = 0; changeLog.length = 0; sentLines.length = 0; logReads.length = 0; requestLog.length = 0; opened.length = 0; });
afterEach(() => { stopTicking(); s?.close(); s = null; });

// A page is drawn on the fixture clock, which stands still (scripts/term/clock.ts). A snapshot change is sent only
// after a list read that is NEWER than the press (snap-logic freshList), which a still clock can never show. These
// tests let the clock tick: each reading of "now" is one millisecond later than the last.
let stopTicking = (): void => {};
function tick(): void {
  const Held = globalThis.Date;
  let n = 0;
  const base = Held.now();
  (globalThis as { Date: DateConstructor }).Date = new Proxy(Held, { get: (T, k, r) => (k === 'now' ? () => base + ++n : Reflect.get(T, k, r)) });
  stopTicking = () => { (globalThis as { Date: DateConstructor }).Date = Held; stopTicking = () => {}; };
}

const say = (key: keyof typeof strings, vars: Record<string, string> = {}): string =>
  strings[key].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
async function until(ok: () => boolean): Promise<void> { for (let i = 0; i < 8 && !ok(); i++) await s!.settle(); }
async function open(vm: string, tab: string, fx: string | null = null, cols = 120, rows = 40): Promise<string> {
  s = await renderPage({ page: 'vms', fx, path: `/vms/${vm}?tab=${tab}`, cols, rows, openExternal: (u: string) => { opened.push(u); } });
  return s.settle();
}
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
/** With the keyboard: for a control below the fold (a click lands on what is drawn there). */
async function press(n: SemNode | undefined): Promise<string> {
  expect(n).toBeDefined();
  act(n!, 'press');
  return s!.settle();
}
async function button(name: string | RegExp): Promise<SemNode> {
  await until(() => all('button', name).length > 0);
  const b = all('button', name);
  expect(b.length).toBeGreaterThan(0);
  return b[b.length - 1]!;
}
async function fill(name: string, text: string): Promise<void> {
  await until(() => all('textbox', name).length > 0);
  const f = all('textbox', name)[0];
  expect(f).toBeDefined();
  act(f!, 'setValue', text);
  await s!.settle();
}
/** A number field takes its value when it is left. */
async function fillNumber(name: string, text: string): Promise<void> {
  await fill(name, text);
  const r = s!.renderer as unknown as { root: never; stdin: never };
  sendKeys({ root: r.root, stdin: r.stdin }, 'tab');
  await s!.settle();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

// ── 1. Snapshots ────────────────────────────────────────────────────────────────────────
const SNAPS = say('snap.label', { vm: 'win11' });
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: the snapshots, and why one cannot be restored`, async () => {
    await open('win11', 'snapshots', 'snap-many', cols, rows);
    clean();
    expect(inRow(row(SNAPS, 'clean-install'), 'Restore')!.states.disabled).toBeFalsy();
    const off = inRow(row(SNAPS, 'old-layout'), 'Restore');
    expect(off).toBeDefined();
    expect(off!.states.disabled).toBe(true);
    expect(off!.description ?? '').toContain('cannot be restored');
    expect(all('button', strings['snap.take.open']).length).toBe(1);
  }, 120_000);
}

test('no snapshots: the tab says so and what to do', async () => {
  const frame = await open('win11', 'snapshots', 'snap-empty');
  clean();
  expect(frame).toContain(strings['snap.empty.title']);
  expect(says(strings['snap.empty.body'])).toBe(true);
}, 120_000);

async function take(label: string): Promise<void> {
  await click(await button(strings['snap.take.open']));
  await fill(strings['snap.take.field'], label);
  await click(await button(strings['snap.take.go']));
}

test('taking a snapshot sends once and the snapshot is listed', async () => {
  await open('win11', 'snapshots', 'snap-many');
  tick();
  await take('before-update');
  await until(() => snapLog.length > 0 && flat(all('table', SNAPS)).some((n) => n.role === 'row' && n.name.includes('before-update')));
  clean();
  expect(snapLog).toEqual([{ change: 'take', vm: 'win11', label: 'before-update' }]);
  expect(row(SNAPS, 'before-update')).toBeDefined();
}, 120_000);

test('a snapshot whose answer is lost is held: it says so and nothing more can be sent', async () => {
  await open('win11', 'snapshots', 'snap-take-lost-nothing');
  tick();
  await take('before-update');
  const held = say('snap.held.take', { label: 'before-update' });
  await until(() => says(held));
  clean();
  expect(says(held)).toBe(true);
  expect(snapLog.length).toBe(1);
  // While held: no second snapshot, no restore.
  for (const b of [all('button', strings['snap.take.open'])[0], inRow(row(SNAPS, 'clean-install'), 'Restore')]) {
    expect(b).toBeDefined();
    expect(b!.states.disabled).toBe(true);
    act(b!, 'press', undefined, { force: true });
    await s!.settle();
  }
  expect(all('button', strings['snap.take.go']).length).toBe(0);
  expect(snapLog.length).toBe(1);
}, 120_000);

test('restore asks first, saying what is lost; cancel sends nothing; confirm sends once', async () => {
  await open('win11', 'snapshots', 'snap-many');
  tick();
  await click(inRow(row(SNAPS, 'clean-install'), 'Restore'));
  await until(() => says(say('snap.restore.title', { label: 'clean-install' })));
  expect(says(say('snap.restore.body', { vm: 'win11' }))).toBe(true);
  await click(await button(/^Cancel$/));
  expect(snapLog).toEqual([]);
  await click(inRow(row(SNAPS, 'clean-install'), 'Restore'));
  await click(await button(strings['snap.restore.go']));
  await until(() => snapLog.length > 0);
  clean();
  expect(snapLog).toEqual([{ change: 'restore', vm: 'win11', label: 'clean-install' }]);
}, 120_000);

// ── 2. Logs ────────────────────────────────────────────────────────────────────────────
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: the console log, its sources, and an empty line cannot be sent`, async () => {
    const frame = await open('web-1', 'logs', 'logs-console', cols, rows);
    clean();
    expect(all('radio', strings['logs.src.console'])[0]!.states.checked).toBe(true);
    expect(frame).toContain('login:');
    const send = all('button', strings['logs.send.go'])[0];
    expect(send).toBeDefined();
    expect(send!.states.disabled).toBe(true);
    expect(send!.description ?? '').toContain(strings['logs.send.empty']);
    act(send!, 'press', undefined, { force: true });
    await s!.settle();
    expect(sentLines).toEqual([]);
  }, 120_000);
}

test('a line is sent once, with Enter added, and the console is read again', async () => {
  await open('web-1', 'logs', 'logs-console');
  const before = logReads.filter((r) => r === 'web-1/console').length;
  await fill(strings['logs.send.label'], 'uname -a');
  await click(await button(strings['logs.send.go']));
  await until(() => says(strings['logs.send.done']));
  clean();
  expect(sentLines).toEqual(['uname -a\n']);
  expect(says(strings['logs.send.done'])).toBe(true);
  expect(all('textbox', strings['logs.send.label'])[0]!.value ?? '').toBe('');
  expect(logReads.filter((r) => r === 'web-1/console').length).toBe(before + 1);
}, 120_000);

test('a line that may have arrived is held: it says so and no line can be sent', async () => {
  await open('web-1', 'logs', 'logs-line-lost');
  await fill(strings['logs.send.label'], 'reboot');
  await click(await button(strings['logs.send.go']));
  const held = say('logs.held', { vm: 'web-1' });
  await until(() => says(held));
  clean();
  expect(says(held)).toBe(true);
  const send = all('button', strings['logs.send.go'])[0];
  expect(send).toBeDefined();
  expect(send!.states.disabled).toBe(true);
  act(send!, 'press', undefined, { force: true });
  await s!.settle();
  expect(sentLines).toEqual(['reboot\n']);
}, 120_000);

test('a log that is not there yet, and one that cannot be read, say so', async () => {
  await open('web-1', 'logs', 'logs-none');
  clean();
  expect(says(strings['logs.none'])).toBe(true);
  s!.close();
  await open('web-1', 'logs', 'logs-read-error');
  expect(s!.trapsAt).toEqual([]);
  expect(all('button', /Try again|Retry|Refresh/).length).toBeGreaterThan(0);
}, 120_000);

// ── 3. Settings ─────────────────────────────────────────────────────────────────────────
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: the settings of a stopped VM; nothing to save until something changed`, async () => {
    await open('win11', 'settings', null, cols, rows);
    clean();
    expect(all('textbox', 'CPUs')[0]!.value).toBe('2');
    expect(all('textbox', 'Memory (GiB)')[0]!.value).toBe('4');
    expect(all('switch', 'Show a screen')[0]!.states.checked).toBe(true);
    const save = all('button', strings['settings.save'])[0];
    expect(save).toBeDefined();
    expect(save!.states.disabled).toBe(true);
    act(save!, 'press', undefined, { force: true });
    await s!.settle();
    expect(changeLog).toEqual([]);
  }, 120_000);
}

test('a change is saved once, with only what changed', async () => {
  await open('win11', 'settings', 'settings-saved');
  tick();
  await fillNumber('CPUs', '4');
  await press(await button(strings['settings.save']));
  await until(() => changeLog.length > 0 && says(strings['settings.saved']));
  clean();
  expect(changeLog.length).toBe(1);
  expect(changeLog[0]!.route).toBe('update');
  expect(changeLog[0]!.body).toEqual({ vcpus: 4 });
  expect(says(strings['settings.saved'])).toBe(true);
}, 120_000);

test('a refused save says why; a save whose answer is lost is held and cannot be sent again', async () => {
  await open('win11', 'settings', 'settings-refused');
  tick();
  await fillNumber('CPUs', '4');
  await press(await button(strings['settings.save']));
  await until(() => says('Another change of this VM is under way'));
  clean();
  expect(says('Another change of this VM is under way')).toBe(true);
  expect(changeLog.length).toBe(1);
  stopTicking();
  s!.close();
  resetChangeFixtures(); changeLog.length = 0;
  await open('win11', 'settings', 'settings-held');
  tick();
  await fillNumber('CPUs', '4');
  await press(await button(strings['settings.save']));
  await until(() => says('may have gone through'));
  clean();
  expect(says('may have gone through')).toBe(true);
  expect(changeLog.length).toBe(1);
  const save = all('button', strings['settings.save'])[0];
  if (save) {
    expect(save.states.disabled).toBe(true);
    act(save, 'press', undefined, { force: true });
    await s!.settle();
  }
  expect(changeLog.length).toBe(1);
}, 120_000);

// ── 4. Storage and Ports ──────────────────────────────────────────────────────────────────
test('storage: the drives with what each holds, and growing the disk says a disk only grows', async () => {
  await open('win11', 'storage');
  clean();
  const T = 'Disc drives of win11';
  expect(row(T, 'Drive 1').name).toContain('win11.iso');
  expect(inRow(row(T, 'Drive 3'), 'Insert a disc')).toBeDefined();
  await click(await button('Make the disk bigger'));
  await until(() => says('A disk only grows'));
  expect(says('A disk only grows')).toBe(true);
  expect(changeLog).toEqual([]);
}, 120_000);

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: ports of a running VM: why they cannot be edited now, and Open hands the address over`, async () => {
    await open('web-1', 'ports', null, cols, rows);
    clean();
    const T = 'Ports of web-1';
    expect(row(T, 'TCP 8080').name).toContain('80');
    const edit = all('button', 'Edit ports')[0];
    expect(edit).toBeDefined();
    expect(edit!.states.disabled).toBe(true);
    expect(edit!.description ?? '').toContain('Shut the VM down');
    await click(inRow(row(T, 'TCP 8080'), 'Open'));
    await until(() => opened.length > 0);
    expect(opened.length).toBe(1);
    expect(opened[0]).toMatch(/^https?:\/\//);
    expect(s!.trapsAt).toEqual([]);
  }, 120_000);
}
