// The activated source's Check again for a turn whose outcome is not known ("Couldn't tell"): a read the host makes again,
// never a send. Passed through only when the host has it; a chat that is gone reads nothing.
import { describe, expect, it, vi } from 'vitest';
import { activateSource, type ActivationDeps, type Readiness, type SourceOps } from './activate';
import type { CapFacts } from './capability';
import type { ConvSnapshot, ConversationSource } from './source';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'notNeeded' },
};
const READY: Readiness = { journal: true, recovery: true, attachment: true, approver: 'notNeeded' };

function host(withRecheck: boolean) {
  let snap: ConvSnapshot = { facts: { ...facts }, title: 't', blocks: [], gates: [] };
  const read: ConversationSource = {
    kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' },
    snapshot: () => snap, subscribe: () => () => undefined, watch: vi.fn(), can: () => ({ ok: false, reason: 'read_only' }),
  };
  const recheckOutcome = vi.fn();
  const ops: SourceOps = {
    send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: vi.fn(() => false),
    ...(withRecheck ? { recheckOutcome } : {}),
  };
  const deps: ActivationDeps = { read, ops, readiness: () => ({ ...READY }), onReadiness: () => () => undefined };
  return { src: activateSource(deps), ops, recheckOutcome, setFacts: (o: Partial<CapFacts>) => { snap = { ...snap, facts: { ...snap.facts, ...o } }; } };
}

describe('Check again for an unsure turn on the activated source', () => {
  it('a host without it gives a source without the operation', () => {
    expect(host(false).src.recheckOutcome).toBeUndefined();
  });

  it("calls the host's read once per press and sends nothing, with nothing unsettled too", () => {
    const h = host(true);
    h.src.recheckOutcome!();
    expect(h.recheckOutcome).toHaveBeenCalledTimes(1);
    expect(h.ops.send).not.toHaveBeenCalled();
    expect(h.ops.check).not.toHaveBeenCalled();
  });

  it('reads nothing for a chat that is gone', () => {
    const h = host(true);
    h.setFacts({ state: 'gone' });
    h.src.recheckOutcome!();
    expect(h.recheckOutcome).not.toHaveBeenCalled();
  });
});
