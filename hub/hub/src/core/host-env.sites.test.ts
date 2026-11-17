// lifecycle.ts's storage watcher and commerce.ts's reset reach the browser only through the installed HostEnv.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCommerce } from './commerce';
import { installHostEnv, resetHostEnvForTests, type HostEnv } from './host-env';
import { configureLifecycle, initLive } from './lifecycle';
import { resetTabLock } from './tab-lock';
import { boot } from './test/env';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function host(over: Partial<HostEnv> = {}): HostEnv {
  return {
    local: memStore(), session: memStore(), vault: null, locks: null,
    onExternalChange: () => () => {}, visible: () => true, onVisibilityChange: () => () => {}, onLifecycle: () => () => {},
    channel: () => null, ...over,
  };
}
afterEach(() => { resetTabLock(); resetHostEnvForTests(); vi.restoreAllMocks(); });

describe('a host with its own environment', () => {
  it('commerce resetCommerce clears its pending rents in the host store, not the window storage', () => {
    boot();
    localStorage.setItem('hub.v3.rent_pending', '[1]');
    resetHostEnvForTests({ unresolved: true });
    const env = host();
    env.local!.setItem('hub.v3.rent_pending', '[2]');
    installHostEnv(env);
    resetCommerce();
    expect(env.local!.getItem('hub.v3.rent_pending')).toBeNull();
    expect(localStorage.getItem('hub.v3.rent_pending')).toBe('[1]');
  });
  it('lifecycle watches another tab through the host (once), never the window; by key: an unrelated key does nothing, the access token supersedes', () => {
    boot();
    resetHostEnvForTests({ unresolved: true });
    let cb: ((area: 'local' | 'session', key: string | null) => void) | null = null;
    let registrations = 0;
    installHostEnv(host({ onExternalChange: (c) => { registrations++; cb = c; return () => {}; } }));
    const urls: string[] = [];
    configureLifecycle({ navigate: (u) => { urls.push(u); } });
    const add = vi.spyOn(window, 'addEventListener');
    initLive();
    initLive();
    expect(add.mock.calls.filter(([n]) => n === 'storage')).toHaveLength(0);
    expect(registrations).toBe(1);
    expect(cb).not.toBeNull();
    // This page no longer holds the session (the tokens are gone), so only the KEY decides what the event does.
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    cb!('local', 'hub_unrelated_v1');
    expect(urls).toEqual([]);
    cb!('local', 'access_token');
    expect(urls).toHaveLength(1);
  });
});
