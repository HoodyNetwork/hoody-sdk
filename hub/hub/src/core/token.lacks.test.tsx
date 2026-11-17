// A shared-access (token) session asks only what its token may do (routePerms.ts). A call it lacks the leaf
// for is refused unsent (TOKEN_LACKS, with `perm`): a read says nothing (its page says it in place), a change notices
// once with the leaf and the pinned realm. A 403 that still comes back names the leaf from the table or the server's
// exact sentence, and only a change's named refusal notices.
import { afterEach, describe, expect, it } from 'vitest';
import { api, type HubError } from './api';
import { bootLive, configureLifecycle, initLive, onLifecycle, type LifecycleEvent } from './lifecycle';
import { defineRoute } from './routes';
import { boot, calls, onFetch, R1, settle, UID, type Call, type Reply } from './test/env';
import { removeTestLocks } from './test/locks';
import { resetToken, tokenRealmBound } from './token';

const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const record = (realm: string) => JSON.stringify({ v: 1, token: TOKEN, realm, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
// Held: read, start; not held: restart, bot links.
const PERMS = { computers: { read: true, actions: { start: true } }, projects: { read: true } };
const intro = (o: Record<string, unknown> = {}) => ({ data: { token: { id: 'tok1', alias: 'shared-1', realm_ids: [R1], allow_no_realm: false, permissions: PERMS, expires_at: null, ...o } } });

const botLinks = defineRoute({ method: 'GET', path: '/bot-urls', scope: 'realm' });
const lifecycleOp = defineRoute({ method: 'POST', path: '/computers/:id/:op', scope: 'realm' });
const commands = defineRoute({ method: 'GET', path: '/servers/:id/available-commands', scope: 'realm' });
const unlisted = defineRoute({ method: 'POST', path: '/toasts-1a/unlisted', scope: 'realm' });
const unlistedRead = defineRoute({ method: 'GET', path: '/toasts-1a/read', scope: 'realm' });
const balances = defineRoute({ method: 'GET', path: '/wallet/balances', scope: 'base' });
// A secret route (its refusal is scrubbed down to the codes it keeps), as computer creation is.
const updateOp = defineRoute({ method: 'PUT', path: '/computers/:id', scope: 'realm', body: ['name'] });
const secretOp = defineRoute({ method: 'POST', path: '/toasts-1a/secret', scope: 'realm', secret: true, codes: ['NAME_TAKEN'] });

const offs: Array<() => void> = [];
afterEach(() => { while (offs.length) offs.pop()!(); resetToken(); removeTestLocks(); });

const isIntro = (c: Call) => c.url.endsWith('/api/v1/auth/tokens/me');
const isMe = (c: Call) => c.url.endsWith('/users/auth/me');
// `shows`: a listener stands in for the shell's toast handler and says it showed a notAllowed notice (lifecycle emit).
function tokenTab(on: (c: Call) => Reply | undefined = () => undefined, token: Record<string, unknown> = {}, shows = true): { events: LifecycleEvent[] } {
  boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: record(R1) } });
  resetToken();
  const w = { events: [] as LifecycleEvent[] };
  configureLifecycle({ navigate: () => undefined, loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  offs.push(onLifecycle((e) => { w.events.push(e); return shows && e.kind === 'token-notice' && e.notice === 'notAllowed' ? true : undefined; }));
  onFetch((c) => (isIntro(c) ? { status: 200, body: intro(token) } : isMe(c) ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : on(c) ?? { status: 200, body: { data: [] } }));
  return w;
}
const notices = (w: { events: LifecycleEvent[] }) => w.events.filter((e) => e.kind === 'token-notice');
const sentTo = (part: string) => calls.filter((c) => c.url.includes(part)).length;

describe('refused unsent before the server is asked', () => {
  it('a read the token lacks the leaf for: TOKEN_LACKS with the leaf, nothing sent, no notice', async () => {
    const w = tokenTab();
    await bootLive();
    const e = (await api(botLinks).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(e).toMatchObject({ kind: 'not_sent', code: 'TOKEN_LACKS', perm: 'resources.bot_urls' });
    expect(sentTo('/bot-urls')).toBe(0);
    expect(notices(w)).toEqual([]);
  });
  it('a change it lacks: unsent, one notice naming the leaf and the pinned realm', async () => {
    const w = tokenTab();
    await bootLive();
    const e = (await api(lifecycleOp, { params: { id: 'c1', op: 'restart' } }).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(e).toMatchObject({ kind: 'not_sent', code: 'TOKEN_LACKS', perm: 'computers.actions.restart', tokenSaid: true });
    expect(sentTo('/computers/c1/restart')).toBe(0);
    expect(notices(w)).toEqual([{ kind: 'token-notice', notice: 'notAllowed', perm: 'computers.actions.restart', realm: R1 }]);
  });
  it('a change refused while no surface shows notices: noticed, but not marked said (its page toasts it)', async () => {
    const w = tokenTab(undefined, {}, false);
    await bootLive();
    const e = (await api(lifecycleOp, { params: { id: 'c1', op: 'restart' } }).catch((x: unknown) => x)) as HubError;
    expect(e).toMatchObject({ code: 'TOKEN_LACKS', perm: 'computers.actions.restart' });
    expect(e.tokenSaid).toBeUndefined();
    expect(notices(w)).toHaveLength(1);
  });
  it('a read refused unsent is not marked said (its page says it in place)', async () => {
    tokenTab();
    await bootLive();
    const e = (await api(botLinks).catch((x: unknown) => x)) as HubError;
    expect(e.tokenSaid).toBeUndefined();
  });
  it('a right the owner granted since: the refusal rechecks, so the next try is sent (at most one recheck per 30 s)', async () => {
    let granted = false;
    const w = tokenTab();
    onFetch((c) => (isIntro(c) ? { status: 200, body: intro(granted ? { permissions: { ...PERMS, computers: { read: true, actions: { start: true, restart: true } } } } : {}) } : isMe(c) ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : { status: 200, body: { data: [] } }));
    await bootLive();
    const intros = () => calls.filter(isIntro).length;
    const before = intros();
    granted = true;
    await api(lifecycleOp, { params: { id: 'c1', op: 'restart' } }).catch(() => null);
    await settle();
    expect(intros()).toBe(before + 1);
    await api(lifecycleOp, { params: { id: 'c1', op: 'restart' } }).catch(() => null);
    expect(sentTo('/computers/c1/restart')).toBe(1);
    // The change's recheck announces the new rights.
    expect(notices(w).map((n) => (n as { notice: string }).notice)).toEqual(['notAllowed', 'changed']);
  });
  it("a read's recheck that finds new rights announces nothing (reads never toast)", async () => {
    let granted = false;
    const w = tokenTab();
    onFetch((c) => (isIntro(c) ? { status: 200, body: intro(granted ? { permissions: { ...PERMS, resources: { bot_urls: true } } } : {}) } : isMe(c) ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : { status: 200, body: { data: [] } }));
    await bootLive();
    granted = true;
    await api(botLinks).catch(() => null);
    await settle();
    await api(botLinks).catch(() => null);
    expect(sentTo('/bot-urls')).toBe(1);
    expect(notices(w)).toEqual([]);
  });
  it('a change it holds is sent', async () => {
    tokenTab();
    await bootLive();
    await api(lifecycleOp, { params: { id: 'c1', op: 'start' } }).catch(() => null);
    expect(sentTo('/computers/c1/start')).toBe(1);
  });
  it('a route no token is served on: TOKEN_SESSION_REFUSED unsent', async () => {
    tokenTab();
    await bootLive();
    const e = (await api(commands, { params: { id: 's1' } }).catch((x: unknown) => x)) as HubError;
    expect(e).toMatchObject({ kind: 'not_sent', code: 'TOKEN_SESSION_REFUSED' });
    expect(sentTo('/available-commands')).toBe(0);
  });
  it('a route realm-bound tokens are refused on (all account-only today, so refused first as before)', async () => {
    tokenTab(undefined, { permissions: { ...PERMS, financial: { wallet: { read: true } } } });
    await bootLive();
    expect(await api(balances).catch((x: unknown) => x)).toMatchObject({ kind: 'not_sent', code: 'TOKEN_SESSION_REFUSED' });
    expect(sentTo('/wallet/balances')).toBe(0);
  });
  it('before the caps are read nothing is decided here: the call goes out as before', async () => {
    tokenTab();
    // No boot: no introspection answered yet.
    await api(botLinks).catch(() => null);
    expect(sentTo('/bot-urls')).toBe(1);
  });
});

describe('tokenRealmBound: whether the token is limited to realms', () => {
  it.each([
    [{ realm_ids: [R1], allow_no_realm: false }, true],
    [{ realm_ids: [R1], allow_no_realm: true }, true],
    [{ realm_ids: [], allow_no_realm: false }, true],
    [{ realm_ids: [], allow_no_realm: true }, false],
  ])('%j → %s', async (token, bound) => {
    tokenTab(undefined, token);
    await bootLive();
    expect(tokenRealmBound()).toBe(bound);
  });
});

describe('a 403 that comes back', () => {
  const refuse = (message?: string) => (c: Call): Reply | undefined => (c.url.includes('/toasts-1a/') ? { status: 403, body: { error: 'INSUFFICIENT_PERMISSIONS', ...(message === undefined ? {} : { message }) } } : undefined);
  it("the server's exact sentence names a known leaf: the change notices it", async () => {
    const w = tokenTab(refuse('This token does not have permission: computers.actions.exec'));
    await bootLive();
    const e = (await api(unlisted).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(e.perm).toBe('computers.actions.exec');
    expect(notices(w)).toEqual([{ kind: 'token-notice', notice: 'notAllowed', perm: 'computers.actions.exec', realm: R1 }]);
  });
  it("the server's own fixed sentence for a right it checks on the body names that right", async () => {
    const w = tokenTab(refuse('This token does not have permission to manage SSH keys'));
    await bootLive();
    const e = (await api(unlisted).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(e).toMatchObject({ code: 'INSUFFICIENT_PERMISSIONS', perm: 'resources.ssh_keys', tokenSaid: true });
    expect(notices(w)).toEqual([{ kind: 'token-notice', notice: 'notAllowed', perm: 'resources.ssh_keys', realm: R1 }]);
  });
  it("a secret route's refusal is named from the answer as it came; only the code and the leaf survive the scrub", async () => {
    const w = tokenTab((c) => (c.url.includes('/toasts-1a/secret') ? { status: 403, body: { error: 'INSUFFICIENT_PERMISSIONS', message: 'This token does not have permission to create AI-enabled computers' } } : undefined));
    await bootLive();
    const e = (await api(secretOp).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(e).toMatchObject({ status: 403, code: 'INSUFFICIENT_PERMISSIONS', perm: 'computers.features.ai', tokenSaid: true });
    expect(e.message).toBeUndefined();
    expect(notices(w)).toEqual([{ kind: 'token-notice', notice: 'notAllowed', perm: 'computers.features.ai', realm: R1 }]);
  });
  it('a read the server refuses with a named right: named for its page, never said by the shell, never marked said', async () => {
    const w = tokenTab(refuse('This token does not have permission to view computer logs'));
    await bootLive();
    const e = (await api(unlistedRead).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(e).toMatchObject({ code: 'INSUFFICIENT_PERMISSIONS', perm: 'computers.actions.logs' });
    expect(e.tokenSaid).toBeUndefined();
    expect(notices(w)).toEqual([]);
  });
  it('the named notice does not wait on the recheck: said though the check cannot answer', async () => {
    const w = tokenTab();
    onFetch((c) => (isIntro(c) && calls.filter(isIntro).length > 1 ? { status: 503, body: {} } : isIntro(c) ? { status: 200, body: intro() } : isMe(c) ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : c.url.includes('/toasts-1a/') ? { status: 403, body: { error: 'INSUFFICIENT_PERMISSIONS', message: 'This token does not have permission: computers.actions.exec' } } : { status: 200, body: { data: [] } }));
    await bootLive();
    await api(unlisted).catch(() => null);
    await settle();
    expect(notices(w)).toContainEqual({ kind: 'token-notice', notice: 'notAllowed', perm: 'computers.actions.exec', realm: R1 });
  });
  it("a right revoked since the caps were read: the server's fixed sentence names it (never a guess from the caps)", async () => {
    const w = tokenTab(refuse('This token does not have permission to update computers'), { permissions: { ...PERMS, computers: { read: true, update: true, actions: { start: true } } } });
    onFetch((c) => (isIntro(c) ? { status: 200, body: intro({ permissions: { ...PERMS, computers: { read: true, update: true, actions: { start: true } } } }) } : isMe(c) ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : c.url.includes('/computers/c1') ? { status: 403, body: { error: 'INSUFFICIENT_PERMISSIONS', message: 'This token does not have permission to update computers' } } : { status: 200, body: { data: [] } }));
    await bootLive();
    const e = (await api(updateOp, { params: { id: 'c1' }, body: { name: 'x' } }).catch((x: unknown) => x)) as HubError;
    await settle();
    expect(sentTo('/computers/c1'), JSON.stringify(e)).toBe(1);
    expect(e).toMatchObject({ code: 'INSUFFICIENT_PERMISSIONS', perm: 'computers.update', tokenSaid: true });
    expect(notices(w)).toContainEqual({ kind: 'token-notice', notice: 'notAllowed', perm: 'computers.update', realm: R1 });
  });
  it('a sentence one of several rights could have written (or none the Hub knows) names nothing', async () => {
    for (const m of ['This token does not have permission to authorize computers', 'This token does not have permission to manage project members', 'This token does not have permission to manage environment variables', 'This token does not have permission to update computers.']) {
      const w = tokenTab(refuse(m));
      await bootLive();
      const e = (await api(unlisted).catch((x: unknown) => x)) as HubError;
      await settle();
      expect(e.perm, m).toBeNull();
      expect(notices(w), m).toEqual([]);
      resetToken();
    }
  });
  it('any other message, or a leaf the Hub does not know: no leaf, no notice (the page says it)', async () => {
    for (const m of [undefined, 'This token does not have permission: made.up_leaf', 'Nope: computers.actions.exec', 'This token does not have permission: computers.actions.exec ']) {
      const w = tokenTab(refuse(m));
      await bootLive();
      const e = (await api(unlisted).catch((x: unknown) => x)) as HubError;
      await settle();
      expect(e.perm).toBeNull();
      expect(notices(w)).toEqual([]);
      resetToken();
    }
  });
});

describe('a 401 that comes back', () => {
  const unanswerable = (status: number) => (c: Call): Reply | undefined => (c.url.includes('/toasts-1a/') ? { status, body: { error: 'UNAUTHORIZED' } } : undefined);
  /** After boot the introspection answers `later` (503: the check cannot answer). */
  function laterIntro(later: () => Reply) {
    let booted = false;
    onFetch((c) => (isIntro(c) ? (booted ? later() : { status: 200, body: intro() }) : isMe(c) ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : c.url.includes('/toasts-1a/') ? { status: 401, body: { error: 'UNAUTHORIZED' } } : { status: 200, body: { data: [] } }));
    return () => { booted = true; };
  }
  it('reads: eight 401s with the check unanswerable make one check and no notice', async () => {
    const w = tokenTab(unanswerable(401));
    const done = laterIntro(() => ({ status: 503, body: {} }));
    await bootLive();
    done();
    const before = calls.filter(isIntro).length;
    for (let i = 0; i < 8; i++) { await api(unlistedRead).catch(() => null); await settle(); }
    expect(calls.filter(isIntro).length).toBe(before + 1);
    expect(notices(w)).toEqual([]);
  });
  it("a change's 401 with the check unanswerable says offline once", async () => {
    const w = tokenTab(unanswerable(401));
    const done = laterIntro(() => ({ status: 503, body: {} }));
    await bootLive();
    done();
    for (let i = 0; i < 3; i++) { await api(unlisted).catch(() => null); await settle(); }
    expect(notices(w)).toEqual([{ kind: 'token-notice', notice: 'offline' }]);
  });
  it("a read's 401 whose check finds other rights: the caps update, nothing is announced", async () => {
    const w = tokenTab(unanswerable(401));
    const done = laterIntro(() => ({ status: 200, body: intro({ permissions: { ...PERMS, resources: { bot_urls: true } } }) }));
    await bootLive();
    done();
    await api(unlistedRead).catch(() => null);
    await settle();
    expect(notices(w)).toEqual([]);
    await api(botLinks).catch(() => null);
    expect(sentTo('/bot-urls')).toBe(1);
  });
});
