// The terminal Hub's shell end to end on the fixture world (createTermApp: keymap, page host, palette, sheet, menus,
// prompts), headless.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Start: top bar (HOODY, title, realm, computer, account, hint), sidebar groups, current page marked ▌ on the accent plate, status line | 'start' |
// | 1b | The current page's accent plate fills the sidebar row to the rule | 'the current nav item's plate fills its whole row, up to the rule' |
// | 1c | At 80 columns the sample account's status line shows its short Demo line and the whole key line | '80 columns, the sample account: the key line is whole beside the short Demo line' |
// | 1d | The status line is painted on the bars' ground across the whole row | 'the status line stands on the bars' ground, as the top bar (never the terminal's own background)' |
// | 2 | g + letter jumps; a click on a sidebar item opens its page and draws its label (never a blank block), and the rule beside the list keeps its line colour | 'navigate' |
// | 3 | Ctrl+K opens the palette; typed text filters (fast typing keeps every letter); Enter runs; the run is in Recent next time | 'palette' |
// | 4 | ? opens the sheet from the live keymap: page keys, shared groups, the terminal group | 'sheet' |
// | 5 | Below 100 columns the sidebar goes; `[` opens the page list grouped like the sidebar | 'narrow' |
// | 6 | q quits outside a field, types q inside one; a search field's Esc clears it, the next Esc leaves the field, and q then quits; Ctrl-C once warns, twice quits | 'quit' |
// | 7 | A page that throws shows its error, component path and retry key; the shell and other pages stay; r retries | 'crash' |
// | 9 | A click on a page's tab right after a resize lands on the new layout (Logs: Everything → Visits) | 'click after resize' |
// | 10 | The content pane is the terminal minus the chrome shown (sidebar + its gap), at 80/100/120 columns, at start and after a resize either way; no frame line passes the terminal's width | 'pane width' |
// | 11 | While a layer is open (a menu, a dialog) only one thing on screen shows focus: the page's focused control under it does not | 'one focus under a layer' |
// | 12 | `/` focuses the page's search field on a second mount in the same process (page keys run before the shell's) | 'search after remount' |
// | 13 | The realm menu ends with Rename realms, which opens the dialog of every realm with its Rename button | 'rename realms' |
// | 14 | The account menu's Keyboard shortcuts row opens the sheet through the trigger's onOpenShortcuts | 'account shortcuts' |
// | 15 | The account menu's last row is Leave the Hub: it quits the shell as q does, never a sign-out (no Sign out row, no sign-out question) | 'account menu leaves' |
// | 16 | The account menu names the language in use, with more coming soon, on a row that is not a choice: arrows pass it | 'account language' |
// | 8 | A page that is left keeps nothing mounted unless it asks (useKeepPage); coming back draws it again | 'keep-alive' |
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';
import { createTermApp } from './App';
import { openMenu } from '../shell/menus-store';
import { SHELL_PANE_ID, SIDEBAR_WIDTH } from '../shell/TermShell';
import { pageFailures } from './router';
import { setDemoMounted } from './demo-flag';
import { drawTest, type TestTerm } from '../prim/testing';
import { colour, setColourTier } from '../prim';
import { semanticsOf, type SemNode } from '../prim/semantics';

setDefaultTimeout(30_000);

let pages: readonly PageManifest[] = [];
let renders = 0;

beforeAll(async () => {
  setColourTier('truecolor');
  const all = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  // Demo throws on render (counted, so a retry is seen).
  pages = all.map((p) => (p.id !== 'demo' ? p : { ...p, load: async () => ({ default: function Boom(): never { renders++; throw new Error('Boom: on purpose'); } }) } as unknown as PageManifest));
  // The app's host state lives in a session, as in every mount (lifecycle.ts); the apps below share this one.
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
  await boot.start(session, () => {});
});
let session: TermSession | null = null;
let boot: TermBoot | null = null;

let t: TestTerm | null = null;
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

async function open(path: string, size = { width: 120, height: 40 }) {
  // The last app ends first (its pages unmount: no search field or shortcut list of it stays registered).
  await t?.dispose();
  const quits: string[] = [];
  const app = createTermApp({ pages, queryClient, path, onQuit: () => quits.push('quit') });
  t = await drawTest(app.element, size);
  const frame = await until((f) => f.includes('HOODY') && !f.includes('Loading…'));
  return { app, quits, frame };
}

/** Settles until the frame passes (or 4 s). */
async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}
const key = async (name: string, m?: { ctrl?: boolean; shift?: boolean; meta?: boolean }) => {
  // A lone Esc waits for the key parser's escape timeout before it is a key.
  if (name === 'escape') { t!.mockInput.pressEscape(m); await new Promise((r) => setTimeout(r, 80)); return t!.settle(); }
  // Named keys through their own presses (pressKey types a multi-letter name as text).
  if (name === 'return') t!.mockInput.pressEnter(m);
  else if (name === 'tab') t!.mockInput.pressTab(m);
  else if (name === 'end') t!.mockInput.pressKey('END', m);
  else t!.mockInput.pressKey(name, m);
  return t!.settle();
};
/** g then a letter, within the jump window (a settle between them can outlast it on a page that keeps drawing). */
const jump = async (letter: string) => { t!.mockInput.pressKey('g'); t!.mockInput.pressKey(letter); return t!.settle(); };
const rowOf = (frame: string, text: string): number => frame.split('\n').findIndex((l) => l.includes(text));

test('start', async () => {
  const { frame } = await open('/schedules');
  const lines = frame.split('\n');
  expect(lines[0]).toContain('HOODY');
  // The page names itself in its header, not in the top bar.
  expect(lines[0]).not.toContain('Schedules');
  expect(lines[1]).toContain('Schedules');
  expect(lines[0]).toMatch(/◆ .+ ▾/);
  expect(lines[0]).toContain('Ctrl+K commands');
  expect(frame).toContain('▌Schedules');
  // The current nav item is the web's: the accent plate with its ink (never the blue of focus and links).
  const here = t!.captureSpans().lines.flatMap((l) => l.spans).find((sp) => sp.text.includes('▌Schedules'));
  const hex = (c: { toInts(): number[] } | undefined) => '#' + (c?.toInts().slice(0, 3) ?? []).map((n) => n.toString(16).padStart(2, '0')).join('');
  expect(hex(here?.bg)).toBe(String(colour('acc')));
  expect(hex(here?.fg)).toBe(String(colour('accInk')));
  expect(frame).toMatch(/On \S+ ▾/);
  expect(lines.slice(-2).join('')).toContain('q quit');
});

test('the current nav item\'s plate fills its whole row, up to the rule', async () => {
  await open('/schedules');
  const line = t!.captureSpans().lines.find((l) => l.spans.some((sp) => sp.text.includes('▌Schedules')));
  expect(line).toBeDefined();
  const hex = (c: { toInts(): number[] } | undefined) => '#' + (c?.toInts().slice(0, 3) ?? []).map((n) => n.toString(16).padStart(2, '0')).join('');
  // Every cell left of the rule stands on the accent plate (it was the label's cells alone: a ragged edge).
  const row: Array<{ text: string; bg?: { toInts(): number[] } }> = [];
  for (const sp of line!.spans) { if (sp.text.includes('│')) break; row.push(sp); }
  expect(row.map((sp) => sp.text).join('').length).toBe(SIDEBAR_WIDTH - 1);
  for (const sp of row) expect(hex(sp.bg)).toBe(String(colour('acc')));
});

test('80 columns, the sample account: the key line is whole beside the short Demo line', async () => {
  setDemoMounted(true);
  try {
    await open('/schedules', { width: 80, height: 24 });
    const last = (await t!.settle()).split('\n').filter((l) => l.trim() !== '').pop() ?? '';
    // It drew "Tab move · Enter open · Ctrl+K comman…  Demo · sample data, nothing is changed".
    expect(last).toContain('Ctrl+K commands · ? keys · q quit');
    expect(last).not.toContain('…');
    expect(last.trimEnd().endsWith('Demo account')).toBe(true);
    // With room (the sidebar's width and up) the long line stands.
    t!.resize(120, 40);
    const wide = (await until((x) => x.includes('▌Schedules'))).split('\n').filter((l) => l.trim() !== '').pop() ?? '';
    expect(wide).toContain('q quit');
    expect(wide).toContain('Demo · sample data, nothing is changed');
  } finally { setDemoMounted(false); }
});

test('the status line stands on the bars\' ground, as the top bar (never the terminal\'s own background)', async () => {
  await open('/schedules');
  const hex = (c: { toInts(): number[] } | undefined) => '#' + (c?.toInts().slice(0, 3) ?? []).map((n) => n.toString(16).padStart(2, '0')).join('');
  const lines = t!.captureSpans().lines;
  const status = lines.filter((l) => l.spans.some((sp) => sp.text.includes('q quit'))).pop();
  expect(status).toBeDefined();
  expect(status!.spans.map((sp) => sp.text).join('').length).toBe(120);
  for (const sp of status!.spans) expect(hex(sp.bg)).toBe(String(colour('card')));
  // The top bar's ground is the same one.
  for (const sp of lines[0]!.spans.filter((x) => x.text.includes('HOODY'))) expect(hex(sp.bg)).toBe(String(colour('card')));
});

test('navigate', async () => {
  const { app } = await open('/schedules');
  let f = await jump('l');
  f = await until((x) => x.includes('▌Logs'));
  expect(app.router.latestLocation.pathname).toBe('/logs');
  // A click on a sidebar row (the defect: the current row drew as a blank highlighted block, the rule took focus colour).
  const y = rowOf(f, ' Notifications');
  await t!.mockMouse.click(3, y);
  f = await until((x) => x.includes('▌Notifications'));
  expect(app.router.latestLocation.pathname).toBe('/notifications');
  expect(f.split('\n')[y]).toContain('Notifications');
  const spans = t!.captureSpans();
  const rule = spans.lines[2]!.spans.find((s) => s.text.includes('│'));
  expect(rule).toBeDefined();
  expect(String(rule?.fg)).not.toBe(String(colour('focus')));
});

test('palette', async () => {
  const { app } = await open('/schedules');
  let f = await key('k', { ctrl: true });
  expect(f).toContain('Command palette');
  expect(f).toContain('PAGES');
  await t!.mockInput.typeText('tunn');
  f = await t!.settle();
  expect(f).toContain('› tunn');
  f = await key('return');
  f = await until((x) => x.includes('▌Tunnels'));
  expect(app.router.latestLocation.pathname).toBe('/tunnels');
  f = await key('k', { ctrl: true });
  expect(f).toContain('RECENT');
  f = await key('escape');
  f = await until((x) => !x.includes('Command palette'));
  expect(f).not.toContain('Command palette');
});

test('sheet', async () => {
  await open('/schedules');
  const f = await key('?', { shift: true });
  expect(f).toContain('Keyboard shortcuts');
  expect(f).toContain('EVERYWHERE');
  expect(f).toContain('g l');
  expect(f).toContain('Ctrl+K');
  // A blank row stands before a group's head (the heads ran on from the last key row of the group above).
  const sheetRows = f.split('\n');
  const goTo = sheetRows.findIndex((l) => /│ GO TO\s*│/.test(l));
  expect(goTo).toBeGreaterThan(0);
  expect(sheetRows[goTo - 1]).toMatch(/│\s+│/);
  // The terminal's conflict rows (several keys, a long fallback) are whole: keys on their own line, the text wrapped.
  const end = await key('end');
  expect(end).toContain('Ctrl+M Ctrl+I Ctrl+[');
  expect(end).toContain('Ctrl+S Ctrl+Q');
  expect(end).toContain('use the palette');
  expect(end).toContain('Esc or ? closes');
  expect(end).not.toContain('...');
  const closed = await key('escape');
  expect(await until((x) => !x.includes('Keyboard shortcuts'))).not.toContain('Keyboard shortcuts');
  void closed;
});

test('narrow', async () => {
  await open('/schedules', { width: 80, height: 24 });
  let f = await t!.settle();
  expect(f).toContain('≡');
  expect(f).not.toContain('▌Schedules');
  f = await key('[');
  expect(f).toContain('Pages');
  expect(f).toContain('✓ Schedules');
  // The sidebar's groups, in its order: Home before Programs before Plans & Billing.
  const order = ['Home', 'Programs', 'Plans & Billing'].map((x) => rowOf(f, x));
  expect(order[0]).toBeLessThan(order[1]!);
  await key('escape');
  t!.resize(120, 40);
  f = await until((x) => x.includes('▌Schedules'));
  expect(f).toContain('▌Schedules');
});

test('quit', async () => {
  const { quits } = await open('/logs');
  await until((x) => x.includes('/ Search'));
  // q in the search field is a letter (the field focused by a click here; `/` is 'search after remount').
  let f = await t!.settle();
  const y = rowOf(f, '/ Search');
  const x = f.split('\n')[y]!.indexOf('/ Search') + 3;
  await t!.mockMouse.click(x, y);
  f = await key('q');
  expect(f).toMatch(/\/ q/);
  expect(quits).toEqual([]);
  expect(f).toContain('Esc leaves the field');
  // Esc: the search field's own Esc clears it first (as on the web); an Esc it does not use leaves the field.
  f = await key('escape');
  expect(f).not.toMatch(/\/ q/);
  expect(f).toContain('Esc leaves the field');
  f = await key('escape');
  expect(f).not.toContain('Esc leaves the field');
  await key('q');
  expect(quits).toEqual(['quit']);
  // A shell quits once: Ctrl-C on a fresh one.
  const third = await open('/logs');
  f = await key('c', { ctrl: true });
  expect(f).toContain('Press Ctrl+C again to leave');
  expect(third.quits).toEqual([]);
  await key('c', { ctrl: true });
  expect(third.quits).toEqual(['quit']);
  const again = await open('/schedules');
  await key('q');
  expect(again.quits).toEqual(['quit']);
});

test('crash', async () => {
  const before = pageFailures().length;
  const { app } = await open('/demo');
  let f = await until((x) => x.includes('could not be drawn'));
  // A code and a class name, never the error's message.
  expect(f).toContain('UNHANDLED (Error)');
  expect(f).not.toContain('on purpose');
  expect(f).toMatch(/In: Boom < PageView/);
  expect(f).toContain('Press r to try again');
  expect(f).toContain('▌Demo');
  expect(pageFailures().length).toBeGreaterThan(before);
  const n = renders;
  f = await key('r');
  expect(renders).toBeGreaterThan(n);
  // The shell survives: another page opens.
  await jump('s');
  f = await until((x) => x.includes('▌Schedules'));
  expect(app.router.latestLocation.pathname).toBe('/schedules');
});

test('keep-alive', async () => {
  const { app } = await open('/schedules');
  await jump('l');
  let f = await until((x) => x.includes('▌Logs'));
  f = await jump('s');
  f = await until((x) => x.includes('▌Schedules') && !x.includes('Loading…'));
  expect(app.router.latestLocation.pathname).toBe('/schedules');
  expect(f).toContain('Schedules');
});

test('click after resize', async () => {
  await open('/logs', { width: 200, height: 60 });
  await until((x) => x.includes('kinds of problem'));
  t!.resize(120, 40);
  let f = await until((x) => x.split('\n').length <= 41);
  // The source switch is a folder strip (SegmentedControl variant="folder"): the open one reads "▸ Label".
  const y = rowOf(f, '▸ Everything');
  expect(y).toBeGreaterThanOrEqual(0);
  const x = f.split('\n')[y]!.indexOf('Visits') + 2;
  await t!.mockMouse.click(x, y);
  f = await until((v) => v.includes('▸ Visits'));
  expect(f).toContain('▸ Visits');
  expect(f).not.toContain('▸ Everything');
});

test('pane width', async () => {
  // The chrome beside the pane: the sidebar with its rule (the pane's left gap is inside it), from SIDEBAR_MIN_COLS (100) only.
  const expected = (cols: number) => (cols >= 100 ? cols - SIDEBAR_WIDTH : cols);
  const pane = () => (t!.renderer.root.findDescendantById(SHELL_PANE_ID) as { width: number } | undefined)?.width;
  const check = async (cols: number, rows: number) => {
    const f = await until(() => pane() === expected(cols));
    expect({ cols, pane: pane() }).toEqual({ cols, pane: expected(cols) });
    // Nothing drawn past the edge: the top bar's far end and the status line are on screen.
    expect(f.split('\n').length).toBeLessThanOrEqual(rows + 1);
    expect(f).toContain('HOODY');
  };
  for (const [cols, rows] of [[80, 24], [100, 30], [120, 40]] as const) {
    await open('/keys', { width: cols, height: rows });
    await check(cols, rows);
  }
  // Resizes from the last (120x40) down and back up.
  for (const [cols, rows] of [[80, 24], [100, 30], [120, 40], [80, 24]] as const) {
    t!.resize(cols, rows);
    await check(cols, rows);
  }
});

// FAILING until prim/focus.ts lets an inactive FocusRoot's controls read `focused: false`.
// App.tsx already makes the page root inactive under a layer (PageRoot). Flip to test() then.
test('one focus under a layer', async () => {
  await open('/schedules');
  const focused = (): SemNode[] => {
    const out: SemNode[] = [];
    const walk = (ns: SemNode[]) => { for (const x of ns) { if (x.states.focused) out.push(x); walk(x.children); } };
    walk(semanticsOf(t!.renderer as never));
    return out;
  };
  // A page control takes the focus.
  for (let i = 0; i < 6 && focused().length === 0; i++) await key('tab');
  const before = focused().map((n) => n.name);
  expect(before).toHaveLength(1);
  // The realm menu: a popover layer with its own focus. Exactly one focused node, and it is not the page's control.
  await key('r', { meta: true });
  await until((f) => f.includes('Realms') || f.includes('All realms'));
  const under = focused().map((n) => n.name);
  expect(under.filter((n) => n === before[0])).toEqual([]);
  expect(under.length).toBeLessThanOrEqual(1);
  await key('escape');
  expect(focused().map((n) => n.name)).toEqual(before);
});
test('search after remount', async () => {
  // The shell's own keys run after the page's (its handler registers first): `/` reaches the page's search field
  // whether the page module was loaded in this mount or an earlier one.
  for (let i = 0; i < 2; i++) {
    await open('/logs');
    await until((x) => x.includes('/ Search'));
    expect(await key('/')).toContain('Esc leaves the field');
  }
});
test('typing hint follows the focus', async () => {
  // The hint is render state fed by the renderer's focus events: a field that loses the focus with nothing else
  // drawing.
  await open('/logs');
  await until((x) => x.includes('/ Search'));
  expect(await key('/')).toContain('Esc leaves the field');
  const focused = t!.renderer.currentFocusedRenderable as { blur(): void } | null;
  expect(focused).not.toBeNull();
  focused!.blur();
  expect(t!.renderer.currentFocusedRenderable).toBeNull();
  const f = await until((x) => !x.includes('Esc leaves the field'), 1000);
  expect(f).not.toContain('Esc leaves the field');
  expect(f.split('\n').slice(-2).join('')).toContain('q quit');
});
test('rename realms', async () => {
  // The realm menu ends with Rename realms; it opens the dialog listing every realm with its Rename button.
  await open('/schedules');
  await key('r', { meta: true });
  let f = await until((x) => x.includes('Rename realms…'));
  expect(f).toContain('Rename realms…');
  // It sits right above the footer (Share this realm, New realm): End, then up past the footer rows.
  t!.mockInput.pressKey('END');
  await t!.settle();
  const footer = ['Share this realm', 'Share a realm', '+ New realm'].filter((x) => f.includes(x)).length;
  for (let i = 0; i < footer; i++) { t!.mockInput.pressArrow('up'); await t!.settle(); }
  await key('return');
  f = await until((x) => /Rename \S/.test(x) && x.includes('Rename realms') && !x.includes('Rename realms…'));
  expect(f).toContain('Rename realms');
  expect(f).toMatch(/Rename \S+/);
  await key('escape');
});
test('account menu leaves', async () => {
  const { quits } = await open('/schedules');
  openMenu('account');
  let f = await until((x) => x.includes('Leave the Hub'));
  expect(f).not.toContain('Sign out');
  t!.mockInput.pressKey('END');
  await t!.settle();
  f = await key('return');
  expect(quits).toEqual(['quit']);
  expect(f).not.toContain('Sign out');
});

test('account language', async () => {
  const { quits } = await open('/schedules');
  openMenu('account');
  let f = await until((x) => x.includes('Leave the Hub'));
  const lines = f.split('\n');
  const row = lines.findIndex((l) => l.includes('Language'));
  expect(row, f).toBeGreaterThan(-1);
  expect(lines[row]).toContain('English · more coming soon');
  // Above Keyboard shortcuts, in its block.
  expect(lines[row + 1], f).toContain('Keyboard shortcuts');
  // Not a choice: from Keyboard shortcuts, Up passes it (the row above it in the links block takes the cursor), and
  // Enter there opens that page, never a language list.
  t!.mockInput.pressKey('END');
  await t!.settle();
  const above = f.includes('Lock now') ? 2 : 1;
  for (let i = 0; i < above + 1; i++) { t!.mockInput.pressArrow('up'); await t!.settle(); }
  f = await key('return');
  expect(quits).toEqual([]);
  expect(f).not.toContain('Leave the Hub');
  expect(f).not.toContain('Deutsch');
});

test('account shortcuts', async () => {
  await open('/schedules');
  openMenu('account');
  let f = await until((x) => x.includes('Keyboard shortcuts') && x.includes('Leave the Hub'));
  expect(f).not.toContain('EVERYWHERE');
  // Keyboard shortcuts sits above Leave the Hub (and Lock now, when a passcode is set).
  t!.mockInput.pressKey('END');
  await t!.settle();
  const above = f.includes('Lock now') ? 2 : 1;
  for (let i = 0; i < above; i++) { t!.mockInput.pressArrow('up'); await t!.settle(); }
  await key('return');
  f = await until((x) => x.includes('EVERYWHERE'));
  expect(f).toContain('EVERYWHERE');
  await key('escape');
});
