// Vitest: the activation door for forks. `fork` is judged by the table's `fork` row; the source has no read-back of a fork in
// this build (Check again is tested elsewhere). Refusals come back in words (never a capability code).
import { describe, expect, it, vi } from 'vitest';
import { activateSource, type ActivationDeps, type Readiness, type SourceOps } from './activate';
import type { CapFacts } from './capability';
import type { ConvSnapshot, ConversationSource, ForkOutcome } from './source';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'notNeeded' }, completedTurns: 2,
};
const READY: Readiness = { journal: true, recovery: true, attachment: true, approver: 'notNeeded' };
const opened: ForkOutcome = { k: 'opened', sid: 's2' };

function host(f: Partial<CapFacts> = {}, ready: Partial<Readiness> = {}) {
  const snap: ConvSnapshot = { facts: { ...facts, ...f }, title: 't', blocks: [], gates: [] };
  const read: ConversationSource = {
    kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' },
    snapshot: () => snap, subscribe: () => () => undefined, watch: vi.fn(), can: () => ({ ok: false, reason: 'read_only' }),
  };
  const fork = vi.fn(async () => opened);
  const ops: SourceOps = {
    send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: vi.fn(() => true), fork,
  } as unknown as SourceOps;
  const deps: ActivationDeps = { read, ops, readiness: () => ({ ...READY, ...ready }), onReadiness: () => () => undefined };
  return { src: activateSource(deps), fork };
}

describe('fork', () => {
  it('runs on an idle chat with finished turns', async () => {
    const h = host();
    expect(await h.src.fork!({ turn: 0, pin: 3 })).toEqual(opened);
    expect(h.fork).toHaveBeenCalledOnce();
  });
  it('a closed chat is refused in words, and nothing is called', async () => {
    const h = host({ state: 'closed' });
    const o = await h.src.fork!();
    expect(o).toMatchObject({ k: 'refused' });
    expect((o as { words: string }).words).toBe('This chat is closed, so reopen it first.');
    expect(h.fork).not.toHaveBeenCalled();
  });
});

describe('there is no way back in this build', () => {
  it('the activated source offers fork and no checkFork, even from a host that supplies one', () => {
    const h = host();
    expect(h.src.fork).toBeTypeOf('function');
    expect((h.src as unknown as Record<string, unknown>).checkFork).toBeUndefined();
  });
});
