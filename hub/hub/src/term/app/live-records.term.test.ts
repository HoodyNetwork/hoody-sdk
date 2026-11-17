// Changes in a live mount (admission row 6) over the local store. Real files (hub-store.ts), real
// core holds (attempts.ts) in fixture mounts; nothing is sent.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A hold made before a kill (no close, no release) is held at the next mount: the same lock is refused HELD | 'kill between send and answer' |
// | 2 | No writable store (a second Hub, a failed store): the hold is refused NOT_DURABLE and nothing is stored | 'no store: refused unsent' |
// | 3 | After a dropped journal tail, a record still `admitting` is shown as a hold, never aged out | 'dropped tail keeps the admission' |
// | 4 | Without a dropped tail an old `admitting` record is unsent, as on the web; one admitted later in the mount is judged as usual | 'no dropped tail' |
// | 5 | storeModeOf and recordKept truth tables (row 6's two questions) | 'row 6 questions' |
import { afterEach, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADMIT_STALE_MS, attemptHoldRefsIn, heldAttempts, holdAttempt } from '../../core/attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, setChangeStoreAdapter, type ChangeStoreAdapter, type StoredChange } from '../../core/change-store';
import { hubStoreDir, openHubStore, systemTryLock, type HubStore, type StoreIo, type TryLock } from '../../../scripts/term/build/hub-store';
import { persistentStore } from '../env/persist';
import { beginTermSession, type TermSession } from '../env/session';
import { fixtureBoot } from './boot';
import type { TermBoot } from './lifecycle';
import { changeStoreOver, recordKept, storeModeOf } from './live-records';

setDefaultTimeout(30_000);

let flock: TryLock = () => true;
let home = '';
let dir = '';
/** Every descriptor a store opened, per store: a "kill" closes them without the store's own close (no compaction). */
const opened: number[][] = [];
beforeAll(async () => { flock = await systemTryLock(); });
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-records-test-'));
  fs.chmodSync(home, 0o700);
  dir = hubStoreDir(home, 'https://api.example.invalid', '64f0ada00000000000000001')!;
});
afterEach(() => {
  setChangeStoreAdapter(null);
  for (const fds of opened.splice(0)) for (const fd of fds) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  fs.rmSync(home, { recursive: true, force: true });
});

function open(): HubStore {
  const fds: number[] = [];
  opened.push(fds);
  const io: StoreIo = { ...fs, openSync: ((...a: Parameters<typeof fs.openSync>) => { const fd = fs.openSync(...a); fds.push(fd); return fd; }) as typeof fs.openSync };
  return openHubStore(dir, { home, tryLock: flock, io });
}
/** The process dies: its descriptors close (the lock is released), nothing is compacted or flushed. */
function kill(): void { for (const fd of opened.at(-1)!.splice(0)) { try { fs.closeSync(fd); } catch { /* closed */ } } }

/** A fixture mount whose change store is the area (through the store seam), the way the live boot will install it. */
async function mounted<T>(area: HubStore, fn: (s: TermSession, a: ChangeStoreAdapter) => Promise<T>, o: { adapter?: boolean } = {}): Promise<T> {
  const session = beginTermSession();
  const boot: TermBoot = fixtureBoot({ pageIds: ['keys'], page: 'keys', fx: null });
  try {
    await boot.start(session, () => {});
    const store = persistentStore(session.stores().local, area);
    // Without the change-store adapter: the records go through the same seam but nothing is recovered.
    const a: ChangeStoreAdapter = o.adapter === false
      ? { read: () => store.getItem(CHANGE_STORE_KEY), write: (t) => { try { if (t === null) store.removeItem(CHANGE_STORE_KEY); else store.setItem(CHANGE_STORE_KEY, t); return true; } catch { return false; } } }
      : changeStoreOver(store, { droppedTail: area.droppedTail });
    setChangeStoreAdapter(a);
    return await fn(session, a);
  } finally {
    setChangeStoreAdapter(null);
    await boot.dispose('term-quit');
    session.end();
  }
}
const stored = (area: HubStore): StoredChange[] => JSON.parse(area.journalGet(CHANGE_STORE_KEY) ?? '[]') as StoredChange[];
const attempts = (area: HubStore): StoredChange[] => stored(area).filter((r) => r.id.startsWith(ATTEMPT_PREFIX));
/** Appends a line whose write never returned (no newline): the next open drops it. */
const tearTail = (): void => { fs.appendFileSync(path.join(dir, 'journal.jsonl'), '{"v":1,"n":99,"t":1,"key":"hub.v3.changes","op":"set","value":"[{\\"id'); };
/** Marks the account's attempt records as never confirmed, `ago` ms before now (the state a kill mid-admission leaves). */
function markAdmitting(area: HubStore, ago: number): void {
  const list = stored(area).map((r) => (r.id.startsWith(ATTEMPT_PREFIX) ? { ...r, admitting: Date.now() - ago } : r));
  area.journalSet(CHANGE_STORE_KEY, JSON.stringify(list));
}

describe('kill between send and answer', () => {
  test('the hold is pending at the next mount, its lock refused HELD (read back, never resent)', async () => {
    const one = open();
    const lock = 'key.create';
    await mounted(one, async () => {
      const got = await holdAttempt(lock, { by: 'keys' });
      expect(got.ok).toBe(true);
      // The record is on disk, confirmed, before anything could be sent.
      expect(attempts(one)).toHaveLength(1);
      expect(attempts(one)[0]!.admitting).toBeUndefined();
    });
    kill();
    const two = open();
    expect(two.readOnly).toBeNull();
    await mounted(two, async () => {
      const held = heldAttempts(lock);
      expect(held.map((h) => [h.lock, h.persisted])).toEqual([[lock, true]]);
      const again = await holdAttempt(lock, { by: 'keys' });
      expect(again).toMatchObject({ ok: false, code: 'HELD', notSent: true });
    });
  });
});

describe('no store: refused unsent', () => {
  test('a second Hub (read-only area): NOT_DURABLE, nothing written', async () => {
    const first = open();
    const second = open();
    expect(second.readOnly).toBe('busy');
    expect(storeModeOf(second)).toBe('ro');
    await mounted(second, async () => {
      const got = await holdAttempt('key.create', { by: 'keys' });
      expect(got).toMatchObject({ ok: false, code: 'NOT_DURABLE', notSent: true });
    });
    expect(first.journalGet(CHANGE_STORE_KEY)).toBeNull();
    first.close();
  });
  test('a failed store: NOT_DURABLE', async () => {
    const area = open();
    const failing: HubStore = { ...area, failed: () => true, journalSet: () => { throw new Error('EIO'); } };
    expect(storeModeOf(failing)).toBe('none');
    await mounted(failing, async () => {
      expect(await holdAttempt('key.create', { by: 'keys' })).toMatchObject({ ok: false, code: 'NOT_DURABLE', notSent: true });
    });
    expect(area.journalGet(CHANGE_STORE_KEY)).toBeNull();
    area.close();
  });
});

describe('dropped tail keeps the admission', () => {
  async function leftAdmitting(): Promise<void> {
    const one = open();
    await mounted(one, async () => { expect((await holdAttempt('key.create', { by: 'keys' })).ok).toBe(true); });
    // The kill came after the admission was stored and before its confirmation was: the confirming write is the
    // torn line, so what survives still says `admitting`, from an hour ago.
    markAdmitting(one, 3_600_000);
    kill();
    tearTail();
  }
  test('with the step-6 adapter: shown as a pending hold, its lock refused HELD', async () => {
    await leftAdmitting();
    const two = open();
    expect(two.droppedTail).toBe(true);
    await mounted(two, async () => {
      expect(heldAttempts('key.create')).toHaveLength(1);
      expect(await holdAttempt('key.create', { by: 'keys' })).toMatchObject({ ok: false, code: 'HELD' });
    });
  });
  test('without the change-store adapter the record ages out and the same lock is admitted again', async () => {
    await leftAdmitting();
    const two = open();
    expect(two.droppedTail).toBe(true);
    await mounted(two, async () => {
      expect(heldAttempts('key.create')).toHaveLength(0);
      const again = await holdAttempt('key.create', { by: 'keys' });
      expect(again.ok).toBe(true);
    }, { adapter: false });
  });
  test('nothing on disk is rewritten by reading; a record that never was an attempt is untouched', async () => {
    await leftAdmitting();
    const two = open();
    // A change record (not an attempt) that carries the field keeps it: the recovery is for attempt admissions only.
    const change = { id: '64f0ada00000000000000001\u0001computers.rename\u00016f1d', pending: true, key: 'idem-2f6c1a', at: 1_800_000_000_000, fmt: 1, inc: 'a1B2', nonce: 'c3D4', t: 1_800_000_000_001, admitting: Date.now() - 3_600_000, meta: { base: 'https://api.example.invalid', target: null, realm: null, by: '64f0ada00000000000000001' } };
    two.journalSet(CHANGE_STORE_KEY, JSON.stringify([...stored(two), change]));
    const before = two.journalGet(CHANGE_STORE_KEY);
    const m = new Map<string, string>();
    const memory = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
    const a = changeStoreOver(persistentStore(memory, two), { droppedTail: true });
    const shown = JSON.parse(a.read()!) as StoredChange[];
    expect(shown.filter((r) => r.id.startsWith(ATTEMPT_PREFIX)).map((r) => r.admitting)).toEqual([undefined]);
    expect(shown.filter((r) => r.id === change.id).map((r) => r.admitting)).toEqual([change.admitting]);
    expect(two.journalGet(CHANGE_STORE_KEY)).toBe(before);
    expect((JSON.parse(before!) as StoredChange[]).some((r) => r.admitting !== undefined)).toBe(true);
    two.close();
  });
  test('the adapter writes through the seam: null removes the key, a refused write answers false', async () => {
    const area = open();
    const m = new Map<string, string>();
    const memory = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
    const a = changeStoreOver(persistentStore(memory, area), { droppedTail: false });
    expect(a.write('[]')).toBe(true);
    expect(area.journalGet(CHANGE_STORE_KEY)).toBe('[]');
    expect(a.write(null)).toBe(true);
    expect(area.journalGet(CHANGE_STORE_KEY)).toBeNull();
    expect(a.read()).toBeNull();
    const busy = open();
    expect(changeStoreOver(persistentStore(memory, busy), { droppedTail: false }).write('[]')).toBe(false);
    expect(changeStoreOver(persistentStore(memory, { ...area, failed: () => true }), { droppedTail: false }).write('[]')).toBe(false);
    expect(area.journalGet(CHANGE_STORE_KEY)).toBeNull();
    area.close();
  });
});

describe('no dropped tail', () => {
  test('an old admitting record is unsent, as on the web', async () => {
    const one = open();
    await mounted(one, async () => { expect((await holdAttempt('key.create', { by: 'keys' })).ok).toBe(true); });
    markAdmitting(one, ADMIT_STALE_MS + 60_000);
    kill();
    const two = open();
    expect(two.droppedTail).toBe(false);
    await mounted(two, async () => {
      expect(heldAttempts('key.create')).toHaveLength(0);
      expect((await holdAttempt('key.create', { by: 'keys' })).ok).toBe(true);
    });
  });
  test('ids are taken at open: an admission left unconfirmed later in the same mount ages out as usual', async () => {
    const one = open();
    await mounted(one, async () => { expect((await holdAttempt('key.create', { by: 'keys' })).ok).toBe(true); });
    markAdmitting(one, 3_600_000);
    kill();
    tearTail();
    const two = open();
    await mounted(two, async () => {
      expect(heldAttempts('key.create')).toHaveLength(1);
      const other = await holdAttempt('key.other', { by: 'keys' });
      expect(other.ok).toBe(true);
      // Its record, unconfirmed and old, is not one of the ids kept at open.
      const list = stored(two).map((r) => (r.meta?.base === 'key.other' ? { ...r, admitting: Date.now() - 3_600_000 } : r));
      two.journalSet(CHANGE_STORE_KEY, JSON.stringify(list));
      expect(heldAttempts('key.other')).toHaveLength(0);
      expect(heldAttempts('key.create')).toHaveLength(1);
    });
  });
});

describe('row 6 questions', () => {
  test('storeModeOf: none without an area or after a failure, ro when busy or chosen, else rw', () => {
    const area = { readOnly: null, failed: () => false } as const;
    expect(storeModeOf(null)).toBe('none');
    expect(storeModeOf({ ...area, failed: () => true })).toBe('none');
    expect(storeModeOf({ readOnly: 'busy', failed: () => true })).toBe('none');
    expect(storeModeOf({ ...area, readOnly: 'busy' })).toBe('ro');
    expect(storeModeOf(area, true)).toBe('ro');
    expect(storeModeOf(area)).toBe('rw');
    expect(storeModeOf(area, false)).toBe('rw');
  });
  test('recordKept: the hold\'s own confirmed record, durably on disk, same incarnation', async () => {
    const one = open();
    let acct = '';
    await mounted(one, async () => { expect((await holdAttempt('key.create', { by: 'keys' })).ok).toBe(true); });
    const rec = attempts(one)[0]!;
    acct = rec.id.slice(ATTEMPT_PREFIX.length, rec.id.indexOf('\u0001'));
    const [ref] = attemptHoldRefsIn(stored(one), acct);
    expect(ref).toBeDefined();
    expect(recordKept(one, { id: ref!.id, token: ref!.token })).toBe(true);
    // Not the hold: another incarnation, an unknown id, a malformed ref.
    expect(recordKept(one, { id: ref!.id, token: 'f'.repeat(32) })).toBe(false);
    expect(recordKept(one, { id: ref!.id + 'x', token: ref!.token })).toBe(false);
    for (const bad of [null, undefined, 'x', [], {}, { id: ref!.id }, { token: ref!.token }, { id: '', token: '' }, { id: 1, token: ref!.token }]) expect(recordKept(one, bad), JSON.stringify(bad) ?? 'undefined').toBe(false);
    // Not durable or not confirmed: read-only, failed, no area, still admitting, stored twice, unreadable.
    expect(recordKept({ ...one, readOnly: 'busy' }, ref)).toBe(false);
    expect(recordKept({ ...one, failed: () => true }, ref)).toBe(false);
    expect(recordKept(null, ref)).toBe(false);
    const confirmed = one.journalGet(CHANGE_STORE_KEY)!;
    const list = JSON.parse(confirmed) as Array<Record<string, unknown>>;
    one.journalSet(CHANGE_STORE_KEY, JSON.stringify(list.map((r) => (r.id === ref!.id ? { ...r, admitting: Date.now() } : r))));
    expect(recordKept(one, ref)).toBe(false);
    one.journalSet(CHANGE_STORE_KEY, JSON.stringify([...list, ...list]));
    expect(recordKept(one, ref)).toBe(false);
    expect(recordKept({ ...one, journalGet: () => '{' }, ref)).toBe(false);
    expect(recordKept({ ...one, journalGet: () => '{}' }, ref)).toBe(false);
    expect(recordKept({ ...one, journalGet: () => null }, ref)).toBe(false);
    one.journalSet(CHANGE_STORE_KEY, confirmed);
    expect(recordKept(one, ref)).toBe(true);
    one.close();
  });
  test('recordKept for a change: token inc#nonce, an outcome suffix ignored', () => {
    const id = `64f0ada00000000000000001\u0001computers.rename\u00016f1d`;
    const rec = { id, pending: true, key: 'k', at: 1, fmt: 1, inc: 'a1B2', nonce: 'c3D4', t: 2 };
    const area = { readOnly: null, failed: () => false, journalGet: (k: string) => (k === CHANGE_STORE_KEY ? JSON.stringify([rec]) : null) } as const;
    expect(recordKept(area, { id, token: 'a1B2#c3D4' })).toBe(true);
    expect(recordKept(area, { id, token: 'a1B2#c3D4~e5F6' })).toBe(true);
    for (const token of ['a1B2#c3D5', 'a1B2', 'c3D4#a1B2', '#', 'a1B2#c3D4#x']) expect(recordKept(area, { id, token }), token).toBe(false);
    // Cut at the last '~', as core's splitHold: a '~' inside the incarnation stays part of the token.
    const tilde = { ...area, journalGet: () => JSON.stringify([{ ...rec, inc: 'a~b' }]) };
    expect(recordKept(tilde, { id, token: 'a~b#c3D4~e5F6' })).toBe(true);
    expect(recordKept(tilde, { id, token: 'a~b#c3D4~' })).toBe(true);
    expect(recordKept(tilde, { id, token: 'a#c3D4~e5F6' })).toBe(false);
    const noNonce = { ...area, journalGet: () => JSON.stringify([{ ...rec, nonce: undefined }]) };
    expect(recordKept(noNonce, { id, token: 'a1B2#undefined' })).toBe(false);
    // The attempt rule does not leak into changes, nor the change rule into attempts.
    const att = `${ATTEMPT_PREFIX}64f0ada00000000000000001\u0001key.create\u0000abc`;
    const attArea = { ...area, journalGet: () => JSON.stringify([{ id: att, pending: true, inc: 'a1B2', nonce: 'c3D4' }]) };
    expect(recordKept(attArea, { id: att, token: 'abc' })).toBe(true);
    expect(recordKept(attArea, { id: att, token: 'a1B2#c3D4' })).toBe(false);
    // The attempt rule keys on the prefix, not on the separator: a change id holding \u0000 is still a change.
    const odd = `${id}\u0000tail`;
    const oddArea = { ...area, journalGet: () => JSON.stringify([{ ...rec, id: odd }]) };
    expect(recordKept(oddArea, { id: odd, token: 'a1B2#c3D4' })).toBe(true);
    expect(recordKept(oddArea, { id: odd, token: 'tail' })).toBe(false);
  });
});
