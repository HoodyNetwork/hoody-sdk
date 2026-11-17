// The host wiring of a chat's shell jobs. One store per active source, for the computer the
// engine was opened on; the per-session list is read only while a surface holds the store: at once, on every turn start and
// end, and on a timer while the page is visible (a hidden page reads nothing and reads once when shown). No tick while a Stop
// is on its way or a read is unanswered. A Stop whose answer was lost is decided by the next tick's read (the store's Check),
// never by sending it again. Each press takes a new key; the source's release ends every read.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { engineActive, type ActiveDeps, type JobsDeps } from './active';
import type { ShellJobsIO } from './data';
import { TARGET } from '../core/test/env';

vi.mock('@kit/agent/approver-live', () => ({ approvers: () => ({ state: () => ({ phase: 'none' }), subscribe: () => () => undefined }), resetApproversForTests: () => undefined }));

const REF = { computer: 'atlas.tlas', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'S' };
const SLOT = { account: 'acc', project: 'P1', computer: 'C1', realm: REF.realm, name: 'atlas', server: 'node-amber' };
const host = () => ({ computer: 'atlas', realm: 'Personal' });
const EVERY = 15_000;
const turn = (id: string, terminal: string | null) => ({ s: { turnId: id, terminal }, history: false }) as any;
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  phase: 'ready', blocked: null, band: null, starting: false, conv: { ...C.emptyConv('S'), sid: 'S' }, status: null, gates: [], gate: null,
  decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
  needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
  ...over,
});
function fake() {
  let s = snap();
  const subs = new Set<() => void>();
  const put = (p: Partial<Snapshot>) => { s = { ...s, ...p }; for (const f of [...subs]) f(); };
  const eng = {
    slot: SLOT,
    getSnapshot: () => s,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    activation: () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: 'S', target: TARGET }, strict: false }),
  } as unknown as AskEngine;
  const turns = (...t: unknown[]) => put({ conv: { ...C.emptyConv('S'), sid: 'S', turns: t as any } });
  return { eng, put, turns };
}
const row = (jobId: string, state = 'running') => ({ job_id: jobId, command: `cmd ${jobId}`, started_ms: 1, state, last_line: '', remote: false });
const list = (...items: unknown[]) => ({ ok: true as const, body: { items } });
const stopped = (jobId: string) => ({ ok: true, status: 200, body: { job_id: jobId, outcome: 'stopped', already_ended: false, remote: false, duplicate: false } });

function jobsIO(rows: () => unknown[] = () => [row('j1')]) {
  const lists: Array<{ realm: string; sid: string }> = [];
  const stops: Array<{ target: unknown; key: string }> = [];
  let stopImpl: (jobId: string) => Promise<unknown> = async (j) => stopped(j);
  let listGate: Promise<void> | null = null;
  const io: ShellJobsIO = {
    list: async (chat) => { lists.push(chat); if (listGate) await listGate; return list(...rows()); },
    stop: (t, key) => { stops.push({ target: t, key }); return stopImpl(t.jobId); },
  };
  return {
    io, lists, stops,
    onStop: (f: (jobId: string) => Promise<unknown>) => { stopImpl = f; },
    holdLists: () => { let open!: () => void; listGate = new Promise((r) => { open = r; }); return () => { listGate = null; open(); }; },
  };
}
function jobsDeps(io: ShellJobsIO | null, over: Partial<JobsDeps> = {}) {
  let visible = true;
  const vis = new Set<() => void>();
  let n = 0;
  const at: unknown[] = [];
  const d: JobsDeps = {
    io: (a) => { at.push(a); return io; }, newKey: () => `key-${++n}`, every: EVERY, visible: () => visible,
    onVisibility: (fn) => { vis.add(fn); return () => { vis.delete(fn); }; }, ...over,
  };
  return { d, at, setVisible: (v: boolean) => { visible = v; for (const f of [...vis]) f(); }, visSubs: () => vis.size };
}
const deps = (jobs?: JobsDeps): ActiveDeps => ({
  approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000,
  ...(jobs ? { jobs } : {}),
});
const open = (f: ReturnType<typeof fake>, jobs?: JobsDeps) => engineActive({ current: () => f.eng, release: () => undefined }, REF, host, deps(jobs));
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('a chat source and its shell jobs: the engine under the handle changes', () => {
  it('a swap callback already copied when an earlier one stops the watch does not bind the stopped watch to the new engine', async () => {
    const a = fake(), b = fake(), X = jobsIO(), J = jobsDeps(X.io);
    let live = 0;
    for (const e of [a.eng, b.eng]) {
      const sub = e.subscribe;
      (e as any).subscribe = (f: () => void) => { live++; const off = sub(f); return () => { live--; off(); }; };
    }
    let cur = a.eng;
    const swaps = new Set<() => void>();
    let stop: (() => void) | null = null;
    // The first listener is the page's own: it lets the shell jobs go when the conversation moves (before the watch's callback runs).
    swaps.add(() => { stop?.(); });
    const handle = { current: () => cur, release: () => undefined, onSwap: (fn: () => void) => { swaps.add(fn); return () => { swaps.delete(fn); }; } };
    const src = engineActive(handle, REF, host, deps(J.d));
    stop = src.shellJobs!()!.subscribe(() => undefined);
    await flush();
    expect(live, 'the watch is on the first engine').toBe(1);
    cur = b.eng;
    for (const f of [...swaps]) f();
    await flush();
    expect(live, 'a stopped watch holds a subscription on an engine').toBe(0);
  });

  it('a swap callback already copied when an earlier one RELEASES the source (a subscriber still there) binds nothing', async () => {
    const a = fake(), b = fake(), X = jobsIO(), J = jobsDeps(X.io);
    let live = 0;
    for (const e of [a.eng, b.eng]) {
      const sub = e.subscribe;
      (e as any).subscribe = (f: () => void) => { live++; const off = sub(f); return () => { live--; off(); }; };
    }
    let cur = a.eng;
    const swaps = new Set<() => void>();
    let release: (() => void) | null = null;
    swaps.add(() => { release?.(); });
    const handle = { current: () => cur, release: () => undefined, onSwap: (fn: () => void) => { swaps.add(fn); return () => { swaps.delete(fn); }; } };
    const src = engineActive(handle, REF, host, deps(J.d));
    release = () => src.release();
    const off = src.shellJobs!()!.subscribe(() => undefined);
    await flush();
    expect(live, 'the watch is on the first engine').toBe(1);
    cur = b.eng;
    for (const f of [...swaps]) f();
    await flush();
    expect(live, 'a released source holds an engine subscription').toBe(0);
    expect(swaps.size, 'a released source left a swap registration (only the test\'s own callback remains)').toBe(1);
    off();
    await flush();
    expect(live).toBe(0);
  });

  it('a shell-jobs store kept by a caller and subscribed again after the source is released starts no watch', async () => {
    const a = fake(), X = jobsIO(), J = jobsDeps(X.io);
    let live = 0;
    const sub = a.eng.subscribe;
    (a.eng as any).subscribe = (f: () => void) => { live++; const off = sub(f); return () => { live--; off(); }; };
    const swaps = new Set<() => void>();
    const handle = { current: () => a.eng, release: () => undefined, onSwap: (fn: () => void) => { swaps.add(fn); return () => { swaps.delete(fn); }; } };
    const src = engineActive(handle, REF, host, deps(J.d));
    const store = src.shellJobs!()!;
    const first = store.subscribe(() => undefined);
    await flush();
    expect(live).toBe(1);
    expect(swaps.size).toBe(1);
    src.release();
    expect(live, 'release leaves the watch on').toBe(0);
    first(); // the last subscriber leaves the released source's store ...
    const again = store.subscribe(() => undefined); // ... and a later one comes to the store the caller kept
    await flush();
    expect(live, 'a released source started an engine subscription').toBe(0);
    expect(swaps.size, 'a released source registered a swap callback').toBe(0);
    again();
    await flush();
    expect(live).toBe(0);
    expect(swaps.size).toBe(0);
  });

  it('a subscriber told during the timer\'s own tick releases the source: the timer is not rearmed', async () => {
    // A stop whose answer was lost leaves an unknown attempt; the timer's tick starts its check, and the check marks the attempt
    // 'checking' and tells the subscribers in the tick itself (synchronously).
    let rows = [row('a')];
    const X = jobsIO(() => rows), J = jobsDeps(X.io);
    X.onStop(async () => { throw new Error('lost'); });
    const src = open(fake(), J.d);
    const stops = src.shellJobs!()!;
    let releaseNow = false, released = false;
    const off = stops.subscribe(() => { if (releaseNow && !released) { released = true; src.release(); } });
    await flush();
    await stops.stop('a');
    expect(stops.snapshot().attempts.get('a')?.phase, 'the stop is unknown').toBe('unknown');
    rows = [row('a', 'ended')];
    releaseNow = true; // the next notice is the tick starting the check: this subscriber releases the source then
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(released, 'the subscriber was never told during the tick (the test does not reach the path)').toBe(true);
    const after = X.lists.length;
    await vi.advanceTimersByTimeAsync(EVERY * 3);
    expect(X.lists.length, 'a released source went on reading').toBe(after);
    expect(vi.getTimerCount(), 'a timer is left running after the release').toBe(0);
    off();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a subscriber that leaves and comes back inside the notice of the release starts no watch', async () => {
    const a = fake(), X = jobsIO(), J = jobsDeps(X.io);
    let live = 0;
    const sub = a.eng.subscribe;
    (a.eng as any).subscribe = (f: () => void) => { live++; const off = sub(f); return () => { live--; off(); }; };
    const swaps = new Set<() => void>();
    const handle = { current: () => a.eng, release: () => undefined, onSwap: (fn: () => void) => { swaps.add(fn); return () => { swaps.delete(fn); }; } };
    const src = engineActive(handle, REF, host, deps(J.d));
    const store = src.shellJobs!()!;
    let releasing = false;
    let off2: (() => void) | null = null;
    let off1: () => void = () => undefined;
    off1 = store.subscribe(() => {
      if (!releasing) return;
      releasing = false;
      off1(); // the last subscriber leaves inside stop()'s own notice ...
      off2 = store.subscribe(() => undefined); // ... and one comes straight back
    });
    await flush();
    expect(live).toBe(1);
    releasing = true;
    src.release();
    await flush();
    expect(off2, 'the subscriber did not come back inside the notice (the test does not reach the path)').not.toBeNull();
    expect(live, 'a released source started an engine subscription').toBe(0);
    expect(swaps.size, 'a released source registered a swap callback').toBe(0);
    expect(vi.getTimerCount(), 'a released source armed a timer').toBe(0);
    off2!();
    await flush();
    expect(live).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the turn-edge watch follows the handle to the new engine (a lent dock engine handed to the pinned one)', async () => {
    const a = fake(), b = fake(), X = jobsIO(), J = jobsDeps(X.io);
    let live = 0;
    const sub = a.eng.subscribe;
    (a.eng as any).subscribe = (f: () => void) => { live++; const off = sub(f); return () => { live--; off(); }; };
    let cur = a.eng;
    const swaps = new Set<() => void>();
    const handle = { current: () => cur, release: () => undefined, onSwap: (fn: () => void) => { swaps.add(fn); return () => { swaps.delete(fn); }; } };
    const src = engineActive(handle, REF, host, deps(J.d));
    src.shellJobs!()!.subscribe(() => undefined);
    await flush();
    const before = X.lists.length;
    cur = b.eng;
    for (const f of [...swaps]) f();
    await flush();
    const afterSwap = X.lists.length;
    b.turns(turn('t1', null));
    await flush();
    expect(X.lists.length, 'a turn start on the new engine was not read').toBeGreaterThan(afterSwap);
    const n = X.lists.length;
    a.turns(turn('t9', null));
    await flush();
    expect(X.lists.length, 'the old engine still triggers reads').toBe(n);
    expect(live, 'the old engine is still watched').toBe(0);
    void before;
  });
});

describe('a chat source and its shell jobs', () => {
  it('a page without shell jobs gives a source without them; a computer with no live agent gives none', () => {
    expect(open(fake()).shellJobs).toBeUndefined();
    const J = jobsDeps(null);
    expect(open(fake(), J.d).shellJobs?.()).toBeNull();
  });

  it("is one store per source, for the engine's own computer, and the chat's realm and session on every read", async () => {
    const X = jobsIO(), J = jobsDeps(X.io);
    const src = open(fake(), J.d);
    const a = src.shellJobs!(), b = src.shellJobs!();
    expect(a).toBe(b);
    expect(J.at, 'the computer is named by its server, never its display name').toEqual([{ project: 'P1', computer: 'C1', server: 'node-amber' }]);
    a!.subscribe(() => undefined);
    await flush();
    expect(X.lists).toEqual([{ computer: REF.computer, realm: REF.realm, sid: 'S' }]);
  });

  it('reads nothing until a surface holds the store, then at once and every 15 s; the last unsubscribe stops it', async () => {
    const X = jobsIO(), J = jobsDeps(X.io);
    const stops = open(fake(), J.d).shellJobs!()!;
    await vi.advanceTimersByTimeAsync(EVERY * 3);
    expect(X.lists.length, 'not held: no read').toBe(0);
    const off1 = stops.subscribe(() => undefined), off2 = stops.subscribe(() => undefined);
    await flush();
    expect(X.lists.length, 'once on hold, not once per holder').toBe(1);
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(X.lists.length).toBe(2);
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(X.lists.length).toBe(3);
    off1();
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(X.lists.length, 'one holder left: still read').toBe(4);
    off2();
    off2();
    await vi.advanceTimersByTimeAsync(EVERY * 3);
    expect(X.lists.length, 'nobody holds it: no read').toBe(4);
    expect(J.visSubs()).toBe(0);
  });

  it('a hidden page reads nothing; shown again, it reads once at once', async () => {
    const X = jobsIO(), J = jobsDeps(X.io);
    open(fake(), J.d).shellJobs!()!.subscribe(() => undefined);
    await flush();
    expect(X.lists.length).toBe(1);
    J.setVisible(false);
    await vi.advanceTimersByTimeAsync(EVERY * 4);
    expect(X.lists.length, 'hidden: no read').toBe(1);
    J.setVisible(true);
    await flush();
    expect(X.lists.length, 'shown: one read').toBe(2);
  });

  it('reads on every turn start and end, and not on other engine changes', async () => {
    const f = fake(), X = jobsIO(), J = jobsDeps(X.io);
    open(f, J.d).shellJobs!()!.subscribe(() => undefined);
    await flush();
    expect(X.lists.length).toBe(1);
    f.put({ version: 2 });
    await flush();
    expect(X.lists.length, 'no turn edge').toBe(1);
    f.turns(turn('T1', null));
    await flush();
    expect(X.lists.length, 'turn started').toBe(2);
    f.put({ version: 3 });
    await flush();
    expect(X.lists.length).toBe(2);
    f.turns(turn('T1', 'completed'));
    await flush();
    expect(X.lists.length, 'turn ended').toBe(3);
    f.turns(turn('T1', 'completed'), turn('T2', null));
    await flush();
    expect(X.lists.length, 'the next turn started').toBe(4);
  });

  it('does not read while a Stop is on its way', async () => {
    const X = jobsIO(), J = jobsDeps(X.io);
    let answer!: (v: unknown) => void;
    X.onStop(() => new Promise((r) => { answer = r; }));
    const stops = open(fake(), J.d).shellJobs!()!;
    stops.subscribe(() => undefined);
    await flush();
    const pressed = stops.stop('j1');
    await flush();
    expect(stops.snapshot().attempts.get('j1')).toEqual({ phase: 'sending' });
    const before = X.lists.length;
    await vi.advanceTimersByTimeAsync(EVERY * 2);
    expect(X.lists.length, 'no read while the stop is sending').toBe(before);
    answer(stopped('j1'));
    await pressed;
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(X.lists.length).toBe(before + 1);
  });

  it('does not start a read while the previous one is unanswered', async () => {
    const X = jobsIO(), J = jobsDeps(X.io);
    const release = X.holdLists();
    open(fake(), J.d).shellJobs!()!.subscribe(() => undefined);
    await flush();
    await vi.advanceTimersByTimeAsync(EVERY * 3);
    expect(X.lists.length, 'one read in flight, none piled up').toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(X.lists.length).toBe(2);
  });

  it('a lost answer is decided by the next read, and the stop is never sent again', async () => {
    let rows = [row('j1')];
    const X = jobsIO(() => rows), J = jobsDeps(X.io);
    X.onStop(async () => { throw new Error('lost'); });
    const stops = open(fake(), J.d).shellJobs!()!;
    stops.subscribe(() => undefined);
    await flush();
    await stops.stop('j1');
    expect(stops.snapshot().attempts.get('j1')).toEqual({ phase: 'unknown', checking: false });
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(stops.snapshot().attempts.get('j1'), 'still running: still unknown').toEqual({ phase: 'unknown', checking: false });
    rows = [row('j1', 'ended')];
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(stops.snapshot().attempts.get('j1')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(X.stops.length, 'one stop, never resent').toBe(1);
  });

  it('two lost answers, a read on its way, Check again on the other joins that read: one list request settles both', async () => {
    let rows = [row('a'), row('b')];
    const X = jobsIO(() => rows), J = jobsDeps(X.io);
    X.onStop(async () => { throw new Error('lost'); });
    const stops = open(fake(), J.d).shellJobs!()!;
    stops.subscribe(() => undefined);
    await flush();
    await stops.stop('a');
    await stops.stop('b');
    rows = [row('a', 'ended'), row('b', 'ended')];
    const before = X.lists.length;
    const release = X.holdLists();
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(X.lists.length, 'the tick read is on its way').toBe(before + 1);
    const pressed = stops.check('b');
    await flush();
    expect(X.lists.length, 'Check again joins it: no second request').toBe(before + 1);
    release();
    await pressed;
    await flush();
    expect(X.lists.length).toBe(before + 1);
    expect(stops.snapshot().attempts.get('a')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(stops.snapshot().attempts.get('b')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(X.stops.length, 'no stop resent').toBe(2);
  });

  it('one tick settles every lost answer with one list request', async () => {
    let rows = [row('a'), row('b')];
    const X = jobsIO(() => rows), J = jobsDeps(X.io);
    X.onStop(async () => { throw new Error('lost'); });
    const stops = open(fake(), J.d).shellJobs!()!;
    stops.subscribe(() => undefined);
    await flush();
    await stops.stop('a');
    await stops.stop('b');
    rows = [row('a', 'ended'), row('b', 'ended')];
    const before = X.lists.length;
    await vi.advanceTimersByTimeAsync(EVERY);
    expect(X.lists.length, 'one request').toBe(before + 1);
    expect(stops.snapshot().attempts.get('a')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(stops.snapshot().attempts.get('b')).toEqual({ phase: 'settled', evidence: 'not_running' });
  });

  it('Check again while another Stop is sending reads nothing until that Stop settles, then reads once', async () => {
    let rows = [row('a'), row('b')];
    const X = jobsIO(() => rows), J = jobsDeps(X.io);
    X.onStop(async () => { throw new Error('lost'); });
    const stops = open(fake(), J.d).shellJobs!()!;
    stops.subscribe(() => undefined);
    await flush();
    await stops.stop('a');
    let answer!: (v: unknown) => void;
    X.onStop(() => new Promise((r) => { answer = r; }));
    const sendingB = stops.stop('b');
    await flush();
    rows = [row('a', 'ended'), row('b')];
    const before = X.lists.length;
    await stops.check('a');
    await flush();
    expect(X.lists.length, 'no read while b is sending').toBe(before);
    expect(stops.snapshot().attempts.get('a'), 'the deferred check is drawn as checking').toEqual({ phase: 'unknown', checking: true });
    answer(stopped('b'));
    await sendingB;
    await flush();
    expect(X.lists.length, 'b settled: one read').toBe(before + 1);
    expect(stops.snapshot().attempts.get('a')).toEqual({ phase: 'settled', evidence: 'not_running' });
  });

  it('a Check again waiting for a Stop is drawn as checking at once, its holders are told, and no Stop is pressed on it', async () => {
    let rows = [row('a'), row('b')];
    const X = jobsIO(() => rows), J = jobsDeps(X.io);
    X.onStop(async () => { throw new Error('lost'); });
    const stops = open(fake(), J.d).shellJobs!()!;
    let told = 0;
    stops.subscribe(() => { told++; });
    await flush();
    await stops.stop('a');
    let answer!: (v: unknown) => void;
    X.onStop(() => new Promise((r) => { answer = r; }));
    const sendingB = stops.stop('b');
    await flush();
    rows = [row('a', 'ended'), row('b')];
    const was = told;
    void stops.check('a');
    expect(told, 'the holders are told at once').toBeGreaterThan(was);
    expect(stops.snapshot().attempts.get('a')).toEqual({ phase: 'unknown', checking: true });
    expect(stops.snapshot(), 'one object while nothing changes').toBe(stops.snapshot());
    expect(stops.canStop('a')).toEqual({ k: 'refused', why: 'busy' });
    expect(await stops.stop('a')).toEqual({ k: 'refused', why: 'busy' });
    expect(X.stops.length, 'no Stop sent on the waiting check').toBe(2);
    answer(stopped('b'));
    await sendingB;
    await flush();
    expect(stops.snapshot().attempts.get('a')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(stops.canStop('a')).toEqual({ k: 'refused', why: 'not_running' });
  });

  it('a Check again that joins a pass is drawn as checking until its turn, then settled by that pass', async () => {
    let rows = [row('a'), row('b')];
    const X = jobsIO(() => rows), J = jobsDeps(X.io);
    X.onStop(async () => { throw new Error('lost'); });
    const stops = open(fake(), J.d).shellJobs!()!;
    let told = 0;
    stops.subscribe(() => { told++; });
    await flush();
    await stops.stop('a');
    await stops.stop('b');
    // Only a is lost when the tick starts its pass: the tick reads a alone, and b's Check again joins that pass.
    rows = [row('a', 'ended'), row('b', 'ended')];
    const release = X.holdLists();
    void stops.check('a');
    await flush();
    expect(stops.snapshot().attempts.get('a'), 'a is the check on its way').toEqual({ phase: 'unknown', checking: true });
    expect(stops.snapshot().attempts.get('b')).toEqual({ phase: 'unknown', checking: false });
    const was = told;
    void stops.check('b');
    expect(told, 'the holders are told at once').toBeGreaterThan(was);
    expect(stops.snapshot().attempts.get('b'), 'queued behind a: drawn as checking').toEqual({ phase: 'unknown', checking: true });
    expect(stops.canStop('b')).toEqual({ k: 'refused', why: 'busy' });
    release();
    await flush();
    expect(stops.snapshot().attempts.get('a')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(stops.snapshot().attempts.get('b')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(X.stops.length, 'no Stop sent again').toBe(2);
  });

  it('the surface gets only gated reads: a hidden or released source reads nothing on Check again or refresh', async () => {
    const X = jobsIO(), J = jobsDeps(X.io);
    X.onStop(async () => { throw new Error('lost'); });
    const src = open(fake(), J.d);
    const stops = src.shellJobs!()!;
    await stops.refresh();
    expect(X.lists.length, 'not held: refresh reads nothing').toBe(0);
    stops.subscribe(() => undefined);
    await flush();
    await stops.stop('j1');
    const before = X.lists.length;
    J.setVisible(false);
    await stops.check('j1');
    await stops.refresh();
    expect(X.lists.length, 'hidden: nothing').toBe(before);
    J.setVisible(true);
    await flush();
    const shown = X.lists.length;
    src.release();
    await stops.check('j1');
    await stops.refresh();
    expect(X.lists.length, 'released: nothing').toBe(shown);
  });

  it('every press takes a new key, sent once with the chat and the job', async () => {
    const X = jobsIO(), J = jobsDeps(X.io);
    const stops = open(fake(), J.d).shellJobs!()!;
    stops.subscribe(() => undefined);
    await flush();
    await stops.stop('j1');
    X.onStop(async () => ({ ok: true, status: 200, body: { job_id: 'j1', outcome: 'failed', reason: 'still_running', already_ended: false, remote: false, duplicate: false } }));
    await stops.stop('j1');
    expect(X.stops.map((s) => s.key)).toEqual(['key-1', 'key-2']);
    expect(X.stops[0]!.target).toEqual({ computer: REF.computer, realm: REF.realm, sid: 'S', jobId: 'j1' });
  });

  it('release ends every read and the source gives no store after it', async () => {
    const X = jobsIO(), J = jobsDeps(X.io);
    const src = open(fake(), J.d);
    src.shellJobs!()!.subscribe(() => undefined);
    await flush();
    src.release();
    await vi.advanceTimersByTimeAsync(EVERY * 3);
    expect(X.lists.length).toBe(1);
    expect(J.visSubs()).toBe(0);
    expect(src.shellJobs!()).toBeNull();
  });
});
