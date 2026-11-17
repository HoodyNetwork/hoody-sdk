// Every live mount is wired (live-wiring.ts, plain version): a host mount through mountTerminalHub
// gets the send policy of live-wire.ts with the host's opened store.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A host mount's reads go out through the policy (the real adapter, attempt-bound) | 'a host mount is wired: reads leave' |
// | 2 | A plain api() change (no hold of core's, as on the web): with no writable store refused unsent, nothing on the wire; with one it leaves, and its 5xx is pending, never "not sent" | 'a plain api() change' |
// | 3 | The wiring the host's options give: the store's area and opening time, the client's deadline (or 60 s); the secret screen: open until the mount hands its screen over (core's boot, nothing drawn), then that screen's answer at each call (a throw reads as no) | 'wiring from the host options' |
// | 4 | A page change (core's guarded run) with a writable store leaves once, under its own record, and settles done | 'a page change leaves and settles' |
// | 5 | An unknown answer (5xx) stays pending: the next press is refused READ_BACK_FIRST, nothing is resent, and a new mount on the same store still holds it | 'an unknown answer stays pending, never resent' |
// | 6 | No store, or a read-only one (a second Hub): the page change is refused unsent | 'no writable store: refused unsent' |
// | 7 | Money never leaves (wallet, subscriptions, reserve, rent), store or not | 'money never leaves' |
// | 9 | The store's notice is one warn toast once core is up (host text cut to its bounds), gone when the mount ends; none without one | 'the store notice is a toast' |
// | 10 | A screen that cannot show a secret (TERM dumb): a key mint is refused unsent, nothing on the wire, one warn toast says why (repeats fold into it), gone when the mount ends | 'a screen that cannot show a secret: the key mint is refused unsent, one warn toast' |
// | 11 | The alternate screen of a terminal (a TTY, TERM set): the key mint leaves as before and no toast is shown | 'a screen that can show a secret: the key mint leaves as before, no toast' |
// | 8 | A page's change as pages send it (its page named, a computer chosen with its server): its record is kept, so it leaves (every page change was "Nothing was sent") | 'a page change with its page and computer leaves' |
import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { api, outcomeOf } from '../../core/api';
import { tokenMintRoute } from '../../core/boot-token';
import { defineMutation } from '../../core/query';
import { setTarget, type Target } from '../../core/ctx';
import { defineRoute } from '../../core/routes';
import { openHubStore, systemTryLock, type HubStore, type TryLock } from '../../../scripts/term/build/hub-store';
import { fakeApiClient, type FakeAnswers } from '../../../scripts/term/live-fake-api';
import { currentTermSession } from '../env/session';
import { mountTerminalHub } from '../entry';
import type { HubTermOptions, Receipt } from '../host-types';
import { liveWiringOf, NOTICE_TOAST_ID, REQUEST_DEADLINE_MS, SECRET_SCREEN_TOAST_ID } from './live-wiring';
import shellStrings from '../shell/strings.en.json';
import { toastQueue } from '@kit/states/Toast.store';
import { UNSTYLED_FOR_TESTS } from './styles';

setDefaultTimeout(120_000);

const ME = { data: { id: '64f0ada00000000000000001', username: 'ada', email: 'ada@example.com' } };
const removeRoute = defineRoute({ method: 'DELETE', path: '/auth/tokens/:id', scope: 'base', baseOnly: true });
const KEY = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const removeM = defineMutation<{ id: string }>(removeRoute, { input: (v) => ({ params: { id: v.id } }) });
const pageRemoveM = defineMutation<{ id: string }>(removeRoute, { input: (v) => ({ params: { id: v.id } }), page: 'keys', lock: 'keys.key_edit', lockKey: (v) => ({ id: v.id }) });
const topUpRoute = defineRoute({ method: 'POST', path: '/wallet/topup', scope: 'base', baseOnly: true, body: ['amount'] });
const topUpM = defineMutation<{ amount: number }>(topUpRoute, { input: (v) => ({ body: { amount: v.amount } }) });

let home = '';
let flock: TryLock;
const stores: HubStore[] = [];
beforeAll(async () => { flock = await systemTryLock(); home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-wiring-test-')); });
afterEach(() => { currentTermSession()?.end(); for (const s of stores.splice(0)) { try { s.close(); } catch { /* closed */ } } });
afterAll(() => { fs.rmSync(home, { recursive: true, force: true }); });

function openStore(name = 'store-' + String(stores.length)): HubStore {
  const dir = path.join(home, name);
  const s = openHubStore(dir, { home, tryLock: flock });
  stores.push(s);
  return s;
}

async function mounted(store: HubTermOptions['store'], answers?: FakeAnswers) {
  const f = fakeApiClient({ table: { 'GET /users/auth/me': ME, 'GET /realms': { data: { realm_ids: [] } } }, ...(answers ? { answers } : {}) });
  let out = '';
  const done: Promise<Receipt> = mountTerminalHub({
    styles: UNSTYLED_FOR_TESTS, client: f.client, route: { page: 'home', path: '/' }, onSetDefault: async () => {},
    context: { profile: 'test', realmId: 'all' }, ...(store ? { store } : {}),
    io: { cells: { write: (s) => { out += s; } }, input: { onData: () => () => {} }, size: () => ({ cols: 100, rows: 30 }), colourTier: 'mono' },
  });
  for (let i = 0; i < 400 && !out.includes('HOODY'); i++) await new Promise((r) => setTimeout(r, 25));
  expect(out).toContain('HOODY');
  return { f, done, out: () => out, close: async () => { f.end(); return done; } };
}

const deletes = (m: { f: { hits: Array<{ method: string; path: string }> } }): number => m.f.hits.filter((h) => h.method === 'DELETE' && h.path === '/auth/tokens/' + KEY).length;

test('a host mount is wired: reads leave', async () => {
  const m = await mounted({ area: openStore(), openedAt: Date.now() });
  const me = m.f.hits.find((h) => h.method === 'GET' && h.path.startsWith('/users/auth/me'));
  expect(me?.url.startsWith('https://api.example.invalid/api/v1/users/auth/me')).toBe(true);
  expect(me?.auth).toBe('Bearer fake-bearer');
  await m.close();
});

test('a plain api() change', async () => {
  const five = (method: string) => (method === 'DELETE' ? { status: 502, body: { statusCode: 502, error: 'BAD_GATEWAY', message: 'no' } } : undefined);
  for (const store of [{ area: null, openedAt: Date.now() }, undefined]) {
    const m = await mounted(store, five);
    const before = m.f.hits.length;
    const got = await api(removeRoute, { params: { id: KEY } }).then(() => 'SENT', (e: unknown) => e as { code?: string; notSent?: boolean });
    expect(got).toMatchObject({ code: 'NOT_DURABLE', notSent: true });
    expect(m.f.hits.slice(before).filter((h) => h.method !== 'GET')).toEqual([]);
    await m.close();
  }
  const m = await mounted({ area: openStore(), openedAt: Date.now() }, five);
  const e = await api(removeRoute, { params: { id: KEY } }).then(() => null, (x: unknown) => x);
  expect(outcomeOf(e, true)).toBe('pending');
  expect((e as { notSent?: unknown }).notSent).not.toBe(true);
  expect(deletes(m)).toBe(1);
  await m.close();
});

test('wiring from the host options', () => {
  const area = openStore();
  const w = liveWiringOf({ store: { area, openedAt: 1234 }, requestDeadlineMs: 5000 }, () => 99);
  expect(w.area).toBe(area);
  expect(w.storeOpenedAt).toBe(1234);
  expect(w.requestDeadlineMs).toBe(5000);
  // Before the mount hands its screen over (core's boot: nothing is drawn yet) the boot's reads go as before.
  expect(w.secretReveal()).toBe(true);
  // From then on that screen is asked at each call; an asking that throws reads as no.
  let reveal = false;
  w.screen!(() => ({ reveal, copy: false }));
  expect(w.secretReveal()).toBe(false);
  reveal = true;
  expect(w.secretReveal()).toBe(true);
  w.screen!(() => { throw new Error('gone'); });
  expect(w.secretReveal()).toBe(false);
  expect(w.lockState).toBeUndefined();
  const none = liveWiringOf({}, () => 99);
  expect(none.area).toBeNull();
  expect(none.storeOpenedAt).toBe(99);
  expect(none.requestDeadlineMs).toBe(REQUEST_DEADLINE_MS);
  for (const bad of [0, -1, Number.NaN]) expect(liveWiringOf({ requestDeadlineMs: bad }).requestDeadlineMs).toBe(REQUEST_DEADLINE_MS);
});


test('a page change leaves and settles', async () => {
  const m = await mounted({ area: openStore(), openedAt: Date.now() }, (method, p) => (method === 'DELETE' && p === '/auth/tokens/' + KEY ? { body: { statusCode: 200, message: 'Deleted' } } : undefined));
  const r = await removeM.run({ id: KEY });
  expect(r.outcome).toBe('done');
  expect(deletes(m)).toBe(1);
  // Settled: the same change again is a new change and leaves again.
  expect((await removeM.run({ id: KEY })).outcome).toBe('done');
  expect(deletes(m)).toBe(2);
  await m.close();
});

test('an unknown answer stays pending, never resent', async () => {
  const five = (method: string, p: string) => (method === 'DELETE' && p === '/auth/tokens/' + KEY ? { status: 503, body: { statusCode: 503, error: 'SERVICE_UNAVAILABLE', message: 'no' } } : undefined);
  const s1 = openStore('pending');
  const m = await mounted({ area: s1, openedAt: Date.now() }, five);
  const r = await removeM.run({ id: KEY });
  expect(r.outcome).toBe('pending');
  expect(deletes(m)).toBe(1);
  const again = await removeM.run({ id: KEY });
  expect(again.outcome).toBe('not_sent');
  expect(again.error?.code).toBe('READ_BACK_FIRST');
  expect(deletes(m)).toBe(1);
  await m.close();
  s1.close();
  stores.splice(stores.indexOf(s1), 1);
  // The next `hoody hub` on the same store: the change is still held; a press sends nothing.
  const s2 = openStore('pending');
  const n = await mounted({ area: s2, openedAt: Date.now() }, five);
  const third = await removeM.run({ id: KEY });
  expect(third.outcome).toBe('not_sent');
  expect(third.error?.code).toBe('READ_BACK_FIRST');
  expect(deletes(n)).toBe(0);
  await n.close();
});

test('no writable store: refused unsent', async () => {
  const first = openStore('shared');
  const second = openStore('shared');
  expect(second.readOnly).toBe('busy');
  for (const area of [null, second]) {
    const m = await mounted({ area, openedAt: Date.now() }, () => ({ body: { statusCode: 200 } }));
    const r = await removeM.run({ id: KEY });
    expect(r.outcome).toBe('not_sent');
    expect(deletes(m)).toBe(0);
    await m.close();
  }
  void first;
});

test('money never leaves', async () => {
  for (const store of [{ area: openStore(), openedAt: Date.now() }, undefined]) {
    const m = await mounted(store, () => ({ body: { statusCode: 200 } }));
    const r = await topUpM.run({ amount: 5 });
    expect(r.outcome).toBe('not_sent');
    expect(m.f.hits.filter((h) => h.path.startsWith('/wallet'))).toEqual([]);
    await m.close();
  }
});

test('a page change with its page and computer leaves', async () => {
  const m = await mounted({ area: openStore(), openedAt: Date.now() }, (method, p) => (method === 'DELETE' && p === '/auth/tokens/' + KEY ? { body: { statusCode: 200 } } : undefined));
  setTarget({ project: { id: '6a0000000000000000000001' }, container: { id: 'c0a7150000000000000000a1', server_name: 'node-teal' } } as unknown as Target);
  try {
    const r = await pageRemoveM.run({ id: KEY });
    expect(r.error?.code ?? 'none').toBe('none');
    expect(r.outcome).toBe('done');
    expect(deletes(m)).toBe(1);
  } finally { setTarget(null); }
  await m.close();
});

test('the store notice is a toast', async () => {
  const shown = () => toastQueue().visibleToasts.map((t) => t.content);
  const title = 'Your local store was reset and this is long';
  const m = await mounted({ area: openStore(), openedAt: Date.now(), notice: { title, body: 'b'.repeat(700) } });
  for (let i = 0; i < 200 && shown().length === 0; i++) await new Promise((r) => setTimeout(r, 25));
  const t = shown();
  expect(t.length).toBe(1);
  expect(t[0]).toMatchObject({ id: NOTICE_TOAST_ID, tone: 'warn' });
  expect(Array.from(t[0]!.title).length).toBe(40);
  expect(Array.from(t[0]!.body ?? '').length).toBe(600);
  for (let i = 0; i < 200 && !m.out().includes('Your local store'); i++) await new Promise((r) => setTimeout(r, 25));
  expect(m.out()).toContain('Your local store');
  await m.close();
  expect(shown()).toEqual([]);
  for (const notice of [null, undefined, { title: '', body: 'x' }]) {
    const n = await mounted({ area: openStore(), openedAt: Date.now(), notice });
    await new Promise((r) => setTimeout(r, 200));
    expect(shown()).toEqual([]);
    await n.close();
  }
});

// The key mint as the Keys page sends it (core's one mint route), on a mount whose screen is the real one: host-io's
// output is a TTY and the renderer is on the alternate screen, so TERM decides (secret-screen.ts secretRevealOf, read
// at each call: the mount starts with a TERM the engine draws for, then the test sets the TERM asked about).
const TERM = process.env.TERM;
const restoreTerm = (): void => { if (TERM === undefined) delete process.env.TERM; else process.env.TERM = TERM; };
const screenToasts = () => toastQueue().visibleToasts.map((t) => t.content).filter((c) => c.id === SECRET_SCREEN_TOAST_ID);
const mint = () => api(tokenMintRoute, { body: { alias: 'k1' } }).then(() => ({ answered: true }), (e: unknown) => e as { kind?: string; notSent?: boolean });
const mintPosts = (m: { f: { hits: Array<{ method: string; path: string }> } }): number => m.f.hits.filter((h) => h.method === 'POST' && h.path === '/auth/tokens').length;

test('a screen that cannot show a secret: the key mint is refused unsent, one warn toast', async () => {
  process.env.TERM = 'xterm-256color';
  try {
    const m = await mounted({ area: openStore(), openedAt: Date.now() });
    process.env.TERM = 'dumb';
    // Twice: each is refused before anything leaves, and the second press folds into the same toast.
    for (let i = 0; i < 2; i++) expect(await mint()).toMatchObject({ kind: 'not_sent', notSent: true });
    expect(mintPosts(m)).toBe(0);
    const t = screenToasts();
    expect(t.length).toBe(1);
    expect(t[0]).toMatchObject({ tone: 'warn', title: shellStrings['live.secretScreen.title'] });
    expect(t[0]!.body).toContain(shellStrings['live.secretScreen.body']);
    await m.close();
    expect(screenToasts()).toEqual([]);
  } finally { restoreTerm(); }
});

test('a screen that can show a secret: the key mint leaves as before, no toast', async () => {
  process.env.TERM = 'xterm-256color';
  try {
    const m = await mounted({ area: openStore(), openedAt: Date.now() });
    // The fake answers it 404: what counts here is that it left, once, as it does today.
    expect(await mint()).not.toMatchObject({ notSent: true });
    expect(mintPosts(m)).toBe(1);
    expect(screenToasts()).toEqual([]);
    await m.close();
  } finally { restoreTerm(); }
});
