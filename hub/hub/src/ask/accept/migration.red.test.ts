// Acceptance tests (through seam.ts), group MIGRATION: the dock's legacy records (hub_ask_v1) move into the journal once, and what the person
// dismissed or the agent settled never comes back; a source that could not be read is not an empty source.
// Real storage, the real registry for the source-read test.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Data from '../data';

vi.mock('../data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('../fake');
  const { realClock } = await import('../engine');
  return {
    ...real,
    liveIO: (t: { container: { id: string } }) => real.withFixtureDest(new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'] }, realClock), t.container.id),
  };
});

import { writeStore } from '../data';
import { ACCOUNT, HANDLE, MIG, REALM, slot, storedKeys, world, type World } from './env';
import * as S from './seam';

let w: World | null = null;
afterEach(async () => {
  const R = await import('../registry');
  R.resetRegistryForTests();
  w?.dispose();
  w = null;
});

const hex = (n: number) => 'hx-' + n.toString(16).padStart(32, '0');
/** A legacy record with an unsettled turn (its turn key k2 is the evidence that migrates). */
const legacy = (computer: string, n: number, sid = 'sess-9'): S.AskRecord => ({ p: slot.project, c: computer, r: REALM, s: sid, t: null, k1: hex(n), k2: hex(n + 1), rc: 'custom', n: null, at: 5, i: null, q: 0, ph: 'sending', l: 'en', w: true } as S.AskRecord);

describe('a dismissed or settled request never comes back, however long the migration stays open', () => {
  it('A migrated and dismissed while U stays unresolved; 260 other requests migrate and go; A is not imported again', () => {
    w = world();
    const handleOf = (c: string) => (c === 'comp-u-0001' ? null : HANDLE);
    const A = legacy('comp-a-0001', 1), U = legacy('comp-u-0001', 3, 'sess-8');
    expect(S.migrate(w.j, [A, U], handleOf)).toBe(1);
    expect(S.hasEntry(w.j, HANDLE, A.k2)).toBe(true);
    expect(S.dismiss(w.j, { h: HANDLE, k: A.k2 })).toBe(true);
    for (let i = 0; i < 260; i++) {
      const X = legacy('comp-x-' + i, 1000 + 2 * i, 'sess-x' + i);
      S.migrate(w.j, [A, U, X], handleOf);
      expect(S.dismiss(w.j, { h: HANDLE, k: X.k2 })).toBe(true);
      S.dropRecord(w.j, HANDLE, REALM, X.s, X.k1);
    }
    expect(S.migrationDone(w.j), 'U never resolved: the migration is still open').toBe(false);
    S.migrate(w.j, [A, U], handleOf);
    expect(S.hasEntry(w.j, HANDLE, A.k2), 'A was dismissed hundreds of imports ago and is back').toBe(false);
    expect(storedKeys(w.fs)).toEqual([]);
  });
  it('control: a few imports later A is still not back', () => {
    w = world();
    const handleOf = (c: string) => (c === 'comp-u-0001' ? null : HANDLE);
    const A = legacy('comp-a-0001', 1), U = legacy('comp-u-0001', 3, 'sess-8');
    S.migrate(w.j, [A, U], handleOf);
    S.dismiss(w.j, { h: HANDLE, k: A.k2 });
    S.migrate(w.j, [A, U], handleOf);
    expect(S.hasEntry(w.j, HANDLE, A.k2)).toBe(false);
  });
});

describe('an unreadable request store is not an empty one, for the migration too', () => {
  it('control: while the entries store cannot be read nothing imports and the migration is not done; later it imports', () => {
    w = world();
    const A = legacy('comp-a-0001', 1);
    w.fs.blockReads(MIG);
    expect(S.migrate(w.j, [A], () => HANDLE)).toBe(0);
    expect(S.migrationDone(w.j)).toBe(false);
    w.fs.clearFaults();
    expect(S.migrate(w.j, [A], () => HANDLE)).toBe(1);
    expect(S.hasEntry(w.j, HANDLE, A.k2)).toBe(true);
  });
  it('control: a failed read of the migration\'s tombstones at ANY position never re-imports a dismissed request', async () => {
    const { sweepReadFaults } = await import('./storage-fake');
    await sweepReadFaults(8, (k) => {
      w = world();
      const A = legacy('comp-a-0001', 1);
      S.migrate(w.j, [A], () => HANDLE);
      S.dismiss(w.j, { h: HANDLE, k: A.k2 });
      const rule = w.fs.failRead({ key: MIG, nth: k });
      S.migrate(w.j, [A], () => HANDLE);
      const hit = rule.failed > 0;
      w.fs.clearFaults();
      if (hit) expect(S.hasEntry(w.j, HANDLE, A.k2), `read #${k} failed while migrating again: the dismissed request came back`).toBe(false);
      w.dispose(); w = null;
      return { reached: hit };
    });
  });
});

describe('a legacy source that could not be read leaves the migration open', () => {
  it('registry: the dock store fails to read once; the migration is not marked done; the next try imports the record', async () => {
    w = world();
    const R = await import('../registry');
    const COMPUTER = { project: slot.project, id: slot.computer, name: 'atlas' };
    const dir = { resolve: (h: string) => (h === HANDLE ? COMPUTER : null), handleOf: (id: string) => (id === COMPUTER.id ? HANDLE : null) };
    const rec = legacy(slot.computer, 1);
    expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: [rec] } } as any)).toBe(true);

    w.fs.blockReads('hub_ask_v1');                                    // the dock's legacy store cannot be read right now
    R.setComputerDirectory(dir);
    R.openRef(ACCOUNT, { computer: HANDLE, realm: REALM, sid: 'sess-9' });
    w.fs.clearFaults();
    // The journal shows an unimported source key as a source row (nothing retained is invisible); what must not happen is an import.
    expect(w.fs.peek(MIG), 'nothing was readable, nothing is imported').toBeNull();

    R.setComputerDirectory(dir);                                      // a later attempt (the directory registers again)
    R.openRef(ACCOUNT, { computer: HANDLE, realm: REALM, sid: 'sess-9' });
    expect(w.fs.peek(MIG), 'the record was readable this time: its unsettled turn must migrate (members are stored compactly)').not.toBeNull();
    expect(R.unsettledSends(HANDLE).map((e) => e.k)).toContain(rec.k2);
  });
  it('control: the same flow with no failed read imports the record', async () => {
    w = world();
    const R = await import('../registry');
    const COMPUTER = { project: slot.project, id: slot.computer, name: 'atlas' };
    const dir = { resolve: (h: string) => (h === HANDLE ? COMPUTER : null), handleOf: (id: string) => (id === COMPUTER.id ? HANDLE : null) };
    const rec = legacy(slot.computer, 1);
    writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: [rec] } } as any);
    R.setComputerDirectory(dir);
    R.openRef(ACCOUNT, { computer: HANDLE, realm: REALM, sid: 'sess-9' });
    expect(R.unsettledSends(HANDLE).map((e) => e.k)).toContain(rec.k2);
  });
});
