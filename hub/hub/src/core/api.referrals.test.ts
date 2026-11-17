// The referral program's routes are account-wide: every /referrals call goes to
// the base host in a realm view, so a C9 hold is one hold whatever realm is shown, and a token session (pinned to one
// realm) refuses them unsent.
import { describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { setIdentity } from './ctx';
import { defineRoute } from './routes';
import { boot, calls, hostOf, onFetch, R1, UID } from './test/env';

const me = defineRoute({ method: 'GET', path: '/referrals/me', scope: 'realm' });
const join = defineRoute({ method: 'POST', path: '/referrals/me', scope: 'realm', body: [] });
const create = defineRoute({ method: 'POST', path: '/referrals/me/codes', scope: 'realm', body: ['code'] });
const release = defineRoute({ method: 'DELETE', path: '/referrals/me/codes/:code', scope: 'realm' });
const check = defineRoute({ method: 'GET', path: '/referrals/me/codes/check', scope: 'realm', query: ['code'] });

const cases = [
  [me, {}],
  [join, { body: {} }],
  [create, { body: { code: 'maya-builds' } }],
  [release, { params: { code: 'maya-builds' } }],
  [check, { query: { code: 'maya-builds' } }],
] as const;

const outcome = (p: Promise<unknown>) => p.then(() => 'done', (e: HubError) => e);

describe('referrals_go_to_base_host_in_realm_view', () => {
  for (const [route, input] of cases) {
    it(`${route.method} ${route.path} goes to the base host whatever the realm view`, async () => {
      boot({ realm: R1 });
      onFetch(() => ({ status: 200, body: { data: {} } }));
      await api(route as never, input as never).catch(() => 0);
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(hostOf(c.url)).toBe('base');
    });
  }
});

// The match is the /referrals segment, not the text: the bare path and a declared query are the program's, a neighbour
// whose name only starts with "referrals" is an ordinary realm route.
const bare = defineRoute({ method: 'GET', path: '/referrals', scope: 'realm', query: ['page'] });
const neighbour = defineRoute({ method: 'GET', path: '/referrals-something', scope: 'realm' });
describe('the referrals segment, not the prefix', () => {
  it('bare /referrals with a query goes to the base host in a realm view', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: {} } }));
    await api(bare as never, { query: { page: '2' } } as never).catch(() => 0);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(hostOf(c.url)).toBe('base');
  });
  it('/referrals-something keeps the realm host', async () => {
    boot({ realm: R1 });
    onFetch(() => ({ status: 200, body: { data: {} } }));
    await api(neighbour as never, {} as never).catch(() => 0);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(hostOf(c.url)).not.toBe('base');
  });
});

describe('token_session_refuses_referrals_unsent', () => {
  for (const [route, input] of cases) {
    it(`${route.method} ${route.path} is refused unsent in a token session`, async () => {
      const rec = JSON.stringify({ v: 1, token: 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48), realm: R1, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
      boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: rec } });
      setIdentity({ id: UID, banned: false });
      onFetch(() => ({ status: 200, body: { data: {} } }));
      expect(await outcome(api(route as never, input as never))).toMatchObject({ code: 'TOKEN_SESSION_REFUSED', notSent: true });
      expect(calls).toHaveLength(0);
    });
  }
});
