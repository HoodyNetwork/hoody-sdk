// Vitest: an access-key session and the locations read (GET /subserver-subscriptions/regions needs
// financial.billing.read): without the leaf it is refused unsent, with it it goes to the pinned realm's host.
import { afterEach, describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { commerceRoutes } from './commerce';
import { bootLive, configureLifecycle, initLive, onLifecycle } from './lifecycle';
import { defineRoute } from './routes';
const botLinks = defineRoute({ method: 'GET', path: '/bot-urls', scope: 'realm' });
const offs: Array<() => void> = [];
import { boot, calls, onFetch, R1, settle, UID, DOMAIN } from './test/env';
import { removeTestLocks } from './test/locks';
import { resetToken } from './token';
const hostOf = (c: { url: string }) => (/^https:\/\/([^/]+)/.exec(c.url) || [, 'base'])[1];
afterEach(() => { while (offs.length) offs.pop()!(); resetToken(); removeTestLocks(); });
describe('rd: token session, the regions read through api()', () => {
  const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
  const record = (realm: string) => JSON.stringify({ v: 1, token: TOKEN, realm, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
  const intro = (permissions: unknown) => ({ data: { token: { id: 'tok1', alias: 'shared-1', realm_ids: [R1], allow_no_realm: false, permissions, expires_at: null } } });
  function tokenTab(permissions: unknown) {
    boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: record(R1) } });
    resetToken();
    configureLifecycle({ navigate: () => undefined, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    offs.push(onLifecycle(() => undefined));
    onFetch((c) => (c.url.endsWith('/api/v1/auth/tokens/me') ? { status: 200, body: intro(permissions) } : c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : { status: 200, body: { data: { plan_id: 'v1', regions: [] } } }));
  }
  it('without financial.billing.read: TOKEN_LACKS, unsent', async () => {
    tokenTab({ computers: { read: true, actions: { start: true } }, projects: { read: true } });
    await bootLive();
    const ctl = (await api(botLinks).catch((x: unknown) => x)) as HubError;
    expect(ctl).toMatchObject({ code: 'TOKEN_LACKS' });
    const e = (await api(commerceRoutes.regionsRoute, { query: { plan_id: 'v1' } }).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(e).toMatchObject({ kind: 'not_sent', code: 'TOKEN_LACKS', perm: 'financial.billing.read' });
    expect(calls.filter((c) => c.url.includes('/regions')).length).toBe(0);
  });
  it('with it: sent to the pinned realm host', async () => {
    tokenTab({ computers: { read: true, actions: { start: true } }, projects: { read: true }, financial: { billing: { read: true } } });
    await bootLive();
    await api(commerceRoutes.regionsRoute, { query: { plan_id: 'v1' } });
    const sent = calls.filter((c) => c.url.includes('/subserver-subscriptions/regions'));
    expect(sent.length).toBe(1);
    expect(hostOf(sent[0]!)).toBe(`${R1}.${DOMAIN}`);
  });
});
