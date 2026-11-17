// Vitest: the kept routes of Transfers (transfers/routes.ts) on core's real encrypted preference store. The newest 50 are
// kept, a computer seen again becomes the newest; the store is written only while it reads 'ok': a route
// kept while it opens or is locked stays in this page's memory (shown, never written) and is stored by a later keep
// once readable; that memory ends with the account, Forget and sign-out, and survives a realm switch.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cryptIdleForTests, cryptReady, forgetThisBrowser, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { bump, setIdentity } from '@core/ctx';
import { resetPrefs, usePrefStatus } from '@core/prefs';
import { boot, OTHER, UID } from '@core/test/env';
import type { FilesComputer } from '../data';
import { useKeepRoutes, useRoutes, withRoutes } from './routes';

const KEY = 'hub_files_routes_v1';
const pc = (i: number, o: Partial<FilesComputer> = {}): FilesComputer => ({ id: `pc-${i}`, name: `pc${i}`, project_id: 'p1', server_name: 's1', status: '', rules: 'unknown', ...o });
const route = (i: number) => ({ id: `pc-${i}`, name: `pc${i}`, project_id: 'p1', server_name: 's1' });
const settle = () => act(() => cryptIdleForTests());
afterEach(async () => { await cryptIdleForTests(); });
beforeEach(async () => { boot(); resetPrefs(); setIdentity({ id: UID, banned: false }); await cryptReady(); await cryptIdleForTests(); });

describe('Transfers kept routes', () => {
  it('keeps the newest 50; a computer seen again becomes the newest; no project or server is no route', () => {
    let v = withRoutes([], Array.from({ length: 50 }, (_, i) => pc(i)));
    v = withRoutes(v, [pc(0)]);
    v = withRoutes(v, [pc(50)]);
    expect(v).toHaveLength(50);
    expect(v.map((r) => r.id)).toContain('pc-0');
    expect(v.map((r) => r.id)).not.toContain('pc-1');
    expect(v.at(-1)).toEqual(route(50));
    expect(withRoutes(v, [pc(51, { server_name: '' })])).toBe(v);
    expect(withRoutes(v, [pc(50)])).toBe(v);
  });

  it('a route kept while another tab\'s value is still opening is kept for this page, never written then, and stored by the next keep once it reads ok', async () => {
    const { result } = renderHook(() => ({ keep: useKeepRoutes(), routed: useRoutes(), status: usePrefStatus(KEY, { keepAtSignOut: false }) }));
    act(() => { result.current.keep([pc(1)]); });
    await settle();
    // Another tab stores its own route; this tab reads it as opening while it decrypts.
    let theirs = '';
    await act(async () => {
      // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
      const before = localStorage.getItem(KEY);
      await writeSealedForTests(KEY, '', [route(1), route(2)]);
      // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
      theirs = localStorage.getItem(KEY) as string;
      // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
      if (before === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before);
    });
    act(() => {
      // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
      localStorage.setItem(KEY, theirs);
      // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
    });
    expect(result.current.status).toBe('loading');
    expect(result.current.routed('pc-3')).toBeNull();
    act(() => { result.current.keep([pc(3)]); });
    // Kept for this page at once; nothing is written while the store opens.
    expect(result.current.routed('pc-3')).toMatchObject({ project_id: 'p1', server_name: 's1', name: 'pc3' });
    await settle();
    await settle();
    await settle();
    expect(result.current.status).toBe('ok');
    expect(await storedForTests(KEY)).toEqual([route(1), route(2)]);
    expect(result.current.routed('pc-2')).toMatchObject({ name: 'pc2' });
    // Once it reads ok, the page's next keep (it runs again when the status changes) stores it, merged with theirs.
    act(() => { result.current.keep([pc(3)]); });
    await settle();
    expect(await storedForTests(KEY)).toEqual([route(1), route(2), route(3)]);
  });

  it('a route core cannot store (its stored value does not open here) is kept for this page, and the value is not written over', async () => {
    const { result } = renderHook(() => ({ keep: useKeepRoutes(), routed: useRoutes(), status: usePrefStatus(KEY, { keepAtSignOut: false }) }));
    act(() => { result.current.keep([pc(1)]); });
    await settle();
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    const d = JSON.parse(localStorage.getItem(KEY) as string) as { a: Record<string, Record<string, unknown>> };
    const leaf = d.a[UID]!;
    d.a[UID] = { ...leaf, ct: String(leaf.ct).split('').reverse().join('') }; // an envelope this browser cannot open
    const unreadable = JSON.stringify(d);
    act(() => {
      result.current.keep([pc(3)]);
      // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
      localStorage.setItem(KEY, unreadable); // another tab stored first
    });
    await settle();
    await settle();
    expect(result.current.status).toBe('locked');
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    expect(localStorage.getItem(KEY)).toBe(unreadable);
    expect(result.current.routed('pc-3')).toMatchObject({ project_id: 'p1', server_name: 's1', name: 'pc3' });
    // Kept for this account only: another account shown on the page never gets it.
    act(() => { setIdentity({ id: OTHER, banned: false }); });
    await settle();
    expect(result.current.routed('pc-3')).toBeNull();
  });

  it('a keep made once the stored value reads locked never writes over it, and is kept for this page', async () => {
    const { result } = renderHook(() => ({ keep: useKeepRoutes(), routed: useRoutes(), status: usePrefStatus(KEY, { keepAtSignOut: false }) }));
    act(() => { result.current.keep([pc(1)]); });
    await settle();
    await locked();
    expect(result.current.status).toBe('locked');
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    const bytes = localStorage.getItem(KEY);
    act(() => { result.current.keep([pc(3)]); });
    await settle();
    await settle();
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    expect(localStorage.getItem(KEY)).toBe(bytes);
    expect(result.current.routed('pc-3')).toMatchObject({ name: 'pc3', server_name: 's1' });
  });

  it('a computer already newest in the value shown while another tab\'s value opens is kept for this page, then stored as the newest', async () => {
    const { result } = renderHook(() => ({ keep: useKeepRoutes(), routed: useRoutes(), status: usePrefStatus(KEY, { keepAtSignOut: false }) }));
    act(() => { result.current.keep([pc(1)]); });
    await settle();
    // Another tab stores 50 newer routes without pc-1.
    const theirs = await sealed(Array.from({ length: 50 }, (_, i) => route(100 + i)));
    act(() => {
      // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
      localStorage.setItem(KEY, theirs);
      // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
    });
    expect(result.current.status).toBe('loading');
    act(() => { result.current.keep([pc(1)]); });
    await settle();
    await settle();
    await settle();
    // Their 50 open without pc-1; this page still has it, and the next keep stores it as the newest.
    expect(result.current.routed('pc-1')).toMatchObject({ name: 'pc1' });
    act(() => { result.current.keep([pc(1)]); });
    await settle();
    const stored = (await storedForTests(KEY)) as { id: string }[];
    expect(stored).toHaveLength(50);
    expect(stored.at(-1)).toEqual(route(1));
  });

  it('routes kept for this page end with the account (A, B, A again), with Forget, and with sign-out; a realm switch keeps them', async () => {
    const { result } = renderHook(() => ({ keep: useKeepRoutes(), routed: useRoutes() }));
    const pageOnly = async () => {
      act(() => { result.current.keep([pc(1)]); });
      await settle();
      await locked();
      act(() => { result.current.keep([pc(3)]); });
      await settle();
      expect(result.current.routed('pc-3')).not.toBeNull();
    };
    await pageOnly();
    act(() => { bump('switch'); });
    expect(result.current.routed('pc-3')).not.toBeNull();
    act(() => { setIdentity({ id: OTHER, banned: false }); bump('account'); });
    act(() => { setIdentity({ id: UID, banned: false }); bump('account'); });
    await settle();
    expect(result.current.routed('pc-3')).toBeNull();
    await cleared();
    await pageOnly();
    await act(async () => { await forgetThisBrowser(); });
    await settle();
    expect(result.current.routed('pc-3')).toBeNull();
    await cleared();
    await pageOnly();
    act(() => { bump('signout'); });
    expect(result.current.routed('pc-3')).toBeNull();
  });
});

/** Sealed bytes of `value` for the shown account, as another tab would store them; storage is put back. */
async function sealed(value: unknown): Promise<string> {
  let out = '';
  await act(async () => {
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    const before = localStorage.getItem(KEY);
    await writeSealedForTests(KEY, '', value);
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    out = localStorage.getItem(KEY) as string;
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    if (before === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before);
  });
  return out;
}

/** Another tab stores an envelope this browser cannot open; the store reads it as locked. */
async function locked(): Promise<void> {
  // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
  const d = JSON.parse(localStorage.getItem(KEY) as string) as { a: Record<string, Record<string, unknown>> };
  const leaf = d.a[UID]!;
  d.a[UID] = { ...leaf, ct: String(leaf.ct).split('').reverse().join('') };
  act(() => {
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    localStorage.setItem(KEY, JSON.stringify(d));
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
  });
  await settle();
  await settle();
}

/** Another tab removed the stored value: the store reads empty again. */
async function cleared(): Promise<void> {
  act(() => {
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    localStorage.removeItem(KEY);
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab's write to the kept routes and reads what core stored
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
  });
  await settle();
  await settle();
}
