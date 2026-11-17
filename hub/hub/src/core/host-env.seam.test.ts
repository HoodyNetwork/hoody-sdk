// The converted core modules reach the browser only through the installed HostEnv: with a host that has its own
// storage, lock manager, visibility and lifecycle, the page's window, document and navigator.locks see nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeStoreCoordinated, subscribeChangeStore, underChangeStore } from './change-store';
import { installHostEnv, resetHostEnvForTests, type HostEnv, type HostLifecycleEvent } from './host-env';
import { createMemoryLocks } from './host-locks-memory';
import { holdLeave } from './leave';
import { readSelection } from './realm';
import { holdTabLock, otherTabs, resetTabLock, tabHeld, withWipeLock } from './tab-lock';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function host(over: Partial<HostEnv> = {}) {
  const ext = new Set<(area: 'local' | 'session', key: string | null) => void>();
  const life = new Map<string, Set<(e: HostLifecycleEvent) => void>>();
  const env: HostEnv = {
    local: memStore(), session: memStore(), vault: null, locks: createMemoryLocks().locks,
    onExternalChange: (cb) => { ext.add(cb); return () => { ext.delete(cb); }; },
    visible: () => true,
    onVisibilityChange: () => () => {},
    onLifecycle: (type, cb) => {
      const set = life.get(type) ?? new Set();
      life.set(type, set);
      set.add(cb as (e: HostLifecycleEvent) => void);
      return () => { set.delete(cb as (e: HostLifecycleEvent) => void); };
    },
    channel: () => null,
    ...over,
  };
  return { env, ext, life };
}
afterEach(() => { resetTabLock(); resetHostEnvForTests(); vi.restoreAllMocks(); });

describe('a host with its own environment', () => {
  it('the leave guard registers beforeunload with the host, not the window, only while work runs', () => {
    resetHostEnvForTests({ unresolved: true });
    const h = host();
    installHostEnv(h.env);
    const add = vi.spyOn(window, 'addEventListener');
    expect(h.life.get('beforeunload')?.size ?? 0).toBe(0);
    const release = holdLeave('upload');
    expect(h.life.get('beforeunload')?.size).toBe(1);
    let prevented = false, value: string | null = null;
    for (const f of h.life.get('beforeunload')!) f({ type: 'beforeunload', preventDefault: () => { prevented = true; }, setReturnValue: (v) => { value = v; } });
    expect([prevented, value]).toEqual([true, '']);
    release();
    expect(h.life.get('beforeunload')?.size).toBe(0);
    expect(add.mock.calls.filter(([n]) => n === 'beforeunload')).toHaveLength(0);
  });

  it('the tab lock and the wipe lock come from the host manager', async () => {
    resetHostEnvForTests({ unresolved: true });
    const h = host();
    installHostEnv(h.env);
    holdTabLock();
    await vi.waitFor(() => expect(tabHeld()).toBe(true));
    expect(await otherTabs()).toBe('alone');
    expect(await withWipeLock(async () => 'ran')).toBe('ran');
    expect(((await h.env.locks!.query!()).held ?? []).map((l) => l.name)).toEqual(['hub-tab']);
  });

  it('a host with no locks: nothing is held, other tabs unknown, the change store refuses', async () => {
    resetHostEnvForTests({ unresolved: true });
    installHostEnv(host({ locks: null }).env);
    holdTabLock();
    expect(tabHeld()).toBe(false);
    expect(await otherTabs()).toBe('unknown');
    expect(await withWipeLock(async () => 1)).toBe('unknown');
    expect(changeStoreCoordinated()).toBe(false);
    await expect(underChangeStore(() => 1)).rejects.toThrow('CHANGE_STORE_UNCOORDINATED');
  });

  it('the change store runs under the host lock and hears the host storage events', async () => {
    resetHostEnvForTests({ unresolved: true });
    const h = host();
    installHostEnv(h.env);
    expect(changeStoreCoordinated()).toBe(true);
    expect(await underChangeStore(() => 7)).toBe(7);
    const seen: string[] = [];
    const off = subscribeChangeStore(() => { seen.push('changed'); });
    for (const f of h.ext) f('local', 'hub.v3.changes');
    for (const f of h.ext) f('local', 'other');
    for (const f of h.ext) f('local', null);
    off();
    for (const f of h.ext) f('local', 'hub.v3.changes');
    expect(seen).toEqual(['changed', 'changed']);
  });

  it('the realm selection is read from the host storage, and unreadable storage reads as all', () => {
    resetHostEnvForTests({ unresolved: true });
    const h = host();
    installHostEnv(h.env);
    h.env.local!.setItem('hub_realm_v1', 'aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(readSelection()).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    resetHostEnvForTests({ unresolved: true });
    installHostEnv(host({ local: null }).env);
    expect(readSelection()).toBe('all');
  });
});
