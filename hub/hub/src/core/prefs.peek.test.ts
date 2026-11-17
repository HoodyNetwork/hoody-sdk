// prefs.peek.test.ts: peek(), the read for readers that only look. It never starts a
// write (no retry of a refused store, no plaintext migration) and tells a refused storage read from nothing stored.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newBaseKey, newKeyId } from './crypt/envelope';
import { memoryVault } from './crypt/memory-vault';
import { initCore, setIdentity } from './ctx';
import { cryptIdleForTests, cryptPartitioned, cryptReady, migratingForTests, resetCryptForTests } from './cryptStore';
import { accountPref, resetPrefs } from './prefs';
import { readPage } from './session';
import { boot, R1, R2, signIn, UID } from './test/env';

const BOARDS = 'hub_boards_v1'; // account+realm, kept at sign-out
const HOME = 'hub_home_v1'; // account, purged
const SID = 'sid0000000000001';

let vault = memoryVault();
const boards = () => cryptPartitioned(BOARDS, { scope: 'account+realm', purge: false });
const home = () => cryptPartitioned(HOME, { scope: 'account', purge: true });
const show = (id: string | null) => setIdentity(id === null ? null : { id, banned: false });
const parseList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const listPref = () => accountPref(BOARDS, parseList, { scope: 'account+realm', keepAtSignOut: true });

/** Storage as it is now, kept for a new page of this browser (the vault survives too). */
function kept(): Record<string, string> {
  const keep: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) as string;
    if (k !== 'access_token' && k !== 'refresh_token') keep[k] = localStorage.getItem(k) as string;
  }
  return keep;
}
/** A new page whose account is still opening when this returns. */
function reopen(): void {
  boot({ storage: kept(), identity: false });
  signIn(UID, SID);
  initCore({ page: readPage(), tokenRealm: null });
  resetCryptForTests(vault, { newPage: true });
  resetPrefs();
  show(UID);
}
async function reload(): Promise<void> { reopen(); await cryptReady(); await cryptIdleForTests(); }
/** getItem of `key` throws, as a browser that refuses the read (blocked storage). */
function refuseRead(key: string) {
  const real = localStorage.getItem.bind(localStorage);
  return vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => { if (k === key) throw new DOMException('denied', 'SecurityError'); return real(k); });
}

beforeEach(async () => {
  boot();
  vault = memoryVault();
  resetCryptForTests(vault, { newPage: true });
  resetPrefs();
  await cryptReady();
  await cryptIdleForTests();
});

describe('cryptPartitioned peek()', () => {
  it('answers what get() shows, known, for a stored value and for nothing stored', async () => {
    expect(boards().peek(R1)).toEqual({ value: null, known: true });
    boards().set(['a', 'b'], R1);
    await cryptIdleForTests();
    await reload();
    expect(boards().get(R1)).toEqual(['a', 'b']);
    expect(boards().peek(R1)).toEqual({ value: ['a', 'b'], known: true });
    expect(boards().peek(R2)).toEqual({ value: null, known: true });
  });

  it('a storage read the browser refuses is not known (get() shows nothing stored)', async () => {
    boards().set(['a'], R1);
    await cryptIdleForTests();
    await reload();
    const spy = refuseRead(BOARDS);
    try {
      expect(boards().peek(R1)).toEqual({ value: null, known: false });
      expect(boards().peek(R2)).toEqual({ value: null, known: false });
    } finally { spy.mockRestore(); }
    expect(boards().peek(R1)).toEqual({ value: ['a'], known: true });
  });

  it('while the account opens, and for a bad part, nothing is known', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    reopen();
    expect(home().peek()).toEqual({ value: null, known: false });
    expect(boards().peek(R2)).toEqual({ value: null, known: false }); // nothing stored, but the account is not open
    await cryptReady();
    await cryptIdleForTests();
    expect(home().peek()).toEqual({ value: { h: 1 }, known: true });
    expect(boards().peek('not a part!')).toEqual({ value: null, known: false });
  });

  it('with no account signed in, nothing is known', () => {
    boot({ signedIn: false });
    resetCryptForTests(vault, { newPage: true });
    show(null);
    expect(home().peek()).toEqual({ value: null, known: false });
  });

  it('a value whose keys this tab cannot confirm reads locked and known as null, as get() and status() say', async () => {
    home().set({ h: 'kept' });
    await cryptIdleForTests();
    const rec = await vault.account(UID);
    const id = newKeyId();
    await vault.putKey(UID, id, await newBaseKey());
    await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
    vault.fail.add('keys');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const ch = new BroadcastChannel('hoody-hub-crypt');
      ch.postMessage({ type: 'rotate', uid: UID });
      ch.close();
      await spin();
      expect(home().status()).toBe('locked');
      expect(home().get()).toBeNull();
      expect(home().peek()).toEqual({ value: null, known: true });
      vault.fail.clear();
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { vi.useRealTimers(); }
    await cryptIdleForTests();
    expect(home().peek()).toEqual({ value: { h: 'kept' }, known: true });
  });

  it('under the fence (a vault check that does not answer) even an empty slot is not known', async () => {
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    const orig = vault.account.bind(vault);
    let open = false;
    const held: Array<() => void> = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vault.account = (u) => (open ? orig(u) : new Promise((res, rej) => { held.push(() => { orig(u).then(res, rej); }); }));
      document.dispatchEvent(new Event('visibilitychange'));
      await spin();
      await vi.advanceTimersByTimeAsync(2_100);
      await spin();
      expect(home().status()).toBe('locked');
      expect(boards().peek(R2)).toEqual({ value: null, known: false });
      open = true;
      for (const go of held.splice(0)) go(); // calls made while silent answer late (a real vault does)
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { vi.useRealTimers(); vault.account = orig; }
    await cryptIdleForTests();
    expect(boards().peek(R2)).toEqual({ value: null, known: true });
  });

  it('a refused store is never tried again by peek(), even past RETRY_MS (get() would)', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const realSet = localStorage.setItem.bind(localStorage);
    let tries = 0;
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { if (k === HOME) { tries++; throw new DOMException('full', 'QuotaExceededError'); } realSet(k, v); });
    try {
      home().set({ h: 2 });
      await cryptIdleForTests();
      expect(home().status()).toBe('unsaved');
      const before = tries;
      const now = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 11_000);
      try {
        expect(home().peek()).toEqual({ value: { h: 2 }, known: true }); // this page's copy shows
        await cryptIdleForTests();
        expect(tries).toBe(before);
        home().get(); // the control: a read past RETRY_MS tries again
        await cryptIdleForTests();
        expect(tries).toBe(before + 1);
      } finally { clock.mockRestore(); }
    } finally { spy.mockRestore(); }
  });

  it('old plaintext is never read nor migrated by peek(): not known; get() still reads and migrates it', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: ['plain'] } } }));
    reopen();
    await cryptReady();
    const b = boards();
    expect(b.peek(R1)).toEqual({ value: null, known: false });
    expect(migratingForTests(BOARDS)).toBe(false); // peek() started no migration
    expect(localStorage.getItem(BOARDS)).toContain('plain');
    expect(b.get(R1)).toEqual(['plain']);
    expect(migratingForTests(BOARDS)).toBe(true); // the control: get()'s read starts it
    await cryptIdleForTests();
    expect(b.peek(R1)).toEqual({ value: ['plain'], known: true });
    expect(localStorage.getItem(BOARDS)).not.toContain('plain');
  });
});

describe('cryptPartitioned peek(): never opens the account; fence wakes; own write; changed plaintext', () => {
  it('an account shown but not opened yet is not opened by peek(): no vault write, no migration; get() opens it', async () => {
    boot();
    vault = memoryVault();
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: ['plain'] } } }));
    resetCryptForTests(vault, { newPage: true });
    const puts = [vi.spyOn(vault, 'putKey'), vi.spyOn(vault, 'putAccount')];
    const b = boards();
    expect(b.peek(R1)).toEqual({ value: null, known: false });
    await spin();
    for (const sp of puts) expect(sp).not.toHaveBeenCalled();
    expect(migratingForTests(BOARDS)).toBe(false);
    expect(localStorage.getItem(BOARDS)).toContain('plain');
    b.get(R1); // the control: get() opens the shown account
    await cryptReady();
    await cryptIdleForTests();
    expect(puts[1]).toHaveBeenCalled();
  });

  it('this page\'s own write still shows under the fence, as get() and status() say', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const real = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { if (k === HOME) throw new DOMException('full', 'QuotaExceededError'); real(k, v); });
    const orig = vault.account.bind(vault);
    let open = false;
    const held: Array<() => void> = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      home().set({ h: 2 });
      await spin();
      vault.account = (u) => (open ? orig(u) : new Promise((res, rej) => { held.push(() => { orig(u).then(res, rej); }); }));
      document.dispatchEvent(new Event('visibilitychange'));
      await spin();
      await vi.advanceTimersByTimeAsync(2_100);
      await spin();
      expect(boards().status(R2)).toBe('locked'); // the fence is up
      expect(home().get()).toEqual({ h: 2 });
      expect(home().peek()).toEqual({ value: { h: 2 }, known: true });
      open = true;
      for (const go of held.splice(0)) go(); // calls made while silent answer late (a real vault does)
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { vi.useRealTimers(); vault.account = orig; spy.mockRestore(); }
    await cryptIdleForTests();
  });

  it('old plaintext changed under this page\'s copy after a migration gave up is not known (get() reads the new one)', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: ['old'] } } }));
    reopen();
    await cryptReady();
    await cryptIdleForTests();
    const b = boards();
    // Another tab writes new plaintext while this page seals the old one for its migration: it gives up (no retry).
    const subtle = globalThis.crypto.subtle;
    const realEncrypt = subtle.encrypt.bind(subtle);
    let once = true;
    const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(((alg: AlgorithmIdentifier, key: CryptoKey, data: BufferSource) => {
      if (once) { once = false; localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: ['new'] } } })); }
      return realEncrypt(alg, key, data);
    }) as typeof subtle.encrypt);
    try {
      expect(b.get(R1)).toEqual(['old']); // read: its migration starts
      await cryptIdleForTests();
    } finally { spy.mockRestore(); }
    expect(once).toBe(false);
    expect(migratingForTests(BOARDS)).toBe(false);
    expect(localStorage.getItem(BOARDS)).toContain('new');
    expect(b.peek(R1)).toEqual({ value: null, known: false });
    expect(b.get(R1)).toEqual(['new']); // the control
  });
});

describe('accountPref peek(): subscribers hear the fence', () => {
  it('an empty slot\'s subscriber is told when the fence rises and when it lifts', async () => {
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    const p = listPref();
    expect(p.peek(R2)).toEqual({ value: [], known: true });
    let heard = 0;
    const off = p.subscribe(() => { heard++; });
    const orig = vault.account.bind(vault);
    let open = false;
    const held: Array<() => void> = [];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vault.account = (u) => (open ? orig(u) : new Promise((res, rej) => { held.push(() => { orig(u).then(res, rej); }); }));
      document.dispatchEvent(new Event('visibilitychange'));
      await spin();
      await vi.advanceTimersByTimeAsync(2_100);
      await spin();
      expect(heard).toBeGreaterThan(0);
      expect(p.peek(R2)).toEqual({ value: [], known: false });
      const rose = heard;
      open = true;
      for (const go of held.splice(0)) go(); // calls made while silent answer late (a real vault does)
      for (let i = 0; i < 10 && p.peek(R2).known === false; i++) { await vi.advanceTimersByTimeAsync(600); await spin(); }
      expect(heard).toBeGreaterThan(rose);
      expect(p.peek(R2)).toEqual({ value: [], known: true });
    } finally { vi.useRealTimers(); vault.account = orig; off(); }
    await cryptIdleForTests();
  });
});

describe('accountPref peek()', () => {
  it('the same answer object while nothing changes; its value is get()\'s object for the same stored value', async () => {
    const p = listPref();
    expect(p.set(['x'], R1)).toBe(true);
    await cryptIdleForTests();
    const a1 = p.peek(R1);
    expect(a1).toEqual({ value: ['x'], known: true });
    expect(p.peek(R1)).toBe(a1);
    expect(a1.value).toBe(p.get(R1));
    p.set(['x', 'y'], R1);
    await cryptIdleForTests();
    const a2 = p.peek(R1);
    expect(a2).not.toBe(a1);
    expect(a2).toEqual({ value: ['x', 'y'], known: true });
  });

  it('a refused read gives parse(null), not known, and a new answer once the read works again', async () => {
    const p = listPref();
    p.set(['x'], R1);
    await cryptIdleForTests();
    await reload();
    const q = listPref();
    expect(q.peek(R2)).toEqual({ value: [], known: true }); // nothing stored
    const spy = refuseRead(BOARDS);
    let a: ReturnType<typeof q.peek>;
    try {
      a = q.peek(R1);
      expect(a).toEqual({ value: [], known: false });
      expect(q.peek(R1)).toBe(a);
      expect(q.get(R1)).toEqual([]); // get() cannot tell it from nothing stored
      expect(q.peek(R2)).toEqual({ value: [], known: false }); // the same text as nothing stored, not the same answer
    } finally { spy.mockRestore(); }
    // get()'s refused read dropped its cached value: the next read opens it again in the background (still unknown).
    expect(q.peek(R1)).toBe(a);
    await cryptIdleForTests();
    expect(q.peek(R1)).toEqual({ value: ['x'], known: true });
  });

  it('this page\'s copy of a refused write is known; a bad part is not', async () => {
    const p = listPref();
    const real = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { if (k === BOARDS) throw new DOMException('full', 'QuotaExceededError'); real(k, v); });
    try {
      p.set(['page'], R1);
      await cryptIdleForTests();
      expect(p.peek(R1)).toEqual({ value: ['page'], known: true });
    } finally { spy.mockRestore(); }
    expect(p.peek('not a part!')).toEqual({ value: [], known: false });
    expect(p.peek('not a part!')).toBe(p.peek('not a part!'));
  });

  it('the two memos agree: peek() follows get()\'s current object, and an unknown peek never replaces get()\'s', async () => {
    const p = listPref();
    p.set(['a'], R1);
    await cryptIdleForTests();
    const first = p.peek(R1);
    p.set(['b'], R1);
    await cryptIdleForTests();
    expect(p.get(R1)).toEqual(['b']);
    p.set(['a'], R1);
    await cryptIdleForTests();
    const g = p.get(R1);
    expect(p.peek(R1).value).toBe(g);
    expect(p.peek(R1)).toEqual(first);
    const spy = refuseRead(BOARDS);
    try { expect(p.peek(R1)).toEqual({ value: [], known: false }); } finally { spy.mockRestore(); }
    expect(p.get(R1)).toBe(g); // unchanged stored value: get() keeps its object
    expect(p.peek(R1).value).toBe(g);
  });

  it('a page copy (a value the store refused whole, over VALUE_MAX) shows as known', async () => {
    const p = listPref();
    p.set(['stored'], R1);
    await cryptIdleForTests();
    const big = Array.from({ length: 6000 }, () => 'xxxxxxxxxx');
    expect(p.set(big, R1)).toBe(false);
    expect(p.pageCopy(R1)).toBe(true);
    expect(p.peek(R1)).toEqual({ value: big, known: true });
    expect(p.peek(R1).value).toBe(p.get(R1));
  });

  it('with no account signed in: parse(null), not known', () => {
    boot({ signedIn: false });
    resetPrefs();
    show(null);
    const p = listPref();
    expect(p.peek(R1)).toEqual({ value: [], known: false });
    expect(p.peek(R1).value).toBe(p.get(R1));
  });
});
