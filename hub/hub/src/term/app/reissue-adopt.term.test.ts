// Turning 2FA on or off ends every session and answers a fresh pair for this one. In the terminal that answer goes
// through core's api() with the strict globals in place (no navigator), so the pair must reach the client without
// any browser global being read: the lock manager is the host's (hostEnv().locks, here the session's own).
// A fake client: no real API, no credential.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | POST /users/auth/2fa/verify-setup through api(): resolves, the client's adoptSession gets the pair once, no trapped global is read, the answer's copies of the pair are nulled, and it ran inside the 'hoody-auth-refresh' lock of the session's lock manager | 'turn on adopts under the traps' |
// | 2 | DELETE /users/auth/2fa the same | 'turn off adopts under the traps' |
// | 3 | A host whose lock manager cannot take a request: the pair is still adopted, no trap | 'no lock manager still adopts' |
import { afterEach, expect, test } from 'bun:test';
import { api } from '../../core/api';
import { hostEnv } from '../../core/host-env';
import { turnOffRoute, verifySetupRoute } from '../../core/twofa';
import { activeStrictGlobals } from '../env/strict-globals';
import { beginTermSession } from '../env/session';
import type { HoodyClient } from '../host-types';
import { liveBoot } from './boot.live';

const UID = '64f0ada00000000000000001';
const PAIR = { token: 'new-access', refreshToken: 'new-refresh', session_id: 's2' };

const openSessions: Array<ReturnType<typeof beginTermSession>> = [];
const openBoots: Array<ReturnType<typeof liveBoot>> = [];
let restoreEnv: (() => void) | null = null;
afterEach(async () => {
  restoreEnv?.(); restoreEnv = null;
  for (const b of openBoots.splice(0)) await b.dispose('term-abort').catch(() => {});
  for (const s of openSessions.splice(0)) s.end();
});

function fake() {
  const adopted: unknown[] = [];
  const sent: string[] = [];
  const answers: Record<string, () => unknown> = {
    'GET /users/auth/me': () => ({ data: { id: UID, username: 'ada', email: 'ada@example.com' } }),
    'GET /realms': () => ({ data: { realm_ids: [] } }),
    'GET /vault/keys/hoody.realm-aliases': () => ({ data: { value: '{}' } }),
    'POST /users/auth/2fa/verify-setup': () => ({ data: { enabled: true, sessions_revoked: 2, ...PAIR } }),
    'DELETE /users/auth/2fa': () => ({ data: { enabled: false, sessions_revoked: 2, ...PAIR } }),
  };
  const client: HoodyClient = {
    identity: { kind: 'account', uid: UID, sid: 's1' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realm.invalid',
    request: (method, path, _b, o) => {
      const k = `${method} ${path.split('?')[0]}`;
      const a = answers[k];
      if (!a) return Promise.reject({ status: 404, code: 'NOT_FOUND' });
      if (!o.beforeWire()) return Promise.reject({ status: 0, notSent: true });
      sent.push(k);
      return Promise.resolve(a());
    },
    fetch: () => Promise.reject({ status: 0, notSent: true }),
    adoptSession: (pair) => { adopted.push({ ...pair }); return true; },
  };
  return { client, adopted, sent };
}

async function boot(client: HoodyClient) {
  const session = beginTermSession(); openSessions.push(session);
  const b = liveBoot(client, { profile: 'test', realmId: 'all' }, () => '/'); openBoots.push(b);
  await b.start(session, () => {});
}

/** The session's lock manager, with every request name recorded. */
function watchLocks(): string[] {
  const names: string[] = [];
  const locks = hostEnv().locks as unknown as { request: (...a: unknown[]) => Promise<unknown> };
  const own = locks.request;
  locks.request = function (this: unknown, ...a: unknown[]) { names.push(String(a[0])); return own.apply(this, a); };
  const prev = restoreEnv;
  restoreEnv = () => { locks.request = own; prev?.(); };
  return names;
}

test('turn on adopts under the traps', async () => {
  const { client, adopted, sent } = fake();
  await boot(client);
  const sg = activeStrictGlobals();
  expect(sg).not.toBeNull();
  sg!.clear();
  const names = watchLocks();
  const res = await api(verifySetupRoute, { body: { code: '123456' } }) as { data: Record<string, unknown> };
  expect(sent).toContain('POST /users/auth/2fa/verify-setup');
  expect(adopted).toEqual([PAIR]);
  expect(names).toContain('hoody-auth-refresh');
  expect(res.data.token).toBeNull();
  expect(res.data.refreshToken).toBeNull();
  expect(sg!.ledger().map((r) => r.name)).toEqual([]);
});

test('turn off adopts under the traps', async () => {
  const { client, adopted, sent } = fake();
  await boot(client);
  const sg = activeStrictGlobals()!;
  sg.clear();
  const names = watchLocks();
  await api(turnOffRoute, { body: { password: 'a-password', code: '123456' } });
  expect(sent).toContain('DELETE /users/auth/2fa');
  expect(adopted).toEqual([PAIR]);
  expect(names).toContain('hoody-auth-refresh');
  expect(sg.ledger().map((r) => r.name)).toEqual([]);
});

test('no lock manager still adopts', async () => {
  const { client, adopted } = fake();
  await boot(client);
  const locks = hostEnv().locks as unknown as { request?: unknown };
  const own = locks.request;
  locks.request = undefined;
  restoreEnv = () => { locks.request = own; };
  const sg = activeStrictGlobals()!;
  sg.clear();
  await api(verifySetupRoute, { body: { code: '123456' } });
  expect(adopted).toEqual([PAIR]);
  expect(sg.ledger().map((r) => r.name)).toEqual([]);
});
