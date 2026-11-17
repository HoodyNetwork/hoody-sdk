// Vitest: the activation door. send/stop/decide/answer/check exist only on the activated source, are refused (typed,
// nothing called) while the journal, by-key recovery, attachment lease or (Strict) a HELD approver lease is missing, are
// checked again at the moment they are called, and an operation that fails after a request may have left is `unknown`,
// never done or failed (C9). A decision whose answer was lost counts as an unsettled send, so Check again is possible.
import { describe, expect, it, vi } from 'vitest';
import { activateSource, approverFactOf, type ActivationDeps, type Readiness, type SourceOps } from './activate';
import type { CapFacts } from './capability';
import { isActive, type ConvSnapshot, type ConversationSource, type GateEntry } from './source';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'notNeeded' },
};
const gate = (o: Partial<GateEntry> = {}): GateEntry => ({
  key: 'g1', ref: { id: 'g1', generation: 3 }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: 'make' } },
  helper: false, addressing: false, held: null, decision: null, ...o,
});
const READY: Readiness = { journal: true, recovery: true, attachment: true, approver: 'notNeeded' };

function host(over: { facts?: Partial<CapFacts>; gates?: GateEntry[]; ready?: Partial<Readiness>; unsettled?: number } = {}) {
  let snap: ConvSnapshot = { facts: { ...facts, ...over.facts }, title: 't', blocks: [], gates: over.gates ?? [] };
  let ready: Readiness = { ...READY, ...over.ready };
  let unsettled = over.unsettled ?? 0;
  const subs = new Set<() => void>();
  const rsubs = new Set<() => void>();
  const usubs = new Set<() => void>();
  const read: ConversationSource = {
    kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' },
    snapshot: () => snap, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }, watch: vi.fn(), can: () => ({ ok: false, reason: 'read_only' }),
  };
  const ops: SourceOps = {
    send: vi.fn(async () => ({ k: 'done' as const })), stop: vi.fn(async () => ({ k: 'done' as const })),
    decide: vi.fn(async () => ({ k: 'done' as const })), answer: vi.fn(async () => ({ k: 'done' as const })),
    check: vi.fn(async () => ({ k: 'done' as const })), dismissDecision: vi.fn(), canDismiss: vi.fn(() => true),
  };
  const deps: ActivationDeps = {
    read, ops, readiness: () => ({ ...ready }), onReadiness: (fn) => { rsubs.add(fn); return () => rsubs.delete(fn); },
    unsettled: { count: () => unsettled, subscribe: (fn) => { usubs.add(fn); return () => usubs.delete(fn); } },
  };
  return {
    src: activateSource(deps), read, ops, deps,
    setSnap: (o: Partial<ConvSnapshot>) => { snap = { ...snap, ...o }; subs.forEach((f) => f()); },
    setFacts: (o: Partial<CapFacts>) => { snap = { ...snap, facts: { ...snap.facts, ...o } }; subs.forEach((f) => f()); },
    setReady: (o: Partial<Readiness>) => { ready = { ...ready, ...o }; rsubs.forEach((f) => f()); },
    setUnsettled: (n: number) => { unsettled = n; usubs.forEach((f) => f()); },
    usubs,
  };
}
const SEND = { text: 'hello' };

describe('the activated source', () => {
  it('is active, the read side is not', () => {
    const h = host();
    expect(isActive(h.src)).toBe(true);
    expect(isActive(h.read)).toBe(false);
  });
  it('turns the surface on only with every prerequisite: the facts say active and carry the live readiness', () => {
    const h = host();
    expect(h.src.snapshot().facts).toMatchObject({ mode: 'active', prereq: READY });
    expect(h.src.can('send')).toEqual({ ok: true });
  });
  it.each(['journal', 'recovery', 'attachment'] as const)('without the %s nothing is sent and nothing is called', async (p) => {
    const h = host({ ready: { [p]: false } });
    const o = await h.src.send(SEND);
    expect(o).toEqual({ k: 'refused', code: 'prerequisites' });
    expect(h.ops.send).not.toHaveBeenCalled();
    expect(h.src.can('send')).toMatchObject({ ok: false, reason: 'prerequisites', missing: [p] });
  });
  it('a Strict chat needs a HELD lease: notNeeded, missing and elsewhere all refuse', async () => {
    for (const approver of ['notNeeded', 'missing', 'elsewhere'] as const) {
      const h = host({ facts: { approval: 'always' }, ready: { approver } });
      const o = await h.src.send(SEND);
      expect(o.k, approver).toBe('refused');
      expect(h.ops.send, approver).not.toHaveBeenCalled();
    }
    const ok = host({ facts: { approval: 'always' }, ready: { approver: 'held' } });
    expect(await ok.src.send(SEND)).toEqual({ k: 'done' });
  });
  it('stop, decide, answer and check are refused the same way, and called when allowed', async () => {
    const g = gate();
    const busy = { state: 'running' as const, turn: true, gate: 'confirm' as const };
    const down = host({ facts: busy, gates: [g], ready: { journal: false }, unsettled: 1 });
    expect(await down.src.stop('turn')).toMatchObject({ k: 'refused' });
    expect(await down.src.decide(g.ref, { choice: 'once' })).toMatchObject({ k: 'refused' });
    expect(await down.src.check({ key: 'k', kind: 'turn' })).toMatchObject({ k: 'refused' });
    expect(down.ops.stop).not.toHaveBeenCalled();
    expect(down.ops.decide).not.toHaveBeenCalled();
    expect(down.ops.check).not.toHaveBeenCalled();
    const up = host({ facts: busy, gates: [g], unsettled: 1 });
    expect(await up.src.stop('turn')).toEqual({ k: 'done' });
    expect(await up.src.decide(g.ref, { choice: 'once' })).toEqual({ k: 'done' });
    expect(await up.src.check({ key: 'k', kind: 'turn' })).toEqual({ k: 'done' });
    const q = host({ facts: { ...busy, gate: 'question' }, gates: [{ ...g, gate: { kind: 'question', risk: '', question: 'Which?', options: ['a'] } }] });
    expect(await q.src.answer(g.ref, 'a')).toEqual({ k: 'done' });
    expect(q.ops.answer).toHaveBeenCalledWith(g.ref, 'a');
  });
  it('is checked again when the action is taken: a lease that lapsed after the button was drawn refuses', async () => {
    const h = host({ facts: { approval: 'always' }, ready: { approver: 'held' } });
    expect(h.src.can('send').ok).toBe(true);
    h.setReady({ approver: 'elsewhere' });
    expect(await h.src.send(SEND)).toMatchObject({ k: 'refused', code: 'approver_elsewhere' });
    expect(h.ops.send).not.toHaveBeenCalled();
  });
  it('a message while a turn runs goes through the follow-up rule; images need their own rule', async () => {
    const run = host({ facts: { state: 'running', turn: true } });
    expect(await run.src.send(SEND)).toEqual({ k: 'done' });
    const img = host({ facts: { state: 'running', turn: true } });
    expect(await img.src.send({ text: 'x', images: [{ name: 'a.png', mime: 'image/png', data: 'AA==' }] })).toMatchObject({ k: 'refused', code: 'images_wait' });
    expect(img.ops.send).not.toHaveBeenCalled();
    const auto = host({ facts: { approval: 'always' }, ready: { approver: 'held' } });
    expect(await auto.src.send(SEND, { autoApproveTurn: true })).toMatchObject({ k: 'refused', code: 'strict_refuses_automatic' });
  });
  it('a read that cannot be answered refuses everything with its reason', async () => {
    const h = host({ facts: { reach: 'unreachable' } });
    expect(await h.src.send(SEND)).toEqual({ k: 'refused', code: 'unreachable' });
  });
});

describe('unknown outcomes (C9)', () => {
  it('an operation that throws or rejects is unknown, never done or failed', async () => {
    const h = host();
    (h.ops.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('socket closed'));
    expect(await h.src.send(SEND)).toEqual({ k: 'unknown' });
    (h.ops.send as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('sync'); });
    expect(await h.src.send(SEND)).toEqual({ k: 'unknown' });
  });
  it('an answer that is not an outcome is unknown, and an unknown stays unknown', async () => {
    const h = host();
    (h.ops.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ k: 'ok' }).mockResolvedValueOnce({ k: 'unknown' });
    expect(await h.src.send(SEND)).toEqual({ k: 'unknown' });
    expect(await h.src.send(SEND)).toEqual({ k: 'unknown' });
    expect(await h.src.send(SEND)).toEqual({ k: 'unknown' });
  });
  it('a refusal keeps its code, done stays done', async () => {
    const h = host();
    (h.ops.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ k: 'refused', code: 'turn_running' });
    expect(await h.src.send(SEND)).toEqual({ k: 'refused', code: 'turn_running' });
    expect(await h.src.send(SEND)).toEqual({ k: 'done' });
  });
  it('a decision whose answer was lost counts as an unsettled send, so Check again is possible; settled, it stops counting', () => {
    const h = host({ facts: { state: 'running', turn: true, gate: 'confirm' }, gates: [gate({ decision: 'unknown' })] });
    expect(h.src.snapshot().facts.unsettledSends).toBe(1);
    expect(h.src.can('check')).toEqual({ ok: true });
    h.setSnap({ gates: [gate()] });
    expect(h.src.snapshot().facts.unsettledSends).toBe(0);
    expect(h.src.can('check')).toMatchObject({ ok: false, reason: 'nothing_to_check' });
  });
  it('the host\'s own unsettled sends count too, added to the decisions', () => {
    const h = host({ gates: [gate({ decision: 'unknown' })], unsettled: 2 });
    expect(h.src.snapshot().facts.unsettledSends).toBe(3);
  });
  it('a decision on its way (or unknown) keeps the approval mode busy: decisionPending', () => {
    const h = host({ gates: [gate({ decision: 'sending' })] });
    expect(h.src.snapshot().facts.decisionPending).toBe(true);
    expect(host({ gates: [gate()] }).src.snapshot().facts.decisionPending).toBe(false);
  });
});

describe('snapshot, subscription and dismiss', () => {
  it('the snapshot is the same object until something changes, and a readiness change is a change that notifies', () => {
    const h = host();
    const a = h.src.snapshot();
    expect(h.src.snapshot()).toBe(a);
    const seen = vi.fn();
    h.src.subscribe(seen);
    h.setReady({ attachment: false });
    expect(seen).toHaveBeenCalledTimes(1);
    const b = h.src.snapshot();
    expect(b).not.toBe(a);
    expect(b.facts.prereq.attachment).toBe(false);
    h.setUnsettled(1);
    expect(h.src.snapshot()).not.toBe(b);
  });
  it('a change of the host\'s unsettled count alone notifies, in both directions, and the snapshot follows', () => {
    const h = host();
    const seen = vi.fn();
    h.src.subscribe(seen);
    expect(h.src.can('check')).toMatchObject({ ok: false, reason: 'nothing_to_check' });
    h.setUnsettled(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(h.src.can('check')).toEqual({ ok: true });
    h.setUnsettled(0);
    expect(seen).toHaveBeenCalledTimes(2);
    expect(h.src.can('check')).toMatchObject({ ok: false, reason: 'nothing_to_check' });
  });
  it('unsubscribe drops the read side, the readiness and the unsettled count', () => {
    const h = host();
    const seen = vi.fn();
    const off = h.src.subscribe(seen);
    off();
    h.setReady({ journal: false });
    h.setFacts({ state: 'running' });
    h.setUnsettled(3);
    expect(seen).not.toHaveBeenCalled();
    expect(h.usubs.size).toBe(0);
  });
  it('watch goes to the read side, with the holder\'s rank when it gives one (2c)', () => {
    const h = host();
    h.src.watch('stream');
    expect(h.read.watch).toHaveBeenLastCalledWith('stream', undefined);
    h.src.watch('stream', 'focused');
    expect(h.read.watch).toHaveBeenLastCalledWith('stream', 'focused');
  });
  it('Dismiss exists only for a journaled, readable chat whose engine can dismiss that gate', () => {
    const g = gate({ decision: 'unknown' });
    const h = host({ gates: [g] });
    expect(h.src.canDismiss(g.ref)).toBe(true);
    h.src.dismissDecision(g.ref);
    expect(h.ops.dismissDecision).toHaveBeenCalledWith(g.ref);
    (h.ops.canDismiss as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(h.src.canDismiss(g.ref)).toBe(false);
    const n = (h.ops.dismissDecision as ReturnType<typeof vi.fn>).mock.calls.length;
    h.src.dismissDecision(g.ref);
    expect((h.ops.dismissDecision as ReturnType<typeof vi.fn>).mock.calls.length).toBe(n);
    const nj = host({ gates: [g], ready: { journal: false } });
    expect(nj.src.canDismiss(g.ref)).toBe(false);
    nj.src.dismissDecision(g.ref);
    expect(nj.ops.dismissDecision).not.toHaveBeenCalled();
  });
  it('dismissDecision works detached from the object (a card callback)', () => {
    const g = gate({ decision: 'unknown' });
    const h = host({ gates: [g] });
    const { dismissDecision } = h.src;
    dismissDecision(g.ref);
    expect(h.ops.dismissDecision).toHaveBeenCalledTimes(1);
  });
});

describe('the approver fact comes from the lease state', () => {
  it('a chat that is not Strict needs none, whatever the lease says', () => {
    for (const phase of ['none', 'held', 'elsewhere', 'expired', 'acquiring', 'failing', 'gone'] as const) expect(approverFactOf(false, { phase })).toBe('notNeeded');
  });
  it('a Strict chat has it only while the lease is held; another window is elsewhere; everything else is missing', () => {
    expect(approverFactOf(true, { phase: 'held', generation: 1, expiresAt: 1 })).toBe('held');
    expect(approverFactOf(true, { phase: 'elsewhere' })).toBe('elsewhere');
    for (const phase of ['none', 'expired', 'acquiring', 'failing', 'gone'] as const) expect(approverFactOf(true, { phase })).toBe('missing');
  });
  it('end to end: a Strict chat sends only with a held lease', async () => {
    for (const [phase, sends] of [['held', true], ['elsewhere', false], ['expired', false], ['acquiring', false]] as const) {
      const h = host({ facts: { approval: 'always' }, ready: { approver: approverFactOf(true, { phase }) } });
      expect((await h.src.send(SEND)).k, phase).toBe(sends ? 'done' : 'refused');
    }
  });
});
