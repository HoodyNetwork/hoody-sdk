// Vitest: the activated source hands the host's shell-job store a gate that is the activation door's own
// can('stopJob'), read at each call, so a Stop drawn while the chat was open is refused once the chat closes or a prerequisite
// lapses. A host without shell jobs gives a source without the operation.
import { describe, expect, it, vi } from 'vitest';
import { activateSource, type ActivationDeps, type Readiness, type SourceOps } from './activate';
import type { Capability, CapFacts } from './capability';
import type { ConvSnapshot, ConversationSource } from './source';
import type { ShellJobStops } from './shellJobStop';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'notNeeded' },
};
const READY: Readiness = { journal: true, recovery: true, attachment: true, approver: 'notNeeded' };
const STORE = { tag: 'store' } as unknown as ShellJobStops;

function host(withJobs: boolean) {
  let snap: ConvSnapshot = { facts: { ...facts }, title: 't', blocks: [], gates: [] };
  let ready: Readiness = { ...READY };
  const subs = new Set<() => void>();
  const read: ConversationSource = {
    kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' },
    snapshot: () => snap, subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }, watch: vi.fn(), can: () => ({ ok: false, reason: 'read_only' }),
  };
  let gate: (() => Capability) | null = null;
  const shellJobs = vi.fn((g: () => Capability) => { gate = g; return STORE; });
  const ops: SourceOps = {
    send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: vi.fn(() => false),
    ...(withJobs ? { shellJobs } : {}),
  };
  const deps: ActivationDeps = { read, ops, readiness: () => ({ ...ready }), onReadiness: () => () => undefined };
  return {
    src: activateSource(deps), shellJobs, gate: () => gate!,
    setFacts: (o: Partial<CapFacts>) => { snap = { ...snap, facts: { ...snap.facts, ...o } }; subs.forEach((f) => f()); },
    setReady: (o: Partial<Readiness>) => { ready = { ...ready, ...o }; },
  };
}

describe('shell jobs on the activated source', () => {
  it('a host without shell jobs gives a source without the operation', () => {
    expect(host(false).src.shellJobs).toBeUndefined();
  });

  it("returns the host's store, and the gate it hands over is can('stopJob') read live at each call", () => {
    const h = host(true);
    expect(h.src.shellJobs?.()).toBe(STORE);
    expect(h.gate()()).toEqual({ ok: true });
    h.setFacts({ state: 'closed' });
    expect(h.gate()(), 'a closed chat refuses the press').toMatchObject({ ok: false, reason: 'closed' });
    h.setFacts({ state: 'idle' });
    expect(h.gate()().ok).toBe(true);
    h.setReady({ attachment: false });
    expect(h.gate()().ok, 'a lapsed prerequisite refuses the press').toBe(false);
  });
});
