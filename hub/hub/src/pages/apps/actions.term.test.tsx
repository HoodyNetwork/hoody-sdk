// The Apps tab of Programs in a terminal: what one open app's details let a person do (launch/AppsSection.tsx,
// parts/Inspector.tsx, launch/Dialogs.tsx through the terminal kit; fixtures only). An old /apps address lands on the
// tab with the app selected. Below 96 columns of page (80x24 and 120x40 alike) the details are the only pane.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Stop asks first: the confirm opens on Cancel, Enter there stops nothing and the focus is back on Stop; the confirm stops it | 'Stop asks first …' |
// | 2 | A stop whose answer was lost: "may have gone through" with Check again, never "didn't stop" or "closed" | 'a stop that may have gone through …' |
// | 3 | A refused stop: "Didn't stop. Try again." and the app still ready | 'a refused stop …' |
// | 4 | Check again whose answer is lost again: still "Check needed", the banner stays, no failure | 'Check again with no answer …' |
// | 5 | Stop goes ahead of a Check still waiting: its confirm opens and the stop is done | 'Stop goes ahead of a Check …' |
// | 6 | Stop tracking (an Open not read back) asks in danger words; Esc closes it, nothing is removed, the focus is back on it | 'Stop tracking asks first …' |
// | 7 | Remove takes the app off the list with an Undo toast; F6, Tab, Enter on Undo brings it back | 'Remove, then Undo …' |
// | 8 | A row opens its details in place of the list with the focus on "‹ Programs"; Esc goes back to that row (80x24, 120x40) | '… a row opens its details …' |
// | 9 | A stop note belongs to the session that pressed: the next session starts without it | 'a stop note does not outlive …' |
//
// The open-app store is module state (parts/ops.ts): each case presses on its own app, so no case reads another's
// change. Case 9 is last, as it presses on the app case 6 and case 3 use.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, focusedNode, semanticsOf, type SemNode } from '../../term/prim/semantics';
import kit from '../../kit/strings.en.json';
import overlay from '../../kit/overlays/strings.en.json';
import programs from '../programs/strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const say = (key: keyof typeof strings, vars: Record<string, string> = {}): string =>
  strings[key].replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
const buttons = (name: string, within: readonly SemNode[] = tree()): SemNode[] => flat(within).filter((n) => n.role === 'button' && n.name === name);
const focused = (): SemNode | null => focusedNode(tree());
async function until(ok: () => boolean): Promise<void> { for (let i = 0; i < 8 && !ok(); i++) await s!.settle(); }
async function press(n: SemNode | undefined): Promise<void> {
  expect(n).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.placeholders.rendered).toEqual([]);
  expect(s!.frame).not.toContain('could not be drawn');
}

/** The details' heading (DetailHeader: a level-2 heading named by the app). */
const heading = (name: string): SemNode | undefined => flat(tree()).find((n) => n.role === 'heading' && n.name === name);
/** An open confirm by its title. */
const dialog = (title: string): SemNode | undefined => flat(tree()).find((n) => n.role === 'alertdialog' && n.name === title);
/** The pending banner whose title is `title` (kit OutcomeBanner: role alert). */
const banner = (title: string): SemNode | undefined => flat(tree()).find((n) => n.role === 'alert' && flat(n.children).some((c) => c.name.includes(title)));
/** The open list (DataTable named by the tab) and one app's row in it. */
const table = (): SemNode | undefined => flat(tree()).find((n) => n.role === 'table' && n.name === strings['tab.open']);
const appRow = (name: string): SemNode | undefined => { const t = table(); return t ? flat(t.children).find((n) => n.role === 'row' && n.name.includes(name)) : undefined; };

/** The old /apps link with one app selected: it lands on Programs' Apps tab with that app's details. */
async function details(fx: string, key: string, name: string): Promise<void> {
  s = await renderPage({ page: 'apps', fx, path: `/apps?sel=${key}`, cols: 120, rows: 40 });
  await s.settle();
  await until(() => heading(name) !== undefined);
  expect(heading(name)).toBeDefined();
  clean();
}
/** The details' Stop, then its confirm. */
async function askStop(name: string): Promise<SemNode> {
  const stop = buttons(strings['act.stop']);
  expect(stop.length).toBe(1);
  await press(stop[0]);
  const title = say('stop.title', { name });
  await until(() => dialog(title) !== undefined);
  const d = dialog(title);
  expect(d).toBeDefined();
  return d!;
}
async function confirmIn(title: string, label: string): Promise<void> {
  const d = dialog(title);
  expect(d).toBeDefined();
  await press(buttons(label, [d!])[0]);
  await until(() => dialog(title) === undefined);
  expect(dialog(title)).toBeUndefined();
}

test('Stop asks first: the confirm opens on Cancel, Enter there stops nothing, and the confirm stops it', async () => {
  await details('many', 'b2c3d4', 'htop');
  const title = say('stop.title', { name: 'htop' });
  const d = await askStop('htop');
  // Its words are in the confirm (the details' Stop row says them too, so the dialog is read on its own).
  expect(flat(d.children).some((n) => n.name.includes(strings['stop.body']))).toBe(true);
  // A confirm opens on Cancel, never on its action.
  expect(flat(d.children).find((n) => n.states.focused)?.name).toBe(overlay.cancel);
  await s!.keys.press('enter');
  await until(() => dialog(title) === undefined);
  expect(dialog(title)).toBeUndefined();
  expect(says(say('st.ready', { name: 'htop' }))).toBe(true);
  // The focus is back on the Stop that opened it.
  expect(focused()?.role).toBe('button');
  expect(focused()?.name).toBe(strings['act.stop']);

  await askStop('htop');
  await confirmIn(title, strings['stop.confirm']);
  await until(() => says(say('st.closed', { name: 'htop' })));
  expect(says(say('st.closed', { name: 'htop' }))).toBe(true);
  clean();
}, 240_000);

test('a stop that may have gone through says so with Check again, never "didn\'t stop" or "closed"', async () => {
  await details('stop-pending', 'c3d4e5', 'Firefox');
  await askStop('Firefox');
  await confirmIn(say('stop.title', { name: 'Firefox' }), strings['stop.confirm']);
  const title = say('outcome.stop.title', { name: 'Firefox' });
  await until(() => banner(title) !== undefined);
  const b = banner(title);
  expect(b).toBeDefined();
  expect(buttons(kit['outcome.pending.check'], [b!]).length).toBe(1);
  expect(says(strings['short.st.stopUnsure'])).toBe(true);
  expect(says(strings['note.stopFailed'])).toBe(false);
  expect(says(kit['outcome.failed.title'])).toBe(false);
  expect(says(say('st.closed', { name: 'Firefox' }))).toBe(false);
  clean();
}, 240_000);

test('Check again with no answer keeps "Check needed" and its banner, and says nothing failed', async () => {
  await details('check-pending', 'a7b8c9', 'sqlite-web');
  const title = say('outcome.launch.title', { name: 'sqlite-web' });
  const b = banner(title);
  expect(b).toBeDefined();
  await press(buttons(kit['outcome.pending.check'], [b!])[0]);
  await s!.settle();
  const after = banner(title);
  expect(after).toBeDefined();
  // The read is over: its button is free again.
  expect(buttons(kit['outcome.pending.check'], [after!])[0]?.states.busy).toBeUndefined();
  expect(says(strings['short.st.startUnsure'])).toBe(true);
  expect(says(kit['outcome.failed.title'])).toBe(false);
  clean();
}, 240_000);

test('Stop goes ahead of a Check still waiting: its confirm opens and the stop is done', async () => {
  await details('check-slow', 'a7b8c9', 'sqlite-web');
  const title = say('outcome.launch.title', { name: 'sqlite-web' });
  await press(buttons(kit['outcome.pending.check'], [banner(title)!])[0]);
  const busy = (): boolean => { const b = banner(title); return !!b && buttons(kit['outcome.pending.check'], [b])[0]?.states.busy === true; };
  await until(busy);
  expect(busy()).toBe(true);
  await askStop('sqlite-web');
  await confirmIn(say('stop.title', { name: 'sqlite-web' }), strings['stop.confirm']);
  await until(() => says(say('st.closed', { name: 'sqlite-web' })));
  expect(says(say('st.closed', { name: 'sqlite-web' }))).toBe(true);
  clean();
}, 240_000);

test('Stop tracking asks first in danger words; Esc closes it, nothing is removed, and the focus is back on it', async () => {
  await details('held', 'a1b2c3', 'JupyterLab');
  const launch = say('outcome.launch.title', { name: 'JupyterLab' });
  expect(banner(launch)).toBeDefined();
  const trigger = buttons(strings['act.dismiss']);
  expect(trigger.length).toBe(1);
  await press(trigger[0]);
  const title = say('dismiss.title', { name: 'JupyterLab' });
  await until(() => dialog(title) !== undefined);
  const d = dialog(title);
  expect(d).toBeDefined();
  expect(flat(d!.children).some((n) => n.name.includes(strings['dismiss.body']))).toBe(true);
  expect(flat(d!.children).find((n) => n.states.focused)?.name).toBe(overlay.cancel);
  await s!.keys.press('escape');
  await until(() => dialog(title) === undefined);
  expect(dialog(title)).toBeUndefined();
  // Nothing was removed: the details and their banner are still there.
  expect(heading('JupyterLab')).toBeDefined();
  expect(banner(launch)).toBeDefined();
  expect(focused()?.role).toBe('button');
  expect(focused()?.name).toBe(strings['act.dismiss']);
  clean();
}, 240_000);

test('a refused stop says "Didn\'t stop. Try again." and the app is still ready', async () => {
  await details('stop-failed', 'a1b2c3', 'JupyterLab');
  await askStop('JupyterLab');
  await confirmIn(say('stop.title', { name: 'JupyterLab' }), strings['stop.confirm']);
  await until(() => says(strings['note.stopFailed']));
  expect(says(strings['note.stopFailed'])).toBe(true);
  expect(says(say('st.ready', { name: 'JupyterLab' }))).toBe(true);
  expect(banner(say('outcome.stop.title', { name: 'JupyterLab' }))).toBeUndefined();
  clean();
}, 240_000);

test('Remove takes the app off the list with an Undo toast; F6, Tab and Enter on Undo bring it back', async () => {
  await details('many', 'e5f6a7', 'Shared folder');
  const remove = buttons(strings['act.remove']);
  expect(remove.length).toBe(1);
  await press(remove[0]);
  const gone = say('forgot', { name: 'Shared folder' });
  await until(() => says(gone) && appRow('htop') !== undefined);
  // The details closed; the list shows, without the app.
  expect(heading('Shared folder')).toBeUndefined();
  expect(appRow('htop')).toBeDefined();
  expect(appRow('Shared folder')).toBeUndefined();
  expect(says(gone)).toBe(true);
  // The toast takes no focus by itself: F6 enters it (on its ×), Tab reaches Undo.
  await s!.keys.press('f6');
  await s!.keys.press('tab');
  const undo = buttons(strings['forgot.undo']);
  expect(undo.length).toBe(1);
  expect(undo[0]!.states.focused).toBe(true);
  await s!.keys.press('enter');
  await until(() => appRow('Shared folder') !== undefined);
  expect(appRow('Shared folder')).toBeDefined();
  expect(says(gone)).toBe(false);
  clean();
}, 240_000);

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: a row opens its details in place of the list, focus on "‹ ${programs.title}"; Esc goes back to that row`, async () => {
    s = await renderPage({ page: 'apps', fx: 'many', path: '/apps', cols, rows });
    await s.settle();
    await until(() => appRow('btop') !== undefined);
    clean();
    expect(s.frame).toContain('Firefox');
    await press(appRow('btop'));
    await until(() => heading('btop') !== undefined);
    expect(heading('btop')).toBeDefined();
    // One pane: the list is not drawn beside the details, and the back line has the focus.
    expect(s.frame).toContain(`‹ ${programs.title}`);
    expect(s.frame).not.toContain('Firefox');
    expect(focused()?.role).toBe('button');
    expect(focused()?.name).toBe(programs.title);
    await s.keys.press('escape');
    await until(() => heading('btop') === undefined && s!.frame.includes('Firefox'));
    expect(heading('btop')).toBeUndefined();
    expect(s.frame).toContain('Firefox');
    expect(focused()?.role).toBe('row');
    expect(focused()?.name).toContain('btop');
    clean();
  }, 240_000);
}

test('a stop note does not outlive its session: the next session starts without it', async () => {
  await details('stop-failed', 'a1b2c3', 'JupyterLab');
  await askStop('JupyterLab');
  await confirmIn(say('stop.title', { name: 'JupyterLab' }), strings['stop.confirm']);
  await until(() => says(strings['note.stopFailed']));
  expect(says(strings['note.stopFailed'])).toBe(true);
  s!.close(); s = null;

  // A new session of the same process (a sign-out and back in; the golden runner's next shot): nothing pressed yet.
  await details('stop-failed', 'a1b2c3', 'JupyterLab');
  expect(says(strings['note.stopFailed'])).toBe(false);
  expect(says(say('st.ready', { name: 'JupyterLab' }))).toBe(true);
}, 240_000);
