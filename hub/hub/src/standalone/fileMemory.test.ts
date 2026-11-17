// fileMemory.ts: the standalone Hub opened as a file keeps nothing on this computer.
import { describe, expect, it } from 'vitest';
import { FILE_MEMORY_SCRIPT, installFileMemory } from './fileMemory';

/** A window-like object whose storage is a real store the test can look into afterwards. */
function fakeWindow(protocol: string) {
  const disk = new Map<string, string>();
  const real = {
    getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => { disk.set(k, v); },
    removeItem: (k: string) => { disk.delete(k); },
    clear: () => { disk.clear(); },
    key: (i: number) => [...disk.keys()][i] ?? null,
    get length() { return disk.size; },
  };
  const attrs = new Map<string, string>();
  const w: Record<string, unknown> = {
    location: { protocol },
    document: { documentElement: { setAttribute: (k: string, v: string) => { attrs.set(k, v); } } },
  };
  // As on Window: configurable accessors.
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(w, name, { get: () => real, configurable: true, enumerable: true });
  Object.defineProperty(w, 'indexedDB', { get: () => ({ open() {} }), configurable: true });
  Object.defineProperty(w, 'BroadcastChannel', { value: function BroadcastChannel() {}, configurable: true, writable: true });
  return { w, disk, attrs };
}

const store = (w: Record<string, unknown>, name: string) => w[name] as Storage;

describe('installFileMemory', () => {
  it('on file:// nothing written reaches the browser store, and both stores still work in memory', () => {
    const { w, disk, attrs } = fakeWindow('file:');
    expect(installFileMemory(w)).toBe('on');
    const ls = store(w, 'localStorage');
    ls.setItem('access_token', 'a');
    ls.setItem('refresh_token', 'r');
    store(w, 'sessionStorage').setItem('auth_flow', 'f');
    expect(disk.size).toBe(0);
    expect(ls.getItem('access_token')).toBe('a');
    expect(ls.getItem('missing')).toBeNull();
    expect(ls.length).toBe(2);
    expect([ls.key(0), ls.key(1)].sort()).toEqual(['access_token', 'refresh_token']);
    ls.removeItem('access_token');
    expect(ls.getItem('access_token')).toBeNull();
    ls.clear();
    expect(ls.length).toBe(0);
    expect(store(w, 'sessionStorage').getItem('auth_flow')).toBe('f');
    expect(store(w, 'localStorage')).not.toBe(store(w, 'sessionStorage'));
    expect(attrs.get('data-hub-memory-only')).toBe('');
  });

  it('on file:// the stores other local files could share are gone (IndexedDB, Cache Storage, BroadcastChannel)', () => {
    const { w } = fakeWindow('file:');
    installFileMemory(w);
    expect(w.indexedDB).toBeUndefined();
    expect(w.caches).toBeUndefined();
    expect(w.BroadcastChannel).toBeUndefined();
  });

  it('values are kept as strings, like the browser store', () => {
    const { w } = fakeWindow('file:');
    installFileMemory(w);
    const ls = store(w, 'localStorage');
    ls.setItem('n', 5 as unknown as string);
    expect(ls.getItem('n')).toBe('5');
  });

  it('any other page is left alone', () => {
    for (const p of ['https:', 'http:']) {
      const { w, attrs } = fakeWindow(p);
      const before = store(w, 'localStorage');
      expect(installFileMemory(w)).toBe('off');
      expect(store(w, 'localStorage')).toBe(before);
      expect(attrs.size).toBe(0);
    }
  });

  it('a store it cannot replace is reported, never silently kept', () => {
    const { w, attrs } = fakeWindow('file:');
    Object.defineProperty(w, 'localStorage', { value: store(w, 'localStorage'), configurable: false, writable: false });
    expect(installFileMemory(w)).toBe('failed');
    expect(attrs.get('data-hub-memory-only')).toBe('failed');
  });

  it('the inline script is the same function, self-contained, run on window', () => {
    expect(FILE_MEMORY_SCRIPT.startsWith('(')).toBe(true);
    expect(FILE_MEMORY_SCRIPT.endsWith(')(window);')).toBe(true);
    expect(FILE_MEMORY_SCRIPT).not.toMatch(/\b(import|require)\b/);
    const { w, disk } = fakeWindow('file:');
    new Function('window', FILE_MEMORY_SCRIPT)(w);
    store(w, 'localStorage').setItem('k', 'v');
    expect(disk.size).toBe(0);
  });
});
