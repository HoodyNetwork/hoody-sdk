// Acceptance, fork interleavings end to end: two tabs of one page, one fork
// target, the target lock T between them. The durable record and the agent's log are read from the raw bytes, never from the code under test.
//   X1  a live press holds T and its claimed record before its send lock: a Check from the other tab answers at once and retires nothing
//   X2  a Check under T whose read went stale while the other tab handed the record to its chat: the retire looks again and is not made
//   X3  a create in flight when its engine ends keeps T through its late success: the record moves to the chat, then T is freed
//   X4  a recovery opened for account A whose Check runs after the page switched to account B neither retires nor drops B's record
//   X5  a press whose claim waits 61 s for the record lock keeps T the whole time: the other tab's Check retires nothing, the press opens (R5)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type * as Fk from '../fork';
import { sendLockName } from '../journal/door';
import { forkLockName, recsLockName } from '../journal/locks';
import { ForkRecovery } from '../forkRecovery';
import { installTryLocks } from './try-locks';
import { ACCOUNT, HANDLE, JOURNAL, OTHER, REALM, showAccount, world, type World } from './env';

let w: World | null = null;
let restoreLocks: () => void = () => {};
// Opened in every test's finally too, so a red run never leaves a press parked. EVERY operation a test starts or parks is tracked by name,
// with no per-test list: the engines' fork and checkFork calls (see `traced`), and everything that waits on a gate (`gate().hold`,
// `.passage`). The teardown opens all gates, then drains until nothing tracked is open and the world is idle (no tracked op, no agent call
// and no write to the record document for IDLE_ROUNDS rounds in a row), at most DRAIN_MS, and ALWAYS restores storage, mocks and locks
// afterwards. An operation that did not settle, or a world that did not go idle, is named in the failure.
const DRAIN_MS = 3000;
const IDLE_ROUNDS = 3;
let openAll: Array<() => void> = [];
let started: Array<{ name: string; done: boolean; p: Promise<unknown> }> = [];
const track = <T>(name: string, p: Promise<T>): Promise<T> => {
  const t = { name, done: false, p: p.then(() => undefined, () => undefined) };
  void t.p.then(() => { t.done = true; });
  started.push(t);
  return p;
};
/** Wraps the calls of an engine that start work (a fork press, a Check), so each one is tracked from its first line. */
function traced<E extends { fork: (...a: any[]) => Promise<any>; checkFork: (...a: any[]) => Promise<any> }>(e: E, label: string): E {
  for (const m of ['fork', 'checkFork'] as const) {
    const real = e[m].bind(e) as (...a: unknown[]) => Promise<unknown>;
    (e as any)[m] = (...a: unknown[]) => track(`${label}.${m}`, real(...a));
  }
  return e;
}
const worldKey = (): string => `${w?.agent.log.length ?? 0}|${w?.fs.peek(JOURNAL) ?? ''}`;
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); openAll = []; started = []; });
afterEach(async () => {
  let problem = '';
  try {
    for (const o of openAll) o();
    // One round = a drain of the world's microtasks and manual clock, then a real macrotask (so the deadline below can fire: a loop of
    // microtasks alone would starve it). The loop checks the deadline itself too.
    const deadline = Date.now() + DRAIN_MS;
    let still = 0;
    let last = worldKey();
    while (w && still < IDLE_ROUNDS && Date.now() < deadline) {
      await w.flush(100);
      await new Promise<void>((r) => setTimeout(r, 0));
      const now = worldKey();
      still = started.every((x) => x.done) && now === last ? still + 1 : 0;
      last = now;
    }
    if (still < IDLE_ROUNDS) {
      const open = started.filter((x) => !x.done).map((x) => x.name);
      problem = open.length ? `the test left operations that did not settle within ${DRAIN_MS} ms: ${open.join(', ')}` : `the world was not idle within ${DRAIN_MS} ms (agent calls or record writes kept coming)`;
    }
  } finally {
    vi.restoreAllMocks(); w?.dispose(); w = null; restoreLocks(); resetApproversForTests();
  }
  if (problem) throw new Error(problem);
});

const agent = (): any => w!.agent as any;
const flush = (n = 900) => w!.flush(n);
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL) ?? 'null')?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const forkCreates = (): any[][] => w!.agent.log.filter((x) => x[0] === 'create').map((x) => x[1] as any[]).filter((a) => 'fork' in a[0]);
const retires = (): any[][] => w!.agent.log.filter((x) => x[0] === 'createKeyRetire');
const pendingForks = (): any[] => Object.values(doc()).filter((r: any) => r.fk && r.s === null);
/** The stored record of create key k1 at a session (the handoff), or undefined. */
const atSession = (k1: string): any => Object.values(doc()).find((r: any) => r.k1 === k1 && r.s !== null);
const tName = (sid: string, i: number | null) => forkLockName(ACCOUNT, HANDLE, REALM, { s: sid, i });
/** True while somebody holds the name: a raw `ifAvailable` probe (not the code under test); a free name is taken and released at once. */
function tHeld(name: string): Promise<boolean> {
  return (globalThis.navigator as any).locks.request(name, { ifAvailable: true }, (lock: unknown) => lock === null);
}
/** Tracks whether a promise has settled, without awaiting it. */
function settledFlag<T>(p: Promise<T>): { readonly done: boolean } {
  const s = { done: false };
  void p.then(() => { s.done = true; }, () => { s.done = true; });
  return s;
}
/** A gate: `wait` resolves once `open()` is called (also opened in afterEach). `hold` runs `fn` after it opens and `passage` is the wait
 *  itself; both register the waiting operation by name, so the teardown can see work parked behind the gate. */
function gate(): { wait: Promise<void>; open: () => void; hold: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>; passage: (name: string) => Promise<void> } {
  let open!: () => void;
  const wait = new Promise<void>((r) => { open = r; });
  openAll.push(open);
  return { wait, open, hold: (name, fn) => track(name, wait.then(fn)), passage: (name) => track(name, wait) };
}

/** Holds the name until the returned function is called, and resolves once it is granted (the lock fake grants in turn). */
async function holdName(name: string): Promise<() => void> {
  let release!: () => void;
  const gateP = new Promise<void>((r) => { release = r; });
  openAll.push(release);
  let granted!: () => void;
  const got = new Promise<void>((r) => { granted = r; });
  void (globalThis.navigator as any).locks.request(name, () => { granted(); return gateP; });
  await got;
  return release;
}

async function parentChat(turns = 2) {
  w = world({});
  const a = await w.dock();
  a.send('first');
  await flush(1500);
  const sid = a.record!.s!;
  const p = traced(w.pinned(sid), 'A');
  p.open();
  await flush(900);
  for (let i = 1; i < turns; i++) { p.send(`turn ${i + 1}`); await flush(1500); }
  const bounds = (await p.turnPins())!;
  // The same chat open in the other tab: its own Journal over the same storage and the same Web Locks.
  const pB = traced(w.pinned(sid, 'B'), 'B');
  pB.open();
  await flush(900);
  return { p, pB, sid, bounds };
}
const spec = (bounds: readonly number[], turn: number): Fk.ForkSpec => ({ turn, pin: bounds[turn] as number });

/** Holds the next WAITING request for a send lock (a sender's) until open(); `asked` resolves when that request was made. ifAvailable
 *  requests (a retire's free-send-lock try) pass through, and see the lock free while the sender has not got it yet. */
function holdSendLockRequest(): { asked: Promise<void>; open: () => void } {
  const locks = (globalThis.navigator as any).locks;
  const real = locks.request.bind(locks);
  const g = gate();
  let asked!: () => void;
  const askedP = new Promise<void>((r) => { asked = r; });
  let armed = true;
  locks.request = (name: string, a: unknown, b?: unknown) => {
    if (armed && typeof a === 'function' && name.startsWith(sendLockName(''))) {
      armed = false;
      asked();
      return g.hold('a sender\'s send-lock request', () => real(name, a));
    }
    return b === undefined ? real(name, a) : real(name, a, b);
  };
  return { asked: askedP, open: g.open };
}

describe('X1 a live press holding T against a Check from the other tab', () => {
  it('between its claim and its send lock, the other tab\'s Check answers at once, makes no retire call and keeps the record; the press then opens its chat', async () => {
    const { p, pB, sid, bounds } = await parentChat(2);
    const held = holdSendLockRequest();
    const press = p.fork(spec(bounds, 1));
    const pressed = settledFlag(press);
    for (let i = 0; i < 40; i++) { await flush(50); if (pendingForks().length) break; }
    await held.asked;
    // The press holds T and its record is claimed; its send lock is not taken yet, so only T keeps a retire out.
    expect(await tHeld(tName(sid, 1)), 'the press holds T').toBe(true);
    const [rec] = pendingForks();
    expect(rec, 'the press claimed its record').toBeTruthy();
    expect(forkCreates(), 'the create has not left').toHaveLength(0);

    const check = pB.checkFork(rec.k1);
    const checked = settledFlag(check);
    for (let i = 0; i < 20 && !checked.done; i++) await flush(50);
    expect(checked.done, 'a Check never waits for T: it answers while the press still holds it').toBe(true);
    expect(pressed.done, 'the press is still in its window').toBe(false);
    const out = await check;
    expect(out.k, 'nothing is proven while the press holds T').toBe('unknown');
    expect(retires(), 'no T, no retire call').toHaveLength(0);
    expect(pendingForks().map((x) => x.k1), 'the record stays').toEqual([rec.k1]);

    held.open();
    for (let i = 0; i < 40 && !pressed.done; i++) await flush(100);
    const made = await press;
    expect(made, 'the press makes its chat: no neighbour fenced its key').toMatchObject({ k: 'opened', k1: rec.k1 });
    expect(forkCreates(), 'one create').toHaveLength(1);
    expect(await tHeld(tName(sid, 1)), 'T is free once the press settled').toBe(false);
    const again = await pB.checkFork(rec.k1);
    expect(again, 'the other tab now finds the chat').toMatchObject({ k: 'opened', sid: (made as any).sid });
    expect(retires(), 'still no retire call').toHaveLength(0);
  });
});

describe('X2 a stale read under T against a handoff from the other tab', () => {
  it('a Check whose read says miss after the other tab moved the record to its chat makes no retire call and does not end the fork as none', async () => {
    const { p, pB, sid, bounds } = await parentChat(2);
    agent().o.createLost = true;
    const out = (await p.fork(spec(bounds, 1))) as any;
    agent().o.createLost = false;
    expect(out).toMatchObject({ k: 'unknown', reason: 'lost' });
    const k1 = out.k1 as string;
    expect(pendingForks().map((x) => x.k1)).toEqual([k1]);

    // This tab's read of the key is held, then answers a miss that is stale by then; every later read is the agent's own.
    const real = agent().createKeyGet.bind(agent());
    const g = gate();
    let inRead!: () => void;
    const reading = new Promise<void>((r) => { inRead = r; });
    let n = 0;
    agent().createKeyGet = async (...a: unknown[]) => {
      if (++n === 1) { inRead(); await g.passage('X2 read of the key'); return Promise.reject({ status: 404, code: 'create_not_found' }); }
      return (real as any)(...a);
    };
    const check = p.checkFork(k1);
    await reading;
    expect(await tHeld(tName(sid, 1)), 'the Check holds T while it reads').toBe(true);

    // The other tab cannot take T: it reads once, the key proves the chat, and the record moves to it (the handoff needs no T). It does not
    // open it while T is held: the holder may be a press still waiting for the reply that alone names the session's binding
    // (ask-fork-mismatch: a reply that proves another binding refuses the fork).
    const other = await pB.checkFork(k1);
    expect(other).toMatchObject({ k: 'unknown', k1, reason: 'busy' });
    const moved = atSession(k1);
    expect(moved, 'the record is at the chat\'s session').toBeTruthy();
    expect(pendingForks(), 'nothing is pending').toHaveLength(0);

    g.open();
    const mine = await check;
    expect(retires(), 'the retire looked at the record again under the send lock: moved, so no retire call').toHaveLength(0);
    expect(mine.k, 'a stale miss never ends a made fork as none').not.toBe('refused');
    expect(atSession(k1), 'the chat\'s record is untouched').toEqual(moved);
    expect(forkCreates(), 'one create').toHaveLength(1);
    expect(await pB.checkFork(k1), 'with T free the other tab opens the chat').toMatchObject({ k: 'opened', k1 });
  });
});

describe('X3 the late successful create', () => {
  it('a create in flight when its engine ends keeps T, the other tab retires nothing meanwhile, and its success moves the record before T is freed', async () => {
    const { p, pB, sid, bounds } = await parentChat(2);
    const real = agent().create.bind(agent());
    const g = gate();
    let called = false;
    agent().create = (...a: unknown[]) => { called = true; return g.hold('X3 create', () => real(...a)); };
    const press = p.fork(spec(bounds, 1));
    for (let i = 0; i < 40 && !called; i++) await flush(100);
    expect(called, 'the create left').toBe(true);
    p.end();
    await flush(300);
    await press;
    const [rec] = pendingForks();
    expect(rec, 'the record stays while the answer is awaited').toBeTruthy();
    expect(await tHeld(tName(sid, 1)), 'T outlives the ended engine: its create is still in flight').toBe(true);

    const during = await pB.checkFork(rec.k1);
    expect(during.k, 'the other tab proves nothing while T is held').toBe('unknown');
    expect(retires(), 'and retires nothing').toHaveLength(0);
    expect(pendingForks().map((x) => x.k1)).toEqual([rec.k1]);

    g.open();
    await flush(900);
    const moved = atSession(rec.k1);
    expect(moved, 'the late success moved the record to the new chat').toBeTruthy();
    expect(moved.fk).toEqual(rec.fk);
    expect(pendingForks(), 'nothing is pending').toHaveLength(0);
    expect(await tHeld(tName(sid, 1)), 'T is free after the handoff').toBe(false);

    const after = await pB.checkFork(rec.k1);
    expect(after).toMatchObject({ k: 'opened', sid: moved.s, k1: rec.k1 });
    expect(forkCreates(), 'one create').toHaveLength(1);
    expect(retires(), 'no retire call at any point').toHaveLength(0);
  });
});

describe('X4 an account switch between opening a recovery and its Check', () => {
  const k1 = 'hx-a' + '7'.padStart(31, '0');
  const rec = { p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, rc: 'custom', n: null, i: null, q: 0, ph: 'completed', l: 'en', k1, k2: 'hx-b' + '7'.padStart(31, '0'), at: 1007, fk: { s: 'sess-p7', i: 1 } };
  const addr = `${HANDLE}|${REALM}|create:${k1}`;
  const docOf = (acct: string): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL) ?? 'null')?.a?.[acct] ?? {}; } catch { return {}; } };
  function plantIn(acct: string): void {
    const raw = w!.fs.peek(JOURNAL);
    const all = raw ? JSON.parse(raw) : { v: 1, a: {} };
    all.a[acct] = { ...(all.a[acct] ?? {}), [addr]: { h: HANDLE, ...rec } };
    w!.fs.seed(JOURNAL, JSON.stringify(all));
  }
  it('A\'s recovery, checked while B is shown, makes no retire call and leaves B\'s unresolved record of the same key and target in place', async () => {
    w = world({});
    // Both accounts hold an unresolved fork of the same create key and target; A's agent never saw the key (a read of it is a miss).
    plantIn(ACCOUNT);
    plantIn(OTHER);
    const before = JSON.stringify(docOf(OTHER)[addr]);
    // Opened for A: A's agent connection, the page's journal, this computer and realm (as registry.forkRecoveryFor builds it).
    const recovery = new ForkRecovery({ io: w.agent as any, j: w.j, acct: ACCOUNT, handle: HANDLE, realm: REALM, alive: () => true } as any);
    showAccount(OTHER);
    try {
      const out = await recovery.check(k1);
      expect(retires(), 'A\'s connection retires nothing on B\'s behalf').toHaveLength(0);
      expect(JSON.stringify(docOf(OTHER)[addr]), 'B\'s record is untouched').toBe(before);
      expect(out.k, 'nothing is proven about B\'s fork').not.toBe('refused');
      expect(await recovery.hide(k1), 'nor hidden through A\'s recovery').toBe(false);
      expect(docOf(OTHER)[addr].dk, 'no dismissal written into B').toBeUndefined();
    } finally { showAccount(ACCOUNT); }
    expect(docOf(ACCOUNT)[addr], 'A\'s own record is still there').toBeTruthy();
  });
});

describe('X5 a claim that waits 61 s for the record lock', () => {
  it('the press holds T through the wait, so the other tab\'s Check, made once the claim lands and before the send, retires nothing, and the press then opens its chat', async () => {
    const { p, pB, sid, bounds } = await parentChat(2);
    const releaseRecs = await holdName(recsLockName(ACCOUNT));
    const held = holdSendLockRequest(); // gates the press before its admission, once its claim is stored
    const press = p.fork(spec(bounds, 1));
    const pressed = settledFlag(press);
    await flush(200);
    expect(await tHeld(tName(sid, 1)), 'the press holds T while its claim waits for the record lock').toBe(true);
    expect(pendingForks(), 'the claim is not stored yet').toHaveLength(0);
    expect(pressed.done).toBe(false);

    w!.clock.run(61_000); // a minute passes, then a second: longer than any lease the old design had
    await flush(200);
    expect(await tHeld(tName(sid, 1)), 'T is still the press\'s after 61 s').toBe(true);
    expect(pressed.done, 'the press is still waiting').toBe(false);
    expect(forkCreates(), 'nothing was sent').toHaveLength(0);

    releaseRecs();
    await held.asked;
    const [rec] = pendingForks();
    expect(rec, 'the claim landed when the lock was free').toBeTruthy();
    expect(await tHeld(tName(sid, 1)), 'T is held across the gap between the claim and the admission').toBe(true);

    const out = await pB.checkFork(rec.k1);
    expect(out.k, 'nothing is proven while the press holds T').toBe('unknown');
    expect(retires(), 'no retire call').toHaveLength(0);
    expect(pendingForks().map((x) => x.k1), 'the record stays').toEqual([rec.k1]);

    held.open();
    for (let i = 0; i < 40 && !pressed.done; i++) await flush(100);
    expect(await press, 'the press makes its chat').toMatchObject({ k: 'opened', k1: rec.k1 });
    expect(forkCreates(), 'one create').toHaveLength(1);
    expect(retires(), 'still no retire call').toHaveLength(0);
    expect(await tHeld(tName(sid, 1)), 'T is free once the press settled').toBe(false);
  });
});
