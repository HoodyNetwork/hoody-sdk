// The dock store's per-key operations: dockApply changes only the record
// it names on the FRESH stored list; dockApplyLocked queues it for this tab's own reads and runs it under the account's dock lock; the
// dock's read applies the queue after the journal-only rows and hides a journal-only row whose removal is still pending.
// Two tabs share one fake storage; navigator.locks is the suite's exclusive first-come-first-served lock (grants are asynchronous).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { readStore, writeStore } from '../data';
import type { AskRecord } from '../logic';
import { ACCOUNT, HANDLE, HANDLE2, JOURNAL, OTHER, REALM, RID, showAccount, slot, world, type World } from '../accept/env';
import * as S from '../accept/seam';
import { dockLockName, recsLockName } from './locks';
import { removeTestLocks } from '../../core/test/locks';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const hex = (n: number) => 'hx-' + n.toString(16).padStart(32, '0');
const mk = (n: number, o: Partial<AskRecord> = {}): AskRecord =>
  ({ p: slot.project, c: slot.computer, r: REALM, s: 'sess-' + n, t: 'turn-' + n, k1: hex(n), k2: hex(n + 1000), rc: 'custom', n: null, at: 1000 - n, i: null, q: 0, ph: 'completed', l: 'en', ...o }) as AskRecord;
const put = (rec: AskRecord, front?: boolean) => ({ k: 'put', rec, ...(front ? { front: true } : {}) }) as any;
const drop = (rec: AskRecord) => ({ k: 'drop', p: rec.p, c: rec.c, r: rec.r, k1: rec.k1 }) as any;
const seed = (recs: AskRecord[]) => expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: recs } } as any)).toBe(true);
const stored = (): AskRecord[] => (readStore(ACCOUNT).a[ACCOUNT] ?? []) as AskRecord[];
const ids = (l: readonly AskRecord[]) => l.map((r) => r.k1);
const shown = (j = w!.j): AskRecord[] => (j.dockRead(ACCOUNT, readStore(ACCOUNT)).a[ACCOUNT] ?? []) as AskRecord[];
/** Holds a named lock until released (a tab that is in the middle of its own write). */
function hold(name: string): Promise<() => void> {
  return new Promise((granted) => {
    void (navigator as any).locks.request(name, () => new Promise<void>((release) => granted(() => release())));
  });
}

describe('dockApply: one operation on the fresh stored list', () => {
  it('a new record goes first; every other record stays as it was', () => {
    w = world();
    const A = mk(1), B = mk(2);
    seed([A, B]);
    expect(w.j.dockApply(ACCOUNT, put(mk(3)))).toBe(true);
    expect(ids(stored())).toEqual([hex(3), hex(1), hex(2)]);
  });
  it('an existing record is replaced in place, or moved to the front with front, whatever its clock says (no re-sort by at)', () => {
    w = world();
    const A = mk(1, { at: 900 }), B = mk(2, { at: 100 });
    seed([A, B]);
    expect(w.j.dockApply(ACCOUNT, put({ ...B, ph: 'failed' }))).toBe(true);
    expect(ids(stored())).toEqual([hex(1), hex(2)]);
    expect(stored()[1]?.ph).toBe('failed');
    expect(w.j.dockApply(ACCOUNT, put(B, true))).toBe(true);
    expect(ids(stored())).toEqual([hex(2), hex(1)]);
  });
  it('a record of another slot is untouched by a put and by a drop', () => {
    w = world();
    const Z = mk(9, { c: 'c0a7150000000000000000b2' });
    seed([mk(1), Z]);
    expect(w.j.dockApply(ACCOUNT, put(mk(2)))).toBe(true);
    expect(w.j.dockApply(ACCOUNT, drop(mk(2)))).toBe(true);
    expect(stored().find((r) => r.k1 === Z.k1)).toEqual(Z);
    expect(ids(stored())).toEqual([hex(1), hex(9)]);
  });
  it('a put of a record whose stored copy holds an uncovered pending key keeps that key', () => {
    w = world();
    const A = mk(1, { w: true, t: null, ph: 'sending' });
    seed([A]);
    const next = { ...A, k2: hex(77) } as any;
    delete next.w;
    const ok = w.j.dockApply(ACCOUNT, put(next));
    const holds = stored().some((r) => (r.k2 === A.k2 && r.w) || (r.kw ?? []).includes(A.k2));
    expect(ok === false || holds, 'the old turn key is nowhere in the source').toBe(true);
  });
  it('a put of a new record with no session yet writes nothing (the journal keeps it) and answers kept', () => {
    w = world();
    seed([mk(1)]);
    expect(w.j.dockApply(ACCOUNT, put(mk(2, { s: null, t: null })))).toBe(true);
    expect(ids(stored())).toEqual([hex(1)]);
  });
  it('a drop of an absent record is kept and writes nothing; a drop removes only that record', () => {
    w = world();
    seed([mk(1), mk(2)]);
    expect(w.j.dockApply(ACCOUNT, drop(mk(5)))).toBe(true);
    expect(ids(stored())).toEqual([hex(1), hex(2)]);
    expect(w.j.dockApply(ACCOUNT, drop(mk(1)))).toBe(true);
    expect(ids(stored())).toEqual([hex(2)]);
  });
  it('a drop of a record that still carries evidence nothing covers is refused and the record stays', () => {
    w = world();
    const R = mk(1, { w: true, t: null, ph: 'sending' });
    seed([R]);
    expect(w.j.dockApply(ACCOUNT, drop(R))).toBe(false);
    expect(ids(stored())).toEqual([hex(1)]);
  });
  it('another account than the shown one: false, nothing written', () => {
    w = world();
    seed([mk(1)]);
    expect(w.j.dockApply(OTHER, put(mk(2)))).toBe(false);
    expect(ids(stored())).toEqual([hex(1)]);
  });
  it('an invalid record is refused', () => {
    w = world();
    expect(w.j.dockApply(ACCOUNT, put({ ...mk(1), k1: '' }))).toBe(false);
  });
});

describe('dockApply: the capacity rule never removes a protected record', () => {
  const eight = (o: (n: number) => Partial<AskRecord>) => Array.from({ length: 8 }, (_, i) => mk(i + 1, o(i + 1)));
  it('8 stored, the last settled and evidence-free: that one leaves, the other 7 and the new one stay', () => {
    w = world();
    seed(eight((n) => (n === 8 ? { ph: 'completed' } : { ph: 'sending', t: null })));
    expect(w.j.dockApply(ACCOUNT, put(mk(20)))).toBe(true);
    expect(ids(stored())).toEqual([hex(20), ...[1, 2, 3, 4, 5, 6, 7].map(hex)]);
  });
  it('8 stored, all live: recentFull, nothing written, all 8 stay', () => {
    w = world();
    seed(eight(() => ({ ph: 'sending', t: null })));
    const before = JSON.stringify(stored());
    expect(w.j.dockApply(ACCOUNT, put(mk(20)))).toBe('recentFull');
    expect(JSON.stringify(stored())).toBe(before);
  });
  it('an unresolved (unknown) conversation is never rotated: 7 live plus 1 failed with u === t', () => {
    w = world();
    seed(eight((n) => (n === 8 ? { ph: 'failed', t: 'turn-8', u: 'turn-8' } : { ph: 'sending', t: null })));
    expect(w.j.dockApply(ACCOUNT, put(mk(20)))).toBe('recentFull');
    expect(ids(stored())).toHaveLength(8);
    expect(ids(stored())).toContain(hex(8));
  });
  it('7 live plus 1 gone with no marker: the gone one rotates out', () => {
    w = world();
    seed(eight((n) => (n === 8 ? { ph: 'gone' } : { ph: 'sending', t: null })));
    expect(w.j.dockApply(ACCOUNT, put(mk(20)))).toBe(true);
    expect(ids(stored())).not.toContain(hex(8));
    expect(ids(stored())).toContain(hex(20));
  });
  it('a record holding uncovered evidence is never rotated', () => {
    w = world();
    seed(eight((n) => (n === 8 ? { ph: 'completed', w: true } : { ph: 'sending', t: null })));
    expect(w.j.dockApply(ACCOUNT, put(mk(20)))).toBe('recentFull');
    expect(ids(stored())).toContain(hex(8));
  });
  it('a conversation unknown only by its phase (a pending key the journal already covers) is never rotated', () => {
    w = world();
    const k2 = hex(1008);
    seed(eight((n) => (n === 8 ? { ph: 'completed', w: true } : { ph: 'sending', t: null })));
    expect(S.writeEntry(w.j, { k: k2, kind: 'turn', h: HANDLE, r: REALM, s: 'sess-8', c: hex(8), ct: slot.computer, at: 1 } as any)).toBe('ok');
    expect(w.j.dockApply(ACCOUNT, put(mk(20)))).toBe('recentFull');
    expect(ids(stored())).toContain(hex(8));
  });
  it('a conversation whose only protection is evidence nothing covers (a decision in flight) is never rotated', () => {
    w = world();
    seed(eight((n) => (n === 8 ? { ph: 'completed', da: { g: RID('d') } } : { ph: 'sending', t: null })));
    expect(w.j.dockApply(ACCOUNT, put(mk(20)))).toBe('recentFull');
    expect(ids(stored())).toContain(hex(8));
  });
  it('a journal removal that throws releases its pending hiding', async () => {
    w = world();
    (w.j as any).records.drop = () => Promise.reject(new Error('boom'));
    await expect(w.j.drop(HANDLE, REALM, null, hex(1))).rejects.toThrow('boom');
    expect((w.j as any).drops.empty(ACCOUNT)).toBe(true);
  });
  it('after the refusal, one record settles and the next save of the new one rotates it out and lists the new one', () => {
    w = world();
    seed(eight(() => ({ ph: 'sending', t: null })));
    const N = mk(20);
    expect(w.j.dockApply(ACCOUNT, put(N))).toBe('recentFull');
    expect(w.j.dockApply(ACCOUNT, put({ ...mk(5), ph: 'completed' }))).toBe(true);
    expect(w.j.dockApply(ACCOUNT, put(N))).toBe(true);
    expect(ids(stored())).toContain(hex(20));
    expect(ids(stored())).toHaveLength(8);
  });
});

describe('dockApplyLocked: the queue is read by this tab, the lock is every tab\'s', () => {
  it('a put waiting for the lock is shown by this tab\'s read; a drop is not shown; both settle to the stored truth', async () => {
    w = world();
    seed([mk(1), mk(2)]);
    const release = await hold(dockLockName(ACCOUNT));
    const a = w.j.dockApplyLocked(ACCOUNT, put(mk(3)));
    const b = w.j.dockApplyLocked(ACCOUNT, drop(mk(1)));
    expect(ids(shown())).toEqual([hex(3), hex(2)]);
    expect(ids(stored())).toEqual([hex(1), hex(2)]);
    release();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(ids(stored())).toEqual([hex(3), hex(2)]);
    expect(ids(shown())).toEqual([hex(3), hex(2)]);
  });
  it('a refused put leaves the queue: the next read shows the stored list, X absent', async () => {
    w = world();
    seed(Array.from({ length: 8 }, (_, i) => mk(i + 1, { ph: 'sending', t: null })));
    const release = await hold(dockLockName(ACCOUNT));
    const a = w.j.dockApplyLocked(ACCOUNT, put(mk(20)));
    expect(ids(shown())).toContain(hex(20));
    release();
    expect(await a).toBe('recentFull');
    expect(ids(shown())).not.toContain(hex(20));
  });
  it('two puts of X: each read sees the newest queued state; the stored result is the second', async () => {
    w = world();
    seed([mk(1)]);
    const release = await hold(dockLockName(ACCOUNT));
    const first = w.j.dockApplyLocked(ACCOUNT, put(mk(2, { ph: 'sending' })));
    expect(shown().find((r) => r.k1 === hex(2))?.ph).toBe('sending');
    const second = w.j.dockApplyLocked(ACCOUNT, put(mk(2, { ph: 'completed' })));
    expect(shown().find((r) => r.k1 === hex(2))?.ph).toBe('completed');
    release();
    await Promise.all([first, second]);
    expect(stored().find((r) => r.k1 === hex(2))?.ph).toBe('completed');
  });
  it('a put that carries the session a journal-only row just got is shown once, not lost and not doubled', async () => {
    w = world();
    const J = mk(7, { s: null, t: null });
    expect(await w.j.put(HANDLE, J)).toBe('ok');
    expect(ids(shown())).toEqual([hex(7)]);
    const release = await hold(dockLockName(ACCOUNT));
    const a = w.j.dockApplyLocked(ACCOUNT, put({ ...J, s: 'sess-7' }));
    const rows = shown().filter((r) => r.k1 === hex(7));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.s).toBe('sess-7');
    release();
    await a;
  });
  it('without Web Locks the op runs at once, unlocked, and its queue entry is gone when the synchronous core returns', async () => {
    w = world();
    removeTestLocks();
    seed([mk(1)]);
    const p = w.j.dockApplyLocked(ACCOUNT, put(mk(2)));
    expect(w.j.dockPendingKeys(ACCOUNT).size).toBe(0);
    expect(await p).toBe(true);
    expect(ids(stored())).toEqual([hex(2), hex(1)]);
  });
  it('a refused lock answers false and writes nothing', async () => {
    w = world();
    seed([mk(1)]);
    (navigator as any).locks = { request: () => Promise.reject(new Error('refused')) };
    expect(await w.j.dockApplyLocked(ACCOUNT, put(mk(2)))).toBe(false);
    expect(ids(stored())).toEqual([hex(1)]);
    expect(w.j.dockPendingKeys(ACCOUNT).size).toBe(0);
  });
  it('the account switching while a put waits: false, nothing written to either account', async () => {
    w = world();
    seed([mk(1)]);
    const release = await hold(dockLockName(ACCOUNT));
    const a = w.j.dockApplyLocked(ACCOUNT, put(mk(2)));
    showAccount(OTHER);
    release();
    expect(await a).toBe(false);
    showAccount(ACCOUNT);
    expect(ids(stored())).toEqual([hex(1)]);
  });
  it('dockPendingKeys names the create keys of the queued operations', async () => {
    w = world();
    seed([mk(1)]);
    const release = await hold(dockLockName(ACCOUNT));
    const a = w.j.dockApplyLocked(ACCOUNT, put(mk(2)));
    const b = w.j.dockApplyLocked(ACCOUNT, drop(mk(1)));
    expect([...w.j.dockPendingKeys(ACCOUNT)].sort()).toEqual([hex(1), hex(2)]);
    release();
    await Promise.all([a, b]);
    expect(w.j.dockPendingKeys(ACCOUNT).size).toBe(0);
  });
});

describe('two tabs: a stale view never undoes the other tab\'s record (a regression)', () => {
  it('tab A\'s engine queues R behind a held lock; tab B adds Y; a Clear removes X; A\'s op then runs: Y survives, X stays removed, R is saved', async () => {
    w = world();
    const X = mk(1), Z = mk(2);
    seed([X, Z]);
    const release = await hold(dockLockName(ACCOUNT));
    const a = w.j.dockApplyLocked(ACCOUNT, put(mk(3)));
    const b = w.jB.dockApplyLocked(ACCOUNT, put(mk(4)));
    const clear = w.jB.dockRemove(ACCOUNT, [{ k1: X.k1, p: X.p, c: X.c, r: X.r, s: X.s as string }], () => true);
    release();
    await Promise.all([a, b, clear]);
    expect(ids(stored()).sort()).toEqual([hex(2), hex(3), hex(4)].sort());
  });
  it('a stale write brings cleared rows back? No: tab B queues R, tab A clears X and Z, B\'s op runs: X and Z stay removed, R saved', async () => {
    w = world();
    const X = mk(1), Z = mk(2);
    seed([X, Z]);
    const release = await hold(dockLockName(ACCOUNT));
    const b = w.jB.dockApplyLocked(ACCOUNT, put(mk(3)));
    const clear = w.j.dockRemove(ACCOUNT, [X, Z].map((r) => ({ k1: r.k1, p: r.p, c: r.c, r: r.r, s: r.s as string })), () => true);
    release();
    await Promise.all([b, clear]);
    expect(ids(stored())).toEqual([hex(3)]);
  });
});

describe('dockRead: queued operations apply after the journal-only rows, deduped on full identity', () => {
  it('a journal-only row under a queued dock drop is hidden; a queued drop then put shows it once with the put\'s fields; put then drop hides it', async () => {
    w = world();
    const Y = mk(5, { s: null, t: null });
    expect(await w.j.put(HANDLE, Y)).toBe('ok');
    const release = await hold(dockLockName(ACCOUNT));
    const d = w.j.dockApplyLocked(ACCOUNT, drop(Y));
    expect(ids(shown())).toEqual([]);
    const p = w.j.dockApplyLocked(ACCOUNT, put({ ...Y, ph: 'sending' }));
    const rows = shown().filter((r) => r.k1 === Y.k1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ph).toBe('sending');
    const d2 = w.j.dockApplyLocked(ACCOUNT, drop(Y));
    expect(shown().filter((r) => r.k1 === Y.k1)).toHaveLength(0);
    release();
    await Promise.all([d, p, d2]);
  });
  it('a legacy Y in slot A and a journal-only Z of slot B share a k1: both are shown, and a queued drop of Y leaves Z', async () => {
    w = world();
    const Y = mk(5);
    seed([Y]);
    const Z = mk(5, { c: 'c0a7150000000000000000b2', s: null, t: null });
    expect(await w.j.put(HANDLE2, Z)).toBe('ok');
    expect(shown()).toHaveLength(2);
    const release = await hold(dockLockName(ACCOUNT));
    const d = w.j.dockApplyLocked(ACCOUNT, drop(Y));
    const during = shown();
    expect(during.map((r) => r.c)).toEqual([Z.c]);
    release();
    await d;
    expect(shown().map((r) => r.c)).toEqual([Z.c]);
  });
  it('the same full identity in the legacy list and in the journal is shown once, the legacy record winning', async () => {
    w = world();
    const Y = mk(5);
    seed([Y]);
    expect(await w.j.put(HANDLE, { ...Y, s: null, t: null })).toBe('ok');
    const rows = shown().filter((r) => r.k1 === Y.k1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.s).toBe(Y.s);
  });
});

describe('a journal removal that is still pending hides its journal-only row', () => {
  const only = (n: number, o: Partial<AskRecord> = {}) => mk(n, { s: null, t: null, ...o });
  it('both removals deferred, in both settle orders: Y is not shown; a refused journal removal shows it again', async () => {
    w = world();
    const Y = only(5);
    expect(await w.j.put(HANDLE, Y)).toBe('ok');
    const dockRel = await hold(dockLockName(ACCOUNT));
    const recsRel = await hold(recsLockName(ACCOUNT));
    const d = w.j.dockApplyLocked(ACCOUNT, drop(Y));
    const j = w.j.drop(HANDLE, REALM, null, Y.k1);
    expect(shown().filter((r) => r.k1 === Y.k1)).toHaveLength(0);
    dockRel();                                  // the dock drop settles first, the journal removal still waits
    await d;
    expect(shown().filter((r) => r.k1 === Y.k1), 'the dock drop settled first: Y came back').toHaveLength(0);
    recsRel();
    expect(await j).toBe(true);
    expect(shown().filter((r) => r.k1 === Y.k1)).toHaveLength(0);
  });
  it('the journal removal settling first, with the dock drop still queued', async () => {
    w = world();
    const Y = only(5);
    expect(await w.j.put(HANDLE, Y)).toBe('ok');
    const dockRel = await hold(dockLockName(ACCOUNT));
    const d = w.j.dockApplyLocked(ACCOUNT, drop(Y));
    expect(await w.j.drop(HANDLE, REALM, null, Y.k1)).toBe(true);
    expect(shown().filter((r) => r.k1 === Y.k1)).toHaveLength(0);
    dockRel();
    await d;
  });
  it('a removal of the journal record of another handle does not hide this handle\'s row (K1: the key has h)', async () => {
    w = world();
    const R = only(5);
    expect(await w.j.put(HANDLE, R)).toBe('ok');
    expect(await w.j.put(HANDLE2, only(5, { c: 'c0a7150000000000000000b2' }))).toBe('ok');
    const recsRel = await hold(recsLockName(ACCOUNT));
    const j = w.j.drop(HANDLE, REALM, null, R.k1);
    expect(shown().map((r) => r.c)).toEqual(['c0a7150000000000000000b2']);
    recsRel();
    await j;
  });
  it('a sessionful journal removal does not hide a sessionless row with the same h, r and k1 (K1: the key has s)', async () => {
    w = world();
    const R = only(5);
    expect(await w.j.put(HANDLE, R)).toBe('ok');
    const recsRel = await hold(recsLockName(ACCOUNT));
    const j = w.j.drop(HANDLE, REALM, 'sess-1', R.k1);
    expect(shown().filter((r) => r.k1 === R.k1)).toHaveLength(1);
    recsRel();
    await j;
  });
  it('a removal the store refuses lifts the hiding once it has settled: the row shows again', async () => {
    w = world();
    const R = only(5);
    expect(await w.j.put(HANDLE, R)).toBe('ok');
    const recsRel = await hold(recsLockName(ACCOUNT));
    w.fs.blockWrites(JOURNAL);
    const j = w.j.drop(HANDLE, REALM, null, R.k1);
    expect(shown().filter((r) => r.k1 === R.k1)).toHaveLength(0);
    recsRel();
    expect(await j).toBe(false);
    w.fs.clearFaults();
    expect(shown().filter((r) => r.k1 === R.k1)).toHaveLength(1);
  });
  it('a removal that throws lifts the hiding too (the entry leaves in finally)', async () => {
    w = world();
    const R = only(5);
    expect(await w.j.put(HANDLE, R)).toBe('ok');
    (navigator as any).locks = { request: () => Promise.reject(new Error('refused')) };
    const j = w.j.drop(HANDLE, REALM, null, R.k1);
    await j.catch(() => false);
    expect(shown().filter((r) => r.k1 === R.k1)).toHaveLength(1);
  });
  it('an account switch: A\'s pending removal does not hide B\'s journal-only row with the same h, r and k1', async () => {
    w = world();
    const R = only(5);
    expect(await w.j.put(HANDLE, R)).toBe('ok');
    showAccount(OTHER);
    expect(await w.j.put(HANDLE, R)).toBe('ok');
    showAccount(ACCOUNT);
    const recsRel = await hold(recsLockName(ACCOUNT));
    const j = w.j.drop(HANDLE, REALM, null, R.k1);
    showAccount(OTHER);
    const b = (w.j.dockRead(OTHER, { v: 1, a: {} }).a[OTHER] ?? []) as AskRecord[];
    expect(b.filter((r) => r.k1 === R.k1), 'B\'s row was hidden by A\'s pending removal').toHaveLength(1);
    recsRel();
    expect(await j).toBe(false);                                         // refused: the account at lock time is B
    expect((w.j.dockRead(OTHER, { v: 1, a: {} }).a[OTHER] ?? []).filter((r) => r.k1 === R.k1)).toHaveLength(1);
  });
});
