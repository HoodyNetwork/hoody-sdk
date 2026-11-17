// One conversation = one engine, one stream, one lease. The dock's engine hands its
// conversation to the shared (pinned) engine of its reference only at a quiet point (session known; no row sending, unknown or
// queued; no unsettled decision attempt); at any other point the registry says "finishing" and never opens a second engine.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';

type Hang = Record<string, boolean>;
type Held = Array<() => void>;
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    // One agent per computer for the whole test; `__hang` makes the named agent calls never answer (a request in flight).
    liveIO: (t: { container: { id: string } }) => {
      const g = globalThis as { __fake?: InstanceType<typeof FakeAgent>; __fakeOpts?: object; __hang?: Hang; __held?: Held; __fail?: Record<string, unknown> };
      g.__fake ??= new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'], ...g.__fakeOpts }, realClock);
      const agent = g.__fake;
      const wrapped = new Proxy(agent, {
        get(target, p) {
          const v = (target as any)[p];
          if (typeof v !== 'function') return v;
          // A held call is made, and its answer given, when the test lets it go (releaseHang).
          // A failed call never reaches the agent: the request may or may not have left (the answer is a pending-type fault).
          if (g.__fail && String(p) in g.__fail) return () => Promise.reject(g.__fail![String(p)]);
          return (...a: unknown[]) => (g.__hang?.[String(p)] ? new Promise((res, rej) => { (g.__held ??= []).push(() => { Promise.resolve(v.apply(target, a)).then(res, rej); }); }) : v.apply(target, a));
        },
      });
      return real.withFixtureDest(wrapped, t.container.id);
    },
  };
});

import './data';
import { computerHandle } from '@core';
import type { AskEngine } from './engine';
import type * as Reg from './registry';
import type { FakeAgent } from './fake';
import { scripts } from './fake';
import * as C from './conv';
import { ACCOUNT, REALM, slot, world, type World } from './accept/env';

let w: World | null = null;
// The fake agent's pace, the engines' timers and tick() run on a fake clock that also keeps the real pace
// (shouldAdvanceTime): tick(ms) moves it by ms at once, so a wait is never a sleep that host load stretches; vi.waitFor
// moves it too. setImmediate and microtasks stay real.
// The read sources (./source) pull in the kit: loaded once here, so a test that opens one lazily never spends its time limit on
// the cold transform.
beforeAll(async () => { await import('./source'); }, 180_000);
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], shouldAdvanceTime: true }); });
afterEach(async () => {
  const R = await import('./registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
  w?.dispose();
  w = null;
  const g = globalThis as { __fake?: unknown; __fakeOpts?: unknown; __hang?: unknown };
  delete g.__fake;
  delete g.__fakeOpts;
  delete g.__hang;
  delete (g as { __fail?: unknown }).__fail;
  delete (g as { __held?: unknown }).__held;
  vi.useRealTimers();
});
const fake = (): FakeAgent => (globalThis as { __fake?: FakeAgent }).__fake!;
const hang = (h: Hang): void => { (globalThis as { __hang?: Hang }).__hang = h; };
/** The held calls are made now and answered; later calls are not held. */
const releaseHang = (): void => { const g = globalThis as { __hang?: Hang; __held?: Held }; g.__hang = {}; const held = g.__held ?? []; g.__held = []; for (const f of held) f(); };
const opts = (o: object): void => { (globalThis as { __fakeOpts?: object }).__fakeOpts = o; };

const AT = { project: slot.project, id: slot.computer, name: 'atlas' };
const HANDLE = computerHandle(AT);
const target = { project: { id: slot.project }, container: { id: slot.computer, server_name: 'atlas' } } as any;
const dir = { resolve: (h: string) => (h === HANDLE ? AT : null), handleOf: (id: string) => (id === AT.id ? HANDLE : null) };
const refOf = (sid: string) => ({ computer: HANDLE, realm: REALM, sid });
const tick = (ms = 60) => vi.advanceTimersByTimeAsync(ms);
const sidOf = (e: AskEngine): string => e.record?.s ?? '';

/** The dock's engine with a conversation whose first message has been answered, so the session is known and nothing is in flight. */
async function dockWithSession(): Promise<{ R: typeof Reg; eng: AskEngine; sid: string }> {
  w = world();
  const R = await import('./registry');
  R.setComputerDirectory(dir);
  const eng = R.engineFor(slot, target);
  await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
  eng.send('Build me a dashboard');
  await vi.waitFor(() => {
    expect(sidOf(eng), 'phase ' + eng.getSnapshot().phase + ' ' + JSON.stringify(eng.getSnapshot().blocked) + ' rows ' + JSON.stringify(Object.values(eng.getSnapshot().conv.users).map((u) => u.state))).not.toBe('');
    expect(Object.values(eng.getSnapshot().conv.users).every((u) => u.state === 'sent')).toBe(true);
  }, { timeout: 8000 });
  await vi.waitFor(() => expect(fake().openStreams(sidOf(eng))).toBe(1), { timeout: 5000 });
  return { R, eng, sid: sidOf(eng) };
}

/** As dockWithSession, but the first message ends in a parked approval card (the turn stays running). */
async function dockWithGate(script: unknown[], card = true): Promise<{ R: typeof Reg; eng: AskEngine; sid: string }> {
  opts({ script });
  w = world();
  const R = await import('./registry');
  R.setComputerDirectory(dir);
  const eng = R.engineFor(slot, target);
  await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
  eng.setAuto(false);
  eng.send('Build me a dashboard');
  await vi.waitFor(() => {
    expect(sidOf(eng)).not.toBe('');
    if (card) expect(eng.getSnapshot().gates.length, 'no card').toBeGreaterThan(0);
    expect(Object.values(eng.getSnapshot().conv.users).every((u) => u.state === 'sent')).toBe(true);
  }, { timeout: 8000 });
  return { R, eng, sid: sidOf(eng) };
}
const rowStates = (e: AskEngine): string[] => Object.values(e.getSnapshot().conv.users).map((u) => u.state);

describe('T1: a conversation the dock holds is never held a second time', () => {
  it('openRef for the dock\'s own session at a quiet point: exactly one engine streams it afterwards, and the dock\'s engine lets go', async () => {
    const { R, eng, sid } = await dockWithSession();
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h).not.toBeNull();
    await tick(200);
    expect(fake().openStreams(sid), 'two engines stream one session').toBe(1);
    expect(h.current().session(), 'the handle is not on the session').toBe(sid);
    expect(eng.session(), 'the dock\'s engine still holds the session').toBeNull();
    h.release();
  });

  it('a second holder of the same reference shares the one engine', async () => {
    const { R, sid } = await dockWithSession();
    const a = R.openRef(ACCOUNT, refOf(sid), AT)!;
    const b = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(a.current()).toBe(b.current());
    await tick(200);
    expect(fake().openStreams(sid)).toBe(1);
    a.release();
    expect(b.current().getSnapshot().phase).not.toBe('ended');
    b.release();
  });

  it('a dock engine made AFTER the handoff does not take the session back from the shared engine (no second stream)', async () => {
    const { R, eng, sid } = await dockWithSession();
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    await tick(100);
    // The dock's engine is made again (the context changed, the page reloaded): its stored front record is the same session.
    eng.end();
    const again = R.engineFor(slot, target);
    await vi.waitFor(() => expect(again.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
    await tick(200);
    expect(again.session(), 'the new dock engine took the shared session').toBeNull();
    expect(fake().openStreams(sid)).toBe(1);
    h.release();
  });
});

describe('T2: the handoff happens only at a quiet point', () => {
  it('quiet: session known, every row settled: dockHandoff names the reference', async () => {
    const { R, sid } = await dockWithSession();
    expect(R.dockHandoff(slot)).toEqual({ k: 'ref', ref: refOf(sid) });
  });

  it('a dock with no conversation: nothing to hand off', async () => {
    w = world();
    const R = await import('./registry');
    R.setComputerDirectory(dir);
    const eng = R.engineFor(slot, target);
    await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
    expect(R.dockHandoff(slot)).toEqual({ k: 'none' });
  });

  it('a first message on its way (no session yet): finishing, not none', async () => {
    w = world();
    hang({ create: true });
    const R = await import('./registry');
    R.setComputerDirectory(dir);
    const eng = R.engineFor(slot, target);
    await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
    eng.send('Build me a dashboard');
    await tick(100);
    expect(R.dockHandoff(slot)).toEqual({ k: 'finishing' });
  });

  /** Each case brings the dock's engine to a non-quiet state with the session known; the handoff must refuse and open no second engine. */
  const cases: Array<[string, (e: AskEngine) => Promise<void>, string[]]> = [
    ['a row sending (follow-up in flight)', async (e) => { hang({ turn: true, command: true }); e.send('and a chart'); await tick(100); }, ['sending']],
    ['a row of unknown outcome (answer lost)', async (e) => { (globalThis as any).__fail = { turn: { status: 502, pending: true }, command: { status: 502, pending: true } }; hang({ turns: true, receipt: true, commandGet: true }); e.send('and a chart'); await tick(300); }, ['unknown']],
  ];
  for (const [name, bring, want] of cases) {
    it(`${name}: finishing; openRef lends the dock's engine; no second engine, no second stream`, async () => {
      const { R, eng, sid } = await dockWithSession();
      await bring(eng);
      expect(rowStates(eng).some((s) => want.includes(s)), 'the case did not reach its state: ' + rowStates(eng).join()).toBe(true);
      expect(R.dockHandoff(slot)).toEqual({ k: 'finishing' });
      const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
      expect(h.current(), 'a second engine was made').toBe(eng);
      expect(eng.session()).toBe(sid);
      await tick(150);
      expect(fake().openStreams(sid)).toBe(1);
      h.release();
      expect(eng.getSnapshot().phase, 'the lent engine was ended by the release').not.toBe('ended');
    });
  }

  it('a row queued behind a running turn: finishing; the dock\'s engine is lent, not duplicated', async () => {
    const hold = { k: 'hold' };
    const { R, eng, sid } = await dockWithGate([[scripts.dashboard[0], hold]], false);
    // The follow-up goes once the turn is parked at its hold: before that the fixture commits it at the turn's next step.
    await vi.waitFor(() => expect(fake().held(sid)).toBe(true), { timeout: 5000 });
    eng.send('and a chart');
    await vi.waitFor(() => expect(rowStates(eng)).toContain('queued'), { timeout: 5000 });
    expect(R.dockHandoff(slot)).toEqual({ k: 'finishing' });
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    await tick(150);
    expect(fake().openStreams(sid)).toBe(1);
    h.release();
  });

  it('a decision on its way (the answer held): finishing; lent, not duplicated; then handed over once it is answered', async () => {
    const { R, eng, sid } = await dockWithGate([scripts.approval]);
    hang({ confirm: true });
    eng.decide('once');
    await tick(120);
    expect(R.dockHandoff(slot)).toEqual({ k: 'finishing' });
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    await tick(100);
    expect(fake().openStreams(sid)).toBe(1);
    releaseHang();
    await vi.waitFor(() => expect(eng.session(), 'the dock\'s engine kept the session after the decision was answered').toBeNull(), { timeout: 8000 });
    expect(h.current().session()).toBe(sid);
    await tick(150);
    expect(fake().openStreams(sid)).toBe(1);
    h.release();
  });

  it('a decision whose answer was lost (outcome unknown): finishing, and it stays on the dock\'s engine', async () => {
    const { R, eng, sid } = await dockWithGate([scripts.approval]);
    (globalThis as any).__fail = { confirm: { status: 502, pending: true } };
    hang({ replay: true, state: true, transcript: true });
    eng.decide('once');
    await tick(300);
    expect(R.dockHandoff(slot)).toEqual({ k: 'finishing' });
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    expect(eng.session()).toBe(sid);
    h.release();
  });

  it('the Approve automatically switch on its way (the answer held): finishing; lent, not duplicated', async () => {
    const { R, eng, sid } = await dockWithSession();
    expect(eng.quiet()).toBe(true);
    hang({ yolo: true });
    eng.setAuto(true);
    await tick(80);
    expect(eng.quiet(), 'a switch on its way counts as quiet').toBe(false);
    expect(R.dockHandoff(slot)).toEqual({ k: 'finishing' });
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    releaseHang();
    await vi.waitFor(() => expect(eng.session()).toBeNull(), { timeout: 8000 });
    h.release();
  });

  it('an engine with no conversation yet is never quiet (nothing to hand over)', async () => {
    w = world();
    const R = await import('./registry');
    R.setComputerDirectory(dir);
    const eng = R.engineFor(slot, target);
    await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
    expect(eng.session()).toBeNull();
    expect(eng.quiet()).toBe(false);
    expect(eng.letGo()).toBe(false);
  });

  it('while lent, the dock\'s own Recent row for the same conversation still opens (the dock engine is the holder, not a stranger)', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const k1 = eng.record!.k1;
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    expect(eng.openConversation(k1)).toBe(true);
    releaseHang();
    h.release();
  });

  it('lent, then quiet: the handle moves to the shared engine, tells its watchers, and one stream remains', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    const swapped = vi.fn();
    h.onSwap?.(swapped);
    expect(fake().openStreams(sid)).toBe(1);
    releaseHang();
    await vi.waitFor(() => expect(eng.session(), 'the dock\'s engine kept the session').toBeNull(), { timeout: 8000 });
    expect(swapped).toHaveBeenCalledTimes(1);
    expect(h.current()).not.toBe(eng);
    expect(h.current().session()).toBe(sid);
    await tick(150);
    expect(fake().openStreams(sid)).toBe(1);
    h.release();
  });

  it('a read source opened while lent follows the conversation to the shared engine (its watch is moved, nothing is missed)', async () => {
    const { eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const { askConversations } = await import('./source');
    const held = askConversations.open(ACCOUNT, refOf(sid), AT)!;
    const heard = vi.fn();
    const off = held.source.subscribe(heard);
    releaseHang();
    await vi.waitFor(() => expect(eng.session()).toBeNull(), { timeout: 8000 });
    await tick(150);
    heard.mockClear();
    // Something happens on the session after the move: only the shared engine can tell the source.
    await fake().turn(sid, 'one more thing', 'tk-after-swap');
    await vi.waitFor(() => expect(heard).toHaveBeenCalled(), { timeout: 5000 });
    expect(fake().openStreams(sid)).toBe(1);
    off();
    held.release();
  });
});

describe('reentrancy, kept content, the lent window, an ended dock', () => {
  /** The engine's listener count, to see that a watch is called off. */
  const listeners = (e: AskEngine): number => ((e as any).listeners as Set<unknown>).size;

  it('(1) a reentrant openRef from a subscriber, called while the dock lets go, finds the one pinned engine', async () => {
    const { R, eng, sid } = await dockWithSession();
    const got: Array<ReturnType<typeof R.openRef>> = [];
    let again = false;
    const off = eng.subscribe(() => {
      // The dock's publish after it let go: its session is gone already.
      if (!again && eng.session() === null) { again = true; got.push(R.openRef(ACCOUNT, refOf(sid), AT)); }
    });
    const outer = R.openRef(ACCOUNT, refOf(sid), AT)!;
    off();
    expect(got).toHaveLength(1);
    expect(got[0]!.current(), 'two engines for one session').toBe(outer.current());
    await tick(200);
    expect(fake().openStreams(sid)).toBe(1);
    outer.release();
    expect(got[0]!.current().getSnapshot().phase, 'the first release ended the engine the second holder uses').not.toBe('ended');
    got[0]!.release();
  });

  it('(2) the swap of a lent entry files no temporary entry: a reentrant openRef while the new engine opens joins the lent entry', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const h1 = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h1.current()).toBe(eng);
    // The new engine opens (and publishes) inside the swap: a holder opens the same reference at that moment.
    const { AskEngine: Engine } = await import('./engine');
    const real = Engine.prototype.open;
    let h2: ReturnType<typeof R.openRef> = null;
    let during: AskEngine | null = null;
    vi.spyOn(Engine.prototype, 'open').mockImplementation(function (this: AskEngine) {
      if (this.pinSid === sid && !h2) { h2 = R.openRef(ACCOUNT, refOf(sid), AT); during = h2?.current() ?? null; }
      return real.call(this);
    });
    releaseHang();
    await vi.waitFor(() => expect(eng.session()).toBeNull(), { timeout: 8000 });
    await tick(150);
    expect(h2, 'the swap never opened the new engine').not.toBeNull();
    expect(during, 'the reentrant holder was given the dock engine').not.toBe(eng);
    expect(h2!.current()).toBe(h1.current());
    h1.release();
    expect(h2!.current().getSnapshot().phase, 'the original holder\'s release ended the second holder\'s engine').not.toBe('ended');
    expect(fake().openStreams(sid)).toBe(1);
    h2!.release();
  });

  it('(3) a row the person can still edit or retry (notSent, refused) keeps the dock engine: not quiet, no hand-off, the words stay', async () => {
    for (const state of ['notSent', 'refused'] as const) {
      const { R, eng, sid } = await dockWithSession();
      const row = Object.values(eng.getSnapshot().conv.users)[0]!;
      (eng as any).conv = C.patchUser((eng as any).conv, row.id, { state });
      (eng as any).publish();
      expect(eng.quiet(), state + ' row counted as quiet').toBe(false);
      expect(R.dockHandoff(slot)).toEqual({ k: 'finishing' });
      const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
      expect(h.current(), 'the content was handed to an engine that cannot hold it').toBe(eng);
      expect(Object.values(eng.getSnapshot().conv.users)[0]?.text).toBe('Build me a dashboard');
      h.release();
      R.resetRegistryForTests();
      w?.dispose();
      w = null;
    }
  });

  it('(3) draft files (attached, or still being read) keep the dock engine; they are not dropped by a hand-off', async () => {
    const { R, eng, sid } = await dockWithSession();
    const token = eng.beginRead();
    expect(eng.quiet(), 'files still being read counted as quiet').toBe(false);
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    eng.attach([], '', token);
    h.release();
  });

  it('(4) the lent entry never exposes the dock\'s next conversation: at the switch the holder already has the pinned engine', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    const seen: string[] = [];
    // Every dock publish, in listener order: what a holder would read at that moment.
    const off = eng.subscribe(() => { const c = h.current(); if (c === eng && eng.session() !== sid) seen.push('dock engine showing ' + String(eng.session())); });
    eng.newConversation();
    off();
    expect(seen, 'a holder saw the dock\'s next conversation').toEqual([]);
    expect(h.current(), 'the holder is still on the dock engine after the switch').not.toBe(eng);
    expect(h.current().session()).toBe(sid);
    releaseHang();
    h.release();
  });

  it('(5) an ended dock engine while lent: the holders are told, and the watch is called off on release', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const base = listeners(eng);
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    const swapped = vi.fn();
    h.onSwap(swapped);
    expect(listeners(eng), 'a lent entry listens').toBeGreaterThan(base);
    eng.end();   // what a context bump does to an engine whose connection is gone
    await tick(50);
    expect(swapped, 'the holders were not told the dock ended').toHaveBeenCalled();
    h.release();
    releaseHang();
  });

  it('(5) releasing a lent entry calls its watch off (no listener left on the dock engine)', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const base = listeners(eng);
    for (let i = 0; i < 3; i++) { const h = R.openRef(ACCOUNT, refOf(sid), AT)!; expect(h.current()).toBe(eng); h.release(); }
    expect(listeners(eng), 'a watch leaked per open/release while lent').toBe(base);
    releaseHang();
  });

  it('(6) the gate of a first message clearing publishes, so a waiting hand-off gets its quiet edge', async () => {
    const { eng } = await dockWithSession();
    const uid = Object.values(eng.getSnapshot().conv.users)[0]!.id;
    vi.spyOn(eng as any, 'runFirst').mockImplementation(() => Promise.resolve());
    const quietAt: boolean[] = [];
    const off = eng.subscribe(() => quietAt.push(eng.quiet()));
    (eng as any).firstTurn(uid, 'owed');
    expect(eng.quiet(), 'a gate in progress counted as quiet').toBe(false);
    // Only the promise continuation runs here (no timer can publish for it).
    for (let i = 0; i < 5; i++) await Promise.resolve();
    off();
    expect(quietAt.at(-1), 'no publish after the gate cleared').toBe(true);
  });
});

describe('reentrant holders during the let-go', () => {
  it('(A) a reentrant holder that opens and RELEASES during the dock\'s let-go does not remove the outer holder\'s entry', async () => {
    const { R, eng, sid } = await dockWithSession();
    let inner: ReturnType<typeof R.openRef> = null;
    const off = eng.subscribe(() => { if (!inner && eng.session() === null) { inner = R.openRef(ACCOUNT, refOf(sid), AT); inner?.release(); } });
    const outer = R.openRef(ACCOUNT, refOf(sid), AT)!;
    off();
    expect(inner, 'the listener never ran').not.toBeNull();
    expect(outer.current().getSnapshot().phase, 'the inner release ended the outer holder\'s engine').not.toBe('ended');
    const next = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(next.current(), 'a later openRef made a second engine').toBe(outer.current());
    await tick(200);
    expect(fake().openStreams(sid)).toBe(1);
    next.release();
    outer.release();
  });

  it('(B) a listener installed BEFORE the lend (the dock\'s own, or a registry one) reads the handle at the switch: it gets the pinned engine', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    let h: ReturnType<typeof R.openRef> = null;
    const seen: string[] = [];
    // Installed before the lend: runs before the watch on every dock publish.
    const early = eng.subscribe(() => { if (h && h.current() === eng && eng.session() !== sid) seen.push('early listener read the dock engine'); });
    eng.send('and a chart');
    await tick(100);
    h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    eng.newConversation();
    early();
    expect(seen).toEqual([]);
    expect(h.current()).not.toBe(eng);
    releaseHang();
    h.release();
  });

  it('the holders are told at the switch even when nobody reads the handle', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    const swapped = vi.fn();
    h.onSwap(swapped);
    eng.newConversation();
    expect(swapped, 'not told at the switch').toHaveBeenCalledTimes(1);
    releaseHang();
    h.release();
  });

  it('(C) a superseded row with text keeps the dock engine (its words are local)', async () => {
    const { R, eng, sid } = await dockWithSession();
    const row = Object.values(eng.getSnapshot().conv.users)[0]!;
    (eng as any).conv = C.patchUser((eng as any).conv, row.id, { state: 'superseded' });
    (eng as any).publish();
    expect(eng.quiet(), 'a superseded row with text counted as quiet').toBe(false);
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h.current()).toBe(eng);
    h.release();
  });

  it('(E) the only holder releases while the new engine opens: nobody is told, the new engine is ended with the entry, nothing is left registered', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    const swapped = vi.fn();
    h.onSwap(swapped);
    const { AskEngine: Engine } = await import('./engine');
    const real = Engine.prototype.open;
    let made: AskEngine | null = null;
    // The last holder lets go from inside the new engine's own first publish (what open() does at its start), not before open.
    const hook = (e: AskEngine): void => { if (e.pinSid === sid && !made) { made = e; const off = e.subscribe(() => { off(); h.release(); }); } };
    vi.spyOn(Engine.prototype, 'open').mockImplementation(function (this: AskEngine) { hook(this); return real.call(this); });
    eng.newConversation();
    expect(swapped, 'told after the last holder left').not.toHaveBeenCalled();
    expect(made).not.toBeNull();
    const again = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(again.current(), 'a released entry was reused').not.toBe(made);
    releaseHang();
    again.release();
  });

  it('(F) an ended engine never comes back: open() on it does nothing (no phase change, no request)', async () => {
    const { eng } = await dockWithSession();
    eng.end();
    expect(eng.getSnapshot().phase).toBe('ended');
    const calls = fake().log.length;
    eng.open();
    await tick(150);
    expect(eng.getSnapshot().phase, 'an ended engine was revived').toBe('ended');
    expect(fake().log.length, 'an ended engine made requests').toBe(calls);
  });

  it('(D) a swap interrupted by an open() that throws leaves the entry settleable (the holders are still told)', async () => {
    const { R, eng, sid } = await dockWithSession();
    hang({ turn: true, command: true });
    eng.send('and a chart');
    await tick(100);
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    const { AskEngine: Engine } = await import('./engine');
    const real = Engine.prototype.open;
    let first = true;
    vi.spyOn(Engine.prototype, 'open').mockImplementation(function (this: AskEngine) { if (first && this.pinSid === sid) { first = false; throw new Error('open failed'); } return real.call(this); });
    const told = vi.fn();
    h.onSwap(told);
    try { eng.newConversation(); } catch { /* the failure reaches the caller of the publish */ }
    expect(told, 'holders not told that the engine changed').toHaveBeenCalledTimes(1);
    // The entry is not stuck: the next look settles it onto a working engine.
    const again = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(again.current()).not.toBe(eng);
    releaseHang();
    again.release();
    h.release();
  });
});

describe('holders that reopen from the ended engine', () => {
  it('(G) a holder that reopens the reference from the ended engine\'s own publish (the context check) is not undone by the outer call: one entry, one engine, one stream', async () => {
    const { R, sid } = await dockWithSession();
    const first = R.openRef(ACCOUNT, refOf(sid), AT)!;
    const gone = first.current();
    await vi.waitFor(() => expect(fake().openStreams(sid)).toBe(1), { timeout: 5000 });
    let inner: ReturnType<typeof R.openRef> = null;
    const off = gone.subscribe(() => {
      if (gone.getSnapshot().phase !== 'ended') return;
      off();
      fake().aliveFlag = true; // the context is back for the holder that comes next (a new generation)
      inner = R.openRef(ACCOUNT, refOf(sid), AT);
    });
    fake().aliveFlag = false;
    const outer = R.openRef(ACCOUNT, refOf(sid), AT)!; // the existing engine is asked if its context lives: it ends, and a listener reenters
    expect(inner, 'the reentrant call did not run').not.toBeNull();
    expect(outer.current(), 'the outer holder got a second engine').toBe(inner!.current());
    expect(outer.current()).not.toBe(gone);
    await vi.waitFor(() => expect(outer.current().getSnapshot().phase).not.toBe('checking'), { timeout: 5000 });
    await tick(150);
    expect(fake().openStreams(sid), 'two engines stream one conversation').toBe(1);
    outer.release();
    inner!.release();
    first.release();
    await tick(50);
    expect(fake().openStreams(sid), 'a stream is left after every holder let go').toBe(0);
  });

  it('(I) a replacement that has itself ended before the outer call resumes is not joined: the outer holder gets a live engine', async () => {
    const { R, sid } = await dockWithSession();
    const first = R.openRef(ACCOUNT, refOf(sid), AT)!;
    const gone = first.current();
    await vi.waitFor(() => expect(fake().openStreams(sid)).toBe(1), { timeout: 5000 });
    let inner: ReturnType<typeof R.openRef> = null;
    const off = gone.subscribe(() => {
      if (gone.getSnapshot().phase !== 'ended') return;
      off();
      fake().aliveFlag = true;
      inner = R.openRef(ACCOUNT, refOf(sid), AT);
      inner!.current().end(); // the replacement ends before the outer call resumes (another listener, or a context bump)
    });
    fake().aliveFlag = false;
    const outer = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(inner, 'the reentrant call did not run').not.toBeNull();
    expect(inner!.current().getSnapshot().phase).toBe('ended');
    expect(outer.current().getSnapshot().phase, 'the outer holder joined an ended engine').not.toBe('ended');
    expect(outer.current()).not.toBe(inner!.current());
    await vi.waitFor(() => expect(outer.current().getSnapshot().phase).not.toBe('checking'), { timeout: 5000 });
    await tick(150);
    expect(fake().openStreams(sid), 'two engines stream one conversation').toBe(1);
    outer.release();
    inner!.release();
    first.release();
    await tick(50);
    expect(fake().openStreams(sid)).toBe(0);
  });

  it('(H) an engine ended while it announces its first state starts no request', async () => {
    const { eng } = await dockWithSession();
    const off = eng.subscribe(() => { if (eng.getSnapshot().phase === 'checking') { off(); eng.end(); } });
    const calls = fake().log.filter((x) => x[0] === 'computer').length;
    eng.open();
    await tick(150);
    expect(eng.getSnapshot().phase).toBe('ended');
    expect(fake().log.filter((x) => x[0] === 'computer').length, 'a request was made for an ended engine').toBe(calls);
  });
});

describe('the dock\'s Recent cannot adopt a conversation the shared engine holds', () => {
  it('openConversation of a held session opens nothing and says so', async () => {
    const { R, eng, sid } = await dockWithSession();
    const k1 = eng.record!.k1;
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    await tick(100);
    expect(eng.openConversation(k1)).toBe(false);
    expect(eng.session()).toBeNull();
    await tick(100);
    expect(fake().openStreams(sid)).toBe(1);
    h.release();
  });
});

void scripts;
