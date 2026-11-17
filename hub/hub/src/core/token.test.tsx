// token.test.tsx: shared-access (token) sessions: the introspection, capabilities, boot, mid-session check,
// refusals, the termination table and the timers (token-auth.js reads the introspection answer).
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharedSource from '../../../public/auth/shared.js?raw';
import tokenAuthSource from '../../../public/auth/token-auth.js?raw';
import { api } from './api';
import { holdAttempt } from './attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY } from './change-store';
import { identity } from './ctx';
import { bootLive, configureLifecycle, endTokenSession, initLive, logout, onLifecycle, signOutForgetting, signOutHolds, type LifecycleEvent } from './lifecycle';
import { defineRoute } from './routes';
import { installShared, shared } from './session';
import { boot, calls, loadShared, onFetch, R1, settle, signIn, UID, type Call, type Reply } from './test/env';
import { removeTestLocks } from './test/locks';
import { can, capsAllow, capsOf, checkTokenSession, minimumHeld, parseTokenIntrospection, resetToken, tokenInfo, useCan } from './token';

const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const SID = 'tsid000000000001';
const record = (realm: string) => JSON.stringify({ v: 1, token: TOKEN, realm, sid: SID, at: 1, owner: { id: UID, username: 'owner' } });
const listRoute = defineRoute({ method: 'GET', path: '/computers', scope: 'realm' });

const PERMS = { computers: { read: true, actions: { start: true, stop: false } }, projects: { read: true } };
function intro(o: Record<string, unknown> = {}) {
  return { data: { token: { id: 'tok1', alias: 'shared-1', realm_ids: [R1], allow_no_realm: false, permissions: PERMS, expires_at: null, ...o } } };
}

type Win = { navs: string[]; events: LifecycleEvent[] };
const offs: Array<() => void> = [];
afterEach(() => { while (offs.length) offs.pop()!(); resetToken(); vi.useRealTimers(); removeTestLocks(); });

/** A token page pinned to `realm`; `on` answers the fetches (introspection and me included). */
function tokenTab(on: (c: Call) => Reply | undefined, realm = R1): Win {
  boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: record(realm) } });
  resetToken();
  const w: Win = { navs: [], events: [] };
  configureLifecycle({ navigate: (u) => w.navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  offs.push(onLifecycle((e) => w.events.push(e)));
  onFetch((c) => on(c) ?? { status: 200, body: { data: [] } });
  return w;
}
const isIntro = (c: Call) => c.url.endsWith('/api/v1/auth/tokens/me');
const isMe = (c: Call) => c.url.endsWith('/users/auth/me');
const meOk = { status: 200, body: { data: { id: UID, username: 'owner' } } };
const standard = (introBody: unknown = intro()) => (c: Call): Reply | undefined => (isIntro(c) ? { status: 200, body: introBody } : isMe(c) ? meOk : undefined);

describe('the introspection: the same answers as token-auth.js', () => {
  const ref = new Function(sharedSource.replace(/^'use strict';/, '') + '\n;' + tokenAuthSource.replace(/^'use strict';/, '') + '\n;return parseTokenIntrospection;')() as (b: unknown) => unknown;
  const cases: unknown[] = [
    intro(), intro({ realm_ids: ['AAAAAAAAAAAAAAAAAAAAAAAA', 'aaaaaaaaaaaaaaaaaaaaaaaa'] }), intro({ realm_ids: ['x'] }), intro({ expires_at: '2030-01-01T00:00:00Z' }),
    intro({ expires_at: 'soon' }), intro({ expires_at: 5 }), intro({ alias: 3 }), intro({ id: '' }), intro({ allow_no_realm: 'yes' }), intro({ permissions: [] }),
    intro({ vault_access: true, event_access: 'true', is_enabled: false }), intro({ permissions: { a: { b: { c: { d: { e: { f: { g: { h: true } } } } } } }, x: 1, y: 'true', z: true } }),
    intro({ permissions: JSON.parse('{"__proto__": {"x": true}, "ok": true}') }), { token: intro().data.token }, null, 'x', { data: null }, intro({ realm_ids: new Array(1001).fill(R1) }),
  ];
  cases.forEach((c, i) => it(`vector ${i}`, () => { expect(JSON.parse(JSON.stringify(parseTokenIntrospection(c)))).toEqual(JSON.parse(JSON.stringify(ref(c)))); }));
});

describe('capabilities', () => {
  it('exact-true leaves only; account and credentials never; the event and vault flags need both halves', () => {
    const x = parseTokenIntrospection(intro({ permissions: { ...PERMS, account: true, credentials: true, resources: { events: true, vault: true } }, event_access: true, vault_access: false }))!;
    const c = capsOf(x);
    expect(capsAllow(c, 'computers.read')).toBe(true);
    expect(capsAllow(c, 'computers.actions.start')).toBe(true);
    expect(capsAllow(c, 'computers.actions.stop')).toBe(false);
    expect(capsAllow(c, 'containers')).toBe(false);
    expect(capsAllow(c, 'account')).toBe(false);
    expect(capsAllow(c, 'credentials')).toBe(false);
    expect(capsAllow(c, 'events')).toBe(true);
    expect(capsAllow(c, 'vault')).toBe(false);
    expect(capsAllow(null, 'computers.read')).toBe(false);
    expect(minimumHeld(c)).toBe(true);
    expect(minimumHeld(capsOf(parseTokenIntrospection(intro({ permissions: { computers: { read: true } } }))))).toBe(false);
  });
  it('an account session can do everything', () => {
    boot();
    expect(can('account')).toBe(true);
    expect(can('computers.delete')).toBe(true);
  });
});

describe('boot of a token session', () => {
  it('check, then the owner identity on the pinned host: ready, identity, capabilities', async () => {
    const w = tokenTab(standard());
    expect(can('computers.read')).toBe(false); // nothing before the check
    const r = await bootLive();
    expect(r.state).toBe('ready');
    expect(calls.map((c) => c.url)).toEqual([expect.stringMatching(/^\/api\/v1\/auth\/tokens\/me$|\/api\/v1\/auth\/tokens\/me$/), expect.stringContaining(`${R1}.`)]);
    expect(calls[0]!.headers.authorization).toBe('Bearer ' + TOKEN);
    expect(identity()).toMatchObject({ id: UID, username: 'owner' });
    expect(can('computers.actions.start')).toBe(true);
    expect(can('computers.actions.stop')).toBe(false);
    expect(can('account')).toBe(false);
    expect(tokenInfo()).toEqual({ owner: { id: UID, username: 'owner' }, realm: R1, expiresAt: null, alias: 'shared-1', tokenId: 'tok1' });
    expect(w.navs).toEqual([]);
  });
  it.each([
    ['the token does not allow the pinned realm', standard(intro({ realm_ids: ['b'.repeat(24)] })), 'realm'],
    ['the token lacks the minimum', standard(intro({ permissions: { computers: { read: true } } })), 'invalid'],
    ['the token is gone (401)', (c: Call) => (isIntro(c) ? { status: 401, body: { error: 'UNAUTHORIZED' } } : undefined), 'ended'],
    ['the account is suspended', (c: Call) => (isIntro(c) ? { status: 403, body: { error: 'ACCOUNT_BANNED' } } : undefined), 'unavailable'],
    ['the identity is not the record owner', (c: Call) => (isIntro(c) ? { status: 200, body: intro() } : isMe(c) ? { status: 200, body: { data: { id: 'c'.repeat(24) } } } : undefined), 'invalid'],
  ] as const)('%s: purged, then sign-in with the reason', async (_n, on, reason) => {
    const w = tokenTab(on);
    expect(await bootLive()).toEqual({ state: 'leaving' });
    expect(localStorage.getItem('hub_token_session_v1')).toBeNull();
    expect(w.navs).toEqual(['/auth/login?error=shared_' + reason]);
  });
  it('IP_NOT_ALLOWED: the network panel, nothing purged, no navigation', async () => {
    const w = tokenTab((c) => (isIntro(c) ? { status: 403, body: { error: 'IP_NOT_ALLOWED' } } : undefined));
    expect(await bootLive()).toEqual({ state: 'offline', retryAfterS: undefined });
    expect(localStorage.getItem('hub_token_session_v1')).not.toBeNull();
    expect(w.navs).toEqual([]);
  });
  it('the check could not answer: the offline panel; a 429 holds later checks (busy, nothing sent)', async () => {
    tokenTab((c) => (isIntro(c) ? { status: 429, body: { error: 'RATE' }, headers: { 'retry-after': '20' } } : undefined));
    expect(await bootLive()).toEqual({ state: 'offline', retryAfterS: 20 });
    const n = calls.length;
    expect(await checkTokenSession()).toMatchObject({ r: 'busy' });
    expect(calls.length).toBe(n);
  });
  it('a server error: offline without a wait', async () => {
    tokenTab((c) => (isIntro(c) ? { status: 500, body: {} } : undefined));
    expect(await bootLive()).toEqual({ state: 'offline', retryAfterS: undefined });
  });
});

describe('mid-session', () => {
  it('a changed capability set is announced and re-renders useCan; the same set says nothing', async () => {
    let body: unknown = intro();
    const w = tokenTab((c) => (isIntro(c) ? { status: 200, body } : isMe(c) ? meOk : undefined));
    await bootLive();
    const seen: boolean[] = [];
    function Probe() { seen.push(useCan('computers.actions.stop')); return null; }
    render(<Probe />);
    await act(async () => { await checkTokenSession(); });
    expect(w.events.filter((e) => e.kind === 'token-notice')).toEqual([]);
    body = intro({ permissions: { ...PERMS, computers: { read: true, actions: { start: true, stop: true } } } });
    await act(async () => { await checkTokenSession(); });
    expect(w.events).toContainEqual({ kind: 'token-notice', notice: 'changed' });
    expect(seen.at(-1)).toBe(true);
  });
  it('INSUFFICIENT_PERMISSIONS of a read rechecks once and never notices (a read says it in place)', async () => {
    const w = tokenTab((c) => (c.url.includes('/computers') ? { status: 403, body: { error: 'INSUFFICIENT_PERMISSIONS' } } : standard()(c)));
    await bootLive();
    const intros = () => calls.filter(isIntro).length;
    const e1 = (await api(listRoute).catch((e: unknown) => e)) as { perm?: unknown };
    await settle();
    expect(intros()).toBe(2);
    expect(e1.perm).toBeNull();
    await api(listRoute).catch(() => null);
    await settle();
    expect(intros()).toBe(2);
    expect(w.events.filter((e) => e.kind === 'token-notice')).toEqual([]);
  });
  it('a 401 is verified by a check before anything ends: still valid → nothing ends', async () => {
    const w = tokenTab((c) => (c.url.includes('/computers') ? { status: 401, body: { error: 'UNAUTHORIZED' } } : standard()(c)));
    await bootLive();
    await api(listRoute).catch(() => null);
    await settle();
    expect(calls.filter(isIntro).length).toBe(2);
    expect(w.navs).toEqual([]);
  });
  it('a 401 the check confirms ends the session', async () => {
    let gone = false;
    const w = tokenTab((c) => (c.url.includes('/computers') ? { status: 401, body: {} } : isIntro(c) && gone ? { status: 401, body: {} } : standard()(c)));
    await bootLive();
    gone = true;
    await api(listRoute).catch(() => null);
    await settle();
    expect(w.navs).toEqual(['/auth/login?error=shared_ended']);
  });
  it('a 401 just after an ok recheck is checked at once, once per init; later ones wait for the bound (:1051)', async () => {
    const w = tokenTab((c) => (c.url.includes('/computers') ? { status: 401, body: {} } : standard()(c)));
    await bootLive();
    const intros = () => calls.filter(isIntro).length;
    await api(listRoute).catch(() => null);
    await settle();
    expect(intros()).toBe(2);
    await api(listRoute).catch(() => null);
    await settle();
    expect(intros()).toBe(3);
    await api(listRoute).catch(() => null);
    await settle();
    expect(intros()).toBe(3);
    expect(w.navs).toEqual([]);
  });
  it('a token that ended just after an ok recheck: the next 401 ends the session at once (:1051)', async () => {
    let gone = false;
    const w = tokenTab((c) => (c.url.includes('/computers') ? { status: 401, body: {} } : isIntro(c) && gone ? { status: 401, body: {} } : standard()(c)));
    await bootLive();
    await api(listRoute).catch(() => null);
    await settle();
    expect(w.navs).toEqual([]);
    gone = true;
    await api(listRoute).catch(() => null);
    await settle();
    expect(w.navs).toEqual(['/auth/login?error=shared_ended']);
  });
  it('another tab changed the session: reload, nothing purged', async () => {
    const w = tokenTab(standard());
    await bootLive();
    signIn();
    window.dispatchEvent(new StorageEvent('storage', { key: 'access_token' }));
    expect(w.navs).toEqual(['/auth/home']);
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });
  it('every end but Leave purges as expiry; Leave purges as a sign-out; neither removes a stored hold', async () => {
    for (const reason of ['ended', 'realm', 'unavailable', 'invalid', 'leave'] as const) {
      const w = tokenTab(standard());
      await bootLive();
      // The installed shared.js, whose purge runs the hooks core registered (a fresh loadShared() has none).
      const real = shared();
      const seen: unknown[] = [];
      installShared({ ...real, purgeOutgoingSession: (s, o) => { seen.push(o?.reason); return real.purgeOutgoingSession(s, o); } });
      const r = await holdAttempt('keys:create', { by: 'keys:create' });
      expect(r.ok).toBe(true);
      endTokenSession(reason);
      await settle();
      expect(w.navs).toHaveLength(1);
      expect(seen).toEqual([reason === 'leave' ? 'signout' : 'expiry']);
      // The real purge ran its hooks: every end keeps the owner's stored hold (only the warned forget removes one).
      const stored = () => (JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]') as Array<{ id: string }>).map((x) => x.id);
      await settle();
      expect(stored()).toEqual([r.ok && r.hold.id]);
      resetToken();
    }
  });
  it('a token end whose purge failed: the panel\'s Try again (logout()) ends again with the same reason, as expiry', async () => {
    const w = tokenTab(standard());
    await bootLive();
    const real = shared();
    let fail = true;
    const seen: unknown[] = [];
    installShared({ ...real, purgeOutgoingSession: (s, o) => { seen.push(o?.reason); return fail ? 'failed' : real.purgeOutgoingSession(s, o); } });
    endTokenSession('ended');
    expect(w.events).toContainEqual({ kind: 'token-panel', panel: 'purgeFailed', again: 'ended' });
    fail = false;
    logout();
    await settle();
    expect(seen).toEqual(['expiry', 'expiry']);
    expect(w.navs).toEqual(['/auth/login?error=shared_ended']);
  });
  it('a token Leave whose credential removal is refused; a sibling tab admits a hold; Try again keeps it', async () => {
    const w = tokenTab(standard());
    await bootLive();
    expect(identity()?.id).toBe(UID);
    // The real shared.js purge (its hooks run, uid = the token owner), whose token record stays readable: the
    // record is put back after it (a refused removal), so the purge answers 'failed' and holds the session still.
    let refuse = true;
    const real = shared();
    installShared({ ...real, purgeOutgoingSession: (s, o) => {
      const rec = localStorage.getItem('hub_token_session_v1');
      const r = real.purgeOutgoingSession(s, o);
      if (!refuse || rec === null) return r;
      localStorage.setItem('hub_token_session_v1', rec);
      return 'failed';
    } });
    endTokenSession('leave');
    expect(w.events).toContainEqual({ kind: 'token-panel', panel: 'purgeFailed', again: 'leave' });
    // Another tab of the same account (its storage session still stands) admits a hold meanwhile.
    const sibling = { id: ATTEMPT_PREFIX + UID + '\u0001keys:create\u0000' + 'b'.repeat(32), pending: true, key: 'hub-s', at: Date.now(), t: Date.now(), meta: { base: 'keys:create', target: null, realm: null, identity: null, by: 'keys:create' } };
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([sibling]));
    const stored = () => (JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) ?? '[]') as Array<{ id: string }>).map((x) => x.id);
    logout(); // the panel's Try again: the purge runs again, still refused
    await settle();
    expect(stored()).toEqual([sibling.id]);
    refuse = false;
    logout(); // Try again once more: purged, sign-in
    await settle();
    expect(w.navs).toEqual(['/auth/login']);
    expect(stored()).toEqual([sibling.id]);
  });
  it('Leave: purged, sign-in without a reason', async () => {
    const w = tokenTab(standard());
    await bootLive();
    endTokenSession('leave');
    expect(w.navs).toEqual(['/auth/login']);
    expect(localStorage.getItem('hub_token_session_v1')).toBeNull();
  });
  it('a purge that fails: the purge-failed panel, no navigation; its Retry ends again', async () => {
    const w = tokenTab(standard());
    await bootLive();
    const real = loadShared();
    let fail = true;
    installShared({ ...real, purgeOutgoingSession: (s, o) => (fail ? 'failed' : real.purgeOutgoingSession(s, o)) });
    endTokenSession('ended');
    expect(w.navs).toEqual([]);
    expect(w.events).toContainEqual({ kind: 'token-panel', panel: 'purgeFailed', again: 'ended' });
    fail = false;
    endTokenSession('ended');
    expect(w.navs).toEqual(['/auth/login?error=shared_ended']);
  });
  it('sign-out whose purge fails shows purge-failed; its Try again (logout) purges again', async () => {
    const w = tokenTab(standard());
    await bootLive();
    const real = loadShared();
    let fail = true, purges = 0;
    installShared({ ...real, purgeOutgoingSession: (s, o) => { purges++; return fail ? 'failed' : real.purgeOutgoingSession(s, o); } });
    logout({ minWaitMs: 0, endMs: 50 });
    for (let i = 0; i < 40 && !w.events.some((e) => e.kind === 'purge-failed'); i++) await settle();
    expect(w.events).toContainEqual({ kind: 'purge-failed' });
    expect(w.navs).toEqual([]);
    fail = false;
    logout({ minWaitMs: 0, endMs: 50 });
    for (let i = 0; i < 40 && !w.navs.length; i++) await settle();
    expect(purges).toBe(2);
    expect(w.navs).toEqual(['/auth/login']);
  });
  it('a warned sign-out whose forget lands after a sign-out began starts no second logout(), so a failed purge is not retried behind the person', async () => {
    const w = tokenTab(standard());
    await bootLive();
    const real = loadShared();
    let purges = 0;
    installShared({ ...real, purgeOutgoingSession: () => { purges++; return 'failed'; } });
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    void (navigator as unknown as { locks: { request: (n: string, cb: () => Promise<void>) => Promise<void> } }).locks.request('hub_changes', () => gate);
    const forget = signOutForgetting(UID, signOutHolds(), { minWaitMs: 0, endMs: 50 }); // waits for the store lock
    logout({ minWaitMs: 0, endMs: 50 });
    for (let i = 0; i < 40 && !w.events.some((e) => e.kind === 'purge-failed'); i++) await settle();
    expect(purges).toBe(1);
    open();
    expect(await forget).toBe('done');
    await settle(10);
    expect(purges).toBe(1); // the purge-failed panel's Try again stays the person's
    expect(w.navs).toEqual([]);
  });
});

describe('timers', () => {
  it('a notice 24 h before the end, and the expiry check at expires_at + 5 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t0 = Date.now();
    const exp = new Date(t0 + 25 * 3600000).toISOString();
    let expired = false;
    const w = tokenTab((c) => (isIntro(c) ? (expired ? { status: 401, body: {} } : { status: 200, body: intro({ expires_at: exp }) }) : isMe(c) ? meOk : undefined));
    const p = bootLive();
    await vi.advanceTimersByTimeAsync(10);
    expect((await p).state).toBe('ready');
    await vi.advanceTimersByTimeAsync(3600000 + 10);
    expect(w.events).toContainEqual({ kind: 'token-notice', notice: 'ending', leftMs: expect.any(Number) });
    expired = true;
    await vi.advanceTimersByTimeAsync(24 * 3600000 + 5000);
    expect(w.navs).toEqual(['/auth/login?error=shared_ended']);
  });

  describe('a hidden page', () => {
    const MIN = 60000;
    let vis: 'visible' | 'hidden' = 'visible';
    const setVisibility = (v: 'visible' | 'hidden', fire = true): void => {
      vis = v;
      if (fire) document.dispatchEvent(new Event('visibilitychange'));
    };
    function hiddenTab() {
      vis = 'visible';
      const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => vis);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      const exp = new Date(Date.now() + 60 * MIN).toISOString();
      let looks = 0;
      const w = tokenTab((c) => (isIntro(c) ? (looks++, { status: 200, body: intro({ expires_at: exp }) }) : isMe(c) ? meOk : undefined));
      return { w, spy, looks: () => looks };
    }

    it('does not re-arm the expiry check; showing it again checks once the last check is 5 minutes old', async () => {
      const { spy, looks } = hiddenTab();
      try {
        const p = bootLive();
        await vi.advanceTimersByTimeAsync(10);
        expect((await p).state).toBe('ready');
        setVisibility('hidden', false);
        await vi.advanceTimersByTimeAsync(60 * MIN + 5000 + 10);
        const afterCheck = looks();
        await vi.advanceTimersByTimeAsync(30 * MIN);
        expect(looks()).toBe(afterCheck);
        setVisibility('hidden');
        await vi.advanceTimersByTimeAsync(10);
        expect(looks()).toBe(afterCheck);
        setVisibility('visible');
        await vi.advanceTimersByTimeAsync(10);
        expect(looks()).toBe(afterCheck + 1);
      } finally { spy.mockRestore(); }
    });

    it('shown again within 5 minutes of the last check: no check now, one at the 5-minute floor', async () => {
      const { spy, looks } = hiddenTab();
      try {
        const p = bootLive();
        await vi.advanceTimersByTimeAsync(10);
        expect((await p).state).toBe('ready');
        setVisibility('hidden', false);
        await vi.advanceTimersByTimeAsync(60 * MIN + 5000 + 10);
        const afterCheck = looks();
        await vi.advanceTimersByTimeAsync(MIN);
        setVisibility('visible');
        await vi.advanceTimersByTimeAsync(10);
        expect(looks()).toBe(afterCheck);
        await vi.advanceTimersByTimeAsync(5 * MIN);
        expect(looks()).toBe(afterCheck + 1);
      } finally { spy.mockRestore(); }
    });
  });
});
