// Change-store release, replay and admission: a release persists an immutable
// token-scoped snapshot and never reaches the version writer; the own outcome on a token mismatch follows storage;
// admission adopts another send at the same version and drops a spent key when a clean read finds the record gone;
// a legacy replay gets a full identity; tombs are kept only for tokenless drops. Harness from changes.dismiss-deletes-only-record.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { ATTEMPT_PREFIX, CHANGE_STORE_KEY, SENDING_HEARTBEAT_MS, setChangeStoreAdapter, writeChanges, type HoldRef, type StoredChange } from './change-store';
import { bump, setIdentity, snapshot } from './ctx';
import { boot, R1, settle } from './test/env';

const META = { base: 'lock:case-f3h.raw', target: null, realm: R1, by: 'q:case-f3h@case-f3h.raw' };
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
function sendC2(firstKey?: string): { going: Promise<{ outcome: string }>; answer: (o: Outcome, idem?: string) => void } {
  let open!: (v: { outcome: Outcome; idem?: string }) => void;
  const going = C.guarded('s', 'c2', () => new Promise<{ outcome: Outcome; idem?: string }>((r) => { open = r; }), META, firstKey === undefined ? undefined : 'b', firstKey);
  return { going, answer: (o, idem) => open(o === 'pending' ? { outcome: o, idem: idem ?? 'K-' + Math.random() } : { outcome: o }) };
}
async function pressOnce(idem = 'N'): Promise<{ outcome: string; code?: string; sent: number; keys: (string | undefined)[] }> {
  const keys: (string | undefined)[] = [];
  const res = await C.guarded('s', 'c2', async (k?: string) => { keys.push(k); return { outcome: 'pending' as const, idem }; }, META) as { outcome: string; code?: string };
  return { outcome: res.outcome, code: res.code, sent: keys.length, keys };
}
async function storeLockHeld(): Promise<() => void> {
  let open!: () => void;
  const gate = new Promise<void>((r) => { open = r; });
  void navigator.locks.request('hub_changes', () => gate);
  await settle();
  return open;
}
async function roundTrip(firstKey?: string): Promise<ReturnType<typeof sendC2>> {
  const r1 = sendC2(firstKey);
  await settle();
  as(OTHER); await settle(); as(ME); await settle();
  expect(C.isPending('s', 'c2')).toBe(true);
  expect(C.isBusy('s', 'c2')).toBe(false);
  return r1;
}
/** Another tab (tabB) removed `r1` and admitted its own live send R2 (same change). */
const tabBLive = (r1: Rec, t: number): Rec => ({ ...r1, inc: 'incB', nonce: 'nB', key: 'KB', pending: false, sending: { tab: 'tabB', at: Date.now() }, t });

describe('a release never writes another send\'s record', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('h1a: queued release, then a storage event adopts tab B\'s live R2: R2 keeps its stamp and a third runtime sends nothing', async () => {
    expect((await pressOnce('K1')).outcome).toBe('pending');
    const r1 = c2()[0]!;
    const hold = C.holdOfLock('s', 'c2')!;
    const open = await storeLockHeld();
    const freeing = C.release('s', 'c2', hold); // waits for its lock turn
    writeChanges([tabBLive(r1, r1.t + 5)]);
    announce();
    open();
    expect(await freeing).toBe(false); // the stored record is another send's: refused
    await spins();
    const rec = c2()[0]!;
    expect(rec.inc).toBe('incB');
    expect(rec.sending).toBeDefined();
    C.reloadChangesForTests();
    expect(await pressOnce('N3')).toMatchObject({ outcome: 'not_sent', sent: 0 });
  });
  for (const how of ['discard', 'complete'] as const) {
    it(`h1b (${how}): release then ${how} before the lock turn: tab B's live R2 at the same version stays`, async () => {
      expect((await pressOnce('K1')).outcome).toBe('pending');
      const r1 = c2()[0]!;
      const hold = C.holdOfLock('s', 'c2')!;
      writeChanges([]);
      writeChanges([tabBLive(r1, r1.t)]);
      // The stored record is another send's, so both are refused in their lock turns.
      expect(await C.release('s', 'c2', hold)).toBe(false);
      expect(await C[how]('s', 'c2', hold)).toBe(false);
      await spins();
      expect(c2().map((r) => [r.inc, !!r.sending])).toEqual([['incB', true]]);
      C.reloadChangesForTests();
      expect(await pressOnce('N3')).toMatchObject({ outcome: 'not_sent', sent: 0 });
    });
  }
  it('h1c: release then an immediate press: B\'s live R2 is adopted, nothing is sent', async () => {
    expect((await pressOnce('K1')).outcome).toBe('pending');
    const r1 = c2()[0]!;
    const hold = C.holdOfLock('s', 'c2')!;
    writeChanges([tabBLive(r1, r1.t)]);
    expect(await C.release('s', 'c2', hold)).toBe(false); // another send's record: refused
    const res = await pressOnce('KX');
    expect(res.sent).toBe(0);
    await spins();
    expect(c2().map((r) => [r.inc, !!r.sending])).toEqual([['incB', true]]);
  });
});

describe('a release keeping the key survives a press that marks the copy busy first', () => {
  beforeEach(() => { vi.useFakeTimers({ now: 3_000_000, toFake: ['Date', 'setInterval', 'clearInterval'] }); boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { vi.useRealTimers(); });
  // While R1 is out (beat) or its answer is queued, only the warned Dismiss frees the copy, in its own lock
  // turn after the queued write; a press meanwhile is refused unsent, as the copy stays pending until then.
  for (const queued of ['answer', 'beat'] as const) {
    it(`h2 (${queued}): R1 out across X->Y->X, ${queued} queued, copy released keeping K0, R2 pressed: refused unsent meanwhile, then ${queued === 'answer' ? 'R2 replays K0' : 'BUSY until R1 answers'}`, async () => {
      expect((await pressOnce('K0')).outcome).toBe('pending');
      expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
      await spins();
      const r1 = await roundTrip();
      const open = await storeLockHeld();
      if (queued === 'answer') { r1.answer('pending', 'K0'); await r1.going; }
      else { vi.advanceTimersByTime(SENDING_HEARTBEAT_MS); await settle(); }
      const freeing = C.release('s', 'c2', C.holdOfLock('s', 'c2')!, { warned: true });
      expect(await pressOnce('K0')).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', sent: 0 });
      open();
      expect(await freeing).toBe(true);
      await spins();
      expect(C.isPending('s', 'c2')).toBe(false);
      expect(c2().map((r) => [r.pending, r.key])).toEqual([[false, 'K0']]);
      if (queued === 'answer') {
        expect(await pressOnce('K0')).toMatchObject({ outcome: 'pending', sent: 1, keys: ['K0'] });
      } else {
        expect(await pressOnce('K0')).toMatchObject({ outcome: 'not_sent', code: 'BUSY', sent: 0 });
        r1.answer('done'); await r1.going;
      }
    });
  }
});

describe('release then a press while another tab already removed the record', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('h3: the removed record is not written back and the press carries a fresh key', async () => {
    expect((await pressOnce('K')).outcome).toBe('pending');
    const hold = C.holdOfLock('s', 'c2')!;
    writeChanges([]);
    expect(await C.release('s', 'c2', hold)).toBe(true);
    const res = await pressOnce('N');
    expect(res.sent).toBe(1);
    expect(res.keys).not.toEqual(['K']); // this route mints no key: a fresh admission carries none
    await spins();
    expect(c2().map((r) => r.key)).not.toContain('K');
  });
});

describe('h4: a tokenless legacy kept-key record is an older build\'s: never replayed, removed', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('h4: legacy record K is not replayed (the press sends afresh and the record goes); across X->Y->X, then done, nothing stays pending', async () => {
    const id = ME + '\u0001s\u0000c2';
    writeChanges([{ id, pending: false, key: 'K', t: Date.now(), meta: { base: META.base, target: null, realm: R1, by: META.by } }]);
    C.reloadChangesForTests();
    const keys: (string | undefined)[] = [];
    let open!: (v: { outcome: Outcome }) => void;
    const going = C.guarded('s', 'c2', (k) => { keys.push(k); return new Promise<{ outcome: Outcome }>((r) => { open = r; }); }, META);
    await settle();
    // An older build's record (no format marker) is never adopted, so its key is never replayed; unheld, the
    // admission's own write removes it.
    expect(keys).toEqual([undefined]);
    expect(c2().map((r) => [r.key, r.fmt, !!r.inc])).toEqual([[null, 1, true]]);
    as(OTHER); await settle(); as(ME); await settle();
    expect(C.isPending('s', 'c2')).toBe(true);
    open({ outcome: 'done' });
    await going;
    await spins();
    expect(c2()).toEqual([]);
    expect(C.isPending('s', 'c2')).toBe(false);
  });
});

describe('a pending answer whose record moved to another, released send leaves no phantom lock', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('h5: storage holds released R2; this tab follows it and a press is admitted', async () => {
    const r1 = sendC2();
    await settle();
    const rec = c2()[0]!;
    writeChanges([{ ...rec, inc: 'incB', nonce: 'nB', key: 'K2', pending: false, sending: undefined, t: rec.t + 10 }]);
    announce();
    r1.answer('pending', 'K1');
    await r1.going;
    await spins();
    expect(c2().map((r) => [r.pending, r.key])).toEqual([[false, 'K2']]);
    expect(C.isPending('s', 'c2')).toBe(false);
    expect(await pressOnce('N')).toMatchObject({ outcome: 'pending', sent: 1 });
  });
});

describe('admission after a clean read that finds the record gone sends a fresh key', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  it('h6a (removed by another tab): the press carries its own first key and a failed answer stays failed', async () => {
    expect((await pressOnce('K0')).outcome).toBe('pending');
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    await spins();
    writeChanges([]);
    const keys: (string | undefined)[] = [];
    const res = await C.guarded('s', 'c2', async (k) => { keys.push(k); return { outcome: 'failed' as const }; }, META, undefined, 'FRESH');
    expect(keys).toEqual(['FRESH']);
    expect(res.outcome).toBe('failed');
    await spins();
    expect(c2().map((r) => r.key)).not.toContain('K0');
  });
  it('h6b (queued forget): forget answers done and removes the record; the press queued behind it sends a new key', async () => {
    expect((await pressOnce('K0')).outcome).toBe('pending');
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    await spins();
    const open = await storeLockHeld();
    const fg = C.forgetAccountChanges(uid(), C.changeHoldRefs(), { holdsIn: attemptsIn, drop: () => {} });
    const keys: (string | undefined)[] = [];
    const r2 = C.guarded('s', 'c2', async (k) => { keys.push(k); return { outcome: 'done' as const }; }, META);
    open();
    expect(await fg).toBe('done');
    await r2;
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe('K0');
  });
});

describe('no tomb version on a fresh tokenless lock', () => {
  beforeEach(() => { boot({ realm: R1 }); ME = uid(); });
  afterEach(() => { setChangeStoreAdapter(null); });
  it('h7a: admission adopts another tab\'s settled R2 at the same version and refuses; R2 stays', async () => {
    expect((await pressOnce('K1')).outcome).toBe('pending');
    const r1 = c2()[0]!;
    const hold = C.holdOfLock('s', 'c2')!;
    writeChanges([{ ...r1, inc: 'incB', nonce: 'nB', key: 'KB', pending: true, sending: undefined, t: r1.t }]);
    expect(await C.discard('s', 'c2', hold)).toBe(false); // another send's record: refused
    const res = await pressOnce('N');
    expect(res).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', sent: 0 });
    await spins();
    expect(c2().map((r) => r.inc)).toContain('incB');
  });
  it('h7c: a kept-key lock at the same version as another send\'s pending record adopts it and refuses (no replay over it)', async () => {
    expect((await pressOnce('K1')).outcome).toBe('pending');
    expect(await C.release('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    await spins();
    const r1 = c2()[0]!;
    expect([r1.pending, r1.key]).toEqual([false, 'K1']);
    writeChanges([{ ...r1, inc: 'incB', nonce: 'nB', key: 'KB', pending: true, sending: undefined, t: r1.t }]); // B: removed R1, admitted and settled R2 pending, same version
    const res = await pressOnce('N');
    expect(res).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', sent: 0 });
    await spins();
    expect(c2().map((r) => [r.inc, r.pending, r.key])).toEqual([['incB', true, 'KB']]);
  });
  // A free is judged against the stored record, so this tab's proof frees R1 first (its own record, the outcome
  // it observed); tab B then removes R1 and stores its live R2 without a storage event, and this tab's next press
  // fails its admission read: refused unsent, and B's R2 stays (the injected read failure hits
  // the admission's read).
  it('h7b: a press whose admission read fails leaves tab B\'s live R2 stored', async () => {
    expect((await pressOnce('K1')).outcome).toBe('pending');
    const r1 = c2()[0]!;
    expect(await C.discard('s', 'c2', C.holdOfLock('s', 'c2')!)).toBe(true);
    expect(C.isPending('s', 'c2')).toBe(false);
    writeChanges([tabBLive(r1, r1.t)]);
    let reads = 0;
    setChangeStoreAdapter({
      read: () => { reads++; if (reads === 1) throw new Error('unreadable'); return localStorage.getItem(CHANGE_STORE_KEY); },
      write: (text) => { try { if (text === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, text); return true; } catch { return false; } },
    });
    const res = await pressOnce('N');
    expect(res).toMatchObject({ outcome: 'not_sent', code: 'STORE_UNAVAILABLE', sent: 0 });
    await spins();
    expect(reads).toBeGreaterThanOrEqual(1); // the press's admission read, which failed
    expect(c2().map((r) => r.inc)).toEqual(['incB']);
  });

  // A free over another send's record (B's live R2 replaced this tab's R1 in storage) is refused and leaves
  // this tab's memory as it is: its copy stays pending, so the next press is refused before any admission read.
  it("h7d: a discard refused over tab B's record leaves this tab's copy pending", async () => {
    expect((await pressOnce('K1')).outcome).toBe('pending');
    const r1 = c2()[0]!;
    const hold = C.holdOfLock('s', 'c2')!;
    writeChanges([tabBLive(r1, r1.t)]);
    expect(await C.discard('s', 'c2', hold)).toBe(false);
    expect(C.isPending('s', 'c2')).toBe(true);
    const res = await pressOnce('N');
    expect(res).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST', sent: 0 });
    await spins();
    expect(c2().map((r) => r.inc)).toEqual(['incB']);
  });
});

describe('the heartbeat reads its write back, so a later storage event does not undo a newer answer', () => {
  let mode: 'throw-after-landing' | 'not-landed' | 'none' = 'none';
  beforeEach(() => {
    vi.useFakeTimers({ now: 3_000_000, toFake: ['Date', 'setInterval', 'clearInterval'] });
    boot({ realm: R1 }); ME = uid();
    mode = 'none';
    setChangeStoreAdapter({
      read: () => localStorage.getItem(CHANGE_STORE_KEY),
      write: (text) => {
        if (mode === 'not-landed') { mode = 'none'; return false; }
        try { if (text === null) localStorage.removeItem(CHANGE_STORE_KEY); else localStorage.setItem(CHANGE_STORE_KEY, text); } catch { return false; }
        if (mode === 'throw-after-landing') { mode = 'none'; throw new Error('after landing'); }
        return true;
      },
    });
  });
  afterEach(() => { vi.useRealTimers(); setChangeStoreAdapter(null); });
  for (const m of ['throw-after-landing', 'not-landed'] as const) {
    it(`h8 (${m}): heartbeat write ${m}, pending answer queued, an unrelated storage event: the receipt key is stored`, async () => {
      const r1 = sendC2();
      await settle();
      mode = m;
      vi.advanceTimersByTime(SENDING_HEARTBEAT_MS);
      await settle();
      const open = await storeLockHeld();
      r1.answer('pending', 'RECEIPT');
      await r1.going;
      announce();
      open();
      await spins();
      expect(c2()[0]?.key).toBe('RECEIPT');
    });
  }
});
