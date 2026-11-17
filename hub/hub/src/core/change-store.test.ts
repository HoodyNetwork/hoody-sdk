import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATTEMPT_PREFIX, changesFit, heldRecord,
  CHANGE_STORE_KEY, SENDING_STALE_MS, nextVersion, readChanges, readChangesState, sendingLive, setChangeStoreAdapter, subscribeChangeStore, underChangeStore, underChangeStoreLocked, changeStoreCoordinated,
  writeChanges, type StoredChange,
} from './change-store';

const rec = (o: Partial<StoredChange> = {}): StoredChange => ({ id: 'u1\u0001lock:x\u0000d1', pending: true, key: 'k-1', t: 100, ...o });
afterEach(() => { setChangeStoreAdapter(null); localStorage.clear(); vi.unstubAllGlobals(); });

describe('change-store: the stored records', () => {
  it('round-trips records; nothing stored reads as empty, unreadable storage as null', () => {
    expect(readChanges()).toEqual([]);
    const a = rec({ meta: { base: 'lock:x', target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: 'r1', identity: { computer: 'c1' }, by: 'q:x' }, at: 5 });
    expect(writeChanges([a])).toBe(true);
    expect(readChanges()).toEqual([a]);
    expect(writeChanges([])).toBe(true);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBeNull();
    setChangeStoreAdapter({ read() { throw new Error('blocked'); }, write: () => false });
    expect(readChanges()).toBeNull();
    expect(writeChanges([a])).toBe(false);
  });
  it('drops malformed records, keeps the newest version of an id, and bounds the list and each record', () => {
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([rec({ t: 1 }), rec({ t: 3, key: 'k-3' }), rec({ t: 2 }), { id: 'x', pending: 'yes', t: 1 }, rec({ id: 'b', meta: { base: 7 } as never }), 'junk']));
    expect(readChanges()).toEqual([rec({ t: 3, key: 'k-3' })]);
    localStorage.setItem(CHANGE_STORE_KEY, '{not json');
    expect(readChanges()).toEqual([]);
    // Records that hold nothing (not pending, no key, not sending) are bounded: the newest 64; an oversized one goes.
    writeChanges(Array.from({ length: 70 }, (_, i) => rec({ id: 'id' + i, t: i, pending: false, key: null })));
    const kept = readChanges()!;
    expect(kept).toHaveLength(64);
    expect(kept.some((r) => r.id === 'id5')).toBe(false);
    writeChanges([rec({ pending: false, key: null, meta: { base: 'b', target: null, realm: null, identity: 'x'.repeat(9000) } })]);
    expect(readChanges()).toEqual([]);
  });
  it('metaVersion reads only as a safe integer >= 0; any other value is a corrupt record', () => {
    for (const mv of [0, 3]) {
      localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([rec({ metaVersion: mv })]));
      expect(readChangesState()).toEqual({ state: 'clean', list: [rec({ metaVersion: mv })] });
    }
    for (const mv of [-1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
      localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([rec({ metaVersion: mv as never })]));
      expect(readChangesState().state).toBe('corrupt');
    }
  });
  it('gap 1: a held record is never dropped: over the cap or too large, nothing is written and changesFit says why', () => {
    const held = Array.from({ length: 64 }, (_, i) => rec({ id: 'u1\u0001h' + i, t: i }));
    const loose = Array.from({ length: 10 }, (_, i) => rec({ id: 'u1\u0001l' + i, t: 100 + i, pending: false, key: null }));
    expect(changesFit([...held, ...loose])).toBe(null);
    expect(writeChanges([...held, ...loose])).toBe(true);
    // The newer records that hold nothing make way; every hold stays.
    expect(readChanges()!.map((r) => r.id).sort()).toEqual(held.map((r) => r.id).sort());
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    const one = rec({ id: 'u1\u0001h64', t: 200 });
    expect(changesFit([...held, one])).toBe('HOLDS_FULL');
    expect(writeChanges([...held, one])).toBe(false);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    const big = rec({ id: 'big', t: 201, meta: { base: 'b', target: null, realm: null, identity: 'x'.repeat(9000) } });
    expect(changesFit([big])).toBe('TOO_LARGE');
    expect(writeChanges([big])).toBe(false);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    // A key kept after a settle, or a live sending stamp, holds too.
    expect(heldRecord(rec({ pending: false, key: 'k' }))).toBe(true);
    expect(heldRecord(rec({ pending: false, key: null, sending: { tab: 't', at: 1 } }))).toBe(true);
    expect(heldRecord(rec({ pending: false, key: null }))).toBe(false);
  });
  it('attempt records: every one kept and none counted toward the changes.ts cap; a corrupt store reads its valid records, never clean', () => {
    const held = Array.from({ length: 64 }, (_, i) => rec({ id: 'u\u0001h' + i, t: i }));
    // attempts.ts bounds its records per account (64 each): two accounts' full sets sit beside 64 changes.ts holds.
    const att = Array.from({ length: 128 }, (_, i) => rec({ id: ATTEMPT_PREFIX + (i < 64 ? 'a' : 'b') + '\u0001lock:k\u0000' + i, t: 1000 + i }));
    const loose = Array.from({ length: 5 }, (_, i) => rec({ id: 'u\u0001l' + i, t: 5000 + i, pending: false, key: null }));
    expect(changesFit([...held, ...att, ...loose])).toBe(null);
    expect(writeChanges([...held, ...att, ...loose])).toBe(true);
    expect(readChanges()!.map((r) => r.id).sort()).toEqual([...held, ...att].map((r) => r.id).sort());
    expect(changesFit([...held, ...att, rec({ id: 'u\u0001h64', t: 9000 })])).toBe('HOLDS_FULL');
    // Below the changes.ts cap, the loose records fill only the changes.ts slots; attempts never take them.
    expect(writeChanges([...att, ...loose])).toBe(true);
    expect(readChanges()).toHaveLength(133);
    const big = rec({ id: ATTEMPT_PREFIX + 'a\u0001lock:big\u0000x', meta: { base: 'b', target: null, realm: null, identity: 'x'.repeat(9000) } });
    expect(changesFit([big])).toBe('TOO_LARGE');
    expect(writeChanges([big])).toBe(false);
    // A record that does not validate (an attempt included) leaves the store corrupt: its valid records read, but
    // never as clean, so no writer goes over it.
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify([rec({ id: 'ok', t: 1 }), { id: ATTEMPT_PREFIX + 'a\u0001lock:k\u0000z', pending: 'yes', t: 2 }]));
    const rd = readChangesState();
    expect(rd.state).toBe('corrupt');
    expect(rd.state !== 'unreadable' && rd.list.map((r) => r.id)).toEqual(['ok']);
    localStorage.setItem(CHANGE_STORE_KEY, '{not json');
    expect(readChangesState()).toEqual({ state: 'corrupt', list: [] });
    // An empty string is bytes that did not parse, never an empty store (only an absent key is).
    localStorage.setItem(CHANGE_STORE_KEY, '');
    expect(readChangesState()).toEqual({ state: 'corrupt', list: [] });
  });
  it('the cap is per account: a full account refuses its next hold, another account still stores; attempts are kept and not counted (attempts.ts bounds them)', () => {
    const a = Array.from({ length: 64 }, (_, i) => rec({ id: 'u1\u0001h' + i, t: i }));
    const att = rec({ id: ATTEMPT_PREFIX + 'u1\u0001lock\u0000r1', t: 63 });
    const b = Array.from({ length: 64 }, (_, i) => rec({ id: 'u2\u0001h' + i, t: 100 + i }));
    const loose = rec({ id: 'u2\u0001loose', t: 500, pending: false, key: null });
    expect(changesFit([...a, att, ...b, loose])).toBe(null);
    expect(writeChanges([...a, att, ...b, loose])).toBe(true);
    // Every hold of both accounts and the attempt stay; the loose record makes way.
    expect(readChanges()).toHaveLength(129);
    expect(changesFit([...a, att, ...b, rec({ id: 'u1\u0001h99', t: 300 })])).toBe('HOLDS_FULL');
    expect(changesFit([...a, att, ...b, rec({ id: 'u2\u0001h99', t: 300 })])).toBe('HOLDS_FULL');
    expect(changesFit([...a, ...b, rec({ id: 'u3\u0001h0', t: 300 })])).toBe(null);
  });
  it('a version is above every stored one and not behind the clock; a stamp is live until the stale window', () => {
    vi.useFakeTimers({ now: 1000 });
    try {
      expect(nextVersion([])).toBe(1000);
      expect(nextVersion([rec({ t: 5000 })])).toBe(5001);
      expect(sendingLive({ tab: 'a', at: 1000 })).toBe(true);
      vi.setSystemTime(1000 + SENDING_STALE_MS);
      expect(sendingLive({ tab: 'a', at: 1000 })).toBe(false);
      expect(sendingLive(undefined)).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('without navigator.locks it rejects and never runs the callback; through navigator.locks "hub_changes" when present', async () => {
    const fn = vi.fn(() => 7);
    vi.stubGlobal('navigator', {});
    await expect(underChangeStore(fn)).rejects.toThrow('CHANGE_STORE_UNCOORDINATED');
    expect(fn).not.toHaveBeenCalled();
    const request = vi.fn((_name: string, cb: () => unknown) => Promise.resolve(cb()));
    vi.stubGlobal('navigator', { locks: { request } });
    const r = underChangeStore(() => 8);
    expect(r).toBeInstanceOf(Promise);
    expect(await r).toBe(8);
    expect(request.mock.calls[0]![0]).toBe('hub_changes');
  });
  it('attempts-d: a lock that is there but cannot be requested rejects and never runs the callback uncoordinated', async () => {
    const fn = vi.fn(() => 9);
    vi.stubGlobal('navigator', { locks: { request: () => { throw new Error('SecurityError'); } } });
    await expect(underChangeStore(fn)).rejects.toThrow('CHANGE_STORE_UNCOORDINATED');
    vi.stubGlobal('navigator', { get locks() { throw new Error('denied'); } });
    await expect(underChangeStore(fn)).rejects.toThrow('CHANGE_STORE_UNCOORDINATED');
    expect(fn).not.toHaveBeenCalled();
  });
  it('the strict lock is the same helper: refuses, running nothing, without navigator.locks or when its request throws', async () => {
    expect(underChangeStoreLocked).toBe(underChangeStore);
    const fn = vi.fn(() => 9);
    vi.stubGlobal('navigator', {});
    expect(changeStoreCoordinated()).toBe(false);
    await expect(underChangeStoreLocked(fn)).rejects.toThrow();
    vi.stubGlobal('navigator', { locks: { request: () => { throw new Error('SecurityError'); } } });
    await expect(underChangeStoreLocked(fn)).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });
  it('the cap never drops a held record, however many accounts hold them (64 changes.ts holds per account)', () => {
    const accts = ['a', 'b', 'c'];
    const held = accts.flatMap((a, k) => Array.from({ length: 50 }, (_, i) => rec({ id: a + '\u0001lock:' + i + '\u0000d', t: k * 100 + i })));
    const att = accts.map((a, k) => rec({ id: ATTEMPT_PREFIX + a + '\u0001keys:create\u0000' + k, t: 900 + k }));
    const loose = Array.from({ length: 10 }, (_, i) => rec({ id: 'a\u0001loose' + i, t: 2000 + i, pending: false, key: null }));
    expect(changesFit([...held, ...att, ...loose])).toBe(null);
    expect(writeChanges([...held, ...att, ...loose])).toBe(true);
    const ids = readChanges()!.map((r) => r.id);
    // 150 held changes.ts records (over 64 in total) and every attempt stay; only the loose records make way.
    expect(ids.filter((id) => !id.includes('loose')).sort()).toEqual([...held, ...att].map((r) => r.id).sort());
    expect(ids.some((id) => id.includes('loose'))).toBe(false);
  });
  it('another tab\'s write of the key (or a whole clear) calls the subscriber; other keys do not', () => {
    const fn = vi.fn();
    const off = subscribeChangeStore(fn);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
