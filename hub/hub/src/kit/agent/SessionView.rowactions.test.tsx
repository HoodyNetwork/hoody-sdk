// Vitest: the actions under a user message. The host's block names which are on offer (only on a definite outcome); the view
// draws one button per action, the source's capability table is the truth at the press (a button the table refuses is disabled and
// the sentence says why), Edit needs a place to put the text and, on a message with files, a host draft that keeps them, and a
// read-only source draws none.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import type { ActiveSource, ConvBlock, ConvSnapshot, ConversationSource, PendingRef, RowAction } from './source';
import { SessionView } from './SessionView';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const REQ: PendingRef = { key: 'hx-' + 'b'.repeat(32), kind: 'turn' };
const user = (actions: RowAction[], over: Partial<Extract<ConvBlock, { k: 'user' }>> = {}): ConvBlock => ({
  k: 'user', key: 'u1', text: 'Fix the checkout tests', at: 1, note: { text: 'Not sent', bad: true }, req: REQ, actions, ...over,
});
const snap = (blocks: ConvBlock[], f: Partial<CapFacts> = {}): ConvSnapshot => ({ facts: { ...facts, ...f }, title: 't', gates: [], blocks });

function source(s: ConvSnapshot, mode: 'active' | 'read' = 'active') {
  const f = { ...s.facts, mode };
  const resend = vi.fn(async () => ({ k: 'done' as const }));
  const retry = vi.fn(async () => ({ k: 'done' as const }));
  const takeBack = vi.fn(() => ({ k: 'text' as const, text: 'Fix the checkout tests', files: 0 }));
  const fixed: ConvSnapshot = { ...s, facts: f };
  const read: ConversationSource = { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => fixed, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, f) };
  const src = mode === 'active'
    ? ({ ...read, send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: () => false, resend, retry, takeBack } as unknown as ActiveSource)
    : read;
  return { src, resend, retry, takeBack };
}
const labels = () => screen.queryAllByRole('button').map((b) => b.textContent);

describe('the actions under a user message', () => {
  it('one button per action on offer, in the host\'s order, under the note', () => {
    const { src } = source(snap([user(['resend', 'takeBack'])]));
    render(<SessionView source={src} size="l" onTakeBack={() => undefined} />);
    expect(labels()).toEqual(['Send again', 'Edit']);
  });
  it('Send again and Retry call the source with the row\'s request; the capability is checked again at the press', () => {
    const { src, resend, retry } = source(snap([user(['resend', 'retry'])]));
    render(<SessionView source={src} size="l" />);
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(resend).toHaveBeenCalledWith(REQ);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledWith(REQ);
  });
  it('a row with no actions, no request or no activated source draws none (a Check-only row stays Check-only)', () => {
    for (const b of [user([]), { ...user(['resend']), req: undefined } as ConvBlock, user(['resend'], { actions: undefined })]) {
      const { src } = source(snap([b]));
      const { unmount } = render(<SessionView source={src} size="l" />);
      expect(labels()).toEqual([]);
      unmount();
    }
    const { src } = source(snap([user(['resend', 'retry', 'takeBack'])]), 'read');
    render(<SessionView source={src} size="l" onTakeBack={() => undefined} />);
    expect(labels(), 'a read-only source has no methods to call').toEqual([]);
  });
  it('the table is read again where the button is pressed: facts that changed after it was drawn stop the call', () => {
    const { src, resend } = source(snap([user(['resend'])]));
    let closed = false;
    const inner = src.can.bind(src);
    (src as { can: ConversationSource['can'] }).can = (a) => (closed && a === 'resend' ? { ok: false, reason: 'closed' } : inner(a));
    render(<SessionView source={src} size="l" />);
    const b = screen.getByRole('button', { name: 'Send again' }) as HTMLButtonElement;
    expect(b.disabled, 'drawn enabled').toBe(false);
    closed = true;
    fireEvent.click(b);
    expect(resend).not.toHaveBeenCalled();
  });
  it('a source that lacks the method does not offer it', () => {
    const { src } = source(snap([user(['resend', 'retry'])]));
    delete (src as { retry?: unknown }).retry;
    render(<SessionView source={src} size="l" />);
    expect(labels()).toEqual(['Send again']);
  });
  it('refused by the table: the button is disabled and the sentence says why; pressing calls nothing', () => {
    const { src, resend } = source(snap([user(['resend'])], { turn: true }));
    render(<SessionView source={src} size="l" />);
    const b = screen.getByRole('button', { name: 'Send again' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText('A reply is running, so type a follow-up or stop it first.')).toBeTruthy();
    fireEvent.click(b);
    expect(resend).not.toHaveBeenCalled();
  });
});

describe('Edit (take back)', () => {
  it('puts the text in the host\'s composer, and only when the host gave it somewhere to go', () => {
    const { src, takeBack } = source(snap([user(['takeBack'])]));
    const put = vi.fn();
    const { unmount } = render(<SessionView source={src} size="l" onTakeBack={put} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(takeBack).toHaveBeenCalledWith(REQ);
    expect(put).toHaveBeenCalledWith('Fix the checkout tests');
    unmount();
    render(<SessionView source={source(snap([user(['takeBack'])])).src} size="l" />);
    expect(labels(), 'no composer to put it in').toEqual([]);
  });
  it('a message with files is edited only where the host draft keeps its files', () => {
    const files = [{ id: 'f1', kind: 'text' as const, name: 'log.txt' }];
    const withFiles = () => source(snap([user(['takeBack'], { files })])).src;
    const a = render(<SessionView source={withFiles()} size="l" onTakeBack={() => undefined} />);
    expect(labels(), 'the AI tab\'s composer has no attachments').toEqual([]);
    a.unmount();
    render(<SessionView source={withFiles()} size="l" onTakeBack={() => undefined} takeBackFiles />);
    expect(labels()).toEqual(['Edit']);
  });
  it('a refusal puts nothing in the composer', () => {
    const s = source(snap([user(['takeBack'])]));
    (s.src as unknown as { takeBack: unknown }).takeBack = vi.fn(() => ({ k: 'refused', code: 'not_editable' }));
    const put = vi.fn();
    render(<SessionView source={s.src} size="l" onTakeBack={put} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(put).not.toHaveBeenCalled();
  });
  it('a draft that cannot take the message\'s files says so, puts nothing in the composer, and clears the note on the next try that works', () => {
    const files = [{ id: 'f1', kind: 'text' as const, name: 'log.txt' }];
    const s = source(snap([user(['takeBack'], { files })]));
    const tb = vi.fn()
      .mockReturnValueOnce({ k: 'refused', code: 'draft_full' })
      .mockReturnValueOnce({ k: 'text', text: 'Fix it', files: 1 });
    (s.src as unknown as { takeBack: unknown }).takeBack = tb;
    const put = vi.fn();
    render(<SessionView source={s.src} size="l" onTakeBack={put} takeBackFiles />);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('status').textContent).toMatch(/draft is full/i);
    expect(put, 'the message is not half-moved into the composer').not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(put).toHaveBeenCalledWith('Fix it');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
