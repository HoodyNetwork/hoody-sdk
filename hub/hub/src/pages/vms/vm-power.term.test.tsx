// A VM's own screen in a terminal: its power actions, its delete and what a lost answer leaves (the web screen drawn by
// the terminal kit; fixtures only).
//  1. The header's main action is sent once and the screen then reads the VM's new state; the menu's actions too.
//  2. Power off and Reset are asked first (Cancel sends nothing); a refusal stays in the question with its reason.
//  3. Delete asks for the VM's name typed, sends one delete, then shows the list without the VM; a VM that was not
//     created is removed after a plain question.
//  4. A change whose answer is lost is held: the band names it, Check again only reads, the main action waits, nothing
//     is sent again; Stop tracking frees it after its question; a lost delete that did apply ends on the list.
//  5. An address that is no VM name is never asked for and never shown as a title.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { requestLog } from './fixtures';
import { changeLog, resetPowerFixtures } from './fixtures.power';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => { resetPowerFixtures(); changeLog.length = 0; requestLog.length = 0; });
afterEach(() => { s?.close(); s = null; });

const say = (key: keyof typeof strings, vars: Record<string, string> = {}): string =>
  strings[key].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
const LIST = say('list.label', { name: 'atlas' });
const CHECK = 'Check again';
const STOP_TRACKING = 'Stop tracking';

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const all = (role: Role, name: string | RegExp): SemNode[] => queryAllByRole(tree(), role, { name });
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
async function until(ok: () => boolean, tries = 12): Promise<void> { for (let i = 0; i < tries && !ok(); i++) await s!.settle(); }
async function open(fx: string | null, vm: string, cols = 120, rows = 40): Promise<string> {
  s = await renderPage({ page: 'vms', fx, path: `/vms/${vm}`, cols, rows });
  return s.settle();
}
/** The first control of that role and name, once it is drawn. */
async function find(role: Role, name: string | RegExp): Promise<SemNode> {
  await until(() => all(role, name).length > 0);
  const n = all(role, name)[0];
  expect(n).toBeDefined();
  return n!;
}
async function press(n: SemNode): Promise<string> {
  act(n, 'press');
  return s!.settle();
}
/** The header's main action (the first button of that name on the screen). */
const main = (name: string): Promise<SemNode> => find('button', name);
const isOff = (n: SemNode): boolean => n.states.disabled === true;
/** Opens the screen's ⋯ menu and presses the item whose label starts with these words. */
async function menu(label: string): Promise<void> {
  const more = all('button', 'More actions');
  expect(more.length).toBeGreaterThan(0);
  act(more[more.length - 1]!, 'click');
  await s!.settle();
  await press(await find('menuitem', new RegExp(`^${label}`)));
}
/** The open question with this title. */
const dialog = (title: string): Promise<SemNode> => find('alertdialog', title);
const inDialog = (d: SemNode, role: Role, name?: string): SemNode | undefined =>
  flat(d.children).find((n) => n.role === role && (name === undefined || n.name === name));
/** A row of the VM list for this VM. */
const listRow = (vm: string): SemNode[] => all('row', new RegExp(`(^|[› ])${vm} ●`));
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
}

// ── 1. Main action and menu ──────────────────────────────────────────────────────────
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: stopped: Start is sent once, then the VM reads Running with Shut down as its main action`, async () => {
    await open('power-ok', 'win11', cols, rows);
    const start = await main(strings['power.start']);
    expect(isOff(start)).toBe(false);
    await press(start);
    await until(() => all('button', strings['power.stop']).length > 0);
    expect(changeLog).toEqual([{ op: 'start', name: 'win11' }]);
    expect(all('button', strings['power.stop']).length).toBeGreaterThan(0);
    expect(all('button', strings['power.start']).length).toBe(0);
    expect(says(strings['state.running'])).toBe(true);
    clean();
  }, 180_000);
}

test('running: Pause is in the menu and is sent once, then Resume is the main action', async () => {
  await open('power-ok', 'web-1');
  await main(strings['power.stop']);
  await menu(strings['power.pause']);
  await until(() => all('button', strings['power.resume']).length > 0);
  expect(changeLog).toEqual([{ op: 'pause', name: 'web-1' }]);
  expect(all('button', strings['power.resume']).length).toBeGreaterThan(0);
  clean();
}, 180_000);

test('running: the menu says Delete waits for a shut-down, and a press on it sends nothing', async () => {
  await open('power-ok', 'web-1');
  await main(strings['power.stop']);
  const more = all('button', 'More actions');
  act(more[more.length - 1]!, 'click');
  await s!.settle();
  const items = queryAllByRole(tree(), 'menuitem');
  expect(items.map((i) => i.name)).toEqual([strings['power.pause'], `${strings['power.reset']}…`, `${strings['power.forceStop']}…`, `${strings['power.delete']}…`]);
  const del = items[items.length - 1]!;
  expect(isOff(del)).toBe(true);
  expect(says(strings['power.short.running'])).toBe(true);
  act(del, 'press', undefined, { force: true });
  await s!.settle();
  expect(all('alertdialog', say('delete.ask.title', { vm: 'web-1' })).length).toBe(0);
  expect(changeLog).toEqual([]);
  clean();
}, 180_000);

// ── 2. Asked first ───────────────────────────────────────────────────────────────────
test('a VM that stopped answering says so; Power off is asked first, Cancel sends nothing, the confirm sends once', async () => {
  await open('power-ok', 'stuck');
  await until(() => says(strings['vm.stalled']));
  expect(says(strings['vm.stalled'])).toBe(true);
  expect(all('button', strings['power.stop']).length).toBe(0);
  await press(await main(strings['power.forceStop']));
  const title = say('power.ask.forceStop.title', { vm: 'stuck' });
  await dialog(title);
  expect(changeLog).toEqual([]);
  await s!.keys.press('escape');
  await s!.settle();
  expect(all('alertdialog', title).length).toBe(0);
  expect(changeLog).toEqual([]);
  await press(await main(strings['power.forceStop']));
  const go = inDialog(await dialog(title), 'button', strings['power.forceStop']);
  expect(go).toBeDefined();
  await press(go!);
  await until(() => all('button', strings['power.start']).length > 0);
  expect(changeLog).toEqual([{ op: 'forceStop', name: 'stuck' }]);
  expect(all('alertdialog', title).length).toBe(0);
  clean();
}, 180_000);

test('a refused power-off stays in the question with the reason in the page\'s words; nothing is held', async () => {
  await open('power-refused', 'stuck');
  await press(await main(strings['power.forceStop']));
  const title = say('power.ask.forceStop.title', { vm: 'stuck' });
  await press(inDialog(await dialog(title), 'button', strings['power.forceStop'])!);
  await until(() => says(say('power.failed.forceStop', { vm: 'stuck' })));
  expect(changeLog).toEqual([{ op: 'forceStop', name: 'stuck' }]);
  expect(all('alertdialog', title).length).toBe(1);
  expect(says(say('power.failed.forceStop', { vm: 'stuck' }))).toBe(true);
  expect(says(strings['power.code.BadState'])).toBe(true);
  // Closed, the main action is there again and not held.
  await s!.keys.press('escape');
  await s!.settle();
  expect(all('alertdialog', title).length).toBe(0);
  expect(isOff(await main(strings['power.forceStop']))).toBe(false);
  expect(says(say('power.held.forceStop', { vm: 'stuck' }))).toBe(false);
  expect(changeLog.length).toBe(1);
  clean();
}, 180_000);

// ── 3. Delete ────────────────────────────────────────────────────────────────────────
for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: delete asks for the name typed (Cancel sends nothing), sends one delete, then shows the list without the VM`, async () => {
    await open('power-ok', 'win11', cols, rows);
    await main(strings['power.start']);
    const title = say('delete.ask.title', { vm: 'win11' });
    await menu(strings['power.delete']);
    let d = await dialog(title);
    // The whole question is on screen: what is lost, the field and both buttons.
    for (const line of [strings['delete.ask.disk'], strings['delete.ask.snapshots'], strings['delete.ask.undo'], 'Type win11 to confirm', strings['delete.ask.go'], 'Cancel']) {
      expect(s!.frame).toContain(line);
    }
    await press(inDialog(d, 'button', 'Cancel')!);
    expect(all('alertdialog', title).length).toBe(0);
    expect(changeLog).toEqual([]);
    // Asked again: the field starts empty, and Delete VM is armed only by the whole name.
    await menu(strings['power.delete']);
    d = await dialog(title);
    const field = inDialog(d, 'textbox');
    expect(field).toBeDefined();
    expect(field!.value ?? '').toBe('');
    expect(isOff(inDialog(d, 'button', strings['delete.ask.go'])!)).toBe(true);
    act(field!, 'type', 'win1');
    await s!.settle();
    expect(isOff(inDialog(await dialog(title), 'button', strings['delete.ask.go'])!)).toBe(true);
    // The field keeps the focus: the last letter goes where a person types it.
    await s!.keys.type('1');
    const go = inDialog(await dialog(title), 'button', strings['delete.ask.go'])!;
    expect(isOff(go)).toBe(false);
    await press(go);
    await until(() => all('table', LIST).length > 0);
    expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]);
    expect(all('table', LIST).length).toBe(1);
    expect(listRow('win11').length).toBe(0);
    expect(listRow('web-1').length).toBe(1);
    // The count, where the table's toolbar has room for it (the list's own test reads it at 120 columns).
    if (cols === 120) expect(says(say('list.count_other', { count: '16' }))).toBe(true);
    clean();
  }, 180_000);
}

test('a VM that was not created is removed after a plain question (no name to type), then the list shows without it', async () => {
  await open('power-ok', 'import-1');
  await press(await main(strings['delete.remove']));
  const d = await dialog(say('delete.remove.title', { vm: 'import-1' }));
  expect(inDialog(d, 'textbox')).toBeUndefined();
  expect(changeLog).toEqual([]);
  const go = inDialog(d, 'button', strings['delete.remove.go']);
  expect(go).toBeDefined();
  expect(isOff(go!)).toBe(false);
  await press(go!);
  await until(() => all('table', LIST).length > 0);
  expect(changeLog).toEqual([{ op: 'delete', name: 'import-1' }]);
  expect(listRow('import-1').length).toBe(0);
  clean();
}, 180_000);

// ── 4. Lost answers ──────────────────────────────────────────────────────────────────
test('a reset whose answer is lost is held with its own words; Check again only reads; Shut down waits for it', async () => {
  await open('power-lost', 'web-1');
  await main(strings['power.stop']);
  await menu(strings['power.reset']);
  const title = say('power.ask.reset.title', { vm: 'web-1' });
  await dialog(title);
  await s!.keys.press('escape');
  await s!.settle();
  expect(changeLog).toEqual([]);
  await menu(strings['power.reset']);
  await press(inDialog(await dialog(title), 'button', strings['power.reset'])!);
  await s!.releaseHeld();
  const held = say('power.held.reset', { vm: 'web-1' });
  await until(() => says(held));
  expect(says(held)).toBe(true);
  expect(all('alertdialog', title).length).toBe(0);
  // No read shows that a reset happened: Check again leaves it held.
  await press(await find('button', CHECK));
  await s!.releaseHeld();
  await s!.settle();
  expect(says(held)).toBe(true);
  expect(changeLog).toEqual([{ op: 'reset', name: 'web-1' }]);
  // While it is held, the main action says why and a press sends nothing.
  const stop = await main(strings['power.stop']);
  expect(isOff(stop)).toBe(true);
  expect(stop.description ?? '').toContain(strings['power.why.held']);
  act(stop, 'press', undefined, { force: true });
  await s!.settle();
  expect(changeLog.length).toBe(1);
  clean();
}, 180_000);

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: a delete whose answer is lost and that did not apply stays held, says the VM is still listed, and Stop tracking frees it without a resend`, async () => {
    await open('power-lost', 'win11', cols, rows);
    await main(strings['power.start']);
    await menu(strings['power.delete']);
    const title = say('delete.ask.title', { vm: 'win11' });
    act(inDialog(await dialog(title), 'textbox')!, 'type', 'win11');
    await s!.settle();
    await press(inDialog(await dialog(title), 'button', strings['delete.ask.go'])!);
    await s!.releaseHeld();
    const held = say('power.held.delete', { vm: 'win11' });
    await until(() => says(held));
    expect(says(held)).toBe(true);
    expect(all('alertdialog', title).length).toBe(0);
    await press(await find('button', CHECK));
    await until(() => says(strings['delete.note.notYet']));
    expect(says(strings['delete.note.notYet'])).toBe(true);
    expect(says(say('delete.done', { vm: 'win11' }))).toBe(false);
    expect(isOff(await main(strings['power.start']))).toBe(true);
    expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]);
    // Stop tracking asks first; once confirmed the band goes and Start can be sent again. Nothing was sent again.
    await press(await find('button', STOP_TRACKING));
    const ask = await dialog('Stop tracking this?');
    await press(inDialog(ask, 'button', 'Stop tracking anyway')!);
    await until(() => !says(held));
    expect(says(held)).toBe(false);
    await until(() => { const b = all('button', strings['power.start'])[0]; return b !== undefined && !isOff(b); });
    expect(isOff(await main(strings['power.start']))).toBe(false);
    expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]);
    clean();
  }, 180_000);
}

test('a delete whose answer is lost but that did apply is held until a read proves it, then the list shows without the VM', async () => {
  await open('power-lost-applied', 'win11');
  await main(strings['power.start']);
  await menu(strings['power.delete']);
  const title = say('delete.ask.title', { vm: 'win11' });
  act(inDialog(await dialog(title), 'textbox')!, 'type', 'win11');
  await s!.settle();
  await press(inDialog(await dialog(title), 'button', strings['delete.ask.go'])!);
  await s!.releaseHeld();
  // The held band, or the list already (the screen reads again by itself while the hold is young).
  await until(() => says(say('power.held.delete', { vm: 'win11' })) || all('table', LIST).length > 0);
  for (let i = 0; i < 6 && all('table', LIST).length === 0; i++) {
    const check = all('button', CHECK)[0];
    if (check && !isOff(check)) act(check, 'press');
    await s!.releaseHeld();
    await until(() => all('table', LIST).length > 0, 4);
  }
  expect(all('table', LIST).length).toBe(1);
  expect(listRow('win11').length).toBe(0);
  expect(changeLog).toEqual([{ op: 'delete', name: 'win11' }]);
  clean();
}, 180_000);

// ── 5. Not a VM name ─────────────────────────────────────────────────────────────────
test('an address that is no VM name says so, is never asked for, and is not shown as a title', async () => {
  await open(null, 'Not_A_Name');
  await until(() => says(strings['vm.badName.title']));
  await s!.releaseHeld();
  expect(says(strings['vm.badName.title'])).toBe(true);
  expect(says(strings['st.allVms'])).toBe(true);
  expect(all('heading', 'Not_A_Name').length).toBe(0);
  expect(requestLog.filter((r) => r.route === 'vm').length).toBe(0);
  expect(all('button', strings['power.start']).length).toBe(0);
  clean();
}, 180_000);
