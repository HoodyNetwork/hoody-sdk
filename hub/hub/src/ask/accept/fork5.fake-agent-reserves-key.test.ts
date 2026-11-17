// Acceptance: recovering a pending fork. Step 1: the primitives. The durable record, the request
// entries and the agent's log are read from the raw bytes, never from the code under test.
//   A  the fake agent: a refused keyed fork leaves its create key reserved, not in flight, with no session
//   B  the target lock T: its names and holdIfFree
//   C  records: lookupK1 is tri-state, the fork facades take the account, dismissFork only hides
//   D  endedAsUnavailable converts exactly one retire verdict
//   E  the door's outcome says what the settlement returned, and a cancel that found the call claimed gets `late`
//   G  readFork / retireFork, and the generic by-key path stays away from a fork's key
//   H  step 2, the engine: a lost answer is recovered by Check (made / never made), Hide, the block, the cap, the lock
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import * as F from '../fork';
import { SendToken, guardIO, internalsOf, type Op } from '../journal';
import { sendHeld, sendLockName } from '../journal/door';
import { LOCKABLE, LOCK_REFUSED, badForkLockName, forkLockName, holdIfFree, lockNameOf, recsLockName } from '../journal/locks';
import { classifyKeyRetire, endedAsUnavailable } from '../journal/proof';
import { bindDestForTests, recordsForTests, seedEntryForTests } from '../journal/testing';
import { ForkRecovery } from '../forkRecovery';
import { forkOutcome } from '../active';
import { forkNow } from '@kit/agent/forkNow';
import { installTryLocks } from './try-locks';
import { ACCOUNT, HANDLE, JOURNAL, OTHER, REALM, REQ, settleReal, showAccount, slot, storedEntries, world, type World } from './env';

let w: World | null = null;
// Web Locks that honour `ifAvailable` (the suite's default grants every request in turn, which a try-lock cannot be tested against).
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { vi.restoreAllMocks(); w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const agent = (): any => w!.agent as any;
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL) ?? 'null')?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const seedDoc = (d: Record<string, any>) => { const raw = w!.fs.peek(JOURNAL); const all = raw ? JSON.parse(raw) : { v: 1, a: {} }; all.a[ACCOUNT] = d; w!.fs.seed(JOURNAL, JSON.stringify(all)); };
const key = (n: number, c = 'a') => 'hx-' + c + n.toString(16).padStart(31, '0');
const TPL = { p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, rc: 'custom', n: null, i: null, q: 0, ph: 'completed', l: 'en' };
const fork = (n: number, over: Record<string, unknown> = {}): any => ({ ...TPL, k1: key(n), k2: key(n, 'b'), at: 1000 + n, fk: { s: `sess-p${n}`, i: n }, ...over });
const claim = (rec: any, acct: string = ACCOUNT, j: any = w!.j): Promise<any> => j.claimFork(HANDLE, rec, () => ({ k1: rec.k1, k2: rec.k2 }), acct);
const entry = (k1: string, j: any = w!.j) => seedEntryForTests(j, { k: k1, kind: 'create', h: HANDLE, r: REALM, s: null, c: k1, ct: slot.computer, at: 1 } as any);
function plant(rec: any): void {
  const d = doc();
  d[`${HANDLE}|${REALM}|${rec.s === null ? 'create:' + rec.k1 : rec.s}`] = { h: HANDLE, ...rec };
  seedDoc(d);
}
const scope = (over: Record<string, string> = {}) => ({ acct: ACCOUNT, h: HANDLE, r: REALM, ...over });
const open = () => Object.values(doc()).filter((r: any) => r.fk && r.s === null);
/** An AgentIO double for the one computer; `calls` counts what reached it. */
function stubIO(over: Record<string, (...a: any[]) => unknown>): any {
  const calls: Record<string, number> = {};
  const io: any = { calls };
  for (const [name, fn] of Object.entries(over)) io[name] = (...a: unknown[]) => { calls[name] = (calls[name] ?? 0) + 1; return Promise.resolve(fn(...a)); };
  return bindDestForTests(io, slot.computer);
}
async function holdName(name: string): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let granted!: () => void;
  const got = new Promise<void>((r) => { granted = r; });
  void (globalThis.navigator as any).locks.request(name, () => { granted(); return gate; });
  await got;
  return release;
}

describe('A the fake agent reserves the key of a refused fork', () => {
  it('a keyed fork of a parent the agent does not have (404) leaves the key allocated, not in flight, with no session; a retire says unknown and fences nothing', async () => {
    w = world();
    const body = F.forkBody(REALM, slot.computer, 'sess-nope', 1)!;
    await expect(agent().create(body, key(1), REALM)).rejects.toMatchObject({ status: 404 });
    expect(await agent().createKeyGet(key(1), REALM)).toEqual({ state: 'allocated', in_flight: false });
    expect(await agent().createKeyRetire(key(1), REALM)).toEqual({ retired: false, admitted: 'unknown', state: 'allocated', in_flight: false });
    // Not fenced: the same key can be asked about again, and a create with it is not refused as retired.
    expect(await agent().createKeyGet(key(1), REALM)).toEqual({ state: 'allocated', in_flight: false });
  });
  it('a key nobody used is still a miss, and a retire of it still fences', async () => {
    w = world();
    await expect(agent().createKeyGet(key(2), REALM)).rejects.toMatchObject({ status: 404, code: 'create_not_found' });
    expect(await agent().createKeyRetire(key(2), REALM)).toEqual({ retired: true, admitted: 'false' });
  });
  it('the classifier reads that retire answer as allocated-no-session (unknown), and endedAsUnavailable alone turns it into an end', async () => {
    w = world();
    const id = { acct: ACCOUNT, h: HANDLE, k: key(3), route: 'create' as const };
    const v = classifyKeyRetire(id, { ok: true, b: { retired: false, admitted: 'unknown', state: 'allocated', in_flight: false } });
    expect(v).toMatchObject({ t: 'unknown', src: 'retire', why: 'allocatedNoSession' });
    expect(endedAsUnavailable(v)).toMatchObject({ t: 'settled', src: 'retire', route: 'create', why: 'ended', k: key(3) });
    expect(endedAsUnavailable(v)!.sid).toBeUndefined();
  });
});

describe('B the target lock T', () => {
  const fk = { s: 'sess-p1', i: 1 };
  it('a name is hub-ai-fork: + 32 hex (44 characters), lockable, and deterministic', () => {
    const n = forkLockName(ACCOUNT, HANDLE, REALM, fk);
    expect(n).toMatch(/^hub-ai-fork:[0-9a-f]{32}$/);
    expect(n).toHaveLength(44);
    expect(LOCKABLE.test(n)).toBe(true);
    expect(forkLockName(ACCOUNT, HANDLE, REALM, { ...fk })).toBe(n);
  });
  it('every part of the target changes the name: account, computer, realm, parent, turn; the whole chat (null) is not turn 0', () => {
    const base = forkLockName(ACCOUNT, HANDLE, REALM, fk);
    const names = new Set([
      base,
      forkLockName(OTHER, HANDLE, REALM, fk),
      forkLockName(ACCOUNT, 'orion.ion1', REALM, fk),
      forkLockName(ACCOUNT, HANDLE, 'f2f2f2f2f2f2f2f2f2f2f2f2', fk),
      forkLockName(ACCOUNT, HANDLE, REALM, { s: 'sess-p2', i: 1 }),
      forkLockName(ACCOUNT, HANDLE, REALM, { s: 'sess-p1', i: 2 }),
      forkLockName(ACCOUNT, HANDLE, REALM, { s: 'sess-p1', i: 0 }),
      forkLockName(ACCOUNT, HANDLE, REALM, { s: 'sess-p1', i: null }),
    ]);
    expect(names.size).toBe(8);
  });
  it('a bad record has its own name per create key, never the name of a real target, and lockNameOf picks by the record', () => {
    const a = badForkLockName(ACCOUNT, HANDLE, REALM, key(1)), b = badForkLockName(ACCOUNT, HANDLE, REALM, key(2));
    expect(a).toMatch(/^hub-ai-fork:[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    expect(badForkLockName(ACCOUNT, HANDLE, REALM, key(1))).toBe(a);
    expect(a).not.toBe(forkLockName(ACCOUNT, HANDLE, REALM, fk));
    expect(lockNameOf({ k1: key(1), fk }, scope())).toBe(forkLockName(ACCOUNT, HANDLE, REALM, fk));
    expect(lockNameOf({ k1: key(1), fk: { ...fk, bad: true } }, scope())).toBe(a);
  });
  it('holdIfFree: the first caller holds, the second gets null at once, and a release frees it (no waiting, no clock)', async () => {
    w = world();
    const n = forkLockName(ACCOUNT, HANDLE, REALM, fk);
    const a = await holdIfFree(n);
    expect(a).not.toBeNull();
    expect(a!.name).toBe(n);
    expect(await holdIfFree(n)).toBeNull();
    expect(await holdIfFree(forkLockName(ACCOUNT, HANDLE, REALM, { s: 'sess-p9', i: 1 })), 'another target is free').not.toBeNull();
    a!.release();
    await settleReal(5);
    const again = await holdIfFree(n);
    expect(again).not.toBeNull();
    again!.release();
    again!.release();                                  // idempotent
  });
  it('holdIfFree sees a lock another holder took, and rejects LOCK_REFUSED without Web Locks, for a name the browser refuses, and for a request that throws', async () => {
    w = world();
    const n = forkLockName(ACCOUNT, HANDLE, REALM, fk);
    const rel = await holdName(n);
    expect(await holdIfFree(n)).toBeNull();
    rel();
    const nav: any = globalThis.navigator;
    await expect(holdIfFree('has space')).rejects.toBe(LOCK_REFUSED);
    const real = nav.locks.request;
    nav.locks.request = () => { throw new Error('boom'); };
    try { await expect(holdIfFree(n)).rejects.toBe(LOCK_REFUSED); } finally { nav.locks.request = real; }
    nav.locks.request = () => Promise.reject(new Error('refused'));
    try { await expect(holdIfFree(n)).rejects.toBe(LOCK_REFUSED); } finally { nav.locks.request = real; }
    const locks = nav.locks;
    Object.defineProperty(nav, 'locks', { value: undefined, configurable: true });
    try { await expect(holdIfFree(n)).rejects.toBe(LOCK_REFUSED); } finally { Object.defineProperty(nav, 'locks', { value: locks, configurable: true }); }
  });
});

describe('C records: lookupK1, the account on the fork facades, dismissFork', () => {
  it('lookupK1 finds the record at create:<k1> and at its session, says missing for none, and never mistakes another computer or realm', async () => {
    w = world();
    plant(fork(1));
    expect(w.j.lookupK1(HANDLE, REALM, key(1), ACCOUNT)).toMatchObject({ t: 'found', rec: { k1: key(1), s: null, fk: { s: 'sess-p1', i: 1 } } });
    plant(fork(2, { s: 'sess-2' }));
    expect(w.j.lookupK1(HANDLE, REALM, key(2), ACCOUNT)).toMatchObject({ t: 'found', rec: { k1: key(2), s: 'sess-2' } });
    expect(w.j.lookupK1(HANDLE, REALM, key(3), ACCOUNT)).toEqual({ t: 'missing' });
    expect(w.j.lookupK1('orion.ion1', REALM, key(1), ACCOUNT)).toEqual({ t: 'missing' });
    expect(w.j.lookupK1(HANDLE, 'f2f2f2f2f2f2f2f2f2f2f2f2', key(1), ACCOUNT)).toEqual({ t: 'missing' });
  });
  it('lookupK1 is unreadable for a corrupt document and for another account than the shown one (never missing)', async () => {
    w = world();
    plant(fork(1));
    expect(w.j.lookupK1(HANDLE, REALM, key(1), OTHER)).toEqual({ t: 'unreadable' });
    expect(w.j.lookupK1(HANDLE, REALM, key(1), '')).toEqual({ t: 'unreadable' });
    w.fs.seed(JOURNAL, '{not json');
    expect(w.j.lookupK1(HANDLE, REALM, key(1), ACCOUNT)).toEqual({ t: 'unreadable' });
  });
  it('claimFork, forkHeld, drop and dismissFork refuse when the shown account is not the one the operation started in', async () => {
    w = world();
    expect(await claim(fork(1), OTHER)).toEqual({ t: 'lost' });
    expect(open()).toHaveLength(0);
    expect(await claim(fork(1))).toMatchObject({ t: 'claimed', k1: key(1) });
    expect(await w.j.forkHeld(HANDLE, REALM, key(1), ACCOUNT)).toBe(true);
    expect(await w.j.forkHeld(HANDLE, REALM, key(1), OTHER)).toBe(false);
    expect(await w.j.dismissFork(HANDLE, REALM, key(1), OTHER)).toBe(false);
    expect(await w.j.drop(HANDLE, REALM, null, key(1), OTHER)).toBe(false);
    expect(open(), 'the record survived all three').toHaveLength(1);
    expect(open()[0].dk).toBeUndefined();
    expect(await w.j.drop(HANDLE, REALM, null, key(1), ACCOUNT)).toBe(true);
    expect(open()).toHaveLength(0);
  });
  it('an account that moves BEFORE the lock is granted writes nothing (the facade checks at its start)', async () => {
    w = world();
    const pending = claim(fork(1));
    showAccount(OTHER);
    expect(await pending).toEqual({ t: 'lost' });
    showAccount(ACCOUNT);
    expect(open()).toHaveLength(0);
  });
  it('dismissFork adds k1 to dk of the EXISTING unresolved record and nothing else; twice is the same; the record still counts and still blocks', async () => {
    w = world();
    plant(fork(1));
    const before = { ...doc()[`${HANDLE}|${REALM}|create:${key(1)}`] };
    expect(await w.j.dismissFork(HANDLE, REALM, key(1), ACCOUNT)).toBe(true);
    const rec = () => doc()[`${HANDLE}|${REALM}|create:${key(1)}`];
    expect(rec().dk).toEqual([key(1)]);
    expect({ ...rec(), dk: undefined }).toEqual({ ...before, dk: undefined });
    expect(await w.j.dismissFork(HANDLE, REALM, key(1), ACCOUNT)).toBe(true);
    expect(rec().dk).toEqual([key(1)]);
    // Still a claim of its target: a press joins it.
    entry(key(1));
    expect(await claim(fork(9, { fk: { s: 'sess-p1', i: 1 } }))).toMatchObject({ t: 'join', rec: { k1: key(1) } });
  });
  it('dismissFork never inserts: a missing record, a moved record, another fork at the key, and a stale fk write nothing', async () => {
    w = world();
    expect(await w.j.dismissFork(HANDLE, REALM, key(1), ACCOUNT)).toBe(false);
    expect(Object.keys(doc())).toHaveLength(0);
    plant(fork(2, { s: 'sess-2' }));
    expect(await w.j.dismissFork(HANDLE, REALM, key(2), ACCOUNT)).toBe(false);
    plant(fork(3));
    expect(await w.j.dismissFork(HANDLE, REALM, key(3), ACCOUNT, { s: 'sess-other', i: 3 })).toBe(false);
    expect(doc()[`${HANDLE}|${REALM}|create:${key(3)}`].dk).toBeUndefined();
    expect(await w.j.dismissFork(HANDLE, REALM, key(3), ACCOUNT, { s: 'sess-p3', i: 3 })).toBe(true);
    expect(doc()[`${HANDLE}|${REALM}|create:${key(3)}`].dk).toEqual([key(3)]);
  });
});

describe('D endedAsUnavailable converts exactly one verdict', () => {
  const id = { acct: ACCOUNT, h: HANDLE, k: key(1), route: 'create' as const };
  const retire = (b: unknown) => classifyKeyRetire(id, { ok: true, b });
  it('allocated, not in flight, no session -> ended; every other retire answer -> null', () => {
    expect(endedAsUnavailable(retire({ retired: false, admitted: 'unknown', state: 'allocated', in_flight: false }))).toMatchObject({ t: 'settled', why: 'ended' });
    for (const b of [
      { retired: true, admitted: 'false' },
      { retired: true, admitted: 'unknown' },
      { retired: false, admitted: 'unknown', state: 'allocated', in_flight: true },
      { retired: false, admitted: 'unknown', state: 'allocated', in_flight: false, session_id: 'sess-1' },
      { retired: false, admitted: 'true', state: 'started', in_flight: false, session_id: 'sess-1' },
      { retired: false, admitted: 'unknown' },
      { retired: 'no' },
    ]) expect(endedAsUnavailable(retire(b)), JSON.stringify(b)).toBeNull();
    expect(endedAsUnavailable(classifyKeyRetire(id, { ok: false, e: new Error('x') }))).toBeNull();
  });
  it('a read-sourced allocated-no-session verdict is not converted (only a retire says it ended)', () => {
    w = world();
    const read = classifyKeyRetire({ ...id, route: 'create' }, { ok: true, b: { retired: false, admitted: 'unknown', state: 'allocated', in_flight: false } });
    expect(endedAsUnavailable({ ...read, src: 'receipt' } as any)).toBeNull();
    expect(endedAsUnavailable({ ...read, route: 'turn' } as any)).toBeNull();
  });
});

describe('E the door outcome', () => {
  const createOp = (k: string): Op => ({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, route: 'create', key: k });
  const io = () => guardIO(w!.agent as any, { acct: ACCOUNT, container: slot.computer }) as any;
  it('a settled post carries what its settlement returned, and no late', async () => {
    w = world();
    plant(fork(1, { fk: undefined }));
    const k = w.j.mint('create')!;
    const a = w.j.admit(createOp(k), new SendToken()) as any;
    const out: any = await w.j.post(a, (t) => io().create(F.forkBody(REALM, slot.computer, 'sess-x', null) ?? {}, k, REALM, [t]).catch((e: unknown) => Promise.reject(e)));
    expect(out.kind).toBe('sent');
    expect(['none', 'done', 'owed']).toContain(out.settled);
    expect(out.late).toBeUndefined();
  });
  it('a cancel that finds the call claimed answers `unknown cancelled`, settled none, and a late promise that resolves with the call\'s own settlement', async () => {
    w = world();
    // The parent chat exists so that a real fork is created.
    const eng = await w.dock();
    eng.send('first');
    await w.flush(1500);
    const parent = eng.record!.s!;
    expect(parent).toBeTruthy();
    const k = w.j.mint('create')!;
    const tok = new SendToken();
    const a = w.j.admit(createOp(k), tok) as any;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const real = agent().create.bind(agent());
    agent().create = async (...x: unknown[]) => { await gate; return real(...x); };
    const p = w.j.post(a, (t) => io().create(F.forkBody(REALM, slot.computer, parent, null)!, k, REALM, [t]));
    await settleReal(5);
    tok.cancel();
    const out: any = await p;
    expect(out).toMatchObject({ kind: 'sent', settled: 'none', v: { t: 'unknown', why: 'cancelled' } });
    expect(out.late).toBeInstanceOf(Promise);
    let early = false;
    void out.late.then(() => { early = true; });
    await settleReal(5);
    expect(early, 'late waits for the claimed call').toBe(false);
    release();
    const late = await out.late;
    expect(late.v).toMatchObject({ t: 'settled', src: 'reply' });
    expect(late.v.sid).toBeTruthy();
    expect(['done', 'owed']).toContain(late.settled);
  });
  it('late resolves {unknown} when the claimed call fails in transport, and never rejects', async () => {
    w = world();
    const k = w.j.mint('create')!;
    const tok = new SendToken();
    const a = w.j.admit(createOp(k), tok) as any;
    let fail!: () => void;
    const gate = new Promise<void>((_r, rej) => { fail = () => rej({ pending: true, kind: 'pending' }); });
    agent().create = () => gate;
    const p = w.j.post(a, (t) => io().create({ realm: REALM } as any, k, REALM, [t]));
    await settleReal(5);
    tok.cancel();
    const out: any = await p;
    fail();
    const late = await out.late;
    expect(late.v.t).toBe('unknown');
    expect(late.settled).toBe('none');
  });
  it('a post whose reply arrives after the cancel was seen resolves late at once (the order of the two does not matter)', async () => {
    w = world();
    const k = w.j.mint('create')!;
    const tok = new SendToken();
    const a = w.j.admit(createOp(k), tok) as any;
    let reply!: (v: unknown) => void;
    agent().create = () => new Promise((r) => { reply = r; });
    const p = w.j.post(a, (t) => io().create({ realm: REALM } as any, k, REALM, [t]));
    await settleReal(5);
    tok.cancel();
    const out: any = await p;
    reply({ session_id: 'sess-zz', started: { realm_selector: REALM, computer_id: '', owner_fingerprint: 'fp' } });
    await settleReal(10);
    const late = await Promise.race([out.late, new Promise((r) => setTimeout(() => r('slow'), 200))]);
    expect(late).not.toBe('slow');
    expect((late as any).v.t).toBe('settled');
  });
});

describe('G readFork, retireFork, and the generic by-key path', () => {
  const started = (sid?: string) => ({ state: 'started', ...(sid ? { session_id: sid } : {}) });
  it('readFork: settled+sid moves the record WITHOUT T (the handoff); settled without a sid settles only for a holder of T', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const io1 = stubIO({ createKeyGet: () => started('sess-new') });
    const r1 = await w.j.readFork(io1, scope(), REALM, key(1), null);
    expect(r1.v).toMatchObject({ t: 'settled', sid: 'sess-new' });
    expect(r1.settled).toBe('done');
    expect(doc()[`${HANDLE}|${REALM}|sess-new`]).toMatchObject({ k1: key(1) });
    expect(doc()[`${HANDLE}|${REALM}|create:${key(1)}`]).toBeUndefined();

    plant(fork(2)); entry(key(2));
    const io2 = stubIO({ createKeyGet: () => started() });
    const noHold = await w.j.readFork(io2, scope(), REALM, key(2), null);
    expect(noHold.v).toMatchObject({ t: 'settled', why: 'started' });
    expect(noHold.v.sid).toBeUndefined();
    expect(noHold.settled, 'no T: nothing settled').toBe('none');
    expect(doc()[`${HANDLE}|${REALM}|create:${key(2)}`].ph).not.toBe('gone');
    expect(storedEntries(w.fs).map((e) => e.k)).toContain(key(2));
    const hold = await holdIfFree(lockNameOf(fork(2), scope()));
    const held = await w.j.readFork(io2, scope(), REALM, key(2), hold);
    hold!.release();
    expect(held.settled).toBe('done');
    expect(storedEntries(w.fs).map((e) => e.k), 'the settlement removed the entry').not.toContain(key(2));
  });
  it('readFork settles nothing for retired, a miss, in flight, or allocated with no session, and a moved account makes no change', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const hold = await holdIfFree(lockNameOf(fork(1), scope()));
    const before = w.fs.peek(JOURNAL);
    const answers: Array<() => unknown> = [
      () => ({ state: 'retired', admitted: 'false' }),
      () => Promise.reject({ status: 404, code: 'create_not_found' }),
      () => ({ state: 'allocated', in_flight: true }),
      () => ({ state: 'allocated', in_flight: false }),
    ];
    for (const get of answers) {
      const r = await w.j.readFork(stubIO({ createKeyGet: get }), scope(), REALM, key(1), hold);
      expect(r.settled).toBe('none');
      expect(r.v.t === 'settled', JSON.stringify(r.v)).toBe(false);
    }
    expect(w.fs.peek(JOURNAL), 'the record bytes are untouched').toBe(before);
    expect(storedEntries(w.fs).map((e) => e.k)).toContain(key(1));
    const io = stubIO({ createKeyGet: () => { showAccount(OTHER); return started('sess-late'); } });
    const moved = await w.j.readFork(io, scope(), REALM, key(1), hold);
    showAccount(ACCOUNT);
    hold!.release();
    expect(moved.v).toMatchObject({ t: 'unknown', why: 'account' });
    expect(doc()[`${HANDLE}|${REALM}|create:${key(1)}`]).toBeTruthy();
  });
  it('retireFork: no T means no call; a held send lock, a missing/moved/different record and a different lock each mean no retire call (an own admission is the next test)', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const fk = { s: 'sess-p1', i: 1 };
    const io = stubIO({ createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    expect(await w.j.retireFork(io, null, scope(), REALM, key(1), fk)).toMatchObject({ t: 'unknown', why: 'heldElsewhere' });
    const hold = await holdIfFree(lockNameOf(fork(1), scope()));
    const wrongHold = await holdIfFree(forkLockName(ACCOUNT, HANDLE, REALM, { s: 'sess-other', i: 1 }));
    expect(await w.j.retireFork(io, wrongHold, scope(), REALM, key(1), fk)).toMatchObject({ t: 'unknown', why: 'notTracked' });
    expect(await w.j.retireFork(io, hold, scope(), REALM, key(1), { s: 'sess-p1', i: 2 })).toMatchObject({ t: 'unknown', why: 'notTracked' });
    expect(await w.j.retireFork(io, hold, scope(), REALM, key(7), fk)).toMatchObject({ t: 'unknown', why: 'notTracked' });
    const sendLock = await holdName('hub-ai-send:' + key(1));
    expect(await w.j.retireFork(io, hold, scope(), REALM, key(1), fk)).toMatchObject({ t: 'unknown', why: 'heldElsewhere' });
    sendLock();
    await settleReal(5);
    plant(fork(1, { s: 'sess-moved' })); // moved: not an unresolved fork at that key any more
    const d = doc(); delete d[`${HANDLE}|${REALM}|create:${key(1)}`]; seedDoc(d);
    expect(await w.j.retireFork(io, hold, scope(), REALM, key(1), fk)).toMatchObject({ t: 'unknown', why: 'notTracked' });
    expect(io.calls.createKeyRetire ?? 0).toBe(0);
    hold!.release(); wrongHold!.release();
  });
  it('retireFork with everything in order calls the retire once, inside the key\'s send lock, and classifies the answer', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const fk = { s: 'sess-p1', i: 1 };
    let heldDuring = false;
    const io = stubIO({ createKeyRetire: async () => { heldDuring = await sendHeld(key(1)); return { retired: true, admitted: 'false' }; } });
    const hold = await holdIfFree(lockNameOf(fork(1), scope()));
    const v = await w.j.retireFork(io, hold, scope(), REALM, key(1), fk);
    hold!.release();
    expect(v).toMatchObject({ t: 'notAdmitted', why: 'fenced', src: 'retire' });
    expect(io.calls.createKeyRetire).toBe(1);
    expect(heldDuring, 'the retire ran while this page held hub-ai-send:<k1>').toBe(true);
    // retireFork itself changes no record or entry: the caller settles.
    expect(doc()[`${HANDLE}|${REALM}|create:${key(1)}`]).toBeTruthy();
    expect(storedEntries(w.fs).map((e) => e.k)).toContain(key(1));
  });
  it('retireFork: this page\'s own admission of the key (door.holds, asked while T and the free send lock are held) means heldElsewhere and no retire call', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const fk = { s: 'sess-p1', i: 1 };
    const io = stubIO({ createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    const door = internalsOf(w.j).door;
    const tName = lockNameOf(fork(1), scope());
    const sendName = sendLockName(key(1));
    // Is the name held right now? An ifAvailable request answers null for a held name, at the moment it is made.
    const heldNow = (n: string): Promise<boolean> => (globalThis.navigator as any).locks.request(n, { ifAvailable: true }, (l: unknown) => l === null);
    const probes: Array<Promise<[boolean, boolean]>> = [];
    let own = true;
    const holds = vi.spyOn(door, 'holds').mockImplementation(() => { probes.push(Promise.all([heldNow(tName), heldNow(sendName)])); return own; });
    const hold = await holdIfFree(tName);
    try {
      expect(hold, 'T is free to take').not.toBeNull();
      // T is held, the send lock is free, the record is this fork's own: only this page's own admission is left to refuse.
      expect(await w.j.retireFork(io, hold, scope(), REALM, key(1), fk)).toMatchObject({ t: 'unknown', why: 'heldElsewhere' });
      expect(holds, 'asked about this account, handle and key').toHaveBeenCalledWith(ACCOUNT, HANDLE, key(1));
      expect(probes, 'asked once').toHaveLength(1);
      expect(await probes[0], 'T and the key\'s send lock were both held at the moment it was asked').toEqual([true, true]);
      expect(io.calls.createKeyRetire ?? 0, 'no retire call').toBe(0);
      expect(Object.keys(doc()), 'the record stays').toContain(`${HANDLE}|${REALM}|create:${key(1)}`);
      // The same call with no own admission retires once: the refusal above is the admission, not a missing precondition.
      own = false;
      expect(await w.j.retireFork(io, hold, scope(), REALM, key(1), fk)).toMatchObject({ t: 'notAdmitted' });
      expect(io.calls.createKeyRetire).toBe(1);
    } finally {
      hold?.release();
      await settleReal(5);
    }
  });
  it('retireFork: an account that moved during the call gives unknown account, not the answer', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const io = stubIO({ createKeyRetire: () => { showAccount(OTHER); return { retired: true, admitted: 'false' }; } });
    const hold = await holdIfFree(lockNameOf(fork(1), scope()));
    const v = await w.j.retireFork(io, hold, scope(), REALM, key(1), { s: 'sess-p1', i: 1 });
    showAccount(ACCOUNT);
    hold!.release();
    expect(v).toMatchObject({ t: 'unknown', why: 'account' });
  });
  it('the generic Check makes ZERO calls for the key of a fork, and for a store it cannot read, whatever the agent would answer', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const io = stubIO({ createKeyGet: () => started('sess-new'), createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    const c = await w.j.check(io, HANDLE, key(1));
    expect(c.v).toMatchObject({ t: 'unknown', why: 'forkKey' });
    expect(c.settled).toBe('none');
    expect(io.calls.createKeyGet ?? 0).toBe(0);
    expect(io.calls.createKeyRetire ?? 0).toBe(0);
    expect(doc()[`${HANDLE}|${REALM}|create:${key(1)}`]).toBeTruthy();
    expect(storedEntries(w.fs).map((e) => e.k)).toContain(key(1));
    w.fs.seed(JOURNAL, '{not json');
    const u = await w.j.check(io, HANDLE, key(1));
    expect(u.v).toMatchObject({ t: 'unknown', why: 'recordsUnreadable' });
    expect(io.calls.createKeyGet ?? 0).toBe(0);
  });
  it('an ordinary create (no fork) is still read and, after a miss, retired by the generic Check', async () => {
    w = world();
    plant(fork(1, { fk: undefined })); entry(key(1));
    const io = stubIO({ createKeyGet: () => Promise.reject({ status: 404, code: 'create_not_found' }), createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    const c = await w.j.check(io, HANDLE, key(1));
    expect(io.calls.createKeyGet).toBe(1);
    expect(io.calls.createKeyRetire).toBe(1);
    expect(c.v).toMatchObject({ t: 'notAdmitted', why: 'fenced' });
  });
  it('a fork key that turns up between the read and the retire is not retired by the generic path (the guard runs again under the send lock)', async () => {
    w = world();
    plant(fork(1, { fk: undefined })); entry(key(1));
    const io = stubIO({
      createKeyGet: () => { const d = doc(); d[`${HANDLE}|${REALM}|create:${key(1)}`].fk = { s: 'sess-p1', i: 1 }; seedDoc(d); return Promise.reject({ status: 404, code: 'create_not_found' }); },
      createKeyRetire: () => ({ retired: true, admitted: 'false' }),
    });
    const c = await w.j.check(io, HANDLE, key(1));
    expect(c.v).toMatchObject({ t: 'unknown', why: 'forkKey' });
    expect(io.calls.createKeyRetire ?? 0).toBe(0);
  });
  it('records are reachable for tests as before', () => {
    w = world();
    expect(recordsForTests(w.j)).toBeTruthy();
  });
});

// ---- H step 2: the engine's press and Check, on the real engine, journal and fake agent ----
import { world as mkWorld } from './env';
import * as Fk from '../fork';
import strings from '../strings.en.json';

const flush2 = (n = 900) => w!.flush(n);
const creates2 = (): any[][] => w!.agent.log.filter((x) => x[0] === 'create').map((x) => x[1] as any[]);
const forkCreates2 = () => creates2().filter((a) => 'fork' in a[0]);
const retires = (): any[][] => w!.agent.log.filter((x) => x[0] === 'createKeyRetire');
const forkRecs2 = () => Object.values(doc()).filter((r: any) => r.fk && r.s === null);
async function parent2(turns = 2) {
  w = mkWorld({});
  const a = await w.dock();
  a.send('first');
  await flush2(1500);
  const sid = a.record!.s!;
  const p = w.pinned(sid);
  p.open();
  await flush2(900);
  for (let i = 1; i < turns; i++) { p.send(`turn ${i + 1}`); await flush2(1500); }
  const bounds = (await p.turnPins())!;
  return { a, p, sid, bounds };
}
const spec2 = (bounds: readonly number[], turn: number): Fk.ForkSpec => ({ turn, pin: bounds[turn] as number });

describe('H the engine: press, Check, Hide', () => {
  it('N-made: a lost answer for a fork the agent made is recovered by Check (opened), with one create and no retire', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLost = true;
    const out = await p.fork(spec2(bounds, 1));
    expect(out).toMatchObject({ k: 'unknown', reason: 'lost' });
    expect(forkRecs2()).toHaveLength(1);
    const chk = await p.checkFork((out as any).k1);
    expect(chk.k).toBe('opened');
    expect((chk as any).sid).toMatch(/\S+/);
    expect(forkRecs2(), 'the record is no longer unresolved once the chat is known').toHaveLength(0);
    expect(forkCreates2(), 'Check never sends the create').toHaveLength(1);
    expect(retires(), 'a made fork needs no retire').toHaveLength(0);
  });
  it('N-never: a fork the agent never admitted is fenced by a retire and says none; the target is free again and a new press is a new key', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = await p.fork(spec2(bounds, 1));
    expect(out.k).toBe('unknown');
    agent().o.createLostBefore = false;
    const chk = await p.checkFork((out as any).k1);
    expect(chk).toMatchObject({ k: 'refused', reason: 'none' });
    expect(retires(), 'one retire fenced the key').toHaveLength(1);
    expect(forkRecs2(), 'the record was dropped').toHaveLength(0);
    const again = await p.fork(spec2(bounds, 1));
    expect(again.k).toBe('opened');
    const ks = forkCreates2().map((a) => a[1]);
    expect(new Set(ks).size, 'the second press used a new key').toBe(ks.length);
  });
  it('a Check of a key the agent never admitted settles the pending record and sends no create (the FAQ Check sentence)', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = await p.fork(spec2(bounds, 1));
    expect(out.k).toBe('unknown');
    agent().o.createLostBefore = false;
    expect(forkRecs2(), 'the pending record before the Check').toHaveLength(1);
    const sent = forkCreates2().length;
    const chk = await p.checkFork((out as any).k1);
    expect(chk).toMatchObject({ k: 'refused', reason: 'none' });
    expect(forkCreates2(), 'the Check sent no create').toHaveLength(sent);
    expect(retires(), 'the Check fenced the key: no fork can be made with it later').toHaveLength(1);
    expect(forkRecs2(), 'the Check settled the pending record').toHaveLength(0);
  });
  it('N-block: a pending fork blocks its target on this page and a new engine, and another turn is free', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLost = true;
    const out = await p.fork(spec2(bounds, 1));
    expect(out.k).toBe('unknown');
    agent().o.createLost = false;
    expect(await p.fork(spec2(bounds, 1))).toMatchObject({ k: 'unknown', reason: 'pending', k1: (out as any).k1 });
    expect(forkCreates2()).toHaveLength(1);
    expect((await p.fork(spec2(bounds, 0))).k).toBe('opened');
  });
  it('N-hide: Hide writes only dk; the row is hidden but the record still blocks and still counts; Check still works from the menu', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLost = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    const before = JSON.stringify(forkRecs2()[0]);
    expect(await p.hideFork(out.k1)).toBe(true);
    const after = forkRecs2()[0] as any;
    expect(after.dk).toEqual([out.k1]);
    expect(JSON.stringify({ ...after, dk: undefined })).toBe(JSON.stringify({ ...JSON.parse(before), dk: undefined }));
    expect(p.forkRows()!.find((x) => x.k1 === out.k1)).toMatchObject({ hidden: true });
    agent().o.createLost = false;
    expect(await p.fork(spec2(bounds, 1))).toMatchObject({ k: 'unknown', reason: 'pending' });
    expect((await p.checkFork(out.k1)).k).toBe('opened');
  });
  it('N-concurrent: two Checks of one key on one page are one (one read of the key)', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLost = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    const gets = () => w!.agent.log.filter((x) => x[0] === 'createKeyGet').length;
    const g0 = gets();
    const [a, b] = await Promise.all([p.checkFork(out.k1), p.checkFork(out.k1)]);
    expect(a.k).toBe('opened');
    expect(b.k).toBe('opened');
    expect(gets() - g0).toBe(1);
  });
  it('lock: with the target lock held elsewhere a Check reads only (a made fork still opens by the handoff, a never-made one stays pending) and retires nothing', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    const rec = forkRecs2()[0] as any;
    const release = await holdName(forkLockName(ACCOUNT, HANDLE, REALM, rec.fk));
    const chk = await p.checkFork(out.k1);
    expect(chk.k).toBe('unknown');
    expect(retires(), 'no T means no retire').toHaveLength(0);
    expect(forkRecs2(), 'the record stays').toHaveLength(1);
    release();
    await flush2(200);
    expect(await p.checkFork(out.k1)).toMatchObject({ k: 'refused', reason: 'none' });
  });
  it('cap: eight unresolved forks make a ninth press full; checking one frees a slot', async () => {
    const { p, bounds } = await parent2(2);
    const d = doc();
    for (let i = 0; i < 8; i++) {
      const rec = fork(i + 100, { fk: { s: 'sess-other-' + i, i: 0 } });
      d[`${HANDLE}|${REALM}|create:${rec.k1}`] = { h: HANDLE, ...rec };
      entry(rec.k1, w!.j);
    }
    seedDoc(d);
    const out = await p.fork(spec2(bounds, 1));
    expect(out).toMatchObject({ k: 'refused', reason: 'full' });
    expect(forkCreates2(), 'a refused press sends nothing').toHaveLength(0);
    const rows = p.forkRows()!;
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(await p.checkFork(key(100))).toMatchObject({ k: 'refused' });
    expect((await p.fork(spec2(bounds, 1))).k, 'a slot was freed by the Check').toBe('opened');
  });
  it('words: every reason the engine can return has a sentence of its own in the strings, a whole-chat twin where it names the reply', () => {
    const reasons: Fk.ForkReason[] = ['none', 'gone', 'unconfirmed', 'busy', 'pending', 'lost', 'handoff', 'inFlight', 'untracked', 'full', 'refused', 'notOpen', 'changed', 'approval', 'notRead', 'notRemembered', 'unreadable', 'account'];
    for (const r of reasons) for (const whole of [false, true]) expect(strings as Record<string, string>, `${r}/${whole}`).toHaveProperty([Fk.reasonKey(r, whole)]);
  });
});

// ---- I: the press, the late tail, the Check ----
const tName = (sid: string, i: number | null) => forkLockName(ACCOUNT, HANDLE, REALM, { s: sid, i });
/** True while somebody holds the name (probing a free name takes and releases it at once). */
async function tHeld(name: string): Promise<boolean> {
  const h = await holdIfFree(name);
  if (h) { h.release(); return false; }
  return true;
}
/** The next grant of a fork lock waits for `release()` (the request is made at once, the callback runs after). */
function delayGrant(): { release: () => void; requested: Promise<void> } {
  const nav = (globalThis.navigator as any);
  const real = nav.locks.request.bind(nav.locks);
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let seen!: () => void;
  const requested = new Promise<void>((r) => { seen = r; });
  let armed = true;
  nav.locks.request = (name: string, a: unknown, b?: unknown) => {
    if (!armed || !String(name).startsWith('hub-ai-fork:')) return real(name, a, b);
    armed = false;
    seen();
    const opts = typeof a === 'function' ? {} : a;
    const cb = (typeof a === 'function' ? a : b) as (l: unknown) => unknown;
    return gate.then(() => real(name, opts, cb));
  };
  return { release, requested };
}

describe('I: the press, the late tail, the Check', () => {
  it('a press whose target lock is held elsewhere makes no claim and no create', async () => {
    const { p, sid, bounds } = await parent2(2);
    const release = await holdName(tName(sid, 1));
    const out = await p.fork(spec2(bounds, 1));
    expect(out).toMatchObject({ k: 'refused', reason: 'busy' });
    expect(forkCreates2(), 'nothing was sent').toHaveLength(0);
    expect(forkRecs2(), 'nothing was claimed').toHaveLength(0);
    release();
  });
  it('a create the agent answers 409 create_key_retired is a definite none, the record goes, and the reason is none (not the generic one)', async () => {
    const { p, bounds } = await parent2(2);
    const real = agent().create.bind(agent());
    agent().create = (body: any, key: string, realm: string, ...rest: unknown[]) => { agent().createFenced.add(key); return real(body, key, realm, ...rest); };
    const out = await p.fork(spec2(bounds, 1));
    expect(out).toMatchObject({ k: 'refused', reason: 'none', key: 'ask.forkNone' });
    expect(forkRecs2()).toHaveLength(0);
    expect(retires(), 'N1: the claimer itself retires nothing, the agent already had').toHaveLength(0);
  });
  it('a 409 create_key_retired WITHOUT details is unknown with the record kept; a later Check retires, then drops it', async () => {
    const { p, bounds } = await parent2(2);
    agent().create = () => Promise.reject({ status: 409, code: 'create_key_retired' });
    const out = (await p.fork(spec2(bounds, 1))) as any;
    expect(out).toMatchObject({ k: 'unknown' });
    expect(forkRecs2(), 'the record is kept').toHaveLength(1);
    expect(retires(), 'the claimer retires nothing').toHaveLength(0);
    const chk = await p.checkFork(out.k1);
    expect(chk).toMatchObject({ k: 'refused', reason: 'none' });
    expect(retires(), 'the Check retires once (idempotent on an already-retired key)').toHaveLength(1);
    expect(forkRecs2()).toHaveLength(0);
  });
  it('the typed mapping of every refusal key of the engine is the reason the kit chooses its tone by', () => {
    const want: Record<string, string> = { 'ask.forkNotOpen': 'notOpen', 'ask.forkChanged': 'changed', 'ask.forkApproval': 'approval', 'ask.forkNotRead': 'notRead', 'ask.forkFull': 'full', 'ask.notRemembered': 'notRemembered', 'ask.checkEarlier': 'notRemembered', 'ask.forkSomethingElse': 'refused' };
    for (const [k, r] of Object.entries(want)) expect(Fk.refusalReason(k), k).toBe(r);
  });
  it('a create in flight when the engine ends keeps T until its own typed refusal arrives, then drops the record and only then frees T', async () => {
    const { p, sid, bounds } = await parent2(2);
    let refuse!: (e: unknown) => void;
    let called = false;
    agent().create = () => { called = true; return new Promise((_, rej) => { refuse = rej; }); };
    const pr = p.fork(spec2(bounds, 1));
    for (let i = 0; i < 40 && !called; i++) await flush2(100);
    expect(called, 'the create left').toBe(true);
    p.end();
    await flush2(300);
    await pr;
    expect(forkRecs2(), 'the record stays while the answer is awaited').toHaveLength(1);
    expect(await tHeld(tName(sid, 1)), 'T outlives the send: the claimed create is still in flight').toBe(true);
    refuse({ status: 400, code: 'bad_request' });
    await flush2(600);
    expect(forkRecs2(), 'a late definite refusal drops the record').toHaveLength(0);
    expect(await tHeld(tName(sid, 1)), 'T is free after the drop').toBe(false);
  });
  it('a Check on a busy target whose record is freed during its read says untracked, never busy', async () => {
    const { p, sid, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    const release = await holdName(tName(sid, 1));
    const real = agent().createKeyGet.bind(agent());
    agent().createKeyGet = (...a: unknown[]) => {
      const d = doc(); delete d[`${HANDLE}|${REALM}|create:${out.k1}`]; seedDoc(d);
      return real(...a);
    };
    const chk = await p.checkFork(out.k1);
    expect(chk).toMatchObject({ k: 'refused', reason: 'untracked' });
    release();
  });
  it('a read the Check cannot interpret (the agent is unreachable) retires nothing and keeps the record', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().createKeyGet = () => Promise.reject(new Error('network down'));
    const chk = await p.checkFork(out.k1);
    expect(chk.k).toBe('unknown');
    expect(retires(), 'no retire on a read that proved nothing').toHaveLength(0);
    expect(forkRecs2()).toHaveLength(1);
  });
  it('a fork the agent refused after reserving its key ends unconfirmed: a retire says allocated-no-session, the record goes, the target is free', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createRefuse = { status: 404, code: 'not_found' };
    const out = (await p.fork(spec2(bounds, 1))) as any;
    expect(out.k).toBe('unknown');
    agent().reservedBare.add(out.k1);
    const chk = await p.checkFork(out.k1);
    expect(chk).toMatchObject({ k: 'refused', reason: 'unconfirmed' });
    expect(retires()).toHaveLength(1);
    expect(forkRecs2()).toHaveLength(0);
  });
  it('a drop the store refuses after a settlement that kept no chat keeps the record and says notRemembered; a later Check completes it', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createRefuse = { status: 404, code: 'not_found' };
    const out = (await p.fork(spec2(bounds, 1))) as any;
    expect(out.k).toBe('unknown');
    agent().reservedBare.add(out.k1);
    const drop = vi.spyOn(w!.j, 'drop').mockResolvedValue(false);
    const chk = await p.checkFork(out.k1);
    expect(chk).toMatchObject({ k: 'unknown', reason: 'notRemembered' });
    expect(drop, 'the drop was tried').toHaveBeenCalled();
    drop.mockRestore();
    expect(forkRecs2(), 'the record stays').toHaveLength(1);
    expect(await p.checkFork(out.k1)).toMatchObject({ k: 'refused' });
    expect(forkRecs2()).toHaveLength(0);
  });
  it('a drop the store refuses after a proven none keeps the record too', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    const drop = vi.spyOn(w!.j, 'drop').mockResolvedValue(false);
    expect(await p.checkFork(out.k1)).toMatchObject({ k: 'unknown', reason: 'notRemembered' });
    drop.mockRestore();
    expect(forkRecs2()).toHaveLength(1);
  });
  it('an end whose settlement the store did not keep is not final: the record stays', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createRefuse = { status: 404, code: 'not_found' };
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().reservedBare.add(out.k1);
    const real = agent().createKeyRetire.bind(agent());
    agent().createKeyRetire = (...a: unknown[]) => { const r = real(...a); w!.fs.blockWrites(REQ); return r; };
    const chk = await p.checkFork(out.k1);
    w!.fs.clearFaults();
    expect(chk.k, 'unknown, not the final unconfirmed').toBe('unknown');
    expect(forkRecs2(), 'the record stays').toHaveLength(1);
  });
  it('an engine that ended while its Check waited for the lock reads and retires nothing', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    const gets0 = w!.agent.log.filter((x) => x[0] === 'createKeyGet').length;
    const d = delayGrant();
    const pr = p.checkFork(out.k1);
    await d.requested;
    p.end();
    d.release();
    const chk = await pr;
    expect(chk.k).toBe('unknown');
    expect(w!.agent.log.filter((x) => x[0] === 'createKeyGet').length - gets0, 'no read of the key').toBe(0);
    expect(retires()).toHaveLength(0);
  });
  it('a Check whose account changed while it waited for the lock reads and retires nothing', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    const gets0 = w!.agent.log.filter((x) => x[0] === 'createKeyGet').length;
    const d = delayGrant();
    const pr = p.checkFork(out.k1);
    await d.requested;
    showAccount(OTHER);
    d.release();
    const chk = await pr;
    showAccount(ACCOUNT);
    expect(chk.k).toBe('unknown');
    expect(w!.agent.log.filter((x) => x[0] === 'createKeyGet').length - gets0, 'no read of the key').toBe(0);
    expect(retires()).toHaveLength(0);
  });
  it('a press whose engine ended while it waited for T claims nothing and sends nothing', async () => {
    const { p, bounds } = await parent2(2);
    const claim = vi.spyOn(w!.j, 'claimFork');
    const d = delayGrant();
    const pr = p.fork(spec2(bounds, 1));
    await d.requested;
    p.end();
    d.release();
    const out = await pr;
    expect(out).toMatchObject({ k: 'refused', reason: 'notOpen' });
    expect(claim, 'no claim was ever written').not.toHaveBeenCalled();
    expect(forkCreates2()).toHaveLength(0);
    expect(forkRecs2()).toHaveLength(0);
  });
  it('a create that answered with its chat is not opened while its settlement was not kept', async () => {
    const { p, bounds } = await parent2(2);
    const real = agent().create.bind(agent());
    agent().create = async (...a: unknown[]) => { const r = await (real as any)(...a); w!.fs.blockWrites(REQ); return r; };
    const out = (await p.fork(spec2(bounds, 1))) as any;
    w!.fs.clearFaults();
    expect(out.k, 'not opened on an owed settlement').not.toBe('opened');
  });
  it('a press on a busy target with a pending fork answers with that fork (unknown, pending), not a plain busy', async () => {
    const { p, sid, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const first = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    expect(first.k).toBe('unknown');
    const release = await holdName(tName(sid, 1));
    const again = await p.fork(spec2(bounds, 1));
    release();
    expect(again).toMatchObject({ k: 'unknown', k1: first.k1, reason: 'pending' });
    expect(forkCreates2(), 'no second create').toHaveLength(1);
  });
  it('a record whose fork identity changed while the Check waited for T is not read, not retired and not this Check\'s to settle', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    const gets0 = w!.agent.log.filter((x) => x[0] === 'createKeyGet').length;
    const d = delayGrant();
    const pr = p.checkFork(out.k1);
    await d.requested;
    const doc0 = doc();
    const id = `${HANDLE}|${REALM}|create:${out.k1}`;
    doc0[id] = { ...doc0[id], fk: { ...doc0[id].fk, i: (doc0[id].fk.i ?? 0) + 5 } };
    seedDoc(doc0);
    d.release();
    const chk = await pr;
    expect(chk).toMatchObject({ k: 'unknown', reason: 'unreadable' });
    expect(w!.agent.log.filter((x) => x[0] === 'createKeyGet').length - gets0, 'no read of a key that is no longer this fork\'s').toBe(0);
    expect(retires()).toHaveLength(0);
  });
  it('a key the agent holds as started whose chat is gone: the read is a miss, the retire says admitted with no session, and the end is gone (the record goes)', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLost = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLost = false;
    expect(out.k).toBe('unknown');
    agent().dropSession(agent().createdByKey.get(out.k1));
    const chk = await p.checkFork(out.k1);
    expect(chk).toMatchObject({ k: 'refused', reason: 'gone' });
    expect(retires()).toHaveLength(1);
    expect(forkRecs2()).toHaveLength(0);
  });
  it('an engine that ends while its Check is reading still finishes the Check under T (retire, drop) and frees T afterwards', async () => {
    const { p, sid, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    const real = agent().createKeyGet.bind(agent());
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    let inRead!: () => void;
    const reading = new Promise<void>((r) => { inRead = r; });
    agent().createKeyGet = async (...a: unknown[]) => { inRead(); await gate; return (real as any)(...a); };
    const pr = p.checkFork(out.k1);
    await reading;
    p.end();
    expect(await tHeld(tName(sid, 1)), 'T is held while the Check reads').toBe(true);
    open();
    const chk = await pr;
    expect(chk).toMatchObject({ k: 'refused', reason: 'none' });
    expect(retires()).toHaveLength(1);
    expect(forkRecs2()).toHaveLength(0);
    expect(await tHeld(tName(sid, 1)), 'T is free afterwards').toBe(false);
  });
  it('dismissFork never inserts a missing record, never touches a moved one and needs the fork identity to agree', async () => {
    const { p, bounds } = await parent2(2);
    agent().o.createLostBefore = true;
    const out = (await p.fork(spec2(bounds, 1))) as any;
    agent().o.createLostBefore = false;
    const fk = forkRecs2()[0].fk;
    const before = w!.fs.peek(JOURNAL);
    expect(await w!.j.dismissFork(HANDLE, REALM, 'k-missing', ACCOUNT), 'a missing key').toBe(false);
    expect(await w!.j.dismissFork(HANDLE, REALM, out.k1, ACCOUNT, { ...fk, i: (fk.i ?? 0) + 7 }), 'another fork identity').toBe(false);
    expect(w!.fs.peek(JOURNAL), 'nothing was written').toBe(before);
    expect(await w!.j.dismissFork(HANDLE, REALM, out.k1, ACCOUNT, fk), 'the real one').toBe(true);
    expect(forkRecs2()[0].dk).toContain(out.k1);
    // a record at the create id that is no unresolved fork (it names a session, or names no fork) is never touched
    const id = `${HANDLE}|${REALM}|create:${out.k1}`;
    const d0 = doc();
    seedDoc({ ...d0, [id]: { ...d0[id], s: 'sess-moved' } });
    const moved = w!.fs.peek(JOURNAL);
    expect(await w!.j.dismissFork(HANDLE, REALM, out.k1, ACCOUNT), 'a record at a session').toBe(false);
    expect(w!.fs.peek(JOURNAL), 'the moved record is untouched').toBe(moved);
    const { fk: _fk, ...noFork } = { ...d0[id], s: null } as any;
    seedDoc({ ...d0, [id]: noFork });
    const plain = w!.fs.peek(JOURNAL);
    expect(await w!.j.dismissFork(HANDLE, REALM, out.k1, ACCOUNT), 'a record that names no fork').toBe(false);
    expect(w!.fs.peek(JOURNAL), 'the plain record is untouched').toBe(plain);
  });
});

describe('J a recovery is bound to the account its io was made for', () => {
  // Both accounts hold the same create key and target. A recovery built for ACCOUNT (its io is ACCOUNT's agent connection) must never read or
  // retire through that io while OTHER is the shown account: it would fence a key of OTHER's journal with ACCOUNT's connection.
  const planted = (): Record<string, unknown> => {
    const all = JSON.parse(w!.fs.peek(JOURNAL) ?? '{"v":1,"a":{}}');
    all.a[OTHER] = { [`${HANDLE}|${REALM}|create:${key(1)}`]: { h: HANDLE, ...fork(1) } };
    w!.fs.seed(JOURNAL, JSON.stringify(all));
    return all.a[OTHER];
  };
  const otherDoc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL) ?? 'null')?.a?.[OTHER] ?? {}; } catch { return {}; } };
  const built = (io: any, acct = ACCOUNT) => new ForkRecovery({ io, j: w!.j, handle: HANDLE, realm: REALM, acct, alive: () => true });
  it('J1 after the account switched, check reads nothing, retires nothing and leaves the other account\'s record intact', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const before = planted();
    const io = stubIO({ createKeyGet: () => Promise.reject({ status: 404, code: 'create_not_found' }), createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    const fr = built(io);
    showAccount(OTHER);
    const out = await fr.check(key(1));
    showAccount(ACCOUNT);
    expect(out).toMatchObject({ k: 'unknown', reason: 'account', k1: key(1) });
    expect(io.calls.createKeyGet ?? 0, 'no read through the old account\'s io').toBe(0);
    expect(io.calls.createKeyRetire ?? 0, 'no retire through it').toBe(0);
    expect(otherDoc(), 'the other account\'s record is intact').toEqual(before);
  });
  it('J2 hide, pending and pendingElsewhere refuse for an account that is no longer the shown one; they work for the one it was built for', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const before = planted();
    const fr = built(stubIO({}));
    expect(fr.pending()!.map((x) => x.k1), 'the bound account is read').toEqual([key(1)]);
    showAccount(OTHER);
    expect(fr.pending(), 'pending').toBeNull();
    expect(fr.pendingElsewhere(), 'pendingElsewhere').toBeNull();
    expect(await fr.hide(key(1)), 'hide').toBe(false);
    expect(otherDoc(), 'the other account\'s record is intact (not hidden)').toEqual(before);
    showAccount(ACCOUNT);
    expect(await fr.hide(key(1)), 'hide for the bound account hides it').toBe(true);
  });
  it('J3 an account that moves while the key is being read stops the Check before the retire', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const io = stubIO({ createKeyGet: () => { showAccount(OTHER); return Promise.reject({ status: 404, code: 'create_not_found' }); }, createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    const out = await built(io).check(key(1));
    showAccount(ACCOUNT);
    expect(out).toMatchObject({ k: 'unknown', reason: 'account' });
    expect(io.calls.createKeyGet).toBe(1);
    expect(io.calls.createKeyRetire ?? 0, 'the retire is never sent for an account that is not shown').toBe(0);
    expect(open(), 'the record stays').toHaveLength(1);
  });
  it('J4 a recovery built with no account refuses everything', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const io = stubIO({ createKeyGet: () => Promise.reject({ status: 404, code: 'create_not_found' }) });
    const fr = built(io, '');
    expect(await fr.check(key(1))).toMatchObject({ k: 'unknown', reason: 'account' });
    expect(await fr.hide(key(1))).toBe(false);
    expect(fr.pending()).toBeNull();
    expect(io.calls.createKeyGet ?? 0).toBe(0);
  });
  it('J5 an account that moves between the journal guard and the deferred io call: the call is never made (readFork and retireFork)', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    // readFork: the guard passes in the synchronous part, the io call runs in a later microtask; the page moves in between.
    const io1 = stubIO({ createKeyGet: () => Promise.reject({ status: 404, code: 'create_not_found' }) });
    const p = w.j.readFork(io1, scope(), REALM, key(1), null);
    showAccount(OTHER);
    const rd = await p;
    showAccount(ACCOUNT);
    expect(rd.v).toMatchObject({ t: 'unknown', why: 'account' });
    expect(rd.settled).toBe('none');
    expect(io1.calls.createKeyGet ?? 0, 'readFork: no read for an account that is not shown').toBe(0);
    // retireFork: the move happens right after its last look at the record, before the retire call.
    const io2 = stubIO({ createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    const recs: any = recordsForTests(w.j);
    const real = recs.lookupK1.bind(recs);
    recs.lookupK1 = (...a: unknown[]) => { const r = real(...a); showAccount(OTHER); return r; };
    const hold = await holdIfFree(lockNameOf(fork(1), scope()));
    let v: any;
    try { v = await w.j.retireFork(io2, hold, scope(), REALM, key(1), { s: 'sess-p1', i: 1 }); } finally { recs.lookupK1 = real; showAccount(ACCOUNT); hold!.release(); }
    expect(v).toMatchObject({ t: 'unknown', why: 'account' });
    expect(io2.calls.createKeyRetire ?? 0, 'retireFork: no retire for an account that is not shown').toBe(0);
    expect(open(), 'the record stays').toHaveLength(1);
  });
  it('J6 a Check of a missing record whose read ends after the account moved is unknown (account), never a definite untracked', async () => {
    w = world();
    const io = stubIO({ createKeyGet: () => { showAccount(OTHER); return Promise.reject({ status: 404, code: 'create_not_found' }); } });
    const out = await built(io).check(key(1));
    showAccount(ACCOUNT);
    expect(out).toMatchObject({ k: 'unknown', reason: 'account', k1: key(1) });
    expect(io.calls.createKeyGet).toBe(1);
  });
  it('J7 a Check whose settlement continuation ends after the account moved says unknown (account), not the definite none', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const io = stubIO({ createKeyGet: () => Promise.reject({ status: 404, code: 'create_not_found' }), createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    const realDrop = w.j.drop.bind(w.j);
    (w.j as any).drop = async (...a: any[]) => { const r = await (realDrop as any)(...a); showAccount(OTHER); return r; };
    const out = await built(io).check(key(1));
    showAccount(ACCOUNT);
    expect(io.calls.createKeyRetire).toBe(1);
    expect(out, 'the fork was fenced and dropped, but the page that asked is no longer shown').toMatchObject({ k: 'unknown', reason: 'account' });
  });
  it('J8 a Check\'s answer carries the account it was decided for: read after the account moved it is unknown (account), whatever it was', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const io = stubIO({ createKeyGet: () => Promise.reject({ status: 404, code: 'create_not_found' }), createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    const o = forkOutcome(await built(io).check(key(1)));
    expect(o, 'the Check ended the fork for the shown account').toMatchObject({ k: 'refused', reason: 'none' });
    expect(forkNow(o), 'still shown: acted on as it is').toBe(o);
    showAccount(OTHER);
    const now = forkNow(o);
    showAccount(ACCOUNT);
    expect(now).toMatchObject({ k: 'unknown', reason: 'account', k1: key(1) });
  });
  it('J9 a Check of a missing record whose account goes A -> B -> A during the read is still unknown (account), not untracked', async () => {
    w = world();
    const fr = built(stubIO({ createKeyGet: () => { showAccount(OTHER); return Promise.reject({ status: 404, code: 'create_not_found' }); } }));
    // The page comes back before the final seal looks (the definite ending is the moment it returns).
    const real = (fr as any).refused.bind(fr);
    (fr as any).refused = (...a: unknown[]) => { showAccount(ACCOUNT); return real(...a); };
    const out = await fr.check(key(1));
    showAccount(ACCOUNT);
    expect(out).toMatchObject({ k: 'unknown', reason: 'account', k1: key(1) });
  });
  it('J10 an unknown outcome keeps its own reason when the account moved (the seal rewrites only definite endings)', async () => {
    w = world();
    plant(fork(1)); entry(key(1));
    const io = stubIO({ createKeyGet: () => Promise.reject({ status: 404, code: 'create_not_found' }), createKeyRetire: () => ({ retired: true, admitted: 'false' }) });
    // The store refuses every drop and the page moves while it does: the fork was fenced but its record stays, which the Check says as notRemembered.
    (w.j as any).drop = async () => { showAccount(OTHER); return false; };
    const out = await built(io).check(key(1));
    showAccount(ACCOUNT);
    expect(io.calls.createKeyRetire).toBe(1);
    expect(out).toMatchObject({ k: 'unknown', reason: 'notRemembered', k1: key(1) });
  });
  it('J11 every Check answer is stamped with its account, the engine\'s not-journaled refusal and the unbound early return included', async () => {
    w = world();
    const a = await w.dock();
    const raw = await a.checkFork(key(1));
    expect(raw, 'a chat that is not journaled yet').toMatchObject({ k: 'refused', reason: 'notRemembered', acct: ACCOUNT, asked: key(1) });
    const o = forkOutcome(raw);
    showAccount(OTHER);
    const now = forkNow(o);
    showAccount(ACCOUNT);
    expect(now).toMatchObject({ k: 'unknown', reason: 'account', k1: key(1) });
    plant(fork(1)); entry(key(1));
    const fr = built(stubIO({}));
    showAccount(OTHER);
    const early = await fr.check(key(1));
    showAccount(ACCOUNT);
    expect(early).toMatchObject({ k: 'unknown', reason: 'account', acct: ACCOUNT, asked: key(1) });
  });
  // The walk: every way a Check can end (the recovery's own paths and the engine's not-journaled refusal) carries the account it was decided for and the key
  // that was checked. They are built by the one constructor `checkAnswer`; a path that bypasses it is red here.
  const get404 = (): Promise<never> => Promise.reject({ status: 404, code: 'create_not_found' });
  const WALK: Array<[string, string, () => Promise<any>]> = [
    ['the account is not the shown one at the start', ACCOUNT, async () => { plant(fork(1)); entry(key(1)); const fr = built(stubIO({})); showAccount(OTHER); try { return await fr.check(key(1)); } finally { showAccount(ACCOUNT); } }],
    ['a recovery built with no account', '', async () => built(stubIO({}), '').check(key(1))],
    ['no record at all (stale row)', ACCOUNT, async () => built(stubIO({ createKeyGet: get404 })).check(key(1))],
    ['the fork never made: fenced, dropped, none', ACCOUNT, async () => { plant(fork(1)); entry(key(1)); return built(stubIO({ createKeyGet: get404, createKeyRetire: () => ({ retired: true, admitted: 'false' }) })).check(key(1)); }],
    ['the target lock is held elsewhere: busy', ACCOUNT, async () => {
      plant(fork(1)); entry(key(1));
      const release = await holdName(forkLockName(ACCOUNT, HANDLE, REALM, fork(1).fk));
      try { return await built(stubIO({ createKeyGet: get404 })).check(key(1)); } finally { release(); }
    }],
    ['two Checks of one key share one flight', ACCOUNT, async () => {
      plant(fork(1)); entry(key(1));
      const fr = built(stubIO({ createKeyGet: get404, createKeyRetire: () => ({ retired: true, admitted: 'false' }) }));
      const [a, b] = await Promise.all([fr.check(key(1)), fr.check(key(1))]);
      expect(b, 'the second caller\'s answer is stamped too').toMatchObject({ acct: ACCOUNT, asked: key(1) });
      return a;
    }],
    ['the engine\'s chat is not journaled', ACCOUNT, async () => (await w!.dock()).checkFork(key(1))],
  ];
  it.each(WALK)('J12 walk: %s -> the answer is stamped with its account and the checked key', async (_name, acct, go) => {
    w = world();
    const out = await go();
    expect(out.acct, JSON.stringify(out)).toBe(acct);
    expect(out.asked, JSON.stringify(out)).toBe(key(1));
    expect(['opened', 'refused', 'unknown']).toContain(out.k);
  });
});

describe('K the queue of the record lock', () => {
  it('a drop, a replacement claim and a dismissal queued on the record lock are served in that order: the document is written with 7 and then 8 unresolved forks, and the dismissal of the dropped key writes nothing', async () => {
    w = world();
    for (let n = 1; n <= 8; n++) { plant(fork(n)); entry(key(n)); }
    expect(open(), 'eight unresolved forks, all with a request entry').toHaveLength(8);
    // The count is read from the bytes of each write to the record document, at the write itself (not from the callers' promises).
    const written: number[] = [];
    const realSet = w.fs.setItem.bind(w.fs);
    vi.spyOn(w.fs, 'setItem').mockImplementation((k: string, v: string) => {
      realSet(k, v);
      if (k === JOURNAL) written.push(Object.values(JSON.parse(v)?.a?.[ACCOUNT] ?? {}).filter((r: any) => r.fk && r.s === null).length);
    });
    const release = await holdName(recsLockName(ACCOUNT));
    const queued: Array<Promise<unknown>> = [];
    try {
      // A's drop of K1 holds the record lock (here: the test does); A's replacement claim is queued, then B's dismissal of K1.
      const drop = w.j.drop(HANDLE, REALM, null, key(1), ACCOUNT);
      const replacement = claim(fork(20, { fk: { s: 'sess-z', i: 0 } }));
      const dismissal = w.j.dismissFork(HANDLE, REALM, key(1), ACCOUNT, { s: 'sess-p1', i: 1 });
      queued.push(drop, replacement, dismissal);
      const done: string[] = [];
      void drop.then(() => done.push('drop')); void replacement.then(() => done.push('claim')); void dismissal.then(() => done.push('dismiss'));
      await settleReal(20);
      expect(done, 'all three wait for the lock').toEqual([]);
      expect(written, 'nothing was written meanwhile').toEqual([]);
      release();
      const [dropped, claimed, dismissed] = await Promise.all([drop, replacement, dismissal]);
      expect(done, 'answered in the order they queued').toEqual(['drop', 'claim', 'dismiss']);
      expect(written, 'the drop wrote 7 unresolved, the claim wrote 8, the dismissal wrote nothing').toEqual([7, 8]);
      expect(dropped).toBe(true);
      expect(claimed, 'the freed slot took the replacement').toMatchObject({ t: 'claimed', k1: key(20) });
      expect(dismissed, 'the dismissal came after the drop: it finds no K1 and writes nothing').toBe(false);
      expect(open(), 'eight unresolved at the end').toHaveLength(8);
      expect(open().map((r: any) => r.k1)).not.toContain(key(1));
      expect(Object.values(doc()).some((r: any) => (r.dk ?? []).includes(key(1))), 'no hidden-key trace of K1').toBe(false);
    } finally {
      release(); // idempotent: a red run still frees the lock and lets every queued operation finish before the world is disposed
      await Promise.allSettled(queued);
    }
  });
});
