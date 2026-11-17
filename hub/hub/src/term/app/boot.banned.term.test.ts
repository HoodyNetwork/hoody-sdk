// An account that is banned at launch: GET /users/auth/me answers is_banned true, core's bootLive returns `banned`.
// The mount still ends (the terminal has no in-place suspended screen), but it ends as SUSPENDED, never as a failed boot:
// the boot reports suspended(), endReasonOf maps it, and the one line left in the terminal names the suspension.
import { afterEach, expect, test } from 'bun:test';
import { beginTermSession } from '../env/session';
import type { HoodyClient } from '../host-types';
import { liveBoot } from './boot.live';
import { endReasonOf, type TermHubEnd } from './lifecycle';
import { failureText } from '../entry.live';

const opened: Array<{ end: () => void }> = [];
const boots: Array<ReturnType<typeof liveBoot>> = [];
afterEach(async () => {
  for (const b of boots.splice(0)) await b.dispose('term-abort').catch(() => {});
  for (const s of opened.splice(0)) s.end();
});

function clientAnswering(me: Record<string, unknown>): HoodyClient {
  const answers: Record<string, unknown> = {
    'GET /users/auth/me': { data: me },
    'GET /realms': { data: { realm_ids: [] } },
    'GET /vault/keys/hoody.realm-aliases': { data: { value: '{}' } },
  };
  return {
    identity: { kind: 'account', uid: '64f0ada00000000000000001', sid: 's1' },
    apiOrigin: 'https://api.example.invalid',
    realmApiDomain: 'realm.invalid',
    request: (method, path, _b, o) => {
      const a = answers[`${method} ${path.split('?')[0]}`];
      if (a === undefined || !o.beforeWire()) return Promise.reject({ status: 0, notSent: true });
      return Promise.resolve(structuredClone(a));
    },
    fetch: () => Promise.reject({ status: 0, notSent: true }),
  } as HoodyClient;
}

async function boot(me: Record<string, unknown>) {
  const session = beginTermSession(); opened.push(session);
  const b = liveBoot(clientAnswering(me), { profile: 'test', realmId: 'all' }, () => '/'); boots.push(b);
  const error = await b.start(session, () => {}).then(() => null, (e: unknown) => e);
  return { b, error };
}

test('banned at launch: the boot reports suspended and the mount ends as suspended, not as a failed boot', async () => {
  const { b, error } = await boot({ id: '64f0ada00000000000000001', username: 'ada', is_banned: true });
  expect(error).not.toBeNull();
  expect(b.suspended?.()).toBe(true);
  const exit = { reason: 'boot-failed', code: 1, error } as TermHubEnd['exit'];
  expect(endReasonOf(exit, b.suspended?.() === true)).toBe('suspended');
  const end = { exit, reason: 'suspended', traps: [], problems: [], ok: false } as unknown as TermHubEnd;
  expect(failureText(end)).toBe('hoody hub: this account is suspended');
}, 30_000);

test('control: an account that is not banned boots, and a failed boot still reads as a failed boot', async () => {
  const { b, error } = await boot({ id: '64f0ada00000000000000001', username: 'ada', is_banned: false });
  expect(error).toBeNull();
  expect(b.suspended?.()).toBe(false);
  expect(endReasonOf({ reason: 'boot-failed', code: 1, error: new Error('x') } as TermHubEnd['exit'], false)).toBe('boot-failed');
}, 30_000);
