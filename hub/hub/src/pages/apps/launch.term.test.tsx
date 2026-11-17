// The apps launcher in a terminal: the Apps tab of Programs (launch/AppsSection.tsx), where an old /apps link lands
// (view.tsx redirectFor), with the apps fixtures in force.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | /apps lands on Programs with the Apps tab chosen; "Apps are in Programs now" is not left on screen | 'an old /apps link …' |
// | 2 | An open app's Open hands its whole web address to the host browser, once; the page stays on the Apps tab | 'Open on an open app …' |
// | 3 | Coding agents: one badge each (Installed, Not installed, Couldn't check); Open on one that is not installed says so and starts nothing | 'Coding agents: …' |
// | 4 | Options from a Find row, then Back: Launch an app again, with the words typed before | 'Options, then Back …' |
// | 5 | A launch whose answer is lost: the drawer closes, the details say it may have gone through, with Check again, never "failed"; a second Open of the same app is held and starts nothing | 'a launch whose answer is lost …' |
//
// The launcher's list is module state (parts/ops.ts) that a fixture session never clears, so each test starts from an
// empty one and leaves none behind.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import kit from '../../kit/strings.en.json';
import programs from '../programs/strings.en.json';
import { ops } from './parts/ops';
import strings from './strings.en.json';

let s: PageSession | null = null;
beforeEach(() => ops.reset());
afterEach(() => { s?.close(); s = null; ops.reset(); });

const fill = (text: string, v: Record<string, string | number>): string => Object.entries(v).reduce((acc, [k, x]) => acc.replace(`{{${k}}}`, String(x)), text);
const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const flat = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const says = (text: string): boolean => flat(tree()).some((n) => n.name.includes(text) || (n.description ?? '').includes(text));
const inside = (n: SemNode | undefined, role: string, name: string): SemNode | undefined => (n ? flat(n.children).find((c) => c.role === role && c.name === name) : undefined);
/** The open drawer or dialog of that title. */
const dialog = (title: string): SemNode | undefined => flat(tree()).find((n) => n.role === 'dialog' && n.name === title);
/** Rows holding `text` (inside `within` when given), and among them the ones with a control of that role and name. */
const rows = (text: string, within?: SemNode): SemNode[] => flat(within ? within.children : tree()).filter((n) => n.role === 'row' && n.name.includes(text));
const rowWith = (text: string, role: string, name: string, within?: SemNode): SemNode | undefined => rows(text, within).find((r) => inside(r, role, name) !== undefined);
/** The page header's title (the top bar names no page). */
const top = (): string => flat(tree()).filter((n) => n.role === 'heading' && n.level === 1).map((n) => n.name ?? '').join(' ');
async function until(ok: () => boolean): Promise<void> { for (let i = 0; i < 8 && !ok(); i++) await s!.settle(); }
async function press(n: SemNode | undefined): Promise<void> {
  expect(n).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}
function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
}
async function open(fx: string, path: string, o: { cols?: number; rows?: number; openExternal?: (url: string) => void } = {}): Promise<void> {
  s = await renderPage({ page: 'apps', fx, path, cols: o.cols ?? 120, rows: o.rows ?? 40, ...(o.openExternal ? { openExternal: o.openExternal } : {}) });
  await s.settle();
  await until(() => top().includes(programs.title) && !says(strings.moved));
  clean();
}
const appsTab = (): SemNode | undefined => flat(tree()).find((n) => n.role === 'tab' && n.name === programs['tab.apps']);
const launcher = (): SemNode | undefined => dialog(strings['launch.title']);
const JUPYTER = 'JupyterLab';
/** JupyterLab's row in Launch an app with its inline Open (none while the drawer is closed). */
const findRow = (): SemNode | undefined => { const d = launcher(); return d ? rowWith(JUPYTER, 'button', strings['act.open'], d) : undefined; };

for (const [w, h] of [[80, 24], [120, 40]] as const) {
  test(`${w}x${h}: an old /apps link lands on the Apps tab of Programs, and its "moved" note is not left on screen`, async () => {
    await open('many', '/apps', { cols: w, rows: h });
    expect(top()).toContain(programs.title);
    expect(appsTab()?.states.selected).toBe(true);
    expect(s!.frame).not.toContain(strings.moved);
    expect(says(strings.moved)).toBe(false);
    expect(s!.frame).toContain(fill(strings.count_other, { count: 8 }));
    clean();
  }, 240_000);
}

test('Open on an open app hands its whole web address to the host browser, once; the page stays on the Apps tab', async () => {
  const opened: string[] = [];
  await open('many', '/apps', { openExternal: (u) => { opened.push(u); } });
  const fx = (await import('./fixtures')).default as unknown as { states: { many: { opened: { data: { key: string; name: string; urls: { web?: string } }[] } } } };
  const app = fx.states.many.opened.data.find((r) => r.name === JUPYTER);
  expect(app?.urls.web).toMatch(/^https:\/\//);
  const row = rowWith(JUPYTER, 'link', strings['act.open']);
  await press(inside(row, 'link', strings['act.open']));
  expect(opened).toEqual([app!.urls.web!]);
  expect(top()).toContain(programs.title);
  expect(appsTab()?.states.selected).toBe(true);
  clean();
}, 240_000);

test('Coding agents: one badge each, and Open on one that is not installed says so and starts nothing', async () => {
  await open('many', '/apps?tab=find');
  await until(() => launcher() !== undefined && says(strings['agents.badge.unchecked']));
  const card = (name: string): SemNode | undefined => flat(launcher()?.children ?? []).find((n) => n.role === 'listitem' && n.name.includes(name));
  // Claude Code is on the computer; Codex CLI's whole answer has no such program; Gemini CLI's answer came in part and
  // OpenCode's source failed, so neither can be said to be missing.
  expect(card('Claude Code')?.name).toContain(strings['agents.badge.installed']);
  expect(card('Claude Code')?.name).not.toContain(strings['agents.badge.missing']);
  expect(card('Codex CLI')?.name).toContain(strings['agents.badge.missing']);
  expect(card('Gemini CLI')?.name).toContain(strings['agents.badge.unchecked']);
  expect(card('OpenCode')?.name).toContain(strings['agents.badge.unchecked']);

  const missing = fill(strings['agents.notInstalled'], { name: 'Codex CLI' });
  expect(says(missing)).toBe(false);
  await press(inside(card('Codex CLI'), 'button', strings['act.open']));
  await until(() => says(missing));
  expect(card('Codex CLI')?.name).toContain(missing);
  // Nothing was opened: the launcher stays, and no launch was listed.
  expect(launcher()).toBeDefined();
  expect(ops.get().launches).toEqual([]);
  clean();
}, 240_000);

test('Options, then Back: Launch an app shows again with the words typed before', async () => {
  await open('many', '/apps?tab=find&q=jupyter');
  await until(() => findRow() !== undefined);
  // The row's ⋯ ("Row actions") holds Options; a click on its glyph opens the menu.
  const more = inside(findRow(), 'button', kit['table.rowActions']);
  expect(more).toBeDefined();
  await s!.click(more!.box[0] + more!.box[2] - 1, more!.box[1]);
  await s!.settle();
  const item = (): SemNode | undefined => flat(tree()).find((n) => n.role === 'menuitem' && n.name.startsWith(strings['act.options']));
  await until(() => item() !== undefined);
  await press(item());
  const optionsTitle = fill(strings['opt.title'], { name: JUPYTER });
  await until(() => dialog(optionsTitle) !== undefined);
  expect(dialog(optionsTitle)).toBeDefined();
  expect(launcher()).toBeUndefined();

  // Back, once the drawer has settled (its head buttons are off while it opens).
  const back = (): SemNode | undefined => flat(dialog(optionsTitle)?.children ?? []).find((n) => n.name === strings['opt.back'] && n.actions.includes('press'));
  await until(() => back() !== undefined);
  await press(back());
  await until(() => launcher() !== undefined);
  expect(dialog(optionsTitle)).toBeUndefined();
  expect(launcher()).toBeDefined();
  expect(inside(launcher(), 'searchbox', strings['launch.search'])?.value).toBe('jupyter');
  clean();
}, 240_000);

test('a launch whose answer is lost: the details say it may have gone through, never "failed", and a second Open starts nothing', async () => {
  await open('launch-pending', '/apps?tab=find&q=jupyter');
  await until(() => findRow() !== undefined);
  await press(inside(findRow(), 'button', strings['act.open']));

  const title = fill(strings['outcome.launch.title'], { name: JUPYTER });
  const banner = (): SemNode | undefined => flat(tree()).find((n) => n.role === 'alert' && n.name.includes(title));
  await until(() => banner() !== undefined);
  // The drawer closed on the press; the new row's details show the unknown outcome and its read-back.
  expect(launcher()).toBeUndefined();
  expect(banner()).toBeDefined();
  expect(inside(banner(), 'button', kit['outcome.pending.check'])).toBeDefined();
  expect(says(strings['short.st.startUnsure'])).toBe(true);
  const neverFailed = (): void => {
    for (const no of [kit['outcome.failed.title'], fill(strings['launcher.failed'], { name: JUPYTER }), fill(strings['st.notStarted'], { name: JUPYTER }), fill(strings['fail.start'], { name: JUPYTER }), strings['short.st.notStarted']]) {
      expect(says(no)).toBe(false);
    }
  };
  neverFailed();
  expect(ops.get().launches.length).toBe(1);

  // Launch an app again and Open the same app: the unresolved copy holds it back.
  const launch = flat(tree()).find((n) => n.role === 'button' && n.name.includes(strings['launch.action']) && n.actions.includes('press'));
  await press(launch);
  await until(() => findRow() !== undefined);
  await press(inside(findRow(), 'button', strings['act.open']));
  await until(() => says(strings['note.held']));
  expect(launcher()).toBeUndefined();
  expect(says(strings['note.held'])).toBe(true);
  expect(banner()).toBeDefined();
  neverFailed();
  // Nothing was sent again: every Open lists its launch before it sends (useApps launch), and the list still holds one.
  expect(ops.get().launches.length).toBe(1);
  // Back to the list (one pane: the details' Back line; two panes: the list is already beside them): one JupyterLab row.
  const detail = flat(tree()).find((n) => n.role === 'region' && n.name === kit['listDetail.detail']);
  const backLine = inside(detail, 'button', programs.title);
  if (backLine) await press(backLine);
  await until(() => rows(JUPYTER).length > 0);
  expect(rows(JUPYTER).length).toBe(1);
  expect(rows(JUPYTER)[0]!.name).toContain(strings['short.st.startUnsure']);
  clean();
}, 240_000);
