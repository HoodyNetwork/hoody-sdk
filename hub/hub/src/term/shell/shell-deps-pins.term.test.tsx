// Pins for the shell's hook dependencies (shell/TermShell.tsx): what must stay as it is when the dependency lists of
// KeyCapture's key listener and of the shell's action table are completed.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | KeyCapture sets its key listener once: a re-render of the capture neither adds a listener nor replaces it (a replaced listener would move behind the focused control's and lose the capture phase) | 'capture: one listener' |
// | 2 | The capture tells the keymap whether a text field has the focus, read at each key, also after re-renders | 'capture: typing read per key' |
// | 3 | The shell hands its actions to the keymap once: shell re-renders (the ? sheet, the palette) do not hand them again | 'actions: handed once' |
// | 4 | q leaves once: a second q after the end does not call the host's quit again | 'actions: quit once' |
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import { useState } from 'react';
import type { PageManifest } from '@kit/page';
import { queryClient } from '@core';
import { discoverPages, visiblePages } from '../../app/pages';
import { fixtureBoot } from '../app/boot';
import { beginTermSession, type TermSession } from '../env/session';
import type { TermBoot } from '../app/lifecycle';
import { createTermApp } from '../app/App';
import { drawTest, type TestTerm } from '../prim/testing';
import { FocusRoot, TextInput, setColourTier } from '../prim';
import { createShellKeymap } from './keymap';
import { KeyCapture } from './TermShell';

setDefaultTimeout(30_000);

let pages: readonly PageManifest[] = [];
let session: TermSession | null = null;
let boot: TermBoot | null = null;
let t: TestTerm | null = null;

beforeAll(async () => {
  setColourTier('truecolor');
  pages = visiblePages(discoverPages().pages, { preview: true, only: '*', fixtures: false });
  session = beginTermSession();
  boot = fixtureBoot({ pageIds: pages.map((p) => p.id), page: 'schedules', fx: null });
  await boot.start(session, () => {});
});
afterAll(async () => {
  await t?.dispose();
  await boot?.dispose('term-quit');
  session?.end();
});

async function until(ok: (f: string) => boolean, ms = 4000): Promise<string> {
  const end = performance.now() + ms;
  let f = await t!.settle();
  while (!ok(f) && performance.now() < end) { await new Promise((r) => setTimeout(r, 30)); f = await t!.settle(); }
  return f;
}
const key = async (name: string, m?: { ctrl?: boolean; shift?: boolean; meta?: boolean }) => {
  if (name === 'escape') { t!.mockInput.pressEscape(m); await new Promise((r) => setTimeout(r, 80)); return t!.settle(); }
  if (name === 'tab') t!.mockInput.pressTab(m);
  else t!.mockInput.pressKey(name, m);
  await new Promise((r) => setTimeout(r, 40));
  return t!.settle();
};
const keyListeners = (): unknown[] => [...(t!.renderer.keyInput as unknown as { listeners(e: string): unknown[] }).listeners('keypress')];

test('capture: one listener', async () => {
  await t?.dispose();
  const km = createShellKeymap();
  let tick: () => void = () => {};
  function Host() {
    const [, set] = useState(0);
    tick = () => set((n) => n + 1);
    return <KeyCapture keymap={km} />;
  }
  t = await drawTest(<Host />, { width: 40, height: 6 });
  await t.settle();
  const before = keyListeners();
  expect(before.length).toBeGreaterThan(0);
  for (let i = 0; i < 3; i++) { tick(); await t.settle(); }
  const after = keyListeners();
  expect(after.length).toBe(before.length);
  after.forEach((f, i) => expect(f === before[i]).toBe(true));
});

test('capture: typing read per key', async () => {
  await t?.dispose();
  const km = createShellKeymap();
  const seen: boolean[] = [];
  km.capture = (_k, typing) => { seen.push(typing); return false; };
  let tick: () => void = () => {};
  function Host() {
    const [, set] = useState(0);
    const [v, setV] = useState('');
    tick = () => set((n) => n + 1);
    return <><KeyCapture keymap={km} /><FocusRoot><TextInput value={v} onChange={setV} sem={{ role: 'textbox', name: 'Field' }} /></FocusRoot></>;
  }
  t = await drawTest(<Host />, { width: 40, height: 6 });
  await t.settle();
  // Nothing focused yet: not typing.
  await key('x');
  expect(seen.at(-1)).toBe(false);
  // Tab puts the focus in the field (the Tab itself is seen before the focus moves).
  await key('tab');
  for (let i = 0; i < 3; i++) { tick(); await t.settle(); }
  await key('y');
  expect(seen.at(-1)).toBe(true);
});

test('actions: handed once', async () => {
  await t?.dispose();
  const km = createShellKeymap();
  let sets = 0;
  const real = km.setActions.bind(km);
  km.setActions = (a) => { sets++; return real(a); };
  const app = createTermApp({ pages, queryClient, path: '/schedules', keymap: km, onQuit: () => {} });
  t = await drawTest(app.element, { width: 120, height: 40 });
  const page = await until((f) => f.includes('HOODY') && !f.includes('Loading…'));
  const base = sets;
  expect(base).toBeGreaterThan(0);
  // The ? sheet and the palette are shell state: each opening and closing re-renders the shell.
  const sheet = await key('?');
  expect(sheet).not.toBe(page);
  await key('escape');
  const palette = await key('k', { ctrl: true });
  expect(palette).not.toBe(page);
  await key('escape');
  await until((f) => f === page, 1500);
  expect(sets).toBe(base);
});

test('actions: quit once', async () => {
  await t?.dispose();
  let quits = 0;
  const app = createTermApp({ pages, queryClient, path: '/schedules', onQuit: () => { quits++; } });
  t = await drawTest(app.element, { width: 120, height: 40 });
  await until((f) => f.includes('HOODY') && !f.includes('Loading…'));
  await key('q');
  expect(quits).toBe(1);
  await key('q');
  expect(quits).toBe(1);
});
