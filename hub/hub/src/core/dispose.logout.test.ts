// dispose.ts: a sign-out under way when the session is disposed does not purge, wipe or leave afterwards, not even
// after the next mount booted (the old closure would purge that mount's stored session and navigate its page).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { disposeCoreSession } from './dispose';
import { configureLifecycle, initLive, logout } from './lifecycle';
import { defineRoute } from './routes';
import { boot, calls, deferred, onFetch, R1, settle } from './test/env';

const startRoute = defineRoute({ method: 'POST', path: '/computers/:id/start', scope: 'realm', body: [] });
afterEach(() => { delete (window as { HubBootToken?: unknown }).HubBootToken; vi.restoreAllMocks(); });

/** One mount: booted, the lifecycle wired to a shared navigation record. */
function mount(navs: string[]): void {
  boot({ realm: R1 });
  configureLifecycle({ navigate: (u) => { navs.push(u); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
}

describe('a sign-out under way when the session is disposed', () => {
  it('waiting for the session revoke: it neither purges the next mount\'s session nor leaves', async () => {
    const navs: string[] = [];
    mount(navs);
    const rev = deferred();
    (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => rev.p };
    logout();
    await settle(5);
    await disposeCoreSession('term-abort');
    mount(navs); // mount B: a fresh stored session
    const stored = localStorage.getItem('access_token');
    expect(stored).not.toBeNull();
    rev.res();
    await settle(30);
    expect(navs).toEqual([]);
    expect(localStorage.getItem('access_token')).toBe(stored);
  });
  it('waiting out the notice time: the timer is cancelled and the page does not leave', async () => {
    const navs: string[] = [];
    mount(navs);
    onFetch((c) => (c.url.endsWith('/computers/c1/start') ? { status: 200, body: {}, delayMs: 30 } : { status: 200, body: { data: {} } }));
    const p = api(startRoute, { params: { id: 'c1' } }).catch(() => null);
    await settle(3);
    expect(calls.some((c) => c.url.endsWith('/computers/c1/start'))).toBe(true);
    const set = vi.spyOn(globalThis, 'setTimeout'), clear = vi.spyOn(globalThis, 'clearTimeout');
    logout({ minWaitMs: 60 });
    const timer = set.mock.results[set.mock.calls.findIndex((c) => c[1] === 60)]?.value;
    expect(timer).toBeDefined();
    await disposeCoreSession('term-quit');
    expect(clear).toHaveBeenCalledWith(timer); // cancelled, not left to fire into the next mount
    mount(navs);
    await p;
    await new Promise((r) => setTimeout(r, 120));
    expect(navs).toEqual([]);
  });
  it('a wipe still running when the session is disposed does not take the page away afterwards', async () => {
    const navs: string[] = [];
    mount(navs);
    const wipe = deferred<boolean>();
    logout({ wipe: () => wipe.p });
    await settle(30); // the purge ran, the wipe is the pending last step
    await disposeCoreSession('term-error');
    mount(navs);
    wipe.res(true);
    await settle(30);
    expect(navs).toEqual([]);
  });
});
