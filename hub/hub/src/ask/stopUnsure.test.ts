// Vitest: unknown outcomes of the Ask engine (C9).
// A Stop whose cancellation got no answer, and whose turn never showed it ended in the reads after it, is unknown: the turn is no longer
// said to be stopping, Stop stays held (no second cancellation), and the chat offers Check again, which only reads the turn's receipt.
// A session read answering 404 while a message sent to the chat is unsettled proves nothing: the chat is not called gone.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kit/agent/approver-live', () => ({ approvers: () => ({ state: () => ({ phase: 'none' }), subscribe: () => () => undefined }), resetApproversForTests: () => undefined }));

import { engineActive, type ActiveDeps } from './active';
import { stopFor } from './Composer';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type Snapshot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts, type FakeOptions } from './fake';
import * as L from './logic';
import { blocksOf } from './source';
import strings from './strings.en.json';

// ---- the turn state and what is drawn from it ----

const turnConv = (over: Partial<L.AskState> = {}): C.Conv => {
  const c = C.addTurn(C.emptyConv('S'), { turnId: 't1', now: 1 });
  const t = C.current(c) as C.TurnBlock;
  return { ...c, sid: 'S', turns: [{ ...t, s: { ...t.s, ...over } }] };
};
function snapOf(conv: C.Conv, over: Partial<Snapshot> = {}): Snapshot {
  return {
    phase: 'ready', blocked: null, band: null, starting: false, conv, status: 'working', gates: [], gate: null,
    decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
    needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
    ...over,
  };
}

describe('the turn state', () => {
  it('stopUnsure turns a Stop on its way into an unknown one: not stopping, the phase is the turn\'s own again', () => {
    let s = L.reduce(L.initial({ turnId: 't1' }), { type: 'stop' });
    expect(s.stopping).toBe(true);
    expect(L.phase(s)).toBe('stopping');
    s = L.reduce(s, { type: 'stopUnsure', turnId: 't1' });
    expect(s.stopping).toBe(false);
    expect(s.stopUnsure).toBe(true);
    expect(L.phase(s)).toBe('working');
    // Held: a second Stop does not mark the turn stopping again (the engine sends nothing for it either).
    expect(L.reduce(s, { type: 'stop' }).stopping).toBe(false);
  });

  it('only the named turn, and only a Stop on its way, becomes unknown', () => {
    const on = L.reduce(L.initial({ turnId: 't1' }), { type: 'stop' });
    expect(L.reduce(on, { type: 'stopUnsure', turnId: 't2' }).stopUnsure).toBeUndefined();
    expect(L.reduce(L.initial({ turnId: 't1' }), { type: 'stopUnsure', turnId: 't1' }).stopUnsure).toBeUndefined();
  });

  it('a running turn with an unknown Stop draws one line with Check again, in the dock column\'s and the page\'s words, marked stop (the page adds no note of its own)', () => {
    const live = C.blocks(turnConv({ stopUnsure: true }), 0);
    expect(live.filter((b) => b.k === 'stopUnsure')).toHaveLength(1);
    const line = blocksOf(live).find((b) => b.k === 'line');
    expect(line).toMatchObject({ k: 'line', text: strings['ask.stopUnsure'], tone: 'info', recheck: true, stop: true });
    // Once the turn ended there is nothing to check.
    const ended = C.blocks(turnConv({ stopUnsure: true, terminal: { state: 'cancelled', code: '', retryAt: null, effects: false } }), 0);
    expect(ended.some((b) => b.k === 'stopUnsure')).toBe(false);
  });

  it('the dock holds Stop and does not say the turn is stopping', () => {
    const press = vi.fn();
    expect(stopFor(snapOf(turnConv({ stopUnsure: true })), press, true)).toEqual({ busy: true, unknown: true, onPress: press });
    expect(stopFor(snapOf(turnConv({ stopping: true })), press, true)).toEqual({ busy: true, onPress: press });
    expect(stopFor(snapOf(turnConv()), press, true)).toEqual({ busy: false, onPress: press });
  });
});

// ---- the page's Stop over the engine (the active source) ----

describe('the page\'s Stop', () => {
  const REF = { computer: 'atlas.tlas', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'S' };
  const deps = (): ActiveDeps => ({
    approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
    leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
    pending: () => [], onPending: () => () => undefined,
    set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000,
  });
  function fake(conv: C.Conv, onStop: (put: (c: C.Conv) => void) => void = () => undefined) {
    let s = snapOf(conv);
    const subs = new Set<() => void>();
    const put = (c: C.Conv) => { s = { ...s, conv: c }; for (const f of [...subs]) f(); };
    const stops: number[] = [];
    const none = () => undefined;
    const eng = {
      getSnapshot: () => s,
      subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
      activation: () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: 'S', target: {} }, strict: false }),
      send: () => false, decide: none, answer: none, check: none, checkDecision: none, dismissDecision: none, canDismiss: () => false,
      attach: none, unattach: none, checkNow: none, attemptOf: none, decisionProof: none, claimWaiting: () => false, unknownDecisions: () => [],
      stop: () => { stops.push(1); onStop(put); },
    } as unknown as AskEngine;
    return { eng, put, stops };
  }
  const open = (f: ReturnType<typeof fake>) => engineActive({ current: () => f.eng, release: () => undefined }, REF, () => ({ computer: 'atlas', realm: 'Personal' }), deps());

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a Stop that turns unknown while the page waits is unknown, never refused', async () => {
    const f = fake(turnConv(), (put) => put(turnConv({ stopping: true })));
    const p = open(f).stop('turn');
    f.put(turnConv({ stopUnsure: true }));
    expect(await p).toEqual({ k: 'unknown' });
  });

  it('a second Stop on a turn whose Stop is unknown sends nothing (the attempt reads it as unknown)', async () => {
    const f = fake(turnConv({ stopUnsure: true }));
    expect(await open(f).stop('turn')).toEqual({ k: 'refused', code: 'stop_pending' });
    expect(f.stops).toHaveLength(0);
  });
});

// ---- the engine, end to end against the scripted agent ----

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
function memStore(): StoreIO {
  let st: L.AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: Partial<FakeOptions> = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 200, realms: [REALM], ...o }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { agent: agent as any, eng, flush };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);

describe('the engine: a Stop whose answer was lost', () => {
  beforeEach(() => { resetSignHoldsForTests(); });

  it('after its reads it is unknown: held, not stopping, one line; Check again reads the receipt only; the turn\'s end clears it', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'Working' }, { k: 'hold' }]] });
    t.eng.setAuto(false);
    t.eng.send('Build me a small dashboard');
    await t.flush(500);
    const tid = C.current(t.eng.getSnapshot().conv)!.s.turnId as string;
    expect(tid).toBeTruthy();
    // The cancellation reaches nobody and its answer is lost (a 503): the turn runs on.
    const real = t.agent.cancel.bind(t.agent);
    t.agent.cancel = (...a: unknown[]) => { t.agent.log.push(['cancel', a]); return Promise.reject({ status: 503, code: 'unavailable' }); };
    t.eng.stop();
    await t.flush(10);
    expect(C.current(t.eng.getSnapshot().conv)!.s.stopping).toBe(true);
    // Its receipt is read every 2 s for 90 s; the turn never shows it ended.
    await t.flush(95_000);
    const s = C.current(t.eng.getSnapshot().conv)!.s;
    expect(s.turnId).toBe(tid);
    expect(s.terminal).toBeNull();
    expect(s.stopping).toBe(false);
    expect(s.stopUnsure).toBe(true);
    expect(L.phase(s)).toBe('working');
    expect(C.blocks(t.eng.getSnapshot().conv, 0).filter((b) => b.k === 'stopUnsure')).toHaveLength(1);
    expect(stopFor(t.eng.getSnapshot(), () => undefined, true)).toMatchObject({ busy: true, unknown: true });
    // Stop again: nothing is sent.
    t.eng.stop();
    await t.flush(10);
    expect(calls(t.agent, 'cancel')).toHaveLength(1);
    // Check again: one receipt read, no cancellation.
    const reads = calls(t.agent, 'receipt').length;
    t.eng.checkOutcome();
    await t.flush(10);
    expect(calls(t.agent, 'receipt').length).toBe(reads + 1);
    expect(calls(t.agent, 'cancel')).toHaveLength(1);
    // The turn ends (the earlier cancellation took after all): no line, no Stop.
    const sid = t.eng.record!.s as string;
    void real(sid, tid);
    await t.flush(500);
    t.eng.checkOutcome();
    await t.flush(500);
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    expect(C.blocks(t.eng.getSnapshot().conv, 0).some((b) => b.k === 'stopUnsure')).toBe(false);
    expect(stopFor(t.eng.getSnapshot(), () => undefined, true)).toBeNull();
  });
});

describe('the engine: a 404 session read while a message is unsettled', () => {
  beforeEach(() => { resetSignHoldsForTests(); });
  const hide = (agent: any) => { agent.state = () => Promise.reject({ status: 404, code: 'not_found', message: 'session not found' }); };

  it('a follow-up whose answer was lost keeps the chat: not called gone, the row stays unknown', async () => {
    const t = await setup({ pace: 10, commandLost: true, script: [scripts.approval] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    t.eng.send('Also add a legend');
    await t.flush(10);
    const row = Object.values(t.eng.getSnapshot().conv.users).find((u) => u.text === 'Also add a legend');
    expect(row?.state).toBe('unknown');
    hide(t.agent);
    t.eng.wake();
    await t.flush(5000);
    expect(t.eng.getSnapshot().blocked?.key).not.toBe('ask.gone');
    expect(t.eng.record?.ph).not.toBe('gone');
    expect(Object.values(t.eng.getSnapshot().conv.users).find((u) => u.text === 'Also add a legend')?.state).toBe('unknown');
  });

  it('with nothing unsettled the same read still means the chat is gone', async () => {
    const t = await setup({ pace: 10, script: [scripts.approval] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    hide(t.agent);
    t.eng.wake();
    await t.flush(5000);
    expect(t.eng.getSnapshot().blocked?.key).toBe('ask.gone');
  });
});
