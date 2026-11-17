// dispose.ts: a disposed session leaves no Web Lock behind. Two mounts share one lock manager (the host's), as two
// terminal mounts in one process do; the second must see a tab that is alone.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetTabLock, holdTabLock, otherTabs, tabHeld, TAB_LOCK, WIPE_LOCK } from './tab-lock';
import { boot, settle } from './test/env';
import { removeTestLocks } from './test/locks';
import { installWebLocks } from './test/web-locks';

afterEach(() => { removeTestLocks(); });

const names = (l: { held(): { name: string }[] }) => l.held().map((h) => h.name).sort();

describe('resetTabLock releases what the tab held or asked for', () => {
  it('a granted TAB_LOCK is released: the next mount on the same manager is alone', async () => {
    boot();
    removeTestLocks();
    const l = installWebLocks();
    holdTabLock();
    await vi.waitFor(() => expect(tabHeld()).toBe(true));
    expect(names(l)).toEqual([TAB_LOCK]);
    resetTabLock();
    await settle();
    expect(tabHeld()).toBe(false);
    expect(names(l)).toEqual([]);
    holdTabLock(); // the second mount
    await vi.waitFor(() => expect(tabHeld()).toBe(true));
    expect(names(l)).toEqual([TAB_LOCK]);
    expect(await otherTabs({ waiting: true })).toBe('alone');
  });
  it('a request still waiting (a wipe holds WIPE_LOCK) is dropped: it takes nothing once the wipe ends', async () => {
    boot();
    removeTestLocks();
    const l = installWebLocks();
    let endWipe!: () => void;
    l.asClient('wiping-tab', () => {
      const locks = (globalThis.navigator as unknown as { locks: { request: (n: string, o: object, cb: () => unknown) => Promise<unknown> } }).locks;
      void locks.request(WIPE_LOCK, { mode: 'exclusive' }, () => new Promise<void>((r) => { endWipe = r; }));
    });
    await settle();
    expect(names(l)).toEqual([WIPE_LOCK]);
    holdTabLock(); // waits behind the wipe
    await settle();
    expect(tabHeld()).toBe(false);
    const waiting = async () => ((await navigator.locks.query()).pending ?? []).map((p) => p.name);
    expect(await waiting()).toEqual([WIPE_LOCK]);
    resetTabLock();
    expect(await waiting()).toEqual([]); // dropped from the queue at once, not left to find out when the wipe ends
    endWipe();
    await settle();
    expect(names(l)).toEqual([]);
    expect(tabHeld()).toBe(false);
  });
  it('a reset between the WIPE_LOCK grant and the TAB_LOCK request leaves nothing held', async () => {
    boot();
    removeTestLocks();
    const l = installWebLocks();
    holdTabLock();
    resetTabLock(); // before any grant is delivered
    await settle();
    expect(tabHeld()).toBe(false);
    expect(names(l)).toEqual([]);
  });
  it('asks again after a reset', async () => {
    boot();
    removeTestLocks();
    const l = installWebLocks();
    holdTabLock();
    await vi.waitFor(() => expect(tabHeld()).toBe(true));
    resetTabLock();
    holdTabLock();
    await vi.waitFor(() => expect(tabHeld()).toBe(true));
    await settle();
    expect(names(l)).toEqual([TAB_LOCK]);
  });
  it('a grant delivered after a reset takes nothing, whichever lock it was for', async () => {
    boot();
    removeTestLocks();
    // A manager that grants when the test says, so a grant can land after the reset.
    const asks: Array<{ name: string; cb: (lock: unknown) => unknown; signal?: AbortSignal }> = [];
    Object.defineProperty(globalThis.navigator, 'locks', {
      configurable: true, writable: true,
      value: { request: (name: string, o: { signal?: AbortSignal }, cb: (lock: unknown) => unknown) => { asks.push({ name, cb, signal: o.signal }); return new Promise(() => {}); } },
    });
    holdTabLock();
    let outer = false;
    void (asks[0]!.cb({ name: WIPE_LOCK }) as Promise<void>).then(() => { outer = true; }); // the WIPE_LOCK grant: asks for TAB_LOCK
    expect(asks.map((a) => a.name)).toEqual([WIPE_LOCK, TAB_LOCK]);
    resetTabLock();
    expect(asks.every((a) => a.signal?.aborted)).toBe(true);
    expect(await asks[1]!.cb({ name: TAB_LOCK })).toBeUndefined(); // the grant that was already on its way
    expect(tabHeld()).toBe(false);
    await settle();
    expect(outer).toBe(true); // and the shared WIPE_LOCK hold it sat inside ended with it: a later exclusive wipe is not blocked
    holdTabLock();
    const n = asks.length;
    void asks[0]!.cb({ name: WIPE_LOCK }); // a late WIPE_LOCK grant of the first ask: asks for nothing
    expect(asks.length).toBe(n);
  });
});
