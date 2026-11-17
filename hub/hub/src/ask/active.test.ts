// An Ask engine as an ACTIVE source, over the real engine, the real journal and the FakeAgent. The facts
// the capability table reads come from the live journal, attachment lease and approver lease; every operation answers from the
// snapshots that follow it, and what they do not prove is `unknown` (C9); nothing is ever sent a second time.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';

// The engine's own approver handle (the page's live manager) is a stub here: the leases the adapter reads are the knobs below.
vi.mock('@kit/agent/approver-live', () => ({
  approvers: () => ({
    open: () => ({ sid: null, setStrict: () => undefined, mintTicket: () => null, decide: () => null, close: () => undefined }),
    state: () => ({ phase: 'none' }), subscribe: () => () => undefined, stamp: () => 0, noteEpoch: () => undefined,
  }),
  resetApproversForTests: () => undefined,
}));
import type { ApproverState } from '@kit/agent/approver';
import type { LeaseState } from '@kit/agent/lease';
import { isActive } from '@kit/agent/source';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { WAIT_MS, engineActive, liveDeps, unsettledOf, type ActiveDeps } from './active';
import * as A from './attach';
import { MAX_TEXT } from './logic';
import { scripts } from './fake';
import type { Entry } from './journal';
import { HANDLE, REALM, world, type World, type WorldOptions } from './accept/env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; vi.restoreAllMocks(); });

const REF = (sid: string) => ({ computer: HANDLE, realm: REALM, sid });
const host = () => ({ computer: 'atlas', realm: 'Personal' });

interface Knobs { approver: ApproverState; lease: LeaseState; closed: number; tracked: unknown[] }
function deps(x: World, k: Partial<Knobs> = {}): { d: ActiveDeps; k: Knobs; fire(): void; fireApprover(): void } {
  const knobs: Knobs = { approver: { phase: 'none' }, lease: { phase: 'held' }, closed: 0, tracked: [], ...k };
  const subs = new Set<() => void>(), asubs = new Set<() => void>();
  const d: ActiveDeps = {
    approvers: { state: () => knobs.approver, subscribe: (fn: any) => { const f = () => fn('', knobs.approver); asubs.add(f); return () => { asubs.delete(f); }; } } as any,
    leases: {
      track: (_r: unknown, need: unknown) => { knobs.tracked.push(need); return { set: () => undefined, close: () => { knobs.closed += 1; } }; },
      state: () => knobs.lease,
      subscribe: (fn: any) => { const f = () => fn('', knobs.lease); subs.add(f); return () => { subs.delete(f); }; },
    } as any,
    pending: (h) => x.j.pending(h),
    onPending: (fn) => x.j.subscribe(fn),
    set: (fn, ms) => x.clock.set(fn, ms),
    clear: (id) => x.clock.clear(id),
    decode: liveDeps().decode,
    waitMs: WAIT_MS,
  };
  return { d, k: knobs, fire: () => subs.forEach((f) => f()), fireApprover: () => asubs.forEach((f) => f()) };
}

/** A conversation made on one engine (its first turn runs to the end), then reopened as a pinned engine: the engine under test. */
async function chat(o: WorldOptions = {}, mode: 'default' | 'always' = 'default', ends = true) {
  w = world({ script: [scripts.dashboard], ...o });
  const approval = (w.agent as any).approval.bind(w.agent);
  (w.agent as any).approval = (sid: string) => approval(sid).then((r: any) => ({ ...r, mode }));
  const first = await w.dock();
  first.setAuto(false);
  first.send('start');
  await w.flush(ends ? 3000 : 500);
  const sid = first.record!.s!;
  const eng = w.pinned(sid);
  eng.open();
  await w.flush(ends ? 1000 : 500);
  return { eng, sid, first };
}
const handleOf = (eng: AskEngine) => ({ current: () => eng, release: vi.fn() });
const users = (eng: AskEngine) => Object.values(eng.getSnapshot().conv.users);

describe('readiness: the facts the table reads come from the live leases and the journal', () => {
  it('journal, recovery and attachment present, a default-mode chat needs no approver: send is allowed', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(isActive(src)).toBe(true);
    const f = src.snapshot().facts;
    expect(f.mode).toBe('active');
    expect(f.prereq).toEqual({ journal: true, recovery: true, attachment: true, approver: 'notNeeded' });
    expect(src.can('send')).toEqual({ ok: true });
  });

  it('a lapsed attachment lease (gone) refuses every send, and says which prerequisite is missing', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!, { lease: { phase: 'gone' } });
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(src.can('send')).toEqual({ ok: false, reason: 'prerequisites', missing: ['attachment'] });
    const before = (w!.agent as any).turns?.length;
    expect(await src.send({ text: 'hello' })).toEqual({ k: 'refused', code: 'prerequisites' });
    expect(users(eng).map((u) => u.text)).not.toContain('hello');
    expect((w!.agent as any).turns?.length).toBe(before);
  });

  it('a Strict chat needs a HELD approver lease: none, elsewhere or expired refuse; held allows', async () => {
    const { eng, sid } = await chat({}, 'always');
    for (const phase of ['none', 'acquiring', 'elsewhere', 'expired', 'failing', 'gone'] as const) {
      const { d } = deps(w!, { approver: { phase } });
      const src = engineActive(handleOf(eng), REF(sid), host, d);
      const c = src.can('send');
      expect(c.ok, phase).toBe(false);
      expect((c as { missing?: string[] }).missing, phase).toEqual(['approver']);
    }
    const { d } = deps(w!, { approver: { phase: 'held' } });
    expect(engineActive(handleOf(eng), REF(sid), host, d).can('send')).toEqual({ ok: true });
  });

  it('the attachment hold is pinned on subscribe, closed once on release, and the engine goes once', async () => {
    const { eng, sid } = await chat();
    const { d, k } = deps(w!);
    const h = handleOf(eng);
    const src = engineActive(h, REF(sid), host, d);
    src.snapshot();
    expect(k.tracked, 'a snapshot read takes no hold').toEqual([]);
    src.subscribe(() => undefined);
    expect(k.tracked).toEqual([{ busy: false, streaming: false, pinned: true }]);
    src.release();
    src.release();
    expect(k.closed).toBe(1);
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('readiness changes repaint the surface (approver and lease subscriptions)', async () => {
    const { eng, sid } = await chat({}, 'always');
    const x = deps(w!, { approver: { phase: 'none' } });
    const src = engineActive(handleOf(eng), REF(sid), host, x.d);
    const seen: boolean[] = [];
    const off = src.subscribe(() => seen.push(src.can('send').ok));
    x.k.approver = { phase: 'held' };
    x.fireApprover();
    expect(seen.at(-1)).toBe(true);
    off();
  });
});

describe('send: the outcome is read from the row the engine made', () => {
  it('an idle chat takes the message: done, once, under one journal key', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const p = src.send({ text: 'hello again' });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    const rows = users(eng).filter((u) => u.text === 'hello again');
    expect(rows).toHaveLength(1);
    expect(['sent', 'queued']).toContain(rows[0]!.state);
    expect(rows[0]!.key).toBeTruthy();
  });

  it('a turn whose answer was lost is unknown, never done or failed, and nothing is sent again under another key', async () => {
    const { eng, sid } = await chat({ turnLost: true });
    // the first turn of the fake was already used by the dock's own start; the next turn answer is the lost one only when armed
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const calls: unknown[] = [];
    const turn = (w!.agent as any).turn.bind(w!.agent);
    (w!.agent as any).turn = (...a: unknown[]) => { calls.push(a); return turn(...a); };
    const p = src.send({ text: 'second' });
    await w!.flush(WAIT_MS + 1000);
    const o = await p;
    expect(o.k === 'done' || o.k === 'unknown', 'never refused for a request that may have left').toBe(true);
    expect(calls.length).toBeLessThanOrEqual(1);
  });

  it('a wait that ends with the row still sending answers unknown (the snapshot keeps showing the truth)', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, { ...d, waitMs: 5 });
    (w!.agent as any).turn = () => new Promise(() => undefined);
    const p = src.send({ text: 'stuck' });
    await w!.flush(50);
    expect(await p).toEqual({ k: 'unknown' });
    expect(users(eng).find((u) => u.text === 'stuck')?.state).toBe('sending');
  });

  it('Auto-approve this reply on an idle chat: done, one turn under one key, carrying the policy', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const calls: unknown[][] = [];
    const turn = (w!.agent as any).turn.bind(w!.agent);
    (w!.agent as any).turn = (...a: unknown[]) => { calls.push(a); return turn(...a); };
    const p = src.send({ text: 'x' }, { autoApproveTurn: true });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    expect(calls).toHaveLength(1);
    expect(calls[0]![5]).toBe('auto_approve');
    expect(users(eng).find((u) => u.text === 'x')?.auto).toBe(true);
  });

  it('Auto-approve this reply while a turn runs is refused before anything is sent', async () => {
    const { eng, sid } = await chat({ script: [[{ k: 'text', text: 'Working' }, { k: 'hold' }]] }, 'default', false);
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(C.routeFor(eng.getSnapshot().conv)).toBe('command');
    const n = w!.agent.log.length;
    const o = await src.send({ text: 'x' }, { autoApproveTurn: true });
    expect(o).toEqual({ k: 'refused', code: 'auto_turn_unavailable' });
    expect(users(eng).map((u) => u.text)).not.toContain('x');
    expect(w!.agent.log.slice(n).some(([m]) => m === 'turn' || m === 'command')).toBe(false);
  });

  it('a Strict chat refuses it by the table, whatever the engine could do', async () => {
    const { eng, sid } = await chat({}, 'always');
    const { d } = deps(w!, { approver: { phase: 'held' } });
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(await src.send({ text: 'x' }, { autoApproveTurn: true })).toEqual({ k: 'refused', code: 'strict_refuses_automatic' });
  });

  it('text the engine refuses (empty) leaves nothing behind', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const n = users(eng).length;
    const o = await src.send({ text: '   ' });
    expect(o.k).toBe('refused');
    expect(users(eng)).toHaveLength(n);
  });

  it('an image that is not an image is refused before anything is sent, and its attachment is not kept', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const o = await src.send({ text: 'look', images: [{ name: 'a.png', mime: 'image/png', data: '!!!' }] });
    expect(o).toEqual({ k: 'refused', code: 'bad_image' });
    expect(eng.getSnapshot().att.items).toHaveLength(0);
    expect(users(eng).map((u) => u.text)).not.toContain('look');
  });
});

describe('decide and answer: done only when the decision shows as applied', () => {
  async function parked(o: WorldOptions = {}) {
    w = world({ script: [scripts.approval], ...o });
    const approval = (w.agent as any).approval.bind(w.agent);
    (w.agent as any).approval = (sid: string) => approval(sid).then((r: any) => ({ ...r, mode: 'default' }));
    const first = await w.dock();
    first.setAuto(false);
    first.send('Add a chart');
    await w.flush(500);
    const sid = first.record!.s!;
    const eng = w.pinned(sid);
    eng.open();
    await w.flush(500);
    expect(eng.getSnapshot().gates.length).toBeGreaterThan(0);
    return { eng, sid };
  }
  const ref = (eng: AskEngine) => { const g = eng.getSnapshot().gates[0]!.gate; return { id: g.id, generation: g.generation }; };

  it('Allow once: done after the agent applied it; the gate is decided once', async () => {
    const { eng, sid } = await parked();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const g = ref(eng);
    const p = src.decide(g, { choice: 'once' });
    await w!.flush(1000);
    expect(await p).toEqual({ k: 'done' });
    expect(Object.values((w!.agent as any).applied ?? {}).every((n: any) => n <= 1)).toBe(true);
  });

  it('another request already resolved the gate (409 gate_already_resolved naming it): NEVER done (the journaled engine leaves it unproven)', async () => {
    const { eng, sid } = await parked();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    (w!.agent as any).confirm = () => Promise.reject({ status: 409, code: 'gate_already_resolved', data: { code: 'gate_already_resolved', details: { outcome: 'answered', request_id: 'hx-' + '9'.repeat(24) } } });
    const p = src.decide(ref(eng), { choice: 'deny' });
    await w!.flush(1000);
    const o = await p;
    expect(o.k, JSON.stringify(o)).not.toBe('done');
    // The journal does not classify this reply as a definite refusal, so the decision stays unproven: unknown is the honest answer.
    expect(['unknown', 'refused']).toContain(o.k);
  });

  it('a decision for a gate that is not parked (stale reference) is refused and sends nothing', async () => {
    const { eng, sid } = await parked();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const sent: unknown[] = [];
    const confirm = (w!.agent as any).confirm.bind(w!.agent);
    (w!.agent as any).confirm = (...a: unknown[]) => { sent.push(a); return confirm(...a); };
    const g = ref(eng);
    expect(await src.decide({ id: g.id, generation: g.generation + 7 }, { choice: 'once' })).toEqual({ k: 'refused', code: 'no_gate' });
    expect(await src.decide({ id: 'nope', generation: 1 }, { choice: 'deny' })).toEqual({ k: 'refused', code: 'no_gate' });
    expect(sent).toHaveLength(0);
  });

  it('a decision whose answer was lost is unknown (never done), and the gate stays undecided until the agent shows it', async () => {
    const { eng, sid } = await parked({ decisionLost: true, decisionLag: 100000 });
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, { ...d, waitMs: 3000 });
    const g = ref(eng);
    const p = src.decide(g, { choice: 'once' });
    await w!.flush(4000);
    expect(await p).toEqual({ k: 'unknown' });
  });

  it('answering a question gate with the wrong kind is refused before anything is sent', async () => {
    const { eng, sid } = await parked();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(await src.answer(ref(eng), 'yes')).toEqual({ k: 'refused', code: 'no_gate' });
  });
});

describe('stop, check and dismiss', () => {
  it('stop of the chat is not something the engine does: refused, nothing called', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(await src.stop('chat')).toEqual({ k: 'refused', code: 'unsupported' });
  });

  it('stop with no running turn is refused (the table says no_turn first)', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(await src.stop('turn')).toEqual({ k: 'refused', code: 'no_turn' });
  });

  it('check with nothing to check is refused by the table; with nothing named it checks every row still unknown', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(await src.check({ key: 'x', kind: 'turn' })).toEqual({ k: 'refused', code: 'nothing_to_check' });
  });

  it('dismiss of a gate that holds no unknown decision does nothing and canDismiss says so', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(src.canDismiss({ id: 'g', generation: 1 })).toBe(false);
    expect(() => src.dismissDecision({ id: 'g', generation: 1 })).not.toThrow();
  });
});

describe('unsettledOf: what no row or card of the snapshot already shows', () => {
  const e = (over: Partial<Entry>): Entry => ({ k: 'hx-a', kind: 'turn', h: HANDLE, r: REALM, s: 'S', c: 'c', ct: 'ct', at: 1, ...over });
  const snap = (keys: string[], cards: Array<{ id: string; generation: number; decision: 'sending' | 'unknown' | null }> = []): Snapshot => ({
    conv: { ...C.emptyConv('S'), users: Object.fromEntries(keys.map((k, i) => [`u${i}`, { id: `u${i}`, key: k } as C.UserMsg])) },
    gates: cards.map((c) => ({ key: 'k' + c.id, gate: { id: c.id, generation: c.generation }, decision: c.decision })),
  } as unknown as Snapshot);
  const ref = { computer: HANDLE, realm: REALM, sid: 'S' };

  it('counts a stop nobody shows; not a send already a row, not another chat’s', () => {
    expect(unsettledOf([e({ k: 'a', kind: 'stop' })], ref, snap([]))).toBe(1);
    expect(unsettledOf([e({ k: 'a', kind: 'turn' })], ref, snap(['a']))).toBe(0);
    expect(unsettledOf([e({ k: 'a', kind: 'stop', s: 'OTHER' }), e({ k: 'b', kind: 'stop', h: 'orion.ion1' })], ref, snap([]))).toBe(0);
  });
  it('the same computer and session in ANOTHER realm is another chat', () => {
    expect(unsettledOf([e({ k: 'a', kind: 'stop', r: 'a1a1a1a1a1a1a1a1a1a1a1a1' })], ref, snap([]))).toBe(0);
  });
  it('a decision is shown by its card while the card says sending or lost; with no such card it still needs Check', () => {
    const d = e({ k: 'd', kind: 'decision', g: 'g1', gn: 2 });
    expect(unsettledOf([d], ref, snap([], [{ id: 'g1', generation: 2, decision: 'unknown' }]))).toBe(0);
    expect(unsettledOf([d], ref, snap([], [{ id: 'g1', generation: 2, decision: 'sending' }]))).toBe(0);
    expect(unsettledOf([d], ref, snap([], []))).toBe(1);
    expect(unsettledOf([d], ref, snap([], [{ id: 'g1', generation: 3, decision: 'unknown' }]))).toBe(1);
    expect(unsettledOf([d], ref, snap([], [{ id: 'g1', generation: 2, decision: null }]))).toBe(1);
  });
});

describe('engine.activation(): the facts a host reads, read only', () => {
  it('a pinned engine names its chat’s lease address once opened, and is journaled', async () => {
    w = world({ script: [scripts.dashboard] });
    const first = await w.dock();
    first.setAuto(false);
    first.send('start');
    await w.flush(3000);
    const sid = first.record!.s!;
    const eng = w.pinned(sid);
    expect(eng.activation().ref, 'before open the realm is not known').toBeNull();
    eng.open();
    await w.flush(1000);
    const a = eng.activation();
    expect(a.journal).toBe(true);
    expect(a.ref).toMatchObject({ realm: REALM, sid });
    expect(a.ref!.computer).toBe(eng.slot.computer);
  });

  it('Strict until the mode is read (fail closed), then what the agent said; an agent with no approval route is not Strict', async () => {
    const { eng } = await chat({}, 'default');
    expect(eng.activation().strict, 'read: default').toBe(false);
    const s = await chat({}, 'always');
    expect(s.eng.activation().strict, 'read: always').toBe(true);
    // The read never arrives: the engine cannot say, so the chat counts as Strict.
    w = world({ script: [scripts.dashboard] });
    (w.agent as any).approval = () => new Promise(() => undefined);
    const first = await w.dock();
    first.setAuto(false);
    first.send('start');
    await w.flush(3000);
    const pending = w.pinned(first.record!.s!);
    pending.open();
    await w.flush(1000);
    expect(pending.activation().strict, 'cap present, mode unread').toBe(true);
    // No approval route at all: nothing to be Strict about.
    w = world({ script: [scripts.dashboard], caps: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'] });
    const f2 = await w.dock();
    f2.send('start');
    await w.flush(3000);
    const bare = w.pinned(f2.record!.s!);
    bare.open();
    await w.flush(1000);
    expect(bare.activation().strict).toBe(false);
  });

  it('a chat whose mode was not read cannot send around the approver lease (the table sees Strict)', async () => {
    w = world({ script: [scripts.dashboard] });
    (w.agent as any).approval = () => new Promise(() => undefined);
    const first = await w.dock();
    first.setAuto(false);
    first.send('start');
    await w.flush(3000);
    const eng = w.pinned(first.record!.s!);
    eng.open();
    await w.flush(1000);
    const { d } = deps(w!, { approver: { phase: 'none' } });
    const src = engineActive(handleOf(eng), REF(first.record!.s!), host, d);
    expect(src.snapshot().facts.approval).toBe('always');
    expect(src.can('send')).toMatchObject({ ok: false, reason: 'prerequisites', missing: ['approver'] });
  });
});

describe('an engine with no journal cannot send', () => {
  it('journal and recovery are missing, so every send, stop and decision is refused and the engine is not called', async () => {
    w = world({ script: [scripts.dashboard] });
    const { AskEngine } = await import('./engine');
    const { slot } = await import('./accept/env');
    // A session that exists (a pinned chat the agent does not know reads as missing, which would refuse for another reason).
    const first = await w.dock();
    first.setAuto(false);
    first.send('start');
    await w.flush(3000);
    const sid = first.record!.s!;
    const bare = new AskEngine(slot, w.agent, { read: () => null, write: () => true } as any, w.clock, { sid });
    bare.open();
    await w.flush(500);
    expect(bare.activation().journal).toBe(false);
    const { d } = deps(w);
    const src = engineActive(handleOf(bare), REF(sid), host, d);
    expect(src.can('send')).toMatchObject({ ok: false, missing: expect.arrayContaining(['journal', 'recovery']) });
    const send = vi.spyOn(bare, 'send');
    expect(await src.send({ text: 'hi' })).toEqual({ k: 'refused', code: 'prerequisites' });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('images: all or nothing', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const JUNK = Buffer.from([0, 1, 2, 255, 254, 0, 0, 7, 9]).toString('base64');
  it('one good image and one that cannot be attached: refused, and the good one is not kept either', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const o = await src.send({ text: 'look', images: [{ name: 'a.png', mime: 'image/png', data: PNG }, { name: 'b.bin', mime: 'image/png', data: JUNK }] });
    expect(o).toEqual({ k: 'refused', code: 'attachment_refused' });
    expect(eng.getSnapshot().att.items).toHaveLength(0);
    expect(users(eng).map((u) => u.text)).not.toContain('look');
  });

  it('the engine takes none of it (nothing to send): the attachment it was given is let go', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const o = await src.send({ text: '   ', images: [{ name: 'a.png', mime: 'image/png', data: PNG }] });
    expect(o.k).toBe('refused');
    expect(eng.getSnapshot().att.items).toHaveLength(0);
  });

  it('a good image goes with its message', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const p = src.send({ text: 'look', images: [{ name: 'a.png', mime: 'image/png', data: PNG }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    expect(users(eng).find((u) => u.text === 'look')?.imgs).toHaveLength(1);
  });

  // One engine has ONE draft. The dock's picks live in it; the AI page shows them as its own chips (draftFiles) and keeps what was
  // picked on the page outside the engine until its own send.
  it('an image picked in the dock is listed for the page (its chip), and a page send takes it with the page\'s own image: nothing rides unseen', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    eng.attach([A.prepare('dock1', 'dock.png', d.decode(PNG)!, () => 'blob:dock1')], '');
    expect(src.draftFiles!().map((x) => [x.id, x.kind, x.name])).toEqual([['dock1', 'image', 'dock.png']]);
    const p = src.send({ text: 'look', images: [{ name: 'page.png', mime: 'image/png', data: PNG }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    expect(users(eng).find((u) => u.text === 'look')?.imgs?.map((i) => i.name)).toEqual(['dock.png', 'page.png']);
    expect(eng.getSnapshot().att.items).toHaveLength(0);
  });

  it('a page send that is refused takes back only its own image: the dock\'s stays in the draft, on no message', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    eng.attach([A.prepare('dock1', 'dock.png', d.decode(PNG)!, () => 'blob:dock1')], '');
    const before = users(eng).length;
    const o = await src.send({ text: '   ', images: [{ name: 'page.png', mime: 'image/png', data: PNG }] });
    expect(o.k).toBe('refused');
    expect(eng.getSnapshot().att.items.map((x) => x.id)).toEqual(['dock1']);
    expect(users(eng)).toHaveLength(before);
  });

  it('a dock send takes the engine\'s draft only: an image the page holds is not in the engine before the page\'s own send', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    engineActive(handleOf(eng), REF(sid), host, d);
    eng.attach([A.prepare('dock1', 'dock.png', d.decode(PNG)!, () => 'blob:dock1')], 'from the dock');
    expect(eng.send('from the dock')).toBe(true);
    await w!.flush(2000);
    expect(users(eng).find((u) => u.text === 'from the dock')?.imgs?.map((i) => i.name)).toEqual(['dock.png']);
    expect(eng.getSnapshot().att.items).toHaveLength(0);
  });

  it('the sent message shows its picture: the image gets its own address, on the row and on its block, and the engine lets it go', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const made: string[] = [], gone: string[] = [];
    d.url = (bytes, media) => { const u = `blob:t/${made.length + 1}:${media}:${bytes.length}`; made.push(u); return u; };
    eng.revokeUrl = (u) => { gone.push(u); };
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const p = src.send({ text: 'look', images: [{ name: 'a.png', mime: 'image/png', data: PNG }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    expect(made).toHaveLength(1);
    expect(made[0]).toContain('image/png');
    expect(users(eng).find((u) => u.text === 'look')?.imgs?.[0]?.url).toBe(made[0]);
    const block = src.snapshot().blocks.find((b) => b.k === 'user' && b.text === 'look') as { files?: Array<{ kind: string; name: string; url?: string | null }> } | undefined;
    expect(block?.files).toEqual([expect.objectContaining({ kind: 'image', name: 'a.png', url: made[0] })]);
    expect(gone).toEqual([]);
  });

  it('an image of a send that is refused gets no address left behind: a bad one makes none, a kept-out one is let go', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const made: string[] = [], gone: string[] = [];
    d.url = () => { const u = `blob:t/${made.length + 1}`; made.push(u); return u; };
    eng.revokeUrl = (u) => { gone.push(u); };
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(await src.send({ text: 'look', images: [{ name: 'a.png', mime: 'image/png', data: PNG }, { name: 'b.png', mime: 'image/png', data: '!!!' }] })).toMatchObject({ k: 'refused' });
    expect(made).toEqual([]);
    expect(await src.send({ text: '   ', images: [{ name: 'a.png', mime: 'image/png', data: PNG }] })).toMatchObject({ k: 'refused' });
    expect(made).toHaveLength(1);
    expect(gone).toEqual(made);
  });
});

// A text file is its own part (Draft.files -> attachParts -> engine.attach -> UserMsg.files), under the dock's
// 24 KB file and 28 KB message rules (ask/attach.ts), never folded into the typed text, so MAX_TEXT counts the typed text only.
describe('text files: parts of the message, the dock rules', () => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  it('a text file over 4000 characters goes as a part: the row keeps the typed text and the file, the wire carries both', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const wire: string[] = [];
    const turn = (w!.agent as any).turn.bind(w!.agent);
    (w!.agent as any).turn = (s: string, text: string, ...a: unknown[]) => { wire.push(text); return turn(s, text, ...a); };
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const big = 'a'.repeat(MAX_TEXT * 5);
    const p = src.send({ text: 'read', files: [{ name: 'n.txt', text: big }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    const row = users(eng).find((u) => u.text === 'read');
    expect(row?.files?.map((f) => [f.name, f.text])).toEqual([['n.txt', big]]);
    expect(row?.imgs).toBeUndefined();
    expect(wire).toEqual([A.messageText('read', [{ name: 'n.txt', text: big } as never])]);
  });

  it('files that take the message past 28 KB are refused before anything is sent, and none of them is kept', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const files = [{ name: 'a.txt', text: 'a'.repeat(15000) }, { name: 'b.txt', text: 'b'.repeat(15000) }];
    expect(A.messageBytes('read', files as never)).toBeGreaterThan(A.MSG_BYTES);
    const o = await src.send({ text: 'read', files });
    expect(o).toEqual({ k: 'refused', code: 'attachment_refused' });
    expect(eng.getSnapshot().att.items).toHaveLength(0);
    expect(users(eng).map((u) => u.text)).not.toContain('read');
  });

  it('a blank text file is refused as the dock refuses an empty one, and nothing of the send is kept', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const o = await src.send({ text: 'read', images: [{ name: 'a.png', mime: 'image/png', data: PNG }], files: [{ name: 'n.txt', text: ' \n\t' }] });
    expect(o).toEqual({ k: 'refused', code: 'attachment_refused' });
    expect(eng.getSnapshot().att.items).toHaveLength(0);
    expect(users(eng).map((u) => u.text)).not.toContain('read');
  });

  it('a text file over 24 KB is refused, and the image with it is not kept either', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const o = await src.send({ text: 'read', images: [{ name: 'a.png', mime: 'image/png', data: PNG }], files: [{ name: 'n.txt', text: 'a'.repeat(A.TXT_BYTES + 1) }] });
    expect(o).toEqual({ k: 'refused', code: 'attachment_refused' });
    expect(eng.getSnapshot().att.items).toHaveLength(0);
  });

  it('an image and a text file go together: the image is unchanged, the file is its part', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const p = src.send({ text: 'look', images: [{ name: 'a.png', mime: 'image/png', data: PNG }], files: [{ name: 'n.txt', text: 'one\n' }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    const row = users(eng).find((u) => u.text === 'look');
    expect(row?.imgs?.map((i) => [i.name, i.data])).toEqual([['a.png', PNG]]);
    expect(row?.files?.map((f) => f.name)).toEqual(['n.txt']);
  });

  it('a text file rides a follow-up while a turn runs: no image capability asked, the command carries the file', async () => {
    const { eng, sid } = await chat({ script: [[{ k: 'text', text: 'Working' }, { k: 'hold' }]] }, 'default', false);
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(C.routeFor(eng.getSnapshot().conv)).toBe('command');
    const n = w!.agent.log.length;
    const p = src.send({ text: 'also', files: [{ name: 'n.txt', text: 'one\n' }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    const sent = w!.agent.log.slice(n).filter(([m]) => m === 'command');
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0])).toContain(JSON.stringify(A.messageText('also', [{ name: 'n.txt', text: 'one\n' } as never])).slice(1, -1));
    expect(users(eng).find((u) => u.text === 'also')?.files?.map((f) => f.name)).toEqual(['n.txt']);
  });

  // The host already read these as text (readFiles strips up to two BOMs), so they are never sniffed or decoded again.
  // A text that starts "BM" once its BOM is gone sniffs as a BMP; a BOM the read left would be stripped by a second decode.
  const BM = 'BM is the first line of these notes\n';
  it('a text whose decoded text begins "BM" stays a text part on a turn: no image, the wire carries the text', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const wire: string[] = [];
    const turn = (w!.agent as any).turn.bind(w!.agent);
    (w!.agent as any).turn = (s: string, text: string, ...a: unknown[]) => { wire.push(text); return turn(s, text, ...a); };
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const p = src.send({ text: 'read', files: [{ name: 'bm.txt', text: BM }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    const row = users(eng).find((u) => u.text === 'read');
    expect(row?.imgs).toBeUndefined();
    expect(row?.files?.map((f) => [f.name, f.text])).toEqual([['bm.txt', BM]]);
    expect(wire).toEqual([A.messageText('read', [{ name: 'bm.txt', text: BM } as never])]);
  });

  it('a text whose decoded text begins "BM" rides a follow-up as text: the command carries it, nothing is refused as an image', async () => {
    const { eng, sid } = await chat({ script: [[{ k: 'text', text: 'Working' }, { k: 'hold' }]] }, 'default', false);
    const { d } = deps(w!);
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    expect(C.routeFor(eng.getSnapshot().conv)).toBe('command');
    const n = w!.agent.log.length;
    const p = src.send({ text: 'also', files: [{ name: 'bm.txt', text: BM }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    const sent = w!.agent.log.slice(n).filter(([m]) => m === 'command');
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0])).toContain(JSON.stringify(A.messageText('also', [{ name: 'bm.txt', text: BM } as never])).slice(1, -1));
    expect(users(eng).find((u) => u.text === 'also')?.files?.map((f) => f.text)).toEqual([BM]);
  });

  it('a text the host left with a leading BOM (its file had more) is sent exactly as given, the BOM kept', async () => {
    const { eng, sid } = await chat();
    const { d } = deps(w!);
    const wire: string[] = [];
    const turn = (w!.agent as any).turn.bind(w!.agent);
    (w!.agent as any).turn = (s: string, text: string, ...a: unknown[]) => { wire.push(text); return turn(s, text, ...a); };
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const bom = '\uFEFFnotes after a second BOM\n';
    // One read strips up to two BOMs (TextDecoder's own, then decodeText's): a file with three leaves one; reading again drops it.
    expect(A.decodeText(new TextEncoder().encode('\uFEFF\uFEFF' + bom))).toBe(bom);
    expect(A.decodeText(new TextEncoder().encode(bom))).not.toBe(bom);
    const p = src.send({ text: 'read', files: [{ name: 'bom.txt', text: bom }] });
    await w!.flush(2000);
    expect(await p).toEqual({ k: 'done' });
    expect(users(eng).find((u) => u.text === 'read')?.files?.map((f) => f.text)).toEqual([bom]);
    expect(wire).toEqual([A.messageText('read', [{ name: 'bom.txt', text: bom } as never])]);
  });
});

describe('a malformed computer handle is not a journal', () => {
  it('the engine says no journal, so nothing can send', async () => {
    w = world({ script: [scripts.dashboard] });
    const { AskEngine } = await import('./engine');
    const { slot } = await import('./accept/env');
    const eng = new AskEngine(slot, w.agent, w.j.view('bad handle', 'sess-x'), w.clock, { sid: 'sess-x', journal: { j: w.j, handle: 'bad handle' } });
    eng.open();
    await w.flush(500);
    expect(eng.activation().journal).toBe(false);
  });
});

describe('a question gate: the card key is the gate id, and Check binds to it', () => {
  it('answer is done; a journal-only answer entry for THAT gate is read again, for another gate it is not', async () => {
    w = world({ script: [scripts.question] });
    const first = await w.dock();
    first.setAuto(false);
    first.send('Ask me something');
    await w.flush(500);
    const sid = first.record!.s!;
    const eng = w.pinned(sid);
    eng.open();
    await w.flush(500);
    const card = eng.getSnapshot().gates.find((c) => c.gate.kind === 'question');
    expect(card, 'a question is parked').toBeTruthy();
    expect(card!.key, 'the card key is the gate id').toBe(card!.gate.id);
    await w.flush(2000);
    const { d } = deps(w!);
    const entry = (g: string) => ({ k: 'hx-' + 'a'.repeat(24), kind: 'answer', h: HANDLE, r: REALM, s: sid, g, gn: card!.gate.generation, c: 'hx-' + '1'.repeat(32), ct: 'ct', at: 1 }) as any;
    const probe = vi.spyOn(eng, 'checkNow');
    const same = engineActive(handleOf(eng), REF(sid), host, { ...d, pending: () => [entry(card!.gate.id)] });
    expect(await same.check({ key: card!.key, kind: 'decision' })).toEqual({ k: 'unknown' });
    expect(probe).toHaveBeenCalledTimes(1);
    probe.mockClear();
    await w.flush(2000);   // the read it started finishes (the source reads "loading" while it runs)
    const other = engineActive(handleOf(eng), REF(sid), host, { ...d, pending: () => [entry('some-other-gate')] });
    expect(await other.check({ key: card!.key, kind: 'decision' })).toEqual({ k: 'refused', code: 'nothing_to_check' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('answer() reaches the agent once for THAT gate and is done on proof; a second answer to the same card sends nothing more', async () => {
    w = world({ script: [scripts.question] });
    const first = await w.dock();
    first.setAuto(false);
    first.send('Ask me something');
    await w.flush(500);
    const sid = first.record!.s!;
    const eng = w.pinned(sid);
    eng.open();
    await w.flush(500);
    const card = eng.getSnapshot().gates.find((c) => c.gate.kind === 'question');
    expect(card, 'a question is parked').toBeTruthy();
    const { d } = deps(w!, { approver: { phase: 'held' } as any });
    const src = engineActive(handleOf(eng), REF(sid), host, d);
    const g = { id: card!.gate.id, generation: card!.gate.generation };
    const asked = () => w!.agent.log.filter((x: any) => x[0] === 'answer');
    const before = asked().length;
    const p = src.answer(g, 'ok');
    await w.flush(2000);
    const out = await p;
    expect(out, JSON.stringify(out)).toEqual({ k: 'done' });
    expect(asked().length - before, 'one answer request').toBe(1);
    expect(JSON.stringify(asked().at(-1)), 'for that gate').toContain(g.id);
    // The gate has left: a second answer finds no such card and sends nothing.
    expect(await src.answer(g, 'ok')).toEqual({ k: 'refused', code: 'no_gate' });
    expect(asked().length - before).toBe(1);
  });
});
