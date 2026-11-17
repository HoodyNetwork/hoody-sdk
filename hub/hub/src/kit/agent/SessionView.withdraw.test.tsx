// Vitest: Edit and Remove under a queued message. Both ask the source to take the message back (`withdraw`); only Edit's `withdrawn`
// answer with text puts that text in the host's draft. Taken, ended, a refusal and an unknown answer put nothing there (the host's row
// note says what is true). Edit needs a draft to put the text in; a source without `withdraw` offers neither; the activation door
// checks the table and turns anything that is not an outcome into unknown.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { activateSource, type SourceOps } from './activate';
import { can, type Action, type CapFacts } from './capability';
import type { ActiveSource, ConvBlock, ConvSnapshot, ConversationSource, PendingRef, RowAction, WithdrawOutcome } from './source';
import { SessionView } from './SessionView';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 1,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const REQ: PendingRef = { key: 'hx-' + 'c'.repeat(32), kind: 'message' };
const queued = (actions: RowAction[]): ConvBlock => ({ k: 'user', key: 'u1', text: 'Also add a README', at: 1, note: { text: 'Waiting' }, req: REQ, actions });
const snap = (blocks: ConvBlock[], f: Partial<CapFacts> = {}): ConvSnapshot => ({ facts: { ...facts, ...f }, title: 't', gates: [], blocks });

function source(s: ConvSnapshot, answer: WithdrawOutcome | Promise<WithdrawOutcome>, withMethod = true) {
  const withdraw = vi.fn(async () => answer);
  const read: ConversationSource = { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) };
  const src = { ...read, send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: () => false, ...(withMethod ? { withdraw } : {}) } as unknown as ActiveSource;
  return { src, withdraw };
}
const labels = () => screen.queryAllByRole('button').map((b) => b.textContent);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Check again under a queued message whose take-back is unknown', () => {
  it('drawn as Check again; it reads the row back by its request (never takes it back again)', () => {
    const { src, withdraw } = source(snap([queued(['check'])]), { k: 'withdrawn' });
    render(<SessionView source={src} size="l" onTakeBack={() => undefined} />);
    expect(labels()).toEqual(['Check again']);
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(src.check).toHaveBeenCalledWith(REQ);
    expect(withdraw).not.toHaveBeenCalled();
  });
  it('the capability table holds it: nothing to check, no press reaches the source', () => {
    const { src } = source(snap([queued(['check'])], { unsettledSends: 0 }), { k: 'withdrawn' });
    render(<SessionView source={src} size="l" />);
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(src.check).not.toHaveBeenCalled();
  });
});

describe('Edit and Remove under a queued message', () => {
  it('both drawn, Edit first; Edit needs a draft to put the text in; no withdraw method, neither', () => {
    const { src } = source(snap([queued(['editQueued', 'withdraw'])]), { k: 'withdrawn' });
    const { unmount } = render(<SessionView source={src} size="l" onTakeBack={() => undefined} />);
    expect(labels()).toEqual(['Edit', 'Remove']);
    unmount();
    const r2 = render(<SessionView source={src} size="l" />);
    expect(labels()).toEqual(['Remove']);
    r2.unmount();
    const { src: none } = source(snap([queued(['editQueued', 'withdraw'])]), { k: 'withdrawn' }, false);
    render(<SessionView source={none} size="l" onTakeBack={() => undefined} />);
    expect(labels()).toEqual([]);
  });
  it('Remove asks with "remove" and never touches the draft', async () => {
    const { src, withdraw } = source(snap([queued(['editQueued', 'withdraw'])]), { k: 'withdrawn' });
    const put = vi.fn();
    render(<SessionView source={src} size="l" onTakeBack={put} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(withdraw).toHaveBeenCalledWith(REQ, 'remove');
    await flush();
    expect(put).not.toHaveBeenCalled();
  });
  it('Edit: withdrawn with text puts the text in the draft', async () => {
    const { src, withdraw } = source(snap([queued(['editQueued', 'withdraw'])]), { k: 'withdrawn', text: 'Also add a README' });
    const put = vi.fn();
    render(<SessionView source={src} size="l" onTakeBack={put} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(withdraw).toHaveBeenCalledWith(REQ, 'edit');
    await waitFor(() => expect(put).toHaveBeenCalledWith('Also add a README'));
  });
  it.each<[string, WithdrawOutcome]>([
    ['taken', { k: 'taken' }], ['ended', { k: 'ended' }], ['refused (no route)', { k: 'refused', code: 'not_found' }], ['unknown', { k: 'unknown' }],
    ['withdrawn without its text', { k: 'withdrawn' }],
  ])('Edit: %s puts nothing in the draft', async (_n, answer) => {
    const { src } = source(snap([queued(['editQueued', 'withdraw'])]), answer);
    const put = vi.fn();
    render(<SessionView source={src} size="l" onTakeBack={put} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await flush(); await flush();
    expect(put).not.toHaveBeenCalled();
  });
  it('a closed chat: both disabled, pressing asks nothing', () => {
    const { src, withdraw } = source(snap([queued(['editQueued', 'withdraw'])], { state: 'closed', turn: false }), { k: 'withdrawn' });
    render(<SessionView source={src} size="l" onTakeBack={() => undefined} />);
    for (const n of ['Edit', 'Remove']) {
      const b = screen.getByRole('button', { name: n }) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      fireEvent.click(b);
    }
    expect(withdraw).not.toHaveBeenCalled();
  });
});

describe('the activation door for withdraw', () => {
  const read = (f: Partial<CapFacts> = {}): ConversationSource => {
    const s = snap([], { mode: 'read', ...f });
    return { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: () => ({ ok: false, reason: 'read_only' }) };
  };
  const ops = (w: SourceOps['withdraw']): SourceOps => ({
    send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: () => false, ...(w ? { withdraw: w } : {}),
  } as unknown as SourceOps);
  const deps = (r: ConversationSource, o: SourceOps) => ({ read: r, ops: o, readiness: () => ({ journal: true, recovery: true, attachment: true, approver: 'notNeeded' as const }), onReadiness: () => () => {} });
  it('no host method, no withdraw on the active source', () => {
    expect(activateSource(deps(read(), ops(undefined))).withdraw).toBeUndefined();
  });
  it('the table refuses a closed chat without calling the host', async () => {
    const w = vi.fn(async () => ({ k: 'withdrawn' as const }));
    const a = activateSource(deps(read({ state: 'closed', turn: false }), ops(w)));
    expect(await a.withdraw!(REQ, 'remove')).toEqual({ k: 'refused', code: 'closed' });
    expect(w).not.toHaveBeenCalled();
  });
  it('the host\'s outcome passes; a throw or a shapeless answer is unknown, never a refusal', async () => {
    expect(await activateSource(deps(read(), ops(async () => ({ k: 'withdrawn', text: 'x' })))).withdraw!(REQ, 'edit')).toEqual({ k: 'withdrawn', text: 'x' });
    expect(await activateSource(deps(read(), ops(async () => ({ k: 'taken' })))).withdraw!(REQ, 'remove')).toEqual({ k: 'taken' });
    expect(await activateSource(deps(read(), ops(async () => { throw new Error('lost'); }))).withdraw!(REQ, 'remove')).toEqual({ k: 'unknown' });
    expect(await activateSource(deps(read(), ops(async () => ({ k: 'gone' }) as never))).withdraw!(REQ, 'remove')).toEqual({ k: 'unknown' });
  });
});
