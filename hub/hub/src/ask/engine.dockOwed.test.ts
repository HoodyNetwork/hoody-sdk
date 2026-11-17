// An owed dock save: a dock put the store did not keep is owed per conversation and generation, with
// real retry triggers (wake, a Clear, another engine's kept dock write); the capacity note is sticky until a kept put or a reset; every
// change of what the panel shows publishes; a kept retry refreshes a Recent list on screen.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { AskEngine, type StoreIO } from './engine';
import * as L from './logic';
import type { AskRecord } from './logic';
import { HANDLE, REALM, slot, tick, world, type World } from './accept/env';
import { ACCOUNT } from './accept/env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const hex = (n: number) => 'hx-' + n.toString(16).padStart(32, '0');
type Ans = boolean | 'recentFull';
/** A dock store whose put answers are scripted; `ops` records what was asked. */
function scripted(recs: AskRecord[]) {
  const ops: any[] = [];
  const box: { next: Array<Ans | Promise<Ans>>; def: Ans } = { next: [], def: true };
  const store = {
    read: () => ({ v: 1, a: { [ACCOUNT]: recs } }),
    apply: (_a: string, op: any) => { ops.push(op); return box.next.length ? box.next.shift()! : box.def; },
  } as StoreIO;
  return { store, ops, box };
}
async function rec(): Promise<AskRecord> {
  const c = (await w!.agent.create(L.createBody(REALM, 'c1')!, 'key-1', REALM)) as { session_id: string };
  return { p: slot.project, c: slot.computer, r: REALM, s: c.session_id, t: 'turn-1', k1: hex(1), k2: hex(101), rc: 'custom', n: null, at: 1000, i: null, q: 0, ph: 'completed', l: 'en' } as AskRecord;
}
const flush = async () => { await w!.flush(900); for (let i = 0; i < 10; i++) await tick(); };
async function opened(o: { answers?: Array<Ans | Promise<Ans>> } = {}) {
  w = world();
  const R = await rec();
  const sc = scripted([R]);
  const eng = new AskEngine(slot, w.agent, sc.store, w.clock, { journal: { j: w.j, handle: HANDLE } });
  eng.open();
  await flush();
  expect(eng.record?.k1).toBe(R.k1);
  sc.ops.length = 0;
  if (o.answers) sc.box.next = [...o.answers];
  let notes = 0;
  eng.subscribe(() => { notes++; });
  const put = async (): Promise<void> => { await (eng as any).storeOp({ k: 'put', rec: eng.record }); await flush(); };
  return { eng, sc, R, put, notes: () => notes, mark: () => { const n = notes; return () => notes - n; } };
}

describe('the capacity note is published and sticky', () => {
  it('an idle engine; a put answers recentFull: one notification, the snapshot says so', async () => {
    const { eng, put, mark } = await opened({ answers: ['recentFull'] });
    const since = mark();
    await (eng as any).storeOp({ k: 'put', rec: eng.record });
    await tick();
    expect(eng.getSnapshot().recentFull).toBe(true);
    expect(since()).toBe(1);
    void put;
  });
  it('recentFull, then a plain refusal, then kept: the note shows, still shows, then clears', async () => {
    const { eng, put } = await opened({ answers: ['recentFull', false, true] });
    await put();
    expect(eng.getSnapshot().recentFull).toBe(true);
    await put();
    expect(eng.getSnapshot().recentFull, 'a later generic refusal cleared the capacity note').toBe(true);
    await put();
    expect(eng.getSnapshot().recentFull).toBeUndefined();
  });
  it('a plain refusal first, then recentFull: the note shows after the second', async () => {
    const { eng, put } = await opened({ answers: [false, 'recentFull'] });
    await put();
    expect(eng.getSnapshot().recentFull).toBeUndefined();
    await put();
    expect(eng.getSnapshot().recentFull).toBe(true);
  });
  it('an answer that changes nothing does not notify', async () => {
    const { eng, put, mark } = await opened({ answers: [false] });
    const since = mark();
    await put();
    expect(eng.getSnapshot().recentFull).toBeUndefined();
    expect(since()).toBe(0);
  });
  it('a reset clears the note; an answer of an older generation changes nothing', async () => {
    const late = (): { p: Promise<Ans>; res: (a: Ans) => void } => { let res!: (a: Ans) => void; const p = new Promise<Ans>((r) => { res = r; }); return { p, res }; };
    const l = late();
    const { eng, put, mark, R } = await opened({ answers: ['recentFull', l.p] });
    await put();
    expect(eng.getSnapshot().recentFull).toBe(true);
    (eng as any).reset();
    expect((eng as any).dockOwed).toBeNull();
    void (eng as any).storeOp({ k: 'put', rec: { ...R } });
    (eng as any).reset();
    const since = mark();
    l.res('recentFull');
    await flush();
    expect(since()).toBe(0);
    expect((eng as any).recentFullNow(), 'an answer of an older generation set the note').toBe(false);
    expect((eng as any).dockOwed).toBeNull();
  });
});

describe('retryDock: real triggers, one put, no save()', () => {
  it('recentFull, X goes idle, the storage event wakes the engine: one put is sent, X is listed and the note clears', async () => {
    const { eng, sc, put } = await opened({ answers: ['recentFull'] });
    await put();
    expect(eng.getSnapshot().recentFull).toBe(true);
    sc.ops.length = 0;
    eng.retryDock();
    await flush();
    expect(sc.ops.filter((o) => o.k === 'put')).toHaveLength(1);
    expect(eng.getSnapshot().recentFull).toBeUndefined();
  });
  it('wake() is a retry trigger: it asks retryDock first', async () => {
    const { eng } = await opened();
    let n = 0;
    const real = eng.retryDock.bind(eng);
    eng.retryDock = () => { n++; real(); };
    eng.wake();
    expect(n).toBe(1);
  });
  it('a retry refused again stays owed and triggers nothing in other engines', async () => {
    const { eng, sc, put } = await opened({ answers: ['recentFull', 'recentFull'] });
    let kept = 0;
    eng.onDockKept = () => { kept++; };
    await put();
    eng.retryDock();
    await flush();
    expect(eng.getSnapshot().recentFull).toBe(true);
    expect(kept).toBe(0);
    expect(sc.ops.length).toBeGreaterThan(0);
  });
  it('the other engines retry after a kept dock write of this one (same tab: no storage event)', async () => {
    const { eng, sc, put } = await opened({ answers: ['recentFull'] });
    await put();
    sc.ops.length = 0;
    eng.retryDock();
    await flush();
    expect(sc.ops.filter((o) => o.k === 'put')).toHaveLength(1);
  });
  it('a generation bump before room frees: no retry, nothing owed', async () => {
    const { eng, sc, put } = await opened({ answers: ['recentFull'] });
    await put();
    (eng as any).reset();
    sc.ops.length = 0;
    eng.retryDock();
    await flush();
    expect(sc.ops.filter((o) => o.k === 'put')).toHaveLength(0);
  });
  it('no retry for a conversation that is no longer the engine\'s current one', async () => {
    const { eng, sc, put } = await opened({ answers: ['recentFull'] });
    await put();
    (eng as any).dockOwed = { ...(eng as any).dockOwed, k1: hex(9) };
    (eng as any).lastDockRow = { ...(eng as any).lastDockRow, k1: hex(9) };       // the owed save is another conversation's entirely
    sc.ops.length = 0;
    eng.retryDock();
    await flush();
    expect(sc.ops).toHaveLength(0);
  });
  it('a kept put of another conversation does not clear what is owed for this one', async () => {
    const { eng, put } = await opened({ answers: ['recentFull'] });
    await put();
    await (eng as any).storeOp({ k: 'put', rec: { ...eng.record!, k1: hex(2) } });
    await flush();
    expect(eng.getSnapshot().recentFull).toBe(true);
  });
});

describe('a kept retry refreshes a Recent list that is on screen', () => {
  it('Recent not shown: no re-read; shown: one re-read; after the panel went away: none', async () => {
    const { eng, sc, put } = await opened({ answers: ['recentFull', 'recentFull', 'recentFull'] });
    let reads = 0;
    const real = (w!.agent as any).sessions.bind(w!.agent);
    (w!.agent as any).sessions = (r: string) => { reads++; return real(r); };
    await put();
    eng.retryDock();
    await flush();
    expect(sc.box.next).toHaveLength(1);
    sc.box.next = [];
    sc.box.def = true;
    eng.retryDock();
    await flush();
    expect(reads, 'not shown: no re-read').toBe(0);
    // a second owed save, Recent shown
    sc.box.next = ['recentFull'];
    await put();
    eng.setRecentShown(true);
    sc.box.def = true;
    eng.retryDock();
    await flush();
    expect(reads, 'shown: one re-read').toBe(1);
    // unmounted before the answer lands
    let res!: (a: Ans) => void;
    sc.box.next = ['recentFull'];
    await put();
    sc.box.next = [new Promise<Ans>((r) => { res = r; })];
    eng.setRecentShown(true);
    eng.retryDock();
    eng.setRecentShown(false);
    res(true);
    await flush();
    expect(reads, 'the popover closed before the answer: no re-read').toBe(1);
    expect(eng.getSnapshot().recentFull).toBeUndefined();
  });
});
