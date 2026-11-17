// prefs-update.test.tsx: usePrefUpdate, over the real shared.js registry and the encrypted store.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptIdleForTests, cryptReady, forgetThisBrowser, storedForTests, writeSealedForTests } from './cryptStore';
import { setIdentity } from './ctx';
import { accountPref, resetPrefs, useAccountPref, usePrefStatus, usePrefUpdate } from './prefs';
import { boot, OTHER, UID } from './test/env';

const KEY = 'hub_home_v1'; // account scope, purged at sign-out
type V = { a: string[] };
const parse = (raw: unknown): V => {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { a: Array.isArray(o.a) ? o.a.filter((x): x is string => typeof x === 'string') : [] };
};
const add = (x: string) => (v: V): V => ({ a: [...v.a, x] });
const show = (id: string) => setIdentity({ id, banned: false });
const settle = () => act(() => cryptIdleForTests());
let unblock: (() => void) | null = null;
afterEach(async () => { unblock?.(); await cryptIdleForTests(); });
beforeEach(async () => { boot(); resetPrefs(); show(UID); await cryptReady(); await cryptIdleForTests(); });

describe('usePrefUpdate: a change another tab beat is applied again on top of that tab\'s value', () => {
  it('every update since the last stored value is applied again, in order, to the value another tab stored first', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(add('theirs')); });
    await settle();
    const theirs = localStorage.getItem(KEY) as string; // another tab's value
    act(() => { result.current.update(() => ({ a: ['base'] })); });
    await settle();
    act(() => {
      result.current.update(add('hold-1'));
      result.current.update(add('hold-2'));
    });
    localStorage.setItem(KEY, theirs); // stored before this tab's writes take the lock
    await settle();
    await settle();
    expect(result.current.value).toEqual({ a: ['theirs', 'hold-1', 'hold-2'] });
    expect(await storedForTests(KEY)).toEqual({ a: ['theirs', 'hold-1', 'hold-2'] });
    expect(result.current.status).toBe('ok');
    expect(lost).not.toHaveBeenCalled();
  });

  it('a stored update is never applied again: after ok, a later conflict brings back only what came after', async () => {
    const { result } = renderHook(() => usePrefUpdate(KEY, parse));
    act(() => { result.current.update(add('one')); });
    await settle();
    const theirs = localStorage.getItem(KEY) as string;
    act(() => { result.current.update(add('two')); });
    await settle();
    expect(result.current.status).toBe('ok');
    act(() => { result.current.update(add('three')); });
    localStorage.setItem(KEY, theirs);
    await settle();
    await settle();
    expect(await storedForTests(KEY)).toEqual({ a: ['one', 'three'] }); // 'two' was stored once, then replaced by theirs
  });

  it('the browser refusing the store says so once, with the value the page wanted', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    unblock = () => { spy.mockRestore(); unblock = null; };
    act(() => { result.current.update(add('held')); });
    await settle();
    await settle();
    expect(lost).toHaveBeenCalledTimes(1);
    expect(lost).toHaveBeenCalledWith({ a: ['held'] });
    unblock();
    act(() => { result.current.update(add('next')); });
    await settle();
    expect(result.current.status).toBe('ok');
    expect(await storedForTests(KEY)).toEqual({ a: ['held', 'next'] });
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('a refused change applied again over another tab\'s value and refused again is not said a second time', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(add('theirs')); });
    await settle();
    const theirs = localStorage.getItem(KEY) as string; // another tab's value
    act(() => { result.current.update(() => ({ a: ['base'] })); });
    await settle();
    const put = Storage.prototype.setItem;
    let refuse = true;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (refuse) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
    unblock = () => { spy.mockRestore(); unblock = null; };
    act(() => { result.current.update(add('held')); });
    await settle();
    await settle();
    expect(result.current.status).toBe('unsaved');
    expect(lost).toHaveBeenCalledTimes(1);
    refuse = false;
    localStorage.setItem(KEY, theirs); // another tab stores; this browser still refuses this tab's stores
    refuse = true;
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY })); });
    for (let i = 0; i < 4; i++) await settle();
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('updates made for one part are never applied to the next part, nor said as its loss', async () => {
    const SK = 'hub_qcmd_v1'; // account+computer: one value per part
    const so = { scope: 'account+computer' as const };
    const list = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    unblock = () => { spy.mockRestore(); unblock = null; };
    const other = renderHook(() => useAccountPref(SK, list, { ...so, part: 'c2' }));
    act(() => { other.result.current[1](['c2-own']); }); // c2's own refused store, made by another writer of the page
    await settle();
    await settle();
    expect(renderHook(() => usePrefStatus(SK, { ...so, part: 'c2' })).result.current).toBe('unsaved');
    const lost = vi.fn();
    const { result, rerender } = renderHook(({ part }) => usePrefUpdate(SK, list, { ...so, part, onUnsaved: lost }), { initialProps: { part: 'c1' } });
    let r: boolean | undefined;
    act(() => {
      r = result.current.update((v) => [...v, 'c1-pending']);
      rerender({ part: 'c2' });
    });
    await settle();
    await settle();
    expect(result.current.value).not.toContain('c1-pending');
    expect(r).toBe(true);
    expect(lost.mock.calls).toEqual([[['c1-pending']]]); // c1's own refusal, said once; nothing about c2
  });

  it('updates made under one account are never applied under the next one', async () => {
    const { result } = renderHook(() => usePrefUpdate(KEY, parse));
    act(() => { result.current.update(add('first')); });
    await settle();
    const theirs = localStorage.getItem(KEY) as string;
    act(() => { result.current.update(add('pending')); });
    act(() => { show(OTHER); });
    await act(() => cryptReady());
    localStorage.setItem(KEY, theirs);
    await settle();
    await settle();
    expect(result.current.value).toEqual({ a: [] });
    expect(await storedForTests(KEY)).toBeNull();
  });
});

describe('usePrefUpdate: a full or refusing store', () => {
  const quota = () => {
    const put = Storage.prototype.setItem;
    const st = { refuse: true };
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (st.refuse) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
    unblock = () => { spy.mockRestore(); unblock = null; };
    return st;
  };
  /** Sealed bytes of `value` for the shown account (as another tab's store would write them); storage is put back. */
  async function sealedBytes(value: V): Promise<string> {
    let out = '';
    await act(async () => {
      const before = localStorage.getItem(KEY);
      await writeSealedForTests(KEY, '', value);
      out = localStorage.getItem(KEY) as string;
      if (before === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before);
    });
    return out;
  }

  it('two updates in one batch, no other tab: both are stored', async () => {
    const { result } = renderHook(() => usePrefUpdate(KEY, parse));
    act(() => {
      result.current.update(add('a'));
      result.current.update(add('b'));
    });
    await settle();
    expect(await storedForTests(KEY)).toEqual({ a: ['a', 'b'] });
    expect(result.current.value).toEqual({ a: ['a', 'b'] });
  });

  it('two components of the same pref, one batch: both updates are stored', async () => {
    const one = renderHook(() => usePrefUpdate(KEY, parse));
    const two = renderHook(() => usePrefUpdate(KEY, parse));
    act(() => {
      one.result.current.update(add('one'));
      two.result.current.update(add('two'));
    });
    await settle();
    expect(await storedForTests(KEY)).toEqual({ a: ['one', 'two'] });
  });

  it('a callback kept from the first account, called after a switch, is never applied under the next one, conflict included', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    const held = result.current.update; // e.g. a dialog's handler from the first account's render
    act(() => { show(OTHER); });
    await act(() => cryptReady());
    await settle();
    const theirs = await sealedBytes({ a: ['theirs'] }); // OTHER's value from another tab
    let r: boolean | undefined;
    act(() => {
      r = held(add('first-account'));
      result.current.update(add('mine'));
      localStorage.setItem(KEY, theirs); // stored first: OTHER's own update meets a conflict
    });
    await settle();
    await settle();
    expect(r).toBe(false);
    expect(lost).toHaveBeenCalledWith(null); // data-free: the change is not evaluated
    expect(lost).not.toHaveBeenCalledWith({ a: ['first-account'] });
    expect(JSON.stringify(await storedForTests(KEY))).not.toContain('first-account');
    expect(await storedForTests(KEY)).toEqual({ a: ['theirs', 'mine'] });
  });

  it('a callback kept from before a Forget on this browser, called after it, is not applied: false, said, never stored', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(add('kept')); });
    await settle();
    const held = result.current.update; // a handler from before the Forget
    await act(async () => { await forgetThisBrowser(); await cryptReady(); await cryptIdleForTests(); });
    await settle();
    let r: boolean | undefined;
    act(() => { r = held(add('pre-forget')); });
    await settle();
    await settle();
    expect(r).toBe(false);
    expect(lost).toHaveBeenCalledWith(null); // data-free: the change is not evaluated
    expect(lost).not.toHaveBeenCalledWith({ a: ['kept', 'pre-forget'] });
    expect(JSON.stringify(await storedForTests(KEY))).not.toContain('pre-forget');
  });

  it('a callback kept from one part, called after the hook moved to another, is not applied to either: false, said', async () => {
    const SK = 'hub_qcmd_v1'; // account+computer: one value per part
    const so = { scope: 'account+computer' as const };
    const list = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
    const lost = vi.fn();
    const { result, rerender } = renderHook(({ part }) => usePrefUpdate(SK, list, { ...so, part, onUnsaved: lost }), { initialProps: { part: 'c1' } });
    act(() => { result.current.update(() => ['c1-base']); });
    await settle();
    const held = result.current.update; // c1's handler
    rerender({ part: 'c2' });
    act(() => { result.current.update(() => ['c2-base']); });
    await settle();
    let r: boolean | undefined;
    act(() => { r = held((v) => [...v, 'late']); });
    await settle();
    await settle();
    expect(r).toBe(false);
    expect(lost.mock.calls).toEqual([[null]]);
    expect(await storedForTests(SK, 'c1')).toEqual(['c1-base']);
    expect(await storedForTests(SK, 'c2')).toEqual(['c2-base']);
  });

  it('an update pending at Forget is cleared: a conflict after Forget never brings it back', async () => {
    const { result } = renderHook(() => usePrefUpdate(KEY, parse));
    act(() => { result.current.update(add('kept')); });
    await settle();
    const q = quota();
    act(() => { result.current.update(add('pre-forget')); }); // refused by the browser: pending
    await settle();
    await settle();
    expect(result.current.status).toBe('unsaved');
    q.refuse = false;
    await act(async () => { await forgetThisBrowser(); await cryptReady(); await cryptIdleForTests(); });
    await settle();
    const theirs = await sealedBytes({ a: ['theirs'] }); // under the new key
    act(() => {
      result.current.update(add('post'));
      localStorage.setItem(KEY, theirs);
    });
    await settle();
    await settle();
    expect(JSON.stringify(await storedForTests(KEY))).not.toContain('pre-forget');
    expect(await storedForTests(KEY)).toEqual({ a: ['theirs', 'post'] });
  });

  it('an update made in the Forget window, before the page heard it, is said and never applied, nor is the one from before', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(add('kept')); });
    await settle();
    const q = quota();
    act(() => { result.current.update(add('pre-forget')); });
    await settle();
    await settle();
    expect(result.current.status).toBe('unsaved');
    q.refuse = false;
    let r: boolean | undefined;
    await act(async () => {
      await forgetThisBrowser();
      r = result.current.update(add('post')); // opening again; the page has not heard the Forget yet
    });
    await act(() => cryptReady());
    await settle();
    await settle();
    expect(r).toBe(true); // made while opening: accepted, then the Forget ends its scope
    expect(lost).toHaveBeenLastCalledWith({ a: ['post'] });
    expect(JSON.stringify(await storedForTests(KEY))).not.toContain('pre-forget');
    expect(JSON.stringify(await storedForTests(KEY))).not.toContain('post');
  });

  it('an update made while another tab\'s value is still opening is applied once it opens, not lost and not said', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(add('base')); });
    await settle();
    const theirs = await sealedBytes({ a: ['base', 'theirs'] });
    let r: boolean | undefined;
    act(() => {
      localStorage.setItem(KEY, theirs);
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
    });
    expect(result.current.status).toBe('loading');
    act(() => { r = result.current.update(add('during')); });
    await settle();
    await settle();
    await settle();
    expect(r).toBe(true);
    expect(lost).not.toHaveBeenCalled();
    expect(await storedForTests(KEY)).toEqual({ a: ['base', 'theirs', 'during'] });
  });

  it('another tab\'s winner that does not open here reads locked, and is never written over with defaults', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(add('base')); });
    await settle();
    const d = JSON.parse(localStorage.getItem(KEY) as string) as { a: Record<string, Record<string, unknown>> };
    const leaf = d.a[UID]!;
    d.a[UID] = { ...leaf, ct: String(leaf.ct).split('').reverse().join('') }; // an envelope this browser cannot open
    const unreadable = JSON.stringify(d);
    act(() => {
      result.current.update(add('mine'));
      localStorage.setItem(KEY, unreadable); // stored first
    });
    await settle();
    await settle();
    expect(result.current.status).toBe('locked');
    expect(localStorage.getItem(KEY)).toBe(unreadable);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('17 updates beaten by another tab: all 17 are applied again, none dropped', async () => {
    const { result } = renderHook(() => usePrefUpdate(KEY, parse));
    act(() => { result.current.update(() => ({ a: [] })); });
    await settle();
    const theirs = await sealedBytes({ a: ['theirs'] });
    const names = Array.from({ length: 17 }, (_, i) => 'u' + i);
    act(() => {
      for (const n of names) result.current.update(add(n));
      localStorage.setItem(KEY, theirs);
    });
    await settle();
    await settle();
    expect(await storedForTests(KEY)).toEqual({ a: ['theirs', ...names] });
  });

  it('a component unmounted while its update is on its way: another tab\'s value first, the update is still applied again', async () => {
    const lost = vi.fn();
    const { result, unmount } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(add('base')); });
    await settle();
    const theirs = await sealedBytes({ a: ['base', 'theirs'] });
    act(() => {
      result.current.update(add('held'));
      unmount(); // Back / close: the create step goes
      localStorage.setItem(KEY, theirs);
    });
    await settle();
    await settle();
    expect(await storedForTests(KEY)).toEqual({ a: ['base', 'theirs', 'held'] });
    expect(lost).not.toHaveBeenCalled();
  });
});

describe('usePrefUpdate: subscriptions end with the test', () => {
  const offs: (() => void)[] = [];
  afterEach(() => { for (const off of offs.splice(0)) off(); });
  /** Runs `then` once, synchronously inside the store's notice, the first time the status reads `when`: as the effect
   *  of a render the notice caused can, before the update's own driver (queued after the notice) has run. */
  const onceAt = (when: string, then: () => void) => {
    const pr = accountPref(KEY, parse);
    let done = false;
    offs.push(pr.subscribe(() => { if (!done && pr.status() === when) { done = true; then(); } }));
    return () => done;
  };
  async function sealedBytes(value: V): Promise<string> {
    let out = '';
    await act(async () => {
      const before = localStorage.getItem(KEY);
      await writeSealedForTests(KEY, '', value);
      out = localStorage.getItem(KEY) as string;
      if (before === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, before);
    });
    return out;
  }
  it('an update made at the conflict notice, before the driver ran, keeps the change the conflict beat', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(() => ({ a: ['base'] })); });
    await settle();
    const theirs = await sealedBytes({ a: ['theirs'] }); // another tab's value
    const fired = onceAt('conflict', () => { result.current.update(add('second')); });
    act(() => {
      result.current.update(add('first'));
      localStorage.setItem(KEY, theirs); // stored before this tab's write takes the lock
    });
    for (let i = 0; i < 4; i++) await settle();
    expect(fired()).toBe(true);
    expect(await storedForTests(KEY)).toEqual({ a: ['theirs', 'first', 'second'] });
    expect(result.current.value).toEqual({ a: ['theirs', 'first', 'second'] });
    expect(lost).not.toHaveBeenCalled();
  });

  it('an update made at the stored notice, before the driver ran, does not bring the stored change back on a later conflict', async () => {
    const { result } = renderHook(() => usePrefUpdate(KEY, parse));
    act(() => { result.current.update(add('one')); });
    await settle();
    const theirs = localStorage.getItem(KEY) as string; // another tab's value, before 'two'
    const fired = onceAt('ok', () => {
      result.current.update(add('three'));
      localStorage.setItem(KEY, theirs); // another tab stores first
    });
    act(() => { result.current.update(add('two')); });
    for (let i = 0; i < 4; i++) await settle();
    expect(fired()).toBe(true);
    expect(await storedForTests(KEY)).toEqual({ a: ['one', 'three'] }); // 'two' was stored once, then replaced by theirs
  });

  it('an update made at the opening notice, before the driver ran, and the one made while opening are each applied once', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    act(() => { result.current.update(add('base')); });
    await settle();
    const theirs = await sealedBytes({ a: ['base', 'theirs'] });
    act(() => {
      localStorage.setItem(KEY, theirs);
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, storageArea: localStorage }));
    });
    expect(result.current.status).toBe('loading');
    let r: boolean | undefined;
    act(() => { r = result.current.update(add('first')); }); // refused while opening: applied once open
    const fired = onceAt('ok', () => { result.current.update(add('second')); });
    for (let i = 0; i < 4; i++) await settle();
    expect(r).toBe(true);
    expect(fired()).toBe(true);
    expect(await storedForTests(KEY)).toEqual({ a: ['base', 'theirs', 'first', 'second'] });
    expect(lost).not.toHaveBeenCalled();
  });

  it('nothing stored before: a change on its way when Forget runs is said and never stored (the slot reads ok, not locked)', async () => {
    const lost = vi.fn();
    const { result } = renderHook(() => usePrefUpdate(KEY, parse, { onUnsaved: lost }));
    expect(localStorage.getItem(KEY)).toBeNull(); // no leaf: after the Forget this slot reads 'ok', so no 'locked' drop
    let r: boolean | undefined;
    await act(async () => {
      r = result.current.update(add('in-flight')); // accepted; its seal is on its way
      await forgetThisBrowser();
    });
    await act(() => cryptReady());
    for (let i = 0; i < 4; i++) await settle();
    expect(r).toBe(true);
    expect(result.current.status).toBe('ok');
    expect(lost).toHaveBeenCalledWith({ a: ['in-flight'] });
    expect(JSON.stringify(await storedForTests(KEY))).not.toContain('in-flight');
  });

  it('a callback from an earlier part tells that part\'s handler, without its data', async () => {
    const SK = 'hub_qcmd_v1'; // account+computer: one value per part
    const so = { scope: 'account+computer' as const };
    const list = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
    const heard: [string, unknown][] = [];
    let evaluated = false;
    const { result, rerender } = renderHook(({ part }) => usePrefUpdate(SK, list, { ...so, part, onUnsaved: (w) => { heard.push([part, w]); } }), { initialProps: { part: 'c1' } });
    act(() => { result.current.update(() => ['c1-base']); });
    await settle();
    const held = result.current.update; // c1's handler
    rerender({ part: 'c2' });
    await settle();
    let r: boolean | undefined;
    act(() => { r = held((v) => { evaluated = true; return [...v, 'late']; }); });
    await settle();
    expect(r).toBe(false);
    expect(evaluated).toBe(false);
    expect(heard).toEqual([['c1', null]]);
  });
});
