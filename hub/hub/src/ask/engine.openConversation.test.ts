// openConversation carries the picked conversation through loading, and its dock save may answer later: the pick
// never depends on the save; the save's completion acts only for the pick and engine generation it was sent in, and re-reads
// Recent (a fresh read generation, so an older title read never republishes).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { readStore, writeStore } from './data';
import { AskEngine, type StoreIO } from './engine';
import * as L from './logic';
import type { AskRecord } from './logic';
import { dockLockName } from './journal/locks';
import { ACCOUNT, HANDLE, REALM, slot, tick, world, type World } from './accept/env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const hex = (n: number) => 'hx-' + n.toString(16).padStart(32, '0');
const stored = (): AskRecord[] => (readStore(ACCOUNT).a[ACCOUNT] ?? []) as AskRecord[];
async function seed(n: number): Promise<AskRecord[]> {
  const recs: AskRecord[] = [];
  for (let i = 1; i <= n; i++) {
    const c = (await w!.agent.create(L.createBody(REALM, 'c1')!, 'key-' + i, REALM)) as { session_id: string };
    recs.push({ p: slot.project, c: slot.computer, r: REALM, s: c.session_id, t: 'turn-' + i, k1: hex(i), k2: hex(i + 100), rc: 'custom', n: null, at: 1000 - i, i: null, q: 0, ph: 'completed', l: 'en' } as AskRecord);
  }
  expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: recs } } as any)).toBe(true);
  return recs;
}
const store = (j = w!.j): StoreIO => ({ read: (a: string) => j.dockRead(a, readStore(a)), apply: (a: string, op: any) => j.dockApplyLocked(a, op) }) as StoreIO;
function engine(): AskEngine {
  const eng = new AskEngine(slot, w!.agent, store(), w!.clock, { journal: { j: w!.j, handle: HANDLE } });
  return eng;
}
function hold(): Promise<() => void> {
  return new Promise((granted) => {
    void (navigator as any).locks.request(dockLockName(ACCOUNT), () => new Promise<void>((release) => granted(() => release())));
  });
}
/** Holds the realm probe, so the engine has its realm but has not finished loading (the window a pick can land in). */
function slowProbe(): () => void {
  const real = (w!.agent as any).probe.bind(w!.agent);
  let go!: () => void;
  const gate = new Promise<void>((r) => { go = r; });
  (w!.agent as any).probe = async (r: string) => { await gate; return real(r); };
  return go;
}
const flush = async (ms = 900) => { await w!.flush(ms); for (let i = 0; i < 10; i++) await tick(); };
function countSessionReads(): { n: () => number } {
  const real = (w!.agent as any).sessions.bind(w!.agent);
  let n = 0;
  (w!.agent as any).sessions = (r: string) => { n++; return real(r); };
  return { n: () => n };
}

describe('a pick made while the engine is loading', () => {
  it('loading opens the picked conversation although the save has not landed; when it lands Recent shows it first', async () => {
    w = world();
    const [P, X] = await seed(2);
    const release = await hold();
    const go = slowProbe();
    const eng = engine();
    eng.open();
    await flush(100);
    expect(eng.openConversation(X!.k1)).toBe(true);
    go();
    await flush();
    expect(eng.record?.k1, 'loading opened the front record, not the pick').toBe(X!.k1);
    expect(stored().map((r) => r.k1)).toEqual([P!.k1, X!.k1]);
    release();
    await flush();
    expect(stored().map((r) => r.k1)).toEqual([X!.k1, P!.k1]);
    expect(eng.record?.k1).toBe(X!.k1);
  });
  it('the save is refused (lock refused): the pick still opens, the stored order is unchanged, and there is no error band', async () => {
    w = world();
    const [P, X] = await seed(2);
    (navigator as any).locks = { request: () => Promise.reject(new Error('refused')) };
    const go = slowProbe();
    const eng = engine();
    eng.open();
    await flush(100);
    expect(eng.openConversation(X!.k1)).toBe(true);
    go();
    await flush();
    expect(eng.record?.k1).toBe(X!.k1);
    expect(stored().map((r) => r.k1)).toEqual([P!.k1, X!.k1]);
    expect(eng.getSnapshot().blocked).toBeNull();
  });
  it('two picks: the second wins; the first one\'s completion publishes nothing', async () => {
    w = world();
    const [, X, Y] = await seed(3);
    const release = await hold();
    const go = slowProbe();
    const eng = engine();
    eng.open();
    await flush(100);
    expect(eng.openConversation(X!.k1)).toBe(true);
    expect(eng.openConversation(Y!.k1)).toBe(true);
    go();
    await flush();
    expect(eng.record?.k1).toBe(Y!.k1);
    const reads = countSessionReads();
    release();
    await flush();
    expect(reads.n(), 'only the second pick\'s completion re-reads Recent').toBe(1);
  });
  it('a generation bump before readiness clears the pick: the slot opens its own front record', async () => {
    w = world();
    const [P, X] = await seed(2);
    const release = await hold();
    const go = slowProbe();
    const eng = engine();
    eng.open();
    await flush(100);
    expect(eng.openConversation(X!.k1)).toBe(true);
    (eng as any).reset();                                       // the context moved (a new generation)
    go();
    const reads = countSessionReads();
    release();
    await flush();
    expect(reads.n(), 'the completion of an older generation does nothing').toBe(0);
    expect((eng as any).want).toBeNull();
    expect(P).toBeTruthy();
  });
  it('another tab dropped the pick before readiness: the front record opens', async () => {
    w = world();
    const [P, X] = await seed(2);
    const go = slowProbe();
    const eng = engine();
    eng.open();
    await flush(100);
    expect(eng.openConversation(X!.k1)).toBe(true);
    await flush(100);                                          // the pick's save lands
    expect(w.jB.dockApply(ACCOUNT, { k: 'drop', p: X!.p, c: X!.c, r: X!.r, k1: X!.k1 })).toBe(true);
    go();
    await flush();
    expect(eng.record?.k1).toBe(P!.k1);
  });
  it('an engine that holds the picked conversation by the time loading ends is not given a second copy', async () => {
    w = world();
    const [P, X] = await seed(2);
    const go = slowProbe();
    const eng = engine();
    eng.open();
    await flush(100);
    eng.held = (sid) => sid === X!.s;
    expect(eng.openConversation(X!.k1), 'held at the pick').toBe(false);
    eng.held = null;
    expect(eng.openConversation(X!.k1)).toBe(true);
    eng.held = (sid) => sid === X!.s;                          // pinned meanwhile
    go();
    await flush();
    expect(eng.record?.k1, 'the held conversation was opened a second time').not.toBe(X!.k1);
    expect(eng.record, 'the front record is the held one, so this engine starts blank').toBeFalsy();
    expect(P).toBeTruthy();
  });
});

describe('a pick made while loaded', () => {
  it('opens at once with the save pending; the completion (gen captured after the reset) re-reads Recent with the pick first', async () => {
    w = world();
    const [P, X] = await seed(2);
    const eng = engine();
    eng.open();
    await flush();
    expect(eng.record?.k1).toBe(P!.k1);
    const release = await hold();
    const reads = countSessionReads();
    expect(eng.openConversation(X!.k1)).toBe(true);
    expect(eng.record?.k1).toBe(X!.k1);
    eng.loadRecent();                                          // Recent opened while the save waits: the overlay shows the pick first
    expect(eng.getSnapshot().recent?.map((r) => r.k1)).toEqual([X!.k1, P!.k1]);
    const before = reads.n();
    release();
    await flush();
    expect(reads.n() - before, 'the completion refreshed Recent').toBe(1);
    expect(stored().map((r) => r.k1)).toEqual([X!.k1, P!.k1]);
  });
});

describe('Recent title reads: the newest read wins', () => {
  it('loadRecent A, then B: B answers first, then A: A\'s answer is dropped', async () => {
    w = world();
    const recs = await seed(2);
    const eng = engine();
    eng.open();
    await flush();
    const answers: Array<(v: unknown) => void> = [];
    (w.agent as any).sessions = () => new Promise((res) => { answers.push(res); });
    eng.loadRecent();
    eng.loadRecent();
    await flush(10);
    const items = (title: string) => ({ items: [{ id: recs[0]!.s, first_message: title }] });
    answers[1]!(items('B title'));
    await flush(10);
    answers[0]!(items('A title'));
    await flush(10);
    expect(eng.getSnapshot().recent?.find((r) => r.k1 === recs[0]!.k1)?.title).toBe('B title');
  });
});
