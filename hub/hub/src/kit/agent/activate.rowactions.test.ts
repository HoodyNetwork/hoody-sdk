// Vitest: the row actions at the door and in the capability table. Send again and Retry are SENDS (they need the activation
// prerequisites, a closed chat or a running turn refuses them); taking a message back is local (no prerequisites) but still only on
// an activated source. Every one is checked again where it is called, an operation that fails is `unknown` (a send) or a typed
// refusal (take-back, which sends nothing), and a host without them has no such methods at all. `Draft.anyway` rides the same send
// door: it never makes a refused send go.
import { describe, expect, it, vi } from 'vitest';
import { activateSource, type ActivationDeps, type Readiness, type SourceOps } from './activate';
import { ACTIONS, can, SENDING, type CapFacts } from './capability';
import type { ConvSnapshot, ConversationSource, PendingRef } from './source';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'notNeeded' },
};
const READY: Readiness = { journal: true, recovery: true, attachment: true, approver: 'notNeeded' };
const REQ: PendingRef = { key: 'hx-' + 'a'.repeat(32), kind: 'turn' };

function host(over: { facts?: Partial<CapFacts>; ready?: Partial<Readiness>; ops?: Partial<SourceOps> } = {}) {
  let snap: ConvSnapshot = { facts: { ...facts, ...over.facts }, title: 't', blocks: [], gates: [] };
  let ready: Readiness = { ...READY, ...over.ready };
  const subs = new Set<() => void>(), rsubs = new Set<() => void>();
  const read: ConversationSource = {
    kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' },
    snapshot: () => snap, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }, watch: vi.fn(), can: () => ({ ok: false, reason: 'read_only' }),
  };
  const ops = {
    send: vi.fn(async () => ({ k: 'done' as const })), stop: vi.fn(async () => ({ k: 'done' as const })),
    decide: vi.fn(async () => ({ k: 'done' as const })), answer: vi.fn(async () => ({ k: 'done' as const })),
    check: vi.fn(async () => ({ k: 'done' as const })), dismissDecision: vi.fn(), canDismiss: vi.fn(() => true),
    resend: vi.fn(async () => ({ k: 'done' as const })), retry: vi.fn(async () => ({ k: 'done' as const })),
    takeBack: vi.fn(() => ({ k: 'text' as const, text: 'hello', files: 2 })),
    ...over.ops,
  } as SourceOps;
  const deps: ActivationDeps = { read, ops, readiness: () => ({ ...ready }), onReadiness: (fn) => { rsubs.add(fn); return () => rsubs.delete(fn); } };
  return {
    src: activateSource(deps), ops,
    setFacts: (o: Partial<CapFacts>) => { snap = { ...snap, facts: { ...snap.facts, ...o } }; subs.forEach((f) => f()); },
    setReady: (o: Partial<Readiness>) => { ready = { ...ready, ...o }; rsubs.forEach((f) => f()); },
  };
}
// The ops the test replaced by `vi.fn` are mocks; typed access for expect().
const mock = (f: unknown) => f as ReturnType<typeof vi.fn>;

describe('the capability table knows the row actions', () => {
  const active = (o: Partial<CapFacts> = {}): CapFacts => ({ ...facts, mode: 'active', prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' }, ...o });
  it('lists them, and the two that send are SENDING', () => {
    for (const a of ['resend', 'retry', 'takeBack'] as const) expect(ACTIONS).toContain(a);
    expect(SENDING.has('resend')).toBe(true);
    expect(SENDING.has('retry')).toBe(true);
    expect(SENDING.has('takeBack')).toBe(false);
  });
  it.each(['resend', 'retry'] as const)('%s: on an idle open chat with every prerequisite', (a) => {
    expect(can(a, active())).toEqual({ ok: true });
  });
  it.each(['resend', 'retry'] as const)('%s: refused for a missing prerequisite, a read source, a closed chat, a running turn and a parked gate', (a) => {
    expect(can(a, active({ prereq: { journal: false, recovery: true, attachment: true, approver: 'notNeeded' } }))).toMatchObject({ ok: false, reason: 'prerequisites', missing: ['journal'] });
    expect(can(a, { ...active(), mode: 'read' })).toEqual({ ok: false, reason: 'read_only' });
    expect(can(a, active({ state: 'closed' }))).toEqual({ ok: false, reason: 'closed' });
    expect(can(a, active({ turn: true }))).toEqual({ ok: false, reason: 'turn_running' });
    expect(can(a, active({ gate: 'confirm' }))).toEqual({ ok: false, reason: 'turn_running' });
  });
  it('takeBack sends nothing: no prerequisites needed, but not on a read source, a Bot, or an unreadable chat', () => {
    expect(can('takeBack', active({ prereq: { journal: false, recovery: false, attachment: false, approver: 'missing' } }))).toEqual({ ok: true });
    expect(can('takeBack', { ...active(), mode: 'read' })).toEqual({ ok: false, reason: 'read_only' });
    expect(can('takeBack', active({ backend: 'bot' }))).toEqual({ ok: false, reason: 'bot' });
    expect(can('takeBack', active({ reach: 'unreachable' }))).toEqual({ ok: false, reason: 'unreachable' });
  });
  it('a Bot sends neither (no row action is on offer there)', () => {
    for (const a of ['resend', 'retry'] as const) expect(can(a, active({ backend: 'bot' }))).toEqual({ ok: false, reason: 'bot' });
  });
});

describe('resend and retry at the door', () => {
  it.each(['resend', 'retry'] as const)('%s calls the host once with the named request and answers its outcome', async (a) => {
    const h = host();
    expect(await h.src[a]!(REQ)).toEqual({ k: 'done' });
    expect(mock(h.ops[a]), a).toHaveBeenCalledTimes(1);
    expect(mock(h.ops[a]).mock.calls[0], a).toEqual([REQ]);
  });
  it.each(['resend', 'retry'] as const)('%s with a prerequisite missing is refused and nothing is called', async (a) => {
    const h = host({ ready: { recovery: false } });
    expect(await h.src[a]!(REQ)).toEqual({ k: 'refused', code: 'prerequisites' });
    expect(mock(h.ops[a])).not.toHaveBeenCalled();
  });
  it.each(['resend', 'retry'] as const)('%s is checked again at the call: a lease lost after the button was drawn refuses it', async (a) => {
    const h = host();
    expect(h.src.can(a)).toEqual({ ok: true });
    h.setReady({ attachment: false });
    expect(await h.src[a]!(REQ)).toEqual({ k: 'refused', code: 'prerequisites' });
    expect(mock(h.ops[a])).not.toHaveBeenCalled();
  });
  it.each(['resend', 'retry'] as const)('%s while a turn runs is refused: the reply has to end first', async (a) => {
    const h = host({ facts: { turn: true } });
    expect(await h.src[a]!(REQ)).toEqual({ k: 'refused', code: 'turn_running' });
    expect(mock(h.ops[a])).not.toHaveBeenCalled();
  });
  it.each(['resend', 'retry'] as const)('%s whose operation throws, rejects or answers nonsense is unknown, never done or failed (C9)', async (a) => {
    for (const bad of [async () => { throw new Error('boom'); }, () => Promise.reject(new Error('x')), async () => 'done', async () => ({ k: 'refused' }), async () => null]) {
      const h = host({ ops: { [a]: vi.fn(bad as never) } });
      expect(await h.src[a]!(REQ), String(bad)).toEqual({ k: 'unknown' });
    }
  });
});

describe('take back at the door', () => {
  it('answers the text and how many files stay in the host draft; no prerequisites needed', () => {
    const h = host({ ready: { journal: false, recovery: false, attachment: false } });
    expect(h.src.takeBack!(REQ)).toEqual({ k: 'text', text: 'hello', files: 2 });
    expect(mock(h.ops.takeBack)).toHaveBeenCalledTimes(1);
  });
  it('is refused by the table first (a closed-out source, an unreadable chat): nothing is called', () => {
    const h = host({ facts: { reach: 'unreachable' } });
    expect(h.src.takeBack!(REQ)).toEqual({ k: 'refused', code: 'unreachable' });
    expect(mock(h.ops.takeBack)).not.toHaveBeenCalled();
  });
  it('a host that throws or answers nonsense is a typed refusal (nothing was sent either way)', () => {
    for (const bad of [() => { throw new Error('boom'); }, () => 'text', () => ({ k: 'text', text: 5, files: 1 }), () => ({ k: 'text', text: 'x', files: -1 }), () => null]) {
      const h = host({ ops: { takeBack: vi.fn(bad as never) } });
      expect(h.src.takeBack!(REQ), String(bad)).toEqual({ k: 'refused', code: 'failed' });
    }
  });
  it('passes a host refusal through', () => {
    const h = host({ ops: { takeBack: vi.fn(() => ({ k: 'refused' as const, code: 'not_editable' })) } });
    expect(h.src.takeBack!(REQ)).toEqual({ k: 'refused', code: 'not_editable' });
  });
});

describe('a host without row actions', () => {
  it('has none of the three methods on the active source', () => {
    const ops = host().ops;
    const bare: SourceOps = { send: ops.send, stop: ops.stop, decide: ops.decide, answer: ops.answer, check: ops.check, dismissDecision: ops.dismissDecision, canDismiss: ops.canDismiss };
    const read = host().src;
    const src = activateSource({ read, ops: bare, readiness: () => ({ ...READY }), onReadiness: () => () => undefined });
    for (const a of ['resend', 'retry', 'takeBack']) expect(a in src, a).toBe(false);
  });
});

describe('Draft.anyway', () => {
  it('rides the one send door untouched, and never makes a refused send go', async () => {
    const h = host();
    expect(await h.src.send({ text: 'again', anyway: true })).toEqual({ k: 'done' });
    expect(mock(h.ops.send).mock.calls[0]![0]).toEqual({ text: 'again', anyway: true });
    const closed = host({ facts: { state: 'closed' } });
    expect(await closed.src.send({ text: 'again', anyway: true })).toEqual({ k: 'refused', code: 'closed' });
    expect(mock(closed.ops.send)).not.toHaveBeenCalled();
    const lacking = host({ ready: { journal: false } });
    expect(await lacking.src.send({ text: 'again', anyway: true })).toEqual({ k: 'refused', code: 'prerequisites' });
    expect(mock(lacking.ops.send)).not.toHaveBeenCalled();
  });
});
