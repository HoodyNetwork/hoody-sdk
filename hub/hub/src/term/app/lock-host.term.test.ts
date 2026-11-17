// The terminal passcode host over core/applock.ts, on real
// store files (hub-store.ts) and the real engine; nothing is sent.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A record on disk locks the mount at start (before any page), moves the policy generation and wipes; no record: open | 'locked at start' |
// | 2 | While locked row 1 refuses every new call (TERM_LOCKED: no read starts); an Admission minted before the lock is refused at the transport, also after unlock | 'admission before a lock' |
// | 3 | A wrong try is counted ON DISK (a reopened store reads it); the right passcode unlocks and moves the generation again | 'wrong try kept on disk' |
// | 4 | The try limit forgets this account's data, pending records included, the record too; group (d) is kept; the mount leaves | 'try limit forgets' |
// | 5 | A second, read-only mount (or one read-only by choice) starts locked, refuses every unlock try without verifying and forgets nothing; the record is untouched | 'read-only mount' |
// | 6 | Idle (the record's minutes, input only) locks and never ends the mount; input restarts the clock; resume locks | 'idle and resume' |
// | 7 | A token session is inert: a record does not lock, nothing locks, not capable; with no store too | 'token session inert' |
// | 8 | The record goes to disk or throws: no memory fallback; own key only; only valid records | 'storage rules' |
// | 9 | No store directory: unlocked, nothing to protect; a store that exists but cannot be used: locked, the notice names path and reason | 'no store' |
// | 10 | A store failing mid-mount unlocks nothing: a lock stays, tries are refused, idle still locks, the notice names it | 'store fails mid-mount' |
// | 10b | A try-limit forget that cannot finish (corrupt journal, failed write) keeps the lock view up and `notice()` says 'forget-failed' | 'a corrupt change journal…', 'a forget that cannot finish…' |
// | 11 | The forget keeps every held boot-token mint record (the recovery can still revoke its token by name) and drops other holds | 'forget keeps boot-mint records' |
import { afterEach, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deriveVerifier, ITER_DEFAULT, LOCK_PREFIX, lockView, resetAppLock, type LockRecord } from '../../core/applock';
import { tokenMintRoute } from '../../core/boot-token';
import { CHANGE_STORE_KEY, setChangeStoreAdapter, type StoredChange } from '../../core/change-store';
import { createMemoryLocks } from '../../core/host-locks-memory';
import { vaultKeyPutRoute } from '../../core/realm';
import { defineRoute } from '../../core/routes';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type TryLock } from '../../../scripts/term/build/hub-store';
import { forgetAccountData, IDLE_TICK_MS, installTermLock, KEPT_ON_FORGET, lockStorage, type TermLockDeps, type TermLockHost } from './lock-host';
import { persistentStore } from '../env/persist';
import { beginTermSession } from '../env/session';
import { fixtureBoot } from './boot';
import { bootAliasOf, holdDirectChange, resetDirectMemory } from './live-direct';
import { LivePolicy, type PolicyCall } from './live-policy';
import { changeStoreOver } from './live-records';
import { MembershipTable } from './live-membership';

setDefaultTimeout(60_000);

const UID = '64f0ada00000000000000001';
const KEY = LOCK_PREFIX + UID;
const API = 'https://api.example.invalid';
const RIGHT = '482913', WRONG = '000000';

let flock: TryLock = () => true;
let home = '';
let dir = '';
const stores: HubStore[] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  resetAppLock();
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-lock-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, API, UID)!;
});
afterEach(() => {
  resetAppLock();
  setChangeStoreAdapter(null);
  resetDirectMemory();
  for (const s of stores.splice(0)) { try { s.close(); } catch { /* closed */ } }
  fs.rmSync(home, { recursive: true, force: true });
});
const open = (): HubStore => { const s = openHubStore(dir, { home, tryLock: flock }); stores.push(s); return s; };
const reopen = (s: HubStore): HubStore => { s.close(); stores.splice(stores.indexOf(s), 1); return open(); };

let verifier: { salt: string; hash: string } | null = null;
async function record(tries: Partial<LockRecord['tries']> = {}, o: { idleMin?: LockRecord['idleMin'] } = {}): Promise<string> {
  if (!verifier) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveVerifier(RIGHT, salt, ITER_DEFAULT);
    const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
    verifier = { salt: b64(salt), hash: b64(hash) };
  }
  const rec: LockRecord = { v: 1, kdf: 'pbkdf2-sha256', iter: ITER_DEFAULT, salt: verifier.salt, hash: verifier.hash, rev: 'AAAAAAAAAAA=', digits: true, idleMin: o.idleMin ?? 15, onLeave: false, tries: { n: 0, until: 0, pending: null, out: false, ...tries } };
  return JSON.stringify(rec);
}
const triesOf = (s: HubStore): LockRecord['tries'] | null => { const v = s.get(KEY); return v === null ? null : (JSON.parse(v) as LockRecord).tries; };

interface Rig { host: TermLockHost; bumps: number; wipes: number; left: string[]; tick: () => void; clock: { now: number; mono: number } }
function rig(area: HubStore | null, o: Partial<TermLockDeps> = {}): Rig {
  const r = { bumps: 0, wipes: 0, left: [] as string[], tick: () => {}, clock: { now: 1_000_000, mono: 0 } } as Rig;
  r.host = installTermLock({
    area,
    uid: () => UID,
    sessionOk: () => true,
    locks: createMemoryLocks().locks,
    bump: () => { r.bumps++; },
    wipe: () => { r.wipes++; },
    leave: (why) => { r.left.push(why); },
    every: (fn, ms) => { expect(ms).toBe(IDLE_TICK_MS); r.tick = fn; return () => { r.tick = () => {}; }; },
    now: () => r.clock.now,
    mono: () => r.clock.mono,
    ...o,
  });
  return r;
}

/** A policy whose row 1 is the lock host's state and whose generation the host moves (the boot's wiring, by hand). */
const wallet = defineRoute({ method: 'GET', path: '/wallet', scope: 'base' });
function policyOver(get: () => TermLockHost): LivePolicy {
  return new LivePolicy({
    places: { apiOrigin: API, realmApiDomain: 'realms.example.invalid', proxyDomain: null },
    state: () => get().state(),
    session: () => ({ sid: 's-1', generation: 1 }),
    account: () => UID,
    hoodyRoute: () => ({ base: '/api/v1' }),
    realm: () => 'all',
    tokenSession: () => false,
    introspection: {},
    bootstrap: {},
    unshownSecrets: new Set(),
    members: new MembershipTable(UID),
    selection: () => ({ realm: null, pin: null }) as never,
    routingAllows: () => true,
    computerOrigin: () => '',
    storeMode: () => 'rw',
    recordKept: () => false,
    secretReveal: () => false,
    onBypass: () => {},
  });
}
const read: PolicyCall = { family: '1', leg: 'hoody', route: wallet, method: 'GET', url: `${API}/api/v1/wallet`, body: null };
const wire = { method: 'GET', url: `${API}/api/v1/wallet`, bodyDigest: null };
const codeOf = (p: LivePolicy): string => { const a = p.admitLive(read); return 'code' in a ? a.code : 'ok'; };
const admit = (p: LivePolicy): object => { const a = p.admitLive(read); if (!('admission' in a)) throw new Error(a.code); return a.admission; };

describe('the terminal passcode host', () => {
  test('locked at start', async () => {
    const s = open();
    const none = rig(s);
    expect(none.host.startLocked).toBe(false);
    expect(none.host.state()).toBe('live');
    expect(none.bumps).toBe(0);
    expect(none.host.capable()).toBe(true);
    none.host.stop();
    resetAppLock();
    s.set(KEY, await record());
    const r = rig(reopen(s));
    expect(r.host.startLocked).toBe(true);
    expect(r.host.state()).toBe('locked');
    expect(r.bumps).toBe(1);
    expect(r.wipes).toBe(1);
    expect(lockView().record).toBe('valid');
  });

  test('admission before a lock', async () => {
    const s = open();
    const rec = await record();
    let r: Rig | null = null;
    const p = policyOver(() => r!.host);
    // Started unlocked (no record at boot); the passcode is set afterwards, as the Account page would.
    r = rig(s, { bump: () => { r!.bumps++; p.bump(); } });
    s.set(KEY, rec);
    const first = admit(p), second = admit(p);
    expect(r.host.lock()).toBe(true);
    expect(r.host.state()).toBe('locked');
    expect(r.bumps).toBe(1);
    // Row 1: no new call (a read included) is admitted while locked.
    expect(codeOf(p)).toBe('TERM_LOCKED');
    expect(p.verifyAdmission(first, wire)).toBe('TERM_POLICY_BYPASS');
    expect(await r.host.tryUnlock(RIGHT)).toEqual({ k: 'unlocked' });
    expect(r.bumps).toBe(2);
    // Minted before the lock, never presented: still void after the unlock (the generation moved).
    expect(p.verifyAdmission(second, wire)).toBe('TERM_POLICY_BYPASS');
    const fresh = admit(p);
    expect(p.verifyAdmission(fresh, wire)).toBe('ok');
  });

  test('wrong try kept on disk', async () => {
    const s = open();
    s.set(KEY, await record());
    const r = rig(s);
    expect(r.host.startLocked).toBe(true);
    const w = await r.host.tryUnlock(WRONG);
    expect(w.k).toBe('wrong');
    expect(r.host.state()).toBe('locked');
    const back = reopen(s);
    expect(triesOf(back)).toEqual({ n: 1, until: 1_000_000, pending: null, out: false });
    resetAppLock();
    const r2 = rig(back);
    expect(r2.host.startLocked).toBe(true);
    expect(await r2.host.tryUnlock(RIGHT)).toEqual({ k: 'unlocked' });
    expect(r2.host.state()).toBe('live');
    expect(r2.bumps).toBe(2);
    expect(triesOf(back)).toEqual({ n: 0, until: 1_000_000, pending: null, out: false });
  });

  test('try limit forgets', async () => {
    const s = open();
    s.journalSet('hub.v3.changes', '[{"pending":true}]');
    s.journalSet('hub_money_pending', '[]');
    s.set('hub_theme_v1', 'dark');
    s.set('term.boot_keys', '[]');
    s.set(KEY, await record({ n: 9 }));
    const r = rig(s);
    const v = await r.host.tryUnlock(WRONG);
    expect(v).toEqual({ k: 'terminal' });
    expect(r.left).toEqual(['locked_out']);
    expect(s.journalKeys()).toEqual([]);
    expect(s.keys()).toEqual(['term.boot_keys']);
    // On disk, not only in this process's copy.
    const back = reopen(s);
    expect(back.journalKeys()).toEqual([]);
    expect(back.keys()).toEqual(['term.boot_keys']);
    expect(KEPT_ON_FORGET).toEqual(['term.boot_keys', 'term.new_key']);
  });

  test('a forget that cannot finish keeps the record (out) and stays', async () => {
    const s = open();
    s.journalSet('hub.v3.changes', '[]');
    s.set(KEY, await record({ n: 10, out: true }));
    const failing = { ...s, journalDel: () => { throw new Error('EIO'); } } as unknown as HubStore;
    expect(forgetAccountData(failing, UID)).toBe('failed');
    expect(s.get(KEY)).not.toBeNull();
    const r = rig(failing);
    expect(r.host.startLocked).toBe(true);
    await Bun.sleep(50);
    expect(r.left).toEqual([]);
    expect(r.host.state()).toBe('locked');
    expect(lockView().tries?.out).toBe(true);
    // The lock view is told why, so it can name the move-aside repair.
    expect(r.host.notice()).toEqual({ path: null, reason: 'forget-failed' });
  });

  test('a corrupt change journal: the try limit cannot forget, the notice says so', async () => {
    const s = open();
    s.journalSet('hub.v3.changes', '{not json');
    s.set(KEY, await record({ n: 9 }));
    const r = rig(s, { storePath: dir });
    expect(r.host.notice()).toBeNull();
    expect(await r.host.tryUnlock(WRONG)).toEqual({ k: 'terminal' });
    expect(r.left).toEqual([]);
    expect(r.host.state()).toBe('locked');
    expect(r.host.notice()).toEqual({ path: dir, reason: 'forget-failed' });
    expect(s.journalGet('hub.v3.changes')).toBe('{not json');
  });

  test('read-only mount', async () => {
    const writer = open();
    writer.set(KEY, await record());
    const second = open();
    expect(second.readOnly).toBe('busy');
    const r = rig(second);
    expect(r.host.startLocked).toBe(true);
    expect(r.host.capable()).toBe(false);
    const before = second.get(KEY);
    expect(await r.host.tryUnlock(RIGHT)).toEqual({ k: 'refused', why: 'other-hub' });
    expect(await r.host.tryUnlock(WRONG)).toEqual({ k: 'refused', why: 'other-hub' });
    expect(r.host.state()).toBe('locked');
    expect(writer.get(KEY)).toBe(before);
    // Read-only by choice: the same.
    resetAppLock();
    const chosen = rig(writer, { readOnlyChoice: true });
    expect(await chosen.host.tryUnlock(RIGHT)).toEqual({ k: 'refused', why: 'read-only-choice' });
    expect(chosen.host.notice()).toBeNull();
    expect(chosen.host.capable()).toBe(false);
    // A read-only mount forgets nothing, by choice too.
    writer.set('hub_theme_v1', 'dark');
    expect(forgetAccountData(writer, UID, true)).toBe('failed');
    expect(forgetAccountData(second, UID)).toBe('failed');
    expect(writer.get(KEY)).toBe(before);
    expect(writer.get('hub_theme_v1')).toBe('dark');
  });

  test('a read-only mount never asks for the move-aside repair', async () => {
    // A locked-out record (out) reached by a second Hub or a mount read-only by choice: the forget cannot run there
    // by design, and the store belongs to the other Hub (or is fine): no 'forget-failed' notice.
    const writer = open();
    writer.set(KEY, await record({ n: 10, out: true }));
    const second = open();
    const r = rig(second, { storePath: dir });
    await Bun.sleep(50);
    expect(r.host.state()).toBe('locked');
    expect(r.host.notice()).toBeNull();
    expect(r.left).toEqual([]);
    resetAppLock();
    const chosen = rig(writer, { readOnlyChoice: true, storePath: dir });
    await Bun.sleep(50);
    expect(chosen.host.state()).toBe('locked');
    expect(chosen.host.notice()).toBeNull();
    // The same record on the writable mount: the forget runs (and here succeeds), so the check above is the mode.
    resetAppLock();
    const rw = rig(writer, { storePath: dir });
    await Bun.sleep(50);
    expect(rw.left).toEqual(['locked_out']);
    expect(writer.get(KEY)).toBeNull();
  });

  test('a second Hub opened before the passcode existed still locks', async () => {
    // The reader opens FIRST (no record yet), then the writer sets a passcode.
    const writer = open();
    const second = open();
    expect(second.readOnly).toBe('busy');
    const r = rig(second);
    expect(r.host.startLocked).toBe(false);
    writer.set(KEY, await record({}, { idleMin: 1 }));
    // Idle: the next check past the record's minutes locks.
    r.clock.mono = 61_000;
    r.tick();
    expect(r.host.state()).toBe('locked');
    expect(await r.host.tryUnlock(RIGHT)).toEqual({ k: 'refused', why: 'other-hub' });
    // Resume and the menu's Lock read the record again too.
    resetAppLock();
    for (const s of stores.splice(0)) s.close();
    const w2 = open();
    w2.del(KEY);
    const reader = open();
    const r2 = rig(reader);
    expect(r2.host.state()).toBe('live');
    w2.set(KEY, await record());
    expect(r2.host.resume()).toBe(true);
    expect(r2.host.state()).toBe('locked');
    resetAppLock();
    w2.del(KEY);
    expect(reader.refresh()).toBe(true);
    const r3 = rig(reader);
    expect(r3.host.state()).toBe('live');
    w2.set(KEY, await record());
    expect(r3.host.lock()).toBe(true);
    expect(r3.host.state()).toBe('locked');
    // The writer's own store never re-reads (it is the only writer).
    expect(w2.refresh()).toBe(false);
    // A store.json that cannot be read keeps the copy the reader had (never a looser one).
    fs.writeFileSync(path.join(dir, 'store.json'), '{broken', { mode: 0o600 });
    expect(reader.refresh()).toBe(false);
    expect(reader.get(KEY)).not.toBeNull();
  });

  test('idle and resume', async () => {
    const s = open();
    const rec = await record({}, { idleMin: 1 });
    const r = rig(s);
    s.set(KEY, rec);
    r.clock.mono = 59_000;
    r.tick();
    expect(r.host.state()).toBe('live');
    r.host.input();
    r.clock.mono = 59_000 + 59_000;
    r.tick();
    expect(r.host.state()).toBe('live');
    r.clock.mono = 59_000 + 60_000;
    r.tick();
    expect(r.host.state()).toBe('locked');
    expect(r.left).toEqual([]);
    expect(r.bumps).toBe(1);
    expect(await r.host.tryUnlock(RIGHT)).toEqual({ k: 'unlocked' });
    r.host.suspend();
    expect(r.host.state()).toBe('live');
    expect(r.host.resume()).toBe(true);
    expect(r.host.state()).toBe('locked');
    expect(r.wipes).toBe(2);
    r.host.stop();
  });

  test('token session inert', async () => {
    const s = open();
    s.set(KEY, await record());
    const r = rig(s, { uid: () => null });
    expect(r.host.startLocked).toBe(false);
    expect(r.host.lock()).toBe(false);
    expect(r.host.resume()).toBe(false);
    r.clock.mono = 24 * 3600_000;
    r.tick();
    expect(r.host.state()).toBe('live');
    expect(r.host.capable()).toBe(false);
    expect(r.bumps).toBe(0);
    // No store either: still inert (never the no-store lock of an account session).
    resetAppLock();
    const bare = rig(null, { uid: () => null });
    expect(bare.host.startLocked).toBe(false);
    expect(bare.host.state()).toBe('live');
  });

  test('storage rules', async () => {
    const s = open();
    const st = lockStorage(s, () => UID)!;
    const rec = await record();
    expect(() => st.setItem(LOCK_PREFIX + 'other', rec)).toThrow();
    expect(() => st.setItem(KEY, '{"v":1}')).toThrow();
    expect(() => st.setItem('hub_theme_v1', 'dark')).toThrow();
    st.setItem(KEY, rec);
    expect(reopen(s).get(KEY)).toBe(rec);
    const s2 = stores.at(-1)!;
    expect(lockStorage(s2, () => UID)!.getItem(LOCK_PREFIX + 'other')).toBeNull();
    expect(lockStorage(s2, () => null)!.getItem(KEY)).toBeNull();
    // A failed store refuses the write (throws): the engine answers notSaved/check, never a memory copy.
    let failed = false;
    const latch = { ...s2, failed: () => failed, set: s2.set, get: s2.get, del: s2.del, readOnly: null } as unknown as HubStore;
    failed = true;
    expect(() => lockStorage(latch, () => UID)!.setItem(KEY, rec)).toThrow();
    expect(() => lockStorage(latch, () => UID)!.removeItem(KEY)).toThrow();
    expect(lockStorage(latch, () => UID)!.getItem(KEY)).toBe(rec);
    resetAppLock();
    const r = rig(latch);
    expect(await r.host.tryUnlock(RIGHT)).toEqual({ k: 'refused', why: 'no-store' });
    expect(r.host.capable()).toBe(false);
  });

  test('no store', async () => {
    // No store directory (first run, no home): nothing to protect, unlocked; nothing can be set or kept.
    const absent = rig(null, { noStore: 'absent' });
    expect(absent.host.startLocked).toBe(false);
    expect(absent.host.state()).toBe('live');
    expect(absent.host.lock()).toBe(false);
    expect(absent.host.capable()).toBe(false);
    expect(absent.host.notice()).toBeNull();
    expect(await absent.host.tryUnlock(RIGHT)).toEqual({ k: 'refused', why: 'no-store' });
    const empty = lockStorage(null, () => UID, false, true)!;
    expect(empty.getItem(KEY)).toBeNull();
    expect(() => empty.setItem(KEY, '{}')).toThrow();
    absent.host.stop();
    // A store directory that exists but cannot be used: locked, the notice names it (Forget cannot work there).
    resetAppLock();
    const where = { path: '/home/u/.hoody/hub/0123456789abcdef0123456789abcdef', reason: 'TERM_STORE_UNSAFE' };
    const bad = rig(null, { noStore: where });
    expect(bad.host.startLocked).toBe(true);
    expect(bad.bumps).toBe(1);
    expect(lockView().record).toBe('malformed');
    expect(bad.host.notice()).toEqual(where);
    expect(await bad.host.tryUnlock(RIGHT)).toEqual({ k: 'refused', why: 'no-store' });
    expect(bad.host.state()).toBe('locked');
    expect(forgetAccountData(null, UID)).toBe('failed');
    bad.host.stop();
    // No reason given: unusable (fail closed), never an empty store.
    resetAppLock();
    expect(lockStorage(null, () => UID)).toBeNull();
    const unknown = rig(null, { storePath: '/x' });
    expect(unknown.host.startLocked).toBe(true);
    expect(unknown.host.notice()).toEqual({ path: '/x', reason: 'unknown' });
  });

  test('store fails mid-mount', async () => {
    const s = open();
    s.set(KEY, await record({}, { idleMin: 1 }));
    let failed = false;
    const area = { ...s, failed: () => failed } as unknown as HubStore;
    const r = rig(area, { storePath: dir });
    expect(r.host.startLocked).toBe(true);
    expect(r.host.notice()).toBeNull();
    failed = true;
    // Locked: no try is verified, nothing unlocks.
    expect(await r.host.tryUnlock(RIGHT)).toEqual({ k: 'refused', why: 'no-store' });
    expect(r.host.state()).toBe('locked');
    expect(r.host.notice()).toEqual({ path: dir, reason: 'failed' });
    expect(r.host.capable()).toBe(false);
    // Unlocked before the failure: the record is still read from the verified copy, so idle and Lock still lock.
    failed = false;
    expect(await r.host.tryUnlock(RIGHT)).toEqual({ k: 'unlocked' });
    failed = true;
    r.clock.mono += 61_000;
    r.tick();
    expect(r.host.state()).toBe('locked');
    expect(await r.host.tryUnlock(RIGHT)).toEqual({ k: 'refused', why: 'no-store' });
    expect(r.host.state()).toBe('locked');
  });

  test('forget keeps boot-mint records', async () => {
    const s = open();
    const session = beginTermSession();
    const boot = fixtureBoot({ pageIds: ['keys'], page: 'keys', fx: null });
    try {
      await boot.start(session, () => {});
      setChangeStoreAdapter(changeStoreOver(persistentStore(session.stores().local, s), { droppedTail: false }));
      expect((await holdDirectChange('boot-token-mint', tokenMintRoute as never, { op: 'k3v9q2m7xa' })).ok).toBe(true);
      expect((await holdDirectChange('realm-alias-write', vaultKeyPutRoute as never, null)).ok).toBe(true);
    } finally {
      setChangeStoreAdapter(null);
      await boot.dispose('term-quit');
      session.end();
    }
    const before = JSON.parse(s.journalGet(CHANGE_STORE_KEY)!) as StoredChange[];
    expect(before.map((c) => c.meta?.base).sort()).toEqual(['term.direct.boot-token-mint:k3v9q2m7xa', 'term.direct.realm-alias-write']);
    s.journalSet('hub_money_pending', '[]');
    s.set('hub_theme_v1', 'dark');
    s.set(KEY, await record({ n: 10, out: true }));
    expect(forgetAccountData(s, UID)).toBe('purged');
    // On disk: only the mint record, as it was (the recovery revokes its token by this name).
    const back = reopen(s);
    expect(back.journalKeys()).toEqual([CHANGE_STORE_KEY]);
    const after = JSON.parse(back.journalGet(CHANGE_STORE_KEY)!) as (StoredChange & { attempt?: { alias?: string } })[];
    expect(after as StoredChange[]).toEqual(before.filter((c) => c.meta?.base === 'term.direct.boot-token-mint:k3v9q2m7xa'));
    expect(after[0]!.attempt?.alias).toBe(bootAliasOf('k3v9q2m7xa'));
    expect(back.keys()).toEqual([]);
    // An unreadable changes value may hold one: nothing is dropped, the forget fails.
    back.journalSet(CHANGE_STORE_KEY, '{not json');
    back.set(KEY, await record({ n: 10, out: true }));
    expect(forgetAccountData(back, UID)).toBe('failed');
    expect(back.journalGet(CHANGE_STORE_KEY)).toBe('{not json');
    expect(back.get(KEY)).not.toBeNull();
  });
});
