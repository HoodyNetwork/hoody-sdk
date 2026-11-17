// Clear list: the Recent popover's "Clear list…" hides dock references that PROVE finished and never
// deletes anything. Real engines over the journal-backed dock store (per-key operations under the dock lock), two tabs over one fake storage,
// the fixture agent (its state reads overridden per session where a case needs a lie, a delay or an error).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { removeTestLocks } from '../core/test/locks';
import { readStore, writeStore } from './data';
import { AskEngine, type StoreIO } from './engine';
import * as L from './logic';
import type { AskRecord } from './logic';
import { dockLockName } from './journal/locks';
import { ACCOUNT, HANDLE, JOURNAL, OTHER, REALM, REQ, RID, showAccount, slot, tick, world, type World } from './accept/env';
import * as S from './accept/seam';
import { clearCandidates, idleKeys, judgeVerification } from './recentClear';
import REGISTRY from './registry.ts?raw';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const hex = (n: number) => 'hx-' + n.toString(16).padStart(32, '0');
const stored = (): AskRecord[] => (readStore(ACCOUNT).a[ACCOUNT] ?? []) as AskRecord[];
const ids = (l: readonly { k1: string }[]) => l.map((r) => r.k1);
type Over = Record<string, unknown>;

/** Sessions the fixture agent holds (idle), and dock records pointing at them (newest first). */
async function seedConvs(n: number, rec: (i: number, sid: string) => Record<string, unknown> = () => ({})): Promise<{ sids: string[]; recs: AskRecord[] }> {
  const sids: string[] = [];
  for (let i = 1; i <= n; i++) {
    const c = (await w!.agent.create(L.createBody(REALM, 'c1')!, 'key-' + i, REALM)) as { session_id: string };
    sids.push(c.session_id);
  }
  const recs = sids.map((s, j) => ({ p: slot.project, c: slot.computer, r: REALM, s, t: 'turn-' + (j + 1), k1: hex(j + 1), k2: hex(j + 101), rc: 'custom', n: null, at: 1000 - j, i: null, q: 0, ph: 'completed', l: 'en', ...rec(j + 1, s) }) as AskRecord);
  expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: recs } } as any)).toBe(true);
  return { sids, recs };
}
/** The state reads of chosen sessions, answered by `f` instead of the fixture agent (a lie, an error, a 404, a delay). */
function overrideState(f: (sid: string) => unknown | undefined): { reads: string[]; live: () => number; peak: () => number } {
  const real = (w!.agent as any).state.bind(w!.agent);
  const reads: string[] = [];
  let live = 0, peak = 0;
  (w!.agent as any).state = (sid: string) => {
    reads.push(sid);
    live++; peak = Math.max(peak, live);
    const r = f(sid);
    const done = <T,>(p: Promise<T>) => p.finally(() => { live--; });
    if (r === undefined) return done(real(sid));
    if (r instanceof Promise) return done(r);
    return done(r instanceof Error || (r && typeof r === 'object' && 'status' in (r as object)) ? Promise.reject(r) : Promise.resolve(r));
  };
  return { reads, live: () => live, peak: () => peak };
}
function dockStore(j = w!.j): StoreIO {
  return { read: (a: string) => j.dockRead(a, readStore(a)), apply: (a: string, op: any) => j.dockApplyLocked(a, op) } as StoreIO;
}
async function dockEng(o: { j?: any; inUse?: (sid: string) => boolean } = {}): Promise<AskEngine> {
  const j = o.j ?? w!.j;
  const eng = new AskEngine(slot, w!.agent, dockStore(j), w!.clock, { journal: { j, handle: HANDLE } });
  eng.inUse = o.inUse ?? (() => false);
  eng.open();
  await w!.flush(900);
  eng.newConversation();                                   // the engine shows a blank conversation: every stored one is a candidate for the plan
  await w!.flush(50);
  return eng;
}
/** A record the journal holds (planted raw, as the claim and the engine would have written it). */
function plant(rec: any): void {
  const raw = w!.fs.peek(JOURNAL);
  const all = raw ? JSON.parse(raw) : { v: 1, a: {} };
  all.a[ACCOUNT] = { ...(all.a[ACCOUNT] ?? {}), [`${HANDLE}|${rec.r}|${rec.s === null ? 'create:' + rec.k1 : rec.s}`]: { h: HANDLE, ...rec } };
  w!.fs.seed(JOURNAL, JSON.stringify(all));
}
const flush = async (ms = 50) => { await w!.flush(ms); for (let i = 0; i < 10; i++) await tick(); };
const keysOf = (p: { keys: readonly { k1: string }[] } | null) => (p ? ids(p.keys) : null);
const entry = (kind: string, k: string, over: Over = {}) => ({ k, kind, h: HANDLE, r: REALM, s: null, c: hex(1), ct: slot.computer, at: 1, ...over }) as any;

describe('the plan: which references prove finished', () => {
  it('finished, idle conversations are all candidates, in list order', async () => {
    w = world();
    const { recs } = await seedConvs(3);
    const eng = await dockEng();
    const plan = await eng.planClear();
    expect(keysOf(plan)).toEqual(recs.map((r) => r.k1));
    expect(plan!.keys.every((k) => k.s && k.r === REALM)).toBe(true);
  });
  it('the conversation this engine shows is never a candidate', async () => {
    w = world();
    const { recs } = await seedConvs(3);
    const eng = await dockEng();
    expect(eng.openConversation(recs[1]!.k1)).toBe(true);
    await flush();
    expect(keysOf(await eng.planClear())).toEqual([recs[0]!.k1, recs[2]!.k1]);
  });
  it('a conversation another engine holds (a pinned entry, lent or not) is kept', async () => {
    w = world();
    const { recs, sids } = await seedConvs(2);
    const eng = await dockEng({ inUse: (sid) => sid === sids[0] });
    expect(keysOf(await eng.planClear())).toEqual([recs[1]!.k1]);
  });
  it('a record with no session, and a stored phase that is not completed or gone, are kept', async () => {
    w = world();
    const { recs } = await seedConvs(5, (i) => ({ 3: { s: null, t: null }, 4: { ph: 'sending', t: null }, 5: { ph: 'failed' } })[i] ?? {});
    const eng = await dockEng();
    expect(keysOf(await eng.planClear())).toEqual([recs[0]!.k1, recs[1]!.k1]);
  });
  it('a gone record whose session the agent still has is read, and cleared when idle', async () => {
    w = world();
    const { recs } = await seedConvs(1, () => ({ ph: 'gone' }));
    const eng = await dockEng();
    expect(keysOf(await eng.planClear())).toEqual([recs[0]!.k1]);
  });
  const MARKS: Array<[string, Record<string, unknown>]> = [['an unsure mark (u is the record\'s turn)', { u: 'turn-1' }], ['an unsettled send (w)', { w: true }], ['an unsettled follow-up (k3)', { k3: [hex(900)] }], ['a decision in flight (da)', { da: { g: RID('d') } }]];
  for (const [what, over] of MARKS) {
    it(`old evidence in the stored record keeps it: ${what}`, async () => {
      w = world();
      await seedConvs(1);
      const eng = await dockEng();
      // the mark lands in the stored record after the engine opened (opening settles a record's own marks)
      expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: stored().map((r) => ({ ...r, ...over })) } } as any)).toBe(true);
      expect(keysOf(await eng.planClear())).toEqual([]);
    });
  }
  it('a journal entry about the conversation (its session, its create key or any key) keeps it', async () => {
    w = world();
    const { recs, sids } = await seedConvs(3);
    expect(S.writeEntry(w.j, entry('turn', hex(500), { s: sids[0], c: recs[0]!.k1 }))).toBe('ok');
    expect(S.writeEntry(w.j, entry('message', hex(501), { s: sids[1], c: hex(999) }))).toBe('ok');
    const eng = await dockEng();
    expect(keysOf(await eng.planClear())).toEqual([recs[2]!.k1]);
  });
  it('an unreadable journal scan keeps every record of the computer', async () => {
    w = world();
    await seedConvs(3);
    const eng = await dockEng();
    w.fs.blockReads(REQ);
    expect(keysOf(await eng.planClear())).toEqual([]);
  });
  it('a journal record that does not know its turn (or is still pairing a key) keeps the reference; an unreadable lookup too', async () => {
    w = world();
    const { recs } = await seedConvs(2);
    plant({ ...recs[0]!, t: null });
    const eng = await dockEng();
    expect(keysOf(await eng.planClear())).toEqual([recs[1]!.k1]);
    w.fs.blockReads(JOURNAL);
    expect(keysOf(await eng.planClear())).toEqual([]);
  });
  it('a fork from the conversation, a fork of it, or any unreadable fork on the computer and realm keeps it', async () => {
    w = world();
    const { recs, sids } = await seedConvs(3);
    plant({ ...recs[0]!, k1: hex(700), k2: hex(701), s: null, t: null, fk: { s: sids[0]!, i: null } });
    const eng = await dockEng();
    expect(keysOf(await eng.planClear())).toEqual([recs[1]!.k1, recs[2]!.k1]);
    plant({ ...recs[0]!, k1: hex(702), k2: hex(703), s: null, t: null, fk: 'unreadable' });
    expect(keysOf(await eng.planClear())).toEqual([]);
  });
  it('a lookup of its create key that cannot be read keeps it, whatever the other reads say', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    (w.j as any).lookupK1 = () => ({ t: 'unreadable' });
    expect(keysOf(await eng.planClear())).toEqual([]);
  });
  it('evidence the attached record carries (from the journal) keeps it', async () => {
    w = world();
    const { recs } = await seedConvs(2);
    const eng = await dockEng();
    const real = w.j.attach.bind(w.j);
    (w.j as any).attach = (h: string, r: AskRecord) => { const a = real(h, r); return a && r.k1 === recs[0]!.k1 ? { ...a, w: true } : a; };
    expect(keysOf(await eng.planClear())).toEqual([recs[1]!.k1]);
  });
  it('a record with a dock operation queued in this tab is kept', async () => {
    w = world();
    const { recs } = await seedConvs(2);
    const eng = await dockEng();
    let release!: () => void;
    await new Promise<void>((granted) => { void (navigator as any).locks.request(dockLockName(ACCOUNT), () => new Promise<void>((r) => { release = r; granted(); })); });
    const q = w.j.dockApplyLocked(ACCOUNT, { k: 'put', rec: { ...recs[0]!, ph: 'completed' } });
    expect(keysOf(await eng.planClear())).toEqual([recs[1]!.k1]);
    release();
    await q;
  });
});

describe('check 6: a fresh read of each candidate\'s own state', () => {
  it('only a clean idle body or a 404 qualifies; running, parked, malformed, another session, an error or a lost answer keep the record', async () => {
    w = world();
    const { recs, sids } = await seedConvs(8);
    const bodies: Over = {
      [sids[0]!]: { session_id: sids[0], state: 'running' },
      [sids[1]!]: { session_id: sids[1], state: 'parked' },
      [sids[2]!]: { session_id: 'other', state: 'idle' },
      [sids[3]!]: { state: 'idle', session_id: sids[3], pending_helper_gates: {} },
      [sids[4]!]: { status: 503 },
      [sids[5]!]: new Error('network'),
      [sids[6]!]: { status: 404 },
    };
    overrideState((sid) => bodies[sid]);
    const eng = await dockEng();
    expect(keysOf(await eng.planClear())).toEqual([recs[6]!.k1, recs[7]!.k1]);
  });
  it('a body that is null (an answer that does not say) is never idle', async () => {
    w = world();
    await seedConvs(2);
    overrideState(() => null);
    const eng = await dockEng();
    expect(keysOf(await eng.planClear())).toEqual([]);
  });
  it('every candidate is read, none from the shared activity, at most 4 at once; the plan and the confirm each read again', async () => {
    w = world();
    const { sids } = await seedConvs(8);
    const gates: Array<() => void> = [];
    let armed = false;
    const o = overrideState((sid) => (armed ? new Promise((res) => { gates.push(() => res({ session_id: sid, state: 'idle' })); }) : undefined));
    const eng = await dockEng();
    armed = true;
    const base = o.reads.length;
    const planning = eng.planClear();
    await flush();
    expect(o.reads.slice(base)).toHaveLength(4);
    expect(o.peak()).toBeLessThanOrEqual(4);
    while (gates.length) { gates.shift()!(); await flush(); }
    const plan = await planning;
    expect(plan!.keys).toHaveLength(8);
    expect(new Set(o.reads.slice(base))).toEqual(new Set(sids));
    const before = o.reads.length;
    const confirming = eng.clearRecent(plan!);
    for (let i = 0; i < 40 && gates.length < 4; i++) await flush();
    while (gates.length) { gates.shift()!(); await flush(); }
    await confirming;
    expect(o.reads.length - before).toBe(8);
  });
  it('idleKeys: with one read at a time, a plan dropped during the first read starts no second one', async () => {
    w = world();
    const { recs } = await seedConvs(4);
    const keys = recs.map((r) => ({ k1: r.k1, p: r.p, c: r.c, r: r.r, s: r.s as string }));
    let alive = true, n = 0;
    const io = { state: async (sid: string) => { n++; alive = false; return { session_id: sid, state: 'idle' }; } } as any;
    expect(await idleKeys(io, keys, () => alive, 1)).toEqual([]);
    expect(n).toBe(1);
  });
  it('idleKeys: a dropped plan reads nothing more and keeps nothing', async () => {
    w = world();
    const { recs } = await seedConvs(4);
    const keys = recs.map((r) => ({ k1: r.k1, p: r.p, c: r.c, r: r.r, s: r.s as string }));
    let alive = true;
    const io = { state: async (sid: string) => { alive = false; return { session_id: sid, state: 'idle' }; } } as any;
    expect(await idleKeys(io, keys, () => alive)).toEqual([]);
  });
});

describe('Clear: one removal from the fresh stored list', () => {
  it('the in-lock check also refuses a record that holds evidence nothing covers, whatever the caller\'s own check says', async () => {
    w = world();
    const { recs } = await seedConvs(2);
    expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: recs.map((r, i) => (i === 0 ? { ...r, da: { g: RID('d') } } : r)) } } as any)).toBe(true);
    const keys = recs.map((r) => ({ k1: r.k1, p: r.p, c: r.c, r: r.r, s: r.s as string }));
    const out = await w.j.dockRemove(ACCOUNT, keys, () => true);
    expect(out).toMatchObject({ t: 'ok', removed: [recs[1]!.k1] });
    expect(ids(stored())).toEqual([recs[0]!.k1]);
  });

  it('removes the confirmed references and nothing else; journal records and entries are untouched; Recent is re-read from storage', async () => {
    w = world();
    const { recs } = await seedConvs(3);
    const eng = await dockEng();
    const journalBefore = w.fs.peek(JOURNAL), reqBefore = w.fs.peek(REQ);
    const plan = await eng.planClear();
    const out = await eng.clearRecent(plan!);
    expect(out).toEqual({ t: 'done', removed: 3 });
    expect(stored()).toEqual([]);
    expect(w.fs.peek(JOURNAL)).toBe(journalBefore);
    expect(w.fs.peek(REQ)).toBe(reqBefore);
    await flush();
    expect(eng.getSnapshot().recent).toEqual([]);
    expect(recs).toHaveLength(3);
  });
  it('a conversation that became active between the plan and the confirm leaves the set', async () => {
    w = world();
    const { recs, sids } = await seedConvs(3);
    const eng = await dockEng();
    const plan = await eng.planClear();
    overrideState((sid) => (sid === sids[1] ? { session_id: sid, state: 'running' } : undefined));
    expect(await eng.clearRecent(plan!)).toEqual({ t: 'done', removed: 2 });
    expect(ids(stored())).toEqual([recs[1]!.k1]);
  });
  it('nothing left at the confirm: nothing is written and it says so', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    const plan = await eng.planClear();
    overrideState((sid) => ({ session_id: sid, state: 'running' }));
    const before = w.fs.peek('hub_ask_v1');
    expect(await eng.clearRecent(plan!)).toEqual({ t: 'same' });
    expect(w.fs.peek('hub_ask_v1')).toBe(before);
  });
  it('a record another tab added, a record whose session changed, and a record of another slot all stay', async () => {
    w = world();
    const { recs } = await seedConvs(2);
    const eng = await dockEng();
    const plan = await eng.planClear();
    const Y = { ...recs[0]!, k1: hex(50), k2: hex(51), s: 'sess-Y' };
    const Z = { ...recs[0]!, k1: hex(60), k2: hex(61), c: 'c0a7150000000000000000b2' };
    expect(await w.jB.dockApplyLocked(ACCOUNT, { k: 'put', rec: Y })).toBe(true);
    expect(await w.jB.dockApplyLocked(ACCOUNT, { k: 'put', rec: Z })).toBe(true);
    expect(await w.jB.dockApplyLocked(ACCOUNT, { k: 'put', rec: { ...recs[1]!, s: 'sess-new' } })).toBe(true);
    const out = await eng.clearRecent(plan!);
    expect(out).toEqual({ t: 'done', removed: 1 });
    expect(ids(stored()).sort()).toEqual([recs[1]!.k1, Y.k1, Z.k1].sort());
  });
  it('a record that gained evidence meanwhile is kept (the in-lock check re-runs on the stored record)', async () => {
    w = world();
    const { recs, sids } = await seedConvs(2);
    const eng = await dockEng();
    const plan = await eng.planClear();
    S.writeEntry(w.jB, entry('turn', hex(600), { s: sids[0], c: recs[0]!.k1 }));
    expect(await eng.clearRecent(plan!)).toEqual({ t: 'done', removed: 1 });
    expect(ids(stored())).toEqual([recs[0]!.k1]);
  });
  it('the account changing while Clear waits for the lock: nothing written, and it says so', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    const plan = await eng.planClear();
    let release!: () => void;
    await new Promise<void>((granted) => { void (navigator as any).locks.request(dockLockName(ACCOUNT), () => new Promise<void>((r) => { release = r; granted(); })); });
    const running = eng.clearRecent(plan!);
    await flush();
    showAccount(OTHER);
    release();
    const out = await running;
    expect(['account', 'stale']).toContain(out.t);
    showAccount(ACCOUNT);
    expect(stored()).toHaveLength(2);
  });
  it('a plan of an older engine generation is dropped: nothing written', async () => {
    w = world();
    const { recs } = await seedConvs(3);
    const eng = await dockEng();
    const plan = await eng.planClear();
    expect(eng.openConversation(recs[2]!.k1)).toBe(true);
    expect(eng.planLive(plan!)).toBe(false);
    expect(await eng.clearRecent(plan!)).toEqual({ t: 'stale' });
    expect(stored()).toHaveLength(3);
  });
  it('the plan is judged again under the lock: an engine that reset or ended while Clear waited for the lock writes nothing', async () => {
    w = world();
    const { recs } = await seedConvs(3);
    const eng = await dockEng();
    const plan = await eng.planClear();
    let release!: () => void;
    await new Promise<void>((granted) => { void (navigator as any).locks.request(dockLockName(ACCOUNT), () => new Promise<void>((r) => { release = r; granted(); })); });
    const running = eng.clearRecent(plan!);
    await flush();
    expect(eng.openConversation(recs[2]!.k1)).toBe(true);        // the generation moves while the lock is held
    release();
    expect(await running).toEqual({ t: 'stale' });
    expect(stored()).toHaveLength(3);
  });
  it('a popover that closed while Clear waited (before the read, or for the lock) drops the plan: nothing written', async () => {
    w = world();
    await seedConvs(3);
    const eng = await dockEng();
    const plan = await eng.planClear();
    expect(await eng.clearRecent(plan!, () => false)).toEqual({ t: 'stale' });
    let open = true;
    let release!: () => void;
    await new Promise<void>((granted) => { void (navigator as any).locks.request(dockLockName(ACCOUNT), () => new Promise<void>((r) => { release = r; granted(); })); });
    const running = eng.clearRecent(plan!, () => open);
    await flush();
    open = false;
    release();
    expect(await running).toEqual({ t: 'stale' });
    expect(stored()).toHaveLength(3);
  });
  it('a newer journal record of the conversation (working, unknown, another session or an unpaired turn) keeps a stale finished dock reference', async () => {
    w = world();
    const { recs } = await seedConvs(5);
    plant({ ...recs[0]!, ph: 'unknown' });
    plant({ ...recs[1]!, ph: 'working' });
    plant({ ...recs[2]!, s: 'another-session' });
    plant({ ...recs[3]!, t: null });
    const eng = await dockEng();
    expect(keysOf(await eng.planClear())).toEqual([recs[4]!.k1]);
  });
  it('an unconfirmed write carries the keys that were submitted (those that passed the confirm read), and Check again reads those', async () => {
    w = world();
    const { sids } = await seedConvs(3, (i) => (i === 3 ? { ph: 'failed' } : {}));
    const eng = await dockEng();
    const plan = await eng.planClear();
    expect(plan!.keys).toHaveLength(2);
    overrideState((sid) => (sid === sids[1] ? { session_id: sid, state: 'running' } : undefined));   // the second is busy at the confirm
    const real = w.j.dockRemove.bind(w.j);
    (w.j as any).dockRemove = async (...a: any[]) => { await (real as any)(...a); throw new Error('lost the answer'); };
    w.fs.blockReads('hub_ask_v1');
    const out = await eng.clearRecent(plan!);
    expect(out).toMatchObject({ t: 'unconfirmed' });
    expect((out as any).keys.map((k: any) => k.s)).toEqual([sids[0]]);
  });
  it('a lock that is refused: nothing written', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    const plan = await eng.planClear();
    (navigator as any).locks = { request: () => Promise.reject(new Error('refused')) };
    expect(await eng.clearRecent(plan!)).toEqual({ t: 'refused' });
    expect(stored()).toHaveLength(2);
  });
  it('without Web Locks Clear is not offered at all', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    removeTestLocks();
    expect(eng.clearSupport()).toBe('noLocks');
    expect(await eng.planClear()).toBeNull();
    expect(eng.clearCandidatesNow()).toBe(-1);
  });
  it('an engine without the journal-backed dock store does not offer Clear', async () => {
    w = world();
    const eng = await w.dock();
    expect(eng.clearSupport()).toBe('no');
  });
});

describe('every storage result is handled; an uncertain write is read back', () => {
  it('unreadable: nothing was read, nothing written, rows as they were', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    const plan = await eng.planClear();
    w.fs.blockReads('hub_ask_v1');
    expect(await eng.clearRecent(plan!)).toEqual({ t: 'unreadable' });
  });
  it('full: a definite refusal, rows unchanged', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    const plan = await eng.planClear();
    w.fs.blockWrites('hub_ask_v1');
    const out = await eng.clearRecent(plan!);
    expect(['full', 'none']).toContain(out.t);
    w.fs.clearFaults();
    expect(stored()).toHaveLength(2);
  });
  it('a write that landed and then threw: the verification read shows the keys gone, so it is done, and journal-only rows stay listed', async () => {
    w = world();
    const { recs } = await seedConvs(2);
    const J = { ...recs[0]!, k1: hex(80), k2: hex(81), s: null, t: null };
    plant(J);
    const eng = await dockEng();
    const plan = await eng.planClear();
    const set = w.fs.setItem.bind(w.fs);
    let thrown = false;
    (w.fs as any).setItem = (k: string, v: string) => { set(k, v); if (k === 'hub_ask_v1' && !thrown) { thrown = true; throw new Error('after the write'); } };
    const out = await eng.clearRecent(plan!);
    expect(out).toEqual({ t: 'done', removed: 2 });
    await flush();
    expect(ids(eng.getSnapshot().recent ?? [])).toEqual([J.k1]);
  });
  it('the whole legacy list removed and the write threw (the read says missing): done, and the list is the journal-only row, not empty', async () => {
    w = world();
    const { recs } = await seedConvs(2);
    const J = { ...recs[0]!, k1: hex(80), k2: hex(81), s: null, t: null };
    plant(J);
    const eng = await dockEng();
    const plan = await eng.planClear();
    const remove = w.fs.removeItem.bind(w.fs);
    (w.fs as any).removeItem = (k: string) => { remove(k); if (k === 'hub_ask_v1') throw new Error('after the remove'); };
    const out = await eng.clearRecent(plan!);
    expect(out.t).toBe('done');
    await flush();
    expect(ids(eng.getSnapshot().recent ?? [])).toEqual([J.k1]);
  });
  it('a removal that throws after it landed is read back like a failed one: done', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    const plan = await eng.planClear();
    const real = w.j.dockRemove.bind(w.j);
    (w.j as any).dockRemove = async (...a: any[]) => { await (real as any)(...a); throw new Error('lost the answer'); };
    expect(await eng.clearRecent(plan!)).toEqual({ t: 'done', removed: 2 });
  });
  it('a write that threw and did not land: "none gone", the list as stored; an unreadable check is unconfirmed and Check again reads only', async () => {
    w = world();
    await seedConvs(3, (i) => (i === 3 ? { ph: 'failed' } : {}));      // one record stays, so the removal is a write, not a remove
    plant({ ...(stored()[0] as AskRecord), k1: hex(80), k2: hex(81), s: null, t: null });
    const eng = await dockEng();
    const plan = await eng.planClear();
    const rule = w.fs.fail({ op: 'set', key: 'hub_ask_v1', times: 1, error: new Error('boom') });
    const out = await eng.clearRecent(plan!);
    expect(out.t).toBe('none');
    expect(rule.failed).toBe(1);
    w.fs.blockReads('hub_ask_v1');
    const writes = w.fs.calls.filter((c: any) => c.op === 'set').length;
    expect(eng.verifyClear(plan!)).toMatchObject({ t: 'unconfirmed' });
    expect(w.fs.calls.filter((c: any) => c.op === 'set').length).toBe(writes);
    w.fs.clearFaults();
    expect(eng.verifyClear(plan!)).toEqual({ t: 'none' });
    await flush();
    expect(ids(eng.getSnapshot().recent ?? []), 'the verification read keeps the journal-only row listed').toContain(hex(80));
  });
  it('judgeVerification: some gone; an account that is not the confirmed one is unconfirmed', async () => {
    w = world();
    const { recs } = await seedConvs(2);
    const keys = recs.map((r) => ({ k1: r.k1, p: r.p, c: r.c, r: r.r, s: r.s as string }));
    expect(judgeVerification(ACCOUNT, keys, { s: 'ok', v: [recs[0]!], acct: ACCOUNT }).out).toEqual({ t: 'some', removed: 1 });
    expect(judgeVerification(ACCOUNT, keys, { s: 'ok', v: [], acct: OTHER }).out).toMatchObject({ t: 'unconfirmed' });
    expect(judgeVerification(ACCOUNT, keys, { s: 'missing', acct: ACCOUNT })).toMatchObject({ out: { t: 'done', removed: 2 }, base: { v: 1, a: {} } });
    expect(judgeVerification(ACCOUNT, keys, { s: 'unreadable' }).out).toMatchObject({ t: 'unconfirmed' });
  });
});

describe('Recent reads: a title read that started before the Clear never republishes removed rows', () => {
  it('the older /sessions answer is dropped', async () => {
    w = world();
    await seedConvs(2);
    const eng = await dockEng();
    let answer!: (v: unknown) => void;
    (w.agent as any).sessions = () => new Promise((res) => { answer = res; });
    eng.loadRecent();
    await flush();
    const stale = eng.getSnapshot().recent;
    expect(stale).toHaveLength(2);
    (w.agent as any).sessions = () => Promise.resolve({ items: [] });
    const plan = await eng.planClear();
    expect((await eng.clearRecent(plan!)).t).toBe('done');
    await flush();
    answer({ items: [] });
    await flush();
    expect(eng.getSnapshot().recent).toEqual([]);
  });
});

describe('clearCandidates is a pure read: it writes nothing', () => {
  it('no write reaches storage while candidates are computed', async () => {
    w = world();
    await seedConvs(3);
    const eng = await dockEng();
    const before = w.fs.calls.filter((c: any) => c.op === 'set' || c.op === 'remove').length;
    expect(eng.clearCandidatesNow()).toBe(3);
    expect(w.fs.calls.filter((c: any) => c.op === 'set' || c.op === 'remove').length).toBe(before);
    expect(typeof clearCandidates).toBe('function');
    void writeStore;
  });
});

describe('the registry\'s dock store takes per-key operations only', () => {
  it('its literal has read and apply, and no snapshot write (a stale-list overwrite has no path)', () => {
    const line = REGISTRY.split('\n').find((l) => l.startsWith('const store: StoreIO = {')) ?? '';
    expect(line).toContain('apply: (account, op) => journal.dockApplyLocked(account, op)');
    expect(line).not.toMatch(/\bwrite\b/);
  });
});
