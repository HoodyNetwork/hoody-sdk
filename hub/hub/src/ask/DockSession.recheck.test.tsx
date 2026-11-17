// The Agent dock and a turn whose end could not be read: ONE Check again. The dock's tail draws its own Check again when that
// turn is the conversation's last; the kit's line would offer a second one (the source has recheckOutcome), so the dock's view
// leaves the line without it. A line the tail does not cover (no engine snapshot yet) keeps the kit's.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { bootFixtureCore, queryClient } from '@core';
import type { ActiveSource, ConvSnapshot } from '@kit';
import { can, type CapFacts } from '@kit/agent/capability';
import { emptyConv } from './conv';
import { DockSessionView } from './DockSession';

const REF = { computer: 'atlas.1234', realm: 'global', sid: 's1' };
const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const LINE = 'Not sure it finished';
// The engine's own block for "could not tell" with no turn read is keyed 'q' (conv.ts blocks); the source's line keeps that key.
const SNAP: ConvSnapshot = { facts, title: 'Chat', gates: [], blocks: [{ k: 'line', key: 'q', text: LINE, tone: 'info', recheck: true }] };

function source() {
  const recheckOutcome = vi.fn();
  const src = {
    kind: 'active', ref: REF, snapshot: () => SNAP, subscribe: () => () => undefined, watch: () => undefined, can: (a: any) => can(a, facts),
    send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: () => false,
    recheckOutcome,
  } as unknown as ActiveSource;
  return { src, recheckOutcome };
}
const unsureEngine = () => {
  const snapshot = { conv: { ...emptyConv('s1'), unsure: true }, gates: [], users: {} } as any;
  return { getSnapshot: () => snapshot, subscribe: () => () => undefined, checkOutcome: vi.fn(), journaled: false, newConversation: vi.fn() } as any;
};

afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });

describe('DockSessionView and a turn whose end could not be read', () => {
  it('the tail covers the last turn: exactly one Check again, and it reads through the engine', async () => {
    bootFixtureCore({});
    const s = source();
    const eng = unsureEngine();
    render(<DockSessionView source={s.src} eng={eng} conv={REF} host={{ computer: 'atlas', realm: 'global' }} agentUrl="" typing={false} empty={null} onTakeBack={() => undefined} fallback={null} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(LINE)).toBeTruthy();
    const again = screen.getAllByRole('button', { name: 'Check again' });
    expect(again).toHaveLength(1);
    fireEvent.click(again[0]!);
    expect(eng.checkOutcome).toHaveBeenCalledTimes(1);
  });
  it('no engine snapshot (no tail): the kit line keeps its Check again, on the source', async () => {
    bootFixtureCore({});
    const s = source();
    render(<DockSessionView source={s.src} eng={null as any} conv={REF} host={{ computer: 'atlas', realm: 'global' }} agentUrl="" typing={false} empty={null} onTakeBack={() => undefined} fallback={null} />);
    await act(async () => { await Promise.resolve(); });
    const again = screen.getAllByRole('button', { name: 'Check again' });
    expect(again).toHaveLength(1);
    fireEvent.click(again[0]!);
    expect(s.recheckOutcome).toHaveBeenCalledTimes(1);
  });
});
