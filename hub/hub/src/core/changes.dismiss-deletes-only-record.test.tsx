// Exact schedules of sends, deletions and releases across tabs.
// A deletion or a release keeping the key touches only the record of the send it names (incarnation and nonce),
// whatever version that record is at now; a send's own late pending answer never writes back a hold dismissed or
// released meanwhile (here, queued behind it, or in another tab); a gone record is never written back, and this
// tab's lock follows storage when the answer cannot land.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, SENDING_HEARTBEAT_MS, setChangeStoreAdapter, writeChanges, type HoldRef, type StoredChange } from './change-store';
import { bump, setIdentity, snapshot } from './ctx';
import { boot, R1, settle } from './test/env';

const META = { base: 'lock:case-f3g.raw', target: null, realm: R1, by: 'q:case-f3g@case-f3g.raw' };
type Rec = StoredChange & { t: number };
type Outcome = 'done' | 'failed' | 'pending';
const raw = (): Rec[] => JSON.parse(localStorage.getItem(CHANGE_STORE_KEY) || '[]') as Rec[];
const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
const uid = (): string => String(snapshot().account);
const as = (id: string): void => { setIdentity({ id, banned: false }); bump('account'); };
const OTHER = 'someone-else';
const isC2 = (id: string): boolean => id.endsWith('\u0000c2');
const c2 = (): Rec[] => raw().filter((r) => isC2(r.id));
const spins = async (): Promise<void> => { for (let i = 0; i < 3; i++) await settle(); };
const attemptsIn = (list: readonly StoredChange[], a: string): HoldRef[] => list.filter((r) => r.id.startsWith(ATTEMPT_PREFIX + a + '\u0001')).map((r) => ({ id: r.id, token: r.id }));
let ME = '';
/** A send of c2 whose outcome this test picks (firstKey: the key a first send carries). */
function sendC2(firstKey?: string): { going: Promise<{ outcome: string }>; answer: (o: Outcome, idem?: string) => void } {
  let open!: (v: { outcome: Outcome; idem?: string }) => void;
  const going = C.guarded('s', 'c2', () => new Promise<{ outcome: Outcome; idem?: string }>((r) => { open = r; }), META, firstKey === undefined ? undefined : 'b', firstKey);
  return { going, answer: (o, idem) => open(o === 'pending' ? { outcome: o, idem: idem ?? 'K-' + Math.random() } : { outcome: o }) };
}
/** One press that answers pending with `idem`; how many times it sent and which key it carried. */
async function pressOnce(idem = 'N'): Promise<{ outcome: string; code?: string; sent: number; keys: (string | undefined)[] }> {
  const keys: (string | undefined)[] = [];
  const res = await C.guarded('s', 'c2', async (k?: string) => { keys.push(k); return { outcome: 'pending' as const, idem }; }, META) as { outcome: string; code?: string };
  return { outcome: res.outcome, code: res.code, sent: keys.length, keys };
}
/** Another tab holds the store lock until open() is called. */
async function storeLockHeld(): Promise<() => void> {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  void navigator.locks.request('hub_changes', () => gate);
  await settle();
  return open;
}
/** R1 out across X→Y→X: this tab's registry holds a non-busy re-adopted copy of it. */
async function roundTrip(firstKey?: string): Promise<ReturnType<typeof sendC2>> {
  const r1 = sendC2(firstKey);
  await settle();
  as(OTHER); await settle(); as(ME); await settle();
  expect(C.isPending('s', 'c2')).toBe(true);
  expect(C.isBusy('s', 'c2')).toBe(false);
  return r1;
}

describe('a Dismiss deletes only the record of the send it names', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('another tab removed R1 and admitted R2 at the same version; this tab dismisses the shown R1: R2 stays, a fresh runtime is refused', async () => {
    expect((await pressOnce('K1')).outcome).toBe('pending');
    const r1 = c2()[0]!;
    const hold = C.holdOfLock('s', 'c2')!;
    writeChanges([]); // tab B proved R1 and removed it ...
    writeChanges([{ ...r1, inc: 'incB', nonce: 'nB', key: 'KB', pending: false, sending: { tab: 'tabB', at: Date.now() }, t: r1.t }]); // ... and admitted R2 in the same millisecond
    // The stored record is another send's, so the free is refused and this tab's memory is left to the merge.
    expect(await C.discard('s', 'c2', hold)).toBe(false); // before the storage event: the shown R1
    expect(await C.release('s', 'c2', hold, { warned: true })).toBe(false); // the warned Dismiss too
    await spins();
    expect(c2().map((r) => r.inc)).toEqual(['incB']);
    C.reloadChangesForTests();
    expect(await pressOnce()).toMatchObject({ outcome: 'not_sent', sent: 0 });
  });
});

// A free waits for its store-lock turn (FIFO behind the queued beat), and the copy stays pending until that
// turn stores it. While R1 is out here, only the warned Dismiss frees the copy (discard and complete are proofs, and a
// proof never frees a change whose request is still out in this tab), and a press stays BUSY until R1 answers.
describe('a heartbeat queued before the Dismiss never defeats it', () => {
  beforeEach(() => { vi.useFakeTimers({ now: 3_000_000, toFake: ['Date', 'setInterval', 'clearInterval'] }); boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { vi.useRealTimers(); });
  it('R1\'s beat waits for the store lock, then the copy\'s warned Dismiss: the record goes; BUSY while R1 is out; its late pending writes nothing back', async () => {
    const r1 = await roundTrip();
    const open = await storeLockHeld();
    vi.advanceTimersByTime(SENDING_HEARTBEAT_MS); // the beat queues behind the held lock
    await settle();
    const freeing = C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true }); // queues after the beat
    expect(await pressOnce('K2')).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', sent: 0 }); // the copy is pending until the free is stored
    open();
    expect(await freeing).toBe(true);
    await spins();
    expect(c2()).toEqual([]);
    expect(C.isPending('s', 'c2')).toBe(false);
    r1.answer('pending');
    await r1.going;
    await spins();
    expect(c2()).toEqual([]); // a removed record never comes back
    expect(await pressOnce('K9')).toMatchObject({ outcome: 'pending', sent: 1, keys: [undefined] });
  });
  for (const how of ['discard', 'complete'] as const) {
    it(`R1's beat waits for the store lock, then the copy's ${how} while R1 is out: refused, the record and the copy stay`, async () => {
      const r1 = await roundTrip();
      const open = await storeLockHeld();
      vi.advanceTimersByTime(SENDING_HEARTBEAT_MS);
      await settle();
      const freeing = C[how]('s', 'c2', C.holdOfLock('s', 'c2')!);
      open();
      expect(await freeing).toBe(false);
      await spins();
      expect(c2()).toHaveLength(1);
      expect(C.isPending('s', 'c2')).toBe(true);
      r1.answer('done');
      await r1.going;
      await spins();
      expect(c2()).toEqual([]);
      expect(await pressOnce('K9')).toMatchObject({ outcome: 'pending', sent: 1 });
    });
  }
});

describe('R1\'s pending answer queued, then the copy dismissed, completed or released', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  // R1's pending answer is stored first (FIFO) under a new outcome nonce, so a proof taken from the copy's
  // hold read before that answer is refused ('unresolved'): the page reads again. The copy follows the answer.
  for (const how of ['discard', 'complete', 'release'] as const) {
    it(`queued pending answer, then the copy's ${how}: refused (the answer came after the hold was read); pending with the answer's key`, async () => {
      const r1 = await roundTrip();
      const open = await storeLockHeld();
      r1.answer('pending', 'K1'); // its write waits for the lock
      await r1.going;
      const freeing = C[how]('s', 'c2', C.holdOfLock('s', 'c2')!);
      open();
      expect(await freeing).toBe(false);
      await spins();
      expect(c2().map((r) => [r.pending, r.key])).toEqual([[true, 'K1']]);
      expect(C.isPending('s', 'c2')).toBe(true);
      expect(await pressOnce()).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', sent: 0 });
    });
  }
  it('queued pending answer, the copy\'s warned Dismiss and a press meanwhile: refused unsent until the free is stored; then the press replays K1 once', async () => {
    const r1 = await roundTrip();
    const open = await storeLockHeld();
    r1.answer('pending', 'K1');
    await r1.going;
    const freeing = C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true });
    expect(await pressOnce('K2')).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', sent: 0 });
    open();
    expect(await freeing).toBe(true);
    await spins();
    expect(c2().map((r) => [r.pending, r.key])).toEqual([[false, 'K1']]); // released keeping the answer's key
    expect(await pressOnce('K2')).toMatchObject({ outcome: 'pending', sent: 1, keys: ['K1'] });
  });
  it('queued pending answer, then the copy\'s warned Dismiss keeping its key: the hold stays released in storage and memory', async () => {
    await C.guarded('s', 'c2', async () => ({ outcome: 'pending' as const, idem: 'K0' }), META);
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    await spins();
    const r1 = await roundTrip(); // a replay of K0
    const open = await storeLockHeld();
    r1.answer('pending', 'K0');
    await r1.going;
    const freeing = C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true });
    open();
    expect(await freeing).toBe(true);
    await spins();
    expect(C.isPending('s', 'c2')).toBe(false);
    expect(c2().map((r) => [r.pending, r.key])).toEqual([[false, 'K0']]);
    expect(C.changeHoldRefs()).toEqual([]);
  });
});

describe('a storage event between a Dismiss and its stored deletion', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('the copy dismissed while the store lock is held; another tab\'s write meanwhile: the copy stays pending until the deletion runs, then record and copy both go', async () => {
    const r1 = await roundTrip();
    const open = await storeLockHeld();
    const freeing = C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true });
    expect(C.isPending('s', 'c2')).toBe(true); // memory moves only with the stored free
    announce(); // another tab wrote (anything): the merge keeps the still stored record
    expect(C.isPending('s', 'c2')).toBe(true);
    open();
    expect(await freeing).toBe(true);
    await spins();
    expect(c2()).toEqual([]);
    expect(C.isPending('s', 'c2')).toBe(false);
    expect(await pressOnce()).toMatchObject({ outcome: 'not_sent', code: 'BUSY', sent: 0 }); // R1 is still out here
    r1.answer('done');
    await r1.going;
    expect(await pressOnce()).toMatchObject({ outcome: 'pending', sent: 1, keys: [undefined] });
  });
});

describe('a release never writes back a record another tab removed', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('removed in another tab, released here before the storage event: storage stays empty, the next press carries no spent key', async () => {
    expect((await pressOnce('K')).outcome).toBe('pending');
    const hold = C.holdOfLock('s', 'c2')!;
    writeChanges([]);
    expect(await C.release('s', 'c2', hold)).toBe(true);
    await spins();
    expect(raw()).toEqual([]);
    expect(await pressOnce()).toMatchObject({ outcome: 'pending', sent: 1, keys: [undefined] });
  });
});

describe('an answer that cannot land leaves no phantom pending lock', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('released keeping its key in another tab (a stale stamp adopted there) while R1 is out: R1\'s pending answer leaves this tab released too', async () => {
    const r1 = sendC2();
    await settle();
    const rec = c2()[0]!;
    writeChanges([{ ...rec, sending: undefined, pending: false, key: 'K', t: rec.t + 5 }]);
    announce(); // this tab's lock is busy: the merge leaves it
    r1.answer('pending', 'K');
    await r1.going;
    await spins();
    expect(c2().map((r) => r.pending)).toEqual([false]);
    expect(C.isPending('s', 'c2')).toBe(false);
    expect(C.changeHoldRefs()).toEqual([]);
    expect(await pressOnce('K')).toMatchObject({ outcome: 'pending', sent: 1, keys: ['K'] });
  });
  it('removed in another tab while R1 is out: R1\'s pending answer writes nothing and this tab holds nothing; the next press is admitted', async () => {
    const r1 = sendC2();
    await settle();
    writeChanges([]);
    announce();
    r1.answer('pending', 'K');
    await r1.going;
    await spins();
    expect(raw()).toEqual([]);
    expect(C.isPending('s', 'c2')).toBe(false);
    expect(await pressOnce()).toMatchObject({ outcome: 'pending', sent: 1, keys: [undefined] });
  });
});

describe('a press queued behind a forget keeps its busy lock', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('a released kept-key record, a confirmed forget queued, then a press of it: busy while out, pending after its answer', async () => {
    expect((await pressOnce('K0')).outcome).toBe('pending');
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    await spins();
    const open = await storeLockHeld();
    const fg = C.forgetAccountChanges(uid(), C.changeHoldRefs(), { holdsIn: attemptsIn, drop: () => {} });
    const r2 = sendC2();
    expect(C.isBusy('s', 'c2')).toBe(true);
    open();
    await fg;
    await spins();
    expect(C.isBusy('s', 'c2')).toBe(true);
    r2.answer('pending', 'K2');
    expect((await r2.going).outcome).toBe('pending');
    await settle();
    expect(C.isPending('s', 'c2')).toBe(true);
    expect(c2().map((r) => r.pending)).toEqual([true]);
  });
});

describe('a first send whose copy was released answers failed', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('first send with its own key K0 across X→Y→X, the copy released keeping K0, then a definite failed: record and K0 go', async () => {
    const r1 = await roundTrip('K0');
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true })).toBe(true); // R1 is out: only the warned Dismiss frees
    await spins();
    expect(c2().map((r) => [r.pending, r.key, !!r.sending])).toEqual([[false, 'K0', false]]);
    r1.answer('failed');
    await r1.going;
    await spins();
    expect(raw()).toEqual([]);
    expect(await pressOnce()).toMatchObject({ outcome: 'pending', sent: 1, keys: [undefined] });
  });
});
