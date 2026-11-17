// Vitest: the frame hands the host's take-back place to the transcript, so Edit under a message the agent did not take puts its
// text where the host's composer is (the kit view owns the place, the host owns the draft).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import { ConversationView } from './ConversationView';
import type { ActiveSource, ConvSnapshot } from './source';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const REQ = { key: 'hx-' + 'c'.repeat(32), kind: 'turn' as const };
const snap: ConvSnapshot = {
  facts, title: 'Fix it', gates: [], meta: { computer: 'atlas', realm: 'Work', status: 'idle' },
  blocks: [{ k: 'user', key: 'u1', text: 'Fix the build', at: 1, note: { text: 'Not sent', bad: true }, req: REQ, actions: ['takeBack'], files: [{ id: 'f', kind: 'text', name: 'a.txt' }] }],
};
const src = {
  kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => snap, subscribe: () => () => {}, watch: () => {},
  can: (a: Action) => can(a, facts), send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: () => false,
  takeBack: vi.fn(() => ({ k: 'text' as const, text: 'Fix the build', files: 1 })),
} as unknown as ActiveSource;

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ConversationView passes the take-back place through', () => {
  it('with onTakeBack and takeBackFiles, Edit on a message with files puts its text in the host\'s composer', () => {
    const put = vi.fn();
    render(<ConversationView source={src} pane={null} detailsOpen={false} onDetails={() => {}} onTakeBack={put} takeBackFiles />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(put).toHaveBeenCalledWith('Fix the build');
  });
  it('without them no Edit is drawn', () => {
    render(<ConversationView source={src} pane={null} detailsOpen={false} onDetails={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
