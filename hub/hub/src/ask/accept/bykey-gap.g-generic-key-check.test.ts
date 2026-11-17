// Acceptance, group BY-KEY GAP: every recovery read and retire looks at the shown
// account in the synchronous part and makes its io call in a later microtask. An account that moves in between must get no call at all
// (callIfShown, journal/recover.ts), not merely a dropped answer: the generic by-key check (create, turn, command; read and retire), checkById,
// checkCreate and peekTurn. The journal is the real one on the production-faithful storage; the io is a counting double.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { internalsOf } from '../journal/index';
import { bindDestForTests, seedEntryForTests } from '../journal/testing';
import { installTryLocks } from './try-locks';
import { ACCOUNT, HANDLE, OTHER, REALM, showAccount, slot, storedEntries, world, type World } from './env';

let w: World | null = null;
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { vi.restoreAllMocks(); showAccount(ACCOUNT); w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const SID = 'sess-g1';
const key = (n: number) => 'hx-' + 'e' + n.toString(16).padStart(31, '0');
type R = 'create' | 'turn' | 'command';
const KIND: Record<R, string> = { create: 'create', turn: 'turn', command: 'message' };
const READ: Record<R, string> = { create: 'createKeyGet', turn: 'turnByKey', command: 'commandByKey' };
const RETIRE: Record<R, string> = { create: 'createKeyRetire', turn: 'turnKeyRetire', command: 'commandKeyRetire' };
const MISS: Record<R, unknown> = {
  create: { status: 404, code: 'create_not_found' },
  turn: { status: 404, code: 'turn_not_found', details: { retired: false } },
  command: { status: 404, code: 'command_not_found', details: { retired: false } },
};
/** A stored entry for route `r` under key `k` (another page life wrote it). */
function entry(r: R, k: string): void {
  expect(seedEntryForTests(w!.j, { k, kind: KIND[r], h: HANDLE, r: REALM, s: r === 'create' ? null : SID, c: k, ct: slot.computer, at: 1 } as any)).toBe('ok');
}
/** An AgentIO double for the one computer; `calls` counts what reached it. */
function stubIO(over: Record<string, (...a: any[]) => unknown>): any {
  const calls: Record<string, number> = {};
  const io: any = { calls };
  for (const [name, fn] of Object.entries(over)) io[name] = (...a: unknown[]) => { calls[name] = (calls[name] ?? 0) + 1; return Promise.resolve(fn(...a)); };
  return bindDestForTests(io, slot.computer);
}
const missIO = (r: R) => stubIO({ [READ[r]]: () => Promise.reject(MISS[r]), [RETIRE[r]]: () => ({ retired: true, admitted: 'false' }) });
const keys = () => storedEntries(w!.fs, ACCOUNT).map((e: any) => e.k);
const ROUTES: R[] = ['create', 'turn', 'command'];

describe('G the generic by-key check: no call for an account that moved after the guard', () => {
  it.each(ROUTES)('G1-G3 %s: the read is never sent when the account moves between the guard and the deferred call', async (r) => {
    w = world();
    const k = key(1);
    entry(r, k);
    const io = missIO(r);
    const p = w.j.check(io, HANDLE, k);
    showAccount(OTHER);
    const out = await p;
    showAccount(ACCOUNT);
    expect(out.v).toMatchObject({ t: 'unknown', why: 'account' });
    expect(out.settled).toBe('none');
    expect(io.calls[READ[r]] ?? 0, `${r}: no read for an account that is not shown`).toBe(0);
    expect(io.calls[RETIRE[r]] ?? 0).toBe(0);
    expect(keys(), 'the entry stays').toContain(k);
  });
  it.each(ROUTES)('G4 %s: after a miss, the retire is never sent when the account moves after the last look under the send lock', async (r) => {
    w = world();
    const k = key(2);
    entry(r, k);
    const io = missIO(r);
    // The last synchronous look under the lock is the entries scan; the account moves right after it, before the retire call.
    const ents: any = internalsOf(w.j).entries;
    const real = ents.scan.bind(ents);
    let n = 0;
    vi.spyOn(ents, 'scan').mockImplementation((...a: unknown[]) => { const s = real(...a); if (++n === 3) showAccount(OTHER); return s; });
    const out = await w.j.check(io, HANDLE, k);
    showAccount(ACCOUNT);
    expect(n, 'check, byKey, and the look under the lock each scanned').toBeGreaterThanOrEqual(3);
    expect(io.calls[READ[r]]).toBe(1);
    expect(io.calls[RETIRE[r]] ?? 0, `${r}: no retire for an account that is not shown`).toBe(0);
    expect(out.v).toMatchObject({ t: 'unknown', why: 'account' });
    expect(keys(), 'the entry stays').toContain(k);
  });
  it.each(ROUTES)('G8 %s control: with the account still shown the read and the retire are each sent once', async (r) => {
    w = world();
    const k = key(3);
    entry(r, k);
    const io = missIO(r);
    const out = await w.j.check(io, HANDLE, k);
    expect(io.calls[READ[r]]).toBe(1);
    expect(io.calls[RETIRE[r]]).toBe(1);
    expect(out.v).toMatchObject({ t: 'notAdmitted' });
  });
});

describe('G the reads by id and by key outside the generic check', () => {
  it('G5 checkById: neither a command read nor a turn receipt is sent for an account that moved after the guard', async () => {
    w = world();
    const door = internalsOf(w.j).door;
    const kc = key(4), kt = key(5);
    entry('command', kc); entry('turn', kt);
    door.noteRef(ACCOUNT, HANDLE, kc, { command: 'cmd-1' });
    door.noteRef(ACCOUNT, HANDLE, kt, { turn: 'turn-1' });
    const io = stubIO({ commandGet: () => ({ command_id: 'cmd-1', state: 'completed' }), receipt: () => ({ turn_id: 'turn-1' }) });
    for (const k of [kc, kt]) {
      const p = w.j.checkById(io, HANDLE, k);
      showAccount(OTHER);
      const v = await p;
      showAccount(ACCOUNT);
      expect(v).toMatchObject({ t: 'unknown', why: 'account' });
    }
    expect(io.calls.commandGet ?? 0, 'checkById: no command read').toBe(0);
    expect(io.calls.receipt ?? 0, 'checkById: no turn receipt').toBe(0);
    // Control: still shown, each read is sent once.
    await w.j.checkById(io, HANDLE, kc);
    await w.j.checkById(io, HANDLE, kt);
    expect([io.calls.commandGet, io.calls.receipt]).toEqual([1, 1]);
  });
  it('G6 checkCreate: the create key read is not sent for an account that moved after the guard', async () => {
    w = world();
    const io = stubIO({ createKeyGet: () => Promise.reject(MISS.create) });
    const p = w.j.checkCreate(io, HANDLE, REALM, key(6));
    showAccount(OTHER);
    const out = await p;
    showAccount(ACCOUNT);
    expect(out.v).toMatchObject({ t: 'unknown', why: 'account' });
    expect(out.settled).toBe('none');
    expect(io.calls.createKeyGet ?? 0, 'checkCreate: no read').toBe(0);
    await w.j.checkCreate(io, HANDLE, REALM, key(6));
    expect(io.calls.createKeyGet, 'control: still shown, the read is sent').toBe(1);
  });
  it('G7 peekTurn: the turn key read is not sent for an account that moved after the guard', async () => {
    w = world();
    const io = stubIO({ turnByKey: () => ({ turn_id: 'turn-7' }) });
    const p = w.j.peekTurn(io, HANDLE, SID, REALM, key(7));
    showAccount(OTHER);
    const v = await p;
    showAccount(ACCOUNT);
    expect(v).toMatchObject({ t: 'unknown', why: 'account' });
    expect(io.calls.turnByKey ?? 0, 'peekTurn: no read').toBe(0);
    expect(await w.j.peekTurn(io, HANDLE, SID, REALM, key(7)), 'control: still shown, the read is sent and settles').toMatchObject({ t: 'settled' });
    expect(io.calls.turnByKey).toBe(1);
  });
});
