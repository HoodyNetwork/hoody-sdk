// A shared link's refused change shows one toast that names what it can't do and the right to ask the
// realm's owner for; a repeat counts on it; a refused read shows nothing here.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { api, type HubError } from '@core/api';
import { bootLive, configureLifecycle, initLive } from '@core/lifecycle';
import { defineRoute } from '@core/routes';
import { boot, onFetch, R1, settle, UID, type Call } from '@core/test/env';
import { removeTestLocks } from '@core/test/locks';
import { resetToken } from '@core/token';
import { Toaster } from '@kit/states/Toast';
import { CoreNotices } from './notices';

const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const record = JSON.stringify({ v: 1, token: TOKEN, realm: R1, sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
const PERMS = { computers: { read: true, actions: { start: true } }, projects: { read: true } };
const op = defineRoute({ method: 'POST', path: '/computers/:id/:op', scope: 'realm' });
const botLinks = defineRoute({ method: 'GET', path: '/bot-urls', scope: 'realm' });

afterEach(() => { resetToken(); removeTestLocks(); });

async function sharedTab(): Promise<void> {
  boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: record } });
  resetToken();
  configureLifecycle({ navigate: () => undefined, loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  onFetch((c: Call) => (c.url.endsWith('/api/v1/auth/tokens/me')
    ? { status: 200, body: { data: { token: { id: 't1', alias: 's', realm_ids: [R1], allow_no_realm: false, permissions: PERMS, expires_at: null } } } }
    : c.url.endsWith('/users/auth/me') ? { status: 200, body: { data: { id: UID, username: 'owner' } } } : { status: 200, body: { data: [] } }));
  await bootLive();
}

describe('CoreNotices: a shared link refused', () => {
  it('a read: no toast', async () => {
    await sharedTab();
    render(<><CoreNotices /><Toaster /></>);
    await act(async () => { await api(botLinks).catch(() => null); await settle(); });
    expect(screen.queryByText(/This shared link/)).toBeNull();
  });
  // stop, not restart: a toast id still showing from another test would count on (the queue outlives a test).
  it('a change refused while the toast handler is mounted is marked said; before it mounts it is not (the page toasts)', async () => {
    await sharedTab();
    const before = (await api(op, { params: { id: 'c1', op: 'stop' } }).catch((x: unknown) => x)) as HubError;
    expect(before.tokenSaid).toBeUndefined();
    render(<><CoreNotices /><Toaster /></>);
    let after: HubError | null = null;
    await act(async () => { after = (await api(op, { params: { id: 'c2', op: 'stop' } }).catch((x: unknown) => x)) as HubError; await settle(); });
    expect(after!.tokenSaid).toBe(true);
  });
  it('a change: one toast naming the action and the right; a repeat counts on the same toast', async () => {
    await sharedTab();
    render(<><CoreNotices /><Toaster /></>);
    await act(async () => { await api(op, { params: { id: 'c1', op: 'restart' } }).catch(() => null); await settle(); });
    expect(screen.getByText("This shared link can't restart computers")).toBeInTheDocument();
    const body = screen.getByText(/^Ask the owner of .+ for “Restart computers”\.$/);
    expect(body.textContent).not.toMatch(/[{}]/);
    await act(async () => { await api(op, { params: { id: 'c2', op: 'restart' } }).catch(() => null); await settle(); });
    expect(screen.getAllByText("This shared link can't restart computers")).toHaveLength(1);
    expect(screen.getByText(/for “Restart computers”\. This happened 2 times\.$/)).toBeInTheDocument();
  });
});
