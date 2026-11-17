// The sign-out forget is bound to
// the holds the warning showed, in storage AND in memory.
//   - A hold admitted after the warning (a busy send among it) makes the forget write nothing ('changed'), also when
//     storage would let a removal land unproven; its record keeps refusing a second send after a fresh tab, a reload
//     and an account round trip (A→B→A).
//   - A change send still out keeps its stored record (live sending stamp), shown or not, on 'done' and on 'unknown':
//     a fresh tab, a reload or A→B→A never admits it again, and its answer still persists.
//   - Memory drops are scoped: the removed records and the shown holds only, never a busy lock, never another lock
//     of the account; the attempts side gets exactly the shown attempt ids.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { heldAttempts, holdAttempt } from './attempts';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, readChangesState, recordSendOut, setChangeStoreAdapter, type HoldRef, type StoredChange } from './change-store';
import { bump, setIdentity, snapshot } from './ctx';
import { boot, R1, settle, signIn } from './test/env';

const META = { base: 'lock:case-f3.raw', target: null, realm: R1, by: 'q:case-f3@case-f3.raw' };
const pendingWith = (idem: string) => async (replay: string | undefined) => ({ outcome: 'pending' as const, idem: replay ?? idem });
const reload = (): void => C.reloadChangesForTests();
type Rec = StoredChange & { t: number };
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const put = (list: readonly Rec[]): void => localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list));
const plainWrite = (t: string | null): boolean => { if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; };
const plainRead = (): string | null => localStorage.getItem(CHANGE_STORE_KEY);
const uid = (): string => String(snapshot().account);
const as = (id: string): void => { setIdentity({ id, banned: false }); bump('account'); };
const OTHER = 'someone-else';
const noDrop = (): void => {};
const attemptRefs = (): HoldRef[] => heldAttempts().map((h) => ({ id: h.id, token: h.id }));
/** The bed's attempts predicate (lifecycle.ts adapter): every stored attempt record of the account is a hold. */
const attemptsIn = (list: readonly StoredChange[], a: string, now: number): HoldRef[] => list.filter((r) => r.id.startsWith(ATTEMPT_PREFIX + a + '\u0001')).map((r) => (recordSendOut(r, now) ? { id: r.id, token: r.id, sending: true as const } : { id: r.id, token: r.id }));
const forget = (shown: readonly HoldRef[], drop: C.AttemptsForget['drop'] = noDrop) => C.forgetAccountChanges(uid(), shown, { holdsIn: attemptsIn, drop });

/** The removal lands, the read that should prove it fails, the rollback is refused: no verdict. Counts writes. */
function landsThenNoVerdict(): { writes: () => number } {
  let writes = 0;
  setChangeStoreAdapter({ read: () => { if (writes > 0 && writes < 3) throw new Error('read failed'); return plainRead(); }, write: (t) => (++writes === 1 ? plainWrite(t) : (writes = 3, false)) });
  return { writes: () => writes };
}
/** A send whose answer this test controls. */
function openSend(digest: string): { going: Promise<{ outcome: string }>; answer: (idem: string) => void } {
  let open!: (v: { outcome: 'pending'; idem: string }) => void;
  const going = C.guarded('s', digest, () => new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; }), META);
  return { going, answer: (idem) => open({ outcome: 'pending', idem }) };
}
/** Every way a fresh view of storage can try the same change again: this tab, a fresh tab, a reload, A→B→A. */
async function refusedEverywhere(digest: string): Promise<void> {
  let sent = 0;
  const press = () => C.guarded('s', digest, async () => { sent++; return { outcome: 'pending' as const, idem: 'AGAIN' }; }, META);
  expect((await press()).outcome).toBe('not_sent');
  reload(); // a fresh tab (new tab id, memory from storage)
  expect((await press()).outcome).toBe('not_sent');
  reload(); // a reload
  expect((await press()).outcome).toBe('not_sent');
  as(OTHER); await settle(); as(String(ME)); await settle(); // A→B→A
  expect((await press()).outcome).toBe('not_sent');
  expect(sent).toBe(0);
}
let ME = '';

describe('a hold admitted after the warning, with a removal that would land unproven', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('a busy send admitted after the warning: changed, nothing written; a second send is refused in every tab', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const shown = C.changeHoldRefs();
    expect(shown).toHaveLength(1);
    const late = openSend('c2'); // admitted after the warning was read
    await settle();
    expect(raw().find((r) => r.id.endsWith('\u0000c2'))?.sending).toBeTruthy();
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    const w = landsThenNoVerdict();
    expect(await forget(shown)).toBe('changed');
    expect(w.writes()).toBe(0);
    setChangeStoreAdapter(null);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    await refusedEverywhere('c2');
    late.answer('K2');
    expect((await late.going).outcome).toBe('pending');
  });
  it('an attempt admitted after the warning: changed, nothing written; the same lock stays HELD', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const shown = [...C.changeHoldRefs(), ...attemptRefs()];
    const att = await holdAttempt('case-f3:att', { by: 'case-f3:att', realm: R1 });
    expect(att.ok).toBe(true);
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    const w = landsThenNoVerdict();
    expect(await forget(shown)).toBe('changed');
    expect(w.writes()).toBe(0);
    setChangeStoreAdapter(null);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    expect(heldAttempts()).toHaveLength(1);
    expect(await holdAttempt('case-f3:att', { by: 'case-f3:att', realm: R1 })).toMatchObject({ ok: false, code: 'HELD' });
  });
});

describe('a change send still out keeps its stored record, on done and on unknown', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('shown busy send, done: the pending hold goes, the send keeps lock and record; refused in every tab; its answer persists', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const send = openSend('c2');
    await settle();
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => h.id.slice(-2)).sort()).toEqual(['c1', 'c2']);
    expect(await forget(shown)).toBe('done');
    expect(raw().map((r) => r.id.slice(-2))).toEqual(['c2']);
    expect(C.isPending('s', 'c1')).toBe(false);
    expect(C.isBusy('s', 'c2')).toBe(true);
    const sib = raw()[0]!;
    await refusedEverywhere('c2');
    expect(raw().map((r) => r.id)).toEqual([sib.id]);
    send.answer('K2');
    expect((await send.going).outcome).toBe('pending');
    await settle();
    expect(raw().find((r) => r.id === sib.id)?.pending).toBe(true); // the answer settled the kept record
  });
  it('shown busy send, the removal lands unproven (unknown): its record was never removed; refused in every tab', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const send = openSend('c2');
    await settle();
    const shown = C.changeHoldRefs();
    landsThenNoVerdict();
    expect(await forget(shown)).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(raw().map((r) => r.id.slice(-2))).toEqual(['c2']);
    expect(C.isBusy('s', 'c2')).toBe(true);
    await refusedEverywhere('c2');
    send.answer('K2');
    expect((await send.going).outcome).toBe('pending');
  });
  it('a sibling whose tab died mid-send (a stale stamp), shown: it goes like a pending hold', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const list = raw();
    put(list.map((r) => ({ ...r, pending: false, sending: { tab: 'dead-tab', at: 1 } })));
    const shown = C.changeHoldRefs();
    expect(shown).toHaveLength(1);
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
  });
});

describe('memory drops are scoped to the shown holds and the removed records', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  // A lock this tab still holds in memory that the warning did not show (storage lost its record and this tab has
  // not heard yet): the forget does not judge it and must not drop it either.
  const staleLock = async (): Promise<void> => {
    await C.guarded('s', 'c9', pendingWith('K9'), META);
    put(raw().filter((r) => !r.id.endsWith('\u0000c9'))); // no storage event: this tab keeps its copy
    expect(C.isPending('s', 'c9')).toBe(true);
  };
  it('done: the shown hold leaves memory; a lock the warning did not show stays', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    await staleLock();
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => h.id.slice(-2))).toEqual(['c1']);
    expect(await forget(shown)).toBe('done');
    expect(C.isPending('s', 'c1')).toBe(false);
    expect(C.isPending('s', 'c9')).toBe(true);
  });
  it('unknown: the shown hold leaves memory; a lock the warning did not show stays', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    await staleLock();
    const shown = C.changeHoldRefs();
    landsThenNoVerdict();
    expect(await forget(shown)).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(C.isPending('s', 'c1')).toBe(false);
    expect(C.isPending('s', 'c9')).toBe(true);
  });
  it('the attempts side drops exactly the shown attempt ids, on done and unknown, and nothing on changed or failed', async () => {
    const drop = vi.fn();
    // Answered attempts (sent()): only their holds remain, so the forget removes them (a request still out is kept).
    const a1 = await holdAttempt('case-f3:a1', { by: 'case-f3:a1', realm: R1 });
    expect(a1.ok).toBe(true);
    if (a1.ok) a1.hold.sent();
    await settle();
    const shownAtt = attemptRefs();
    expect(shownAtt).toHaveLength(1);
    // changed: a second attempt the warning did not show
    const a2 = await holdAttempt('case-f3:a2', { by: 'case-f3:a2', realm: R1 });
    expect(a2.ok).toBe(true);
    if (a2.ok) a2.hold.sent();
    await settle();
    expect(await forget(shownAtt, drop)).toBe('changed');
    // failed: unreadable store
    setChangeStoreAdapter({ read: () => { throw new Error('unreadable'); }, write: () => false });
    expect(await forget(attemptRefs(), drop)).toBe('failed');
    setChangeStoreAdapter(null);
    expect(drop).not.toHaveBeenCalled();
    // unknown, then done: drop gets exactly the shown attempt ids (a shown change hold is not an attempt id)
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const both = attemptRefs();
    expect(both).toHaveLength(2);
    const shownAll = [...C.changeHoldRefs(), ...both];
    expect(shownAll).toHaveLength(3);
    landsThenNoVerdict();
    expect(await forget(shownAll, drop)).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(drop).toHaveBeenLastCalledWith(ME, both.map((h) => h.id));
    const again = attemptRefs();
    expect(await forget([...C.changeHoldRefs(), ...again], drop)).toBe('done');
    expect(drop).toHaveBeenLastCalledWith(ME, again.map((h) => h.id));
    expect(drop).toHaveBeenCalledTimes(2);
  });
});

// HoldRef.sending names exactly what the forget keeps (one rule:
// recordSendOut, a live sending stamp); a stale stamp goes only because it was shown and confirmed.
describe('HoldRef.sending and the stale-stamp rule', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  /** c1's record as another tab's send of it: live (`at` now) or stale (its tab died). */
  const sibling = (at: number, digest = 'c1', token?: { inc: string; nonce: string }): void => {
    const r = raw().find((x) => x.id.endsWith('\u0000c1'))!;
    const twin = { ...r, id: r.id.slice(0, -2) + digest, pending: false, sending: { tab: 'other-tab', at }, ...(token ?? {}) };
    put([...raw().filter((x) => x.id !== twin.id), twin]);
  };
  it('a live send is flagged, a stale stamp and a pending hold are not; the flagged ids are exactly what done keeps', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    sibling(Date.now(), 'c2', { inc: 'i2', nonce: 'n2' });
    sibling(1, 'c3', { inc: 'i3', nonce: 'n3' });
    const send = openSend('c4');
    await settle();
    const shown = C.changeHoldRefs();
    const flags = Object.fromEntries(shown.map((h) => [h.id.slice(-2), h.sending === true]));
    expect(flags).toEqual({ c1: false, c2: true, c3: false, c4: true });
    expect(shown.find((h) => h.id.endsWith('c3'))).not.toHaveProperty('sending');
    expect(await forget(shown)).toBe('done');
    expect(raw().map((r) => r.id).sort()).toEqual(shown.filter((h) => h.sending).map((h) => h.id).sort());
    send.answer('K4');
    await send.going;
  });
  it('while storage cannot be read clean, the warning\'s memory view flags this tab\'s busy send and not a pending hold', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const send = openSend('c5');
    await settle();
    setChangeStoreAdapter({ read: () => { throw new Error('unreadable'); }, write: () => false });
    const flags = Object.fromEntries(C.changeHoldRefs().map((h) => [h.id.slice(-2), h.sending === true]));
    expect(flags).toEqual({ c1: false, c5: true });
    setChangeStoreAdapter(null);
    send.answer('K5');
    await send.going;
  });
  it('a stamp that went stale after the warning but was shown (and confirmed) goes: done', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    sibling(Date.now(), 'c2', { inc: 'i2', nonce: 'n2' });
    const shown = C.changeHoldRefs();
    expect(shown.find((h) => h.id.endsWith('c2'))?.sending).toBe(true);
    sibling(1, 'c2', { inc: 'i2', nonce: 'n2' }); // its tab died after the warning: the same send, the same token
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
  });
  it('a stamp that went stale after the warning and was not shown: changed, nothing written', async () => {
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => h.id.slice(-2))).toEqual(['c1']);
    sibling(Date.now(), 'c2', { inc: 'i2', nonce: 'n2' }); // admitted in another tab after the warning
    sibling(1, 'c2', { inc: 'i2', nonce: 'n2' }); // and its tab died
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await forget(shown)).toBe('changed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
  });
});

// A shown busy send, the removal lands and nothing proves it ('unknown'):
// its record is kept and keeps refusing whether storage heals before or after the send's answer.
describe('a shown busy send under landsThenNoVerdict, storage healing before or after it settles', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  for (const heal of ['before', 'after'] as const) {
    it(`storage heals ${heal} the answer: the kept record is pending afterwards and refused in every tab`, async () => {
      await C.guarded('s', 'c1', pendingWith('K1'), META);
      const send = openSend('c2');
      await settle();
      const shown = C.changeHoldRefs();
      expect(shown.find((h) => h.id.endsWith('c2'))?.sending).toBe(true);
      landsThenNoVerdict();
      expect(await forget(shown)).toBe('unknown');
      const kept = raw().find((r) => r.id.endsWith('\u0000c2'))!;
      expect(raw().map((r) => r.id)).toEqual([kept.id]);
      if (heal === 'before') setChangeStoreAdapter(null);
      send.answer('K2');
      expect((await send.going).outcome).toBe('pending');
      await settle();
      if (heal === 'after') { setChangeStoreAdapter(null); for (let i = 0; i < 3; i++) { window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY })); await settle(); } }
      expect(C.isPending('s', 'c2')).toBe(true);
      await refusedEverywhere('c2');
      const now = raw().find((r) => r.id === kept.id)!;
      expect([now.inc, now.nonce]).toEqual([kept.inc, kept.nonce]);
      if (heal === 'before') expect(now.pending).toBe(true); // the answer was written
      // Healed only after the answer: that write was refused, so the record still carries the send's stamp, which
      // every reader takes as a send out (live) or as pending (stale: adopt). It is never removed or lost.
      else {
        expect(now.pending || !!now.sending).toBe(true);
        // Its stamp going stale (this tab gone, time passed): still a hold, read as pending everywhere.
        put(raw().map((r) => (r.id === kept.id && r.sending ? { ...r, sending: { ...r.sending, tab: 'gone-tab', at: 1 } } : r)));
        await refusedEverywhere('c2');
        expect(C.isPending('s', 'c2')).toBe(true);
      }
    });
  }
});

// An attempt's live stamp is its request still out (holdAttempt stamps it at
// admission, the beat renews it, sent() clears it). The keep and HoldRef.sending cover attempts through the same
// predicate (change-store recordSendOut); removing a shown live attempt would let a fresh tab, a reload or A→B→A send
// it again. Attempt mirrors of the change-send keep tests.
describe('a shown attempt whose request is still out keeps its record', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  const LOCK = 'case-f3c:att';
  const attempt = () => holdAttempt(LOCK, { by: LOCK, realm: R1 });
  /** The stored attempt holds of this account, as the attempts side reports them (flags by recordSendOut). */
  const storedAttemptRefs = (): HoldRef[] => { const rd = readChangesState(); return rd.state === 'clean' ? attemptsIn(rd.list, ME, Date.now()) : []; };
  async function heldEverywhere(): Promise<void> {
    expect(await attempt()).toMatchObject({ ok: false, code: 'HELD' });
    reload();
    expect(await attempt()).toMatchObject({ ok: false, code: 'HELD' });
    reload();
    expect(await attempt()).toMatchObject({ ok: false, code: 'HELD' });
    as(OTHER); await settle(); as(String(ME)); await settle();
    expect(await attempt()).toMatchObject({ ok: false, code: 'HELD' });
  }
  it('done: the live attempt is flagged sending, keeps its record and stays HELD in every tab; drop is not given it', async () => {
    const drop = vi.fn();
    const a = await attempt();
    expect(a.ok).toBe(true);
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const att = storedAttemptRefs();
    expect(att.map((h) => h.sending)).toEqual([true]);
    const shown = [...C.changeHoldRefs(), ...att];
    expect(await forget(shown, drop)).toBe('done');
    expect(raw().map((r) => r.id)).toEqual(att.map((h) => h.id)); // the change hold went, the request out stayed
    expect(drop).toHaveBeenLastCalledWith(ME, []);
    await heldEverywhere();
    if (a.ok) a.hold.sent();
  });
  it('unknown (the removal lands unproven): the live attempt\'s record was never removed; HELD in every tab', async () => {
    const a = await attempt();
    expect(a.ok).toBe(true);
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const shown = [...C.changeHoldRefs(), ...storedAttemptRefs()];
    landsThenNoVerdict();
    expect(await forget(shown)).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(raw().map((r) => r.id.startsWith(ATTEMPT_PREFIX))).toEqual([true]);
    await heldEverywhere();
    if (a.ok) a.hold.sent();
  });
  it('answered (sent()): no flag, and the forget removes it and drops it', async () => {
    const drop = vi.fn();
    const a = await attempt();
    if (a.ok) a.hold.sent();
    await settle();
    const att = storedAttemptRefs();
    expect(att).toHaveLength(1);
    expect(att[0]).not.toHaveProperty('sending');
    expect(await forget(att, drop)).toBe('done');
    expect(raw()).toEqual([]);
    expect(drop).toHaveBeenLastCalledWith(ME, att.map((h) => h.id));
    expect((await attempt()).ok).toBe(true);
  });
  it('a stale attempt stamp: shown, it goes; not shown (admitted and gone stale after the warning), changed', async () => {
    const a = await attempt();
    expect(a.ok).toBe(true);
    const stale = () => put(raw().map((r) => (r.id.startsWith(ATTEMPT_PREFIX) && r.sending ? { ...r, sending: { tab: 'dead-tab', at: 1 } } : r)));
    // not shown: the warning came before it
    await C.guarded('s', 'c1', pendingWith('K1'), META);
    const before = C.changeHoldRefs();
    stale();
    const bytes = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await forget(before)).toBe('changed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(bytes);
    // shown while stale: no flag, removed
    const att = storedAttemptRefs();
    expect(att[0]).not.toHaveProperty('sending');
    expect(await forget([...C.changeHoldRefs(), ...att])).toBe('done');
    expect(raw()).toEqual([]);
  });
});

// A sender whose heartbeat stalls past SENDING_STALE_MS is still out. The tab running it
// flags and keeps it; another runtime judges it stale and a confirmed forget there removes it; the send's late answer
// then writes nothing back (persist fences an outcome against a removed record), after account teardown too.
describe('a stalled heartbeat never lets a late answer undo a confirmed removal', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  const stall = (pred: (id: string) => boolean): void => put(raw().map((r) => (pred(r.id) && r.sending ? { ...r, sending: { ...r.sending, at: 1 } } : r)));
  const isC2 = (id: string): boolean => id.endsWith('\u0000c2');
  it('the tab running the send flags and keeps it although its stamp aged out', async () => {
    const send = openSend('c2');
    await settle();
    stall(isC2);
    const shown = C.changeHoldRefs();
    expect(shown.find((h) => isC2(h.id))?.sending).toBe(true);
    expect(await forget(shown)).toBe('done');
    expect(raw().map((r) => isC2(r.id))).toEqual([true]);
    send.answer('K2');
    expect((await send.going).outcome).toBe('pending');
    await settle();
    expect(raw().find((r) => isC2(r.id))?.pending).toBe(true);
  });
  it('another runtime removes it (shown, confirmed); both runtimes tear down; the late pending answer leaves 0 records', async () => {
    const send = openSend('c2'); // runtime A: the request stays out
    await settle();
    stall(isC2); // A's heartbeat stalls past the threshold
    reload(); // runtime B: runs no send
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => [isC2(h.id), h.sending === true])).toEqual([[true, false]]);
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
    as(OTHER); await settle(); as(String(ME)); await settle(); // account teardown in this runtime (A's registry is gone too)
    send.answer('K2'); // A's late answer
    expect((await send.going).outcome).toBe('pending');
    for (let i = 0; i < 3; i++) await settle();
    expect(raw()).toEqual([]);
    reload(); // a fresh runtime
    expect(C.changeHoldRefs()).toEqual([]);
    let sent = 0;
    expect((await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'NEW' }; }, META)).outcome).toBe('pending');
    expect(sent).toBe(1);
  });
  it('attempt mirror: a removed stalled attempt\'s late answer (sent()) writes nothing back', async () => {
    const a = await holdAttempt('case-f3c:late', { by: 'case-f3c:late', realm: R1 });
    expect(a.ok).toBe(true);
    stall((id) => id.startsWith(ATTEMPT_PREFIX));
    reload();
    const rd = readChangesState();
    const att = rd.state === 'clean' ? attemptsIn(rd.list, ME, Date.now()) : [];
    expect(att.map((h) => h.sending === true)).toEqual([false]);
    expect(await forget(att)).toBe('done');
    expect(raw()).toEqual([]);
    if (a.ok) a.hold.sent();
    for (let i = 0; i < 3; i++) await settle();
    expect(raw()).toEqual([]);
  });
});

// A send's own outcome settles the record its admission stored, whoever is shown when it
// answers (a send a confirmed sign-out kept, a send still out across A→B), and only while that record is still this
// send's incarnation. Before, the owner guard dropped the write, and the kept record stayed a stuck pending hold.
describe('a kept or switched-away send settles its own record, and only its own incarnation', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  type Outcome = 'done' | 'failed' | 'pending';
  const isC2 = (id: string): boolean => id.endsWith('\u0000c2');
  /** A send of c2 whose outcome this test picks. */
  function sendC2(): { going: Promise<{ outcome: string }>; answer: (o: Outcome) => void } {
    let open!: (v: { outcome: Outcome; idem?: string }) => void;
    const going = C.guarded('s', 'c2', () => new Promise<{ outcome: Outcome; idem?: string }>((r) => { open = r; }), META);
    return { going, answer: (o) => open(o === 'pending' ? { outcome: o, idem: 'K2' } : { outcome: o }) };
  }
  // A sign-out: the session leaves storage and nothing is shown (ctx's account falls back to the stored session).
  const signOut = (): void => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); setIdentity(null); bump('signout'); };
  const back = async (): Promise<void> => { signIn(ME); as(String(ME)); await settle(); };
  async function settled(o: Outcome, kept: Rec): Promise<void> {
    for (let i = 0; i < 3; i++) await settle();
    const now = raw().filter((r) => isC2(r.id));
    if (o === 'pending') {
      expect(now).toHaveLength(1);
      expect([now[0]!.pending, now[0]!.inc, now[0]!.nonce, now[0]!.sending]).toEqual([true, kept.inc, kept.nonce, undefined]);
      await back();
      await refusedEverywhere('c2');
    } else {
      expect(now).toEqual([]); // the hold settled: no stuck pending record
      await back();
      reload();
      expect(C.changeHoldRefs().filter((h) => isC2(h.id))).toEqual([]);
      let sent = 0;
      expect((await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'NEW' }; }, META)).outcome).toBe('pending');
      expect(sent).toBe(1);
    }
  }
  for (const leave of ['sign-out', 'A→B'] as const) {
    for (const o of ['done', 'failed', 'pending'] as const) {
      it(`kept by a confirmed forget, the shown account then left (${leave}): answer ${o} settles the kept record`, async () => {
        await C.guarded('s', 'c1', pendingWith('K1'), META);
        const send = sendC2();
        await settle();
        expect(await forget(C.changeHoldRefs())).toBe('done');
        const kept = raw().find((r) => isC2(r.id))!;
        expect(raw().map((r) => r.id)).toEqual([kept.id]);
        if (leave === 'sign-out') signOut(); else as(OTHER);
        await settle();
        expect(snapshot().account).toBe(leave === 'sign-out' ? null : OTHER);
        send.answer(o);
        expect((await send.going).outcome).toBe(o);
        await settled(o, kept);
      });
    }
  }
  for (const o of ['done', 'failed', 'pending'] as const) {
    it(`no forget, A→B while the send is out: answer ${o} settles its record`, async () => {
      const send = sendC2();
      await settle();
      const kept = raw().find((r) => isC2(r.id))!;
      as(OTHER); await settle();
      send.answer(o);
      expect((await send.going).outcome).toBe(o);
      await settled(o, kept);
    });
  }
  for (const o of ['done', 'failed', 'pending'] as const) {
    it(`another incarnation stored under the id while the send is out (shown or away): answer ${o} writes nothing`, async () => {
      const send = sendC2();
      await settle();
      as(OTHER); await settle();
      // Another tab proved this send, removed it and sent the change again: a later incarnation's pending hold.
      const { sending: _stamp, ...was } = raw().find((r) => isC2(r.id))!;
      void _stamp;
      put([{ ...was, inc: 'later-inc', nonce: 'later-nonce', pending: true, key: 'KL' }]);
      const bytes = localStorage.getItem(CHANGE_STORE_KEY);
      send.answer(o);
      await send.going;
      for (let i = 0; i < 3; i++) await settle();
      expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(bytes);
    });
  }
  it('the same incarnation replayed (another nonce) while the send is out: the late answer writes nothing', async () => {
    const send = sendC2();
    await settle();
    as(OTHER); await settle();
    const replayed = { ...raw().find((r) => isC2(r.id))!, nonce: 'replay-nonce', pending: true };
    put([replayed]);
    const bytes = localStorage.getItem(CHANGE_STORE_KEY);
    send.answer('done');
    await send.going;
    for (let i = 0; i < 3; i++) await settle();
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(bytes);
  });
  // A stamp this tab wrote for a send that has ended here (its
  // answer's write was refused) is not a send out; shown and confirmed, it goes like a stale stamp, never stuck kept.
  it('this tab\'s fresh stamp of a send that already answered is not flagged; shown and confirmed, it goes', async () => {
    const send = sendC2();
    await settle();
    setChangeStoreAdapter({ read: plainRead, write: () => false }); // the answer's write is refused
    send.answer('done');
    await send.going;
    for (let i = 0; i < 3; i++) await settle();
    setChangeStoreAdapter(null);
    const left = raw().find((r) => isC2(r.id))!;
    expect(recordSendOut(left, Date.now())).toBe(true); // by its age alone it would read as live
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => [isC2(h.id), h.sending === true])).toEqual([[true, false]]);
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
  });
  it('a send still out across A→B→A (the registry was cleared) stays flagged and kept; its answer settles it', async () => {
    const send = sendC2();
    await settle();
    as(OTHER); await settle(); as(String(ME)); await settle(); // the account bump cleared this tab's registry
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => [isC2(h.id), h.sending === true])).toEqual([[true, true]]);
    expect(await forget(shown)).toBe('done');
    const kept = raw().find((r) => isC2(r.id))!;
    expect(kept).toBeTruthy();
    await refusedEverywhere('c2');
    send.answer('pending');
    expect((await send.going).outcome).toBe('pending');
    for (let i = 0; i < 3; i++) await settle();
    expect(raw().find((r) => r.id === kept.id)?.pending).toBe(true);
  });
  it('another tab\'s fresh stamp stays flagged and kept (the age rule still governs other tabs)', async () => {
    const send = sendC2();
    await settle();
    reload(); // another runtime: the stamp is another tab's, fresh
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => h.sending === true)).toEqual([true]);
    expect(await forget(shown)).toBe('done');
    expect(raw().map((r) => isC2(r.id))).toEqual([true]);
    send.answer('pending');
    await send.going;
  });
});
