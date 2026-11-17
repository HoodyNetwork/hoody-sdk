// cryptStore.test.ts: encrypted per-account preferences over the real shared.js registry and real WebCrypto.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newBaseKey, newKeyId } from './crypt/envelope';
import { memoryVault } from './crypt/memory-vault';
import { idbVault } from './crypt/vault';
import { capture, initCore, setIdentity, startLoggingOut } from './ctx';
import { configureLifecycle, initLive, logout, onLifecycle, suspend } from './lifecycle';
import { endAccount } from './realm';
import { cryptIdleForTests, cryptPartitioned, cryptReady, cryptWritesSettled, declareCryptKeys, forgetThisBrowser, migratingForTests, onCryptChange, overValueMax, pendingPrefWrites, resetCryptForTests, signOutAsked, storedForTests, unsavedAtSignOut, VALUE_MAX, writeSealedForTests } from './cryptStore';
import { declareAccountPrefKeys } from './prefs';
import { clearAuthTokens, readPage, shared } from './session';
import { boot, OTHER, R1, R2, signIn, UID } from './test/env';
import { removeTestLocks } from './test/locks';

const BOARDS = 'hub_boards_v1'; // account+realm, kept at sign-out
const HOME = 'hub_home_v1'; // account, purged
const GUIDE = 'hub_guide_v1'; // account, kept
const SID1 = 'sid0000000000001';

let vault = memoryVault();
const boards = () => cryptPartitioned(BOARDS, { scope: 'account+realm', purge: false });
const home = () => cryptPartitioned(HOME, { scope: 'account', purge: true });
const guide = () => cryptPartitioned(GUIDE, { scope: 'account', purge: false });
const doc = (key: string) => JSON.parse(localStorage.getItem(key) || 'null');
const show = (id: string | null) => setIdentity(id === null ? null : { id, banned: false });

/** A new page on this browser: localStorage and the vault survive; the session id may be a new sign-in. */
async function reload(sid = SID1): Promise<void> {
  const keep: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) as string;
    if (k !== 'access_token' && k !== 'refresh_token') keep[k] = localStorage.getItem(k) as string;
  }
  boot({ storage: keep, identity: false });
  signIn(UID, sid);
  initCore({ page: readPage(), tokenRealm: null });
  resetCryptForTests(vault, { newPage: true });
  show(UID);
  await cryptReady();
  await cryptIdleForTests();
}

/** A new page whose account is still opening when this returns (nothing awaited). */
function reopen(sid = SID1, o: { tabLocks?: boolean } = {}): void {
  const keep: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) as string;
    if (k !== 'access_token' && k !== 'refresh_token') keep[k] = localStorage.getItem(k) as string;
  }
  boot({ storage: keep, identity: false });
  // tabLocks false: a browser without Web Locks (test-setup and boot() install the test ones).
  if (o.tabLocks === false) removeTestLocks();
  signIn(UID, sid);
  initCore({ page: readPage(), tokenRealm: null });
  resetCryptForTests(vault, { newPage: true, ...o });
  show(UID);
}

/** reload('sid0000000000002') with `arm` run after storage is rebuilt and before the account opens. */
async function reloadWith(arm: () => void): Promise<void> {
  const keep: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) as string;
    if (k !== 'access_token' && k !== 'refresh_token') keep[k] = localStorage.getItem(k) as string;
  }
  boot({ storage: keep, identity: false });
  signIn(UID, 'sid0000000000002');
  initCore({ page: readPage(), tokenRealm: null });
  resetCryptForTests(vault, { newPage: true });
  arm();
  show(UID);
  await cryptReady();
  await cryptIdleForTests();
}

async function fresh(): Promise<void> {
  boot();
  vault = memoryVault();
  resetCryptForTests(vault, { newPage: true }); // nothing declared by an earlier test
  await cryptReady();
  await cryptIdleForTests();
}

beforeEach(fresh);

describe('round trip', () => {
  it('a value reads back at once, is stored as an envelope only, and opens again on a new page', async () => {
    expect(boards().set({ name: 'Ops board', n: 3 }, R1)).toBe(true);
    expect(boards().get(R1)).toEqual({ name: 'Ops board', n: 3 });
    await cryptIdleForTests();
    const raw = localStorage.getItem(BOARDS) as string;
    expect(raw).not.toContain('Ops board');
    const env = doc(BOARDS).a[UID][R1];
    expect(Object.keys(env).sort()).toEqual(['ct', 'iv', 'k', 'v']);
    expect(env.v).toBe(1);
    expect(vault.dump().keys).toEqual([UID + '/' + env.k]);
    await reload();
    expect(boards().get(R1)).toEqual({ name: 'Ops board', n: 3 });
    expect(boards().status(R1)).toBe('ok');
  });

  it('every write takes a fresh IV, and the newest of quick writes wins', async () => {
    home().set({ a: 1 });
    await cryptIdleForTests();
    const iv1 = doc(HOME).a[UID].iv;
    home().set({ a: 1 });
    home().set({ a: 2 });
    home().set({ a: 3 });
    await cryptIdleForTests();
    expect(doc(HOME).a[UID].iv).not.toBe(iv1);
    await reload();
    expect(home().get()).toEqual({ a: 3 });
  });

  it('a value over VALUE_MAX is refused whole with status oversized (nothing cut or stored); not JSON is refused', async () => {
    home().set({ small: 1 });
    await cryptIdleForTests();
    const before = localStorage.getItem(HOME);
    const heard: string[] = [];
    const off = onCryptChange((k) => heard.push(k));
    expect(home().set('x'.repeat(VALUE_MAX + 1))).toBe(false);
    expect(home().status()).toBe('oversized');
    expect(heard).toContain(HOME);
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBe(before);
    expect(home().get()).toEqual({ small: 1 });
    expect(home().set(10n as unknown)).toBe(false);
    expect(home().set('x'.repeat(VALUE_MAX - 2))).toBe(true);
    expect(home().status()).toBe('saving'); // stored in the background
    await cryptIdleForTests();
    expect(home().status()).toBe('ok');
    await reload();
    expect(home().get()).toBe('x'.repeat(VALUE_MAX - 2));
    off();
  });

  it('a write belongs to the account it was made under: a switch right after it neither drops it nor moves it', async () => {
    home().set({ mine: true });
    show(OTHER);
    await cryptIdleForTests();
    expect(Object.keys(doc(HOME).a)).toEqual([UID]);
    expect(home().get()).toBeNull();
    show(UID);
    await cryptReady();
    await cryptIdleForTests();
    expect(home().get()).toEqual({ mine: true });
  });

  it('a sign-out purge between a write and its store: a purged key is never written back, a kept key is', async () => {
    home().set({ late: 1 });
    guide().set({ cl: 'codex', hid: 0 });
    clearAuthTokens();
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBeNull();
    expect(localStorage.getItem(GUIDE)).not.toBeNull();
  });
});

describe('an envelope opens only in its own slot (AAD and per-slot keys)', () => {
  it('copied to another realm, another account or another pref key, it reads as null and status says locked', async () => {
    boards().set({ b: 'one' }, R1);
    home().set({ h: 1 });
    await cryptIdleForTests();
    const d = doc(BOARDS);
    const env = d.a[UID][R1];
    d.a[UID][R2] = env;
    d.a[OTHER] = { [R1]: env };
    localStorage.setItem(BOARDS, JSON.stringify(d));
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: doc(HOME).a[UID] } }));
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'one' });
    expect(boards().get(R2)).toBeNull();
    expect(boards().status(R2)).toBe('locked');
    expect(guide().get()).toBeNull();
    expect(guide().status()).toBe('locked');
    show(OTHER);
    await cryptReady();
    await cryptIdleForTests();
    expect(boards().get(R1)).toBeNull();
  });

  it('a relabelled key id or a tampered ciphertext does not open, and nothing writes over it', async () => {
    home().set({ h: 'secret-ish' });
    await cryptIdleForTests();
    const d = doc(HOME);
    const ct: string = d.a[UID].ct;
    d.a[UID].ct = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
    localStorage.setItem(HOME, JSON.stringify(d));
    const tampered = localStorage.getItem(HOME);
    await reload();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBe(tampered);
    // The user's own change does write over it.
    expect(home().set({ h: 'new' })).toBe(true);
    await cryptIdleForTests();
    await reload();
    expect(home().get()).toEqual({ h: 'new' });
  });
});

describe('rotation at each sign-in', () => {
  it('a new sign-in reseals every value under a new key and deletes the old key', async () => {
    boards().set({ b: 1 }, R1);
    boards().set({ b: 2 }, 'all');
    home().set({ h: 1 });
    await cryptIdleForTests();
    const old = doc(HOME).a[UID].k;
    await reload(SID1); // same sign-in: no rotation
    expect(doc(HOME).a[UID].k).toBe(old);
    await reload('sid0000000000002');
    const now = doc(HOME).a[UID].k;
    expect(now).not.toBe(old);
    expect(doc(BOARDS).a[UID][R1].k).toBe(now);
    expect(doc(BOARDS).a[UID].all.k).toBe(now);
    expect(vault.dump().keys).toEqual([UID + '/' + now]);
    expect(boards().get(R1)).toEqual({ b: 1 });
    expect(boards().get('all')).toEqual({ b: 2 });
    expect(home().get()).toEqual({ h: 1 });
  });

  it('an old copy of the store does not open after a rotation', async () => {
    home().set({ h: 'before' });
    await cryptIdleForTests();
    const snapshot = localStorage.getItem(HOME) as string;
    await reload('sid0000000000002');
    localStorage.setItem(HOME, snapshot);
    await reload('sid0000000000002');
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });

  for (const step of ['putKey', 'reseal-first', 'reseal-second', 'putAccount', 'deleteKeys']) {
    it(`a crash at ${step} loses nothing, and the next open ends with only the active key`, async () => {
      boards().set({ b: 'r1' }, R1);
      home().set({ h: 'home' });
      guide().set({ cl: 'codex', hid: 0 });
      await cryptIdleForTests();
      let writes = 0, blocked = 0;
      const spies: Array<{ mockRestore(): void }> = [];
      const allow = step === 'reseal-first' ? 0 : 1;
      const realSet = localStorage.setItem.bind(localStorage);
      const crashAt = (k: string, v: string) => {
        if ([BOARDS, HOME, GUIDE].includes(k) && writes++ >= allow) { blocked++; throw new DOMException('crash', 'QuotaExceededError'); }
        realSet(k, v);
      };
      try {
        if (step.startsWith('reseal')) {
          // reload() rebuilds storage first; the crash is armed for the account's opening only.
          await reloadWith(() => { spies.push(vi.spyOn(localStorage, 'setItem').mockImplementation(crashAt)); });
          expect(blocked).toBeGreaterThan(0);
        } else {
          vault.fail.add(step);
          await reload('sid0000000000002');
        }
      } finally { for (const s of spies) s.mockRestore(); vault.fail.clear(); }
      // Right after the crash every stored value still names a key the vault holds.
      const held = vault.dump().keys;
      for (const k of [doc(HOME).a[UID].k, doc(GUIDE).a[UID].k, doc(BOARDS).a[UID][R1].k]) expect(held).toContain(UID + '/' + k);
      // Whatever the crash left, the next page reads every value.
      await reload('sid0000000000002');
      expect(boards().get(R1)).toEqual({ b: 'r1' });
      expect(home().get()).toEqual({ h: 'home' });
      expect(guide().get()).toEqual({ cl: 'codex', hid: 0 });
      const keys = vault.dump().keys;
      expect(keys).toHaveLength(1);
      const active = vault.dump().accounts.find((r) => r.account === UID)?.active;
      expect(keys).toEqual([UID + '/' + active]);
      for (const k of [doc(HOME).a[UID].k, doc(GUIDE).a[UID].k, doc(BOARDS).a[UID][R1].k]) expect(k).toBe(active);
    });
  }
});

describe('forget on this browser', () => {
  it('deletes the keys: every saved value stops opening at once, also on a new page; new values work again', async () => {
    boards().set({ b: 1 }, R1);
    home().set({ h: 1 });
    await cryptIdleForTests();
    const before = vault.dump().keys;
    expect(await forgetThisBrowser()).toBe(true);
    await cryptIdleForTests();
    expect(vault.dump().keys.some((k) => before.includes(k))).toBe(false);
    expect(boards().get(R1)).toBeNull();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
    await reload();
    expect(boards().get(R1)).toBeNull();
    expect(home().set({ h: 2 })).toBe(true);
    await cryptIdleForTests();
    await reload();
    expect(home().get()).toEqual({ h: 2 });
    expect(boards().get(R1)).toBeNull();
  });
});

describe('forget on this browser, interrupted', () => {
  it('Forget is one vault transaction: interrupted, it changes nothing (and says so); done again, it works', async () => {
    home().set({ h: 'gone' });
    await cryptIdleForTests();
    const keys = vault.dump().keys, rec = await vault.account(UID);
    vault.fail.add('forget');
    expect(await forgetThisBrowser()).toBe(false);
    vault.fail.clear();
    expect(vault.dump().keys).toEqual(keys);
    expect(await vault.account(UID)).toEqual(rec);
    await reload();
    expect(home().get()).toEqual({ h: 'gone' });
    expect(await forgetThisBrowser()).toBe(true);
    await reload();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });
});

describe('old plaintext values', () => {
  it('are read once, sealed in place (every part of the account at once), and never read as plaintext again', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'plain-p1' }, [R2]: { b: 'plain-p2' } }, [OTHER]: { [R1]: { b: 'theirs' } } } }));
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain' } } }));
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'plain-p1' });
    expect(home().get()).toEqual({ h: 'plain' });
    await cryptIdleForTests();
    const d = doc(BOARDS);
    expect(JSON.stringify(d.a[UID])).not.toContain('plain-p1');
    expect(JSON.stringify(d.a[UID])).not.toContain('plain-p2');
    expect(d.a[OTHER]).toEqual({ [R1]: { b: 'theirs' } }); // another account's slot is never touched
    expect(localStorage.getItem(HOME)).not.toContain('plain');
    expect(vault.dump().accounts.find((r) => r.account === UID)?.migrated.slice().sort()).toEqual([BOARDS, HOME].sort());
    await reload();
    expect(boards().get(R2)).toEqual({ b: 'plain-p2' });
    // Plaintext put back afterwards is not read.
    const back = doc(BOARDS);
    back.a[UID][R2] = { b: 'injected' };
    localStorage.setItem(BOARDS, JSON.stringify(back));
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'injected' } } }));
    await reload();
    expect(boards().get(R2)).toBeNull();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });

  it('a write before the first read still seals the other parts instead of dropping them', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'plain-p1' }, [R2]: { b: 'plain-p2' } } } }));
    await reload();
    boards().set({ b: 'new' }, R1);
    await cryptIdleForTests();
    expect(localStorage.getItem(BOARDS)).not.toContain('plain-p2');
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'new' });
    expect(boards().get(R2)).toEqual({ b: 'plain-p2' });
  });
});

describe('IndexedDB unavailable', () => {
  it('saved values read as null (the default) with status locked, writes are refused, and nothing is overwritten', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const stored = localStorage.getItem(HOME);
    vault = idbVault(undefined) as unknown as ReturnType<typeof memoryVault>;
    await reload();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
    expect(home().set({ h: 2 })).toBe(false);
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBe(stored);
  });

  it('a vault that refuses reads the same way', async () => {
    boards().set({ b: 1 }, R1);
    await cryptIdleForTests();
    const stored = localStorage.getItem(BOARDS);
    vault.fail.add('*');
    await reload();
    expect(boards().get(R1)).toBeNull();
    expect(boards().set({ b: 2 }, R1)).toBe(false);
    await cryptIdleForTests();
    expect(localStorage.getItem(BOARDS)).toBe(stored);
  });
});

describe('keys', () => {
  it('the base key in the vault is non-extractable (exportKey rejects) and can only derive', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const keys = await vault.keys(UID);
    expect(keys.size).toBe(1);
    const base = [...keys.values()][0] as CryptoKey;
    expect(base.extractable).toBe(false);
    expect(base.algorithm.name).toBe('HKDF');
    expect(base.usages).toEqual(['deriveKey']);
    await expect(crypto.subtle.exportKey('raw', base)).rejects.toBeTruthy();
  });
});

describe('another tab', () => {
  it("another tab's write is decrypted in the background and announced", async () => {
    home().set({ v: 'A' });
    await cryptIdleForTests();
    const a = localStorage.getItem(HOME) as string;
    home().set({ v: 'B' });
    await cryptIdleForTests();
    const heard: string[] = [];
    const off = onCryptChange((k) => heard.push(k));
    localStorage.setItem(HOME, a);
    expect(home().get()).toEqual({ v: 'B' }); // until it is open, the last value stands
    await cryptIdleForTests();
    expect(home().get()).toEqual({ v: 'A' });
    expect(heard).toContain(HOME);
    off();
  });

  it('the test helpers read what is stored and write as another tab would', async () => {
    boards().set({ b: 'mine' }, R1);
    expect(await storedForTests(BOARDS, R1)).toEqual({ b: 'mine' });
    await writeSealedForTests(BOARDS, R1, { b: 'tab2' });
    expect(await storedForTests(BOARDS, R1)).toEqual({ b: 'tab2' });
    expect(localStorage.getItem(BOARDS)).not.toContain('tab2');
    boards().get(R1);
    await cryptIdleForTests();
    expect(boards().get(R1)).toEqual({ b: 'tab2' });
  });

  it('sign-out purge of a purged key: the value is gone, not served from the cache', async () => {
    home().set({ v: 'A' });
    await cryptIdleForTests();
    localStorage.removeItem(HOME);
    expect(home().get()).toBeNull();
  });
});

describe('no read ever deletes: what does not open stays until the user writes', () => {
  const others = (n: number, prefix: string) => Object.fromEntries(Array.from({ length: n }, (_, i) => [prefix + String(i).padStart(4, '0'), { mark: i, 'é': 1.5 }]));

  it('a foreign layout reads as empty with reset foreign, its bytes stay through opening, rotation and reads; a user write reports replacing it', async () => {
    localStorage.setItem(BOARDS, '{"v":"1","not":"ours"}');
    localStorage.setItem(HOME, 'not json at all');
    await reload('sid0000000000002');
    expect(boards().get(R1)).toBeNull();
    expect(boards().read(R1)).toEqual({ value: null, reset: 'foreign' });
    expect(home().read()).toEqual({ value: null, reset: 'foreign' });
    await cryptIdleForTests();
    await reload('sid0000000000003');
    expect(localStorage.getItem(BOARDS)).toBe('{"v":"1","not":"ours"}');
    expect(localStorage.getItem(HOME)).toBe('not json at all');
    const r = boards().put({ b: 'mine' }, R1);
    expect(r).toEqual({ ok: true, evicted: { accounts: 0, parts: 0 }, replacedForeign: true });
    await cryptIdleForTests();
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'mine' });
  });

  it('a malformed own entry reads as reset malformed and stays; other accounts stay as they were', async () => {
    const theirs = others(3, 'aaaa');
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { ...theirs, [UID]: 'garbage' } }));
    const before = localStorage.getItem(BOARDS);
    await reload('sid0000000000002');
    expect(boards().read(R1)).toEqual({ value: null, reset: 'malformed' });
    await cryptIdleForTests();
    await reload('sid0000000000003');
    expect(localStorage.getItem(BOARDS)).toBe(before);
  });

  it('rotation and plaintext migration never evict, reorder or change other accounts, even past the caps', async () => {
    // UID first (the oldest entry) among 8 other accounts: a capped rewrite would evict or reorder.
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    const mine = doc(HOME).a[UID];
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: mine, ...others(8, 'bbbb') } }));
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { cl: 'codex', hid: 1 }, ...others(8, 'cccc') } }));
    const othersOf = (key: string) => Object.entries(doc(key).a).filter(([u]) => u !== UID);
    const homeOthers = othersOf(HOME), guideOthers = othersOf(GUIDE);
    await reload('sid0000000000002'); // rotation reseals HOME
    expect(guide().get()).toEqual({ cl: 'codex', hid: 1 }); // first read migrates GUIDE
    await cryptIdleForTests();
    expect(doc(HOME).a[UID].k).not.toBe(mine.k);
    expect(Object.keys(doc(HOME).a)[0]).toBe(UID);
    expect(othersOf(HOME)).toEqual(homeOthers);
    expect(Object.keys(doc(GUIDE).a)[0]).toBe(UID);
    expect(othersOf(GUIDE)).toEqual(guideOthers);
    expect(localStorage.getItem(GUIDE)).not.toContain('codex');
  });

  it('rotation never writes over a document another tab replaced or emptied meanwhile', async () => {
    home().set({ h: 1 });
    guide().set({ cl: 'codex', hid: 0 });
    await cryptIdleForTests();
    const real = crypto.subtle.encrypt.bind(crypto.subtle);
    let fired = false;
    const spy = vi.spyOn(crypto.subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => {
      if (!fired) {
        fired = true; // another tab, between the rotation's scan and its write
        localStorage.setItem(HOME, 'foreign bytes');
        localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [OTHER]: { x: 1 } } }));
      }
      return real(...args);
    });
    try { await reload('sid0000000000002'); } finally { spy.mockRestore(); }
    expect(fired).toBe(true);
    expect(localStorage.getItem(HOME)).toBe('foreign bytes');
    expect(doc(GUIDE)).toEqual({ v: 1, a: { [OTHER]: { x: 1 } } });
  });

  it('a value that does not open stays through rotation, and through a write of another part', async () => {
    boards().set({ b: 1 }, R1);
    boards().set({ b: 2 }, R2);
    await cryptIdleForTests();
    const d = doc(BOARDS);
    d.a[UID][R2].ct = (d.a[UID][R2].ct[0] === 'A' ? 'B' : 'A') + d.a[UID][R2].ct.slice(1);
    localStorage.setItem(BOARDS, JSON.stringify(d));
    const bad = JSON.stringify(d.a[UID][R2]);
    await reload('sid0000000000002');
    expect(boards().status(R2)).toBe('locked');
    boards().set({ b: 'new' }, R1);
    await cryptIdleForTests();
    expect(JSON.stringify(doc(BOARDS).a[UID][R2])).toBe(bad);
    expect(boards().get(R1)).toEqual({ b: 'new' });
  });
});


describe('stored-account cases, part 1', () => {
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const activeOf = async () => (await vault.account(UID))?.active;

  it('a storage read that fails during rotation deletes no key: rotation keeps the old key, the next open finishes', async () => {
    home().set({ h: 'home' });
    boards().set({ b: 'r1' }, R1);
    await cryptIdleForTests();
    const old = doc(HOME).a[UID].k;
    const spies: Array<{ mockRestore(): void }> = [];
    const realGet = localStorage.getItem.bind(localStorage);
    try {
      await reloadWith(() => {
        spies.push(vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => { if (k === HOME) throw new DOMException('denied', 'SecurityError'); return realGet(k); }));
      });
    } finally { for (const x of spies) x.mockRestore(); }
    expect(vault.dump().keys).toContain(UID + '/' + old);
    await reload('sid0000000000002');
    expect(home().get()).toEqual({ h: 'home' });
    expect(boards().get(R1)).toEqual({ b: 'r1' });
    expect(vault.dump().keys).toEqual([UID + '/' + (await activeOf())]);
  });

  it('a registry that cannot answer during rotation deletes no key either', async () => {
    home().set({ h: 'home' });
    await cryptIdleForTests();
    const old = doc(HOME).a[UID].k;
    const spies: Array<{ mockRestore(): void }> = [];
    try {
      await reloadWith(() => {
        spies.push(vi.spyOn(shared(), 'authStorageEntry').mockImplementation(() => { throw new Error('shared.js not ready'); }));
      });
    } finally { for (const x of spies) x.mockRestore(); }
    expect(vault.dump().keys).toContain(UID + '/' + old);
    await reload('sid0000000000002');
    expect(home().get()).toEqual({ h: 'home' });
  });

  it('rotation reseals every part of a kept key declared only later (40 realms), never trims it to the smaller cap', async () => {
    const parts = Array.from({ length: 40 }, (_, i) => 'r' + i);
    for (const [i, p] of parts.entries()) boards().set({ n: i }, p);
    await cryptIdleForTests();
    expect(Object.keys(doc(BOARDS).a[UID])).toHaveLength(40);
    await reload('sid0000000000002'); // a new page: Boards is not declared before the rotation runs
    const active = await activeOf();
    expect(vault.dump().keys).toEqual([UID + '/' + active]); // the rotation finished
    expect(Object.keys(doc(BOARDS).a[UID])).toHaveLength(40);
    for (const [i, p] of parts.entries()) {
      expect(doc(BOARDS).a[UID][p].k).toBe(active);
      expect(boards().get(p)).toEqual({ n: i });
    }
  });

  it('forget in another tab: this tab drops its keys and cached values at once (BroadcastChannel)', async () => {
    home().set({ h: 'secret-ish' });
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'secret-ish' });
    // The other tab: keys deleted and a new epoch (one transaction), then the announcement.
    await vault.forget(UID, 'other-tab');
    const ch = new BroadcastChannel('hoody-hub-crypt');
    ch.postMessage({ type: 'forget', uid: UID });
    ch.close();
    await tick();
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });

  it('forget in another tab that reopened under a new key: a write from this stale tab stores nothing (vault epoch)', async () => {
    boards().set({ b: 'forgotten board' }, R1);
    await cryptIdleForTests();
    const before = localStorage.getItem(BOARDS);
    // The other tab forgot (no announcement reached this tab) and opened the account again under a new key.
    await vault.forget(UID, 'other-tab');
    const rec = await vault.account(UID);
    const id = newKeyId();
    await vault.putKey(UID, id, await newBaseKey());
    await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id, signIn: null, epoch: 'other-tab' });
    // This tab still holds the forgotten Boards in memory; the user edits it.
    expect(boards().set({ b: 'forgotten board', more: 1 }, R1)).toBe(true);
    await cryptIdleForTests();
    expect(localStorage.getItem(BOARDS)).toBe(before);
    expect(boards().get(R1)).toBeNull();
    expect(boards().status(R1)).toBe('locked');
  });

  it('this tab forgetting announces it to the others', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const heard: unknown[] = [];
    const ch = new BroadcastChannel('hoody-hub-crypt');
    ch.onmessage = (ev) => heard.push(ev.data);
    expect(await forgetThisBrowser()).toBe(true);
    await tick();
    ch.close();
    expect(heard).toEqual([{ type: 'forget', uid: UID }]);
  });

  it('old plaintext is not read while the vault is unavailable: default, status locked, bytes kept', async () => {
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain' } } }));
    const stored = localStorage.getItem(HOME);
    vault.fail.add('*');
    await reload();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBe(stored);
  });

  it('old plaintext is not read while the account opens (status loading); it reads once opened', async () => {
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain' } } }));
    reopen();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('loading');
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'plain' });
  });

  it('a refused migration shows as unsaved; the page keeps its copy and never reads storage plaintext again', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'plain-p1' }, [R2]: { b: 'plain-p2' } } } }));
    await reload();
    const realSet = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { if (k === BOARDS) throw new DOMException('full', 'QuotaExceededError'); realSet(k, v); });
    try {
      expect(boards().get(R1)).toEqual({ b: 'plain-p1' });
      await cryptIdleForTests();
    } finally { spy.mockRestore(); }
    expect(boards().status(R1)).toBe('unsaved');
    expect(boards().status(R2)).toBe('unsaved');
    expect(boards().get(R2)).toEqual({ b: 'plain-p2' }); // read by the migration, kept as this page's copy
    const d = doc(BOARDS);
    d.a[UID][R1] = { b: 'injected' };
    localStorage.setItem(BOARDS, JSON.stringify(d));
    expect(boards().get(R1)).toEqual({ b: 'plain-p1' });
    await reload(); // the next page tries again
    expect(boards().get(R2)).toEqual({ b: 'plain-p2' });
    await cryptIdleForTests();
    expect(boards().status(R2)).toBe('ok');
    expect(localStorage.getItem(BOARDS)).not.toContain('plain-p2');
  });

  it('old plaintext over VALUE_MAX is never served nor sealed: status oversized, its bytes stay, the other parts migrate', async () => {
    const big = 'x'.repeat(VALUE_MAX + 10);
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'plain-p1' }, [R2]: big } } }));
    await reload();
    expect(boards().get(R2)).toBeNull(); // read first, before any migration started
    expect(boards().status(R2)).toBe('oversized');
    expect(boards().get(R1)).toEqual({ b: 'plain-p1' });
    await cryptIdleForTests();
    expect(doc(BOARDS).a[UID][R2]).toBe(big);
    expect(JSON.stringify(doc(BOARDS).a[UID][R1])).not.toContain('plain-p1');
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'plain-p1' });
    expect(boards().get(R2)).toBeNull();
    expect(boards().status(R2)).toBe('oversized');
  });

  it('set() is refused while the account opens (status loading), so a default never replaces the saved value', async () => {
    home().set({ h: 'saved' });
    await cryptIdleForTests();
    reopen();
    expect(home().status()).toBe('loading');
    expect(home().set({ h: 'from defaults' })).toBe(false);
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'saved' });
    await reload();
    expect(home().get()).toEqual({ h: 'saved' });
  });

  it('without Web Locks the account does not open (fail closed): no rotation, writes refused, values kept', async () => {
    home().set({ h: 'kept' });
    await cryptIdleForTests();
    const keys = vault.dump().keys, stored = localStorage.getItem(HOME);
    reopen('sid0000000000002', { tabLocks: false });
    await cryptReady();
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
    expect(home().set({ h: 'new' })).toBe(false);
    await cryptIdleForTests();
    expect(vault.dump().keys).toEqual(keys);
    expect(localStorage.getItem(HOME)).toBe(stored);
  });

  it('a tab opened before another tab migrated a key does not reseal plaintext that reappears under it', async () => {
    home().set({ h: 'sealed' });
    await cryptIdleForTests();
    // Another tab migrated GUIDE meanwhile; then old plaintext shows up under it (an old tab, a restored backup).
    const rec = await vault.account(UID);
    await vault.putAccount({ ...(rec as NonNullable<typeof rec>), migrated: [...(rec?.migrated ?? []), GUIDE] });
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { cl: 'old', hid: 1 } } }));
    const stored = localStorage.getItem(GUIDE);
    guide().get();
    await cryptIdleForTests();
    expect(guide().get()).toBeNull();
    expect(guide().status()).toBe('locked');
    expect(localStorage.getItem(GUIDE)).toBe(stored);
  });

  it('remove() right after set() cancels the write still on its way', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    home().set({ h: 2 });
    expect(home().remove()).toBe(true);
    expect(home().get()).toBeNull();
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBeNull();
    expect(home().status()).toBe('ok'); // this page's own remove(), not another tab's conflict
    await reload();
    expect(home().get()).toBeNull();
  });
});

describe('writes while the account opens, retried stores and old plaintext', () => {
  it('a write made while the account opens, then Forget at once: nothing of it comes back under the next key', async () => {
    home().set({ h: 'saved' });
    await cryptIdleForTests();
    reopen();
    home().set({ h: 'typed while opening' }); // refused; were it accepted, the forget count still drops it
    await forgetThisBrowser();
    await cryptIdleForTests();
    await reload();
    expect(home().get()).toBeNull();
    expect(await storedForTests(HOME)).toBeNull();
  });

  it('a write that migrates sibling parts fills their values at once: no read in between shows an empty default', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'plain-p1' }, [R2]: { b: 'plain-p2' } } } }));
    await reload();
    boards().set({ b: 'new' }, R1);
    await cryptIdleForTests();
    expect(localStorage.getItem(BOARDS)).not.toContain('plain-p2');
    expect(boards().get(R2)).toEqual({ b: 'plain-p2' }); // this very read, not one after a decrypt
  });

  it('a refused store is tried again: on a storage event of the key, and on a read after RETRY_MS', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const realSet = localStorage.setItem.bind(localStorage);
    const refuse = () => vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { if (k === HOME) throw new DOMException('full', 'QuotaExceededError'); realSet(k, v); });
    let spy = refuse();
    home().set({ h: 2 });
    await cryptIdleForTests();
    expect(home().status()).toBe('unsaved');
    spy.mockRestore();
    window.dispatchEvent(new StorageEvent('storage', { key: HOME }));
    await cryptIdleForTests();
    expect(home().status()).toBe('ok');
    expect(await storedForTests(HOME)).toEqual({ h: 2 });
    spy = refuse();
    home().set({ h: 3 });
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 3 }); // a read tries again at once, still refused
    await cryptIdleForTests();
    expect(home().status()).toBe('unsaved');
    spy.mockRestore();
    home().get(); // within RETRY_MS: not tried yet
    await cryptIdleForTests();
    expect(home().status()).toBe('unsaved');
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 11_000);
    try {
      home().get();
      await cryptIdleForTests();
    } finally { clock.mockRestore(); }
    expect(home().status()).toBe('ok');
    await reload();
    expect(home().get()).toEqual({ h: 3 });
  });

  it('old plaintext under a declared key is migrated without being read, and at the next open before its page runs', async () => {
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain-home' } } }));
    await reload();
    home(); // declared only, never read
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).not.toContain('plain-home');
    boards(); // declared in this page; its plaintext shows up only later (an old tab)
    await cryptIdleForTests();
    expect((await vault.account(UID))?.declared).toEqual({ [HOME]: false, [BOARDS]: true });
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'plain-b1' } } } }));
    await reload(); // a new page: Boards is not declared in it, the record says it was used
    expect(localStorage.getItem(BOARDS)).not.toContain('plain-b1');
    expect(boards().get(R1)).toEqual({ b: 'plain-b1' });
    expect(home().get()).toEqual({ h: 'plain-home' });
  });

  it("Forget deletes the account's old plaintext under every used key; other accounts and sealed values stay", async () => {
    home().set({ h: 1 });
    boards();
    guide();
    await cryptIdleForTests();
    const sealedHome = JSON.stringify(doc(HOME).a[UID]);
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { cl: 'old', hid: 1 }, [OTHER]: { x: 1 } } }));
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R2]: { b: 'plain-b2' } }, [OTHER]: { [R1]: { b: 'theirs' } } } }));
    expect(await forgetThisBrowser()).toBe(true);
    await cryptIdleForTests();
    expect(doc(GUIDE)).toEqual({ v: 1, a: { [OTHER]: { x: 1 } } });
    expect(doc(BOARDS)).toEqual({ v: 1, a: { [OTHER]: { [R1]: { b: 'theirs' } } } });
    expect(JSON.stringify(doc(HOME).a[UID])).toBe(sealedHome);
  });
});

describe('the fixed pref-key list (declareCryptKeys, from prefs.ts)', () => {
  const LIST = { [HOME]: false, [BOARDS]: true, hub_nope_v1: false };

  it('the open migrates old plaintext of every listed key before any page declares it; an unregistered key is never written', async () => {
    const realms = Array.from({ length: 40 }, (_, i) => 'realm' + String(i).padStart(2, '0'));
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain-home' } } }));
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: Object.fromEntries(realms.map((r) => [r, { b: r }])) } }));
    const nope = JSON.stringify({ v: 1, a: { [UID]: { x: 'plain-nope' } } });
    localStorage.setItem('hub_nope_v1', nope);
    await reloadWith(() => declareCryptKeys(LIST));
    expect(localStorage.getItem(HOME)).not.toContain('plain-home');
    expect(localStorage.getItem(BOARDS)).not.toContain('"b"');
    expect(Object.keys(doc(BOARDS).a[UID])).toHaveLength(40); // migration writes in place: never trimmed
    expect(localStorage.getItem('hub_nope_v1')).toBe(nope);
    expect(home().get()).toEqual({ h: 'plain-home' });
    expect(boards().get('realm39')).toEqual({ b: 'realm39' });
  });

  it('a list declared once the account is open sweeps at once', async () => {
    await reload();
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'late-plain' } } }));
    declareCryptKeys(LIST);
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).not.toContain('late-plain');
    expect(home().get()).toEqual({ h: 'late-plain' });
  });

  it('Forget deletes old plaintext under a listed key no page declared; an unregistered key is never written', async () => {
    await reloadWith(() => declareCryptKeys(LIST));
    // An old tab writes plaintext after the sweep: only Forget can find it here.
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'old-tab' } }, [OTHER]: { [R1]: { b: 'theirs' } } } }));
    const nope = JSON.stringify({ v: 1, a: { [UID]: { x: 'plain-nope' } } });
    localStorage.setItem('hub_nope_v1', nope);
    expect(await forgetThisBrowser()).toBe(true);
    expect(doc(BOARDS)).toEqual({ v: 1, a: { [OTHER]: { [R1]: { b: 'theirs' } } } });
    expect(localStorage.getItem('hub_nope_v1')).toBe(nope);
  });
});

describe('newer layouts, oversized values and writes from another tab', () => {
  it('a newer layout (v > 1) reads as reset newer and is never written over or removed, rotation included', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const newer = '{"v":2,"a":{"theirs":1}}';
    localStorage.setItem(BOARDS, newer);
    expect(boards().read(R1)).toEqual({ value: null, reset: 'newer' });
    expect(boards().set({ b: 1 }, R1)).toBe(false);
    expect(boards().put({ b: 1 }, R1).ok).toBe(false);
    expect(boards().remove(R1)).toBe(false);
    await cryptIdleForTests();
    expect(localStorage.getItem(BOARDS)).toBe(newer);
    await reload('sid0000000000002'); // a rotation: the newer layout may hold sealed values, so no key is deleted
    expect(localStorage.getItem(BOARDS)).toBe(newer);
    expect(boards().read(R1)).toEqual({ value: null, reset: 'newer' });
    expect((await vault.keys(UID)).size).toBe(2);
    expect(home().get()).toEqual({ h: 1 });
  });

  it('old plaintext over VALUE_MAX reads with reset oversized (as kit-io), and its bytes stay', async () => {
    const big = JSON.stringify({ v: 1, a: { [UID]: { pad: 'x'.repeat(VALUE_MAX + 10) } } });
    localStorage.setItem(HOME, big);
    expect(home().read()).toEqual({ value: null, reset: 'oversized' });
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBe(big);
  });

  it('a value another tab stored that this page has not opened yet is not written over: set refused (loading) until it opens', async () => {
    home().set({ h: 'theirs' });
    await cryptIdleForTests();
    const theirs = localStorage.getItem(HOME) as string;
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    localStorage.setItem(HOME, theirs); // another tab's write, its storage event not handled yet
    expect(home().set({ h: 'over' })).toBe(false);
    expect(home().status()).toBe('loading');
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'theirs' });
    expect(home().status()).toBe('ok');
    expect(home().set({ h: 'merged' })).toBe(true);
    await cryptIdleForTests();
    expect(await storedForTests(HOME)).toEqual({ h: 'merged' });
  });

  it('another tab storing the slot while this write is on its way: the write stores nothing, the page takes theirs and says conflict', async () => {
    home().set({ h: 'x' });
    await cryptIdleForTests();
    const theirs = localStorage.getItem(HOME) as string;
    home().set({ h: 1 });
    await cryptIdleForTests();
    expect(home().set({ h: 2 })).toBe(true);
    localStorage.setItem(HOME, theirs); // lands before this write takes the lock
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBe(theirs);
    expect(home().get()).toEqual({ h: 'x' });
    expect(home().status()).toBe('conflict'); // the accepted write was not stored: said, never silent
    expect(home().set({ h: 3 })).toBe(true); // the next write starts from theirs and clears it
    await cryptIdleForTests();
    expect(home().status()).toBe('ok');
    expect(await storedForTests(HOME)).toEqual({ h: 3 });
  });

  it('a reseal of the same value (another tab rotated) does not stop the write', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const resealed = localStorage.getItem(HOME) as string;
    home().set({ h: 1 }); // the same value under a fresh IV
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).not.toBe(resealed);
    expect(home().set({ h: 2 })).toBe(true);
    localStorage.setItem(HOME, resealed);
    await cryptIdleForTests();
    expect(await storedForTests(HOME)).toEqual({ h: 2 });
    expect(home().get()).toEqual({ h: 2 });
  });
});

describe('put() reports what the write will do', () => {
  it('evictions count the writes still on their way (64 quick realm writes, then a 65th)', async () => {
    for (let i = 0; i < 64; i++) expect(boards().put({ n: i }, 'r' + i).evicted.parts).toBe(0);
    expect(boards().put({ n: 64 }, 'r64')).toEqual({ ok: true, evicted: { accounts: 0, parts: 1 }, replacedForeign: false });
    await cryptIdleForTests();
    expect(Object.keys(doc(BOARDS).a[UID])).toHaveLength(64);
    expect(doc(BOARDS).a[UID].r0).toBeUndefined();
  });
});

describe('Forget and rotation reach other tabs', () => {
  const tick = () => new Promise((r) => setTimeout(r, 30));

  it('a tab that missed the Forget message drops its cached values when it shows again (visibilitychange, pageshow)', async () => {
    for (const ev of ['visibilitychange', 'pageshow']) {
      home().set({ h: 'secret-ish' });
      await cryptIdleForTests();
      expect(home().get()).toEqual({ h: 'secret-ish' });
      await vault.forget(UID, 'other-tab-' + ev); // no announcement reaches this tab
      expect(home().get()).toEqual({ h: 'secret-ish' }); // still cached until the tab shows again
      if (ev === 'visibilitychange') document.dispatchEvent(new Event('visibilitychange'));
      else window.dispatchEvent(new Event('pageshow'));
      await tick();
      await cryptIdleForTests();
      expect(home().get()).toBeNull();
      expect(home().status()).toBe('locked');
    }
  });

  it('a rotation is announced, and a tab hearing it drops the old key handles: an old copy no longer opens there', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const old = localStorage.getItem(HOME) as string;
    home().set({ h: 2 });
    await cryptIdleForTests();
    // The other tab rotated: a new active key, the old one deleted, then the announcement.
    const rec = await vault.account(UID);
    const id = newKeyId();
    await vault.putKey(UID, id, await newBaseKey());
    await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
    await vault.deleteKeys(UID, id);
    const ch = new BroadcastChannel('hoody-hub-crypt');
    ch.postMessage({ type: 'rotate', uid: UID });
    ch.close();
    await tick();
    await cryptIdleForTests();
    localStorage.setItem(HOME, old); // an old copy put back
    home().get();
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });

  it('this tab rotating at a new sign-in announces it', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const heard: unknown[] = [];
    const ch = new BroadcastChannel('hoody-hub-crypt');
    ch.onmessage = (ev) => heard.push(ev.data);
    await reload('sid0000000000002');
    await tick();
    ch.close();
    expect(heard).toContainEqual({ type: 'rotate', uid: UID });
  });
});

describe('migration, Forget and rotation while the account opens', () => {
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const migrated = async () => (await vault.account(UID))?.migrated ?? [];

  it('while the open sweep migrates a key this page has not read, a read shows loading and a write is refused', async () => {
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain' } } }));
    // Vault reads wait in a queue, let through one at a time until the sweep's migration of HOME is running.
    const orig = vault.account.bind(vault), q: Array<() => void> = [];
    let holding = true;
    vault.account = (u) => (holding ? new Promise((res, rej) => { q.push(() => { orig(u).then(res, rej); }); }) : orig(u));
    try {
      reopen();
      declareCryptKeys({ [HOME]: false });
      for (let i = 0; i < 400 && !migratingForTests(HOME); i++) { await new Promise((r) => setTimeout(r, 0)); q.shift()?.(); }
      expect(migratingForTests(HOME)).toBe(true);
      expect(home().get()).toBeNull();
      expect(home().status()).toBe('loading');
      expect(home().set({ h: 'default' })).toBe(false);
    } finally {
      holding = false;
      vault.account = orig;
      while (q.length) q.shift()?.();
    }
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'plain' });
    expect(home().status()).toBe('ok');
    await reload();
    expect(home().get()).toEqual({ h: 'plain' });
  });

  it('Forget deletes old plaintext first: the browser refusing, it says so and the keys stay; done again, it works', async () => {
    home().set({ h: 1 });
    boards().set({ b: 'kept' }, R1);
    await cryptIdleForTests();
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain-left' } } })); // HOME is migrated: never read
    const keys = vault.dump().keys;
    const refuse = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    const setSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(refuse);
    const removeSpy = vi.spyOn(localStorage, 'removeItem').mockImplementation(refuse);
    let ok: boolean;
    try { ok = await forgetThisBrowser(); } finally { setSpy.mockRestore(); removeSpy.mockRestore(); }
    expect(ok).toBe(false);
    expect(vault.dump().keys).toEqual(keys);
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'kept' });
    expect(await forgetThisBrowser()).toBe(true);
    expect(localStorage.getItem(HOME) ?? '').not.toContain('plain-left');
    await reload();
    expect(boards().get(R1)).toBeNull();
  });

  it('a rotation heard while the account opens: the old key handles are dropped before it opens', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    const old = localStorage.getItem(HOME) as string;
    home().set({ h: 2 });
    await cryptIdleForTests();
    // The opening page reads the key handles (old key included), then waits while the other tab rotates.
    const origKeys = vault.keys.bind(vault);
    let release!: () => void, held = false;
    const gate = new Promise<void>((r) => { release = r; });
    vault.keys = async (u) => { const k = await origKeys(u); if (!held) { held = true; await gate; } return k; };
    try {
      reopen();
      for (let i = 0; i < 400 && !held; i++) await new Promise((r) => setTimeout(r, 0));
      expect(held).toBe(true);
      const rec = await vault.account(UID);
      const id = newKeyId();
      await vault.putKey(UID, id, await newBaseKey());
      await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
      await vault.deleteKeys(UID, id);
      const ch = new BroadcastChannel('hoody-hub-crypt');
      ch.postMessage({ type: 'rotate', uid: UID });
      ch.close();
      await tick();
    } finally { vault.keys = origKeys; release(); }
    await cryptReady();
    await cryptIdleForTests();
    localStorage.setItem(HOME, old); // an old copy put back
    home().get();
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });

  /** Lets other event-loop work (a BroadcastChannel delivery) run while setTimeout is faked. */
  const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

  it('a key refresh the vault does not answer after a rotation locks the opened values, and they open again once it answers', async () => {
    home().set({ h: 'kept' });
    await cryptIdleForTests();
    // The other tab rotates and keeps the old key; this tab's refresh then gets no answer.
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
      await spin(); // the announcement arrives; the refresh is refused
      expect(home().get()).toBeNull(); // no key confirmed: not shown
      expect(home().status()).toBe('locked');
      vault.fail.clear();
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { vi.useRealTimers(); }
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'kept' }); // its key survived: open again
    expect(home().status()).toBe('ok');
  });

  it('a key refresh still silent after the retries closes the account, which fails closed; nothing is deleted', async () => {
    home().set({ h: 'kept' });
    await cryptIdleForTests();
    vault.fail.add('keys');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const ch = new BroadcastChannel('hoody-hub-crypt');
      ch.postMessage({ type: 'rotate', uid: UID });
      ch.close();
      await spin();
      for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(5_000); await spin(); }
    } finally { vi.useRealTimers(); }
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().set({ h: 'y' })).toBe(false);
    vault.fail.clear();
    await reload();
    expect(home().get()).toEqual({ h: 'kept' });
  });

  it('a second rotation during the opening refresh: the keys are read again, a key it deleted does not open values', async () => {
    home().set({ h: 'old key' });
    await cryptIdleForTests();
    const first = await vault.account(UID);
    const k1 = newKeyId();
    const origKeys = vault.keys.bind(vault);
    let calls = 0, release1!: () => void, release2!: () => void, held1 = false, held2 = false;
    const gate1 = new Promise<void>((r) => { release1 = r; }), gate2 = new Promise<void>((r) => { release2 = r; });
    vault.keys = async (u) => {
      const n = ++calls, k = await origKeys(u);
      if (n === 1) { held1 = true; await gate1; } else if (n === 2) { held2 = true; await gate2; }
      return k;
    };
    const wait = async (f: () => boolean) => { for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 0)); };
    const announce = () => { const ch = new BroadcastChannel('hoody-hub-crypt'); ch.postMessage({ type: 'rotate', uid: UID }); ch.close(); };
    try {
      reopen();
      await wait(() => held1);
      expect(held1).toBe(true);
      // Rotation 1 in another tab: a new active key, the old one kept for now.
      await vault.putKey(UID, k1, await newBaseKey());
      await vault.putAccount({ ...(first as NonNullable<typeof first>), active: k1 });
      announce();
      await tick();
      release1();
      await wait(() => held2); // the opening refresh read the handles (old key included) and waits
      expect(held2).toBe(true);
      // Rotation 2: another active key; every earlier key is deleted.
      const k2 = newKeyId();
      await vault.putKey(UID, k2, await newBaseKey());
      await vault.putAccount({ ...(first as NonNullable<typeof first>), active: k2 });
      await vault.deleteKeys(UID, k2);
      announce();
      await tick();
    } finally { vault.keys = origKeys; release1(); release2(); }
    await cryptReady();
    await cryptIdleForTests();
    home().get();
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });

  it('a vault that cannot answer at the show-again recheck is asked again: a Forget it missed still closes the values', async () => {
    home().set({ h: 'x' });
    await cryptIdleForTests();
    await vault.forget(UID, 'missed-epoch'); // no announcement reaches this tab
    vault.fail.add('account');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(home().get()).toBeNull(); // refused: locked at once while it is asked again
      vault.fail.clear();
      await vi.advanceTimersByTimeAsync(600);
    } finally { vi.useRealTimers(); }
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });

  it('still silent after the retries: the account closes and opens again, which fails closed', async () => {
    home().set({ h: 'x' });
    await cryptIdleForTests();
    vault.fail.add('account');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(20_000);
    } finally { vi.useRealTimers(); }
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().set({ h: 'y' })).toBe(false);
    vault.fail.clear();
    await reload();
    expect(home().get()).toEqual({ h: 'x' }); // nothing was deleted
  });

  it('with old plaintext saved (the open-time precheck covers sealed values only): writes are refused while the account opens and when it cannot open', async () => {
    localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain' } } }));
    reopen();
    expect(home().set({ h: 'from defaults' })).toBe(false);
    await cryptReady();
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'plain' });
    // A vault that refuses: the account is unavailable; old plaintext and an empty slot both refuse writes.
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'plain-b' } } } }));
    const stored = localStorage.getItem(BOARDS);
    vault.fail.add('*');
    await reload();
    expect(boards().set({ b: 'new' }, R1)).toBe(false);
    expect(boards().set({ b: 'new' }, R2)).toBe(false);
    await cryptIdleForTests();
    expect(localStorage.getItem(BOARDS)).toBe(stored);
    vault.fail.clear();
  });

  it('an old part over VALUE_MAX stays plaintext and keeps the key unmigrated until that slot is written', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'small' }, [R2]: { b: 'x'.repeat(VALUE_MAX) } } } }));
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'small' });
    await cryptIdleForTests();
    expect(boards().status(R2)).toBe('oversized');
    expect(await migrated()).not.toContain(BOARDS);
    await reload(); // the open's sweep finds it again; the sealed part still opens
    expect(boards().get(R1)).toEqual({ b: 'small' });
    await cryptIdleForTests();
    expect(await migrated()).not.toContain(BOARDS);
    expect(boards().set({ b: 'new' }, R2)).toBe(true);
    await cryptIdleForTests();
    expect(await migrated()).toContain(BOARDS);
    expect(localStorage.getItem(BOARDS)).not.toContain('xxxxxxxx');
    await reload();
    expect(boards().get(R2)).toEqual({ b: 'new' });
  });
});

describe('status reads, Forget errors, write conflicts and rotations', () => {
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const until = async (f: () => boolean) => { for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 0)); };

  it('another tab\'s value read only through status() (as prefs\' write does) opens: \'loading\' ends', async () => {
    home().set({ h: 'theirs' });
    await cryptIdleForTests();
    const theirs = localStorage.getItem(HOME) as string;
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    localStorage.setItem(HOME, theirs); // no storage event in this window, and no get()
    expect(home().status()).toBe('loading');
    await cryptIdleForTests();
    expect(home().status()).toBe('ok');
    expect(home().get()).toEqual({ h: 'theirs' });
  });

  it('Forget with storage that cannot be read (the first read, or the check after deleting): it says so and the keys stay', async () => {
    for (const failOn of [1, 2]) {
      home().set({ h: 1 });
      boards().set({ b: 'kept' }, R1);
      await cryptIdleForTests();
      localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'plain-left' } } })); // HOME is migrated: never read
      const keys = vault.dump().keys;
      const box = localStorage, getItem = box.getItem.bind(box);
      let n = 0;
      const spy = vi.spyOn(box, 'getItem').mockImplementation((k: string) => {
        if (k === HOME && ++n === failOn) throw new DOMException('denied', 'SecurityError');
        return getItem(k);
      });
      let ok: boolean;
      try { ok = await forgetThisBrowser(); } finally { spy.mockRestore(); }
      expect(ok, 'read ' + failOn).toBe(false);
      expect(vault.dump().keys).toEqual(keys);
      await reload();
      expect(boards().get(R1)).toEqual({ b: 'kept' });
    }
  });

  it('another tab removing the slot while this write is on its way: the write does not bring it back (conflict)', async () => {
    home().set({ h: 1 });
    await cryptIdleForTests();
    expect(home().set({ h: 2 })).toBe(true);
    localStorage.removeItem(HOME); // lands before this write takes the lock
    await cryptIdleForTests();
    expect(localStorage.getItem(HOME)).toBeNull();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('conflict');
  });

  it('the check survives an account switch: a write still on its way does not store over another tab\'s newer value', async () => {
    home().set({ h: 'x' });
    await cryptIdleForTests();
    const theirs = localStorage.getItem(HOME) as string;
    home().set({ h: 1 });
    await cryptIdleForTests();
    expect(home().set({ h: 2 })).toBe(true);
    localStorage.setItem(HOME, theirs); // another tab stored first
    show(OTHER); // this tab switches accounts before the write runs (its cache goes)
    await cryptIdleForTests();
    show(UID);
    await cryptReady();
    await cryptIdleForTests();
    expect(await storedForTests(HOME)).toEqual({ h: 'x' });
  });

  it('a value shown from an old copy opened before the rotation is shown no more once the rotation is heard', async () => {
    home().set({ h: 'historical' });
    await cryptIdleForTests();
    const old = localStorage.getItem(HOME) as string;
    home().set({ h: 'current' });
    await cryptIdleForTests();
    localStorage.setItem(HOME, old); // an old copy put back while its key still exists: it opens
    home().get();
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'historical' });
    const rec = await vault.account(UID);
    const id = newKeyId();
    await vault.putKey(UID, id, await newBaseKey());
    await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
    await vault.deleteKeys(UID, id);
    const ch = new BroadcastChannel('hoody-hub-crypt');
    ch.postMessage({ type: 'rotate', uid: UID });
    ch.close();
    await tick();
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });

  it('a decrypt that was running when a rotation is heard is not used: an old copy does not open with the deleted key', async () => {
    home().set({ h: 'historical' });
    await cryptIdleForTests();
    const old = localStorage.getItem(HOME) as string;
    home().set({ h: 'current' });
    await cryptIdleForTests();
    // This tab starts opening the old copy (put back); its decrypt waits.
    const subtle = globalThis.crypto.subtle, decrypt = subtle.decrypt.bind(subtle);
    let release!: () => void, paused = false;
    const gate = new Promise<void>((r) => { release = r; });
    const spy = vi.spyOn(subtle, 'decrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['decrypt']>) => {
      if (!paused) { paused = true; await gate; }
      return decrypt(...args);
    });
    try {
      localStorage.setItem(HOME, old);
      home().get();
      await until(() => paused);
      expect(paused).toBe(true);
      // The other tab rotates: a new active key, the old one deleted, then the announcement.
      const rec = await vault.account(UID);
      const id = newKeyId();
      await vault.putKey(UID, id, await newBaseKey());
      await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
      await vault.deleteKeys(UID, id);
      const ch = new BroadcastChannel('hoody-hub-crypt');
      ch.postMessage({ type: 'rotate', uid: UID });
      ch.close();
      await tick();
    } finally { release(); }
    await cryptIdleForTests();
    spy.mockRestore();
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked');
  });
});

describe('reads while the account opens, ends or refreshes its keys', () => {
  beforeEach(fresh);
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  const announce = () => { const ch = new BroadcastChannel('hoody-hub-crypt'); ch.postMessage({ type: 'rotate', uid: UID }); ch.close(); };
  async function rotateKeepingOld(): Promise<void> {
    const rec = await vault.account(UID);
    const id = newKeyId();
    await vault.putKey(UID, id, await newBaseKey());
    await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
  }

  it('once sign-out starts nothing of the account reads, through the teardown too, though the identity is still shown', async () => {
    home().set({ h: 'mine' });
    guide().set({ g: 'kept' });
    boards().set({ b: 'board' }, R1);
    await cryptIdleForTests();
    startLoggingOut();
    expect(capture().account).toBe(UID); // the identity stays until the page leaves
    expect(home().get()).toBeNull();
    expect(guide().get()).toBeNull();
    expect(boards().get(R1)).toBeNull();
    expect(home().set({ h: 'late' })).toBe(false);
    endAccount('logout'); // the teardown: the account must not open again
    await cryptReady();
    await cryptIdleForTests();
    expect(capture().account).toBe(UID);
    expect(home().get()).toBeNull();
    expect(guide().get()).toBeNull();
    expect(boards().get(R1)).toBeNull();
    expect(home().status()).toBe('ok'); // no account: defaults, nothing pending
  });

  it('an account that ended without sign-out (expired) reads as none too, and does not open again', async () => {
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    endAccount('expired');
    await cryptReady();
    await cryptIdleForTests();
    expect(home().get()).toBeNull();
    expect(home().set({ h: 'late' })).toBe(false);
  });

  it('values opened while the account opens are not read before it is open (a rotation heard meanwhile, its key read pending)', async () => {
    home().set({ h: 'opened' });
    await cryptIdleForTests();
    const origKeys = vault.keys.bind(vault);
    let calls = 0, release!: () => void, held = false;
    const gate = new Promise<void>((r) => { release = r; });
    vault.keys = async (u) => {
      const n = ++calls, k = await origKeys(u);
      if (n === 2) { held = true; await gate; } // the opening refresh after the rotation
      return k;
    };
    try {
      reopen();
      await rotateKeepingOld();
      for (let i = 0; i < 400 && calls < 1; i++) await new Promise((r) => setTimeout(r, 0));
      announce();
      for (let i = 0; i < 400 && !held; i++) await new Promise((r) => setTimeout(r, 0));
      expect(held).toBe(true);
      expect(home().status()).toBe('loading');
      expect(home().get()).toBeNull(); // opened, not yet confirmed: not shown
    } finally { vault.keys = origKeys; release(); }
    await cryptReady();
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'opened' }); // its key survived: shown once open
  });

  it('an opening that fails after values were opened keeps none of them readable', async () => {
    home().set({ h: 'opened' });
    await cryptIdleForTests();
    const origKeys = vault.keys.bind(vault);
    let calls = 0;
    vault.keys = async (u) => { if (++calls === 2) throw new Error('VAULT_FAIL'); return origKeys(u); };
    try {
      reopen();
      await rotateKeepingOld();
      for (let i = 0; i < 400 && calls < 1; i++) await new Promise((r) => setTimeout(r, 0));
      announce();
      await cryptReady();
      await cryptIdleForTests();
    } finally { vault.keys = origKeys; }
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(home().get()).toBeNull();
    expect(home().status()).toBe('locked'); // a stored value it cannot open: never 'ok' over defaults
    expect(home().set({ h: 'y' })).toBe(false);
  });

  it('a key refresh that never answers (pending, not refused) locks the opened values within its deadline, and they open again once the vault answers', async () => {
    home().set({ h: 'kept' });
    await cryptIdleForTests();
    await rotateKeepingOld();
    const origKeys = vault.keys.bind(vault);
    let calls = 0;
    vault.keys = (u) => (++calls === 1 ? new Promise<never>(() => {}) : origKeys(u)); // the first read hangs
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      announce();
      await spin();
      expect(calls).toBe(1);
      expect(home().get()).toEqual({ h: 'kept' }); // the window: nothing locks before the read answers or its deadline
      await vi.advanceTimersByTimeAsync(2_100); // past the deadline, before the retry
      await spin();
      expect(calls).toBe(1);
      expect(home().get()).toBeNull(); // the deadline passed: nothing confirmed is shown
      expect(home().status()).toBe('locked');
      await vi.advanceTimersByTimeAsync(5_000);
      await spin();
    } finally { vi.useRealTimers(); vault.keys = origKeys; }
    await cryptIdleForTests();
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(home().get()).toEqual({ h: 'kept' });
  });

  it('an opening refresh read that never answers does not keep the account opening: past its deadline it fails closed', async () => {
    home().set({ h: 'opened' });
    await cryptIdleForTests();
    const origKeys = vault.keys.bind(vault);
    let calls = 0;
    vault.keys = (u) => (++calls === 2 ? new Promise<never>(() => {}) : origKeys(u)); // the refresh after the rotation hangs
    try {
      reopen();
      await rotateKeepingOld();
      for (let i = 0; i < 400 && calls < 1; i++) await new Promise((r) => setTimeout(r, 0));
      announce();
      for (let i = 0; i < 400 && calls < 2; i++) await new Promise((r) => setTimeout(r, 0));
      expect(calls).toBe(2);
      expect(home().status()).toBe('loading');
      for (let i = 0; i < 300 && home().status() === 'loading'; i++) await new Promise((r) => setTimeout(r, 10));
    } finally { vault.keys = origKeys; }
    expect(home().status()).not.toBe('loading');
    expect(home().get()).toBeNull();
    await reload();
    expect(home().get()).toEqual({ h: 'opened' });
  });

  it('rotations that keep arriving while the account opens do not keep it opening forever: it fails closed', async () => {
    home().set({ h: 'opened' });
    await cryptIdleForTests();
    const origKeys = vault.keys.bind(vault);
    let calls = 0;
    vault.keys = async (u) => {
      const k = await origKeys(u);
      if (++calls >= 2) { announce(); await tick(); } // every opening refresh hears another rotation
      return k;
    };
    try {
      reopen();
      await rotateKeepingOld();
      for (let i = 0; i < 400 && calls < 1; i++) await new Promise((r) => setTimeout(r, 0));
      announce();
      for (let i = 0; i < 2000 && calls < 12 && home().status() === 'loading'; i++) await new Promise((r) => setTimeout(r, 0));
    } finally { vault.keys = origKeys; }
    expect(home().status()).not.toBe('loading');
    expect(calls).toBeLessThan(12);
    expect(home().get()).toBeNull();
  });

  it('pendingPrefWrites() counts accepted writes of keys kept at sign-out still on their way; purged keys are not counted', async () => {
    expect(pendingPrefWrites()).toBe(0);
    const subtle = globalThis.crypto.subtle, encrypt = subtle.encrypt.bind(subtle);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => { await gate; return encrypt(...args); });
    try {
      guide().set({ g: 'a' });
      boards().set({ b: 1 }, R1);
      home().set({ h: 'a' }); // purged at sign-out: its loss at sign-out is the purge itself
      await tick();
      expect(pendingPrefWrites()).toBe(2);
    } finally { release(); spy.mockRestore(); }
    await cryptIdleForTests();
    expect(pendingPrefWrites()).toBe(0);
  });

  it('a kept write that never finishes does not hold sign-out past its bound: the page leaves, and the outcome reads timeout', async () => {
    const left: string[] = [];
    configureLifecycle({ navigate: (to: string) => { left.push(to); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    const subtle = globalThis.crypto.subtle, encrypt = subtle.encrypt.bind(subtle);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    // Sealing does not finish while sign-out runs (released only after the page left, so the test ends clean).
    const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => { await gate; return encrypt(...args); });
    try {
      expect(guide().set({ g: 'stuck' })).toBe(true);
      await tick();
      expect(pendingPrefWrites()).toBe(1);
      const outcome = cryptWritesSettled(100);
      logout({ minWaitMs: 0, endMs: 0, writesMs: 100 });
      for (let i = 0; i < 100 && !left.length; i++) await new Promise((r) => setTimeout(r, 10));
      expect(left).toEqual(['/auth/login']);
      expect(await outcome).toBe('timeout');
      expect(pendingPrefWrites()).toBe(1); // still on its way when the page left (released below only to end clean)
    } finally { release(); spy.mockRestore(); }
    await cryptIdleForTests();
  });

  it('sign-out lets an accepted write of a key kept at sign-out land before the page leaves; a purged key\'s does not', async () => {
    const left: Array<string | null> = [];
    configureLifecycle({ navigate: () => { left.push(localStorage.getItem(GUIDE)); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    guide().set({ g: 'before' });
    home().set({ h: 'before' });
    await cryptIdleForTests();
    const guideBefore = localStorage.getItem(GUIDE), homeBefore = localStorage.getItem(HOME);
    // Sealing waits: both writes are accepted ('saving') when sign-out starts.
    const subtle = globalThis.crypto.subtle, encrypt = subtle.encrypt.bind(subtle);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => { await gate; return encrypt(...args); });
    try {
      expect(guide().set({ g: 'accepted' })).toBe(true);
      expect(home().set({ h: 'accepted' })).toBe(true);
      logout({ minWaitMs: 0, endMs: 0 });
      await tick();
      expect(left).toEqual([]); // not left while the kept write is on its way
      release();
      for (let i = 0; i < 200 && !left.length; i++) await new Promise((r) => setTimeout(r, 10));
    } finally { spy.mockRestore(); release(); }
    await cryptIdleForTests();
    expect(left.length).toBe(1);
    expect(left[0]).not.toBe(guideBefore); // it landed before the page left
    expect(localStorage.getItem(HOME) === homeBefore || localStorage.getItem(HOME) === null).toBe(true); // purged key: never the late value
    await reload();
    expect(guide().get()).toEqual({ g: 'accepted' });
  });
});

describe('stored-account cases, part 6', () => {
  beforeEach(fresh);
  const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

  it('old plaintext over VALUE_MAX of a key kept at sign-out does not stay at rest once the account ends; other accounts\' stays', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'x'.repeat(VALUE_MAX) }, [OTHER]: { g: 'small' } } }));
    await reload();
    expect(guide().get()).toBeNull();
    await cryptIdleForTests();
    expect(guide().status()).toBe('oversized');
    expect(localStorage.getItem(GUIDE)).toContain('xxxxxxxx');
    endAccount('signout');
    await cryptIdleForTests();
    expect(localStorage.getItem(GUIDE)).not.toContain('xxxxxxxx');
    expect(doc(GUIDE).a[OTHER]).toEqual({ g: 'small' });
  });

  it('a show-again recheck whose vault read never answers locks the opened values within its deadline; they open again once it answers', async () => {
    home().set({ h: 'kept' });
    await cryptIdleForTests();
    const origAccount = vault.account.bind(vault);
    let calls = 0;
    vault.account = (u) => (++calls === 1 ? new Promise<never>(() => {}) : origAccount(u)); // the first read hangs
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await spin();
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(2_100); // past the deadline, before the retry
      await spin();
      expect(home().get()).toBeNull();
      expect(home().status()).toBe('locked');
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { vi.useRealTimers(); vault.account = origAccount; }
    await cryptIdleForTests();
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(home().get()).toEqual({ h: 'kept' });
  });
});

describe('refused writes at sign-out and oversized plaintext', () => {
  beforeEach(fresh);
  const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

  it('a kept write that the browser refuses after sign-out began is reported: outcome unsaved, counted', async () => {
    const subtle = globalThis.crypto.subtle, encrypt = subtle.encrypt.bind(subtle);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => { await gate; return encrypt(...args); });
    const put = vi.spyOn(localStorage, 'setItem');
    try {
      expect(guide().set({ g: 'accepted' })).toBe(true);
      await new Promise((r) => setTimeout(r, 30));
      startLoggingOut();
      put.mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
      const outcome = cryptWritesSettled(2000);
      release();
      expect(await outcome).toBe('unsaved');
      expect(unsavedAtSignOut()).toBe(1);
    } finally { release(); spy.mockRestore(); put.mockRestore(); }
  });

  it('a value another tab sealed under a key this page lacks, whose key read never answers: locked within the deadline', async () => {
    guide().set({ g: 'mine' });
    await cryptIdleForTests();
    const d = doc(GUIDE);
    d.a[UID] = { ...d.a[UID], k: 'zzzzzzzzzzzzzzzzzzzzzz' }; // a key id this page does not hold
    const origKeys = vault.keys.bind(vault);
    vault.keys = () => new Promise<never>(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      localStorage.setItem(GUIDE, JSON.stringify(d));
      window.dispatchEvent(new StorageEvent('storage', { key: GUIDE, storageArea: localStorage }));
      guide().get();
      await spin();
      await vi.advanceTimersByTimeAsync(2_100);
      await spin();
      expect(guide().get()).toBeNull();
      expect(guide().status()).toBe('locked');
    } finally { vi.useRealTimers(); vault.keys = origKeys; }
  });
});

describe('stored-account cases, part 8', () => {
  beforeEach(fresh);
  /** setItem refuses one key (the browser's quota), the others store. */
  const refuseKey = (key: string) => {
    const put = Storage.prototype.setItem;
    return vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === key) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
  };

  it('a kept write the browser refused after set() answered true is counted by pendingPrefWrites, and reported at sign-out', async () => {
    guide().set({ g: 'before' });
    await cryptIdleForTests();
    const spy = refuseKey(GUIDE);
    try {
      expect(guide().set({ g: 'refused later' })).toBe(true); // accepted: the store is refused in the background
      await cryptIdleForTests();
      expect(guide().status()).toBe('unsaved');
      expect(pendingPrefWrites()).toBe(1); // the sign-out confirm opens
      startLoggingOut();
      expect(await cryptWritesSettled(2000)).toBe('unsaved');
      expect(unsavedAtSignOut()).toBe(1);
    } finally { spy.mockRestore(); }
  });

  it('a refused write of a purged key is not counted (sign-out removes it anyway)', async () => {
    const spy = refuseKey(HOME);
    try {
      expect(home().set({ h: 'refused later' })).toBe(true);
      await cryptIdleForTests();
      expect(home().status()).toBe('unsaved');
      expect(pendingPrefWrites()).toBe(0);
    } finally { spy.mockRestore(); }
  });

  it('the oversized-plaintext removal reads the document once and writes what that read held', async () => {
    const a = JSON.stringify({ v: 1, a: { [UID]: { g: 'x'.repeat(VALUE_MAX) }, [OTHER]: { g: 'a' } } });
    const b = JSON.stringify({ v: 1, a: { [UID]: { g: 'fresh' }, [OTHER]: { g: 'b' } } }); // another tab, a moment later
    localStorage.setItem(GUIDE, a);
    await reload();
    await cryptIdleForTests();
    expect(guide().status()).toBe('oversized');
    const get = Storage.prototype.getItem;
    let reads = 0, written: string | null | undefined;
    const r = vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k !== GUIDE || written !== undefined) return get.call(localStorage, k);
      return ++reads === 1 ? a : b;
    });
    const w = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === GUIDE && written === undefined) written = v;
      Storage.prototype.setItem.call(localStorage, k, v);
    });
    try { endAccount('signout'); await cryptWritesSettled(3000); } finally { r.mockRestore(); w.mockRestore(); }
    expect(reads).toBeGreaterThanOrEqual(1);
    expect(written).not.toContain('xxxxxxxx'); // no write keeps the big plaintext (sealed or removed)
    expect([{ g: 'a' }, { g: 'b' }]).toContainEqual(JSON.parse(written as string).a[OTHER]); // another account's, as read
  });

  it('an accepted edit replacing an oversized slot, still on its way at sign-out, is stored sealed, not lost', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'x'.repeat(VALUE_MAX) }, [OTHER]: { g: 'small' } } }));
    await reload();
    await cryptIdleForTests();
    expect(guide().status()).toBe('oversized');
    expect(guide().set({ g: 'new' })).toBe(true); // its persist() has not reached its conflict check yet
    startLoggingOut();
    endAccount('logout'); // logout(): the teardown runs before sign-out waits for the write
    expect(await cryptWritesSettled(2000)).toBe('stored');
    await cryptIdleForTests();
    expect(localStorage.getItem(GUIDE)).not.toContain('xxxxxxxx');
    const leaf = doc(GUIDE).a[UID];
    expect(leaf && typeof leaf === 'object' && 'ct' in leaf).toBe(true); // the edit, sealed for its account
    expect(unsavedAtSignOut()).toBe(0);
    expect(doc(GUIDE).a[OTHER]).toEqual({ g: 'small' });
  });

  it('such an edit that the browser then refuses: reported unsaved, and the old plaintext still goes when it ends', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'x'.repeat(VALUE_MAX) } } }));
    await reload();
    await cryptIdleForTests();
    const spy = refuseKey(GUIDE); // the store is refused; a removal of the whole key is not
    try {
      expect(guide().set({ g: 'new' })).toBe(true);
      startLoggingOut();
      endAccount('logout');
      expect(localStorage.getItem(GUIDE)).toContain('xxxxxxxx'); // left to the write on its way
      expect(await cryptWritesSettled(2000)).toBe('unsaved');
      expect(unsavedAtSignOut()).toBe(1);
      expect(localStorage.getItem(GUIDE)).toBeNull(); // removed once that write ended
    } finally { spy.mockRestore(); }
  });
});

describe('after a sign-out the person asked for, no plaintext of the leaving account stays at rest', () => {
  beforeEach(fresh);
  const refuseKey = (key: string) => {
    const put = Storage.prototype.setItem;
    return vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === key) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
  };
  const sealed = (x: unknown) => !!x && typeof x === 'object' && 'ct' in (x as object);

  it('a small old plaintext value not yet sealed is counted before sign-out, and sealed for its account while sign-out waits', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => { held.spy = refuseKey(GUIDE); }); // the open's migration is refused: it stays plaintext
      expect(guide().get()).toEqual({ g: 'legacy' });
      await cryptIdleForTests();
    } finally { held.spy?.mockRestore(); }
    expect(doc(GUIDE).a[UID]).toEqual({ g: 'legacy' });
    expect(pendingPrefWrites()).toBe(1); // the sign-out confirm names it
    signOutAsked(); // as logout() does, before sign-out starts
    startLoggingOut();
    endAccount('logout');
    expect(await cryptWritesSettled(3000)).toBe('stored');
    await cryptIdleForTests();
    expect(sealed(doc(GUIDE).a[UID])).toBe(true); // sealed, not deleted: the next sign-in reads it
    expect(doc(GUIDE).a[OTHER]).toEqual({ g: 'theirs' }); // another account's value is untouched
    expect(unsavedAtSignOut()).toBe(0);
    await reload();
    expect(guide().get()).toEqual({ g: 'legacy' });
  });

  it('a seal the browser refuses at a sign-out through logout() is counted, then the plaintext is removed', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' } } }));
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    const left: string[] = [];
    try {
      await reloadWith(() => { held.spy = refuseKey(GUIDE); }); // refused at open and at sign-out; removing the key is not
      configureLifecycle({ navigate: (to) => { left.push(to); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
      initLive();
      guide().get();
      await cryptIdleForTests();
      expect(pendingPrefWrites()).toBe(1);
      logout({ minWaitMs: 0, endMs: 0 });
      for (let i = 0; i < 300 && !left.length; i++) await new Promise((r) => setTimeout(r, 10));
      expect(left).toEqual(['/auth/login']);
      expect(await cryptWritesSettled(3000)).toBe('unsaved');
      expect(unsavedAtSignOut()).toBe(1);
      expect(localStorage.getItem(GUIDE)).toBeNull();
    } finally { held.spy?.mockRestore(); }
  });

  it('a part that cannot be sealed (over VALUE_MAX) is counted before sign-out and removed; sealed parts stay; other accounts untouched', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'small' }, [R2]: { b: 'x'.repeat(VALUE_MAX) } }, [OTHER]: { [R1]: { b: 'theirs' } } } }));
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'small' });
    await cryptIdleForTests();
    expect(boards().status(R2)).toBe('oversized');
    expect(pendingPrefWrites()).toBe(1);
    signOutAsked(); // as logout() does, before sign-out starts
    startLoggingOut();
    endAccount('logout');
    expect(await cryptWritesSettled(3000)).toBe('unsaved');
    expect(unsavedAtSignOut()).toBe(1);
    expect(localStorage.getItem(BOARDS)).not.toContain('xxxxxxxx');
    expect(sealed(doc(BOARDS).a[UID][R1])).toBe(true);
    expect(doc(BOARDS).a[OTHER]).toEqual({ [R1]: { b: 'theirs' } });
  });

  it('an account that ends while its open still waits: its plaintext is counted and removed; another account\'s stays', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
    const orig = vault.account.bind(vault);
    const hung: Array<(e: Error) => void> = [];
    vault.account = () => new Promise<never>((_, fail) => { hung.push(fail); }); // the open does not finish
    try {
      reopen();
      guide(); // the page declares its keys (prefs.ts does at load)
      configureLifecycle({ navigate: () => {}, loginPath: '/auth/login', herePath: () => '/auth/home' });
      initLive();
      await new Promise((r) => setTimeout(r, 30));
      logout({ minWaitMs: 0, endMs: 0 }); // the account ends at once, inside logout(): the ask must come first
      expect(await cryptWritesSettled(3000)).toBe('unsaved');
      expect(unsavedAtSignOut()).toBe(1);
      expect(doc(GUIDE).a[UID]).toBeUndefined();
      expect(doc(GUIDE).a[OTHER]).toEqual({ g: 'theirs' });
    } finally { vault.account = orig; for (const f of hung) f(new Error('gone')); }
  });
});

describe('an end the person did not ask for seals what it can and removes only what is over VALUE_MAX', () => {
  beforeEach(fresh);
  const refuseKey = (key: string) => {
    const put = Storage.prototype.setItem;
    return vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === key) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
  };
  const sealed = (x: unknown) => !!x && typeof x === 'object' && 'ct' in (x as object);

  it('a token session ending (sign-out started, not asked): a small value is sealed for its account', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => { held.spy = refuseKey(GUIDE); });
      guide().get();
      await cryptIdleForTests();
    } finally { held.spy?.mockRestore(); }
    startLoggingOut(); // endTokenSession: no confirm, nobody asked
    endAccount('logout');
    expect(await cryptWritesSettled(3000)).toBe('stored');
    await cryptIdleForTests();
    expect(sealed(doc(GUIDE).a[UID])).toBe(true);
    expect(doc(GUIDE).a[OTHER]).toEqual({ g: 'theirs' });
    expect(unsavedAtSignOut()).toBe(0);
  });

  it('a token session ending whose seal is refused: the plaintext stays, uncounted, and migrates at the next open', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' } } }));
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => { held.spy = refuseKey(GUIDE); });
      guide().get();
      await cryptIdleForTests();
      startLoggingOut();
      endAccount('logout');
      expect(await cryptWritesSettled(3000)).toBe('stored');
      expect(unsavedAtSignOut()).toBe(0);
      expect(doc(GUIDE).a[UID]).toEqual({ g: 'legacy' }); // not removed: nobody was warned
    } finally { held.spy?.mockRestore(); }
    await reload();
    expect(guide().get()).toEqual({ g: 'legacy' });
    await cryptIdleForTests();
    expect(sealed(doc(GUIDE).a[UID])).toBe(true); // migrated at the next open
  });

  it('the account expiring (no sign-out): a part over VALUE_MAX is removed, uncounted; sealed parts and other accounts stay', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'small' }, [R2]: { b: 'x'.repeat(VALUE_MAX) } }, [OTHER]: { [R1]: { b: 'theirs' } } } }));
    await reload();
    expect(boards().get(R1)).toEqual({ b: 'small' });
    await cryptIdleForTests();
    expect(boards().status(R2)).toBe('oversized');
    endAccount('expired');
    expect(await cryptWritesSettled(3000)).toBe('stored');
    await cryptIdleForTests();
    expect(unsavedAtSignOut()).toBe(0);
    expect(localStorage.getItem(BOARDS)).not.toContain('xxxxxxxx');
    expect(sealed(doc(BOARDS).a[UID][R1])).toBe(true);
    expect(doc(BOARDS).a[OTHER]).toEqual({ [R1]: { b: 'theirs' } });
  });

  it('an account that ends while its open still waits, not asked: its small plaintext stays, uncounted', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
    const orig = vault.account.bind(vault);
    const hung: Array<(e: Error) => void> = [];
    vault.account = () => new Promise<never>((_, fail) => { hung.push(fail); });
    try {
      reopen();
      guide();
      await new Promise((r) => setTimeout(r, 30));
      startLoggingOut();
      endAccount('logout');
      expect(await cryptWritesSettled(3000)).toBe('stored');
      expect(unsavedAtSignOut()).toBe(0);
      expect(doc(GUIDE).a[UID]).toEqual({ g: 'legacy' });
      expect(doc(GUIDE).a[OTHER]).toEqual({ g: 'theirs' });
    } finally { vault.account = orig; for (const f of hung) f(new Error('gone')); }
  });
});

describe('after a failed recheck nothing opens until a check succeeds', () => {
  beforeEach(fresh);
  const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  /** Until the background decrypt of HOME has finished (WebCrypto runs off the event loop; a loaded host is slow), so
   *  the check below sees what it did, not that it has not run yet. */
  const decrypted = async () => { for (let i = 0; i < 5000 && home().status() === 'loading'; i++) await new Promise((r) => setImmediate(r)); };
  /** Sealed bytes of `value` for the shown account (another tab's write); storage is put back. */
  async function sealedBytes(key: string, value: unknown): Promise<string> {
    const before = localStorage.getItem(key);
    await writeSealedForTests(key, '', value);
    const out = localStorage.getItem(key) as string;
    if (before === null) localStorage.removeItem(key); else localStorage.setItem(key, before);
    return out;
  }
  /** The show-again recheck's vault read hangs until `answer()`: the opened values lock at its deadline. */
  async function lockByRecheck(): Promise<() => void> {
    const orig = vault.account.bind(vault);
    let open = false;
    vault.account = (u) => (open ? orig(u) : new Promise<never>(() => {}));
    document.dispatchEvent(new Event('visibilitychange'));
    await spin();
    await vi.advanceTimersByTimeAsync(2_100);
    await spin();
    return () => { open = true; };
  }

  it('a leaf another tab changed while locked is not opened by a read before a check succeeds', async () => {
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    const theirs = await sealedBytes(HOME, { h: 'theirs' });
    const orig = vault.account.bind(vault);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const answer = await lockByRecheck();
      expect(home().status()).toBe('locked');
      localStorage.setItem(HOME, theirs);
      window.dispatchEvent(new StorageEvent('storage', { key: HOME, storageArea: localStorage }));
      home().get();
      await spin();
      await decrypted();
      expect(home().get()).toBeNull();
      expect(home().status()).toBe('locked');
      answer();
      await vi.advanceTimersByTimeAsync(600); // the retry answers with the same epoch
      await spin();
    } finally { vi.useRealTimers(); vault.account = orig; }
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'theirs' });
  });

  it('a decrypt on its way when the values lock does not open its value before a check succeeds', async () => {
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    const theirs = await sealedBytes(HOME, { h: 'theirs' });
    const subtle = globalThis.crypto.subtle, decrypt = subtle.decrypt.bind(subtle);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const orig = vault.account.bind(vault);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const spy = vi.spyOn(subtle, 'decrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['decrypt']>) => { await gate; return decrypt(...args); });
    try {
      localStorage.setItem(HOME, theirs);
      window.dispatchEvent(new StorageEvent('storage', { key: HOME, storageArea: localStorage }));
      home().get(); // its decrypt waits at the gate
      await spin();
      const answer = await lockByRecheck();
      release();
      await spin();
      await decrypted();
      expect(home().get()).toBeNull();
      expect(home().status()).toBe('locked');
      answer();
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { release(); spy.mockRestore(); vi.useRealTimers(); vault.account = orig; }
    await cryptIdleForTests();
    expect(home().get()).toEqual({ h: 'theirs' });
  });
});

describe('kept plaintext at sign-out, refused stores and key rotation', () => {
  beforeEach(fresh);
  const refuseKey = (key: string | null) => {
    const put = Storage.prototype.setItem;
    return vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (key === null || k === key) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
  };
  const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  const until = async (ok: () => boolean) => { for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10)); };
  const decrypted = async () => { for (let i = 0; i < 5000 && home().status() === 'loading'; i++) await new Promise((r) => setImmediate(r)); };
  /** The show-again recheck's vault read hangs until `answer()`: the opened values lock at its deadline. */
  async function lockByRecheck(): Promise<() => void> {
    const orig = vault.account.bind(vault);
    let open = false;
    vault.account = (u) => (open ? orig(u) : new Promise<never>(() => {}));
    document.dispatchEvent(new Event('visibilitychange'));
    await spin();
    await vi.advanceTimersByTimeAsync(2_100);
    await spin();
    return () => { open = true; };
  }

  it('the real key list declared, no page ever ran, the open never finished: kept plaintext is counted before sign-out and removed after', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'mine' } } } }));
    const orig = vault.account.bind(vault);
    const hung: Array<(e: Error) => void> = [];
    vault.account = () => new Promise<never>((_, fail) => { hung.push(fail); });
    try {
      reopen();
      declareAccountPrefKeys(); // as prefs.ts at load; neither guide() nor boards() is ever called
      await new Promise((r) => setTimeout(r, 30));
      expect(pendingPrefWrites()).toBe(2); // the sign-out confirm names both
      configureLifecycle({ navigate: () => {}, loginPath: '/auth/login', herePath: () => '/auth/home' });
      initLive();
      logout({ minWaitMs: 0, endMs: 0 });
      expect(await cryptWritesSettled(3000)).toBe('unsaved');
      expect(unsavedAtSignOut()).toBe(2);
      expect(doc(GUIDE).a[UID]).toBeUndefined();
      expect(doc(GUIDE).a[OTHER]).toEqual({ g: 'theirs' });
      expect(localStorage.getItem(BOARDS)).toBeNull();
    } finally { vault.account = orig; for (const f of hung) f(new Error('gone')); }
  });

  it('a suspension, then a sign-out the person asked for: the plaintext is still counted and removed', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' } } }));
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => { held.spy = refuseKey(GUIDE); }); // its migration is refused; removing the key is not
      show(UID);
      guide().get();
      await cryptIdleForTests();
      configureLifecycle({ navigate: () => {}, loginPath: '/auth/login', herePath: () => '/auth/home' });
      initLive();
      suspend();
      await cryptIdleForTests();
      expect(doc(GUIDE).a[UID]).toEqual({ g: 'legacy' }); // a suspension removes nothing small
      logout({ minWaitMs: 0, endMs: 0 });
      expect(await cryptWritesSettled(3000)).toBe('unsaved');
      expect(unsavedAtSignOut()).toBe(1);
      expect(localStorage.getItem(GUIDE)).toBeNull();
    } finally { held.spy?.mockRestore(); }
  });

  it('every store refused while another account shares the document: the purge-failed panel, no leaving; Try again with storage back cleans up and leaves; the other entry never changes', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs', n: [1, 2] } } }));
    const theirs = JSON.stringify(doc(GUIDE).a[OTHER]);
    const left: string[] = [];
    const events: string[] = [];
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => { held.spy = refuseKey(null); }); // every setItem refused
      guide().get();
      await cryptIdleForTests();
      configureLifecycle({ navigate: (to) => { left.push(to); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
      initLive();
      const off = onLifecycle((e) => { events.push(e.kind); });
      try {
        expect(pendingPrefWrites()).toBe(1);
        logout({ minWaitMs: 0, endMs: 0 });
        await until(() => events.includes('purge-failed'));
        expect(events).toContain('purge-failed');
        expect(left).toEqual([]); // the page does not leave
        expect(await cryptWritesSettled(3000)).toBe('plaintext-left'); // never 'stored'
        expect(doc(GUIDE).a[UID]).toEqual({ g: 'legacy' });
        expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
        held.spy?.mockRestore();
        held.spy = undefined;
        logout(); // the panel's Try again
        await until(() => left.length > 0);
        expect(left).toEqual(['/auth/login']);
        expect(doc(GUIDE).a[UID]).toBeUndefined();
        expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
      } finally { off(); }
    } finally { held.spy?.mockRestore(); }
  });

  it('a failed recheck, then a retry that finds a rotation: the fence lifts once the keys load and the value opens', async () => {
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    const orig = vault.account.bind(vault);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const answer = await lockByRecheck();
      expect(home().status()).toBe('locked');
      // Another tab rotated meanwhile (the old key not deleted yet): its announcement was missed.
      const rec = await orig(UID);
      const id = newKeyId();
      await vault.putKey(UID, id, await newBaseKey());
      await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
      answer();
      await vi.advanceTimersByTimeAsync(600); // the retry answers: a new active key
      await spin();
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { vi.useRealTimers(); vault.account = orig; }
    await cryptIdleForTests();
    home().get();
    await cryptIdleForTests();
    await decrypted();
    expect(home().get()).toEqual({ h: 'mine' });
    expect(home().status()).toBe('ok');
  });

  it('a removal the browser refuses once is tried again inside the wait: removed, no panel, the page leaves; the other entry never changes', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
    const theirs = JSON.stringify(doc(GUIDE).a[OTHER]);
    const left: string[] = [];
    const events: string[] = [];
    const put = Storage.prototype.setItem;
    let refuse = Infinity; // GUIDE stores refused (the open's migration too) until counted down
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => {
        held.spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
          if (k === GUIDE && refuse > 0) { refuse--; throw new DOMException('quota', 'QuotaExceededError'); }
          put.call(localStorage, k, v);
        });
      });
      guide().get();
      await cryptIdleForTests();
      configureLifecycle({ navigate: (to) => { left.push(to); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
      initLive();
      const off = onLifecycle((e) => { events.push(e.kind); });
      try {
        refuse = 2; // the seal's write and the first removal are refused; the retry is not
        logout({ minWaitMs: 0, endMs: 0 });
        await until(() => left.length > 0);
        expect(left).toEqual(['/auth/login']);
        expect(events).not.toContain('purge-failed');
        expect(doc(GUIDE).a[UID]).toBeUndefined();
        expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
        expect(unsavedAtSignOut()).toBe(1); // counted: not sealed
      } finally { off(); }
    } finally { held.spy?.mockRestore(); }
  });

  it('under the fence an old plaintext value not read yet: get() null and status() locked agree', async () => {
    home().set({ h: 'mine' });
    guide(); // declared before the fence (its sweep has nothing to do)
    await cryptIdleForTests();
    const orig = vault.account.bind(vault);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const answer = await lockByRecheck();
      localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' } } }));
      expect(guide().get()).toBeNull();
      expect(guide().status()).toBe('locked');
      answer();
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { vi.useRealTimers(); vault.account = orig; }
    await cryptIdleForTests();
  });

  it('plaintext over VALUE_MAX is gone at the teardown itself, before the seal ends', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'small' }, [R2]: { b: 'x'.repeat(VALUE_MAX) } } } }));
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => { held.spy = refuseKey(BOARDS); }); // R1 stays plaintext: the seal has work to do
      boards().get(R1);
      await cryptIdleForTests();
    } finally { held.spy?.mockRestore(); }
    endAccount('expired');
    expect(localStorage.getItem(BOARDS)).not.toContain('xxxxxxxx'); // synchronously, in the teardown
    expect(await cryptWritesSettled(3000)).toBe('stored');
    await cryptIdleForTests();
  });

  for (const refused of [false, true]) {
    it(`a migration on its way when the values lock does not open its value before a check succeeds (store ${refused ? 'refused' : 'stored'})`, async () => {
      localStorage.setItem(HOME, JSON.stringify({ v: 1, a: { [UID]: { h: 'legacy' } } }));
      const subtle = globalThis.crypto.subtle, encrypt = subtle.encrypt.bind(subtle);
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const orig = vault.account.bind(vault);
      const held: { spy?: ReturnType<typeof refuseKey> } = {};
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const enc = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => { await gate; return encrypt(...args); });
      try {
        expect(home().get()).toEqual({ h: 'legacy' }); // read once: its migration starts and waits at the gate
        await spin();
        // Only the recheck's own vault read hangs (the migration's later reads answer): the values lock at its
        // deadline, and its retry waits on the (fake) clock.
        const once = vault.account.bind(vault);
        let hang = true;
        vault.account = (u) => { if (hang) { hang = false; return new Promise<never>(() => {}); } return once(u); };
        document.dispatchEvent(new Event('visibilitychange'));
        await spin();
        await vi.advanceTimersByTimeAsync(2_100);
        await spin();
        expect(home().get()).toBeNull();
        if (refused) held.spy = refuseKey(HOME);
        release();
        await spin();
        for (let i = 0; i < 2000 && migratingForTests(HOME); i++) await spin();
        expect(migratingForTests(HOME)).toBe(false); // it published
        expect(home().get()).toBeNull();
        held.spy?.mockRestore();
        held.spy = undefined;
        await vi.advanceTimersByTimeAsync(600); // the retry answers
        await spin();
      } finally { release(); enc.mockRestore(); held.spy?.mockRestore(); vi.useRealTimers(); vault.account = orig; }
      await cryptIdleForTests();
    });
  }
});


describe('writes on their way at sign-out, rotations and refused removals', () => {
  beforeEach(fresh);
  const refuseKey = (key: string | null) => {
    const put = Storage.prototype.setItem;
    return vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (key === null || k === key) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
  };
  const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  const until = async (ok: () => boolean) => { for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10)); };
  /** Real time passes (setImmediate is never faked here) until ok() or ms. */
  const realUntil = async (ok: () => boolean, ms: number) => { const t = Date.now(); while (!ok() && Date.now() - t < ms) await new Promise((r) => setImmediate(r)); };
  const decrypted = async (st: () => string) => { for (let i = 0; i < 5000 && st() === 'loading'; i++) await new Promise((r) => setImmediate(r)); };
  const announce = () => { const ch = new BroadcastChannel('hoody-hub-crypt'); ch.postMessage({ type: 'rotate', uid: UID }); ch.close(); };
  /** The show-again recheck's vault read hangs until `answer()`: the opened values lock at its deadline. */
  async function lockByRecheck(): Promise<() => void> {
    const orig = vault.account.bind(vault);
    let open = false;
    vault.account = (u) => (open ? orig(u) : new Promise<never>(() => {}));
    document.dispatchEvent(new Event('visibilitychange'));
    await spin();
    await vi.advanceTimersByTimeAsync(2_100);
    await spin();
    return () => { open = true; };
  }
  /** encrypt waits at a gate until the returned release(). */
  function gateEncrypt(): { release: () => void; restore: () => void; entered: () => number } {
    const subtle = globalThis.crypto.subtle, encrypt = subtle.encrypt.bind(subtle);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    const enc = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => { n++; await gate; return encrypt(...args); });
    return { release, restore: () => enc.mockRestore(), entered: () => n };
  }

  // The 2500 ms case (past the seal's deadline) is covered above: the held write is retired at the first check.
  for (const [legacy, ms] of [[true, 100], [false, 100]] as const) {
    it(`a write still on its way when sign-out's wait (${ms} ms${ms > 2000 ? ', past the seal\'s deadline' : ', the seal still running'}) ends, ${legacy ? 'over old plaintext: the purge-failed panel, no leaving; Try again once it ended leaves, nothing of the account left' : 'no old plaintext: the page still leaves at the bound'}; the other entry never changes`, async () => {
      if (legacy) {
        localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
        // A second kept leaf no write is on: sign-out's seal has work (and waits at the gate too).
        localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'mine' } } } }));
      } else localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [OTHER]: { g: 'theirs' } } }));
      const theirs = JSON.stringify(doc(GUIDE).a[OTHER]);
      const left: string[] = [];
      const events: string[] = [];
      const held: { spy?: ReturnType<typeof refuseKey> } = {};
      try {
        await reloadWith(() => { held.spy = refuseKey(null); }); // the open's migrations are refused: the plaintext stays
        guide().get();
        boards().get(R1);
        await cryptIdleForTests();
      } finally { held.spy?.mockRestore(); }
      const g = gateEncrypt();
      try {
        guide().set({ g: 'new' }); // accepted; its seal waits at the gate past sign-out's wait
        await spin();
        configureLifecycle({ navigate: (to) => { left.push(to); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
        initLive();
        const off = onLifecycle((e) => { events.push(e.kind); });
        try {
          logout({ minWaitMs: 0, endMs: 0, writesMs: ms });
          if (legacy) {
            await realUntil(() => events.includes('purge-failed') || left.length > 0, ms + 3000);
            expect(left).toEqual([]); // old plaintext at rest: the page does not leave
            expect(events).toContain('purge-failed');
            expect(doc(GUIDE).a[UID]).toEqual({ g: 'legacy' });
            expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
            g.release();
            await cryptWritesSettled(5000);
            await cryptIdleForTests();
            logout(); // the panel's Try again
            await until(() => left.length > 0);
            expect(left).toEqual(['/auth/login']);
            expect(doc(GUIDE).a[UID] === undefined || !JSON.stringify(doc(GUIDE).a[UID]).includes('legacy')).toBe(true);
            expect(JSON.stringify(doc(GUIDE).a[UID] ?? null)).not.toContain('"g":"new"'); // never as plaintext
            expect(localStorage.getItem(BOARDS) ?? '').not.toContain('mine');
          } else {
            await until(() => left.length > 0);
            expect(left).toEqual(['/auth/login']); // nothing at rest: the bounded exit stays
            expect(events).not.toContain('purge-failed');
            expect(unsavedAtSignOut()).toBe(0); // not retired: nothing of it is counted lost
          }
          expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
        } finally { off(); }
      } finally { g.release(); g.restore(); await cryptIdleForTests(); }
    });
  }

  for (const silent of [false, true]) {
    it(`a rotation announced while the verified key read is on its way: ${silent ? 'the vault silent after it, the fence stays up (an announcement alone lifts nothing)' : 'a fresh check answers and the value opens'}`, async () => {
      home().set({ h: 'mine' });
      await cryptIdleForTests();
      const orig = vault.account.bind(vault);
      const keys = vault.keys.bind(vault);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const answer = await lockByRecheck();
        expect(home().status()).toBe('locked');
        // Another tab rotated meanwhile (the old key not deleted yet): its announcement was missed.
        const rec = await orig(UID);
        const id = newKeyId();
        await vault.putKey(UID, id, await newBaseKey());
        await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
        // The verified refresh's key read waits until released; later reads answer.
        let first = true, releaseKeys!: () => void;
        vault.keys = (u) => {
          if (!first) return keys(u);
          first = false;
          return new Promise((r) => { releaseKeys = () => r(keys(u)); });
        };
        answer();
        await vi.advanceTimersByTimeAsync(600); // the retry answers: a new active key, its key read waits
        await spin();
        if (silent) vault.account = () => new Promise<never>(() => {});
        announce(); // the same rotation, heard late: supersedes the verified refresh
        await spin();
        await spin();
        releaseKeys();
        await spin();
        await vi.advanceTimersByTimeAsync(300);
        await spin();
        if (silent) {
          await vi.advanceTimersByTimeAsync(2_100);
          await spin();
          await realUntil(() => home().status() !== 'locked', 1000); // a fence wrongly lifted opens it by now
          expect(home().get()).toBeNull();
          expect(home().status()).toBe('locked');
          return;
        }
      } finally { vi.useRealTimers(); vault.account = orig; vault.keys = keys; }
      await cryptIdleForTests();
      home().get();
      await cryptIdleForTests();
      await decrypted(() => home().status());
      expect(home().get()).toEqual({ h: 'mine' }); // no visibility event, no reload
      expect(home().status()).toBe('ok');
    });
  }

  it('a retry that finds a rotation lifts the fence through its own verified key read: no further vault check', async () => {
    home().set({ h: 'mine' });
    await cryptIdleForTests();
    const orig = vault.account.bind(vault);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let calls = 0;
    try {
      const answer = await lockByRecheck();
      const rec = await orig(UID);
      const id = newKeyId();
      await vault.putKey(UID, id, await newBaseKey());
      await vault.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
      const hung = vault.account;
      vault.account = (u) => { calls++; return hung(u); };
      answer();
      await vi.advanceTimersByTimeAsync(600); // the retry answers: a new active key
      await spin();
      await vi.advanceTimersByTimeAsync(600);
      await spin();
    } finally { vi.useRealTimers(); vault.account = orig; }
    await cryptIdleForTests();
    home().get();
    await cryptIdleForTests();
    await decrypted(() => home().status());
    expect(home().get()).toEqual({ h: 'mine' });
    expect(calls).toBe(1); // the retry only
  });

  it('a write that migrates an untouched sibling while the values lock does not open the sibling before a check succeeds', async () => {
    boards(); // declared before (its sweep has nothing to do)
    await cryptIdleForTests();
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'one' }, [R2]: { b: 'two' } } } }));
    const orig = vault.account.bind(vault);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const g = gateEncrypt();
    try {
      expect(boards().set({ b: 'new' }, R1)).toBe(true); // R2 is never read: the write migrates it
      await realUntil(() => g.entered() > 0, 3000); // past its vault reads, sealing
      expect(g.entered()).toBeGreaterThan(0);
      // Only the recheck's own vault read hangs (the write's later reads answer): the values lock at its deadline,
      // and its retry waits on the (fake) clock.
      const once = vault.account.bind(vault);
      let hang = true;
      vault.account = (u) => { if (hang) { hang = false; return new Promise<never>(() => {}); } return once(u); };
      document.dispatchEvent(new Event('visibilitychange'));
      await spin();
      await vi.advanceTimersByTimeAsync(2_100);
      await spin();
      g.release();
      await spin();
      expect(await cryptWritesSettled(60_000)).toBe('stored');
      await spin();
      expect(JSON.stringify(doc(BOARDS).a[UID])).not.toContain('two'); // R2 was migrated (sealed)
      expect(boards().get(R2)).toBeNull();
      expect(boards().status(R2)).toBe('locked');
      await vi.advanceTimersByTimeAsync(600); // the retry answers: the same epoch
      await spin();
    } finally { g.restore(); vi.useRealTimers(); vault.account = orig; }
    await cryptIdleForTests();
    await decrypted(() => boards().status(R2));
    expect(boards().get(R2)).toEqual({ b: 'two' });
    expect(boards().status(R2)).toBe('ok');
  });

  it('a removal refused once is tried again by the store itself, inside the wait: no plaintext left once the writes settle (no logout check involved)', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
    const theirs = JSON.stringify(doc(GUIDE).a[OTHER]);
    const put = Storage.prototype.setItem;
    let refuse = Infinity;
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => {
        held.spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
          if (k === GUIDE && refuse > 0) { refuse--; throw new DOMException('quota', 'QuotaExceededError'); }
          put.call(localStorage, k, v);
        });
      });
      guide().get();
      await cryptIdleForTests();
      refuse = 2; // the seal's write and the first removal are refused; the retry is not
      signOutAsked();
      startLoggingOut();
      endAccount('logout');
      expect(await cryptWritesSettled(3000)).toBe('unsaved'); // counted, and nothing left
      expect(doc(GUIDE).a[UID]).toBeUndefined();
      expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
    } finally { held.spy?.mockRestore(); }
  });

  it('the seal ending removes the plaintext at once: nothing left before any retry runs (no retry, no logout check involved)', async () => {
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' } } }));
    const put = Storage.prototype.setItem;
    let refuse = Infinity;
    const held: { spy?: ReturnType<typeof refuseKey> } = {};
    try {
      await reloadWith(() => {
        held.spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
          if (k === GUIDE && refuse > 0) { refuse--; throw new DOMException('quota', 'QuotaExceededError'); }
          put.call(localStorage, k, v);
        });
      });
      guide().get();
      await cryptIdleForTests();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // a retry's timer never fires here
      try {
        refuse = 1; // the seal's write is refused; the removal is not
        signOutAsked();
        startLoggingOut();
        endAccount('logout');
        let out: string | null = null;
        void cryptWritesSettled(60_000).then((r) => { out = r; });
        await realUntil(() => out !== null, 3000);
        expect(out).toBe('unsaved');
        expect(localStorage.getItem(GUIDE)).toBeNull();
      } finally { vi.useRealTimers(); }
    } finally { held.spy?.mockRestore(); }
  });
});


describe('writes that never settle and malformed split entries', () => {
  beforeEach(fresh);
  const refuseKey = (key: string | null) => {
    const put = Storage.prototype.setItem;
    return vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (key === null || k === key) throw new DOMException('quota', 'QuotaExceededError');
      put.call(localStorage, k, v);
    });
  };
  const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  const until = async (ok: () => boolean) => { for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10)); };
  const lifecycle = () => {
    const left: string[] = [];
    const events: string[] = [];
    configureLifecycle({ navigate: (to) => { left.push(to); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    const off = onLifecycle((e) => { events.push(e.kind); });
    return { left, events, off };
  };

  for (const hang of ['encrypt', 'vault'] as const) {
    it(`a write that never settles (${hang === 'encrypt' ? 'its encrypt' : 'its vault read: the lock stays held'}), over old plaintext: the panel while the seal runs, then Try again past the seal's deadline retires it, removes the plaintext and leaves; the late write stores nothing; the other entry never changes`, async () => {
      localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'legacy' }, [OTHER]: { g: 'theirs' } } }));
      localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'mine' } } } })); // the seal has work
      const theirs = JSON.stringify(doc(GUIDE).a[OTHER]);
      const held: { spy?: ReturnType<typeof refuseKey> } = {};
      try {
        await reloadWith(() => { held.spy = refuseKey(null); }); // the open's migrations are refused: the plaintext stays
        guide().get();
        boards().get(R1);
        await cryptIdleForTests();
      } finally { held.spy?.mockRestore(); }
      const subtle = globalThis.crypto.subtle, encrypt = subtle.encrypt.bind(subtle);
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const enc = hang === 'encrypt' ? vi.spyOn(subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => { await gate; return encrypt(...args); }) : null;
      const orig = vault.account.bind(vault);
      if (hang === 'vault') vault.account = (u) => gate.then(() => orig(u));
      const { left, events, off } = lifecycle();
      try {
        expect(guide().set({ g: 'new' })).toBe(true); // accepted; it never settles (until released at the end)
        await spin();
        // The seal's deadline is a timer: the clock moves past it at once below instead of a 2.3 s sleep. Every other timer
        // keeps the real pace (shouldAdvanceTime), and setImmediate (spin) stays real.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], shouldAdvanceTime: true });
        logout({ minWaitMs: 0, endMs: 0, writesMs: 100 });
        await until(() => events.includes('purge-failed') || left.length > 0);
        expect(left).toEqual([]); // the seal still runs: the panel
        logout(); // Try again before the seal's deadline: the panel again
        await spin();
        expect(left).toEqual([]);
        expect(events.filter((e) => e === 'purge-failed').length).toBe(2);
        await vi.advanceTimersByTimeAsync(2_300); // past the seal's deadline (2 s); the write still hangs
        logout(); // Try again
        await until(() => left.length > 0);
        expect(left).toEqual(['/auth/login']);
        expect(doc(GUIDE).a[UID]).toBeUndefined();
        expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
        expect(localStorage.getItem(BOARDS) ?? '').not.toContain('mine');
        expect(unsavedAtSignOut()).toBe(2); // the Board part (not sealed) and the retired Guide write: both counted
        release(); // the write settles late: it stores nothing
        await cryptWritesSettled(5_000);
        await spin();
        expect(doc(GUIDE).a[UID]).toBeUndefined();
        expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
        expect(unsavedAtSignOut()).toBe(2); // counted once
      } finally { vi.useRealTimers(); off(); release(); enc?.mockRestore(); vault.account = orig; }
    });
  }

  const MALFORMED: Array<[string, unknown]> = [['a string', 'str'], ['a number', 42], ['an array', [1, 2]], ['null', null]];
  for (const [name, x] of MALFORMED) {
    for (const shared of [true, false]) {
      it(`a malformed account entry under a split key (${name}${shared ? ', another account in the document' : ', the only account'}): not counted; an asked sign-out removes it for that account only and leaves`, async () => {
        const other = { [R1]: { b: 'theirs' } };
        localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: shared ? { [UID]: x, [OTHER]: other } : { [UID]: x } }));
        boards(); // declared
        await cryptIdleForTests();
        expect(pendingPrefWrites()).toBe(0); // unreadable garbage no page shows: not named by the confirm
        const { left, events, off } = lifecycle();
        try {
          logout({ minWaitMs: 0, endMs: 0 });
          await until(() => left.length > 0 || events.includes('purge-failed'));
          expect(events).not.toContain('purge-failed');
          expect(left).toEqual(['/auth/login']);
          if (shared) {
            expect(Object.keys(doc(BOARDS).a)).toEqual([OTHER]);
            expect(JSON.stringify(doc(BOARDS).a[OTHER])).toBe(JSON.stringify(other));
          } else expect(localStorage.getItem(BOARDS)).toBeNull();
        } finally { off(); }
      });
    }
  }

  it('a malformed split entry at an end nobody asked for stays as stored', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: [1, 2], [OTHER]: { [R1]: { b: 'theirs' } } } }));
    const before = localStorage.getItem(BOARDS);
    boards();
    await cryptIdleForTests();
    endAccount('expired');
    expect(await cryptWritesSettled(3000)).toBe('stored');
    await cryptIdleForTests();
    expect(localStorage.getItem(BOARDS)).toBe(before);
  });

  it('a malformed split entry whose removal is refused: the panel; Try again with storage back removes it and leaves', async () => {
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: 'str', [OTHER]: { [R1]: { b: 'theirs' } } } }));
    boards();
    await cryptIdleForTests();
    const spy = refuseKey(BOARDS);
    const { left, events, off } = lifecycle();
    try {
      logout({ minWaitMs: 0, endMs: 0 });
      await until(() => events.includes('purge-failed') || left.length > 0);
      expect(left).toEqual([]);
      expect(doc(BOARDS).a[UID]).toBe('str');
      spy.mockRestore();
      logout(); // Try again
      await until(() => left.length > 0);
      expect(left).toEqual(['/auth/login']);
      expect(Object.keys(doc(BOARDS).a)).toEqual([OTHER]);
    } finally { off(); spy.mockRestore(); }
  });

  it('a sealed account-level entry under a split key is not malformed: an asked sign-out leaves it', async () => {
    guide().set({ g: 'sealed' });
    expect(await cryptWritesSettled(3000)).toBe('stored');
    const env = doc(GUIDE).a[UID]; // an envelope (an object)
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: env } }));
    boards();
    await cryptIdleForTests();
    const { left, events, off } = lifecycle();
    try {
      logout({ minWaitMs: 0, endMs: 0 });
      await until(() => left.length > 0 || events.includes('purge-failed'));
      expect(left).toEqual(['/auth/login']);
      expect(JSON.stringify(doc(BOARDS).a[UID])).toBe(JSON.stringify(env));
    } finally { off(); }
  });

  for (const [name, x] of MALFORMED) {
    it(`Forget on this browser with a malformed split entry (${name}): forgotten, the entry gone, the other account's stays`, async () => {
      const other = { [R1]: { b: 'theirs' } };
      localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: x, [OTHER]: other } }));
      boards();
      await cryptIdleForTests();
      expect(await forgetThisBrowser()).toBe(true);
      expect(Object.keys(doc(BOARDS).a)).toEqual([OTHER]);
      expect(JSON.stringify(doc(BOARDS).a[OTHER])).toBe(JSON.stringify(other));
    });
  }
});


describe('another tab writing plaintext under a held write', () => {
  beforeEach(fresh);
  const until = async (ok: () => boolean, n = 300) => { for (let i = 0; i < n && !ok(); i++) await new Promise((r) => setTimeout(r, 10)); };

  it('another tab writes plaintext under a held write after the retirement read: the strict check keeps the panel; Try again retires it, removes it and leaves', async () => {
    // The Guide slot of UID holds no plaintext (a write of it never settles: not retired); a Board leaf is old
    // plaintext whose removal the browser refuses until sign-out's final check.
    localStorage.setItem(GUIDE, JSON.stringify({ v: 1, a: { [OTHER]: { g: 'theirs' } } }));
    localStorage.setItem(BOARDS, JSON.stringify({ v: 1, a: { [UID]: { [R1]: { b: 'mine' } } } }));
    const theirs = JSON.stringify(doc(GUIDE).a[OTHER]);
    const put = Storage.prototype.setItem, del = Storage.prototype.removeItem;
    const held: { spy?: { mockRestore: () => void } } = {};
    try {
      // the open's migrations are refused: the Board leaf stays plaintext
      await reloadWith(() => { held.spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); }); });
      boards().get(R1);
      await cryptIdleForTests();
    } finally { held.spy?.mockRestore(); }
    const subtle = globalThis.crypto.subtle, encrypt = subtle.encrypt.bind(subtle);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const enc = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['encrypt']>) => { await gate; return encrypt(...args); });
    // The Board removal: refused for the seal's end and its 3 retries; the 5th (the final check's) goes through, and
    // at that moment another tab (an old build) writes UID's Guide as plaintext.
    let removals = 0;
    const rm = vi.spyOn(localStorage, 'removeItem').mockImplementation(function (this: Storage, k: string) {
      if (k === BOARDS && ++removals <= 4) throw new DOMException('refused', 'SecurityError');
      del.call(localStorage, k);
      if (k === BOARDS && removals === 5) put.call(localStorage, GUIDE, JSON.stringify({ v: 1, a: { [UID]: { g: 'old tab' }, [OTHER]: JSON.parse(theirs) } }));
    });
    const left: string[] = [];
    const events: string[] = [];
    configureLifecycle({ navigate: (to) => { left.push(to); }, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    const off = onLifecycle((e) => { events.push(e.kind); });
    try {
      expect(guide().set({ g: 'new' })).toBe(true); // accepted; it never settles (until released at the end)
      logout({ minWaitMs: 0, endMs: 0, writesMs: 4_000 }); // past the seal's deadline and its retries
      await until(() => events.includes('purge-failed') || left.length > 0, 600);
      expect(removals).toBe(5);
      expect(left).toEqual([]); // plaintext under the held slot: the page does not leave
      expect(events).toContain('purge-failed');
      expect(doc(GUIDE).a[UID]).toEqual({ g: 'old tab' });
      expect(localStorage.getItem(BOARDS)).toBeNull();
      logout(); // Try again: the slot now holds plaintext, so the write is retired and the plaintext removed
      await until(() => left.length > 0);
      expect(left).toEqual(['/auth/login']);
      expect(doc(GUIDE).a[UID]).toBeUndefined();
      expect(JSON.stringify(doc(GUIDE).a[OTHER])).toBe(theirs);
    } finally { off(); release(); enc.mockRestore(); rm.mockRestore(); await cryptWritesSettled(5_000); }
  });
});

describe('overValueMax says exactly what set() refuses for size', () => {
  // overValueMax is how a reader tells a value that storage can never hold (Board's count: this page's own copy) from
  // one it can: it must agree with set()'s 'oversized' refusal for every value, sizes measured the same way.
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const cases: [string, unknown][] = [
    ['empty object', {}],
    ['JSON of exactly VALUE_MAX bytes', 'x'.repeat(VALUE_MAX - 2)],
    ['JSON one byte over VALUE_MAX', 'x'.repeat(VALUE_MAX - 1)],
    // Bytes of UTF-8, not UTF-16 units: 16000 three-byte characters are 48002 bytes in 16002 units.
    ['three-byte characters just under, in bytes', '€'.repeat((VALUE_MAX - 2 - ((VALUE_MAX - 2) % 3)) / 3)],
    ['three-byte characters just over, in bytes (far under in characters)', '€'.repeat((VALUE_MAX - 2 - ((VALUE_MAX - 2) % 3)) / 3 + 1)],
    // JSON escapes count as written: each newline is two bytes once stringified.
    ['escaped newlines at the limit', '\n'.repeat((VALUE_MAX - 2) / 2)],
    ['escaped newlines one over', '\n'.repeat((VALUE_MAX - 2) / 2 + 1)],
    ['an object whose JSON is over', { boards: [{ name: 'a'.repeat(VALUE_MAX) }] }],
    ['toJSON makes it over', { toJSON: () => 'y'.repeat(VALUE_MAX) }],
    ['toJSON makes it small', { big: 'z'.repeat(VALUE_MAX * 2), toJSON: () => 1 }],
    // Not JSON: refused, but never for size (status is not 'oversized').
    ['undefined', undefined],
    ['a function', () => 'w'.repeat(VALUE_MAX * 2)],
    ['a symbol', Symbol('s')],
    ['a BigInt', 10n],
    ['an array holding a BigInt beside a large string', ['v'.repeat(VALUE_MAX * 2), 1n]],
    ['a cycle', cycle],
  ];
  it('for every value: overValueMax(v) is true exactly when set(v) is refused with status oversized', async () => {
    const seen = { over: 0, under: 0 };
    for (const [name, v] of cases) {
      expect(home().set({ reset: name }), name).toBe(true); // an accepted write clears an earlier mark
      await cryptIdleForTests();
      expect(home().status(), name).toBe('ok');
      const accepted = home().set(v);
      const forSize = !accepted && home().status() === 'oversized';
      expect(overValueMax(v), name).toBe(forSize);
      seen[forSize ? 'over' : 'under']++;
      await cryptIdleForTests();
    }
    expect(seen.over).toBe(5);
    expect(seen.under).toBe(cases.length - 5);
  });
});

describe('the oversized mark goes with the account, as prefs drops its page copy', () => {
  // A write refused for size leaves a mark (status 'oversized') and prefs keeps the value as this page's copy. prefs
  // drops that copy when another account shows, at an account's end and at Forget; a mark left behind would make
  // the stored value read 'oversized' (not usable, Board count unknown) until some write cleared it.
  it('a switch to another account and back: the stored value reads ok, not oversized', async () => {
    expect(home().set({ small: 1 })).toBe(true);
    await cryptIdleForTests();
    expect(home().set('x'.repeat(VALUE_MAX + 1))).toBe(false);
    expect(home().status()).toBe('oversized');
    show(OTHER);
    await cryptReady();
    await cryptIdleForTests();
    show(UID);
    expect(home().status()).toBe('loading'); // opening again: never 'oversized' ahead of it
    await cryptReady();
    await cryptIdleForTests();
    expect(home().status()).toBe('ok');
    expect(home().get()).toEqual({ small: 1 });
  });
  it('Forget on this browser: the account opens again with no mark (its sealed value reads locked, as after any Forget)', async () => {
    expect(home().set({ small: 1 })).toBe(true);
    await cryptIdleForTests();
    expect(home().set('x'.repeat(VALUE_MAX + 1))).toBe(false);
    expect(home().status()).toBe('oversized');
    expect(await forgetThisBrowser()).toBe(true);
    await cryptReady();
    await cryptIdleForTests();
    expect(home().status()).toBe('locked'); // what Forget leaves (its sealed value no longer opens), not 'oversized'
    expect(home().get()).toBeNull();
  });
  it('the same account closed and opened again after failed rechecks keeps the mark: prefs keeps its copy then', async () => {
    expect(home().set({ small: 1 })).toBe(true);
    await cryptIdleForTests();
    expect(home().set('x'.repeat(VALUE_MAX + 1))).toBe(false);
    vault.fail.add('account');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(20_000); // every retry fails: close() and the same account opens again
    } finally { vi.useRealTimers(); }
    vault.fail.clear();
    await cryptReady();
    await cryptIdleForTests();
    expect(home().status()).toBe('oversized');
  });
  it('the same account closed and opened again after a rotation whose keys never load keeps the mark', async () => {
    expect(home().set({ small: 1 })).toBe(true);
    await cryptIdleForTests();
    expect(home().set('x'.repeat(VALUE_MAX + 1))).toBe(false);
    vault.fail.add('keys');
    const spin = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const ch = new BroadcastChannel('hoody-hub-crypt');
      ch.postMessage({ type: 'rotate', uid: UID });
      ch.close();
      await spin();
      // Every key read fails past the retries: close() and the same account opens again.
      for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(5_000); await spin(); }
    } finally { vi.useRealTimers(); }
    vault.fail.clear();
    await cryptReady();
    await cryptIdleForTests();
    expect(home().status()).toBe('oversized');
  });
  it('another tab forgetting a different account leaves this account\'s mark: prefs keeps this account\'s copy', async () => {
    expect(home().set('x'.repeat(VALUE_MAX + 1))).toBe(false);
    expect(home().status()).toBe('oversized');
    const ch = new BroadcastChannel('hoody-hub-crypt');
    ch.postMessage({ type: 'forget', uid: OTHER });
    ch.close();
    await new Promise((r) => setTimeout(r, 30)); // the announcement arrives
    await cryptIdleForTests();
    expect(home().status()).toBe('oversized');
  });
  it('a suspension (a teardown that does not end the account): prefs drops its page copies, so the mark goes too', async () => {
    expect(home().set({ small: 1 })).toBe(true);
    await cryptIdleForTests();
    expect(home().set('x'.repeat(VALUE_MAX + 1))).toBe(false);
    expect(home().status()).toBe('oversized');
    configureLifecycle({ navigate: () => {}, loginPath: '/auth/login', herePath: () => '/auth/home' });
    initLive();
    suspend();
    await cryptReady();
    await cryptIdleForTests();
    expect(home().status()).not.toBe('oversized');
  });
});
