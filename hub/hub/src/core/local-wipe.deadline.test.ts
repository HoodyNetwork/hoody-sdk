// local-wipe.ts removeLocalData: the checks' absolute deadline.
// An answer that settles after the deadline (a late timer, a busy page) never counts as checked; a deadline that passes
// between two checks starts no further check; one that passes before the sign-out refuses it. Each refusal keeps the
// existing timeout words ('tabs' for the tab query, 'unchecked' naming the stores), signs nobody out, wipes nothing
// and lets the 'hub-wipe' lock go, so a later try is checked again. The clock is moved forward with the timer not yet
// fired: the case a timer race alone cannot see.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLifecycle, initLive } from './lifecycle';
import { holdLeave } from './leave';
import { localWipeWarning, removeLocalData, uncheckedStores } from './local-wipe';
import { tabHeld } from './tab-lock';
import { boot, R1, settle } from './test/env';
import { removeTestLocks } from './test/locks';
import { installWebLocks, type WebLocks } from './test/web-locks';

type Win = { navs: string[]; locks: WebLocks };
const realNow = Date.now.bind(Date);
let skew = 0;
/** A clock that stands still between jumps (exact-deadline cases), else null: the real clock. */
let frozen: number | null = null;
/** Moves this page's clock forward by `ms` at once, timers untouched (as a busy page sees it). */
const jump = (ms = 60_000) => { skew += ms; };

afterEach(async () => {
  vi.restoreAllMocks();
  skew = 0;
  frozen = null;
  removeTestLocks();
  delete (window as { HubBootToken?: unknown }).HubBootToken;
  await new Promise((r) => setTimeout(r, 50));
});

async function tab(): Promise<Win> {
  boot({ realm: R1 });
  const locks = installWebLocks();
  const w: Win = { navs: [], locks };
  configureLifecycle({ navigate: (u) => w.navs.push(u), loginPath: '/auth/login', herePath: () => '/auth/home' });
  initLive();
  (window as { HubBootToken?: unknown }).HubBootToken = { revoke: () => Promise.resolve() };
  await vi.waitFor(() => expect(tabHeld()).toBe(true));
  await settle();
  vi.spyOn(Date, 'now').mockImplementation(() => (frozen ?? realNow()) + skew);
  deletes = 0;
  markers();
  return w;
}
const run = { minWaitMs: 0, endMs: 1 };
const wipeHeld = (w: Win) => w.locks.held().filter((h) => h.name === 'hub-wipe' && h.mode === 'exclusive');

/** Deletes this run made, across every fake below: a refusal must make none. */
let deletes = 0;
/** An IndexedDB whose database list answers `names`, running `onList` as it answers; deletes always succeed. */
function idbOf(names: unknown[], onList: () => void = () => undefined) {
  return {
    databases: () => { onList(); return Promise.resolve(names); },
    deleteDatabase: () => {
      deletes++;
      const r = {} as IDBOpenDBRequest & { onsuccess: (() => void) | null };
      setTimeout(() => r.onsuccess?.(), 0);
      return r;
    },
  } as unknown as IDBFactory;
}
/** Cache Storage whose keys answer `keys` (after `delayMs`, running `onKeys` as they answer). */
function cachesOf(onKeys: () => void = () => undefined, o: { keys?: string[]; delayMs?: number } = {}) {
  const c = { calls: 0, cs: null as unknown as CacheStorage };
  const answer = () => { onKeys(); return [...(o.keys ?? [])]; };
  c.cs = {
    keys: () => { c.calls++; return o.delayMs ? new Promise((res) => setTimeout(() => res(answer()), o.delayMs)) : Promise.resolve(answer()); },
    delete: () => { deletes++; return Promise.resolve(true); },
  } as unknown as CacheStorage;
  return c;
}
/** Markers in both storages: a refusal leaves them where they were. */
function markers() {
  localStorage.setItem('wipe-dl-marker', 'kept');
  sessionStorage.setItem('wipe-dl-marker', 'kept');
}

/** The refusal changed nothing: nobody signed out, nothing removed or deleted, the lock is let go, and a later try is
 *  checked again and starts. */
async function nothingHappenedThenRetry(w: Win) {
  await settle();
  expect(w.navs).toEqual([]);
  expect([localStorage.getItem('wipe-dl-marker'), sessionStorage.getItem('wipe-dl-marker'), deletes]).toEqual(['kept', 'kept', 0]);
  expect(wipeHeld(w)).toEqual([]);
  skew = 0;
  expect(await removeLocalData(localWipeWarning()!, { ...run, idb: idbOf([]), caches: null })).toEqual({ kind: 'started' });
  await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
}

describe('a late answer never counts as checked', () => {
  it('a database list that answers after the deadline (timer not fired yet) is unchecked, nothing wiped, lock let go', async () => {
    const w = await tab();
    const idb = idbOf([], () => jump());
    const c = cachesOf();
    // The late list itself is named (never taken as checked), and the cache check after it never starts.
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb, caches: c.cs })).toEqual({ kind: 'unchecked', what: ['databases', 'caches'] });
    expect(c.calls).toBe(0);
    await nothingHappenedThenRetry(w);
  });

  it('a tab query that answers alone after the deadline refuses as tabs, nothing wiped, lock let go', async () => {
    const w = await tab();
    const api = (navigator as unknown as { locks: { query: () => Promise<unknown> } }).locks;
    const query = api.query.bind(api);
    api.query = () => query().then((v) => { jump(); return v; });
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: idbOf([]), caches: null })).toEqual({ kind: 'tabs' });
    api.query = query;
    await nothingHappenedThenRetry(w);
  });
});

describe('a deadline that passes between steps', () => {
  it('passed after the tab query answered in time: no store check starts, each is named unchecked', async () => {
    const w = await tab();
    // The tab query answers in time; the storage listing that follows it is when the deadline passes.
    let armed = false;
    const api = (navigator as unknown as { locks: { query: () => Promise<unknown> } }).locks;
    const query = api.query.bind(api);
    api.query = () => query().then((v) => { armed = true; return v; });
    const key = localStorage.key.bind(localStorage);
    vi.spyOn(localStorage, 'key').mockImplementation((i: number) => {
      if (armed) { armed = false; jump(); }
      return key(i);
    });
    let lists = 0;
    const c = cachesOf();
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: idbOf([], () => { lists++; }), caches: c.cs })).toEqual({ kind: 'unchecked', what: ['databases', 'caches'] });
    expect([lists, c.calls]).toEqual([0, 0]);
    api.query = query;
    await nothingHappenedThenRetry(w);
  });

  it('passed after the database list answered in time: the cache check never starts and is named unchecked', async () => {
    const w = await tab();
    // The list answers in time; reading its entries (after the answer was taken) is when the deadline passes.
    const entry = { get name() { jump(); return 'hub'; }, version: 1 };
    const c = cachesOf();
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: idbOf([entry]), caches: c.cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    expect(c.calls).toBe(0);
    await nothingHappenedThenRetry(w);
  });

  it('passed after every store answered in time, before the sign-out: refused as unchecked, nobody signed out', async () => {
    const w = await tab();
    // The cache list answers in time; the deadline passes while the last reads (payments, questions) run.
    let armed = false;
    const c = cachesOf(() => { armed = true; });
    const getItem = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => {
      if (armed) { armed = false; jump(); }
      return getItem(k);
    });
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: c.cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    expect(c.calls).toBe(1);
    await nothingHappenedThenRetry(w);
  });
});

/** Moves the clock as the session is read for the `n`th time after the returned arm is called (armed as the last store
 *  check answers: 1 = the page's own check before the sign-out, 2 = the sign-out's), or, with `then`, at the next
 *  payment-list read after that one (the warning read again, inside the sign-out's last check). At the jump, `also` runs
 *  and `token` (when given) is what that one session read sees. */
function jumpAtSessionRead(n: number, o: { then?: boolean; also?: () => void; token?: string; ms?: number } = {}) {
  let armed = false;
  let seen = 0;
  let next = false;
  const getItem = localStorage.getItem.bind(localStorage);
  vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => {
    if (next && k === 'hub.v3.rent_pending') { next = false; jump(o.ms); }
    else if (armed && k === 'access_token' && ++seen === n) {
      armed = false;
      if (o.then) next = true;
      else { jump(o.ms); o.also?.(); }
      // A session another tab stored, read at the jump (this read only).
      if (o.token !== undefined) return o.token;
    }
    return getItem(k);
  });
  return () => { armed = true; };
}

describe('a deadline reached at any step of the check', () => {
  it('a budget already spent starts no check at all: the tab query is never asked, refused as tabs', async () => {
    const w = await tab();
    let queries = 0;
    const api = (navigator as unknown as { locks: { query: () => Promise<unknown> } }).locks;
    const query = api.query.bind(api);
    api.query = () => { queries++; return query(); };
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 0, idb: idbOf([]), caches: null })).toEqual({ kind: 'tabs' });
    expect(queries).toBe(0);
    api.query = query;
    await nothingHappenedThenRetry(w);
  });

  it('a cache list that answers after the deadline (timer not fired yet) is unchecked, nothing wiped', async () => {
    const w = await tab();
    const c = cachesOf(() => jump());
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: c.cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    await nothingHappenedThenRetry(w);
  });

  it('the deadline passes while the session is read, after the last check: refused as unchecked, nobody signed out', async () => {
    const w = await tab();
    const c = cachesOf(jumpAtSessionRead(1));
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: c.cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    await nothingHappenedThenRetry(w);
  });

  it('the deadline passes while the warning is read again, the last step before the sign-out: refused as unchecked', async () => {
    const w = await tab();
    const c = cachesOf(jumpAtSessionRead(2, { then: true }));
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: c.cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    await nothingHappenedThenRetry(w);
  });

  it('with neither IndexedDB nor Cache Storage, a deadline passed before the sign-out names storage', async () => {
    const w = await tab();
    // No store check waits for an answer here: the jump comes at the page's own session read before the sign-out, the
    // first one after the tab query answered in time.
    const arm = jumpAtSessionRead(1);
    const api = (navigator as unknown as { locks: { query: () => Promise<unknown> } }).locks;
    const query = api.query.bind(api);
    api.query = () => query().then((v) => { arm(); return v; });
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: null })).toEqual({ kind: 'unchecked', what: ['storage'] });
    api.query = query;
    await nothingHappenedThenRetry(w);
  });

  it('with only IndexedDB, a deadline passed at the last read names databases', async () => {
    const w = await tab();
    const arm = jumpAtSessionRead(2, { then: true });
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: idbOf([], arm), caches: null })).toEqual({ kind: 'unchecked', what: ['databases'] });
    await nothingHappenedThenRetry(w);
  });

  it('with both stores, a deadline passed at the last read names both', async () => {
    const w = await tab();
    const c = cachesOf(jumpAtSessionRead(2, { then: true }));
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: idbOf([]), caches: c.cs })).toEqual({ kind: 'unchecked', what: ['databases', 'caches'] });
    await nothingHappenedThenRetry(w);
  });
});

describe('past the deadline, every refusal keeps the timeout words', () => {
  it("the deadline passes as the session is read and another session shows: 'unchecked', not 'changed'", async () => {
    const w = await tab();
    const c = cachesOf(jumpAtSessionRead(1, { token: 'another-tabs-session' }));
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: c.cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    await nothingHappenedThenRetry(w);
  });

  it("the deadline passes and the warning grows before the sign-out reads it: 'unchecked', not 'changed'", async () => {
    const w = await tab();
    // At the sign-out's own session read (just before it reads the warning again): the clock jumps and a leave starts.
    let release = (): void => undefined;
    const c = cachesOf(jumpAtSessionRead(2, { also: () => { release = holdLeave('upload'); } }));
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: c.cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    release();
    await nothingHappenedThenRetry(w);
  });

  it('an answer at exactly the deadline is late: the store is named unchecked (a moment earlier it is checked)', async () => {
    await tab();
    const account = localWipeWarning()!.account;
    frozen = realNow();
    const late = cachesOf(() => jump(4000));
    expect(await uncheckedStores(account, { idb: null, caches: late.cs, deadline: Date.now() + 4000 })).toContain('caches');
    skew = 0;
    const inTime = cachesOf(() => jump(3999));
    expect(await uncheckedStores(account, { idb: null, caches: inTime.cs, deadline: Date.now() + 4000 })).not.toContain('caches');
    expect([late.calls, inTime.calls]).toEqual([1, 1]);
  });

  it('a sign-out that started inside the deadline stays started when the clock passes it during the sign-out', async () => {
    const w = await tab();
    // The 3rd session read after the cache list answered is the sign-out's own, after the warning check let it start.
    let jumped = false;
    const c = cachesOf(jumpAtSessionRead(3, { also: () => { jumped = true; } }));
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: c.cs })).toEqual({ kind: 'started' });
    expect(jumped).toBe(true);
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
  });
});

describe('the last refusals and the exact deadline at the sign-out', () => {
  const PENDING = 'hub_money_pending';
  /** A payment whose outcome is open in this browser (another account's): the last check refuses as 'payments'. */
  const holdPayment = () => localStorage.setItem(PENDING, JSON.stringify([{ kind: 'pay', user_id: 'other-user', key: 'kpay00000000000009', max_charge_cents: 500, at: 4, sub_id: 'sub9' }]));
  /** Moves the clock by `ms` at the first read of `key` after the returned arm is called. */
  function jumpAtKey(key: string, ms: number) {
    let armed = false;
    const getItem = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => {
      if (armed && k === key) { armed = false; jump(ms); }
      return getItem(k);
    });
    return () => { armed = true; };
  }
  /** Between the two runs of a pair: the read hooks go, the still clock stays and is back at its start. */
  const nextRun = () => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockImplementation(() => (frozen ?? realNow()) + skew);
    skew = 0;
  };
  /** The refusal changed nothing so far: nobody signed out, markers kept, nothing deleted, the lock let go. */
  const unchangedSoFar = async (w: Win) => {
    await settle();
    expect(w.navs).toEqual([]);
    expect([localStorage.getItem('wipe-dl-marker'), sessionStorage.getItem('wipe-dl-marker'), deletes]).toEqual(['kept', 'kept', 0]);
    expect(wipeHeld(w)).toEqual([]);
  };

  it("a held payment refuses as 'payments' 1 ms before the deadline, and as 'unchecked' at it (after the store checks)", async () => {
    const w = await tab();
    holdPayment();
    frozen = realNow();
    // The clock moves at the store checks' own payment read (after the cache list was taken in time), so the run's last
    // payment check is the one judged against the deadline.
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: cachesOf(jumpAtKey(PENDING, 3999)).cs })).toEqual({ kind: 'payments' });
    await unchangedSoFar(w);
    nextRun();
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: cachesOf(jumpAtKey(PENDING, 4000)).cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    expect(localStorage.getItem(PENDING)).toContain('kpay00000000000009');
    localStorage.removeItem(PENDING);
    await nothingHappenedThenRetry(w);
  });

  it("a confirm the sign-out cannot compare refuses as 'failed' 1 ms before the deadline, and as 'unchecked' at it", async () => {
    const w = await tab();
    // The confirmed warning's holds throw once the store checks answered: signOutWiping's comparison fails ('failed').
    const breaking = () => {
      const shown = localWipeWarning()!;
      const b = { broken: false, shown: null as unknown as typeof shown };
      b.shown = { ...shown, get holds() { if (b.broken) throw new Error('cannot compare'); return shown.holds; } };
      return b;
    };
    frozen = realNow();
    // The clock moves at the sign-out's own session read, just before it compares the warning.
    const inTime = breaking();
    const armIn = jumpAtSessionRead(2, { ms: 3999 });
    expect(await removeLocalData(inTime.shown, { ...run, checkMs: 4000, idb: null, caches: cachesOf(() => { inTime.broken = true; armIn(); }).cs })).toEqual({ kind: 'failed' });
    await unchangedSoFar(w);
    nextRun();
    const late = breaking();
    const armLate = jumpAtSessionRead(2, { ms: 4000 });
    expect(await removeLocalData(late.shown, { ...run, checkMs: 4000, idb: null, caches: cachesOf(() => { late.broken = true; armLate(); }).cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    await nothingHappenedThenRetry(w);
  });

  it('the sign-out starts only before the deadline: a warning read at exactly the deadline refuses, a moment earlier it starts', async () => {
    const w = await tab();
    frozen = realNow();
    const atDeadline = cachesOf(jumpAtSessionRead(2, { then: true, ms: 4000 }));
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: atDeadline.cs })).toEqual({ kind: 'unchecked', what: ['caches'] });
    await unchangedSoFar(w);
    nextRun();
    const justBefore = cachesOf(jumpAtSessionRead(2, { then: true, ms: 3999 }));
    expect(await removeLocalData(localWipeWarning()!, { ...run, checkMs: 4000, idb: null, caches: justBefore.cs })).toEqual({ kind: 'started' });
    await vi.waitFor(() => expect(w.navs).toEqual(['/auth/login']));
  });
});
