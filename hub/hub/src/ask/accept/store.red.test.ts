// Red tests (through seam.ts), group STORE: the journal's three browser stores (requests, chat records, leases) over the production-faithful
// localStorage and the REAL core partitioned() adapter. Rule under test:
// a read that did not succeed concludes nothing, and a write is never built on it. Each red test names the case
// it pins with a bracketed tag.
// "control:" tests pass whatever the fix (they keep the harness honest).
//
// The read-fault SWEEP is the point: one logical read of a store is several browser reads (core's partitioned() swallows a
// failed one into "nothing stored"), so the failure is injected at EVERY read position of the operation, not at a position the
// implementation happens to use today. The invariants below hold for any position, for any implementation.
import { afterEach, describe, expect, it } from 'vitest';
import { ACCOUNT, HANDLE, HANDLE2, JOURNAL, KEY, LEASE, OTHER, REALM, REQ, showAccount, slot, storedEntries, storedKeys, world, type World } from './env';
import * as S from './seam';
import { sweepReadFaults } from './storage-fake';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const entry = (c: string, o: Partial<S.Entry> = {}): S.Entry => ({ k: KEY(c), kind: 'turn', h: HANDLE, r: REALM, s: 'sess-1', c: KEY('f'), ct: slot.computer, at: 1, ...o });
const rec = (sid: string, k1: string, k2: string): S.AskRecord => ({ p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: sid, t: 'turn-1', k1, k2, rc: 'custom', n: null, at: 5, i: null, q: 0, ph: 'sending', l: 'en' } as S.AskRecord);
const MAX_K = 8;

describe('requests store: a failed browser read is never an empty journal', () => {
  it('listSure() under a failed read at ANY read position is null or the real entries, never []', async () => {
    const ks = await sweepReadFaults(MAX_K, (k) => {
      w = world();
      const A = entry('a');
      expect(S.writeEntry(w.j, A)).toBe('ok');
      const rule = w.fs.failRead({ key: REQ, nth: k });
      const r = S.entriesSure(w.j);
      const reached = rule.failed > 0;
      w.fs.clearFaults();
      if (reached) {
        const ok = r === null || r.some((e) => e.k === A.k);
        expect(ok, `read #${k} failed; listSure() returned ${JSON.stringify(r)} for a store holding A`).toBe(true);
        expect(storedKeys(w.fs)).toContain(A.k);
      }
      w.dispose(); w = null;
      return { reached };
    });
    expect(ks.length).toBeGreaterThanOrEqual(1);                   // the sweep exercised at least one read position
  });
  it('a write of B under a failed read at ANY position never loses A, and "ok" means B is there', async () => {
    await sweepReadFaults(MAX_K, (k) => {
      w = world();
      const A = entry('a'), B = entry('b');
      expect(S.writeEntry(w.j, A)).toBe('ok');
      const rule = w.fs.failRead({ key: REQ, nth: k });
      const r = S.writeEntry(w.j, B);
      const reached = rule.failed > 0;
      w.fs.clearFaults();
      if (reached) {
        const keys = storedKeys(w.fs);
        expect(keys, `read #${k} failed while writing B (${r}): A was lost`).toContain(A.k);
        if (r === 'ok') expect(keys, `read #${k} failed; write(B) said ok but B is not stored`).toContain(B.k);
      }
      w.dispose(); w = null;
      return { reached };
    });
  });
  it('removing A under a failed read at ANY position never removes B, and "true" means A is gone', async () => {
    await sweepReadFaults(MAX_K, (k) => {
      w = world();
      const A = entry('a'), B = entry('b');
      S.writeEntry(w.j, A); S.writeEntry(w.j, B);
      const rule = w.fs.failRead({ key: REQ, nth: k });
      const r = S.dismiss(w.j, A);
      const reached = rule.failed > 0;
      w.fs.clearFaults();
      if (reached) {
        const keys = storedKeys(w.fs);
        expect(keys, `read #${k} failed during the removal of A: B was lost`).toContain(B.k);
        if (r) expect(keys, `read #${k} failed; removal reported done but A is stored`).not.toContain(A.k);
      }
      w.dispose(); w = null;
      return { reached };
    });
  });
  it('control: a store that is fully unreadable (every read throws) is never written over', () => {
    w = world();
    const A = entry('a');
    S.writeEntry(w.j, A);
    w.fs.blockReads(REQ);
    expect(S.entriesSure(w.j)).toBeNull();
    expect(S.writeEntry(w.j, entry('b'))).not.toBe('ok');
    w.fs.clearFaults();
    expect(storedKeys(w.fs)).toEqual([A.k]);
  });
  it('control: quota full on a write loses nothing and is not "ok"', () => {
    w = world();
    const A = entry('a');
    S.writeEntry(w.j, A);
    w.fs.quota = w.fs.used();
    expect(S.writeEntry(w.j, entry('b'))).not.toBe('ok');
    expect(storedKeys(w.fs)).toEqual([A.k]);
  });
  it('control: site data denied (SecurityError on every call) keeps nothing and concludes nothing', () => {
    w = world();
    w.fs.denied = true;
    expect(S.entriesSure(w.j)).toBeNull();
    expect(S.writeEntry(w.j, entry('a'))).not.toBe('ok');
  });
});

describe('chat-record store: the same rule', () => {
  it('putting record 2 under a failed read at ANY position never loses record 1', async () => {
    await sweepReadFaults(MAX_K, async (k) => {
      w = world();
      const r1 = rec('sess-1', KEY('1'), KEY('2')), r2 = rec('sess-2', KEY('3'), KEY('4'));
      expect(await S.putRecord(w.j, HANDLE, r1)).toBe('ok');
      const rule = w.fs.failRead({ key: JOURNAL, nth: k });
      const res = await S.putRecord(w.j, HANDLE, r2);
      const reached = rule.failed > 0;
      w.fs.clearFaults();
      if (reached) {
        expect(S.findRecord(w.j, HANDLE, REALM, 'sess-1'), `read #${k} failed while putting record 2 (${res}): record 1 was lost`).not.toBeNull();
        if (res === 'ok') expect(S.findRecord(w.j, HANDLE, REALM, 'sess-2'), `put said ok but record 2 is not stored`).not.toBeNull();
      }
      w.dispose(); w = null;
      return { reached };
    });
  });
});

describe('lease store: unreadable is not empty', () => {
  it('setting a lease for B under a failed read at ANY position never loses A\'s lease', async () => {
    const ks = await sweepReadFaults(MAX_K, (k) => {
      w = world();
      expect(S.leaseSet(w.j, HANDLE, 'sess-a', 'lease-a')).toBe(true);
      const rule = w.fs.failRead({ key: LEASE, nth: k });
      const r = S.leaseSet(w.j, HANDLE, 'sess-b', 'lease-b');
      const reached = rule.failed > 0;
      w.fs.clearFaults();
      if (reached) {
        expect(S.leaseGet(w.j, HANDLE, 'sess-a'), `read #${k} failed (set returned ${r}): A's lease was lost`).toBe('lease-a');
        if (r) expect(S.leaseGet(w.j, HANDLE, 'sess-b')).toBe('lease-b');
      }
      w.dispose(); w = null;
      return { reached };
    });
    expect(ks.length).toBeGreaterThanOrEqual(1);
  });
  it('dropping A\'s lease under a failed read never says "dropped" while A\'s lease is stored, and never loses B\'s', async () => {
    await sweepReadFaults(MAX_K, (k) => {
      w = world();
      S.leaseSet(w.j, HANDLE, 'sess-a', 'lease-a'); S.leaseSet(w.j, HANDLE, 'sess-b', 'lease-b');
      const rule = w.fs.failRead({ key: LEASE, nth: k });
      const r = S.leaseDrop(w.j, HANDLE, 'sess-a');
      const reached = rule.failed > 0;
      w.fs.clearFaults();
      if (reached) {
        expect(S.leaseGet(w.j, HANDLE, 'sess-b'), `read #${k} failed during drop(A): B's lease was lost`).toBe('lease-b');
        if (r) expect(S.leaseGet(w.j, HANDLE, 'sess-a'), `drop(A) said true but A's lease is stored`).toBeNull();
      }
      w.dispose(); w = null;
      return { reached };
    });
  });
  it('a lease store whose every read fails is never written over (a refused set leaves A\'s lease, and another account\'s untouched)', () => {
    w = world();
    S.leaseSet(w.j, HANDLE, 'sess-a', 'lease-a');
    showAccount(OTHER);
    S.leaseSet(w.j, HANDLE, 'sess-o', 'lease-o');
    showAccount(ACCOUNT);
    w.fs.blockReads(LEASE);
    expect(S.leaseSet(w.j, HANDLE, 'sess-b', 'lease-b')).toBe(false);
    w.fs.clearFaults();
    expect(S.leaseGet(w.j, HANDLE, 'sess-a')).toBe('lease-a');
    showAccount(OTHER);
    expect(S.leaseGet(w.j, HANDLE, 'sess-o')).toBe('lease-o');
  });
});

describe('failed-removal retries belong to the account that owes them', () => {
  it('a removal the store refused, then an account switch and a sweep there, is still owed and is made when the account is back', async () => {
    w = world();
    const E = entry('a');
    expect(S.writeEntry(w.j, E)).toBe('ok');
    w.fs.blockWrites(REQ);
    expect(S.dismiss(w.j, E)).toBe(false);                          // the browser refuses the removal
    expect(S.owed(w.j)).toBe(1);
    w.fs.clearFaults();
    showAccount(OTHER);
    await S.sweep(w.j);                                                   // a sweep while another account is shown
    expect(storedKeys(w.fs, ACCOUNT), 'the other account\'s sweep must not settle this account\'s removal').toEqual([E.k]);
    expect(S.owed(w.j), 'the removal is still owed after a sweep in another account').toBe(1);
    showAccount(ACCOUNT);
    await S.sweep(w.j);
    expect(storedKeys(w.fs, ACCOUNT)).toEqual([]);
    expect(S.owed(w.j)).toBe(0);
  });
  it('control: without an account switch the retry is made', async () => {
    w = world();
    const E = entry('a');
    S.writeEntry(w.j, E);
    w.fs.blockWrites(REQ);
    S.dismiss(w.j, E);
    w.fs.clearFaults();
    await S.sweep(w.j);
    expect(storedKeys(w.fs)).toEqual([]);
    expect(S.owed(w.j)).toBe(0);
  });
  it('control: a retried removal is per entry: another computer\'s entry with the same key stays', async () => {
    w = world();
    const E = entry('a'), F = entry('a', { h: HANDLE2 });
    S.writeEntry(w.j, E); S.writeEntry(w.j, F);
    w.fs.blockWrites(REQ);
    expect(S.dismiss(w.j, E)).toBe(false);
    w.fs.clearFaults();
    await S.sweep(w.j);
    expect(storedEntries(w.fs).map((e) => e.h)).toEqual([HANDLE2]);  // E gone, F (same key, other computer) stays
  });
});
