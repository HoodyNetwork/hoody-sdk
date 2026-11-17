// Secret.term under the secret-safe screen rules (term/app/secret-screen.ts, secret-screen-ctx.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | No provider: Show stays masked and Copy writes nothing, each told on the note line (SecretField and SecretInput) | 'no provider: nothing shown, nothing copied' |
// | 2 | Show is asked at every press, never at the mount: a refusal after an allowed Show stays masked | 'Show is asked at every press' |
// | 3 | Copy needs the terminal's OSC 52 answer: refused, nothing written | 'Copy is refused without the OSC 52 answer' |
// | 4 | Copy writes only the value as it is: over 4 KiB or with a character a copy would change, nothing written; 4 KiB exactly is copied | 'Copy writes only an unchanged value of at most 4 KiB' |
// | 5 | A load field reads nothing when refused (no onRead, no onReadCopy), and a value arriving after the screen stopped allowing it stays masked | 'load: nothing read when refused; an arrival is asked too' |
// | 6 | A shown value hides after the idle time with no key press; a key press restarts the clock (SecretField and SecretInput) | 'idle: hidden again with no key press', 'idle: a key press restarts the clock', 'idle: SecretInput masks again' |
// | 7 | The wipe (useWipeOn) on a route change, a realm switch, an account change and sign-out | 'wipe: route change', 'wipe: realm switch, account change, sign-out' |
// | 8 | The passcode lock engaging drops a SecretField's value and empties a SecretInput (the lock is drawn over a page that stays mounted) | 'wipe: the passcode lock engaging' |
// | 9 | A value Copy cannot write unchanged gets no Copy word and no `c` in the hint | 'no Copy offered for a value Copy would change' |
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { copiesOf, drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { SecretScreenCtx, __secretIdleSeams, type SecretScreen } from '../../term/app/secret-screen-ctx';
import { capture, configureAppLock, holdSecret, lockTab, type HeldSecret } from '@core';
import { resetAppLock } from '../../core/applock';
import { bump, resetCore, startLoggingOut } from '../../core/ctx';
import { installShared } from '../../core/session';
import { SecretField, SecretInput } from './Secret';

const W = { width: 100, height: 16 };
const KEY = 'hk_3f9a_SUPERSECRETVALUE42';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => __secretIdleSeams.reset());
// A signed-out page's shared.js (nothing stored): core captures contexts and holds values in them, so a context end
// reaches the field as it does in the Hub.
beforeAll(() => {
  const none = () => null;
  const names = ['storedSession', 'holdsIdentity', 'holdsSession', 'sessionTokenUid', 'sessionTokenSid', 'apiCall', 'isFramedPage',
    'framedSensitiveRoute', 'framedRefusedError', 'supersededAuthError', 'isSupersededAuthError', 'realmApiDomain', 'clearAuthTokens',
    'purgeOutgoingSession', 'endOutgoingSession', 'onBeforeAuthPurge', 'authStorageEntry', 'authSessionSuperseded', 'adoptReissuedSession',
    'readAccessToken'];
  installShared(Object.fromEntries(names.map((n) => [n, none])) as unknown as Parameters<typeof installShared>[0]);
});
afterAll(() => installShared(null));

/** A provider whose answer the test changes; counts the asks. */
function screen(start: SecretScreen) {
  const s = { answer: start, asks: 0 };
  const ask = () => { s.asks++; return s.answer; };
  const wrap = (n: ReactNode) => <SecretScreenCtx.Provider value={ask}>{n}</SecretScreenCtx.Provider>;
  return { s, wrap };
}

test('no provider: nothing shown, nothing copied', async () => {
  const t = await drawTest(<FocusRoot><SecretField label="Key" value={KEY} /></FocusRoot>, W, { bare: true });
  const copied = copiesOf(t.renderer);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  let f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  expect(f).toContain('[Show]');
  expect(f).toContain('Not shown: this screen could keep it');
  await t.mockInput.typeText('c');
  f = await t.settle();
  expect(copied).toEqual([]);
  expect(f).toContain('Not copied: this terminal has not said it takes copies.');
  t.renderer.destroy();

  function P() { const [v, setV] = useState('tok3n'); return <FocusRoot><SecretInput label="Token" value={v} onChange={setV} autoFocus /></FocusRoot>; }
  const u = await drawTest(<P />, W, { bare: true });
  u.mockInput.pressTab();
  u.mockInput.pressEnter();
  f = await u.settle();
  expect(f).not.toContain('tok3n');
  expect(f).toContain('Not shown: this screen could keep it');
  u.renderer.destroy();
});

test('Show is asked at every press', async () => {
  const { s, wrap } = screen({ reveal: true, copy: true });
  const t = await drawTest(wrap(<FocusRoot><SecretField label="Key" value={KEY} /></FocusRoot>), W);
  expect(s.asks).toBe(0);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain(KEY);
  expect(s.asks).toBe(1);
  await t.mockInput.typeText('s');
  expect(await t.settle()).not.toContain('SUPERSECRET');
  s.answer = { reveal: false, copy: false };
  await t.mockInput.typeText('s');
  const f = await t.settle();
  expect(s.asks).toBe(2);
  expect(f).not.toContain('SUPERSECRET');
  expect(f).toContain('Not shown: this screen could keep it');
  t.renderer.destroy();
});

test('Copy is refused without the OSC 52 answer', async () => {
  const { s, wrap } = screen({ reveal: true, copy: false });
  const t = await drawTest(wrap(<FocusRoot><SecretField label="Key" value={KEY} /></FocusRoot>), W);
  const copied = copiesOf(t.renderer);
  t.mockInput.pressTab();
  await t.mockInput.typeText('c');
  let f = await t.settle();
  expect(copied).toEqual([]);
  expect(f).toContain('Not copied: this terminal has not said it takes copies.');
  s.answer = { reveal: true, copy: true };
  await t.mockInput.typeText('c');
  f = await t.settle();
  expect(copied).toEqual([KEY]);
  expect(f).not.toContain('Not copied');
  t.renderer.destroy();
});

test('Copy writes only an unchanged value of at most 4 KiB', async () => {
  for (const [value, ok] of [['a'.repeat(4097), false], ['é'.repeat(2049), false], ['abc\u0007def', false], ['a'.repeat(4096), true]] as const) {
    const t = await drawTest(<FocusRoot><SecretField label="Key" value={value} /></FocusRoot>, { width: 100, height: 60 });
    const copied = copiesOf(t.renderer);
    t.mockInput.pressTab();
    await t.mockInput.typeText('c');
    const f = await t.settle();
    expect(copied).toEqual(ok ? [value] : []);
    expect(f.includes('Not copied: this value is too long to copy here, or a copy would change it.')).toBe(!ok);
    t.renderer.destroy();
  }
});

test('load: nothing read when refused; an arrival is asked too', async () => {
  const { s, wrap } = screen({ reveal: false, copy: false });
  const seen: string[] = [];
  let arrive: () => void = () => {};
  function P() {
    const [h, setH] = useState<HeldSecret | null>(null);
    arrive = () => setH(holdSecret(KEY, capture()));
    return <FocusRoot><SecretField label="Entry" held={h} once={false} onRead={() => { seen.push('read'); }} onReadCopy={async () => { seen.push('copy'); return { wrote: true }; }} /></FocusRoot>;
  }
  const t = await drawTest(wrap(<P />), W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  let f = await t.settle();
  expect(f).toContain('Not shown: this screen could keep it');
  await t.mockInput.typeText('c');
  f = await t.settle();
  expect(f).toContain('Not copied: this terminal has not said it takes copies.');
  expect(seen).toEqual([]);
  // Allowed at the press; the screen stops allowing it before the value arrives.
  s.answer = { reveal: true, copy: true };
  await t.mockInput.typeText('s');
  await t.settle();
  expect(seen).toEqual(['read']);
  s.answer = { reveal: false, copy: false };
  arrive();
  f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  expect(f).toContain('Not shown: this screen could keep it');
  t.renderer.destroy();
});

test('idle: hidden again with no key press', async () => {
  __secretIdleSeams.setMs(120);
  const t = await drawTest(<FocusRoot><SecretField label="Key" value={KEY} /></FocusRoot>, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain(KEY);
  await wait(300);
  const f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  expect(f).toContain('[Show]');
  t.renderer.destroy();
});

test('idle: a key press restarts the clock', async () => {
  __secretIdleSeams.setMs(250);
  const t = await drawTest(<FocusRoot><SecretField label="Key" value={KEY} /></FocusRoot>, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain(KEY);
  // Six presses 100 ms apart: 600 ms shown, never 250 ms without a key.
  for (let i = 0; i < 6; i++) { await wait(100); t.mockInput.pressArrow('down'); }
  expect(await t.settle()).toContain(KEY);
  await wait(500);
  expect(await t.settle()).not.toContain('SUPERSECRET');
  t.renderer.destroy();
});

test('idle: SecretInput masks again', async () => {
  __secretIdleSeams.setMs(120);
  function P() { const [v, setV] = useState('tok3n'); return <FocusRoot><SecretInput label="Token" value={v} onChange={setV} autoFocus /></FocusRoot>; }
  const t = await drawTest(<P />, W);
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  expect(await t.settle()).toContain('tok3n');
  await wait(300);
  expect(await t.settle()).not.toContain('tok3n');
  t.renderer.destroy();
});

/** Shows the field's value; returns the drawn test. */
async function shown(node: ReactNode) {
  const t = await drawTest(node, W);
  t.mockInput.pressTab();
  await t.mockInput.typeText('s');
  expect(await t.settle()).toContain(KEY);
  return t;
}

test('wipe: route change', async () => {
  let go: (to: string) => void = () => {};
  function Routed({ children }: { children: ReactNode }) {
    const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/a'] }), origin: 'http://localhost' } as never));
    go = (to) => { void (router as { navigate(o: { to: string }): Promise<void> }).navigate({ to }); };
    return <RouterProvider router={router} />;
  }
  const t = await shown(<Routed><FocusRoot><SecretField label="Key" value={KEY} /></FocusRoot></Routed>);
  go('/b');
  await wait(20);
  const f = await t.settle();
  expect(f).not.toContain('SUPERSECRET');
  expect(f).toContain('It is no longer shown here.');
  t.renderer.destroy();
});

test('wipe: realm switch, account change, sign-out', async () => {
  for (const end of [() => bump('switch'), () => bump('account'), () => startLoggingOut()]) {
    const t = await shown(<FocusRoot><SecretField label="Key" value={KEY} /></FocusRoot>);
    end();
    await wait(20);
    const f = await t.settle();
    expect(f).not.toContain('SUPERSECRET');
    expect(f).toContain('It is no longer shown here.');
    t.renderer.destroy();
    resetCore();
  }
});

test('wipe: the passcode lock engaging', async () => {
  const got: string[] = [];
  function P() {
    const [v, setV] = useState('tok3n');
    return <FocusRoot><SecretField label="Key" value={KEY} /><SecretInput label="Token" value={v} onChange={(x) => { got.push(x); setV(x); }} /></FocusRoot>;
  }
  try {
    // An account with an unreadable lock record locks (fail closed): the lock engages without a passcode check.
    configureAppLock({ uid: () => 'u1', storage: () => null });
    const t = await shown(<P />);
    expect(lockTab()).toBe(true);
    await wait(20);
    const f = await t.settle();
    expect(f).not.toContain('SUPERSECRET');
    expect(f).toContain('It is no longer shown here.');
    expect(got.at(-1)).toBe('');
    t.renderer.destroy();
  } finally {
    resetAppLock();
  }
});

test('no Copy offered for a value Copy would change', async () => {
  const t = await drawTest(<FocusRoot><SecretField label="Key" value={'abc\u0007def'} /><SecretField label="Other" value={KEY} /></FocusRoot>, W);
  t.mockInput.pressTab();
  const f = await t.settle();
  const [first, second] = f.split('Other');
  expect(first).toContain('[Show]');
  expect(first).not.toContain('[Copy]');
  expect(first).toContain('s show');
  expect(first).not.toContain('c copy');
  expect(second).toContain('[Copy]');
  t.renderer.destroy();
});
