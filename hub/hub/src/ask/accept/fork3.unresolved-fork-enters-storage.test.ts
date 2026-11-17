// Acceptance, group FORK, part 3. The durable record and the agent's log are read from the
// raw bytes, never from the code under test. (Dismissal, the claim lease and the retire moved to the fork recovery tests, with their groups.)
//   A  an unresolved fork enters storage only through claimFork; lost answers never fill the capacity
//   B  Records.put keeps the (t, k2, ph) unit, the fences and the fork identity of the source across a create -> session move
//      (a source with no turn and no session is a source too)
//   C  moveCreate certifies a destination only when its identity is the source's
//   D  a claim whose send never began is released
//   E  the keys are minted only after the claim decided who owns the fork
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type * as F from '../fork';
import * as R from '../journal/records';
import { recsLockName } from '../journal/locks';
import { recordsForTests, seedEntryForTests } from '../journal/testing';
import { ACCOUNT, HANDLE, JOURNAL, REALM, slot, world, type World } from './env';
import { installTryLocks } from './try-locks';

let w: World | null = null;
// A fork press TRIES the target lock (ifAvailable): the suite's default lock grants every request in turn, so these use one that honours it.
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const FORKS_MAX: number = (R as any).FORKS_MAX ?? 8;
const flush = (n = 900) => w!.flush(n);
const agent = (): any => w!.agent as any;
const creates = (): any[][] => w!.agent.log.filter((x) => x[0] === 'create').map((x) => x[1] as any[]);
const forkCreates = () => creates().filter((a) => 'fork' in a[0]);
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL) ?? 'null')?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const seedDoc = (d: Record<string, any>) => { const raw = w!.fs.peek(JOURNAL); const all = raw ? JSON.parse(raw) : { v: 1, a: {} }; all.a[ACCOUNT] = d; w!.fs.seed(JOURNAL, JSON.stringify(all)); };
const forkRecs = () => Object.values(doc()).filter((r: any) => r.fk);
const open = () => forkRecs().filter((r: any) => r.s === null);
const key = (n: number, c = 'a') => 'hx-' + c + n.toString(16).padStart(31, '0');
const TPL = { p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, rc: 'custom', n: null, i: null, q: 0, ph: 'completed', l: 'en' };
const fork = (n: number, over: Record<string, unknown> = {}): any => ({ ...TPL, k1: key(n), k2: key(n, 'b'), at: 1000 + n, fk: { s: `sess-p${n}`, i: n }, ...over });
/** The one inserter of an unresolved fork: the claim (its keys come from `mint`, here the record's own). */
const claim = (rec: any, j: any = w!.j): Promise<any> => j.claimFork(HANDLE, rec, () => ({ k1: rec.k1, k2: rec.k2 }), ACCOUNT);
/** A record planted straight into the raw bytes (the way another tab or an older build left it). */
function plant(rec: any, sid: string | null = rec.s): void {
  const d = doc();
  d[sid === null ? `${HANDLE}|${REALM}|create:${rec.k1}` : `${HANDLE}|${REALM}|${sid}`] = { h: HANDLE, ...rec };
  seedDoc(d);
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

async function parentChat(turns = 2) {
  w = world();
  const a = await w.dock();
  a.send('first');
  await flush(1500);
  const sid = a.record!.s!;
  const p = w.pinned(sid);
  p.open();
  await flush(900);
  for (let i = 1; i < turns; i++) { p.send(`turn ${i + 1}`); await flush(1500); }
  const bounds = (await p.turnPins())!;
  return { a, p, sid, bounds };
}
const spec = (bounds: readonly number[], turn: number): F.ForkSpec => ({ turn, pin: bounds[turn] as number });

describe('A an unresolved fork enters storage only through the claim; lost answers never fill the capacity', () => {
  it('a direct put() of a NEW unresolved fork is refused at every count: the claim is the only inserter', async () => {
    w = world();
    expect(await w.j.put(HANDLE, fork(1))).toBe('lost');
    expect(open()).toHaveLength(0);
    for (let n = 0; n < FORKS_MAX; n++) expect((await claim(fork(n))).t).toBe('claimed');
    expect(await w.j.put(HANDLE, fork(40))).toBe('lost');
    expect(open(), 'a ninth is not stored').toHaveLength(FORKS_MAX);
  });
  it('65 direct puts of new unresolved forks store none', async () => {
    w = world();
    for (let n = 0; n < 65; n++) expect(await w.j.put(HANDLE, fork(n))).toBe('lost');
    expect(Object.keys(doc())).toHaveLength(0);
  });
  it('a put() that updates an unresolved fork already stored, and the create -> session move of one, still work', async () => {
    w = world();
    expect((await claim(fork(1))).t).toBe('claimed');
    expect(await w.j.put(HANDLE, fork(1, { at: 5000 }))).toBe('ok');
    expect(open()[0]).toMatchObject({ at: 5000, fk: { s: 'sess-p1', i: 1 } });
    expect(await recordsForTests(w.j).moveCreate(HANDLE, REALM, key(1), 'sess-5')).toBeTruthy();
    expect(Object.keys(doc())).toEqual([`${HANDLE}|${REALM}|sess-5`]);
  });
  it('lost answers ARE kept: 8 lost forks fill the capacity, the ninth and tenth are refused as full, and a fresh page meets the same records', async () => {
    const { p, sid, bounds } = await parentChat(10);
    const outs: any[] = [];
    const real = agent().create.bind(agent());
    agent().create = async (...a: unknown[]) => { await real(...a); return Promise.reject({ pending: true, kind: 'pending' }); };   // every answer is lost
    for (let t = 0; t < 10; t++) outs.push(await p.fork(spec(bounds, t)));
    expect(outs.filter((o) => o.k === 'unknown'), 'eight unknown').toHaveLength(8);
    expect(outs.filter((o) => o.k === 'refused' && o.reason === 'full'), 'two refused for capacity').toHaveLength(2);
    expect(forkCreates(), 'only the eight were sent').toHaveLength(8);
    expect(open(), 'the eight records are the block').toHaveLength(8);
    for (let t = 0; t < 8; t++) expect((await p.fork(spec(bounds, t))), 'each is pending').toMatchObject({ k: 'unknown', reason: 'pending' });
    expect(forkCreates()).toHaveLength(8);
    agent().create = real;
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    expect((await pB.fork(spec(bounds, 3))), 'a fresh page meets the stored record').toMatchObject({ k: 'unknown', reason: 'pending' });
    expect((await pB.fork(spec(bounds, 9))), 'and the capacity').toMatchObject({ k: 'refused', reason: 'full' });
    expect(forkCreates()).toHaveLength(8);
  });
});

describe('B put() moves a record from create:<k1> to its session as one unit', () => {
  const K = key(5, 'e'), Kold = key(6, 'e');
  const src = (over: Record<string, unknown> = {}): any => ({ ...fork(1), k1: key(1), k2: K, fk: { s: 'sess-1', i: 2 }, ...over });
  const to = (over: Record<string, unknown> = {}): any => ({ ...src(), s: 'sess-5', ...over });
  const at = (): any => doc()[`${HANDLE}|${REALM}|sess-5`];
  it('a stale turn paired with the fenced current key is not accepted and the fences survive the move', async () => {
    w = world();
    plant(src({ dk: [K], na: [K] }));
    await w.j.put(HANDLE, to({ t: 'turn-stale', k2: K, ph: 'working' }));
    const r = at() ?? doc()[`${HANDLE}|${REALM}|create:${key(1)}`];
    expect(r.t, 'no stale turn').toBeNull();
    expect(r.dk).toContain(K);
    expect(r.na).toContain(K);
    expect(r.ph).toBe('completed');
  });
  it('a turn paired with a key the source fenced (not the current one) keeps the source key and no turn', async () => {
    w = world();
    plant(src({ dk: [Kold], na: [Kold] }));
    await w.j.put(HANDLE, to({ t: 'turn-1', k2: Kold, ph: 'working' }));
    const r = at() ?? doc()[`${HANDLE}|${REALM}|create:${key(1)}`];
    expect(r.k2).toBe(K);
    expect(r.t).toBeNull();
    expect(r.dk).toContain(Kold);
  });
  it('a save that knows no turn keeps the source turn, its key and its phase across the move', async () => {
    w = world();
    plant(src({ t: 'turn-1', ph: 'working' }));
    expect(await w.j.put(HANDLE, to({ t: null, k2: Kold, ph: 'completed' }))).toBe('ok');
    expect(at()).toMatchObject({ t: 'turn-1', k2: K, ph: 'working' });
  });
  it('the fences the source holds are kept when the save omits them', async () => {
    w = world();
    plant(src({ dk: [Kold], na: [Kold] }));
    expect(await w.j.put(HANDLE, to())).toBe('ok');
    expect(at().dk).toEqual([Kold]);
    expect(at().na).toEqual([Kold]);
    expect(doc()[`${HANDLE}|${REALM}|create:${key(1)}`], 'the source is gone').toBeUndefined();
  });
  // A source with no turn AND no session (the create record) is a source too: its key and phase are the chat's.
  const turnless = (kind: 'fork' | 'ordinary') => (over: Record<string, unknown> = {}): any => ({ ...src(kind === 'ordinary' ? { fk: undefined } : {}), ...over });
  for (const kind of ['fork', 'ordinary'] as const) {
    const mk = turnless(kind);
    const where = () => at() ?? doc()[`${HANDLE}|${REALM}|create:${key(1)}`];
    it(`${kind}: a turnless move onto a key the source fenced keeps the stored key and phase`, async () => {
      w = world();
      plant(mk({ k2: K, ph: 'completed', dk: [Kold], na: [Kold] }));
      expect(await w.j.put(HANDLE, { ...mk(), s: 'sess-5', t: null, k2: Kold, ph: 'sending' })).toBe('ok');
      expect(where()).toMatchObject({ t: null, k2: K, ph: 'completed' });
      expect(where().dk).toContain(Kold);
      expect(where().na).toContain(Kold);
    });
    it(`${kind}: a turnless move onto a new, unfenced key keeps the stored key (the key unit is the source's)`, async () => {
      w = world();
      plant(mk({ k2: K, ph: 'completed' }));
      expect(await w.j.put(HANDLE, { ...mk(), s: 'sess-5', t: null, k2: key(7, 'e'), ph: 'working' })).toBe('ok');
      expect(where()).toMatchObject({ t: null, k2: K, ph: 'completed' });
    });
    it(`${kind}: a turnless move with a stale phase keeps the stored phase`, async () => {
      w = world();
      plant(mk({ k2: K, ph: 'sending' }));
      expect(await w.j.put(HANDLE, { ...mk(), s: 'sess-5', t: null, k2: K, ph: 'completed' })).toBe('ok');
      expect(where()).toMatchObject({ t: null, k2: K, ph: 'sending' });
    });
    it(`${kind}: the stored key is still what firstState reads after such a move`, async () => {
      w = world();
      plant(mk({ k2: K, ph: 'completed', dk: [Kold], na: [Kold] }));
      await w.j.put(HANDLE, { ...mk(), s: 'sess-5', t: null, k2: Kold, ph: 'sending' });
      expect(w.j.firstState(HANDLE, REALM, key(1), K).id, 'the stored key is still the current first key').toBe('R4');
    });
  }
  it('a create-shaped source (t:null, s:null) with a fenced F and a session save of F as working keeps K', async () => {
    w = world();
    const F2 = key(8, 'e');
    plant(src({ k2: K, ph: 'completed', dk: [F2], na: [F2] }));
    expect(await w.j.put(HANDLE, to({ t: null, k2: F2, ph: 'working' }))).toBe('ok');
    expect(at()).toMatchObject({ t: null, k2: K, ph: 'completed' });
  });
  it('a save at the address that already holds the record is not a move: its own phase still lands', async () => {
    w = world();
    plant({ ...src({ k2: K, ph: 'completed' }), s: 'sess-5' });
    expect(await w.j.put(HANDLE, to({ s: 'sess-5', t: null, k2: K, ph: 'working' }))).toBe('ok');
    expect(at()).toMatchObject({ k2: K, ph: 'working' });
  });
  it('the fork identity is the source\'s: omitted, changed, or newly introduced', async () => {
    w = world();
    plant(src());
    expect(await w.j.put(HANDLE, to({ fk: undefined }))).toBe('ok');
    expect(at().fk, 'omitted').toEqual({ s: 'sess-1', i: 2 });
    seedDoc({});
    plant(src());
    expect(await w.j.put(HANDLE, to({ fk: { s: 'sess-9', i: 0 } }))).toBe('ok');
    expect(at().fk, 'changed').toEqual({ s: 'sess-1', i: 2 });
    seedDoc({});
    plant(src({ fk: undefined }));
    expect(await w.j.put(HANDLE, to({ fk: { s: 'sess-9', i: 0 } }))).toBe('ok');
    expect(at().fk, 'a chat that was not a fork does not become one by moving').toBeUndefined();
  });
});

describe('C moveCreate certifies only a destination that is this chat', () => {
  const K1 = key(1);
  const src = (over: Record<string, unknown> = {}): any => ({ ...fork(1), fk: { s: 'sess-1', i: 2 }, ...over });
  const dest = (over: Record<string, unknown> = {}): any => ({ ...TPL, s: 'sess-9', t: 'turn-9', k1: key(9), k2: key(9, 'b'), at: 1, ...over });
  const mv = () => recordsForTests(w!.j).moveCreate(HANDLE, REALM, K1, 'sess-9');
  it('an unrelated record at the child session (another k1, no fork identity) keeps the source and is not certified', async () => {
    w = world();
    plant(src());
    plant(dest(), 'sess-9');
    expect(await mv()).toBeNull();
    expect(doc()[`${HANDLE}|${REALM}|create:${K1}`], 'the source stays').toBeTruthy();
    expect(doc()[`${HANDLE}|${REALM}|sess-9`].k1).toBe(key(9));
  });
  it('the same k1 at the destination but without the fork identity (or another one) is a conflict', async () => {
    w = world();
    plant(src());
    plant(dest({ k1: K1, fk: undefined }), 'sess-9');
    expect(await mv()).toBeNull();
    expect(doc()[`${HANDLE}|${REALM}|create:${K1}`]).toBeTruthy();
    plant(dest({ k1: K1, fk: { s: 'sess-2', i: 2 } }), 'sess-9');
    expect(await mv()).toBeNull();
    plant(dest({ k1: K1, fk: { s: 'sess-1', i: 3 } }), 'sess-9');
    expect(await mv(), 'same parent, another turn').toBeNull();
    expect(doc()[`${HANDLE}|${REALM}|create:${K1}`]).toBeTruthy();
  });
  it('another k1 at the destination, even with the same fork identity, is a conflict', async () => {
    w = world();
    plant(src());
    plant(dest({ k1: key(9), fk: { s: 'sess-1', i: 2 } }), 'sess-9');
    expect(await mv()).toBeNull();
    expect(doc()[`${HANDLE}|${REALM}|create:${K1}`]).toBeTruthy();
  });
  it('the same k1 and the same fork identity at the destination: the source folds into it and the handoff is kept', async () => {
    w = world();
    plant(src());
    plant(dest({ k1: K1, fk: { s: 'sess-1', i: 2 } }), 'sess-9');
    expect(await mv()).toBeTruthy();
    expect(doc()[`${HANDLE}|${REALM}|create:${K1}`]).toBeUndefined();
  });
  it('no source: a destination of another k1 certifies nothing; one of this k1 does', async () => {
    w = world();
    plant(dest(), 'sess-9');
    expect(await mv()).toBeNull();
    plant(dest({ k1: K1, fk: { s: 'sess-1', i: 2 } }), 'sess-9');
    expect(await mv()).toBeTruthy();
  });
});

describe('D a claim whose send never began is released', () => {
  it('the engine ends while the claim waits for the record lock: no fork is left, and the next Fork makes one', async () => {
    const { p, sid, bounds } = await parentChat(2);
    const release = await holdName(recsLockName(ACCOUNT));
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    p.end();
    release();
    await flush(900);
    await f;
    await flush(300);
    expect(forkCreates(), 'nothing was sent').toHaveLength(0);
    expect(open(), 'no blocker is left').toHaveLength(0);
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    expect((await pB.fork(spec(bounds, 1))).k, 'a new Fork is not a join of a dead key').toBe('opened');
    expect(forkCreates()).toHaveLength(1);
  });
});

describe('E the keys are minted only after the claim decided who owns the fork', () => {
  it('two journals racing for the same fork mint one create key and one turn key between them, and send once', async () => {
    const { p, sid, bounds } = await parentChat(2);
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    const real = agent().create.bind(agent());
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    agent().create = (...a: unknown[]) => { n++; const r = real(...a); return n === 1 ? gate.then(() => r) : r; };
    const mintA = vi.spyOn(w!.j, 'mint');
    const mintB = vi.spyOn(w!.jB, 'mint');
    const a = p.fork(spec(bounds, 1));
    const b = pB.fork(spec(bounds, 1));
    await flush(900);
    release();
    await flush(900);
    await Promise.all([a, b]);
    const minted = [...mintA.mock.calls, ...mintB.mock.calls].map((c) => c[0]).filter((r) => r === 'create' || r === 'turn');
    expect(minted.sort(), 'the winner minted its two keys, the joiner none').toEqual(['create', 'turn']);
    expect(forkCreates()).toHaveLength(1);
  });
  it('a capacity-refused caller mints nothing', async () => {
    const { p, bounds } = await parentChat(2);
    // Eight creates in flight: each has claimed and written its request entry (a claim with no entry never left, and is freed by the next claim).
    for (let n = 0; n < FORKS_MAX; n++) {
      const c = await claim(fork(n));
      expect(c.t).toBe('claimed');
      expect(seedEntryForTests(w!.j, { k: c.k1, kind: 'create', h: HANDLE, r: REALM, s: null, c: c.k1, ct: slot.computer, at: 1 } as any)).toBe('ok');
    }
    const mint = vi.spyOn(w!.j, 'mint');
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'refused', key: 'ask.forkFull' });
    expect(mint.mock.calls.filter((c) => c[0] === 'create' || c[0] === 'turn')).toHaveLength(0);
  });
});
