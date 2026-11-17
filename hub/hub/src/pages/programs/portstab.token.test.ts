// Ports & aliases in a shared-access (token) session whose token lacks the alias permission: no alias read goes out.
// Two layers keep it so: the tab reads aliases only while can('resources.proxy_aliases') holds (useAliases(enabled)),
// and api() refuses the alias list unsent (TOKEN_LACKS) whatever the caller asked. Counted on the wire (fetch calls).
import { afterEach, describe, expect, it } from 'vitest';
import { aliasList, aliasRoutes, api, can, type HubError } from '@core';
import { bootLive, configureLifecycle, initLive } from '@core/lifecycle';
import { boot, calls, onFetch, R1, settle, UID, type Call } from '@core/test/env';
import { removeTestLocks } from '@core/test/locks';
import { resetToken } from '@core/token';

const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const record = JSON.stringify({ v: 1, token: TOKEN, realm: R1, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
// The token reads computers and projects; it holds no alias permission (resources.proxy_aliases).
const PERMS = { computers: { read: true }, projects: { read: true } };
const intro = { data: { token: { id: 'tok1', alias: 'shared-1', realm_ids: [R1], allow_no_realm: false, permissions: PERMS, expires_at: null } } };
const isIntro = (c: Call) => c.url.endsWith('/api/v1/auth/tokens/me');
const isMe = (c: Call) => c.url.endsWith('/users/auth/me');
const aliasCalls = () => calls.filter((c) => c.url.includes('/proxy/aliases')).length;

afterEach(() => { resetToken(); removeTestLocks(); });

describe('Ports & aliases: a token without the alias permission sends no alias request', () => {
  it('the tab\'s gate is closed, and the alias list it would read is refused unsent: 0 alias requests', async () => {
    boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: record } });
    resetToken();
    configureLifecycle({ navigate: () => undefined, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    onFetch((c) => (isIntro(c) ? { status: 200, body: intro } : isMe(c) ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : { status: 200, body: { data: [] } }));
    await bootLive();
    // The page's gate (PortsTab: useCan('resources.proxy_aliases') → useAliases(enabled)).
    expect(can('resources.proxy_aliases')).toBe(false);
    // The read the tab makes (core aliasList over aliasRoutes.list), asked anyway: refused before the wire.
    expect(aliasList.route).toBe(aliasRoutes.list);
    const e = (await api(aliasRoutes.list, { query: { computer_id: 'c1' } }).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(e).toMatchObject({ kind: 'not_sent', code: 'TOKEN_LACKS', perm: 'resources.proxy_aliases' });
    expect(aliasCalls()).toBe(0);
  });
});
