// local-wipe.ts + tab-lock.ts + lifecycle.ts signOutWiping: Remove all local data (fail closed).
// Other Hub tabs, a store that cannot be read or listed, a payment not proven settled,
// another session or a grown warning refuse before anything happens; the wipe is the last step before the page leaves
// and is a success only when every store reads back cleared.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdAttempt } from './attempts';
import { holdLeave } from './leave';
import { setIdentity } from './ctx';
import { configureLifecycle, initLive, logout, onLifecycle, signOutWiping, type LifecycleEvent } from './lifecycle';
import { localWipeWarning, removeLocalData, uncheckedStores, warningWithin, wipeOriginStorage } from './local-wipe';
import { putScriptAsk, type ScriptAsk } from './script-asks';
import { otherTabs, tabHeld } from './tab-lock';
import { boot, OTHER, R1, settle, signIn, UID } from './test/env';
import { removeTestLocks } from './test/locks';
import { installWebLocks, openOtherTab, type WebLocks } from './test/web-locks';

type Win = { navs: string[]; events: LifecycleEvent[]; locks: WebLocks };
const offs: Array<() => void> = [];
afterEach(async () => {
  while (offs.length) offs.pop()!();
  removeTestLocks();
  delete (window as { HubBootToken?: unknown }).HubBootToken;
  await new Promise((r) => setTimeout(r, 50)); // a sign-out a test started finishes before the next test boots
});

/** This tab, booted with navigator.locks (modes and query) and holding its Hub tab lock. */
async function tab(o: { noQuery?: boolean } = {}): Promise<Win> {
  boot({ realm: R1 });
  const locks = installWebLocks(o);
  const w: Win = { navs: [], events: [], locks };
  configureLifecycle({ navigate: (u) => w.navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  offs.push(onLifecycle((e) => w.events.push(e)));
  (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
  await vi.waitFor(() => expect(tabHeld()).toBe(true));
  await settle();
  return w;
}
const hold = async (lock = 'keys:create') => {
  const r = await holdAttempt(lock, { by: lock });
  if (!r.ok) throw new Error('not held: ' + r.code);
  r.hold.sent(); // answered with an unknown outcome: held, no send out
  await settle();
  return r.hold.id;
};
const ask = (askId: string): ScriptAsk => ({
  askId, compId: 'comp-1', path: 'scripts/a.ts', realm: R1, owner: null, sessionId: null, turnId: null,
  phase: 'create', sentAt: 1000, createKey: 'hub-ck-' + askId, turnKey: 'hub-tk-' + askId,
});
const run = { minWaitMs: 0, endMs: 1 };
/** A sign-out whose session end waits until the returned release() is called. */
function slowEnd(): { release: () => void; started: () => boolean } {
  let release: (() => void) | null = null;
  (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => new Promise<void>((r) => { release = r; }) };
  return { release: () => release?.(), started: () => release !== null };
}

/** A fake IndexedDB factory: lists `names`, deletes each (or refuses `refuse`), records what was deleted. */
function fakeIdb(names: string[], o: { refuse?: string; hang?: string } = {}) {
  const deleted: string[] = [];
  const idb = {
    databases: () => Promise.resolve(names.filter((n) => !deleted.includes(n)).map((name) => ({ name, version: 1 }))),
    deleteDatabase: (name: string) => {
      const r = {} as IDBOpenDBRequest & { onsuccess: (() => void) | null; onerror: (() => void) | null };
      setTimeout(() => {
        if (name === o.hang) return;
        if (name === o.refuse) r.onerror?.();
        else { deleted.push(name); r.onsuccess?.(); }
      }, 0);
      return r;
    },
  } as unknown as IDBFactory;
  return { idb, deleted };
}
function fakeCaches(names: string[]) {
  const left = new Set(names);
  const cs = { keys: () => Promise.resolve([...left]), delete: (k: string) => Promise.resolve(left.delete(k)) } as unknown as CacheStorage;
  return { cs, left };
}

describe('wipeOriginStorage', () => {
  it('clears local and session storage, deletes every listed IndexedDB database and cache, and writes the sign-in fences again', async () => {
    localStorage.setItem('hub.v3.changes', '[]');
    localStorage.setItem(`hub_boot_token_epoch:${UID}`, 'old-epoch');
    localStorage.setItem(`hub_boot_token_epoch:${OTHER}`, 'old-other');
    localStorage.setItem('hub_auth_rev', 'old-rev');
    sessionStorage.setItem('hub_buy_resume', '{}');
    const { idb, deleted } = fakeIdb(['hoody-hub-crypt', 'some-other-db']);
    const { cs, left } = fakeCaches(['hub-v3', 'fonts']);
    expect(await wipeOriginStorage({ idb, caches: cs })).toBe(true);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem('hub.v3.changes')).toBeNull();
    const e1 = localStorage.getItem(`hub_boot_token_epoch:${UID}`);
    const e2 = localStorage.getItem(`hub_boot_token_epoch:${OTHER}`);
    const rev = localStorage.getItem('hub_auth_rev');
    expect(e1 && e1 !== 'old-epoch' && e2 && e2 !== 'old-other' && rev && rev !== 'old-rev').toBeTruthy();
    expect(localStorage.length).toBe(3);
    expect(deleted.sort()).toEqual(['hoody-hub-crypt', 'some-other-db']);
    expect(left.size).toBe(0);
  });
  it('a database the browser refuses to delete is a failed wipe', async () => {
    const { idb } = fakeIdb(['hoody-hub-crypt'], { refuse: 'hoody-hub-crypt' });
    expect(await wipeOriginStorage({ idb, caches: null })).toBe(false);
  });
  it('a delete that never answers (another tab holds it open) is a failed wipe at the bound, never a hang', async () => {
    const { idb } = fakeIdb(['hoody-hub-crypt'], { hang: 'hoody-hub-crypt' });
    expect(await wipeOriginStorage({ idb, caches: null, ms: 30 })).toBe(false);
  });
  it('a browser without IndexedDB or Cache Storage still wipes storage', async () => {
    localStorage.setItem('hub.v3.shell', '{}');
    expect(await wipeOriginStorage({ idb: null, caches: null })).toBe(true);
    expect(localStorage.getItem('hub.v3.shell')).toBeNull();
  });
  it('IndexedDB that cannot list its databases is a failed wipe and deletes nothing by guess', async () => {
    localStorage.setItem('hub.v3.shell', '{}');
    const deleted: string[] = [];
    const idb = { deleteDatabase: (n: string) => { deleted.push(n); return {} as IDBOpenDBRequest; } } as unknown as IDBFactory;
    expect(await wipeOriginStorage({ idb, caches: null })).toBe(false);
    expect(deleted).toEqual([]);
  });
  it('a database list the browser refuses is a failed wipe, even when a later list comes back empty', async () => {
    const { idb } = fakeIdb([]);
    let asked = 0;
    (idb as { databases: () => Promise<unknown> }).databases = () => (asked++ === 0 ? Promise.reject(new Error('no')) : Promise.resolve([]));
    expect(await wipeOriginStorage({ idb, caches: null })).toBe(false);
  });
  it('a database still listed after the deletes is a failed wipe', async () => {
    const idb = {
      databases: () => Promise.resolve([{ name: 'kept-db', version: 1 }]),
      deleteDatabase: () => {
        const r = {} as IDBOpenDBRequest & { onsuccess: (() => void) | null };
        setTimeout(() => r.onsuccess?.(), 0); // answers success but the list keeps it
        return r;
      },
    } as unknown as IDBFactory;
    expect(await wipeOriginStorage({ idb, caches: null })).toBe(false);
  });
  it('a cache still there after the deletes is a failed wipe', async () => {
    const cs = { keys: () => Promise.resolve(['hub-v3']), delete: () => Promise.resolve(true) } as unknown as CacheStorage;
    expect(await wipeOriginStorage({ idb: null, caches: cs })).toBe(false);
  });
  it('past the bound the run starts no further delete', async () => {
    let list!: (v: { name: string; version: number }[]) => void;
    const deleted: string[] = [];
    const idb = {
      databases: () => new Promise((r) => { list = r; }),
      deleteDatabase: (name: string) => { deleted.push(name); return {} as IDBOpenDBRequest; },
    } as unknown as IDBFactory;
    expect(await wipeOriginStorage({ idb, caches: null, ms: 30 })).toBe(false);
    list([{ name: 'late-db', version: 1 }]);
    await new Promise((r) => setTimeout(r, 20));
    expect(deleted).toEqual([]);
  });
  it('past the time bound no delete starts, even when the timer has not fired yet', async () => {
    const deleted: string[] = [];
    const idb = {
      databases: () => {
        const t = Date.now();
        while (Date.now() - t < 40) { /* the page is busy past the bound */ }
        return Promise.resolve([{ name: 'x', version: 1 }]);
      },
      deleteDatabase: (name: string) => { deleted.push(name); return {} as IDBOpenDBRequest; },
    } as unknown as IDBFactory;
    expect(await wipeOriginStorage({ idb, caches: null, ms: 5 })).toBe(false);
    expect(deleted).toEqual([]);
  });
});

describe('other Hub tabs', () => {
  it('this tab alone holds the Hub tab lock: alone; another tab open: open; refused, nothing signed out', async () => {
    const w = await tab();
    expect(await otherTabs({ waiting: true })).toBe('alone');
    openOtherTab(w.locks, 'tab-2');
    await vi.waitFor(async () => expect(await otherTabs()).toBe('open'));
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'tabs' });
    await settle();
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
    // Closed: the wipe goes on.
    w.locks.closeClient('tab-2');
    await vi.waitFor(async () => expect(await otherTabs()).toBe('alone'));
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
  });
  it('no lock API, a lock API without query, or this tab without its own lock: refused as tabs', async () => {
    let w = await tab({ noQuery: true });
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'tabs' });
    removeTestLocks();
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'tabs' });
    w = await tab();
    // This tab without its own lock: another holder of WIPE_LOCK (shared) kept this tab's request waiting.
    boot({ realm: R1 });
    const locks = installWebLocks();
    locks.asClient('tab-3', () => {
      void (navigator as unknown as { locks: { request: (n: string, o: object, cb: () => unknown) => Promise<unknown> } }).locks
        .request('hub-wipe', { mode: 'exclusive' }, () => new Promise<void>(() => {}));
    });
    configureLifecycle({ navigate: (u) => w.navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    await settle();
    expect(tabHeld()).toBe(false);
    expect(await otherTabs()).toBe('unknown');
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'tabs' });
    expect(w.navs).toEqual([]);
  });
  it('a tab being opened (waiting for its lock) counts as open', async () => {
    const w = await tab();
    w.locks.asClient('tab-4', () => {
      void (navigator as unknown as { locks: { request: (n: string, o: object, cb: () => unknown) => Promise<unknown> } }).locks
        .request('hub-tab', { mode: 'exclusive' }, () => new Promise<void>(() => {}));
    });
    await vi.waitFor(async () => expect(await otherTabs({ waiting: true })).toBe('open'));
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'tabs' });
  });
  it('a second press while the first signs out: refused (the wipe lock is held), one sign-out', async () => {
    const w = await tab();
    const shown = localWipeWarning()!;
    const first = removeLocalData(shown, run);
    const second = removeLocalData(shown, run);
    expect(await first).toEqual({ kind: 'started' });
    expect((await second).kind).not.toBe('started');
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
  });
  it('a tab opened while the wipe holds its lock does not hold the tab lock until the wipe ends', async () => {
    const w = await tab();
    const end = slowEnd();
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000 })).toEqual({ kind: 'started' });
    openOtherTab(w.locks, 'tab-5');
    await settle();
    expect(w.locks.held().filter((h) => h.name === 'hub-tab' && h.clientId === 'tab-5')).toEqual([]);
    end.release();
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
  });
});

describe('the tab count at its edges', () => {
  it("this tab's own lock not held while another tab holds one: never alone", async () => {
    const w = await tab();
    boot({ realm: R1 });
    const locks = installWebLocks();
    openOtherTab(locks, 'tab-6');
    await vi.waitFor(() => expect(locks.held().some((h) => h.clientId === 'tab-6' && h.name === 'hub-tab')).toBe(true));
    locks.asClient('tab-7', () => {
      void (navigator as unknown as { locks: { request: (n: string, o: object, cb: () => unknown) => Promise<unknown> } }).locks
        .request('hub-wipe', { mode: 'exclusive' }, () => new Promise<void>(() => {}));
    });
    configureLifecycle({ navigate: (u) => w.navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    await settle();
    expect(tabHeld()).toBe(false);
    expect(await otherTabs()).not.toBe('alone');
  });
  it('a tab that took the tab lock outside the protocol while the sign-out waits: the wipe keeps everything', async () => {
    const w = await tab();
    const end = slowEnd();
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000 })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(end.started()).toBe(true));
    w.locks.asClient('tab-8', () => {
      void (navigator as unknown as { locks: { request: (n: string, o: object, cb: () => unknown) => Promise<unknown> } }).locks
        .request('hub-tab', { mode: 'shared' }, () => new Promise<void>(() => {}));
    });
    await vi.waitFor(() => expect(w.locks.held().some((h) => h.clientId === 'tab-8')).toBe(true));
    localStorage.setItem('hub.v3.shell', '{"kept":1}');
    end.release();
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":1}');
  });
  it('the session check runs first: a replaced session answers changed even without the lock API', async () => {
    await tab();
    const shown = localWipeWarning()!;
    signIn(OTHER, 'sid0000000000002');
    removeTestLocks();
    expect(await removeLocalData(shown, run)).toEqual({ kind: 'changed' });
  });
});

describe('every store readable, every payment settled', () => {
  it('a payment whose outcome is open in this browser, any account: refused as payments, nothing happens', async () => {
    const w = await tab();
    localStorage.setItem('hub_money_pending', JSON.stringify([{ kind: 'pay', user_id: OTHER, key: 'kpay00000000000004', max_charge_cents: 500, at: 4, sub_id: 'sub4' }]));
    expect(localWipeWarning()!.payments).toBe('held');
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'payments' });
    await settle();
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('hub_money_pending')).toContain('kpay00000000000004');
  });
  it('a kept checkout return or resume marker is a payment not proven settled', async () => {
    await tab();
    for (const k of ['hub_topup_return', 'hub_buy_resume', 'hub_market_resume']) {
      sessionStorage.setItem(k, '{}');
      expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'payments' });
      sessionStorage.removeItem(k);
    }
    for (const k of ['hub_money_upgrade', 'hub_market_pending', 'hub.v3.rent_pending', 'hub.v3.topup_pending']) {
      localStorage.setItem(k, JSON.stringify([{ user_id: UID }]));
      expect((await removeLocalData(localWipeWarning()!, run)).kind).toBe('payments');
      localStorage.removeItem(k);
    }
  });
  it('a payment list that cannot be read: unchecked payments (never read as empty)', async () => {
    await tab();
    localStorage.setItem('hub_money_pending', '{"not":"a list"}');
    expect(localWipeWarning()!.payments).toBe('unreadable');
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'unchecked', what: ['payments'] });
  });
  it('IndexedDB without a database list, or a cache list that fails: unchecked, named', async () => {
    const w = await tab();
    const idb = { deleteDatabase: () => ({}) } as unknown as IDBFactory;
    const caches = { keys: () => Promise.reject(new Error('no')) } as unknown as CacheStorage;
    expect(await uncheckedStores(UID, { idb, caches })).toEqual(['databases', 'caches']);
    expect(await removeLocalData(localWipeWarning()!, { ...run, idb, caches })).toEqual({ kind: 'unchecked', what: ['databases', 'caches'] });
    await settle();
    expect(w.navs).toEqual([]);
  });
  it('an unreadable change store or question list: unchecked, named', async () => {
    await tab();
    localStorage.setItem('hub.v3.changes', '{broken');
    expect(await uncheckedStores(UID)).toContain('changes');
  });
});

describe('the session and the warning', () => {
  it('signs out and wipes this browser, every account\'s records included, then leaves for sign-in', async () => {
    const w = await tab();
    await hold();
    const { idb, deleted } = fakeIdb(['hoody-hub-crypt']);
    const shown = localWipeWarning()!;
    expect(shown.holds).toHaveLength(1);
    expect(await removeLocalData(shown, { ...run, idb, caches: null })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('hub.v3.changes')).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(deleted).toEqual(['hoody-hub-crypt']);
  });
  it("names the shown account's holds and asks", async () => {
    await tab();
    await hold();
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    const w = localWipeWarning()!;
    expect(w.account).toBe(UID);
    expect(w.holds).toHaveLength(1);
    expect(w.holds[0]?.page).toBeNull(); // an attempt names no page
    expect(w.asks.map((a) => a.askId)).toEqual(['a1']);
    expect(w.payments).toBe('settled');
  });
  it("anything the confirm did not show: 'changed', nothing wiped, still signed in", async () => {
    const w = await tab();
    const shown = localWipeWarning()!;
    await hold();
    expect(warningWithin(localWipeWarning()!, shown)).toBe(false);
    expect(await removeLocalData(shown, run)).toEqual({ kind: 'changed' });
    await settle();
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });
  it("another account shown now: 'changed', nobody signed out", async () => {
    const w = await tab();
    const shown = localWipeWarning()!;
    setIdentity({ id: OTHER, banned: false });
    expect(await removeLocalData(shown, run)).toEqual({ kind: 'changed' });
    setIdentity({ id: UID, banned: false });
    await settle();
    expect(w.navs).toEqual([]);
  });
  it('the session check comes first: a session another tab stored refuses before any store is read', async () => {
    const w = await tab();
    const shown = localWipeWarning()!;
    signIn(OTHER, 'sid0000000000002');
    const theirs = localStorage.getItem('access_token');
    const reads = vi.spyOn(localStorage, 'getItem');
    reads.mockClear();
    expect(await removeLocalData(shown, run)).toEqual({ kind: 'changed' });
    // The spy sees the session check's own read (never vacuous), and nothing else.
    expect(reads.mock.calls.some(([k]) => k === 'access_token')).toBe(true);
    expect(reads.mock.calls.filter(([k]) => k !== 'access_token' && k !== 'refresh_token')).toEqual([]);
    reads.mockRestore();
    await settle();
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).toBe(theirs);
  });
  it('a wipe that fails keeps the page on the purge-failed panel; its Try again wipes again and then leaves', async () => {
    const w = await tab();
    const answers = [false, true];
    let runs = 0;
    const wipe = () => { runs += 1; return Promise.resolve(answers.shift() ?? true); };
    expect(signOutWiping(UID, () => true, wipe, run)).toBe('done');
    await vi.waitFor(() => expect(w.events.some((e) => e.kind === 'purge-failed')).toBe(true), { timeout: 4000 });
    expect(w.navs).toEqual([]);
    expect(runs).toBe(1);
    logout();
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(runs).toBe(2);
  });
  it('a wipe that throws counts as failed, never as done', async () => {
    const w = await tab();
    expect(signOutWiping(UID, () => true, () => Promise.reject(new Error('x')), run)).toBe('done');
    await vi.waitFor(() => expect(w.events.some((e) => e.kind === 'purge-failed')).toBe(true), { timeout: 4000 });
    expect(w.navs).toEqual([]);
  });
  it("a warning that cannot be read: 'failed', nothing happens", async () => {
    const w = await tab();
    expect(signOutWiping(UID, () => { throw new Error('unreadable'); }, () => Promise.resolve(true), run)).toBe('failed');
    await settle();
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });
});

describe('while the sign-out waits', () => {
  it('a payment another tab stores during the wait is kept: nothing is wiped and the page leaves signed out', async () => {
    const w = await tab();
    const end = slowEnd();
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000 })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(end.started()).toBe(true));
    localStorage.setItem('hub_money_pending', JSON.stringify([{ kind: 'pay', user_id: OTHER, key: 'kpay00000000000009', max_charge_cents: 500, at: 9, sub_id: 'sub9' }]));
    end.release();
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(localStorage.getItem('hub_money_pending')).toContain('kpay00000000000009');
  });
  it("another account's session stored during the wait is never wiped", async () => {
    const w = await tab();
    const end = slowEnd();
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000 })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(end.started()).toBe(true));
    signIn(OTHER, 'sid0000000000002');
    const theirs = localStorage.getItem('access_token');
    end.release();
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(localStorage.getItem('access_token')).toBe(theirs);
  });
  it('a change store that became unreadable during the wait keeps everything (never read as empty)', async () => {
    const w = await tab();
    const end = slowEnd();
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000 })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(end.started()).toBe(true));
    localStorage.setItem('hub.v3.changes', '{broken');
    localStorage.setItem('hub.v3.shell', '{"kept":1}');
    end.release();
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":1}');
  });
});

describe('the wipe keeps everything it cannot check', () => {
  it('a tab opened during the sign-out wait (waiting for the wipe lock) keeps everything', async () => {
    const w = await tab();
    const end = slowEnd();
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000 })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(end.started()).toBe(true));
    openOtherTab(w.locks, 'tab-r2');
    await settle();
    localStorage.setItem('hub.v3.shell', '{"kept":2}');
    end.release();
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":2}');
  });
  // Unreadable storage at the end of Remove all local data is a failed purge (the panel, no leave):
  // it proves neither that the session is gone nor that another one is stored. Nothing is wiped either way.
  it('another session stored during the wait whose storage read throws is never wiped (unreadable is not absent)', async () => {
    const w = await tab();
    const end = slowEnd();
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000 })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(end.started()).toBe(true));
    signIn(OTHER, 'sid0000000000002');
    localStorage.setItem('hub.v3.shell', '{"kept":3}');
    const real = localStorage.getItem.bind(localStorage);
    const reads = vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => {
      if (k === 'access_token') throw new Error('unreadable');
      return real(k);
    });
    end.release();
    try {
      await vi.waitFor(() => expect(w.events.some((e) => e.kind === 'purge-failed')).toBe(true));
    } finally { reads.mockRestore(); }
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":3}');
    expect(localStorage.getItem('access_token')).not.toBeNull();
  });
  it('a token session stored during the wait, with a read of the absent access_token throwing, is never wiped', async () => {
    const w = await tab();
    const end = slowEnd();
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000 })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(end.started()).toBe(true));
    // Another tab replaced the session with a token-only one: no access_token key at all.
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    const rec = JSON.stringify({ v: 1, token: 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48), realm: 'all', sid: 'tsid000000000002', at: 1, owner: { id: OTHER, username: 'other' } });
    localStorage.setItem('hub_token_session_v1', rec);
    localStorage.setItem('hub.v3.shell', '{"kept":31}');
    const real = localStorage.getItem.bind(localStorage);
    const reads = vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => {
      if (k === 'access_token') throw new Error('unreadable'); // absent, and its read fails
      return real(k);
    });
    end.release();
    try {
      await vi.waitFor(() => expect(w.events.some((e) => e.kind === 'purge-failed')).toBe(true));
    } finally { reads.mockRestore(); }
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":31}');
    expect(localStorage.getItem('hub_token_session_v1')).toBe(rec);
  });
  it('a database list that fails after the wait removes nothing (listed before anything is removed)', async () => {
    const w = await tab();
    const end = slowEnd();
    let lists = 0;
    const idb = {
      databases: () => (lists++ === 0 ? Promise.resolve([]) : Promise.reject(new Error('no'))),
      deleteDatabase: () => ({}) as IDBOpenDBRequest,
    } as unknown as IDBFactory;
    expect(await removeLocalData(localWipeWarning()!, { minWaitMs: 0, endMs: 3000, idb, caches: null })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(end.started()).toBe(true));
    localStorage.setItem('hub.v3.shell', '{"kept":4}');
    end.release();
    await vi.waitFor(() => expect(w.events.some((e) => e.kind === 'purge-failed')).toBe(true), { timeout: 4000 });
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":4}');
  });
  it('storage that cannot be listed removes nothing', async () => {
    localStorage.setItem('hub.v3.shell', '{"kept":5}');
    const keys = vi.spyOn(sessionStorage, 'key').mockImplementation(() => { throw new Error('unreadable'); });
    sessionStorage.setItem('hub_x', '1');
    const r = await wipeOriginStorage({ idb: null, caches: null });
    keys.mockRestore();
    expect(r).toBe(false);
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":5}');
  });
  it('the wipe step admission runs after the stores were listed and before the clear; refused, nothing removed', async () => {
    localStorage.setItem('hub.v3.shell', '{"kept":6}');
    const order: string[] = [];
    const { idb } = fakeIdb(['db1']);
    const list = (idb as { databases: () => Promise<unknown> }).databases;
    (idb as { databases: () => Promise<unknown> }).databases = () => { order.push('list'); return list(); };
    const r = await wipeOriginStorage({ idb, caches: null, admit: () => { order.push('admit'); return Promise.resolve(false); } });
    expect(r).toBe('kept');
    expect(order).toEqual(['list', 'admit']);
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":6}');
  });
  it('a write during the last read-back wait is seen (storage is read back last)', async () => {
    let n = 0;
    const cs = { keys: () => { n += 1; if (n === 2) localStorage.setItem('hub.v3.late', '1'); return Promise.resolve([]); }, delete: () => Promise.resolve(true) } as unknown as CacheStorage;
    expect(await wipeOriginStorage({ idb: null, caches: cs })).toBe(false);
    expect(n).toBe(2);
  });
  it("a database named '' is deleted like any other; an entry with no name removes nothing", async () => {
    const { idb, deleted } = fakeIdb(['']);
    expect(await wipeOriginStorage({ idb, caches: null })).toBe(true);
    expect(deleted).toEqual(['']);
    localStorage.setItem('hub.v3.shell', '{"kept":7}');
    const removed: string[] = [];
    const odd = { databases: () => Promise.resolve([{ version: 1 }]), deleteDatabase: (n: string) => { removed.push(n); return {} as IDBOpenDBRequest; } } as unknown as IDBFactory;
    expect(await wipeOriginStorage({ idb: odd, caches: null })).toBe(false);
    expect(removed).toEqual([]);
    expect(localStorage.getItem('hub.v3.shell')).toBe('{"kept":7}');
  });
  it('a check that never answers refuses within its bound and lets the wipe lock go; a late answer starts nothing', async () => {
    const w = await tab();
    let answer!: (v: unknown) => void;
    const idb = { databases: () => new Promise((r) => { answer = r; }), deleteDatabase: () => ({}) as IDBOpenDBRequest } as unknown as IDBFactory;
    const hung = new Promise((r) => setTimeout(() => r('hung'), 1500));
    expect(await Promise.race([removeLocalData(localWipeWarning()!, { ...run, checkMs: 50, idb, caches: null }), hung])).toEqual({ kind: 'unchecked', what: ['databases'] });
    answer([]);
    await settle();
    expect(w.navs).toEqual([]);
    expect(w.locks.held().filter((h) => h.name === 'hub-wipe' && h.mode === 'exclusive')).toEqual([]);
    // The lock was let go: a second try is checked again, not refused as busy.
    const idb2 = fakeIdb([]).idb;
    expect(await removeLocalData(localWipeWarning()!, { ...run, idb: idb2, caches: null })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
  });
  it('a tab query that never answers refuses as tabs within the bound', async () => {
    const w = await tab();
    const api = (navigator as unknown as { locks: { query: () => Promise<unknown> } }).locks;
    api.query = () => new Promise(() => { /* never */ });
    const hung = new Promise((r) => setTimeout(() => r('hung'), 1500));
    expect(await Promise.race([removeLocalData(localWipeWarning()!, { ...run, checkMs: 50 }), hung])).toEqual({ kind: 'tabs' });
    expect(w.navs).toEqual([]);
  });
});

describe('work running from this tab', () => {
  it('the warning counts it; more running at the confirm than it named refuses (changed), nothing signed out', async () => {
    const w = await tab();
    const shown = localWipeWarning()!;
    expect(shown.running).toBe(0);
    const release = holdLeave('upload');
    offs.push(release);
    expect(localWipeWarning()!.running).toBe(1);
    expect(warningWithin(localWipeWarning()!, shown)).toBe(false);
    expect(warningWithin(shown, localWipeWarning()!)).toBe(true);
    expect(await removeLocalData(shown, run)).toEqual({ kind: 'changed' });
    await settle();
    expect(w.navs).toEqual([]);
    expect(localStorage.getItem('access_token')).not.toBeNull();
    // The warning that names it goes on.
    expect(await removeLocalData(localWipeWarning()!, run)).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
  });
});
