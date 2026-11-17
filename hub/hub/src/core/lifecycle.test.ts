// lifecycle.ts: boot, another tab's session change, sign-out, suspension.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { api, onPending, type PendingNotice } from './api';
import { alive, bump, capture, gen, identity, loggingOut, page, setIdentity } from './ctx';
import { attemptHoldRefsIn, heldAttempts, holdAttempt, resetAttempts } from './attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, SENDING_STALE_MS, newChangeStoreTabForTests, readChangesState, setChangeStoreAdapter } from './change-store';
import { bootLive, configureLifecycle, initLive, logout, noteShownAlias, onLifecycle, signOutForgetting, signOutHolds, superseded, type LifecycleEvent } from './lifecycle';
import { onTeardown } from './realm';
import { defineRoute } from './routes';
import { holds, installShared } from './session';
import { boot, calls, deferred, loadShared, onFetch, OTHER, R1, sessionToken, settle, signIn, UID } from './test/env';
import { installTestLocks, removeTestLocks } from './test/locks';

const startRoute = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
const listRoute = defineRoute({ method: 'GET', path: '/computers', scope: 'realm' });
const tokensRoute = defineRoute({ method: 'POST', path: '/auth/tokens', scope: 'base', body: [] });
const agentRoute = defineRoute({ method: 'GET', path: '/bots', scope: 'agent' });
const BAN = { status: 403, body: { success: false, statusCode: 403, error: 'ACCOUNT_BANNED', message: 'Your account is banned.' } };

type Win = { navs: string[]; navAt: number[]; events: LifecycleEvent[]; notices: PendingNotice[]; order: string[] };
const offs: Array<() => void> = [];
afterEach(() => { while (offs.length) offs.pop()!(); delete (window as { HubBootToken?: unknown }).HubBootToken; });

/** A booted live page: core + realm (env.boot), the lifecycle wired with a recorded navigation. */
function tab(o: { identity?: boolean } = {}): Win {
  boot({ realm: R1, identity: o.identity });
  const w: Win = { navs: [], navAt: [], events: [], notices: [], order: [] };
  configureLifecycle({ navigate: (u) => { w.navs.push(u); w.navAt.push(Date.now()); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  offs.push(onLifecycle((e) => w.events.push(e)));
  offs.push(onPending((n) => w.notices.push(n)));
  offs.push(onTeardown((r) => w.order.push('teardown:' + r + ':' + gen())));
  return w;
}
const fire = (key: string | null) => window.dispatchEvent(new StorageEvent('storage', { key }));
const settled = <T,>(p: Promise<T>) => p.then((v) => ({ ok: v }), (e) => e);

describe('the page identity is frozen at boot', () => {
  it('page is {kind, uid, sid} of the stored session, frozen; a later sign-in is never adopted', () => {
    tab();
    const pg = page()!;
    expect({ ...pg }).toEqual({ kind: 'account', uid: UID, sid: 'sid0000000000001' });
    expect(Object.isFrozen(pg)).toBe(true);
    expect(holds(pg)).toBe(true);
    signIn(UID, 'sid0000000000002');
    expect(page()).toBe(pg);
    expect(holds(pg)).toBe(false);
  });
  it('a same-user sign-in with a new sid ends every context: a change is refused unsent', async () => {
    tab();
    const ctx = capture();
    signIn(UID, 'sid0000000000002');
    expect(alive(ctx)).toBe(false);
    const r = await settled(api(startRoute, { params: { id: 'c1' }, ctx }));
    expect(r).toMatchObject({ kind: 'not_sent', notSent: true, superseded: true });
    expect(calls.length).toBe(0);
  });
  it('a refresh of the same session (same sid, new tokens) keeps the context, and the change is sent', async () => {
    tab();
    const ctx = capture();
    signIn(UID, 'sid0000000000001');
    expect(alive(ctx)).toBe(true);
    await api(startRoute, { params: { id: 'c1' }, ctx });
    expect(calls.length).toBe(1);
  });
});

describe('bootLive', () => {
  it('reads who the page shows, then the realm list; ready', async () => {
    const w = tab({ identity: false });
    onFetch((c) => (c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID, email: 'a@b.c', is_banned: false } } }
      : c.url.includes('/realms') ? { status: 200, body: { data: { realm_ids: [R1] } } } : { status: 404, body: {} }));
    const r = await bootLive();
    expect(r.state).toBe('ready');
    expect(identity()).toMatchObject({ id: UID, email: 'a@b.c', banned: false });
    expect(await (r as { realms: Promise<readonly string[] | null> }).realms).toEqual([R1]);
    expect(w.navs).toEqual([]);
  });
  it('keeps the account\'s display name (alias), trimmed', async () => {
    tab({ identity: false });
    onFetch((c) => (c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID, email: 'a@b.c', username: 'sample-user', alias: '  Alex Rivera ', is_banned: false } } }
      : c.url.includes('/realms') ? { status: 200, body: { data: { realm_ids: [R1] } } } : { status: 404, body: {} }));
    expect((await bootLive()).state).toBe('ready');
    expect(identity()).toMatchObject({ username: 'sample-user', alias: 'Alex Rivera' });
  });
  it('a later profile answer for the shown account updates its display name; another account\'s changes nothing', async () => {
    tab({ identity: false });
    onFetch((c) => (c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID, username: 'sample-user', alias: 'Old', is_banned: false } } }
      : c.url.includes('/realms') ? { status: 200, body: { data: { realm_ids: [R1] } } } : { status: 404, body: {} }));
    await bootLive();
    expect(identity()?.alias).toBe('Old');
    noteShownAlias(OTHER, 'Someone else');
    expect(identity()?.alias).toBe('Old');
    noteShownAlias(UID, '  New Name ');
    expect(identity()).toMatchObject({ id: UID, username: 'sample-user', alias: 'New Name' });
    noteShownAlias(UID, '');
    expect(identity()?.alias).toBeUndefined();
    expect(identity()?.username).toBe('sample-user');
  });
  it('an empty or non-text alias is no display name', async () => {
    tab({ identity: false });
    onFetch((c) => (c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID, username: 'sample-user', alias: '   ', is_banned: false } } }
      : c.url.includes('/realms') ? { status: 200, body: { data: { realm_ids: [R1] } } } : { status: 404, body: {} }));
    await bootLive();
    expect(identity()?.alias).toBeUndefined();
  });
  it('is_banned true boots into the suspended screen and reads nothing else', async () => {
    tab({ identity: false });
    onFetch(() => ({ status: 200, body: { data: { id: UID, is_banned: true } } }));
    expect(await bootLive()).toEqual({ state: 'banned' });
    expect(identity()?.banned).toBe(true);
    expect(calls.map((c) => c.url.replace(/^https:\/\/[^/]+/, ''))).toEqual(['/api/v1/users/auth/me']);
  });
  it('a 401 (not superseded): sign-in, the session purged', async () => {
    const w = tab({ identity: false });
    onFetch(() => ({ status: 401, body: { statusCode: 401, error: 'UNAUTHORIZED', message: 'Invalid or expired token' } }));
    expect(await bootLive()).toEqual({ state: 'leaving' });
    expect(w.navs).toEqual(['/auth/login']);
    expect(localStorage.getItem('access_token')).toBeNull();
  });
  it('a 401 after boot that purges the session goes to sign-in, once', async () => {
    const w = tab({ identity: false });
    onFetch((c) => (c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID } } } : c.url.includes('/realms') ? { status: 200, body: { data: { realm_ids: [R1] } } } : { status: 401, body: { statusCode: 401, error: 'UNAUTHORIZED', message: 'Invalid or expired token' } }));
    expect((await bootLive()).state).toBe('ready');
    onFetch(() => ({ status: 401, body: { statusCode: 401, error: 'UNAUTHORIZED', message: 'Invalid or expired token' } }));
    await settled(api(listRoute, {}));
    for (let i = 0; i < 10; i++) await settle();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(w.navs).toEqual(['/auth/login']);
    expect(w.events).toContainEqual({ kind: 'leaving', to: 'login' });
  });
  it('a failure that is not about the session: failed, nothing purged, Try again works', async () => {
    const w = tab({ identity: false });
    onFetch(() => ({ status: 503, body: {} }));
    const r = await bootLive();
    expect(r.state).toBe('failed');
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
    onFetch((c) => (c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID } } } : { status: 200, body: { data: { realm_ids: [R1] } } }));
    expect((await bootLive()).state).toBe('ready');
  });
  it('another user signs in (storage event) before the identity arrives: leaves once, the other session kept', async () => {
    const w = tab({ identity: false });
    const d = deferred();
    onFetch(async () => { await d.p; return { status: 200, body: { data: { id: UID } } }; });
    const p = bootLive();
    await settle();
    const B = sessionToken(OTHER, { sid: 'sid-b' });
    localStorage.setItem('access_token', B);
    fire('access_token');
    d.res();
    expect(await p).toEqual({ state: 'leaving' });
    expect(identity()).toBeNull();
    expect(w.navs).toEqual(['/auth/home']);
    expect(localStorage.getItem('access_token')).toBe(B);
  });
  it('the same user signs in again (new sid, no storage event) while the boot read is out: leaves instead of mounting', async () => {
    const w = tab({ identity: false });
    const d = deferred();
    onFetch(async () => { await d.p; return { status: 200, body: { data: { id: UID } } }; });
    const p = bootLive();
    await settle();
    signIn(UID, 'sid0000000000002');
    d.res();
    expect(await p).toEqual({ state: 'leaving' });
    expect(identity()).toBeNull();
    expect(w.navs).toEqual(['/auth/home']);
  });
});

describe('another tab signs out or in as someone else', () => {
  for (const [name, change, key, to, reason] of [
    ['the session removed', () => localStorage.removeItem('access_token'), 'access_token', '/auth/login', 'signout'],
    ['storage cleared (key null)', () => localStorage.clear(), null, '/auth/login', 'signout'],
    ['another user signed in', () => signIn(OTHER, 'sid-b'), 'access_token', '/auth/home', 'account'],
    ['the same user signed in again (new sid)', () => signIn(UID, 'sid0000000000002'), 'access_token', '/auth/home', 'account'],
    ['a refresh_token event after another session was stored', () => localStorage.setItem('access_token', sessionToken(OTHER, { sid: 'x' })), 'refresh_token', '/auth/home', 'account'],
  ] as const) {
    it(`${name}: teardown, then the generation, then leave once`, () => {
      const w = tab();
      const ctx = capture();
      const g = gen();
      change();
      fire(key);
      fire(key);
      expect(w.order).toEqual([`teardown:${reason}:${g}`]);
      expect(gen()).toBe(g + 1);
      expect(w.navs).toEqual([to]);
      expect(alive(ctx)).toBe(false);
    });
  }
  it('a refresh of the same session (same sid, new tokens) changes nothing; another key changes nothing', () => {
    const w = tab();
    const g = gen();
    signIn(UID, 'sid0000000000001');
    fire('access_token');
    fire('refresh_token');
    localStorage.setItem('hub_realm_colors', '{}');
    fire('hub_realm_colors');
    expect([gen(), w.navs, w.order]).toEqual([g, [], []]);
  });
  it('superseded() runs once per page', () => {
    const w = tab();
    localStorage.clear();
    superseded();
    superseded();
    expect(w.navs).toEqual(['/auth/login']);
  });
});

describe('sign-out', () => {
  it('nothing in flight: teardown, the session ended server-side while its bearer exists, purged, sign-in', async () => {
    const w = tab();
    const ctx = capture();
    const seenBearer: Array<string | null> = [];
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => { seenBearer.push(localStorage.getItem('access_token') ? 'bearer' : null); return Promise.resolve(); } };
    const g = gen();
    logout();
    expect(alive(ctx)).toBe(false);
    expect(w.order).toEqual([`teardown:logout:${g}`]);
    await settle(20);
    expect(seenBearer).toEqual(['bearer']);
    expect(calls.map((c) => [c.method, c.url.replace(/^https:\/\/[^/]+/, '')])).toEqual([['DELETE', '/api/v1/users/auth/sessions/sid0000000000001']]);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(w.navs).toEqual(['/auth/login']);
    expect(w.notices).toEqual([]);
  });
  it('a second call does nothing', async () => {
    const w = tab();
    logout();
    logout();
    await settle(20);
    expect(w.navs).toEqual(['/auth/login']);
    expect(calls.filter((c) => c.method === 'DELETE').length).toBe(1);
  });
  it('a change asked for after sign-out began is refused unsent: nothing sent, no notice', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => new Promise(() => {}) };
    logout({ endMs: 100 }); // bounded short, so it is over before the drain below ends (the default bound is 2 s)
    const r = await settled(api(startRoute, { params: { id: 'c1' } }));
    expect(r).toMatchObject({ kind: 'not_sent' });
    expect(calls.filter((c) => c.url.endsWith('/computers/c1/start'))).toEqual([]);
    expect(w.notices).toEqual([]);
  });
  it('a sent change in flight: one "may have gone through" notice, the change stays pending, the page waits to leave', async () => {
    const w = tab();
    // The answer is held until sign-out has begun, so the change is in flight then however slow the run is.
    const answer = deferred();
    onFetch((c) => (c.url.endsWith('/computers/c1/start') ? answer.p.then(() => ({ status: 200, body: {} })) : { status: 200, body: { data: {} } }));
    const p = settled(api(startRoute, { params: { id: 'c1' } }));
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/computers/c1/start'))).toBe(true));
    const t0 = Date.now();
    logout({ minWaitMs: 1500 });
    expect(w.notices).toEqual([{ realm: R1, signingOut: true }]);
    answer.res();
    expect(await p).toMatchObject({ kind: 'pending', pending: true });
    expect(w.notices.length).toBe(1);
    await settle(10);
    expect(w.navs).toEqual([]);
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']), { timeout: 5000, interval: 20 });
    expect(w.navAt[0]! - t0).toBeGreaterThanOrEqual(1400); // the notice's read time (1500 ms; timer clocks may round)
    expect(w.notices.length).toBe(1);
  });
  it('A: another tab signs in while the revoke is pending: the new session stays, the page leaves', async () => {
    const w = tab();
    const rev = deferred();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => rev.p };
    logout();
    const B = sessionToken(OTHER, { sid: 'sid-b' });
    localStorage.setItem('access_token', B);
    rev.res();
    await settle(20);
    expect(localStorage.getItem('access_token')).toBe(B);
    expect(w.navs).toEqual(['/auth/login']);
  });
  it('storage already holds another account before its storage event: kept, nothing revoked or ended', async () => {
    const w = tab();
    let revoked = 0;
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => { revoked++; return Promise.resolve(); } };
    signIn(OTHER, 'sid-b');
    const B = localStorage.getItem('access_token');
    logout();
    await settle(20);
    expect(localStorage.getItem('access_token')).toBe(B);
    expect(revoked).toBe(0);
    expect(calls.filter((c) => c.method === 'DELETE')).toEqual([]);
    expect(w.navs).toEqual(['/auth/login']);
  });
  it('the same user signs in again (new sid) during the revoke wait: the new session stays', async () => {
    const w = tab();
    const rev = deferred();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => rev.p };
    logout();
    signIn(UID, 'sid0000000000002');
    const N = localStorage.getItem('access_token');
    rev.res();
    await settle(20);
    expect(localStorage.getItem('access_token')).toBe(N);
    expect(w.navs).toEqual(['/auth/login']);
  });
  it('control: a refresh of the outgoing session (same sid) during the wait is still purged', async () => {
    tab();
    const rev = deferred();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => rev.p };
    logout();
    signIn(UID, 'sid0000000000001');
    rev.res();
    await settle(20);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
  it('a revoke that never answers is bounded: the page still leaves', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => new Promise(() => {}) };
    logout({ endMs: 30 });
    await new Promise((r) => setTimeout(r, 60));
    expect(w.navs).toEqual(['/auth/login']);
    expect(localStorage.getItem('access_token')).toBeNull();
  });
  it('an account sign-out whose purge leaves a credential stored stays on the purge-failed panel; Try again purges', async () => {
    const w = tab();
    const real = loadShared();
    let fail = true;
    installShared({ ...real, purgeOutgoingSession: (o, p) => (fail ? 'failed' : real.purgeOutgoingSession(o, p)) });
    logout({ endMs: 1 });
    await settle(20);
    expect(w.navs).toEqual([]);
    expect(w.events.map((e) => e.kind)).toContain('purge-failed');
    fail = false;
    logout();
    await settle(20);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(w.navs).toEqual(['/auth/login']);
  });
  it('a token session another tab stored after this account page lost its session is never purged by its sign-out', async () => {
    const w = tab();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    const rec = JSON.stringify({ v: 1, token: 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48), realm: 'all', sid: 'tok0000000000001', at: Date.now(), owner: { id: OTHER, username: 'other' } });
    localStorage.setItem('hub_token_session_v1', rec);
    logout({ endMs: 1 });
    await settle(20);
    expect(localStorage.getItem('hub_token_session_v1')).toBe(rec);
    expect(w.navs).toEqual(['/auth/login']);
  });
  it('a page whose session already ended purges nothing at sign-out: another tab\'s sign-in step in progress stays', async () => {
    const w = tab();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.setItem('two_factor_token', 'tf-of-the-other-tab');
    logout({ endMs: 1 });
    await settle(20);
    expect(localStorage.getItem('two_factor_token')).toBe('tf-of-the-other-tab');
    expect(w.navs).toEqual(['/auth/login']);
  });
  it('only the page\'s own refresh token left (a failed purge before): the sign-out removes it, then leaves', async () => {
    const w = tab();
    localStorage.removeItem('access_token');
    logout({ endMs: 1 });
    await settle(20);
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(w.navs).toEqual(['/auth/login']);
  });
  it('storage that cannot be read when the sign-out finishes is a failed purge: the page stays on the panel', async () => {
    const w = tab();
    logout({ endMs: 1 });
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      await settle(20);
      expect(w.navs).toEqual([]);
      expect(w.events.map((e) => e.kind)).toContain('purge-failed');
    } finally { spy.mockRestore(); }
  });
  it('Remove all local data with storage unreadable at the finish: the purge-failed panel, no leave, nothing wiped or purged', async () => {
    const w = tab();
    let wipes = 0;
    logout({ endMs: 1, wipe: async () => { wipes++; return true; } });
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      await settle(20);
      expect(w.navs).toEqual([]);
      expect(w.events.map((e) => e.kind)).toContain('purge-failed');
    } finally { spy.mockRestore(); }
    expect(wipes).toBe(0);
    // Tokens kept for the panel's Try again.
    expect(localStorage.getItem('access_token')).not.toBeNull();
    expect(localStorage.getItem('refresh_token')).not.toBeNull();
  });
  it('a storage event during sign-out does not leave a second time', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => new Promise(() => {}) };
    logout({ endMs: 30 });
    signIn(OTHER, 'sid-b');
    fire('access_token');
    await new Promise((r) => setTimeout(r, 60));
    expect(w.navs).toEqual(['/auth/login']);
  });
});

// A sign-out left running by a test finishes later and navigates (and purges the same test session) in whatever test
// runs then. These two blocks drain: once for earlier blocks (whose only unanswered revoke is bounded at 100 ms; the
// others end within their test), then after each test (their sign-outs pass endMs 1).
const drainSignOuts = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
describe('the purge reason and the warned sign-out, with real attempt records', () => {
  beforeAll(() => drainSignOuts(200));
  afterEach(async () => { removeTestLocks(); await drainSignOuts(50); });
  const stored = () => (JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]') as Array<{ id: string }>).map((r) => r.id);
  const hold = async () => {
    const r = await holdAttempt('keys:create', { by: 'keys:create' });
    if (!r.ok) throw new Error('not held: ' + r.code);
    r.hold.sent(); // answered (an unknown answer): pending, no send out
    await settle();
    return r.hold.id;
  };
  it('a plain logout() (no warning) purges as a sign-out but removes no stored hold; a clean read still has it', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const id = await hold();
    expect(stored()).toEqual([id]);
    logout({ minWaitMs: 0, endMs: 1 });
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login')); // contains: an earlier test's late leave may land here too
    await settle();
    const rd = readChangesState();
    expect(rd.state).toBe('clean');
    expect(rd.state === 'clean' && rd.list.map((r) => r.id)).toEqual([id]);
  });
  it('a 401 purges as expiry: a stored hold of the account stays for its next sign-in', async () => {
    const rec = { id: ATTEMPT_PREFIX + UID + '\u0001keys:create\u0000' + 'c'.repeat(32), pending: true, key: 'hub-c', at: 1, t: 1, meta: { base: 'keys:create', target: null, realm: null, identity: null, by: 'keys:create' } };
    const w = tab({ identity: false });
    await settle(); // the test boot's store clear runs under the (asynchronous) store lock
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([rec]));
    onFetch(() => ({ status: 401, body: { statusCode: 401, error: 'UNAUTHORIZED', message: 'Invalid or expired token' } }));
    expect(await bootLive()).toEqual({ state: 'leaving' });
    expect(w.navs).toEqual(['/auth/login']);
    expect(localStorage.getItem('access_token')).toBeNull();
    await settle();
    expect(stored()).toEqual([rec.id]);
  });
  it('the warned sign-out removes the account\'s records first; when it cannot, it stays signed in and nothing is purged', async () => {
    const w = tab();
    const id = await hold();
    const ctx = capture();
    removeTestLocks(); // no cross-tab lock and a hold stored: the forget refuses
    expect(await signOutForgetting(UID, signOutHolds(), { minWaitMs: 0, endMs: 1 })).toBe('failed');
    await settle();
    expect(w.navs).toEqual([]);
    expect(alive(ctx)).toBe(true);
    expect(localStorage.getItem('access_token')).not.toBeNull();
    expect(stored()).toEqual([id]);
    installTestLocks();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    expect(await signOutForgetting(UID, signOutHolds(), { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login')); // contains: an earlier test's late leave may land here too
    expect(localStorage.getItem('access_token')).toBeNull();
  });
  it('another account shown when it starts: \'changed\', nothing forgotten, nobody signed out', async () => {
    const w = tab();
    const id = await hold();
    const shown = signOutHolds();
    setIdentity({ id: OTHER, banned: false });
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('changed');
    setIdentity({ id: UID, banned: false });
    await settle();
    expect(stored()).toEqual([id]);
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });
  it('the shown account changes while the forget runs: \'changed\', and the account now shown is not signed out', async () => {
    const w = tab();
    await hold();
    const p = signOutForgetting(UID, signOutHolds(), { minWaitMs: 0, endMs: 1 });
    setIdentity({ id: OTHER, banned: false }); // before the store lock is granted (always asynchronous)
    expect(await p).toBe('changed');
    await settle();
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });
});

describe('attempts-f: the sign-out forgets only the holds the warning showed', () => {
  afterEach(async () => { setChangeStoreAdapter(null); removeTestLocks(); await drainSignOuts(50); });
  type Rec = { id: string; admitting?: number };
  const records = () => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]') as Rec[];
  const stored = () => records().map((r) => r.id).sort();
  const hold = async (lock = 'keys:create', live = false) => {
    const r = await holdAttempt(lock, { by: lock.split(':').slice(0, 2).join(':') });
    if (!r.ok) throw new Error('not held: ' + r.code);
    if (!live) { r.hold.sent(); await settle(); } // answered (unknown): pending, no send out
    return r.hold;
  };
  type Live = Rec & { sending?: { tab: string; at: number } };
  const recordOf = (id: string): Live | undefined => (records() as Live[]).find((r) => r.id === id);
  /** Every fresh view of storage tries the same send again: this tab, a fresh tab, a reload, A→B→A. None is sent. */
  const refusedEverywhere = async (lock: string): Promise<void> => {
    const by = lock.split(':').slice(0, 2).join(':');
    const again = () => holdAttempt(lock, { by });
    expect(await again()).toMatchObject({ ok: false, code: 'HELD', notSent: true });
    resetAttempts(); newChangeStoreTabForTests(); // a fresh tab: no memory, a new tab id
    expect(await again()).toMatchObject({ ok: false, code: 'HELD', notSent: true });
    resetAttempts(); // a reload
    expect(await again()).toMatchObject({ ok: false, code: 'HELD', notSent: true });
    setIdentity({ id: OTHER, banned: false }); bump('account'); await settle();
    setIdentity({ id: UID, banned: false }); bump('account'); await settle(); // A→B→A
    expect(await again()).toMatchObject({ ok: false, code: 'HELD', notSent: true });
  };
  const signedIn = () => localStorage.getItem('access_token') !== null;
  it('the warning\'s list is the account\'s holds by id and token; the forget of exactly that list signs out', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold();
    const shown = signOutHolds();
    expect(shown).toEqual([{ id: a.id, token: a.incarnation }]);
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login')); // contains: an earlier test's late leave may land here too
  });
  it('a hold admitted after the warning, queued before the forget\'s store lock: \'changed\', nothing forgotten, still signed in', async () => {
    const w = tab();
    const a = await hold();
    const shown = signOutHolds(); // the warning: one hold
    const late = holdAttempt('keys:copy:k1', { by: 'keys:copy' }); // queued on the store lock first
    const r = await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 });
    const b = await late;
    expect(b.ok).toBe(true);
    expect(stored()).toEqual([a.id, b.ok ? b.hold.id : ''].sort()); // the late hold is still stored
    expect(r).toBe('changed');
    if (b.ok) { b.hold.sent(); await settle(); } // its answer came: no send out, so the next forget may remove it
    await settle();
    expect(loggingOut()).toBe(false); // this page never began a sign-out (navs can carry an earlier test's late leave)
    expect(signedIn()).toBe(true);
    // The next warning lists both; its forget signs out.
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    expect(signOutHolds().map((h) => h.id).sort()).toEqual(stored());
    expect(await signOutForgetting(UID, signOutHolds(), { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login')); // contains: an earlier test's late leave may land here too
  });
  it('a swap: the shown hold freed and another admitted, the same count: \'changed\', the new hold kept', async () => {
    tab();
    const a = await hold();
    const shown = signOutHolds();
    a.release(); // freed in its sender (its removal queued on the store lock)
    const b = await hold('keys:copy:k1');
    expect(signOutHolds()).toHaveLength(shown.length);
    const r = await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 });
    expect(stored()).toEqual([b.id]); // the new hold is still stored
    expect(r).toBe('changed');
    await settle();
    expect(loggingOut()).toBe(false); // this page never began a sign-out (navs can carry an earlier test's late leave)
    expect(signedIn()).toBe(true);
  });
  it('a hold in the middle of being freed counts as a hold: not shown, its removal refused, \'changed\' and it stays', async () => {
    tab();
    const a = await hold();
    let refuse = 1; // the free's removal write is refused once
    setChangeStoreAdapter({
      read: () => localStorage.getItem(CHANGE_STORE_KEY),
      write: (t) => { if (refuse > 0) { refuse--; return false; } if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; },
    });
    a.dismiss(true); // the removal is queued; this tab hides the hold meanwhile
    const shown = signOutHolds();
    expect(shown).toEqual([]);
    const r = await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 });
    expect(stored()).toEqual([a.id]); // the hold whose removal was refused is still stored
    expect(r).toBe('changed');
    expect(signOutHolds().map((h) => h.id)).toEqual([a.id]); // shows again: never freed by accident
    await settle();
    expect(loggingOut()).toBe(false); // this page never began a sign-out (navs can carry an earlier test's late leave)
  });
  it('records that are no hold (an admission past its window) never answer \'changed\'; the forget removes them with the shown holds', async () => {
    tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold();
    const stale = { id: ATTEMPT_PREFIX + UID + '\u0001keys:old\u0000' + 'd'.repeat(32), pending: true, key: 'hub-d', at: 1, admitting: 1, t: 2, meta: { base: 'keys:old', target: null, realm: null, identity: null, by: 'keys:old' } };
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...records(), stale]));
    const shown = signOutHolds();
    expect(shown.map((h) => h.id)).toEqual([a.id]);
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
  });
  it('\'unknown\': the removal can be neither proven nor undone: nothing signed out, this tab drops the shown hold, storage still decides admission', async () => {
    const w = tab();
    const a = await hold();
    const shown = signOutHolds();
    // The forget's removal write "succeeds" but does not land; its read-back is corrupt; the rollback is refused.
    let mode: 'ok' | 'broken' = 'ok';
    setChangeStoreAdapter({
      read: () => (mode === 'broken' ? '{' : localStorage.getItem(CHANGE_STORE_KEY)),
      write: (t) => {
        if (mode === 'broken') return false;
        if (t === null || !t.includes(a.id)) { mode = 'broken'; return true; } // the removal: reported stored, never landed
        localStorage.setItem(CHANGE_STORE_KEY, t);
        return true;
      },
    });
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('unknown');
    await settle();
    expect(loggingOut()).toBe(false); // this page never began a sign-out (navs can carry an earlier test's late leave)
    expect(signedIn()).toBe(true);
    expect(signOutHolds()).toEqual([]); // dropped from this tab's memory; storage cannot be read
    // Storage heals and still holds it: it shows again, and the same lock is refused (never sent twice).
    mode = 'ok';
    setChangeStoreAdapter(null);
    expect(signOutHolds().map((h) => h.id)).toEqual([a.id]);
    expect(await holdAttempt('keys:create', { by: 'keys:create' })).toMatchObject({ ok: false, code: 'HELD', notSent: true });
    // No carry-over set: the next warning reads storage cleanly, lists it, and its forget deletes it.
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const again = signOutHolds();
    expect(again).toEqual([{ id: a.id, token: a.incarnation }]);
    expect(await signOutForgetting(UID, again, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login')); // contains: an earlier test's late leave may land here too
  });
  it('another account\'s holds are never judged or removed', async () => {
    tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold();
    const foreign = { id: ATTEMPT_PREFIX + OTHER + '\u0001keys:create\u0000' + 'e'.repeat(32), pending: true, key: 'hub-e', at: 1, t: 3, meta: { base: 'keys:create', target: null, realm: null, identity: null, by: 'keys:create' } };
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...records(), foreign]));
    expect(await signOutForgetting(UID, [{ id: a.id, token: a.incarnation }], { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([foreign.id]);
  });
  it('a shown attempt whose request is still out (a live sending stamp) keeps its record on \'done\': the answered one goes, the page signs out', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold();
    const b = await hold('keys:copy:k1', true);
    const shown = signOutHolds();
    expect(shown.map((h) => h.id).sort()).toEqual([a.id, b.id].sort());
    expect(shown.find((h) => h.id === b.id)?.sending).toBe(true); // the warning names it as still out
    expect(shown.find((h) => h.id === a.id)?.sending).toBeUndefined();
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([b.id]); // still out: kept, so no tab admits the same send again
    expect(recordOf(b.id)?.sending).toBeDefined();
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login')); // contains: an earlier test's late leave may land here too
    const left = localStorage.getItem(CHANGE_STORE_KEY);
    // Its answer still settles the kept record (the leaving page's handle): the stamp ends, the hold stays pending.
    b.sent();
    await settle();
    expect(stored()).toEqual([b.id]);
    expect(recordOf(b.id)?.sending).toBeUndefined();
    // A fresh page signed in as the same account, the record as the sign-out left it (its send still out): refused.
    tab();
    await settle(); // the test boot's store clear runs under the store lock
    localStorage.setItem(CHANGE_STORE_KEY, left ?? '[]');
    await refusedEverywhere('keys:copy:k1');
  });
  it('this tab\'s own send still out, its beat paused past SENDING_STALE_MS (a throttled tab): flagged, kept on \'done\', refused elsewhere, its answer settles it', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold(); // answered: pending
    const b = await hold('keys:copy:k1', true); // still out in this tab
    // No beat landed for longer than SENDING_STALE_MS: the stored stamp reads stale, the send is still out here.
    const aged = (records() as Live[]).map((r) => (r.id === b.id ? { ...r, sending: { tab: r.sending?.tab ?? '', at: Date.now() - SENDING_STALE_MS - 1000 } } : r));
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(aged));
    const shown = signOutHolds();
    expect(shown.find((h) => h.id === b.id)?.sending).toBe(true); // this tab knows its send is out
    expect(shown.find((h) => h.id === a.id)?.sending).toBeUndefined();
    expect(heldAttempts().find((h) => h.id === b.id)?.inFlight).toBe('here'); // holdkit: this tab's own send
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([b.id]); // kept, so no tab sends it again
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login')); // contains: an earlier test's late leave may land here too
    const left = localStorage.getItem(CHANGE_STORE_KEY);
    // Its answer still settles the kept record (the leaving page's handle): the stamp ends, the hold stays pending.
    b.sent();
    await settle();
    expect(stored()).toEqual([b.id]);
    expect(recordOf(b.id)?.sending).toBeUndefined();
    // A fresh page of the account, the record as the sign-out left it: refused in every view.
    tab();
    await settle(); // the test boot's store clear runs under the store lock
    localStorage.setItem(CHANGE_STORE_KEY, left ?? '[]');
    await refusedEverywhere('keys:copy:k1');
  });
  it('attempts: a late answer after a confirmed forget writes nothing for a removed hold no tab still sends', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold(); // answered: pending
    const dead = { id: ATTEMPT_PREFIX + UID + '\u0001keys:old\u0000' + 'f'.repeat(32), pending: true, key: 'hub-f', at: 1, t: 9, sending: { tab: 'gone', at: Date.now() - SENDING_STALE_MS - 1000 }, meta: { base: 'keys:old', target: null, realm: null, identity: null, by: 'keys:old' } };
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...records(), dead]));
    const shown = signOutHolds();
    expect(shown.every((h) => h.sending === undefined)).toBe(true);
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
    await vi.waitFor(() => expect(w.navs).toContain('/auth/login'));
    const after = localStorage.getItem(CHANGE_STORE_KEY);
    let writes = 0;
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: (t) => { writes++; if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; } });
    a.sent(); // late, after its answer was already in
    a.release(); // a late known answer of the removed pending hold
    await settle();
    expect(writes).toBe(0);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(after);
    expect(stored()).toEqual([]);
  });
  it('attempts, \'unknown\' with the removal landed: a late answer of a removed hold writes nothing', async () => {
    tab();
    const a = await hold();
    const shown = signOutHolds();
    let mode: 'ok' | 'broken' = 'ok';
    setChangeStoreAdapter({
      read: () => (mode === 'broken' ? '{' : localStorage.getItem(CHANGE_STORE_KEY)),
      write: (t) => {
        if (mode === 'broken') return false;
        if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t);
        if (t === null || !t.includes(a.id)) mode = 'broken';
        return true;
      },
    });
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('unknown');
    mode = 'ok';
    let writes = 0;
    setChangeStoreAdapter({ read: () => localStorage.getItem(CHANGE_STORE_KEY), write: (t) => { writes++; if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; } });
    const after = localStorage.getItem(CHANGE_STORE_KEY);
    a.sent();
    a.release();
    await settle();
    expect(writes).toBe(0);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(after);
    expect(stored()).toEqual([]);
    expect(signOutHolds()).toEqual([]);
  });
  it('an attempt send still out that the warning did not show: \'changed\', nothing removed, refused everywhere', async () => {
    tab();
    const a = await hold();
    const shown = signOutHolds();
    const b = await hold('keys:copy:k1', true); // admitted after the warning, still out
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('changed');
    expect(stored()).toEqual([a.id, b.id].sort());
    expect(loggingOut()).toBe(false);
    await refusedEverywhere('keys:copy:k1');
  });
  it('a stale stamp the warning did not show (another tab died mid-send meanwhile): \'changed\', nothing removed', async () => {
    tab();
    const a = await hold();
    const shown = signOutHolds();
    const stale = { id: ATTEMPT_PREFIX + UID + '\u0001keys:old\u0000' + 'f'.repeat(32), pending: true, key: 'hub-f', at: 1, t: 9, sending: { tab: 'gone', at: Date.now() - SENDING_STALE_MS - 1000 }, meta: { base: 'keys:old', target: null, realm: null, identity: null, by: 'keys:old' } };
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([...records(), stale]));
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('changed');
    expect(stored()).toEqual([a.id, stale.id].sort());
    expect(loggingOut()).toBe(false);
  });
  it('a shown attempt whose stamp is stale (its tab died mid-send) is a pending hold like any other: removed', async () => {
    tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold('keys:create', true);
    resetAttempts(); // the sending tab is gone: no beat renews the stamp
    const aged = (records() as Live[]).map((r) => (r.id === a.id ? { ...r, sending: { tab: r.sending?.tab ?? 'x', at: Date.now() - SENDING_STALE_MS - 1000 } } : r));
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(aged));
    const shown = signOutHolds();
    expect(shown.map((h) => h.id)).toEqual([a.id]);
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
  });
  it('\'unknown\' with the removal landed: the send still out keeps its record, this tab\'s copy and its beat; a reload refuses its lock; its sender frees it', async () => {
    tab();
    const a = await hold();
    const b = await hold('keys:copy:k1', true);
    const shown = signOutHolds();
    // The removal lands; its read-back is corrupt; the rollback is refused.
    let mode: 'ok' | 'broken' = 'ok';
    setChangeStoreAdapter({
      read: () => (mode === 'broken' ? '{' : localStorage.getItem(CHANGE_STORE_KEY)),
      write: (t) => {
        if (mode === 'broken') return false;
        if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t);
        if (t === null || !t.includes(a.id)) mode = 'broken';
        return true;
      },
    });
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('unknown');
    await settle();
    expect(loggingOut()).toBe(false); // this page never began a sign-out (navs can carry an earlier test's late leave)
    expect(signedIn()).toBe(true);
    expect(heldAttempts().map((h) => h.id)).toEqual([b.id]); // the answered one dropped, the one still out kept
    mode = 'ok';
    setChangeStoreAdapter(null);
    expect(stored()).toEqual([b.id]);
    expect(recordOf(b.id)?.sending).toBeDefined();
    expect(await holdAttempt('keys:copy:k1', { by: 'keys:copy' })).toMatchObject({ ok: false, code: 'HELD', notSent: true });
    // Its answer still settles the kept record through the sender's handle: the stamp ends, the hold stays.
    b.sent();
    await settle();
    expect(recordOf(b.id)?.sending).toBeUndefined();
    await refusedEverywhere('keys:copy:k1');
    b.release();
    await settle();
    expect(stored()).toEqual([]);
  });
  it('a sign-out that begins while the forget waits keeps \'unknown\' (the removal may have landed: never reported as failed)', async () => {
    tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold();
    const shown = signOutHolds();
    // The removal lands; a sign-out begins meanwhile; the read-back is corrupt; the rollback is refused.
    let mode: 'ok' | 'broken' = 'ok';
    setChangeStoreAdapter({
      read: () => (mode === 'broken' ? '{' : localStorage.getItem(CHANGE_STORE_KEY)),
      write: (t) => {
        if (mode === 'broken') return false;
        if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t);
        if (t === null || !t.includes(a.id)) { mode = 'broken'; logout({ minWaitMs: 0, endMs: 1 }); }
        return true;
      },
    });
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('unknown');
    expect(loggingOut()).toBe(true);
  });
  it('a sign-out that begins while the forget waits: \'done\' stays done, and the page leaves once', async () => {
    const w = tab();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
    const a = await hold();
    const shown = signOutHolds();
    let begun = false;
    setChangeStoreAdapter({
      read: () => localStorage.getItem(CHANGE_STORE_KEY),
      write: (t) => {
        if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t);
        if (!begun && (t === null || !t.includes(a.id))) { begun = true; logout({ minWaitMs: 0, endMs: 1 }); }
        return true;
      },
    });
    const from = w.navs.length;
    expect(await signOutForgetting(UID, shown, { minWaitMs: 0, endMs: 1 })).toBe('done');
    expect(stored()).toEqual([]);
    await vi.waitFor(() => expect(w.navs.slice(from)).toContain('/auth/login'));
    await drainSignOuts(100);
    expect(w.navs.slice(from).filter((u) => u === '/auth/login')).toHaveLength(1);
  });
  it('the sign-out purge keeps the copy and beat of a kept send still out: still flagged here, its stamp renewed past SENDING_STALE_MS, its answer settles it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      tab();
      (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
      const a = await hold();
      const b = await hold('keys:copy:k1', true);
      expect(await signOutForgetting(UID, signOutHolds(), { minWaitMs: 0, endMs: 1 })).toBe('done');
      await vi.waitFor(() => expect(signedIn()).toBe(false)); // the purge (reason 'signout') ran
      expect(stored()).toEqual([b.id]);
      expect(a.id).not.toBe(b.id);
      const flagged = () => { const st = readChangesState(); return st.state === 'unreadable' ? undefined : attemptHoldRefsIn(st.list, UID).find((h) => h.id === b.id)?.sending; };
      expect(flagged()).toBe(true); // this tab still knows its send is out
      vi.advanceTimersByTime(SENDING_STALE_MS + 1000);
      await settle();
      expect(Date.now() - (recordOf(b.id)?.sending?.at ?? 0)).toBeLessThan(SENDING_STALE_MS); // the beat still renews it
      expect(flagged()).toBe(true);
      b.sent();
      await settle();
      expect(recordOf(b.id)?.sending).toBeUndefined();
      expect(stored()).toEqual([b.id]); // answered (unknown): pending, read-only until the account returns
    } finally { vi.useRealTimers(); }
  });
});

describe('suspension: a Hoody API 403 ACCOUNT_BANNED for the shown account', () => {
  it('a realm read: identity.banned, one teardown and one bump; the caller still gets the refusal; once', async () => {
    const w = tab();
    onFetch(() => BAN);
    const g = gen();
    expect(await settled(api(listRoute))).toMatchObject({ status: 403, code: 'ACCOUNT_BANNED' });
    expect(identity()?.banned).toBe(true);
    expect(w.order).toEqual([`teardown:suspended:${g}`]);
    expect(gen()).toBe(g + 1);
    expect(w.events).toEqual([{ kind: 'suspended' }]);
    expect(await settled(api(listRoute))).toMatchObject({ status: 403, code: 'ACCOUNT_BANNED' });
    expect([w.order.length, gen(), w.events.length]).toEqual([1, g + 1, 1]);
    expect(w.navs).toEqual([]);
  });
  it('a base change refused after it was sent suspends too; a definite answer, never pending', async () => {
    const w = tab();
    onFetch(() => BAN);
    const r = await settled(api(tokensRoute, { body: {} }));
    expect(r).toMatchObject({ status: 403, code: 'ACCOUNT_BANNED' });
    expect(r.pending).toBeUndefined();
    expect(w.events).toEqual([{ kind: 'suspended' }]);
  });
  for (const [name, answer] of [
    ['another 403 code', { status: 403, body: { error: 'FORBIDDEN' } }],
    ['a 401', { status: 401, body: { statusCode: 401, error: 'ACCOUNT_BANNED' } }],
    ['a 500', { status: 500, body: { error: 'ACCOUNT_BANNED' } }],
  ] as const) {
    it(`${name} does not suspend`, async () => {
      const w = tab();
      onFetch(() => answer);
      await settled(api(listRoute));
      expect(identity()?.banned).toBe(false);
      // A 401 that purges the session goes to sign-in; never the suspended screen.
      expect(w.events.filter((e) => e.kind === 'suspended')).toEqual([]);
    });
  }
  it("an agent's own 403 ACCOUNT_BANNED does not suspend", async () => {
    const w = tab();
    onFetch(() => BAN);
    await settled(api(agentRoute, { realm: R1 }));
    expect(w.events).toEqual([]);
  });
  it('an answer for a context already gone does not suspend', async () => {
    const w = tab();
    const d = deferred();
    onFetch(async () => { await d.p; return BAN; });
    const p = settled(api(listRoute));
    await settle();
    signIn(OTHER, 'sid-b');
    d.res();
    expect(await p).toMatchObject({ kind: 'stale' });
    expect(w.events.filter((e) => e.kind === 'suspended')).toEqual([]);
  });
});
