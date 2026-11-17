// Exact schedules of overlapping sends of one change:
//   A request still out across X→Y→X, its re-adopted copy freed by a warned Dismiss, a later request R2 of
//     the same change admitted: R1's answer must not make R2 look ended (sendsOut is per request).
//   R1's heartbeat must not overwrite R2's record (fenced by incarnation and nonce), so R1's late 'done' can
//     never delete R2's record.
//   A late outcome of a request whose record an account round trip re-adopted settles that copy in memory too.
//   A rollback write that throws after a removal that may have landed: 'unknown', never 'failed'.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, SENDING_HEARTBEAT_MS, setChangeStoreAdapter, type HoldRef, type StoredChange } from './change-store';
import { bump, setIdentity, snapshot } from './ctx';
import { boot, R1, settle } from './test/env';

const META = { base: 'lock:case-f3e.raw', target: null, realm: R1, by: 'q:case-f3e@case-f3e.raw' };
type Rec = StoredChange & { t: number };
type Outcome = 'done' | 'failed' | 'pending';
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const uid = (): string => String(snapshot().account);
const as = (id: string): void => { setIdentity({ id, banned: false }); bump('account'); };
const OTHER = 'someone-else';
const isC2 = (id: string): boolean => id.endsWith('\u0000c2');
const attemptsIn = (list: readonly StoredChange[], a: string): HoldRef[] => list.filter((r) => r.id.startsWith(ATTEMPT_PREFIX + a + '\u0001')).map((r) => ({ id: r.id, token: r.id }));
const forget = (shown: readonly HoldRef[]) => C.forgetAccountChanges(uid(), shown, { holdsIn: attemptsIn, drop: () => {} });
let ME = '';
/** A send of c2 whose outcome this test picks. */
function sendC2(): { going: Promise<{ outcome: string }>; answer: (o: Outcome) => void } {
  let open!: (v: { outcome: Outcome; idem?: string }) => void;
  const going = C.guarded('s', 'c2', () => new Promise<{ outcome: Outcome; idem?: string }>((r) => { open = r; }), META);
  return { going, answer: (o) => open(o === 'pending' ? { outcome: o, idem: 'K-' + Math.random() } : { outcome: o }) };
}
const tokenOfRec = (r: Rec | undefined): string => (r ? r.inc + '#' + r.nonce : '');
/** This tab's press while a request of c2 is still out here is BUSY and sends nothing (admission refuses a
 *  second request of a change while one is out), even after a warned Dismiss of its copy. */
async function pressIsBusy(): Promise<void> {
  let sent = 0;
  expect(await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'X' }; }, META)).toEqual({ outcome: 'not_sent', code: 'BUSY' });
  expect(sent).toBe(0);
}
/** R1 out across X→Y→X; its re-adopted copy freed by the page's warned Dismiss (the shown hold); this tab's press is
 *  BUSY while R1 is out, so R2 is admitted by another tab (a fresh runtime on the same storage) while R1's request,
 *  heartbeat and answer still run here. */
async function overlapping(): Promise<{ r1: ReturnType<typeof sendC2>; r2: ReturnType<typeof sendC2>; r1Token: string }> {
  const r1 = sendC2();
  await settle();
  const r1Token = tokenOfRec(raw().find((r) => isC2(r.id)));
  as(OTHER); await settle(); as(ME); await settle();
  expect(C.isPending('s', 'c2')).toBe(true); // the re-adopted copy of R1's record
  expect(C.isBusy('s', 'c2')).toBe(false);
  expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true })).toBe(true);
  await pressIsBusy();
  C.reloadChangesForTests(); // tab B
  const r2 = sendC2();
  await settle();
  const rec = raw().filter((r) => isC2(r.id));
  expect(rec).toHaveLength(1);
  expect(tokenOfRec(rec[0])).not.toBe(r1Token); // R2's own incarnation
  expect(C.isBusy('s', 'c2')).toBe(true);
  return { r1, r2, r1Token };
}

describe('an earlier request\'s answer never ends a later request of the same change', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  for (const o of ['done', 'failed', 'pending'] as const) {
    it(`request R1 answers ${o} while R2 is out: R2 stays flagged sending, a confirmed forget keeps it, no sibling send`, async () => {
      const { r1, r2 } = await overlapping();
      const r2Rec = raw().find((r) => isC2(r.id))!;
      r1.answer(o);
      await r1.going;
      for (let i = 0; i < 3; i++) await settle();
      expect(raw().map(tokenOfRec)).toEqual([tokenOfRec(r2Rec)]); // R1's outcome wrote nothing over R2's
      const shown = C.changeHoldRefs();
      expect(shown.map((h) => [isC2(h.id), h.sending === true])).toEqual([[true, true]]);
      expect(await forget(shown)).toBe('done');
      expect(raw().map(tokenOfRec)).toEqual([tokenOfRec(r2Rec)]);
      // Another runtime (a fresh tab) reads R2's record and refuses a second send.
      C.reloadChangesForTests();
      let sent = 0;
      expect((await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'X' }; }, META)).outcome).toBe('not_sent');
      expect(sent).toBe(0);
      r2.answer('pending');
      await r2.going;
    });
  }
});

describe('a request\'s own record only', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('request R2 answered (pending) while R1 is still out: R2\'s settled record is not a send out; shown and confirmed it goes; R1\'s late answer writes nothing', async () => {
    const { r1, r2 } = await overlapping();
    r2.answer('pending');
    await r2.going;
    for (let i = 0; i < 3; i++) await settle();
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => [isC2(h.id), h.sending === true])).toEqual([[true, false]]);
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
    r1.answer('pending');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    expect(raw()).toEqual([]);
  });
});

describe('an earlier request\'s heartbeat never overwrites a later request\'s record', () => {
  beforeEach(() => { vi.useFakeTimers({ now: 1_000_000, toFake: ['Date', 'setInterval', 'clearInterval'] }); boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { vi.useRealTimers(); setChangeStoreAdapter(null); });
  it('request R2 admitted 20 s after R1; R1\'s beat fires alone; R1 answers done: R2\'s record stays, refused elsewhere', async () => {
    const r1 = sendC2();
    await settle();
    as(OTHER); await settle(); as(ME); await settle();
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true })).toBe(true);
    await pressIsBusy();
    C.reloadChangesForTests(); // tab B admits R2
    vi.advanceTimersByTime(20_000); // the timer clock and Date move together: R2's beats run 20 s after R1's
    const r2 = sendC2();
    await settle();
    const r2Rec = raw().find((r) => isC2(r.id))!;
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS - 20_000); // R1's beat, not yet R2's
    for (let i = 0; i < 3; i++) await settle();
    expect(raw().map(tokenOfRec)).toEqual([tokenOfRec(r2Rec)]);
    r1.answer('done');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    expect(raw().map(tokenOfRec)).toEqual([tokenOfRec(r2Rec)]);
    C.reloadChangesForTests();
    let sent = 0;
    expect((await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'X' }; }, META)).outcome).toBe('not_sent');
    expect(sent).toBe(0);
    r2.answer('pending');
    await r2.going;
  });
  it('a replay of the same hold (same incarnation, another nonce) admitted after R1: R1\'s beat and late done leave it', async () => {
    await C.guarded('s', 'c2', async () => ({ outcome: 'pending' as const, idem: 'K0' }), META);
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true); // released keeping its key: the next send replays it
    const r1 = sendC2(); // R1: a replay of K0
    await settle();
    const r1Rec = raw().find((r) => isC2(r.id))!;
    expect(r1Rec.sending).toBeTruthy();
    as(OTHER); await settle(); as(ME); await settle();
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true })).toBe(true); // the warned Dismiss keeps the key
    await pressIsBusy();
    C.reloadChangesForTests(); // tab B replays it
    vi.advanceTimersByTime(20_000);
    const r2 = sendC2(); // R2: another replay of the same incarnation
    await settle();
    const r2Rec = raw().find((r) => isC2(r.id))!;
    expect([r2Rec.inc === r1Rec.inc, r2Rec.nonce === r1Rec.nonce]).toEqual([true, false]);
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS - 20_000); // R1's beat, not yet R2's
    for (let i = 0; i < 3; i++) await settle();
    expect(raw().map(tokenOfRec)).toEqual([tokenOfRec(r2Rec)]);
    r1.answer('done');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    expect(raw().map(tokenOfRec)).toEqual([tokenOfRec(r2Rec)]);
    r2.answer('pending');
    await r2.going;
  });
  it('R2\'s own beats still renew R2\'s record', async () => {
    const { r2 } = await overlapping();
    const before = raw().find((r) => isC2(r.id))!;
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS);
    for (let i = 0; i < 3; i++) await settle();
    const after = raw().find((r) => isC2(r.id))!;
    expect(tokenOfRec(after)).toBe(tokenOfRec(before));
    expect(after.sending!.at).toBeGreaterThan(before.sending!.at);
    r2.answer('pending');
    await r2.going;
  });
});

describe('a late outcome settles the re-adopted copy in this tab\'s memory too', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  for (const o of ['done', 'failed'] as const) {
    it(`request R1 out across X→Y→X answers ${o}: no record, not pending here, the next press is admitted`, async () => {
      const r1 = sendC2();
      await settle();
      as(OTHER); await settle(); as(ME); await settle();
      expect(C.isPending('s', 'c2')).toBe(true);
      r1.answer(o);
      await r1.going;
      for (let i = 0; i < 3; i++) await settle();
      expect(raw()).toEqual([]);
      expect(C.isPending('s', 'c2')).toBe(false);
      expect(C.changeHoldRefs()).toEqual([]);
      let sent = 0;
      expect((await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'NEW' }; }, META)).outcome).toBe('pending');
      expect(sent).toBe(1);
    });
  }
  it('request R1 out across X→Y→X answers pending: the copy is pending with the answer\'s key, the same hold', async () => {
    const r1 = sendC2();
    await settle();
    const token = tokenOfRec(raw().find((r) => isC2(r.id)));
    as(OTHER); await settle(); as(ME); await settle();
    r1.answer('pending');
    const res = await r1.going as { outcome: string; hold?: string };
    for (let i = 0; i < 3; i++) await settle();
    const rec = raw().find((r) => isC2(r.id))!;
    expect([rec.pending, tokenOfRec(rec), rec.sending]).toEqual([true, token, undefined]);
    expect(C.isPending('s', 'c2')).toBe(true);
    expect(C.holdOfLock('s', 'c2')).toBe(res.hold);
    // The copy in memory holds the answer's key (not storage).
    expect(C.heldChanges('case-f3e.raw').map((h) => h.key)).toEqual([rec.key]);
    // A release keeps it for the replay, never drops it.
    expect(await C.release('s', 'c2', res.hold!)).toBe(true);
    for (let i = 0; i < 3; i++) await settle();
    expect(raw().find((r) => isC2(r.id))?.key).toBe(rec.key);
  });
  it('a later request\'s lock is never settled by the earlier one\'s outcome', async () => {
    const { r1, r2 } = await overlapping();
    r1.answer('done');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    expect(C.isBusy('s', 'c2')).toBe(true);
    r2.answer('pending');
    await r2.going;
    await settle();
    expect(C.isPending('s', 'c2')).toBe(true);
  });
});

describe('a throwing rollback after a removal that may have landed', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  const plainRead = (): string | null => localStorage.getItem(CHANGE_STORE_KEY);
  const plainWrite = (t: string | null): boolean => { if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); return true; };
  it('removal lands, the read-back fails, the rollback write throws: unknown, and the shown hold leaves memory', async () => {
    await C.guarded('s', 'c1', async () => ({ outcome: 'pending' as const, idem: 'K1' }), META);
    const shown = C.changeHoldRefs();
    let writes = 0;
    setChangeStoreAdapter({
      read: () => { if (writes === 1) throw new Error('read failed'); return plainRead(); },
      write: (t) => { writes++; if (writes === 1) return plainWrite(t); throw new Error('rollback throws'); },
    });
    expect(await forget(shown)).toBe('unknown');
    setChangeStoreAdapter(null);
    expect(writes).toBe(2);
    expect(raw()).toEqual([]);
    expect(C.isPending('s', 'c1')).toBe(false);
  });
  it('the removal write itself throws but landed, proven by the read-back: done', async () => {
    await C.guarded('s', 'c1', async () => ({ outcome: 'pending' as const, idem: 'K1' }), META);
    const shown = C.changeHoldRefs();
    setChangeStoreAdapter({ read: plainRead, write: (t) => { plainWrite(t); throw new Error('throws after landing'); } });
    expect(await forget(shown)).toBe('done');
    setChangeStoreAdapter(null);
    expect(raw()).toEqual([]);
  });
  it('the removal write throws and did not land: the read-back finds every record, failed, memory kept', async () => {
    await C.guarded('s', 'c1', async () => ({ outcome: 'pending' as const, idem: 'K1' }), META);
    const shown = C.changeHoldRefs();
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    let writes = 0;
    setChangeStoreAdapter({ read: plainRead, write: (t) => { writes++; if (writes === 1) throw new Error('throws, nothing written'); return plainWrite(t); } });
    expect(await forget(shown)).toBe('failed');
    setChangeStoreAdapter(null);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    expect(C.isPending('s', 'c1')).toBe(true);
  });
});

// A hold the warning showed as not sending
// that is a send out by the lock turn (another tab's stale stamp renewed by its heartbeat: same id and token) was
// never shown as one, so the forget writes nothing ('changed'); the shell then warns again with it flagged.
describe('a shown hold that turned live before the forget', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  const stampC1 = (at: number): void => {
    const list = raw();
    localStorage.setItem(CHANGE_STORE_KEY, JSON.stringify(list.map((r) => (r.id.endsWith('\u0000c1') ? { ...r, pending: false, sending: { tab: 'other-tab', at } } : r))));
  };
  it('stale when shown, renewed (same token) before the lock turn: changed, nothing written', async () => {
    await C.guarded('s', 'c1', async () => ({ outcome: 'pending' as const, idem: 'K1' }), META);
    stampC1(1); // another tab's send of it, its stamp stale
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => h.sending === true)).toEqual([false]);
    stampC1(Date.now()); // that tab's heartbeat renews it: the same send, the same token
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    expect(await forget(shown)).toBe('changed');
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
    // Warned again with it flagged, the confirmed forget keeps it: done.
    const again = C.changeHoldRefs();
    expect(again.map((h) => h.sending === true)).toEqual([true]);
    expect(await forget(again)).toBe('done');
    expect(raw()).toHaveLength(1);
  });
  it('the reverse: shown live, gone stale since (its tab died): the shown hold, done, removed', async () => {
    await C.guarded('s', 'c1', async () => ({ outcome: 'pending' as const, idem: 'K1' }), META);
    stampC1(Date.now());
    const shown = C.changeHoldRefs();
    expect(shown.map((h) => h.sending === true)).toEqual([true]);
    stampC1(1);
    expect(await forget(shown)).toBe('done');
    expect(raw()).toEqual([]);
  });
});

// An outcome write that lands and then throws (an installed adapter) is read back,
// so the re-adopted copy still takes the outcome; settleCopy never touches a later request's busy lock
// queued behind the outcome write (the n6 guard is reachable).
describe('outcome writes that throw after landing; a later lock queued behind the outcome', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  const plainRead = (): string | null => localStorage.getItem(CHANGE_STORE_KEY);
  const landsThenThrows = (): void => setChangeStoreAdapter({ read: plainRead, write: (t) => { if (t === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, t); throw new Error('landed, then threw'); } });
  for (const o of ['done', 'failed'] as const) {
    it(`request R1 across X→Y→X answers ${o}, the deletion lands then throws: no record, not pending, the next press is admitted`, async () => {
      const r1 = sendC2();
      await settle();
      as(OTHER); await settle(); as(ME); await settle();
      expect(C.isPending('s', 'c2')).toBe(true);
      landsThenThrows();
      r1.answer(o);
      await r1.going;
      for (let i = 0; i < 3; i++) await settle();
      setChangeStoreAdapter(null);
      expect(raw()).toEqual([]);
      expect(C.isPending('s', 'c2')).toBe(false);
      let sent = 0;
      expect((await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'NEW' }; }, META)).outcome).toBe('pending');
      expect(sent).toBe(1);
    });
  }
  it('request R1 across X→Y→X answers pending, the write lands then throws: the copy holds the answer\'s key', async () => {
    const r1 = sendC2();
    await settle();
    as(OTHER); await settle(); as(ME); await settle();
    landsThenThrows();
    r1.answer('pending');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    setChangeStoreAdapter(null);
    const rec = raw().find((r) => isC2(r.id))!;
    expect([rec.pending, rec.sending]).toEqual([true, undefined]);
    expect(C.heldChanges('case-f3e.raw').map((h) => h.key)).toEqual([rec.key]);
  });
  it('request R1 across X→Y→X answers done, the deletion throws without landing: the record and the copy both stay (conservative)', async () => {
    const r1 = sendC2();
    await settle();
    as(OTHER); await settle(); as(ME); await settle();
    setChangeStoreAdapter({ read: plainRead, write: () => { throw new Error('threw, nothing written'); } });
    r1.answer('done');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    setChangeStoreAdapter(null);
    expect(raw().filter((r) => isC2(r.id))).toHaveLength(1);
    expect(C.isPending('s', 'c2')).toBe(true);
  });
  it('an admission write that lands then throws: read back, the send goes once; one that throws unlanded: refused unsent', async () => {
    landsThenThrows();
    let sent = 0;
    const res = await C.guarded('s', 'c3', async () => { sent++; return { outcome: 'pending' as const, idem: 'K3' }; }, META);
    setChangeStoreAdapter(null);
    expect([res.outcome, sent]).toEqual(['pending', 1]);
    await settle();
    setChangeStoreAdapter({ read: plainRead, write: () => { throw new Error('threw, nothing written'); } });
    const before = localStorage.getItem(CHANGE_STORE_KEY);
    const no = await C.guarded('s', 'c4', async () => { sent++; return { outcome: 'pending' as const, idem: 'K4' }; }, META);
    setChangeStoreAdapter(null);
    expect([no.outcome, (no as { code?: string }).code, sent]).toEqual(['not_sent', 'STORE_UNAVAILABLE', 1]);
    expect(localStorage.getItem(CHANGE_STORE_KEY)).toBe(before);
  });
  // The copy stays pending until its free is stored, so a press meanwhile is refused (READ_BACK_FIRST) and
  // nothing sends; once R1's outcome and the free have their turns (FIFO), the next press is admitted and sent once.
  it('R1\'s outcome queued behind the store lock, its copy dismissed and R2 pressed meanwhile: refused unsent; then admitted once', async () => {
    const r1 = sendC2();
    await settle();
    as(OTHER); await settle(); as(ME); await settle();
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    void navigator.locks.request('hub_changes', () => gate); // another tab holds the store lock
    await settle();
    r1.answer('done'); // R1's outcome write waits for the lock
    await r1.going;
    // The warned Dismiss of the shown copy waits for its lock turn too (judged and stored in one turn).
    const freeing = C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true });
    let sent = 0;
    expect(await C.guarded('s', 'c2', async () => { sent++; return { outcome: 'pending' as const, idem: 'X' }; }, META)).toEqual({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    expect(sent).toBe(0);
    open();
    expect(await freeing).toBe(false); // R1's done took the record and the copy first: this free had nothing left to hold
    for (let i = 0; i < 3; i++) await settle();
    expect(C.isPending('s', 'c2')).toBe(false);
    const r2 = sendC2();
    await settle();
    expect(C.isBusy('s', 'c2')).toBe(true);
    r2.answer('pending');
    await r2.going;
    await settle();
    expect(C.isPending('s', 'c2')).toBe(true);
    expect(raw().filter((r) => isC2(r.id)).map((r) => r.pending)).toEqual([true]);
  });
});

// A hold released (keeping its key) or dismissed while its
// request is still out behind a re-adopted copy stays released, whatever version its request's heartbeat moved the
// record to (deletions and releases match it by token); a read-back that began before a late pending
// answer never frees it.
describe('a copy released or dismissed while its request is out', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { vi.useRealTimers(); setChangeStoreAdapter(null); });
  /** A kept key K0, R1 replaying it and still out across X→Y→X, then the copy released keeping K0. */
  async function releasedCopy(): Promise<ReturnType<typeof sendC2>> {
    await C.guarded('s', 'c2', async () => ({ outcome: 'pending' as const, idem: 'K0' }), META);
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    const r1 = sendC2();
    await settle();
    as(OTHER); await settle(); as(ME); await settle();
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true })).toBe(true); // the warned Dismiss keeping the key
    await settle();
    expect(C.isPending('s', 'c2')).toBe(false);
    expect(raw().filter((r) => isC2(r.id)).map((r) => [r.pending, !!r.sending])).toEqual([[false, false]]);
    return r1;
  }
  for (const o of ['pending', 'failed'] as const) {
    it(`request R1 answers ${o} after its copy was released: the hold stays released (never pending again)`, async () => {
      const r1 = await releasedCopy();
      r1.answer(o);
      await r1.going;
      for (let i = 0; i < 3; i++) await settle();
      expect(C.isPending('s', 'c2')).toBe(false);
      expect(raw().filter((r) => isC2(r.id)).map((r) => r.pending)).toEqual([false]);
      expect(C.changeHoldRefs()).toEqual([]);
    });
  }
  it('request R1 answers done after its copy was released: record and spent key go; the next press is a new change (no key)', async () => {
    const r1 = await releasedCopy();
    r1.answer('done');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    expect(raw()).toEqual([]);
    const keys: (string | undefined)[] = [];
    expect((await C.guarded('s', 'c2', async (k?: string) => { keys.push(k); return { outcome: 'pending' as const, idem: 'NEW' }; }, META)).outcome).toBe('pending');
    expect(keys).toEqual([undefined]);
  });
  it('R1\'s heartbeat after X→Y→X, then the warned Dismiss of the copy: the record goes; the next press is admitted once', async () => {
    vi.useFakeTimers({ now: 2_000_000, toFake: ['Date', 'setInterval', 'clearInterval'] });
    boot({ realm: R1 }); ME = uid();
    const r1 = sendC2();
    await settle();
    as(OTHER); await settle(); as(ME); await settle();
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS); // R1's beat moves the record's version
    for (let i = 0; i < 3; i++) await settle();
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true })).toBe(true);
    for (let i = 0; i < 3; i++) await settle();
    expect(raw()).toEqual([]);
    await pressIsBusy();
    C.reloadChangesForTests(); // tab B admits R2
    const r2 = sendC2();
    await settle();
    expect(C.isBusy('s', 'c2')).toBe(true);
    r2.answer('pending');
    expect((await r2.going).outcome).toBe('pending');
    r1.answer('done');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    expect(raw().filter((r) => isC2(r.id)).map((r) => r.pending)).toEqual([true]); // R2's hold, untouched by R1
  });
  it('a read-back that began while R1 was out never frees the copy after R1\'s late pending answer', async () => {
    const r1 = sendC2();
    await settle();
    as(OTHER); await settle(); as(ME); await settle();
    const mark = C.pendingMark();
    const hold = C.holdOfLock('s', 'c2')!;
    r1.answer('pending');
    await r1.going;
    for (let i = 0; i < 3; i++) await settle();
    expect(await C.release('s', 'c2', hold,{ upTo: mark })).toBe(false);
    expect(C.isPending('s', 'c2')).toBe(true);
  });
});
