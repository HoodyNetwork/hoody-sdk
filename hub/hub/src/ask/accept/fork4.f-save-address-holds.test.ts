// Acceptance, group FORK: regressions around the cut. The durable record, the request
// entries and the agent's log are read from the raw bytes, never from the code under test.
//   F  Records.put keeps the stored key of a record at its own create address
//   G  the create flight is per journal: every engine on the page joins it, and a lost answer blocks them all
//   H  a claim whose request never left, or was refused, is never a permanent claim                             
//   J  a claim with no request entry never left: the next claim of the target frees it, and its owner never posts it afterwards
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type * as F from '../fork';
import * as R from '../journal/records';
import { recsLockName } from '../journal/locks';
import { recordsForTests, seedEntryForTests } from '../journal/testing';
import { ACCOUNT, HANDLE, JOURNAL, REALM, REQ, slot, storedEntries, world, type World } from './env';
import { installTryLocks } from './try-locks';

let w: World | null = null;
// A fork press TRIES the target lock (ifAvailable): the suite's default lock grants every request in turn, so these use one that honours it.
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { vi.restoreAllMocks(); w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const FORKS_MAX: number = (R as any).FORKS_MAX ?? 8;
const flush = (n = 900) => w!.flush(n);
const agent = (): any => w!.agent as any;
const creates = (): any[][] => w!.agent.log.filter((x) => x[0] === 'create').map((x) => x[1] as any[]);
const forkCreates = () => creates().filter((a) => 'fork' in a[0]);
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL) ?? 'null')?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const seedDoc = (d: Record<string, any>) => { const raw = w!.fs.peek(JOURNAL); const all = raw ? JSON.parse(raw) : { v: 1, a: {} }; all.a[ACCOUNT] = d; w!.fs.seed(JOURNAL, JSON.stringify(all)); };
const open = () => Object.values(doc()).filter((r: any) => r.fk && r.s === null);
const key = (n: number, c = 'a') => 'hx-' + c + n.toString(16).padStart(31, '0');
const TPL = { p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, rc: 'custom', n: null, i: null, q: 0, ph: 'completed', l: 'en' };
const fork = (n: number, over: Record<string, unknown> = {}): any => ({ ...TPL, k1: key(n), k2: key(n, 'b'), at: 1000 + n, fk: { s: `sess-p${n}`, i: n }, ...over });
/** The one inserter of an unresolved fork: the claim (its keys come from `mint`, here the record's own). */
const claim = (rec: any, j: any = w!.j): Promise<any> => j.claimFork(HANDLE, rec, () => ({ k1: rec.k1, k2: rec.k2 }), ACCOUNT);
/** The request entry a create writes (and keeps while its answer is unknown) for create key k1. */
const entry = (k1: string, j: any = w!.j) => seedEntryForTests(j, { k: k1, kind: 'create', h: HANDLE, r: REALM, s: null, c: k1, ct: slot.computer, at: 1 } as any);
function plant(rec: any): void {
  const d = doc();
  d[`${HANDLE}|${REALM}|${rec.s === null ? 'create:' + rec.k1 : rec.s}`] = { h: HANDLE, ...rec };
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
/** The next call of an AgentIO method is answered only when released (the call itself is made at once). */
function holdNext(method: string) {
  const real = agent()[method].bind(agent());
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  let calls = 0;
  agent()[method] = (...args: unknown[]) => { calls++; const p = real(...args); return calls === 1 ? gate.then(() => p) : p; };
  return { release: () => release(), get calls() { return calls; } };
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

describe('F a save at the address that holds the record keeps its stored key', () => {
  const K = key(5, 'e'), Fk = key(6, 'e'), K1 = key(1);
  for (const kind of ['fork', 'ordinary'] as const) {
    const mk = (over: Record<string, unknown> = {}): any => ({ ...fork(1), k1: K1, k2: K, ...(kind === 'fork' ? { fk: { s: 'sess-1', i: 2 } } : { fk: undefined }), ...over });
    const createAt = (): any => doc()[`${HANDLE}|${REALM}|create:${K1}`];
    for (const ph of ['working', 'sending'] as const) {
      it(`${kind}: a turnless save of a fenced key as ${ph} does not replace the key; firstState and the handoff keep K`, async () => {
        w = world();
        plant(mk({ k2: K, ph: 'completed', dk: [Fk], na: [Fk] }));
        expect(await w.j.put(HANDLE, mk({ k2: Fk, ph }))).toBe('ok');
        expect(createAt()).toMatchObject({ s: null, t: null, k2: K, ph });
        expect(createAt().dk).toContain(Fk);
        expect(createAt().na).toContain(Fk);
        expect(await recordsForTests(w.j).moveCreate(HANDLE, REALM, K1, 'sess-5')).toBeTruthy();
        expect(w.j.firstState(HANDLE, REALM, K1, K).id, 'the stored key is still the first key').toBe('R4');
        expect(w.j.firstState(HANDLE, REALM, K1, Fk).id, 'the fenced key never became it').toBe('R6');
      });
    }
    it(`${kind}: a turnless save of a NEW, unfenced key at that address keeps the stored key`, async () => {
      w = world();
      plant(mk({ k2: K, ph: 'completed' }));
      expect(await w.j.put(HANDLE, mk({ k2: key(7, 'e'), ph: 'sending' }))).toBe('ok');
      expect(createAt()).toMatchObject({ k2: K, t: null });
    });
    it(`${kind}: a save of the stored key at that address still lands its own phase`, async () => {
      w = world();
      plant(mk({ k2: K, ph: 'completed' }));
      expect(await w.j.put(HANDLE, mk({ k2: K, ph: 'sending' }))).toBe('ok');
      expect(createAt()).toMatchObject({ k2: K, ph: 'sending' });
    });
  }
});

describe('G the create flight is per journal', () => {
  it('two engines on one journal pressing the same target make ONE create: the second joins the first, whichever waits in its reads', async () => {
    const { a, p, bounds } = await parentChat(2);
    const hold = holdNext('transcript');
    const fa = a.fork(spec(bounds, 1));
    await flush(300);
    expect(hold.calls, 'the first press waits in its turn read').toBe(1);
    const fp = p.fork(spec(bounds, 1));
    await flush(300);
    hold.release();
    await flush(900);
    const [oa, op] = await Promise.all([fa, fp]);
    expect(oa.k).toBe('opened');
    expect(op).toEqual(oa);
    expect(forkCreates(), 'one create for the target').toHaveLength(1);
  });
  it('a lost answer on one engine blocks the other engine of the page: unknown, no second create, no key', async () => {
    const { a, p, bounds } = await parentChat(2);
    const real = agent().create.bind(agent());
    agent().create = async (...x: unknown[]) => { await real(...x); return Promise.reject({ pending: true, kind: 'pending' }); };
    expect((await p.fork(spec(bounds, 1))).k).toBe('unknown');
    const mint = vi.spyOn(w!.j, 'mint');
    expect(await a.fork(spec(bounds, 1))).toMatchObject({ k: 'unknown', reason: 'pending', key: 'ask.forkPending' });
    expect(forkCreates()).toHaveLength(1);
    expect(mint.mock.calls.filter((c) => c[0] === 'create' || c[0] === 'turn')).toHaveLength(0);
  });
  it('a press on a pending target: the parent is read as for any press, and nothing is created, minted or retired', async () => {
    const { p, bounds } = await parentChat(2);
    const real = agent().create.bind(agent());
    agent().create = async (...x: unknown[]) => { await real(...x); return Promise.reject({ pending: true, kind: 'pending' }); };
    expect((await p.fork(spec(bounds, 1))).k).toBe('unknown');
    const mint = vi.spyOn(w!.j, 'mint');
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'unknown', reason: 'pending' });
    expect(forkCreates()).toHaveLength(1);
    expect(mint).not.toHaveBeenCalled();
    expect(agent().log.filter((x: any[]) => x[0] === 'createKeyRetire' || x[0] === 'createKeyGet')).toHaveLength(0);
  });
});

describe('H a claim whose request never left, or was refused, is never a permanent claim', () => {
  /** The claim is kept, then the request entry cannot be written (and, with `jam`, the document cannot be written either). */
  function failAfterClaim(jam: boolean): void {
    const real = w!.j.claimFork.bind(w!.j);
    vi.spyOn(w!.j, 'claimFork').mockImplementation(async (...args: Parameters<typeof real>) => {
      const c = await real(...args);
      w!.fs.blockWrites(REQ);
      if (jam) w!.fs.blockWrites(JOURNAL);
      return c;
    });
  }
  it('a not-sent whose cleanup is refused is still a definite refusal, and the next press frees the stale claim and forks once', async () => {
    const { p, bounds } = await parentChat(2);
    failAfterClaim(true);
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'refused', key: 'ask.checkEarlier' });
    expect(forkCreates(), 'never asked').toHaveLength(0);
    w!.fs.clearFaults();
    vi.restoreAllMocks();
    const stale = open();
    expect(stale, 'the claim stays: the document refused its removal').toHaveLength(1);
    expect((await p.fork(spec(bounds, 1))).k, 'a claim that never left does not block the target').toBe('opened');
    expect(forkCreates()).toHaveLength(1);
    expect(open(), 'nothing unresolved is left').toHaveLength(0);
    expect(Object.values(doc()).some((r: any) => r.k1 === (stale[0] as any).k1), 'the stale claim is gone').toBe(false);
  });
  it('a refused removal is asked again: a document that takes the second try leaves no claim', async () => {
    const { p, bounds } = await parentChat(2);
    failAfterClaim(false);
    const drop = vi.spyOn(w!.j, 'drop').mockImplementationOnce(async () => false);
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'refused', key: 'ask.checkEarlier' });
    expect(drop.mock.calls.length, 'asked again after the first refusal').toBeGreaterThanOrEqual(2);
    expect(open(), 'no claim is left').toHaveLength(0);
  });
  it('the engine ending before the send, with the removal refused, is a definite refusal (not unknown, not a page block)', async () => {
    const { p, sid, bounds } = await parentChat(2);
    const release = await holdName(recsLockName(ACCOUNT));
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    p.end();
    vi.spyOn(w!.j, 'drop').mockResolvedValue(false);
    release();
    await flush(900);
    expect(await f).toMatchObject({ k: 'refused', key: 'ask.forkNotOpen' });
    expect(forkCreates(), 'nothing was sent').toHaveLength(0);
    expect(open(), 'the claim stays: the document refused its removal').toHaveLength(1);
    vi.restoreAllMocks();
    const pB = w!.pinned(sid);
    pB.open();
    await flush(900);
    expect((await pB.fork(spec(bounds, 1))).k, 'the page is not blocked: nothing was sent').toBe('opened');
    expect(forkCreates()).toHaveLength(1);
    expect(open()).toHaveLength(0);
  });
  it('a definite server refusal whose cleanup is refused is still that refusal, and the next press forks', async () => {
    const { p, bounds } = await parentChat(2);
    agent().o.createRefuse = { status: 400, code: 'bad_request' };
    const drop = vi.spyOn(w!.j, 'drop').mockResolvedValue(false);
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'refused', key: 'ask.forkChanged' });
    expect(drop.mock.calls.length, 'asked three times').toBe(3);
    drop.mockRestore();
    agent().o.createRefuse = undefined;
    expect((await p.fork(spec(bounds, 1))).k, 'a refused claim does not block the target').toBe('opened');
    expect(forkCreates()).toHaveLength(2);
  });
});

describe('J a claim with no request entry never left', () => {
  it('a claim its page left behind (kept, never sent) is freed by the next press, on this page or a fresh one', async () => {
    const { p, sid, bounds } = await parentChat(2);
    const orphan = await claim(fork(1, { fk: { s: sid, i: 1 } }), w!.jB);
    expect(orphan.t).toBe('claimed');
    expect(open()).toHaveLength(1);
    expect(storedEntries(w!.fs).some((e) => e.k === orphan.k1), 'it has no request entry').toBe(false);
    expect(entry(key(77, 'c')), 'another request of this computer is stored').toBe('ok');
    expect((await p.fork(spec(bounds, 1))).k).toBe('opened');
    expect(forkCreates(), 'one create, under a new key').toHaveLength(1);
    expect(forkCreates()[0]![1]).not.toBe(orphan.k1);
    expect(Object.values(doc()).some((r: any) => r.k1 === orphan.k1), 'the orphan is gone').toBe(false);
  });
  it('a claim WITH its request entry is not freed: the request may have been made, and a press is unknown', async () => {
    const { p, sid, bounds } = await parentChat(2);
    const real = agent().create.bind(agent());
    agent().create = async (...x: unknown[]) => { await real(...x); return Promise.reject({ pending: true, kind: 'pending' }); };
    vi.spyOn(w!.j, 'drop').mockResolvedValue(false);            // the lost fork's claim cannot be removed
    expect((await p.fork(spec(bounds, 1))).k).toBe('unknown');
    vi.restoreAllMocks();
    expect(open(), 'the claim stays with its entry').toHaveLength(1);
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    expect(await pB.fork(spec(bounds, 1)), 'a fresh page joins it').toMatchObject({ k: 'unknown', reason: 'pending', key: 'ask.forkPending' });
    expect(forkCreates()).toHaveLength(1);
  });
  it('entries that cannot be read free nothing', async () => {
    w = world();
    const c = await claim(fork(1));
    expect(c.t).toBe('claimed');
    w.fs.blockReads(REQ);
    const mint = vi.fn(() => ({ k1: key(2), k2: key(2, 'b') }));
    expect((await w.j.claimFork(HANDLE, fork(1), mint, ACCOUNT)).t).toBe('join');
    expect(mint, 'a join mints nothing').not.toHaveBeenCalled();
    w.fs.clearFaults();
    expect(open()).toHaveLength(1);
  });
  it('forkHeld: true for a stored claim, false once another claim freed it, false for an unknown key', async () => {
    w = world();
    const a = await claim(fork(1));
    expect(await w.j.forkHeld(HANDLE, REALM, a.k1, ACCOUNT)).toBe(true);
    expect(await w.j.forkHeld(HANDLE, REALM, key(99), ACCOUNT)).toBe(false);
    const b = await w.jB.claimFork(HANDLE, fork(1), () => ({ k1: key(2), k2: key(2, 'b') }), ACCOUNT);
    expect(b.t, 'the claim without an entry is freed by the next claim of its target').toBe('claimed');
    expect(await w.j.forkHeld(HANDLE, REALM, a.k1, ACCOUNT)).toBe(false);
    expect(await w.j.forkHeld(HANDLE, REALM, key(2), ACCOUNT)).toBe(true);
  });
  it('forkHeld fails closed: a record lock the browser refuses answers false even for a stored claim', async () => {
    w = world();
    const a = await claim(fork(1));
    const nav = globalThis.navigator as any;
    const real = nav.locks.request;
    nav.locks.request = () => Promise.reject(new Error('refused'));
    try { expect(await w.j.forkHeld(HANDLE, REALM, a.k1, ACCOUNT)).toBe(false); } finally { nav.locks.request = real; }
    expect(await w.j.forkHeld(HANDLE, REALM, a.k1, ACCOUNT)).toBe(true);
  });
  it('the owner re-reads its claim before the post: a claim freed after it was kept and before its entry was written is never posted', async () => {
    const { p, bounds } = await parentChat(2);
    const real = w!.j.claimFork.bind(w!.j);
    let freedBy: any = null;
    vi.spyOn(w!.j, 'claimFork').mockImplementation(async (...args: Parameters<typeof real>) => {
      const c = await real(...args);
      // Another page claims the same target now: this claim has no entry yet, so it is freed.
      if (!freedBy) freedBy = await w!.jB.claimFork(HANDLE, args[1], () => ({ k1: key(2), k2: key(2, 'b') }), ACCOUNT);
      return c;
    });
    const out = await p.fork(spec(bounds, 1));
    expect(freedBy.t).toBe('claimed');
    expect(out).toMatchObject({ k: 'refused', key: 'ask.notRemembered' });
    expect(forkCreates(), 'the freed claim was never posted').toHaveLength(0);
    expect(storedEntries(w!.fs), 'its entry went with the refusal').toHaveLength(0);
  });
  it('at the capacity the claims that never left are freed first; claims with entries still fill it', async () => {
    w = world();
    for (let n = 0; n < FORKS_MAX; n++) expect((await claim(fork(n))).t).toBe('claimed');
    expect((await claim(fork(40))).t, 'eight claims without entries: the ninth frees them and is claimed').toBe('claimed');
    expect(open(), 'only the new claim is left').toHaveLength(1);
    seedDoc({});
    for (let n = 0; n < FORKS_MAX; n++) { const c = await claim(fork(n)); expect(c.t).toBe('claimed'); expect(entry(c.k1)).toBe('ok'); }
    expect((await claim(fork(40))).t, 'eight claims with entries: full').toBe('full');
    expect(open()).toHaveLength(FORKS_MAX);
  });
  it('a claim that joins another still writes back the stale claim of the same target it freed', async () => {
    w = world();
    const target = { fk: { s: 'sess-p1', i: 1 } };
    plant(fork(1, target));                                                       // this claim has its request entry: it may have been made
    plant(fork(2, target));                                                       // this one never left
    expect(entry(key(1))).toBe('ok');
    expect(open()).toHaveLength(2);
    const mint = vi.fn(() => ({ k1: key(3), k2: key(3, 'b') }));
    const got: any = await w.j.claimFork(HANDLE, fork(3, target), mint, ACCOUNT);
    expect(got.t, 'the claim with its entry is joined').toBe('join');
    expect(got.rec.k1).toBe(key(1));
    expect(mint, 'a join mints nothing').not.toHaveBeenCalled();
    expect(open().map((r: any) => r.k1), 'the claim that never left is gone from the document').toEqual([key(1)]);
  });
  it('a claim refused as full still writes back the stale claims it freed', async () => {
    w = world();
    for (let n = 0; n < FORKS_MAX - 1; n++) expect((await claim(fork(n))).t).toBe('claimed');
    plant(fork(50, { fk: { s: 'sess-bad', i: 'x' } }));                           // an identity that cannot be read: a quarantined fork
    expect(open()).toHaveLength(FORKS_MAX);
    expect((await claim(fork(40))).t, 'the quarantined fork still refuses a new one').toBe('full');
    expect(open().map((r: any) => r.k1), 'the freed claims are gone from the document').toEqual([key(50)]);
  });
});
