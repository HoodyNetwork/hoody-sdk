// core's Shared served by the CLI client (client-shared.ts): the session it reports, one API call through the client,
// and a purge that runs the hooks, clears the registered purge keys of the session stores and signs this Shared out
// without touching the CLI; a Shared kept past its own session is dead, whatever session is current.
// Liveness reaches the wire (beforeWire before EVERY attempt, the session generation, the
// mount's signal; the send note only when the request really goes out), an answered 401 on an account session after boot
// purges ('expiry': core then ends the mount), the client's auth-ended notice for this sid does too, a token session's
// 401 is left to core, and endOutgoingSession is the named not-designed no-op.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetHostEnvForTests } from '../../core/host-env';
import { beginTermSession, currentTermSession, installTermEnv, termHostEnv, type TermSession } from './session';
import { clientShared, endOutgoingSessionNotDesigned } from './client-shared';
import type { HoodyClient } from '../host-types';

/** A conforming client (host-types ClientCallControls): beforeWire right before the (only) wire attempt, nothing sent
 *  when it answers false; records what went out and answers 404. */
function fakeClient(): HoodyClient & { calls: Array<{ method: string; path: string }> } {
  const calls: Array<{ method: string; path: string }> = [];
  return {
    calls,
    identity: { kind: 'account', uid: 'u1', sid: 's-u1' },
    realmApiDomain: 'api.example.invalid',
    request(method, path, _b, o) {
      if (!o.beforeWire()) return Promise.reject({ status: 0, notSent: true, stale: true });
      calls.push({ method, path });
      return Promise.reject({ status: 404 });
    },
    fetch(url) { calls.push({ method: 'FETCH', path: url }); return Promise.resolve(new Response('{}', { status: 404 })); },
  };
}

let own: TermSession;
beforeEach(() => {
  resetHostEnvForTests({ unresolved: true });
  installTermEnv();
  own = beginTermSession();
});
afterEach(() => {
  currentTermSession()?.end();
  resetHostEnvForTests();
});
// The rest of the process gets the terminal env back (what the test preload installed): the afterEach above leaves core
// on the browser path, and the next file in a shared process then read window.navigator and indexedDB through it
// (trap-journal, strict-probes.alerts-wipe and upload-engine were red after this file, green alone).
afterAll(() => { resetHostEnvForTests({ unresolved: true }); installTermEnv(); });

const me = { kind: 'account' as const, uid: 'u1', sid: 's-u1' };

describe('the session it reports', () => {
  it('is the client identity, with a marker in place of a bearer token', () => {
    const s = clientShared(fakeClient(), own).storedSession();
    expect(s).toMatchObject(me);
    expect(s?.bearer).toBe('term-session:s-u1');
  });

  it('holds only the client identity', () => {
    const sh = clientShared(fakeClient(), own);
    expect(sh.holdsSession(me)).toBe(true);
    expect(sh.holdsSession({ ...me, sid: 'other' })).toBe(false);
    expect(sh.holdsIdentity({ ...me, uid: 'u2' })).toBe(false);
  });

  it('is never framed and has the client realm domain', () => {
    const sh = clientShared(fakeClient(), own);
    expect(sh.isFramedPage()).toBe(false);
    expect(sh.realmApiDomain()).toBe('api.example.invalid');
  });
});

describe('API calls', () => {
  it('go to client.request with the method, path, body and the If-Match/ETag options', async () => {
    const c = fakeClient();
    const seen: unknown[] = [];
    c.request = (method, path, body, o) => { o.beforeWire(); seen.push({ method, path, body, ifMatch: o.ifMatch, base: o.base }); return Promise.resolve({ data: 1 }); };
    const r = await clientShared(c, own).apiCall('PUT', '/x', { a: 1 }, null, undefined, { ifMatch: '"e1"', base: 'https://r.example.invalid' });
    expect(r).toEqual({ data: 1 });
    expect(seen).toEqual([{ method: 'PUT', path: '/x', body: { a: 1 }, ifMatch: '"e1"', base: 'https://r.example.invalid' }]);
  });

  it('pass If-None-Match: * on to client.request, and nothing for a call without it', async () => {
    const c = fakeClient();
    const seen: unknown[] = [];
    c.request = (_m, _p, _b, o) => { o.beforeWire(); seen.push(o.ifNoneMatch); return Promise.resolve({}); };
    const sh = clientShared(c, own);
    await sh.apiCall('PUT', '/x', { a: 1 }, null, undefined, { ifNoneMatch: '*' });
    await sh.apiCall('PUT', '/x', { a: 1 }, null, undefined, {});
    expect(seen).toEqual(['*', undefined]);
  });

  it('for another session are refused without a call', async () => {
    const c = fakeClient();
    await expect(clientShared(c, own).apiCall('GET', '/x', undefined, null, undefined, { session: { ...me, sid: 'other' } })).rejects.toMatchObject({ status: 401, notSent: true });
    expect(c.calls).toEqual([]);
  });
});

describe('a call the mount\'s send policy never saw', () => {
  it('is put to the mount: a refusal is its answer and nothing is sent; none lets it go; a wired call is not asked', async () => {
    const c = fakeClient();
    const asked: string[] = [];
    let refuse = true;
    const s = clientShared(c, own, undefined, { unwired: (method, path) => { asked.push(`${method} ${path}`); return refuse ? { status: 0, notSent: true, code: 'TERM_READ_ONLY' } : null; } });
    await expect(s.apiCall('POST', '/auth/forgot-password', { email: 'a@example.com' }, undefined, undefined, {})).rejects.toMatchObject({ notSent: true, code: 'TERM_READ_ONLY' });
    expect(c.calls).toEqual([]);
    refuse = false;
    await expect(s.apiCall('POST', '/auth/forgot-password', { email: 'a@example.com' }, undefined, undefined, {})).rejects.toMatchObject({ status: 404 });
    expect(c.calls).toEqual([{ method: 'POST', path: '/auth/forgot-password' }]);
    refuse = true;
    await expect(s.apiCall('POST', '/x', {}, undefined, undefined, { wire: () => true } as never)).rejects.toMatchObject({ status: 404 });
    expect(asked).toEqual(['POST /auth/forgot-password', 'POST /auth/forgot-password']);
  });
});

describe('a purge', () => {
  it('runs the hooks with the reason and the outgoing uid, then signs this Shared out: no session, calls refused unsent', async () => {
    const c = fakeClient();
    const sh = clientShared(c, own);
    const seen: unknown[] = [];
    sh.onBeforeAuthPurge((info) => { seen.push(info); });
    sh.clearAuthTokens({ reason: 'signout' });
    expect(seen).toEqual([{ reason: 'signout', uid: 'u1' }]);
    expect(sh.storedSession()).toBeNull();
    expect(sh.readAccessToken?.()).toBeNull();
    await expect(sh.apiCall('GET', '/x', undefined, null, undefined, {})).rejects.toMatchObject({ status: 401, notSent: true });
    expect(c.calls).toEqual([]);
  });

  it('clears the registered purge keys of the session stores and keeps the others', () => {
    const local = termHostEnv().local!;
    local.setItem('access_token', 'x');
    local.setItem('hub_auth_rev', '3');
    local.setItem('not-registered', 'y');
    clientShared(fakeClient(), own).clearAuthTokens({ reason: 'signout' });
    expect([local.getItem('access_token'), local.getItem('hub_auth_rev'), local.getItem('not-registered')]).toEqual([null, '3', 'y']);
  });

  it('purgeOutgoingSession purges only the session it holds', () => {
    const sh = clientShared(fakeClient(), own);
    expect(sh.purgeOutgoingSession({ ...me, sid: 'other' })).toBe('kept');
    expect(sh.storedSession()).not.toBeNull();
    expect(sh.purgeOutgoingSession(me, { reason: 'signout' })).toBe('purged');
    expect(sh.storedSession()).toBeNull();
  });
});

describe('the owning session', () => {
  it('a caller that went stale is refused unsent', async () => {
    const c = fakeClient();
    await expect(clientShared(c, own).apiCall('GET', '/x', undefined, null, undefined, { alive: () => false })).rejects.toMatchObject({ status: 0, notSent: true, stale: true });
    expect(c.calls).toEqual([]);
  });

  it('a call onSend makes stale, or whose session onSend ends, is refused before the client sends it', async () => {
    const c = fakeClient();
    let alive = true;
    await expect(clientShared(c, own).apiCall('GET', '/x', undefined, null, undefined, { alive: () => alive, onSend: () => { alive = false; } })).rejects.toMatchObject({ status: 0, notSent: true, stale: true });
    const sh = clientShared(c, own);
    await expect(sh.apiCall('GET', '/y', undefined, null, undefined, { onSend: () => { own.end(); } })).rejects.toMatchObject({ notSent: true });
    expect(c.calls).toEqual([]);
  });

  it('a Shared kept past its session reports nothing and sends nothing, even with a new session open', async () => {
    const c = fakeClient();
    const old = clientShared(c, own);
    own.end();
    beginTermSession();
    expect(old.storedSession()).toBeNull();
    expect(old.readAccessToken?.()).toBeNull();
    expect(old.holdsSession(me)).toBe(false);
    await expect(old.apiCall('GET', '/x', undefined, null, undefined, {})).rejects.toMatchObject({ status: 401, notSent: true });
    expect(c.calls).toEqual([]);
  });

  it('a purge through a kept Shared runs no hook and leaves the next session\'s stores alone', () => {
    const old = clientShared(fakeClient(), own);
    const seen: unknown[] = [];
    old.onBeforeAuthPurge((info) => { seen.push(info); });
    own.end();
    beginTermSession();
    termHostEnv().local!.setItem('access_token', 'next');
    old.clearAuthTokens({ reason: 'signout' });
    expect(old.purgeOutgoingSession(me, { reason: 'signout' })).toBe('kept');
    expect(seen).toEqual([]);
    expect(termHostEnv().local!.getItem('access_token')).toBe('next');
  });
});

describe('liveness at the wire', () => {
  it('beforeWire runs before every attempt; the send note fires once, on the first attempt that goes out', async () => {
    const c = fakeClient();
    let sends = 0;
    let attempts = 0;
    c.request = async (_m, _p, _b, o) => {
      // A refresh that failed before the request went out: no beforeWire yet, so nothing was sent.
      expect(sends).toBe(0);
      for (let i = 0; i < 3; i++) { if (!o.beforeWire()) throw { status: 0, notSent: true, stale: true }; attempts++; }
      return { ok: 1 };
    };
    await clientShared(c, own).apiCall('POST', '/x', {}, null, undefined, { onSend: () => { sends++; } });
    expect(attempts).toBe(3);
    expect(sends).toBe(1);
  });

  it('a purge between attempts stops the next one: generation captured, signal aborted', async () => {
    const c = fakeClient();
    let gen = -1;
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const tries: boolean[] = [];
    let sig: AbortSignal | null = null;
    c.request = async (_m, _p, _b, o) => {
      gen = o.session.generation; sig = o.signal;
      tries.push(o.beforeWire());
      await held; // the client waits for a token refresh
      tries.push(o.beforeWire());
      throw { status: 0, notSent: true, stale: true };
    };
    const sh = clientShared(c, own);
    const call = sh.apiCall('PUT', '/x', {}, null, undefined, {});
    await Promise.resolve();
    sh.clearAuthTokens({ reason: 'signout' });
    release();
    await expect(call).rejects.toMatchObject({ notSent: true });
    expect(gen).toBe(0);
    expect(tries).toEqual([true, false]);
    expect(sig!.aborted).toBe(true);
  });

  it('the mount signal reaches the client and stops it', async () => {
    const c = fakeClient();
    const mount = new AbortController();
    let seen: AbortSignal | null = null;
    c.request = (_m, _p, _b, o) => { seen = o.signal; return new Promise((_r, rej) => o.signal.addEventListener('abort', () => rej({ status: 0, stale: true }))); };
    const call = clientShared(c, own, mount.signal).apiCall('GET', '/x', undefined, null, undefined, {});
    mount.abort();
    await expect(call).rejects.toMatchObject({ stale: true });
    expect(seen!.aborted).toBe(true);
  });

  it('the session it captured is passed: sid and generation', async () => {
    const c = fakeClient();
    let got: unknown = null;
    c.request = (_m, _p, _b, o) => { got = o.session; return Promise.resolve({}); };
    await clientShared(c, own).apiCall('GET', '/x', undefined, null, undefined, {});
    expect(got).toEqual({ sid: 's-u1', generation: 0 });
  });
});

describe('account end after boot', () => {
  it('an answered 401 on an account session purges with expiry (core then leaves for sign-in); a 401 that was not sent does not', async () => {
    const c = fakeClient();
    const sh = clientShared(c, own);
    const seen: unknown[] = [];
    sh.onBeforeAuthPurge((i) => { seen.push(i?.reason); });
    c.request = (_m, _p, _b, o) => { o.beforeWire(); return Promise.reject({ status: 0, notSent: true }); };
    await expect(sh.apiCall('GET', '/a', undefined, null, undefined, {})).rejects.toBeDefined();
    expect(seen).toEqual([]);
    c.request = (_m, _p, _b, o) => { o.beforeWire(); return Promise.reject({ status: 403, code: 'ACCOUNT_BANNED' }); };
    await expect(sh.apiCall('GET', '/b', undefined, null, undefined, {})).rejects.toMatchObject({ code: 'ACCOUNT_BANNED' });
    expect(seen).toEqual([]); // core's suspend path, not a purge
    c.request = (_m, _p, _b, o) => { o.beforeWire(); return Promise.reject({ status: 401, code: 'UNAUTHORIZED' }); };
    await expect(sh.apiCall('GET', '/c', undefined, null, undefined, {})).rejects.toMatchObject({ status: 401 });
    expect(seen).toEqual(['expiry']);
    expect(sh.storedSession()).toBeNull();
  });

  it('a 401 that refuses what was typed keeps the session: a wrong code by its code, a request carrying a password or a code whatever the code', async () => {
    const c = fakeClient();
    const ended: unknown[] = [];
    const sh = clientShared(c, own, undefined, { purged: (r) => ended.push(r) });
    for (const [method, path, body, refusal] of [
      ['POST', '/users/auth/2fa/verify-setup', { code: '000000' }, { status: 401, code: 'INVALID_OTP_CODE', data: { attempts_remaining: 4 } }],
      ['POST', '/users/auth/2fa/setup', { password: 'wrong' }, { status: 401, code: 'INVALID_TOKEN' }],
      ['DELETE', '/users/auth/2fa', { password: 'wrong', code: '123456' }, { status: 401, code: 'INVALID_TOKEN' }],
      ['POST', '/auth/tokens', { alias: 'x', otp_code: '000000' }, { status: 401, code: 'INVALID_OTP_CODE' }],
      // A code of the route's own on a request that carries nothing typed.
      ['POST', '/x', { a: 1 }, { status: 401, code: 'INVALID_OTP_CODE' }],
    ] as const) {
      c.request = (_m, _p, _b, o) => { o.beforeWire(); return Promise.reject(refusal); };
      await expect(sh.apiCall(method, path, body, null, undefined, {})).rejects.toMatchObject(refusal);
      expect(ended).toEqual([]);
      expect(sh.storedSession()).not.toBeNull();
    }
    // The session's own 401 on a call that carries nothing typed still ends it.
    c.request = (_m, _p, _b, o) => { o.beforeWire(); return Promise.reject({ status: 401, code: 'INVALID_TOKEN' }); };
    await expect(sh.apiCall('GET', '/users/auth/2fa/status', undefined, null, undefined, {})).rejects.toMatchObject({ status: 401 });
    expect(ended).toEqual(['expiry']);
  });

  it('a reissued pair goes to the client, only for the live account session it serves; nothing of it stays here', () => {
    const pair = { token: 'a.b.c', refreshToken: 'd.e.f', session_id: 's-u1' };
    const got: unknown[] = [];
    const c = { ...fakeClient(), adoptSession: (p: unknown) => { got.push(p); return true; } };
    const sh = clientShared(c, own);
    expect(sh.adoptReissuedSession(pair, 'someone-else')).toBe(false);
    expect(sh.adoptReissuedSession(null, 'u1')).toBe(false);
    expect(got).toEqual([]);
    expect(sh.adoptReissuedSession(pair, 'u1')).toBe(true);
    expect(got).toEqual([pair]);
    // The client's own answer is the answer; a throw is "not adopted".
    expect(clientShared({ ...fakeClient(), adoptSession: () => false }, own).adoptReissuedSession(pair, 'u1')).toBe(false);
    expect(clientShared({ ...fakeClient(), adoptSession: () => { throw new Error('x'); } }, own).adoptReissuedSession(pair, 'u1')).toBe(false);
    // A client with no way to take one, a token session, and a session that ended.
    expect(clientShared(fakeClient(), own).adoptReissuedSession(pair, 'u1')).toBe(false);
    expect(clientShared({ ...c, identity: { kind: 'token' as const, uid: 'u1', sid: 's-t', realm: 'r1' } }, own).adoptReissuedSession(pair, 'u1')).toBe(false);
    sh.clearAuthTokens({ reason: 'signout' });
    expect(sh.adoptReissuedSession(pair, 'u1')).toBe(false);
    expect(got).toEqual([pair]);
    expect(sh.storedSession()).toBeNull();
  });

  it('a token session 401 is left to core (introspection): no purge here', async () => {
    const c = { ...fakeClient(), identity: { kind: 'token' as const, uid: 'u1', sid: 's-t', realm: 'r1' } };
    c.request = (_m, _p, _b, o) => { o.beforeWire(); return Promise.reject({ status: 401 }); };
    const sh = clientShared(c, own);
    const seen: unknown[] = [];
    sh.onBeforeAuthPurge((i) => { seen.push(i?.reason); });
    await expect(sh.apiCall('GET', '/x', undefined, null, undefined, {})).rejects.toMatchObject({ status: 401 });
    expect(seen).toEqual([]);
  });

  it('the client auth-ended notice purges only its own sid, and is dropped when the mount ends', () => {
    let cb: ((e: { sid: string; reason: 'expired' | 'signed-out' | 'revoked' }) => void) | null = null;
    let offs = 0;
    const c: HoodyClient = { ...fakeClient(), onAuthEnded: (f) => { cb = f; return () => { offs++; cb = null; }; } };
    const mount = new AbortController();
    const sh = clientShared(c, own, mount.signal);
    const seen: unknown[] = [];
    sh.onBeforeAuthPurge((i) => { seen.push(i?.reason); });
    cb!({ sid: 'someone-else', reason: 'expired' });
    expect(seen).toEqual([]);
    cb!({ sid: 's-u1', reason: 'signed-out' });
    expect(seen).toEqual(['signout']);
    mount.abort();
    expect(offs).toBe(1);
  });
});

describe('sign-out revocation', () => {
  it('endOutgoingSession is the named not-designed no-op', async () => {
    const sh = clientShared(fakeClient(), own);
    expect(sh.endOutgoingSession).toBe(endOutgoingSessionNotDesigned);
    await expect(sh.endOutgoingSession(me)).resolves.toBeUndefined();
  });
});

describe('the wire check after onSend', () => {
  it('a mount gate closed inside onSend refuses that same attempt', async () => {
    const c = fakeClient();
    const mount = new AbortController();
    const sh = clientShared(c, own, mount.signal);
    await expect(sh.apiCall('POST', '/x', {}, null, undefined, { onSend: () => { mount.abort(); } })).rejects.toMatchObject({ notSent: true });
    expect(c.calls).toEqual([]);
  });
  it("the call's own ended signal (boot.live fence.run) aborts the client's signal", async () => {
    const ended = new AbortController();
    let seen: AbortSignal | null = null;
    const c: HoodyClient = { ...fakeClient(), request(_m, _p, _b, o) { seen = o.signal; return new Promise(() => {}); } };
    void clientShared(c, own).apiCall('GET', '/x', undefined, null, undefined, { signal: ended.signal } as never);
    expect(seen!.aborted).toBe(false);
    ended.abort();
    expect(seen!.aborted).toBe(true);
  });
});
