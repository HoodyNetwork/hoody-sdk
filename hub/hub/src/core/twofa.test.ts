// twofa.test.ts: a declared DELETE body (turning 2FA off) and the reissued session pair (2FA on/off).
import { describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { bump } from './ctx';
import { defineRoute } from './routes';
import { boot, calls, onFetch, OTHER, sessionToken, settle, UID } from './test/env';
import { turnOffRoute, verifySetupRoute } from './twofa';

const SID = 'sid0000000000001';
const pair = (uid: string, sid: string) => ({
  token: sessionToken(uid, { sid, exp: Math.floor(Date.now() / 1000) + 3600, n: 2 }),
  refreshToken: sessionToken(uid, { sid, exp: Math.floor(Date.now() / 1000) + 86400, n: 2 }),
  session_id: sid, sessions_revoked: true,
});
const outcome = (p: Promise<unknown>) => p.then((v) => v, (e: HubError) => e);

describe('DELETE with a body: only a Hoody API route that declares it', () => {
  it('defineRoute still refuses a body on GET, HEAD and an agent or kit DELETE', () => {
    expect(() => defineRoute({ method: 'GET', path: '/x-get', scope: 'base', body: ['a'] })).toThrow(/body on GET/);
    expect(() => defineRoute({ method: 'HEAD', path: '/x-head', scope: 'base', body: ['a'] })).toThrow(/body on HEAD/);
    expect(() => defineRoute({ method: 'DELETE', path: '/x-agent', scope: 'agent', body: ['a'] })).toThrow(/body on DELETE/);
  });
  it('a DELETE that declares no body refuses one unsent', async () => {
    boot();
    const del = defineRoute({ method: 'DELETE', path: '/projects/:id', scope: 'base' });
    expect(await outcome(api(del, { params: { id: 'p1' }, body: { x: 1 } as never }))).toMatchObject({ code: 'ROUTE_BODY' });
    expect(calls).toHaveLength(0);
  });
  it('turning 2FA off sends DELETE with its JSON body to the base host; other keys are refused', async () => {
    boot();
    onFetch(() => ({ status: 200, body: { data: {} } }));
    await api(turnOffRoute, { body: { password: 'pw-1', code: '123456' } });
    expect(calls[0]).toMatchObject({ method: 'DELETE', body: { password: 'pw-1', code: '123456' } });
    expect(calls[0]!.url).toMatch(/\/api\/v1\/users\/auth\/2fa$/);
    expect(await outcome(api(turnOffRoute, { body: { password: 'p', code: '1', extra: 1 } as never }))).toMatchObject({ code: 'ROUTE_BODY' });
  });
  it('reissues is for base POST/DELETE only', () => {
    expect(() => defineRoute({ method: 'GET', path: '/x-r1', scope: 'base', reissues: true })).toThrow(/reissues/);
    expect(() => defineRoute({ method: 'POST', path: '/x-r2', scope: 'realm', body: [], reissues: true })).toThrow(/reissues/);
  });
});

describe('reissued session pair (2FA on/off revoke every session)', () => {
  it('the same account and session: the fresh pair is stored and the answer keeps no copy', async () => {
    boot();
    const p = pair(UID, SID);
    onFetch(() => ({ status: 200, body: { data: p } }));
    const r = await api(verifySetupRoute, { body: { code: '123456' } });
    expect(localStorage.getItem('access_token')).toBe(p.token);
    expect(localStorage.getItem('refresh_token')).toBe(p.refreshToken);
    expect(r.data).toMatchObject({ token: null, refreshToken: null, sessions_revoked: true });
  });
  it('another account or another session is never adopted; the answer is still wiped', async () => {
    for (const p of [pair(OTHER, SID), pair(UID, 'sid0000000000009')]) {
      boot();
      const before = localStorage.getItem('access_token');
      onFetch(() => ({ status: 200, body: { data: p } }));
      const r = await api(turnOffRoute, { body: { password: 'pw', code: '1' } });
      expect(localStorage.getItem('access_token')).toBe(before);
      expect(r.data).toMatchObject({ token: null, refreshToken: null });
    }
  });
  it('an answer after its context died is still adopted (the change went through: pending)', async () => {
    boot();
    const p = pair(UID, SID);
    let release!: () => void;
    onFetch(() => new Promise((res) => { release = () => res({ status: 200, body: { data: p } }); }));
    const run = outcome(api(verifySetupRoute, { body: { code: '1' } }));
    await settle();
    bump('test');
    release();
    expect(await run).toMatchObject({ kind: 'pending' });
    expect(localStorage.getItem('access_token')).toBe(p.token);
  });
});

describe('adoption takes the cross-tab auth lock', () => {
  it('adopts inside the hoody-auth-refresh lock, checking storage again there: a sign-in meanwhile is never overwritten', async () => {
    boot();
    const p = pair(UID, SID);
    const held: Array<() => void> = [];
    const names: string[] = [];
    const nav = globalThis.navigator as unknown as { locks?: unknown };
    const had = Object.getOwnPropertyDescriptor(nav, 'locks');
    Object.defineProperty(nav, 'locks', { configurable: true, value: { request: (name: string, cb: () => unknown) => { names.push(name); return new Promise((res) => { held.push(() => res(cb())); }); } } });
    try {
      onFetch(() => ({ status: 200, body: { data: p } }));
      const run = outcome(api(verifySetupRoute, { body: { code: '123456' } }));
      for (let i = 0; i < 10 && !held.length; i++) await settle();
      expect(names).toEqual(['hoody-auth-refresh']);
      // Not adopted before the lock is ours; another sign-in of the same user (another sid) lands meanwhile.
      expect(localStorage.getItem('access_token')).not.toBe(p.token);
      const other = sessionToken(UID, { sid: 'sid0000000000002' });
      localStorage.setItem('access_token', other);
      localStorage.setItem('refresh_token', sessionToken(UID, { sid: 'sid0000000000002' }));
      held.forEach((f) => f());
      // The sign-in ended this page's context: the change went through, so it reads pending.
      expect(await run).toMatchObject({ kind: 'pending' });
      expect(localStorage.getItem('access_token')).toBe(other);
    } finally {
      if (had) Object.defineProperty(nav, 'locks', had); else delete nav.locks;
    }
  });
});
