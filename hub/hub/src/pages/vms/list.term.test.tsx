// The VMs page in a terminal, list screen (the web view drawn by the terminal kit; fixtures only).
//  1. "This computer": the KVM switch with its state and what it means, the Server row, the room VMs share.
//  2. The KVM switch acts as on the web: a running computer is asked to stop first, a stopped one changes at once, a
//     change whose answer is lost is held (never sent again), a refusal says why in the page's words.
//  3. While the VM service cannot be read the notice says why and the list's place says what to do next.
//  4. The VM list: each VM's state, the one action its state calls for, and why an action cannot be sent now.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { requestLog } from './fixtures';
import { kvmLog, lifecycleLog, resetKvmFixtures } from './fixtures.kvm';
import { changeLog, resetPowerFixtures } from './fixtures.power';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => { resetKvmFixtures(); resetPowerFixtures(); kvmLog.length = 0; lifecycleLog.length = 0; changeLog.length = 0; requestLog.length = 0; });
afterEach(() => { s?.close(); s = null; });

const say = (key: keyof typeof strings, vars: Record<string, string> = {}): string =>
  strings[key].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
const ATLAS = { name: 'atlas' };
const SWITCH = strings['kvm.switch'];

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** Whether the screen says these words, whole, in one piece of text or one control's name (a frame wraps a sentence
 *  between its neighbours' words, so sentences are read from what is drawn, not from the frame's lines). */
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
/** What the Server row of "This computer" says: the text after its label, in the computer's sub-section (a region
 *  named by its heading, as the web's <section aria-labelledby>; it used to be a SettingGroup, role group). */
const serverRow = (): string | undefined => {
  const rows = flat(all('region', strings['host.facts'])[0]?.children ?? []).filter((n) => n.role === 'text').map((n) => n.name);
  const at = rows.indexOf(strings['host.server']);
  return at < 0 ? undefined : rows[at + 1];
};
async function open(o: { fx?: string; path?: string; cols?: number; rows?: number }): Promise<string> {
  s = await renderPage({ page: 'vms', fx: o.fx ?? null, path: o.path, cols: o.cols ?? 120, rows: o.rows ?? 40 });
  return s.settle();
}
async function press(role: Role, name: string | RegExp): Promise<string> {
  let n = all(role, name)[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n).toBeDefined();
  act(n!, 'press');
  return s!.settle();
}
/** The row of the table named for this VM. */
const rowOf = (vm: string): SemNode => {
  const r = all('row', new RegExp(`(^|[› ])${vm} ●`))[0];
  expect(r).toBeDefined();
  return r!;
};
const inRow = (vm: string, role: Role, name: string): SemNode | undefined => flat(rowOf(vm).children).find((n) => n.role === role && n.name === name);
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

// ── 1. This computer ─────────────────────────────────────────────────────────────────
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: "This computer" shows the KVM switch on, what it means, the Server and the room for VMs`, async () => {
    const frame = await open({ cols, rows });
    clean();
    expect(frame).toContain(strings['host.title']);
    const sw = all('switch', SWITCH);
    expect(sw.length).toBe(1);
    expect(sw[0]!.states.checked).toBe(true);
    expect(says(strings['host.note.kvmOn'])).toBe(true);
    expect(serverRow()).toBe(strings['host.server.bare']);
    expect(frame).toContain(strings['host.room']);
    // The memory meter is whole on its line, never broken over two.
    expect(frame.split('\n').some((l) => l.includes('█████░░░░░'))).toBe(true);
    expect(all('meter', /Memory for VMs/).length).toBe(1);
  }, 120_000);
}

test('KVM off: the switch is off and its row says no VM can start', async () => {
  const frame = await open({ fx: 'kvm-off' });
  clean();
  expect(all('switch', SWITCH)[0]!.states.checked).toBe(false);
  expect(says(strings['host.note.kvmOff'])).toBe(true);
}, 120_000);

test('a shared server: the switch is off, cannot be pressed, and says shared servers cannot run VMs', async () => {
  const frame = await open({ fx: 'shared' });
  clean();
  const sw = all('switch', SWITCH)[0]!;
  expect(sw.states.checked).toBe(false);
  expect(sw.states.disabled).toBe(true);
  expect(says(strings['kvm.why.shared'])).toBe(true);
  expect(serverRow()).toBe(strings['host.server.shared']);
}, 120_000);

// ── 2. The KVM switch ────────────────────────────────────────────────────────────────
test('a running computer: the switch asks to stop the computer first; Cancel sends nothing', async () => {
  await open({ fx: 'kvm-running' });
  const frame = await press('switch', SWITCH);
  expect(frame).toContain(say('kvm.ask.stopOn.title', ATLAS));
  expect(all('button', strings['kvm.ask.stop.go']).length).toBe(1);
  expect(kvmLog).toEqual([]);
  await s!.keys.press('escape');
  const after = await s!.settle();
  expect(after).not.toContain(say('kvm.ask.stopOn.title', ATLAS));
  expect(kvmLog).toEqual([]);
  expect(lifecycleLog).toEqual([]);
  clean();
}, 180_000);

test('a stopped computer: the switch turns KVM on at once, then offers Start computer', async () => {
  await open({ fx: 'kvm-stopped' });
  expect(all('switch', SWITCH)[0]!.states.checked).toBe(false);
  const frame = await press('switch', SWITCH);
  expect(kvmLog.map((k) => k.kvm)).toEqual([true]);
  expect(says(say('kvm.done.on', ATLAS))).toBe(true);
  expect(all('switch', SWITCH)[0]!.states.checked).toBe(true);
  expect(all('button', strings['kvm.start']).length).toBe(1);
  expect(lifecycleLog).toEqual([]);
  clean();
}, 180_000);

test('a lost answer is held: the band says it may have gone through, the switch is off limits, nothing is sent again', async () => {
  await open({ fx: 'kvm-lost' });
  const frame = await press('switch', SWITCH);
  expect(says(say('kvm.held.on', ATLAS))).toBe(true);
  expect(kvmLog.length).toBe(1);
  const sw = all('switch', SWITCH)[0]!;
  expect(sw.states.disabled).toBe(true);
  // A press on the held switch (as a person would still try) sends nothing.
  act(sw, 'press', undefined, { force: true });
  await s!.settle();
  act(sw, 'click', undefined, { force: true });
  await s!.settle();
  expect(kvmLog.length).toBe(1);
  expect(says(say('kvm.held.on', ATLAS))).toBe(true);
  clean();
}, 180_000);

test('a refusal says why in the page\'s words and leaves the switch off', async () => {
  await open({ fx: 'kvm-refused' });
  const frame = await press('switch', SWITCH);
  expect(says(say('kvm.out.on', ATLAS))).toBe(true);
  expect(says(strings['kvm.err.notAvailable'])).toBe(true);
  expect(all('switch', SWITCH)[0]!.states.checked).toBe(false);
  expect(kvmLog.length).toBe(1);
  clean();
}, 180_000);

// ── 3. Blocked ───────────────────────────────────────────────────────────────────────
const BLOCKED = [
  { fx: 'unreachable', notice: 'st.unreachable', title: 'blocked.unreachable.title', body: 'blocked.unreachable.body', action: ['button', strings['blocked.check.name']] },
  { fx: 'computer-stopped', notice: 'st.stopped', title: 'blocked.stopped.title', body: 'blocked.stopped.body', action: ['link', strings['st.openComputers']] },
  { fx: 'computer-expired', notice: 'st.expired', title: 'blocked.expired.title', body: 'blocked.expired.body', action: ['link', strings['st.openComputers']] },
  { fx: 'shared', notice: 'st.shared', title: 'blocked.shared.title', body: 'blocked.shared.body', action: ['link', strings['st.shared.action']] },
] as const;
for (const b of BLOCKED) {
  for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
    test(`${b.fx} ${cols}x${rows}: the notice says why, "This computer" stays, and the list's place gives the next step`, async () => {
      // Tall enough at 80 columns to hold the whole page: the frame is read, not scrolled.
      await open({ fx: b.fx, cols, rows: rows === 24 ? 60 : rows });
      const frame = s!.frame;
      clean();
      expect(says(say(b.notice, ATLAS))).toBe(true);
      expect(frame).toContain(strings['host.title']);
      expect(all('switch', SWITCH).length).toBe(1);
      expect(says(say(b.title, ATLAS))).toBe(true);
      expect(says(say(b.body, ATLAS))).toBe(true);
      // No table, and no claim that the list is empty.
      expect(all('table', /./).length).toBe(0);
      expect(frame).not.toContain(say('list.empty.title', ATLAS));
      // The one action that helps, inside the list's own section.
      const section = all('region', strings['list.title'])[0];
      expect(section).toBeDefined();
      const [role, name] = b.action;
      expect(flat(section!.children).filter((n) => n.role === role && n.name === name).length).toBe(1);
      // New VM is not offered while the VM service gives no answer.
      expect(all('button', strings['create.open']).length).toBe(0);
    }, 120_000);
  }
}

test('unreachable: Check again in the list\'s place asks the VM service again', async () => {
  await open({ fx: 'unreachable' });
  const before = requestLog.filter((r) => r.route === 'caps').length;
  await press('button', strings['blocked.check.name']);
  expect(requestLog.filter((r) => r.route === 'caps').length).toBeGreaterThan(before);
  expect(says(say('blocked.unreachable.title', ATLAS))).toBe(true);
  clean();
}, 180_000);

// ── 4. The VM list ───────────────────────────────────────────────────────────────────
test('the list shows each VM with its state and the one action its state calls for', async () => {
  await open({ cols: 120, rows: 60 });
  clean();
  expect(all('table', say('list.label', ATLAS)).length).toBe(1);
  const want: Array<[vm: string, state: string, action: string | null]> = [
    ['batch', strings['state.runFailed'], strings['power.start']],
    ['import-1', strings['state.createFailed'], strings['delete.remove']],
    ['ghost', strings['state.orphaned'], null],
    ['build', strings['state.creating'], null],
    ['cache', strings['state.starting'], null],
    ['old-api', strings['state.stopping'], null],
    ['web-1', strings['state.running'], strings['power.stop']],
    ['stuck', strings['state.running'], strings['power.forceStop']],
    ['db-1', strings['state.paused'], strings['power.resume']],
    ['win11', strings['state.stopped'], strings['power.start']],
  ];
  for (const [vm, state, action] of want) {
    const row = rowOf(vm);
    expect(row.name).toContain(`${vm} ● ${state}`);
    const buttons = flat(row.children).filter((n) => n.role === 'button' && n.name !== 'Row actions');
    expect(buttons.map((b) => b.name)).toEqual(action ? [action] : []);
  }
  expect(s!.frame).toContain(say('list.count_other', { count: '17' }));
}, 120_000);

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: with KVM off every Start stays in view, cannot be sent, and says to turn on KVM first`, async () => {
    await open({ fx: 'kvm-off', cols, rows: 60 });
    clean();
    const start = inRow('win11', 'button', strings['power.start']);
    expect(start).toBeDefined();
    expect(start!.states.disabled).toBe(true);
    const why = `${say('power.named.start', { vm: 'win11' })}. ${strings['power.why.kvmOff']}`;
    expect(start!.description).toBe(why);
    // The reason is on screen while the action has the focus, and a press sends nothing.
    act(start!, 'focus');
    const frame = await s!.settle();
    expect(focusedNode(tree())?.name).toBe(strings['power.start']);
    expect(says(strings['power.why.kvmOff'])).toBe(true);
    act(start!, 'press', undefined, { force: true });
    await s!.settle();
    expect(changeLog).toEqual([]);
  }, 120_000);
}

test('a running VM\'s menu offers Pause, Reset and Power off, and Delete says to shut the VM down first', async () => {
  await open({ path: '/vms?q=web-1' });
  const more = inRow('web-1', 'button', 'Row actions');
  expect(more).toBeDefined();
  act(more!, 'click');
  const frame = await s!.settle();
  const items = queryAllByRole(tree(), 'menuitem');
  // The three that ask first end with the mark of an action that opens a question.
  expect(items.map((i) => i.name)).toEqual([['pause', ''], ['reset', '…'], ['forceStop', '…'], ['delete', '…']].map(([op, asks]) => say(`power.named.${op}` as keyof typeof strings, { vm: 'web-1' }) + asks));
  const del = items[items.length - 1]!;
  expect(del.states.disabled).toBe(true);
  expect(says(strings['power.why.running'])).toBe(true);
  expect(changeLog).toEqual([]);
  clean();
}, 180_000);

test('a refused start shows as the section notice, naming the VM and the reason', async () => {
  await open({ fx: 'power-refused', path: '/vms?q=win11' });
  const start = inRow('win11', 'button', strings['power.start']);
  expect(start).toBeDefined();
  act(start!, 'press');
  await s!.settle();
  expect(changeLog).toEqual([{ op: 'start', name: 'win11' }]);
  expect(says(say('power.failed.start', { vm: 'win11' }))).toBe(true);
  expect(says(strings['power.code.BadState'])).toBe(true);
  clean();
}, 180_000);

test('a shut-down whose answer is lost is held: the band names it, the row\'s action waits for the check, nothing is sent twice', async () => {
  await open({ fx: 'power-lost', path: '/vms?q=web-1' });
  const stop = inRow('web-1', 'button', strings['power.stop']);
  expect(stop).toBeDefined();
  act(stop!, 'press');
  await s!.releaseHeld();
  await s!.settle();
  expect(changeLog).toEqual([{ op: 'stop', name: 'web-1' }]);
  expect(says(say('power.held.stop', { vm: 'web-1' }))).toBe(true);
  const again = inRow('web-1', 'button', strings['power.stop']);
  expect(again).toBeDefined();
  expect(again!.states.disabled).toBe(true);
  expect(again!.description).toContain(strings['power.why.held']);
  act(again!, 'press', undefined, { force: true });
  await s!.settle();
  expect(changeLog.length).toBe(1);
  clean();
}, 180_000);

test('Power off is asked first; Cancel sends nothing', async () => {
  await open({ fx: 'power-ok', path: '/vms?q=stuck' });
  const off = inRow('stuck', 'button', strings['power.forceStop']);
  expect(off).toBeDefined();
  act(off!, 'press');
  await s!.settle();
  expect(says(say('power.ask.forceStop.title', { vm: 'stuck' }))).toBe(true);
  expect(changeLog).toEqual([]);
  await s!.keys.press('escape');
  await s!.settle();
  expect(changeLog).toEqual([]);
  clean();
}, 180_000);
