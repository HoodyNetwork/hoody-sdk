// Toasts in the terminal (Toast.term.tsx on the shared Toast.store.ts).
//
// | # | Web behaviour (Toast.tsx, React Aria toast region) | Test |
// |---|---|---|
// | 1 | showToast returns a key; the toast shows its tone mark, title and body | 'shows a toast' |
// | 2 | ok/info/warn close after the timeout, counted while shown; paused while focus is in the region | 'times out; paused while entered' |
// | 3 | error and unknown stay whatever the timeout | 'sticky tones stay' |
// | 4 | the same id replaces the earlier one and counts ("This happened 2 times.") | 'an id repeats' |
// | 5 | at most 3 show, newest nearest the corner (bottom) | 'at most three' |
// | 6 | an action returning nothing closes; unknown closes only on true; false shows "Couldn't check"; a promise is busy | 'action rules' |
// | 7 | never takes the focus: the page's focused control keeps keys while toasts show | 'never steals focus' |
// | 8 | the keyboard reaches the buttons (F6 enters, Tab moves, Enter presses, Esc leaves, focus returns) | 'F6 enters the stack' |
// | 9 | closeToast(key) closes it early | 'shows a toast' |
// | 10 | showErrorToast: a pending result is the unknown toast with only Check again | 'showErrorToast pending' |
// | 11 | the timer is paused while the pointer is over the region, and runs on with what was left | 'the pointer over the stack' |
// | 12 | while toasts show, Shift+F6 still goes to the previous area (the shell's regions); F6 enters the stack | 'Shift+F6 goes back' |
//
// No real sleeps: a toast's timeout (HELD ms, longer than any timer the renderer or a test step sets) is held by this
// file's own timer seam and fired by releaseHeldTimers(); everything else waits on settle() (still frames, which also
// lets the layer's 0 ms focus step run).
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRegion, FocusRoot, Pressable, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { Toaster, closeToast, showErrorToast, showToast } from './Toast';
import { toastQueue } from './Toast.store';
/** A toast timeout: timers over half of it are held (a resumed toast's remainder too; none fires by itself). */
const HELD = 60_000;
const held = new Map<object, () => void>();
const realTimers = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
const heldTimerCount = (): number => held.size;
/** Fires every held timer now (the time a toast had left has run out); returns how many. */
function releaseHeldTimers(): number { const all = [...held.values()]; held.clear(); for (const f of all) f(); return all.length; }
beforeEach(() => {
  globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => {
    if (typeof fn !== 'function' || (Number(ms) || 0) < HELD / 2) return realTimers.setTimeout(fn as never, ms, ...a);
    const token = { ref: () => token, unref: () => token, hasRef: () => false, refresh: () => token };
    held.set(token, () => fn(...a));
    return token as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: unknown) => { if (!(typeof id === 'object' && id !== null && held.delete(id))) realTimers.clearTimeout(id as never); }) as typeof clearTimeout;
});
afterEach(() => { (toastQueue() as unknown as { clear(): void }).clear(); held.clear(); Object.assign(globalThis, realTimers); });

/** F6 as a terminal sends it (KeyCodes.F6 of the engine's mock keys). */
const F6 = '\x1b[17~';

function Page({ log }: { log: string[] }) {
  const [n, setN] = useState(0);
  return (
    <>
      <Pressable autoFocus onPress={() => { log.push('page'); setN(n + 1); }}>{({ focused }) => <Text inverse={focused}>[Page button {n}]</Text>}</Pressable>
      <Toaster />
    </>
  );
}
const draw = (log: string[] = [], w = 80, h = 24) => drawTest(<FocusRoot><OverlayHost><Page log={log} /></OverlayHost></FocusRoot>, { width: w, height: h });

test('shows a toast with its mark, title and body; closeToast closes it', async () => {
  const t = await draw();
  const key = showToast({ title: 'nightly-backup is deleted.', body: 'Its history is kept.' });
  expect(typeof key).toBe('string');
  let f = await t.settle();
  expect(f).toMatch(/✓ nightly-backup is deleted\./);
  expect(f).toContain('Its history is kept.');
  expect(f).toContain('F6');
  closeToast(key);
  f = await t.settle();
  expect(f).not.toContain('nightly-backup');
  t.renderer.destroy();
});

test('times out; paused while entered', async () => {
  const t = await draw();
  showToast({ title: 'Saved the schedule.', tone: 'info' }, HELD);
  expect(await t.settle()).toContain('Saved the schedule.');
  expect(heldTimerCount()).toBe(1);
  // Entered: the timer is paused (cleared), so time passing closes nothing.
  t.mockInput.pressKey(F6);
  await t.settle();
  expect(heldTimerCount()).toBe(0);
  expect(releaseHeldTimers()).toBe(0);
  expect(await t.settle()).toContain('Saved the schedule.');
  // Left: it runs again with what was left, and closes when that runs out.
  t.mockInput.pressKey(F6);
  await t.settle();
  expect(heldTimerCount()).toBe(1);
  expect(releaseHeldTimers()).toBe(1);
  expect(await t.settle()).not.toContain('Saved the schedule.');
  t.renderer.destroy();
});

test('sticky tones stay whatever the timeout', async () => {
  const t = await draw();
  showToast({ title: "Couldn't delete the key", tone: 'error' }, HELD);
  showToast({ title: 'Deleting atlas: unknown', tone: 'unknown' }, HELD);
  await t.settle();
  // No timer at all for a sticky tone; firing whatever is held changes nothing.
  expect(heldTimerCount()).toBe(0);
  releaseHeldTimers();
  const f = await t.settle();
  expect(f).toMatch(/✗ Couldn't delete the key/);
  expect(f).toMatch(/◷ Deleting atlas: unknown/);
  t.renderer.destroy();
});

test('an id repeats in place', async () => {
  const t = await draw();
  showToast({ title: "Couldn't reach atlas", tone: 'error', id: 'reach' });
  showToast({ title: "Couldn't reach atlas", tone: 'error', id: 'reach' });
  const f = await t.settle();
  expect(f.split("Couldn't reach atlas").length - 1).toBe(1);
  expect(f).toContain('This happened 2 times.');
  t.renderer.destroy();
});

test('at most three show, newest at the bottom', async () => {
  const t = await draw(undefined, 80, 40);
  for (const n of ['one', 'two', 'three', 'four']) showToast({ title: `Toast ${n}.`, tone: 'error' });
  const f = await t.settle();
  expect(f).not.toContain('Toast one.');
  expect(f.indexOf('Toast two.')).toBeLessThan(f.indexOf('Toast three.'));
  expect(f.indexOf('Toast three.')).toBeLessThan(f.indexOf('Toast four.'));
  t.renderer.destroy();
});

test('never steals focus: the page keeps its keys', async () => {
  const log: string[] = [];
  const t = await draw(log);
  showToast({ title: 'Undo me.', action: { label: 'Undo', onAction: () => log.push('undo') } });
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['page']);
  t.renderer.destroy();
});

test('F6 enters the stack on its first control: Tab to the action, Enter presses it, the page gets focus back', async () => {
  const log: string[] = [];
  const t = await draw(log);
  showToast({ title: 'Removed atlas from the list.', action: { label: 'Undo', onAction: () => { log.push('undo'); } } });
  await t.settle();
  t.mockInput.pressKey(F6);
  let f = await t.settle();
  expect(f).toContain('Esc / F6 leave');
  // entering focuses × (first in reading order; settle let that step run); Tab moves to the action
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  f = await t.settle();
  expect(log).toEqual(['undo']);
  expect(f).not.toContain('Removed atlas');
  // the stack is gone: keys are the page's again
  t.mockInput.pressEnter();
  await t.settle();
  expect(log).toEqual(['undo', 'page']);
  t.renderer.destroy();
});

/** Two areas, as the shell's (sidebar, then page; F6 / Shift+F6 move between them), and the stack. */
function Areas() {
  return (
    <>
      <FocusRegion order={0}><Pressable onPress={() => {}}>{({ focused }) => <Text>{focused ? '[Side*]' : '[Side]'}</Text>}</Pressable></FocusRegion>
      <FocusRegion order={1}><Pressable autoFocus onPress={() => {}}>{({ focused }) => <Text>{focused ? '[Main*]' : '[Main]'}</Text>}</Pressable></FocusRegion>
      <Toaster />
    </>
  );
}

test('Shift+F6 goes back to the previous area while a toast shows; F6 still enters the stack', async () => {
  const t = await drawTest(<FocusRoot><OverlayHost><Areas /></OverlayHost></FocusRoot>, { width: 80, height: 24 });
  showToast({ title: "Couldn't reach atlas", tone: 'error' });
  let f = await t.settle();
  expect(f).toContain('[Main*]');
  t.mockInput.pressKey('F6', { shift: true });
  f = await t.settle();
  expect(f).toContain('[Side*]');
  expect(f).not.toContain('Esc / F6 leave');
  // The way in is still F6.
  t.mockInput.pressKey(F6);
  f = await t.settle();
  expect(f).toContain('Esc / F6 leave');
  t.renderer.destroy();
});

test('action rules: unknown closes only on true; false says it could not check; a promise is busy', async () => {
  const t = await draw();
  let answer: unknown = false;
  showToast({ title: 'Deleting atlas may have gone through', tone: 'unknown', action: { label: 'Check again', onAction: () => answer } });
  await t.settle();
  const press = async () => {
    t.mockInput.pressKey(F6);
    await t.settle(); // entering focuses × first
    t.mockInput.pressTab();
    t.mockInput.pressEnter();
    await t.settle();
    t.mockInput.pressKey(F6);
    return t.settle();
  };
  let f = await press();
  expect(f).toContain("Couldn't check");
  answer = undefined;
  f = await press();
  expect(f).toContain('Deleting atlas');
  let settle!: (v: unknown) => void;
  answer = new Promise((r) => (settle = r));
  f = await press();
  expect(f).toContain('… Check again');
  settle(true);
  f = await t.settle();
  expect(f).not.toContain('Deleting atlas');
  t.renderer.destroy();
});

test('showErrorToast: a pending result is the unknown toast with only Check again', async () => {
  const t = await draw(undefined, 100, 30);
  showErrorToast("Couldn't delete the key", { outcome: 'pending', kind: 'network' }, { retry: { label: 'Try again', onAction: () => undefined }, check: { label: 'Check again', onAction: () => undefined } });
  const f = await t.settle();
  expect(f).toContain('◷');
  expect(f).not.toContain("Couldn't delete the key");
  expect(f).toContain('Check again');
  expect(f).not.toContain('Try again');
  t.renderer.destroy();
});

// The header's "paused while the pointer is over the stack": no test moved the pointer. Catches the stack's mouse
// handlers (Toast.term.tsx line 199) and the hold rule (line 162, `entered || hover`): with either broken, a toast the
// person is reading under the pointer closes when its time runs out.
test('the pointer over the stack pauses the timer; moving off runs it again with what was left', async () => {
  const t = await draw();
  showToast({ title: 'Saved the schedule.', tone: 'info' }, HELD);
  const f = await t.settle();
  expect(heldTimerCount()).toBe(1);
  const rows = f.split('\n');
  const y = rows.findIndex((r) => r.includes('Saved the schedule.'));
  expect(y).toBeGreaterThan(0);
  await t.mockMouse.moveTo(rows[y]!.indexOf('Saved'), y);
  await t.settle();
  expect(heldTimerCount()).toBe(0);
  expect(releaseHeldTimers()).toBe(0);
  expect(await t.settle()).toContain('Saved the schedule.');
  await t.mockMouse.moveTo(40, 2); // off the stack, over nothing on the page
  await t.settle();
  expect(heldTimerCount()).toBe(1);
  expect(releaseHeldTimers()).toBe(1);
  expect(await t.settle()).not.toContain('Saved the schedule.');
  t.renderer.destroy();
});
