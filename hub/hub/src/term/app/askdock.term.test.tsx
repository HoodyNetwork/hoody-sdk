// The Ask dock seam in the terminal shell (shell/AskDock.tsx), headless on the fixture world. The panel is a stand-in
// (provideAskDock): one text field, so these tests hold the shell's part only (where it draws, keys, focus).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | From Schedules at 120 columns, Alt+J opens a pane on the right (the page stays drawn beside it) with the focus in its field; typed text lands there; Alt+J closes it and the focus is back on the same list row | 'pane: open, type, close' |
// | 2 | In the pane, Esc goes back to the page (same row) and the pane stays open; a click in the pane takes the keys again; the text is kept | 'pane: Esc leaves, click enters' |
// | 3 | Below 120 columns the dock is a full-screen sheet over the page; Esc closes it and the focus is back on the row; the page kept its state (its row) | 'sheet below 120' |
// | 4 | The palette has "Open or close Agent" with Alt+J, and runs it; the ? sheet lists Alt+J for it (never Ctrl+J) | 'palette and sheet' |
// | 5 | The pane is resizable through the pane-width store (its rule: Home = narrowest, Enter = default) | 'pane width' |
// | 6 | An open pane keeps the keys even when its panel has nothing to focus (a panel that failed to load): text typed on AI never reaches its chat list (the defect: entering emitted the page's focus store, read as a click on the page, so the pane gave the keys back) | 'keys stay in the dock' |
// | 8 | With the keys in the pane, a click on the page row that already has the page's focus gives the keys back to the page (nothing moved, but the person asked for the page) | 'pane: a click on the focused page row leaves' |
// | 7 | A panel that takes longer to load than the dock's own short looks for a tab stop (a cold start on a busy machine) still gets the keyboard when it mounts: Alt+J, wait for it, type, and the text is in its field | 'sheet: a slow panel still gets the keys' |
import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { lazy, useState } from 'react';
import type { PageManifest } from '@kit/page';
import { useAskDock } from '@kit/ask';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from './boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from './lifecycle';
import { createTermApp } from './App';
import { provideAskDock } from '../shell/AskDock';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, Text, TextInput, setColourTier } from '../prim';
import { semanticsOf, type SemNode } from '../prim/semantics';

setDefaultTimeout(30_000);

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;
let unprovide: (() => void) | null = null;
let typed = '';

function StandIn() {
  const [v, setV] = useState(typed);
  return (
    <Box dir="column">
      <Text>DOCK-STAND-IN</Text>
      <TextInput value={v} onChange={(x) => { typed = x; setV(x); }} sem={{ role: 'textbox', name: 'Ask field' }} />
    </Box>
  );
}

beforeAll(async () => {
  setColourTier('truecolor');
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
  await boot.start(session, () => {});
  unprovide = provideAskDock(() => <StandIn />);
});
afterEach(() => { typed = ''; });
afterAll(async () => {
  await t?.dispose();
  unprovide?.();
  await boot?.dispose('term-quit');
  session?.end();
});

let closeDock: (() => void) | null = null;
function DockCloser() { const d = useAskDock(); closeDock = d.close; return null; }

async function open(path: string, size = { width: 120, height: 40 }) {
  await t?.dispose();
  const app = createTermApp({ pages, queryClient, path, onQuit: () => {} });
  t = await drawTest(<>{app.element}<DockCloser /></>, size);
  // A dock left open by an earlier test (the open state is remembered per device): closed before this one starts.
  closeDock?.();
  await until((f) => f.includes('HOODY') && !f.includes('Loading…') && !f.includes('DOCK-STAND-IN'));
  return app;
}
async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}
const key = async (name: string, m?: { ctrl?: boolean; shift?: boolean; meta?: boolean }) => {
  if (name === 'escape') { t!.mockInput.pressEscape(m); await new Promise((r) => setTimeout(r, 80)); return t!.settle(); }
  if (name === 'return') t!.mockInput.pressEnter(m);
  else if (name === 'tab') t!.mockInput.pressTab(m);
  else if (name === 'home') t!.mockInput.pressKey('HOME', m);
  else t!.mockInput.pressKey(name, m);
  await new Promise((r) => setTimeout(r, 40));
  return t!.settle();
};
const altJ = () => key('j', { meta: true });
const typeText = async (s: string) => { for (const c of s) t!.mockInput.pressKey(c); return t!.settle(); };

const focusedNodes = (): SemNode[] => {
  const out: SemNode[] = [];
  const walk = (ns: SemNode[]) => { for (const x of ns) { if (x.states.focused) out.push(x); walk(x.children); } };
  walk(semanticsOf(t!.renderer as never));
  return out;
};
const focusedName = (): string | undefined => focusedNodes()[0]?.name;
const focusedRole = (): string | undefined => focusedNodes()[0]?.role;

/** Tab into Schedules' list, then one row down: the row the dock tests come back to. */
async function onARow(): Promise<string> {
  for (let i = 0; i < 12 && !/row|option|gridcell|listitem/.test(focusedRole() ?? ''); i++) await key('tab');
  expect(focusedRole()).toMatch(/row|option|gridcell|listitem/);
  const first = focusedName();
  await key('j');
  await until(() => focusedName() !== first, 1500);
  const name = focusedName();
  expect(name).toBeTruthy();
  return name!;
}

test('pane: open, type, close', async () => {
  await open('/schedules');
  const row = await onARow();
  await altJ();
  let f = await until((x) => x.includes('DOCK-STAND-IN'));
  // A pane beside the page: the page's title is still drawn left of it, on the same screen.
  const line = f.split('\n').find((l) => l.includes('DOCK-STAND-IN'))!;
  expect(line.indexOf('DOCK-STAND-IN')).toBeGreaterThan(60);
  expect(f).toContain('Schedules');
  await until(() => focusedName() === 'Ask field');
  expect(focusedName()).toBe('Ask field');
  // One focus on screen: the page's row is not drawn focused under the dock.
  expect(focusedNodes()).toHaveLength(1);
  f = await typeText('hello');
  expect(f).toContain('hello');
  expect(typed).toBe('hello');
  await altJ();
  f = await until((x) => !x.includes('DOCK-STAND-IN'));
  expect(f).not.toContain('DOCK-STAND-IN');
  await until(() => focusedName() === row);
  expect(focusedName()).toBe(row);
  expect(focusedNodes()).toHaveLength(1);
});

test('pane: Esc leaves, click enters', async () => {
  await open('/schedules');
  const row = await onARow();
  await altJ();
  await until(() => focusedName() === 'Ask field');
  await typeText('kept');
  await key('escape');
  // The same row (its name is its drawn text, which the narrower page cuts sooner: compared by its start).
  const same = (n: string | undefined) => !!n && n.slice(0, 24) === row.slice(0, 24);
  await until(() => same(focusedName()));
  expect(focusedName()?.slice(0, 24)).toBe(row.slice(0, 24));
  let f = await t!.settle();
  expect(f).toContain('DOCK-STAND-IN');
  expect(f).toContain('kept');
  // Page keys work again (j moves the row), the field got none of them.
  await key('j');
  expect(typed).toBe('kept');
  // A click on the field takes the keys again.
  const lines = f.split('\n');
  const y = lines.findIndex((l) => l.includes('kept'));
  const x = lines[y]!.indexOf('kept');
  await t!.mockMouse.click(x + 4, y); // just after the text (a click places the caret)
  await until(() => focusedName() === 'Ask field');
  expect(focusedName()).toBe('Ask field');
  await typeText('!');
  expect(typed).toBe('kept!');
  await altJ();
  f = await until((x) => !x.includes('DOCK-STAND-IN'));
  expect(f).not.toContain('DOCK-STAND-IN');
});

test('sheet below 120', async () => {
  await open('/schedules', { width: 100, height: 30 });
  const row = await onARow();
  await altJ();
  const f = await until((x) => x.includes('DOCK-STAND-IN'));
  // Full screen: the stand-in starts at the left edge and the shell's top bar is covered.
  const line = f.split('\n').find((l) => l.includes('DOCK-STAND-IN'))!;
  expect(line.indexOf('DOCK-STAND-IN')).toBeLessThan(3);
  expect(f).not.toContain('HOODY');
  await until(() => focusedName() === 'Ask field');
  await typeText('x');
  expect(typed).toBe('x');
  await key('escape');
  await until((x) => !x.includes('DOCK-STAND-IN'));
  await until(() => focusedName() === row);
  expect(focusedName()).toBe(row);
});

test('palette and sheet', async () => {
  await open('/schedules');
  await key('k', { ctrl: true });
  let f = await typeText('close agent');
  f = await until((x) => x.includes('Open or close Agent'));
  expect(f).toMatch(/Open or close Agent.*Alt\+J/);
  await key('return');
  f = await until((x) => x.includes('DOCK-STAND-IN'));
  expect(f).toContain('DOCK-STAND-IN');
  await altJ();
  await until((x) => !x.includes('DOCK-STAND-IN'));
  // The ? sheet: Alt+J for Agent, no Ctrl+J anywhere.
  await key('escape');
  f = await key('?');
  f = await until((x) => x.includes('Open or close Agent'));
  expect(f).toMatch(/Alt\+J\s+Open or close Agent/);
  expect(f).not.toContain('Ctrl+J');
});

test('pane width', async () => {
  await open('/schedules');
  await altJ();
  await until((x) => x.includes('DOCK-STAND-IN'));
  const col = (f: string) => { const l = f.split('\n').find((x) => x.includes('DOCK-STAND-IN'))!; return l.indexOf('DOCK-STAND-IN'); };
  const def = col(await t!.settle());
  // Shift+Tab from the field reaches the rule (the dock's own Tab order), Home = narrowest.
  await key('tab', { shift: true });
  expect(focusedRole()).toBe('separator');
  await key('home');
  const narrow = col(await until((f) => col(f) > def));
  expect(narrow).toBeGreaterThan(def);
  await key('return');
  expect(col(await until((f) => col(f) === def))).toBe(def);
  await altJ();
});

test('keys stay in the dock', async () => {
  // On AI (its chat list opens a chat on a typed key): typed keys while the pane is open must not reach the page.
  const undo = provideAskDock(() => <Text>DOCK-STAND-IN nothing to focus</Text>);
  try {
    const app = await open('/ai', { width: 140, height: 40 });
    await until((x) => x.includes('New chat'));
    await altJ();
    await until((x) => x.includes('DOCK-STAND-IN'));
    await typeText('hello agent');
    await new Promise((r) => setTimeout(r, 300));
    expect(app.router.latestLocation.pathname).toBe('/ai');
    expect(await t!.settle()).toContain('DOCK-STAND-IN');
    await altJ();
  } finally { undo(); }
});

test('sheet: a slow panel still gets the keys', async () => {
  // The panel loads when the test says so: well after every timed look the dock takes (11 looks, 30 ms apart).
  let load: () => void = () => {};
  const Slow = lazy(() => new Promise<{ default: typeof StandIn }>((r) => { load = () => r({ default: StandIn }); }));
  unprovide?.();
  unprovide = provideAskDock(() => <Slow />);
  try {
    await open('/schedules', { width: 100, height: 30 });
    await altJ();
    await new Promise((r) => setTimeout(r, 1500));
    expect((await t!.settle())).not.toContain('DOCK-STAND-IN');
    load();
    await until((x) => x.includes('DOCK-STAND-IN'));
    await until(() => focusedName() === 'Ask field', 1500);
    expect(focusedName()).toBe('Ask field');
    await typeText('late');
    expect(typed).toBe('late');
  } finally {
    unprovide?.();
    unprovide = provideAskDock(() => <StandIn />);
  }
});

test('pane: a click on the focused page row leaves', async () => {
  await open('/schedules');
  const row = await onARow();
  // The row's own drawn text, read where it is drawn before the pane opens: what follows its focus bar, up to the
  // first gap between two cells.
  const [x0, y0] = focusedNodes()[0]!.box;
  const mark = ((await t!.settle()).split('\n')[y0] ?? '').slice(x0).replace(/^[▌\s]+/, '').split(/\s{2,}/)[0]!.slice(0, 16);
  expect(mark.length).toBeGreaterThan(3);
  await altJ();
  await until(() => focusedName() === 'Ask field');
  // Where the row is drawn with the pane open: the page is narrower beside it, so its head wraps onto other lines and
  // the row sits on another line than before. Found again on the screen by that text (the last line that holds it:
  // the page's summary above the list may name the same schedule).
  const f = await until((s) => s.includes(mark), 1500);
  const lines = f.split('\n');
  const y = lines.map((l) => l.includes(mark)).lastIndexOf(true);
  expect(y).toBeGreaterThanOrEqual(0);
  const x = lines[y]!.indexOf(mark);
  await t!.mockMouse.click(x, y);
  const same = (n: string | undefined) => !!n && n.slice(0, 24) === row.slice(0, 24);
  await until(() => same(focusedName()), 1500);
  expect(focusedName()?.slice(0, 24)).toBe(row.slice(0, 24));
  // The page has the keys: j moves its row, the pane's field gets nothing.
  await key('j');
  await until(() => !same(focusedName()), 1500);
  expect(same(focusedName())).toBe(false);
  expect(typed).toBe('');
});
