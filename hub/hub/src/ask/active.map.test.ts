// The outcome mapping of the adapter over a SCRIPTED engine, for the paths the FakeAgent cannot reach: a decision the agent
// refused after it left, a stop it refused, a row that vanished, an engine that ended. The rule under test (C9): `done` only on
// proof it was taken, `refused` only when nothing reached the agent, everything else `unknown`; the engine is never asked twice.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import type { AskEngine, CardView, Snapshot } from './engine';
import type { Gate } from './logic';
import { engineActive, entryIdentity, sameCheck, type ActiveDeps, type CheckIdentity } from './active';
import { createLeaseManager } from '@kit/agent/lease';
import { TARGET } from '../core/test/env';

vi.mock('@kit/agent/approver-live', () => ({ approvers: () => ({ state: () => ({ phase: 'none' }), subscribe: () => () => undefined }), resetApproversForTests: () => undefined }));

const REF = { computer: 'atlas.tlas', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'S' };
const host = () => ({ computer: 'atlas', realm: 'Personal' });
const gate = (over: Partial<Gate> = {}): Gate => ({ kind: 'confirm', id: 'g1', generation: 1, cause: '', risk: 'low', leaseRequired: false, dnum: null, tool: 'bash', ...over });
const card = (over: Partial<CardView> = {}): CardView => ({ key: 'c1', gate: gate(), helper: false, addressing: false, decision: null, held: null, decidable: true, ...over });
const user = (id: string, state: C.SendState, over: Partial<C.UserMsg> = {}): C.UserMsg => ({ id, text: 't' + id, at: 1, key: 'k' + id, via: 'turn', state, turnId: null, commandId: null, reason: '', ...over });
const turn = (over: Record<string, unknown> = {}): C.TurnBlock => {
  const c = C.addTurn(C.emptyConv('S'), { turnId: 't1', now: 1 });
  const t = C.current(c) as C.TurnBlock;
  return { ...t, s: { ...t.s, ...over } } as C.TurnBlock;
};

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    phase: 'ready', blocked: null, band: null, starting: false, conv: { ...C.emptyConv('S'), sid: 'S' }, status: null, gates: [], gate: null,
    decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
    needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
    ...over,
  };
}
const withUsers = (...us: C.UserMsg[]) => ({ ...C.emptyConv('S'), sid: 'S', users: Object.fromEntries(us.map((u) => [u.id, u])), loose: us.map((u) => u.id) });

function fake(init: Partial<Snapshot> = {}, ahead: Partial<Record<string, (...a: any[]) => unknown>> = {}) {
  let s = snap(init);
  const subs = new Set<() => void>();
  const put = (p: Partial<Snapshot>) => { s = { ...s, ...p }; for (const f of [...subs]) f(); };
  const calls: Record<string, unknown[][]> = {};
  const att = new Map<string, { rid: string; status: 'sending' | 'unknown' }>();
  const proofs = new Map<string, 'applied' | 'refused' | 'elsewhere' | 'notKept' | 'notTaken'>();
  const waiting = new Set<string>();
  const m = (name: string, dflt: (...a: any[]) => unknown = () => undefined) => (...a: unknown[]) => { (calls[name] ??= []).push(a); return (ahead[name] ?? dflt)(...a); };
  const eng = {
    getSnapshot: () => s,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    activation: () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: 'S', target: {} }, strict: false }),
    send: m('send', () => false), decide: m('decide'), answer: m('answer'), stop: m('stop'), check: m('check'), checkDecision: m('checkDecision'),
    dismissDecision: m('dismissDecision'), canDismiss: m('canDismiss', () => false), attach: m('attach'), unattach: m('unattach'),
    checkNow: m('checkNow'),
    attemptOf: (k: string) => att.get(k),
    decisionProof: (r: string) => proofs.get(r),
    claimWaiting: (r: string) => waiting.has(r),
    unknownDecisions: () => [...att.values()].filter((a) => a.status === 'unknown').map((a) => a.rid),
  } as unknown as AskEngine;
  return { eng, put, calls, att, proofs, waiting, get snap() { return s; } };
}

const deps = (over: Partial<ActiveDeps> = {}): ActiveDeps => ({
  approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000, ...over,
});
const open = (f: ReturnType<typeof fake>, over: Partial<ActiveDeps> = {}) => engineActive({ current: () => f.eng, release: () => undefined }, REF, host, deps(over));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('send', () => {
  /** The engine takes the text: a row appears in the given state, then moves through `after`. */
  const takes = (f: ReturnType<typeof fake>, first: C.SendState, id = 'u1') => () => { f.put({ conv: withUsers(user(id, first)) }); return true; };

  it('sent and queued are done; notSent, refused and superseded are refused with a code; unknown stays unknown', async () => {
    for (const [state, want] of [['sent', { k: 'done' }], ['queued', { k: 'done' }], ['notSent', { k: 'refused', code: 'not_sent' }], ['refused', { k: 'refused', code: 'refused' }], ['superseded', { k: 'refused', code: 'superseded' }], ['unknown', { k: 'unknown' }]] as const) {
      const f: ReturnType<typeof fake> = fake({}, { send: () => takes(f, state)() });
      expect(await open(f).send({ text: 'hi' }), state).toEqual(want);
    }
  });

  it('a row still sending moves on: done when the agent takes it, refused when it did not', async () => {
    const f: ReturnType<typeof fake> = fake({}, { send: () => takes(f, 'sending')() });
    const p = open(f).send({ text: 'hi' });
    f.put({ conv: withUsers(user('u1', 'sent')) });
    expect(await p).toEqual({ k: 'done' });
    const g: ReturnType<typeof fake> = fake({}, { send: () => takes(g, 'sending')() });
    const q = open(g).send({ text: 'hi' });
    g.put({ conv: withUsers(user('u1', 'notSent')) });
    expect(await q).toEqual({ k: 'refused', code: 'not_sent' });
  });

  it('a row that is still sending when the wait ends is unknown, not failed; a vanished row is unknown; an ended engine is unknown', async () => {
    const f: ReturnType<typeof fake> = fake({}, { send: () => takes(f, 'sending')() });
    const p = open(f).send({ text: 'hi' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toEqual({ k: 'unknown' });
    const g: ReturnType<typeof fake> = fake({}, { send: () => takes(g, 'sending')() });
    const q = open(g).send({ text: 'hi' });
    g.put({ conv: C.emptyConv('S') });
    expect(await q).toEqual({ k: 'unknown' });
    const h: ReturnType<typeof fake> = fake({}, { send: () => takes(h, 'sending')() });
    const r = open(h).send({ text: 'hi' });
    h.put({ phase: 'ended' });
    expect(await r).toEqual({ k: 'unknown' });
  });

  it('the engine ends in the same breath as a row settles: the ended phase is judged first, so unknown, never done', async () => {
    const f: ReturnType<typeof fake> = fake({}, { send: () => takes(f, 'sending')() });
    const p = open(f).send({ text: 'hi' });
    f.put({ phase: 'ended', conv: withUsers(user('u1', 'sent')) });
    expect(await p).toEqual({ k: 'unknown' });
  });

  it('taken, but the new row cannot be told from others (two rows appeared): unknown, never guessed', async () => {
    const f: ReturnType<typeof fake> = fake({}, { send: () => { f.put({ conv: withUsers(user('u1', 'sent'), user('u2', 'sent')) }); return true; } });
    expect(await open(f).send({ text: 'hi' })).toEqual({ k: 'unknown' });
  });

  it('the engine did not take it: refused, duplicate_held when it holds a possible duplicate, and the call is made once', async () => {
    const f = fake({ dup: { text: 'hi', earlier: false } }, { send: () => false });
    expect(await open(f).send({ text: 'hi' })).toEqual({ k: 'refused', code: 'duplicate_held' });
    expect(f.calls.send).toHaveLength(1);
    expect(f.calls.send![0]![1], 'never "send anyway": the person decides that').toBe(false);
    const g = fake({}, { send: () => false });
    expect(await open(g).send({ text: 'hi' })).toEqual({ k: 'refused', code: 'not_sent' });
  });

  it('a prerequisite that lapsed after the surface drew its button: refused by the table, the engine is not called', async () => {
    const f = fake();
    const o = await open(f, { leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'gone' }), subscribe: () => () => undefined } as any }).send({ text: 'hi' });
    expect(o).toEqual({ k: 'refused', code: 'prerequisites' });
    expect(f.calls.send).toBeUndefined();
  });

  it('a throw from the engine is unknown (a request may have left)', async () => {
    const f = fake({}, { send: () => { throw new Error('boom'); } });
    expect(await open(f).send({ text: 'hi' })).toEqual({ k: 'unknown' });
  });
});

describe('decide', () => {
  const ref = { id: 'g1', generation: 1 };
  const parkedSnap = (c: CardView | null, extra: Partial<Snapshot> = {}): Partial<Snapshot> => ({ gates: c ? [c] : [], gate: c ? c.gate : null, ...extra });
  /** The engine takes the decision: an own attempt `rid` is on its way. */
  const sends = (f: ReturnType<typeof fake>, rid = 'r1') => () => { f.att.set('c1', { rid, status: 'sending' }); f.put(parkedSnap(card({ decision: 'sending' }))); return rid; };

  it('done only on the engine’s proof for THIS request (applied)', async () => {
    const f: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => sends(f)() });
    const p = open(f).decide(ref, { choice: 'once' });
    f.proofs.set('r1', 'applied'); f.att.delete('c1'); f.put(parkedSnap(null));
    expect(await p).toEqual({ k: 'done' });
    expect(f.calls.decide![0]).toEqual(['once', undefined, ref]);
  });

  it('another decision on the gate won, or some other decided line appeared: never done (elsewhere = refused; no proof = not done)', async () => {
    const f: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => sends(f)() });
    const p = open(f).decide(ref, { choice: 'deny' });
    f.proofs.set('r1', 'elsewhere'); f.att.delete('c1');
    f.put({ ...parkedSnap(null), conv: { ...C.emptyConv('S'), turns: [{ ...turn(), decided: [{ kind: 'elsewhere', tool: 'bash', text: '', step: 0 }] } as any] } });
    expect(await p).toEqual({ k: 'refused', code: 'decided_elsewhere' });
    // an unrelated decided line (another gate) with no proof for our request: still waiting, then unknown at the end of the wait
    const g: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => sends(g)() });
    const q = open(g).decide(ref, { choice: 'once' });
    g.put({ ...parkedSnap(card({ decision: 'sending' })), conv: { ...C.emptyConv('S'), turns: [{ ...turn(), decided: [{ kind: 'once', tool: 'other', text: '', step: 0 }] } as any] } });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await q).toEqual({ k: 'unknown' });
  });

  it('the answer was lost: unknown; the gate leaving with the attempt gone and no proof: unknown, not done', async () => {
    const f: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => sends(f)() });
    const p = open(f).decide(ref, { choice: 'once' });
    f.att.set('c1', { rid: 'r1', status: 'unknown' });
    f.put(parkedSnap(card({ decision: 'unknown' })));
    expect(await p).toEqual({ k: 'unknown' });
    const g: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => sends(g)() });
    const q = open(g).decide(ref, { choice: 'once' });
    g.att.delete('c1');
    g.put(parkedSnap(null));
    expect(await q).toEqual({ k: 'unknown' });
  });

  it('refused by the agent after it left: refused with the engine’s proof, answerable again', async () => {
    const f: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => sends(f)() });
    const p = open(f).decide(ref, { choice: 'deny', reason: 'no' });
    f.proofs.set('r1', 'refused'); f.att.delete('c1'); f.put(parkedSnap(card()));
    expect(await p).toEqual({ k: 'refused', code: 'not_applied' });
    expect(f.calls.decide![0]).toEqual(['deny', 'no', ref]);
  });

  it('the journal kept no record, so nothing left: refused not_kept (on this request\'s own proof)', async () => {
    const f: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => { f.proofs.set('r1', 'notKept'); f.put(parkedSnap(card(), { decision: { pending: false, unknown: false, notKept: true } })); return 'r1'; } });
    expect(await open(f).decide(ref, { choice: 'once' })).toEqual({ k: 'refused', code: 'not_kept' });
  });

  it('waiting for the cross-tab lock is still on its way, then the attempt appears and its proof settles it; a wait that ends first is unknown', async () => {
    const f: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => { f.waiting.add('r7'); f.put(parkedSnap(card({ held: 'claiming' }))); return 'r7'; } });
    const p = open(f).decide(ref, { choice: 'once' });
    f.waiting.delete('r7'); f.att.set('c1', { rid: 'r7', status: 'sending' });
    f.put(parkedSnap(card({ decision: 'sending' })));
    f.proofs.set('r7', 'applied'); f.att.delete('c1'); f.put(parkedSnap(null));
    expect(await p).toEqual({ k: 'done' });
    const g: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => { g.waiting.add('r8'); g.put(parkedSnap(card({ held: 'claiming' }))); return 'r8'; } });
    const q = open(g).decide(ref, { choice: 'once' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await q).toEqual({ k: 'unknown' });
  });

  it('ask-decide-overlap-attribution: a second call on a card whose first claim still waits is answered for itself, never with the first call\'s outcome', async () => {
    // A second card (not the lead, so the lead's held state does not refuse the call up front). The first call's claim waits for
    // the cross-tab lock (the engine returns its request id); the second finds the card claiming and the engine takes nothing (no
    // id). The first then lands and is applied: only the first is done.
    const lead = card({ key: 'c0', gate: gate({ id: 'g0' }) });
    const two = (c1: CardView | null): Partial<Snapshot> => ({ gates: c1 ? [lead, c1] : [lead], gate: lead.gate });
    let n = 0;
    const f: ReturnType<typeof fake> = fake(two(card()), { decide: () => { n++; if (n > 1) return null; f.waiting.add('r1'); f.put(two(card({ held: 'claiming' }))); return 'r1'; } });
    const src = open(f);
    const first = src.decide(ref, { choice: 'once' });
    const second = src.decide(ref, { choice: 'deny' });
    f.waiting.delete('r1'); f.att.set('c1', { rid: 'r1', status: 'sending' });
    f.put(two(card({ decision: 'sending' })));
    f.proofs.set('r1', 'applied'); f.att.delete('c1'); f.put(two(null));
    expect(f.calls.decide, 'both calls reached the engine').toHaveLength(2);
    expect(await first, 'the first call is done on its own proof').toEqual({ k: 'done' });
    expect(await second, 'the second call took nothing: refused, not the first call\'s done').toEqual({ k: 'refused', code: 'not_applied' });
  });

  it('a card that leaves while its claim waits keeps the call waiting; the claim\'s notTaken answers not_applied', async () => {
    // The gate leaves (another tab settled it) before the lock is granted: the card is gone but the call's claim still waits, so it is
    // not "unknown" yet; when the lock is granted the engine finds no card and proves the call notTaken: nothing was sent.
    const f: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => { f.waiting.add('r9'); f.put(parkedSnap(card({ held: 'claiming' }))); return 'r9'; } });
    let out: unknown = null;
    const p = open(f).decide(ref, { choice: 'once' }).then((o) => { out = o; return o; });
    f.put(parkedSnap(null));
    await vi.advanceTimersByTimeAsync(0);
    expect(out, 'still waiting while its claim waits, though the card left').toBeNull();
    f.waiting.delete('r9'); f.proofs.set('r9', 'notTaken'); f.put(parkedSnap(null));
    expect(await p).toEqual({ k: 'refused', code: 'not_applied' });
  });

  it('a claim already sent stays its own: its attempt gone with no proof, or its outcome unknown, answers unknown at once', async () => {
    for (const end of ['gone', 'unknown'] as const) {
      const f: ReturnType<typeof fake> = fake(parkedSnap(card()), { decide: () => { f.waiting.add('rs'); f.put(parkedSnap(card({ held: 'claiming' }))); return 'rs'; } });
      let out: unknown = null;
      const p = open(f).decide(ref, { choice: 'once' }).then((o) => { out = o; return o; });
      f.waiting.delete('rs'); f.att.set('c1', { rid: 'rs', status: 'sending' }); f.put(parkedSnap(card({ decision: 'sending' })));
      await vi.advanceTimersByTimeAsync(0);
      expect(out, 'sent and waiting for its outcome').toBeNull();
      if (end === 'gone') { f.att.delete('c1'); f.put(parkedSnap(null)); } else { f.att.set('c1', { rid: 'rs', status: 'unknown' }); f.put(parkedSnap(card({ decision: 'unknown' }))); }
      await vi.advanceTimersByTimeAsync(0);
      expect(out, `${end}: answered before any timeout`).toEqual({ k: 'unknown' });
      await p;
    }
  });

  it('ask-decide-overlap-attribution: a flag an earlier call left never answers a later call the engine took; the later call\'s own proof does', async () => {
    // An earlier decision left notKept; the later one is taken (id r2), and its own outcome is a refusal by the agent.
    const f: ReturnType<typeof fake> = fake(parkedSnap(card(), { decision: { pending: false, unknown: false, notKept: true } }), { decide: () => { f.att.set('c1', { rid: 'r2', status: 'sending' }); f.put(parkedSnap(card({ decision: 'sending' }), { decision: { pending: false, unknown: false, notKept: true } })); return 'r2'; } });
    const p = open(f).decide(ref, { choice: 'once' });
    f.proofs.set('r2', 'refused'); f.att.delete('c1'); f.put(parkedSnap(card(), { decision: { pending: false, unknown: false, notKept: true } }));
    expect(await p).toEqual({ k: 'refused', code: 'not_applied' });
  });

  it('the engine took nothing (the gate was replaced): refused at once, nothing waits', async () => {
    const f = fake(parkedSnap(card()), { decide: () => undefined });
    expect(await open(f).decide(ref, { choice: 'once' })).toEqual({ k: 'refused', code: 'not_applied' });
  });

  it('a stale gate reference is refused before the engine is called', async () => {
    const f = fake(parkedSnap(card()));
    expect(await open(f).decide({ id: 'g1', generation: 9 }, { choice: 'once' })).toEqual({ k: 'refused', code: 'no_gate' });
    expect(f.calls.decide).toBeUndefined();
  });

  it('a question is answered through answer, a confirm is not', async () => {
    const q = card({ gate: gate({ kind: 'question', id: 'q1', question: 'which?' }) });
    const f = fake(parkedSnap(q), { answer: () => undefined });
    expect(await open(f).decide({ id: 'q1', generation: 1 }, { choice: 'once' })).toEqual({ k: 'refused', code: 'no_gate' });
    expect(f.calls.decide).toBeUndefined();
  });
});

describe('stop', () => {
  const running = (over: Record<string, unknown> = {}): Partial<Snapshot> => ({ status: 'working', conv: { ...C.emptyConv('S'), turns: [turn(over)] } });

  it('the turn ends: done', async () => {
    const f: ReturnType<typeof fake> = fake(running(), { stop: () => f.put(running({ stopping: true })) });
    const p = open(f).stop('turn');
    f.put(running({ stopping: false, terminal: { state: 'cancelled' } }));
    expect(await p).toEqual({ k: 'done' });
  });

  it('the agent refused the cancel (Stop shows again): refused, the turn runs on', async () => {
    const f: ReturnType<typeof fake> = fake(running(), { stop: () => f.put(running({ stopping: true })) });
    const p = open(f).stop('turn');
    f.put(running({ stopping: false }));
    expect(await p).toEqual({ k: 'refused', code: 'stop_refused' });
  });

  it('an earlier turn\'s refused cancel never answers the later turn\'s Stop', async () => {
    const ended = turn({ turnId: 'A', terminal: { state: 'completed' }, stopping: false });
    const b = (over: Record<string, unknown> = {}): Partial<Snapshot> => ({ status: 'working', conv: { ...C.emptyConv('S'), turns: [ended, turn({ turnId: 'B', ...over })] } });
    const f: ReturnType<typeof fake> = fake(b(), { stop: () => f.put(b({ stopping: true })) });
    const p = open(f).stop('turn');
    // A's late refusal reaches the engine: B keeps stopping (the engine no longer clears it), so nothing settles.
    f.put(b({ stopping: true }));
    let settled = false;
    void p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled, 'B\'s Stop is still waiting').toBe(false);
    f.put(b({ stopping: false, terminal: { state: 'cancelled' } }));
    expect(await p).toEqual({ k: 'done' });
  });

  it('a cancel that never settles is unknown; one the engine ignored is refused; none running is refused; one in flight is refused', async () => {
    const f: ReturnType<typeof fake> = fake(running(), { stop: () => f.put(running({ stopping: true })) });
    const p = open(f).stop('turn');
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toEqual({ k: 'unknown' });
    expect(await open(fake(running(), { stop: () => undefined })).stop('turn')).toEqual({ k: 'refused', code: 'stop_not_sent' });
    expect(await open(fake()).stop('turn')).toMatchObject({ k: 'refused' });
    expect(await open(fake(running({ stopping: true }))).stop('turn')).toMatchObject({ k: 'refused' });
  });
});

describe('stop: only evidence about the targeted turn counts', () => {
  const running = (over: Record<string, unknown> = {}): Partial<Snapshot> => ({ status: 'working', conv: { ...C.emptyConv('S'), turns: [turn(over)] } });
  it('the engine ends while the cancel is out: unknown, never done', async () => {
    const f: ReturnType<typeof fake> = fake(running(), { stop: () => f.put(running({ stopping: true })) });
    const p = open(f).stop('turn');
    f.put({ phase: 'ended', conv: C.emptyConv('S') });
    expect(await p).toEqual({ k: 'unknown' });
  });
  it('another turn replaces the watched one without its terminal state: unknown', async () => {
    const f: ReturnType<typeof fake> = fake(running(), { stop: () => f.put(running({ stopping: true })) });
    const p = open(f).stop('turn');
    const other = C.addTurn(C.emptyConv('S'), { turnId: 't2', now: 2 });
    f.put({ conv: other });
    expect(await p).toEqual({ k: 'unknown' });
  });
});

describe('check', () => {
  it('a decision check settles on the request’s own proof only: applied = done; the card or the attempt vanishing proves nothing', async () => {
    const lost = { gates: [card({ decision: 'unknown' })], gate: gate(), decision: { pending: true, unknown: true } } as Partial<Snapshot>;
    const f: ReturnType<typeof fake> = fake(lost, { checkDecision: () => { f.proofs.set('r1', 'applied'); f.att.delete('c1'); f.put({ gates: [], gate: null }); } });
    f.att.set('c1', { rid: 'r1', status: 'unknown' });
    expect(await open(f).check({ key: 'c1', kind: 'decision' })).toEqual({ k: 'done' });
    const g: ReturnType<typeof fake> = fake(lost, { checkDecision: () => { g.att.delete('c1'); g.put({ gates: [], gate: null }); } });
    g.att.set('c1', { rid: 'r1', status: 'unknown' });
    expect(await open(g).check({ key: 'c1', kind: 'decision' })).toEqual({ k: 'unknown' });
    const h = fake(lost, { checkDecision: () => undefined });
    h.att.set('c1', { rid: 'r1', status: 'unknown' });
    const q = open(h).check({ key: 'c1', kind: 'decision' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await q).toEqual({ k: 'unknown' });
  });

  it('a refused proof is refused not_applied, another request winning is decided_elsewhere', async () => {
    for (const [proof, want] of [['refused', { k: 'refused', code: 'not_applied' }], ['elsewhere', { k: 'refused', code: 'decided_elsewhere' }]] as const) {
      const f: ReturnType<typeof fake> = fake({ gates: [card({ decision: 'unknown' })] }, { checkDecision: () => { f.proofs.set('r1', proof); f.att.delete('c1'); f.put({ gates: [card()] }); } });
      f.att.set('c1', { rid: 'r1', status: 'unknown' });
      expect(await open(f).check({ key: 'c1', kind: 'decision' }), proof).toEqual(want);
    }
  });

  it('Check names ONE card: another decision of this page settling never answers for it', async () => {
    // A (card c1) is this page's own lost decision and gets its proof; B (card c2) was imported from another tab and has none.
    const both = { gates: [card({ key: 'c1', decision: 'unknown' }), card({ key: 'c2', gate: gate({ id: 'g2' }), decision: 'unknown' })] } as Partial<Snapshot>;
    const f: ReturnType<typeof fake> = fake(both, { checkDecision: () => { f.proofs.set('r1', 'applied'); f.att.delete('c1'); f.put({ gates: [card({ key: 'c2', gate: gate({ id: 'g2' }), decision: 'unknown' })] }); } });
    f.att.set('c1', { rid: 'r1', status: 'unknown' });
    const src = open(f);
    expect(await src.check({ key: 'c2', kind: 'decision' })).toEqual({ k: 'unknown' });
    expect(f.calls.checkDecision, 'B is read again').toHaveLength(1);
    // and A, asked for by its own key, is done on its own proof
    f.proofs.set('r1', 'applied'); f.att.set('c1', { rid: 'r1', status: 'unknown' });
    expect(await src.check({ key: 'c1', kind: 'decision' })).toEqual({ k: 'done' });
  });

  it('a restored unknown decision card (not this page’s own attempt) and a journal-only decision are read again and stay unknown, never "nothing to check"', async () => {
    const lost = { gates: [card({ decision: 'unknown' })], gate: gate(), decision: { pending: true, unknown: true } } as Partial<Snapshot>;
    const f = fake(lost);
    expect(await open(f).check({ key: 'c1', kind: 'decision' })).toEqual({ k: 'unknown' });
    expect(f.calls.checkDecision).toHaveLength(1);
    const g = fake();
    const src = open(g, { pending: () => [{ k: 'x', kind: 'decision', g: 'gone', gn: 1, h: REF.computer, r: REF.realm, s: 'S', c: 'c', ct: 'ct', at: 1 }] as any });
    expect(await src.check({ key: 'gone', kind: 'decision' })).toEqual({ k: 'unknown' });
    expect(g.calls.checkNow).toHaveLength(1);
    // nothing at all to check is still refused
    expect(await open(fake()).check({ key: 'c1', kind: 'decision' })).toEqual({ k: 'refused', code: 'nothing_to_check' });
  });

});

describe('check: an interrupt is not offered; message / turn / create / stop live in active.check.test.ts', () => {
  it('an interrupt Check is refused as unsupported, whatever rows and journal entries exist; the engine is never asked to read', async () => {
    const f = fake({ conv: withUsers(user('u1', 'unknown', { key: 'ku1' }), user('u2', 'queued')) });
    const entry = { k: 'ku1', kind: 'turn', h: REF.computer, r: REF.realm, s: 'S', c: 'c', ct: 'ct', at: 1 };
    const src = open(f, { pending: () => [entry, { ...entry, k: 'stop-key', kind: 'stop' }] as any });
    for (const key of ['ku1', 'u1', 'stop-key', 'nothing']) expect(await src.check({ key, kind: 'interrupt' }), key).toEqual({ k: 'refused', code: 'unsupported' });
    expect(f.calls.check ?? []).toHaveLength(0);
    expect(f.calls.checkNow ?? []).toHaveLength(0);
    expect(f.calls.checkDecision ?? []).toHaveLength(0);
  });
});

describe('dismiss', () => {
  it('names the engine’s card key, and only a journaled unknown decision can be dismissed', () => {
    const f = fake({ gates: [card({ key: 'card-9', decision: 'unknown' })], gate: gate(), decision: { pending: true, unknown: true } }, { canDismiss: () => true });
    const src = open(f);
    expect(src.canDismiss({ id: 'g1', generation: 1 })).toBe(true);
    src.dismissDecision({ id: 'g1', generation: 1 });
    expect(f.calls.dismissDecision).toEqual([['card-9']]);
    expect(f.calls.canDismiss![0]).toEqual(['card-9']);
    src.dismissDecision({ id: 'gone', generation: 1 });
    expect(f.calls.dismissDecision).toHaveLength(1);
  });
});

describe('the surface is told what it needs', () => {
  it('the attachment hold is PINNED when the surface subscribes (an idle chat takes none otherwise), never from a snapshot read', () => {
    const made: any[] = [];
    const track = (_r: unknown, need: unknown) => { made.push(need); return { set: () => undefined, close: () => undefined }; };
    const src = open(fake(), { leases: { track, state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any });
    src.snapshot();
    expect(made).toEqual([]);
    src.subscribe(() => undefined);
    expect(made).toEqual([{ busy: false, streaming: false, pinned: true }]);
  });

  it('with the REAL lease manager: acquiring announces itself from inside track(), yet exactly one handle is taken, and release closes it and the lease', async () => {
    const calls: string[] = [];
    const api: any = {
      acquire: async (id: string) => { calls.push('acquire ' + id); return { ok: true, body: { lease_id: 'L1', expires_at: new Date(Date.now() + 900000).toISOString() } }; },
      renew: async () => ({ ok: true, body: { lease_id: 'L1', expires_at: new Date(Date.now() + 900000).toISOString() } }),
      release: async (id: string, lease: string) => { calls.push('release ' + lease); return { ok: true, body: { status: 'ok', released: true } }; },
    };
    const mgr = createLeaseManager({ api: () => api, store: { read: () => undefined, write: () => undefined }, graceMs: 0 });
    let taken = 0, closed = 0;
    const track = mgr.track.bind(mgr);
    const leases: any = { ...mgr, track: (r: any, n: any) => { taken += 1; const h = track(r, n); return { set: h.set, close: () => { closed += 1; h.close(); } }; }, state: mgr.state.bind(mgr), subscribe: mgr.subscribe.bind(mgr) };
    const f = fake();
    f.eng.activation = () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: 'S', target: TARGET }, strict: false }) as any;
    const src = open(f, { leases });
    const off = src.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(10);
    expect(taken, 'one pinned handle however many times the manager announced').toBe(1);
    expect(calls).toEqual(['acquire S']);
    off();
    src.release();
    await vi.advanceTimersByTimeAsync(10);
    expect(closed).toBe(taken);
    expect(calls).toEqual(['acquire S', 'release L1']);
    mgr.reset();
  });

  it('released while the manager is still announcing: the handle just taken is closed too', () => {
    const closed: number[] = [];
    const held: { src?: any } = {};
    const leases: any = {
      track: () => { held.src.release(); return { set: () => undefined, close: () => { closed.push(1); } }; },
      state: () => ({ phase: 'held' }), subscribe: () => () => undefined,
    };
    held.src = open(fake(), { leases });
    held.src.subscribe(() => undefined);
    expect(closed).toEqual([1]);
  });

  it('the chat’s address changes while the manager is announcing: the hold is taken once more for the newer address, the older handle is closed', () => {
    const f = fake();
    const sids = ['S'];
    f.eng.activation = () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: sids[sids.length - 1], target: {} }, strict: false }) as any;
    const taken: string[] = [], closed: string[] = [];
    const leases: any = {
      track: (r: any) => { taken.push(r.sid); if (taken.length === 1) sids.push('S2'); return { set: () => undefined, close: () => { closed.push(r.sid); } }; },
      state: () => ({ phase: 'held' }), subscribe: () => () => undefined,
    };
    const src = open(f, { leases });
    src.subscribe(() => undefined);
    expect(taken).toEqual(['S', 'S2']);
    expect(closed).toEqual(['S']);
    src.release();
    expect(closed).toEqual(['S', 'S2']);
  });

  it('an address that changes on every look is followed once, never in a loop', () => {
    const f = fake();
    let n = 0;
    f.eng.activation = () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: 'S' + (n++ % 2), target: {} }, strict: false }) as any;
    const taken: string[] = [];
    const leases: any = { track: (r: any) => { taken.push(r.sid); return { set: () => undefined, close: () => undefined }; }, state: () => ({ phase: 'held' }), subscribe: () => () => undefined };
    const src = open(f, { leases });
    src.subscribe(() => undefined);
    expect(taken.length).toBeLessThanOrEqual(4);
    expect(taken.length).toBeGreaterThanOrEqual(2);
  });

  it('only a HELD lease satisfies the attachment prerequisite: none, acquiring and failing refuse, like gone', async () => {
    for (const phase of ['none', 'acquiring', 'failing', 'gone']) {
      const f = fake();
      const o = await open(f, { leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase }), subscribe: () => () => undefined } as any }).send({ text: 'hi' });
      expect(o, phase).toEqual({ k: 'refused', code: 'prerequisites' });
      expect(f.calls.send, phase).toBeUndefined();
    }
  });

  it('the journal’s unsettled entries of THIS chat show in the facts and repaint the surface when they change', () => {
    let entries: any[] = [];
    const subs = new Set<() => void>();
    const f = fake();
    const src = open(f, { pending: () => entries, onPending: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; } });
    expect(src.snapshot().facts.unsettledSends).toBe(0);
    let painted = 0;
    const off = src.subscribe(() => { painted += 1; });
    entries = [{ k: 'x', kind: 'stop', h: REF.computer, r: REF.realm, s: 'S', c: 'c', ct: 'ct', at: 1 }, { k: 'y', kind: 'stop', h: REF.computer, r: REF.realm, s: 'OTHER', c: 'c', ct: 'ct', at: 1 }];
    subs.forEach((fn) => fn());
    expect(painted).toBeGreaterThan(0);
    expect(src.snapshot().facts.unsettledSends).toBe(1);
    off();
    expect(subs.size).toBe(0);
  });

  it('release lets the hold and the engine go once', () => {
    let closed = 0, released = 0;
    const f = fake();
    const src = engineActive({ current: () => f.eng, release: () => { released += 1; } }, REF, host, deps({ leases: { track: () => ({ set: () => undefined, close: () => { closed += 1; } }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any }));
    src.subscribe(() => undefined);
    src.release();
    src.release();
    expect({ closed, released }).toEqual({ closed: 1, released: 1 });
  });
});

describe('decide: a flag an earlier decision left does not answer this one', () => {
  it('notKept from the last decision is not this decision’s refusal: the engine is called first, then the snapshots are read', async () => {
    const ref = { id: 'g1', generation: 1 };
    const parked = (c: CardView | null, extra: Partial<Snapshot> = {}): Partial<Snapshot> => ({ gates: c ? [c] : [], gate: c ? c.gate : null, ...extra });
    const f: ReturnType<typeof fake> = fake(parked(card(), { decision: { pending: false, unknown: false, notKept: true } }), {
      decide: () => { f.att.set('c1', { rid: 'r1', status: 'sending' }); f.put(parked(card({ decision: 'sending' }), { decision: { pending: true, unknown: false } })); return 'r1'; },
    });
    const p = open(f).decide(ref, { choice: 'once' });
    f.proofs.set('r1', 'applied'); f.att.delete('c1'); f.put(parked(null));
    expect(await p).toEqual({ k: 'done' });
  });
});

describe('a decision names its own kind of gate', () => {
  it('a confirm reference is never answered as a question, nor a question reference decided as a confirm, even beside the lead gate', async () => {
    const lead = card({ key: 'c1', gate: gate({ id: 'g1' }) });
    const other = card({ key: 'c2', gate: gate({ kind: 'question', id: 'q1', question: 'which?' }) });
    const f = fake({ gates: [lead, other], gate: lead.gate });
    const src = open(f);
    expect(await src.decide({ id: 'q1', generation: 1 }, { choice: 'once' })).toEqual({ k: 'refused', code: 'no_gate' });
    expect(f.calls.decide).toBeUndefined();
    const g = fake({ gates: [other, lead], gate: other.gate });
    expect(await open(g).answer({ id: 'g1', generation: 1 }, 'x')).toEqual({ k: 'refused', code: 'no_gate' });
    expect(g.calls.answer).toBeUndefined();
  });
});

describe('send: a throw leaves nothing behind', () => {
  it('images attached for a send that then throws are let go (they must not ride the next message)', async () => {
    const f: ReturnType<typeof fake> = fake({}, { send: () => { throw new Error('mint failed'); }, attach: (list: any[]) => f.put({ att: { items: list.filter((p) => p.ok).map((p) => p.att), refused: [], dropped: '', reading: false } }) });
    const o = await open(f, { decode: () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89]) }).send({ text: 'look', images: [{ name: 'a.png', mime: 'image/png', data: 'x' }] });
    expect(o).toEqual({ k: 'unknown' });
    expect(f.calls.attach).toHaveLength(1);
    expect(f.calls.unattach).toHaveLength(1);
  });
  it('a resend under a new key while we wait: this call cannot say what became of its own request: unknown', async () => {
    const f: ReturnType<typeof fake> = fake({}, { send: () => { f.put({ conv: withUsers(user('u1', 'sending')) }); return true; } });
    const p = open(f).send({ text: 'hi' });
    f.put({ conv: withUsers(user('u1', 'sent', { key: 'other-key' })) });
    expect(await p).toEqual({ k: 'unknown' });
  });
});

describe('queued rows are unsettled work', () => {
  it('a queued row alone enables Check status and counts once', () => {
    const f = fake({ conv: withUsers(user('u1', 'queued')) });
    const src = open(f, { pending: () => [{ k: 'ku1', kind: 'message', h: REF.computer, r: REF.realm, s: 'S', c: 'c', ct: 'ct', at: 1 }] as any });
    expect(src.snapshot().facts.unsettledSends).toBe(1);
    expect(src.can('check')).toEqual({ ok: true });
  });
});

// ---- ONE identity for every Check source (computer, realm, session, card key, kind): a table of source x match/mismatch ----
describe('Check identity: every source answers only for exactly what was named', () => {
  const CHAT = { computer: REF.computer, realm: REF.realm, sid: 'S' };
  const entry = (over: Record<string, unknown> = {}) => ({ k: 'e1', kind: 'decision', g: 'G', gn: 1, h: REF.computer, r: REF.realm, s: 'S', c: 'c', ct: 'ct', at: 1, ...over });
  const id = (over: Partial<CheckIdentity> = {}): CheckIdentity => ({ ...CHAT, key: 'G', kind: 'decision', ...over });

  it('sameCheck needs all five parts to agree', () => {
    expect(sameCheck(id(), id())).toBe(true);
    for (const over of [{ computer: 'o' }, { realm: 'o' }, { sid: 'o' }, { key: 'o' }, { kind: 'stop' as const }]) expect(sameCheck(id(), id(over)), JSON.stringify(over)).toBe(false);
  });

  it('a journal entry’s identity: a decision or answer is a decision under its gate id; others are their own kind under their own key; a decision without its gate has none', () => {
    expect(entryIdentity(entry() as any)).toEqual(id());
    expect(entryIdentity(entry({ kind: 'answer' }) as any)).toEqual(id());
    expect(entryIdentity(entry({ kind: 'stop', k: 'x', g: undefined }) as any)).toEqual(id({ kind: 'stop', key: 'x' }));
    expect(entryIdentity(entry({ g: undefined }) as any)).toBeNull();
  });

  // [label, the journal entry the chat holds, the Check, whether the session must be read again]
  const journal: Array<[string, Record<string, unknown>, { key: string; kind: 'decision' | 'stop' | 'message' | 'turn' }, boolean]> = [
    ['decision entry, same gate', entry(), { key: 'G', kind: 'decision' }, true],
    ['answer entry, same gate', entry({ kind: 'answer' }), { key: 'G', kind: 'decision' }, true],
    ['decision entry of ANOTHER gate', entry({ g: 'H' }), { key: 'G', kind: 'decision' }, false],
    ['a stop entry whose key is the gate id', entry({ kind: 'stop', k: 'G', g: undefined }), { key: 'G', kind: 'decision' }, false],
    ['a turn entry whose key is the gate id', entry({ kind: 'turn', k: 'G', g: undefined }), { key: 'G', kind: 'decision' }, false],
    ['same gate, another computer', entry({ h: 'other' }), { key: 'G', kind: 'decision' }, false],
    ['same gate, another realm', entry({ r: 'f2f2f2f2f2f2f2f2f2f2f2f2' }), { key: 'G', kind: 'decision' }, false],
    ['same gate, another session', entry({ s: 'S2' }), { key: 'G', kind: 'decision' }, false],
    ['a decision entry without its gate', entry({ g: undefined }), { key: 'G', kind: 'decision' }, false],
    ['stop entry, same key', entry({ kind: 'stop', k: 'x', g: undefined }), { key: 'x', kind: 'stop' }, true],
    ['stop entry, ANOTHER key', entry({ kind: 'stop', k: 'y', g: undefined }), { key: 'x', kind: 'stop' }, false],
    ['a decision entry under a stop check', entry({ g: 'x' }), { key: 'x', kind: 'stop' }, false],
    ['stop entry, another session', entry({ kind: 'stop', k: 'x', g: undefined, s: 'S2' }), { key: 'x', kind: 'stop' }, false],
  ];
  it.each(journal)('journal-only: %s', async (_label, e, check, reads) => {
    const f = fake();
    const o = await open(f, { pending: () => [e] as any }).check(check);
    expect(f.calls.checkNow ?? [], 'session read again').toHaveLength(reads ? 1 : 0);
    expect(o).toEqual(reads ? { k: 'unknown' } : { k: 'refused', code: 'nothing_to_check' });
  });

  it('a card: the same key and unknown is read; another key, or the same key not unknown, is not', async () => {
    const cases: Array<[string, CardView, boolean]> = [
      ['same key, unknown', card({ key: 'G', decision: 'unknown' }), true],
      ['another key, unknown', card({ key: 'H', decision: 'unknown' }), false],
      ['same key, not lost', card({ key: 'G', decision: null }), false],
    ];
    for (const [label, c, reads] of cases) {
      const f = fake({ gates: [c], gate: c.gate });
      const o = await open(f).check({ key: 'G', kind: 'decision' });
      expect(f.calls.checkDecision ?? [], label).toHaveLength(reads ? 1 : 0);
      expect(o, label).toEqual(reads ? { k: 'unknown' } : { k: 'refused', code: 'nothing_to_check' });
    }
  });

  it('an attempt of this page: only the one for the named key settles the Check; an attempt for another key is not consulted', async () => {
    const f: ReturnType<typeof fake> = fake({ gates: [card({ key: 'G', decision: 'unknown' })] }, { checkDecision: () => { f.proofs.set('r1', 'applied'); f.att.delete('G'); f.put({ gates: [] }); } });
    f.att.set('G', { rid: 'r1', status: 'unknown' });
    expect(await open(f).check({ key: 'G', kind: 'decision' })).toEqual({ k: 'done' });
    const g = fake();
    g.att.set('OTHER', { rid: 'r2', status: 'unknown' });
    g.proofs.set('r2', 'applied');
    expect(await open(g).check({ key: 'G', kind: 'decision' })).toEqual({ k: 'refused', code: 'nothing_to_check' });
    expect(g.calls.checkDecision ?? []).toHaveLength(0);
  });
});
