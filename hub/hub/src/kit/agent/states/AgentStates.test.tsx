// AgentState: one test per state row with an action. Each row shows its words, offers
// exactly its own actions, and each press calls its own callback once and no other; an unknown outcome offers only a
// read or Stop tracking. A chip that names the computer shows only its verb; the full words are its accessible name
// (never on the chip). Rows another component draws are not here: paused and stop all's result, a question, a
// helper's approval and a vanished gate's unknown decision (GateCard), the memory states.
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AgentState, type AgentStateView } from './AgentStates';

type Row = { name: string; make: (cb: Record<string, () => void>) => AgentStateView; words: string | RegExp; actions: [label: string, cb: string, name?: string][] };

const T = new Date(2026, 9, 29, 14, 5, 9).getTime();

const ROWS: Row[] = [
  { name: 'first use', make: (c) => ({ kind: 'firstUse', onNewChat: c.a! }), words: 'Start your first chat', actions: [['New chat', 'a']] },
  { name: 'computer stopped', make: (c) => ({ kind: 'stopped', computer: 'atlas', onStart: c.a!, onOpenComputers: c.b! }), words: 'atlas is stopped', actions: [['Start', 'a', 'Start atlas'], ['Open Computers', 'b']] },
  { name: 'unreachable', make: (c) => ({ kind: 'unreachable', computer: 'atlas', onRetry: c.a!, onOpenComputer: c.b! }), words: 'Cannot reach the agent on atlas; chats are kept', actions: [['Try again', 'a'], ['Open', 'b', 'Open atlas']] },
  { name: 'reconnecting', make: (c) => ({ kind: 'reconnecting', until: T, onRetry: c.a! }), words: /^Reconnecting… showing what arrived until 0?2:05:09/, actions: [['Retry now', 'a']] },
  { name: 'kept waiting', make: (c) => ({ kind: 'keptWaiting', onShow: c.a! }), words: 'Kept open while the Hub is open; cancelled about 5 minutes after the last hold', actions: [['Show', 'a']] },
  { name: 'unknown · send', make: (c) => ({ kind: 'sendUnknown', onCheck: c.a!, onDismiss: c.b! }), words: 'This may have gone through. We read what happened and never send it again', actions: [['Check again', 'a'], ['Stop tracking', 'b']] },
  { name: 'not sent, text still in the page', make: (c) => ({ kind: 'notSent', onSendAgain: c.a! }), words: 'Not sent; nothing ran. Your text is still in this page', actions: [['Send again', 'a']] },
  { name: 'unknown · new chat', make: (c) => ({ kind: 'newChatUnknown', computer: 'atlas', onCheck: c.a!, onDismiss: c.b! }), words: 'A chat may have been started on atlas without your first message; your message was not sent', actions: [['Check again', 'a'], ['Stop tracking', 'b']] },
  { name: 'paused · workflow detail', make: (c) => ({ kind: 'workflowPaused', computer: 'atlas', onResume: c.a! }), words: 'This cannot be read while agents on atlas are paused', actions: [['Resume', 'a']] },
  { name: 'GitHub · partly done (branch check available)', make: (c) => ({ kind: 'githubPartly', fetchedAt: T, recover: { checkGitHub: c.a! } }), words: /^Commit created \(the agent confirmed\); push outcome unknown\. The local view is from 0?2:05/, actions: [['Check on GitHub', 'a']] },
  { name: 'GitHub · partly done (no branch check)', make: (c) => ({ kind: 'githubPartly', fetchedAt: T, recover: { openBranch: c.a! } }), words: /push outcome unknown/, actions: [['Open the branch on GitHub', 'a']] },
  { name: 'GitHub · commit unknown', make: (c) => ({ kind: 'githubUnknown', onCheckHistory: c.a!, onCheckGitHub: c.b! }), words: 'Commit and push: outcome unknown', actions: [["Check the folder's history", 'a'], ['Check on GitHub', 'b']] },
  { name: 'issue may exist', make: (c) => ({ kind: 'issueMaybe', onCheckIssues: c.a! }), words: 'This issue may have been created. It is never sent again', actions: [['Check issues', 'a']] },
  { name: 'compacted', make: (c) => ({ kind: 'compacted', before: 182_000, after: 14_000, onOpenSummary: c.a! }), words: 'Earlier messages summarised · 182K → 14K', actions: [['Open summary', 'a']] },
  { name: 'sign-in', make: (c) => ({ kind: 'signIn', computer: 'atlas', onSignIn: c.a! }), words: 'Sign in to use the agent on atlas', actions: [['Sign in', 'a']] },
  { name: 'no model', make: (c) => ({ kind: 'noModel', onSetUp: c.a! }), words: 'No AI model is ready yet', actions: [['Set up models', 'a']] },
  { name: 'stream budget', make: (c) => ({ kind: 'streamBudget', onResumeLive: c.a! }), words: 'Live updates paused to save connections', actions: [['Resume live', 'a']] },
  { name: 'closed', make: (c) => ({ kind: 'closed', onReopen: c.a! }), words: 'This chat is closed', actions: [['Reopen', 'a']] },
  { name: 'conflict (revision)', make: (c) => ({ kind: 'conflict', computer: 'atlas', onCompare: c.a!, onReload: c.b! }), words: 'Changed on atlas since you opened it', actions: [['Compare', 'a'], ['Reload', 'b']] },
  { name: 'held elsewhere, hold run out', make: (c) => ({ kind: 'heldElsewhere', canTakeOver: true, onTakeOver: c.a! }), words: 'Approvals for this chat are held by another window', actions: [['Take over', 'a']] },
];

describe('AgentState rows with an action', () => {
  it.each(ROWS)('$name: shows its words and only its actions; each press calls its own callback once and no other', (row) => {
    const cb = { a: vi.fn(), b: vi.fn() };
    render(<AgentState state={row.make(cb)} />);
    expect(screen.getByText(row.words)).toBeVisible();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(row.actions.map(([label]) => label));
    for (const [label, key, name] of row.actions) {
      cb.a.mockClear();
      cb.b.mockClear();
      fireEvent.click(screen.getByRole('button', { name: name ?? label }));
      for (const k of ['a', 'b'] as const) expect(cb[k], `${label} -> ${k}`).toHaveBeenCalledTimes(k === key ? 1 : 0);
    }
  });
});

describe('AgentState rows without a button', () => {
  it.each<[string, AgentStateView, string]>([
    ['starting', { kind: 'starting', computer: 'atlas' }, 'atlas is starting…'],
    ['not sent, text gone', { kind: 'notSent' }, 'Not sent; nothing ran. Write it again'],
    ['no chat made', { kind: 'noChatMade' }, 'No chat was made; your message was not sent. Write it again'],
  ])('%s: words only, nothing to press (nothing is ever sent again from it)', (_n, state, words) => {
    render(<AgentState state={state} />);
    expect(screen.getByText(words)).toBeVisible();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});

describe('AgentState GitHub · partly done', () => {
  it('takes exactly one way back: both or neither does not type-check (tsc), and the one given is the only button', () => {
    const one = vi.fn();
    // @ts-expect-error: both ways back at once
    const both: AgentStateView = { kind: 'githubPartly', fetchedAt: T, recover: { checkGitHub: one, openBranch: one } };
    // @ts-expect-error: no way back
    const none: AgentStateView = { kind: 'githubPartly', fetchedAt: T, recover: {} };
    expect([both.kind, none.kind]).toEqual(['githubPartly', 'githubPartly']);
    render(<AgentState state={{ kind: 'githubPartly', fetchedAt: T, recover: { openBranch: one } }} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Open the branch on GitHub']);
  });
});

describe('AgentState held elsewhere', () => {
  it('before the other window\'s hold runs out, Take over is shown but off, and the words say when it turns on', () => {
    const onTakeOver = vi.fn();
    render(<AgentState state={{ kind: 'heldElsewhere', canTakeOver: false, onTakeOver }} />);
    expect(screen.getByText('Approvals for this chat are held by another window. You can take over when its hold runs out')).toBeVisible();
    const b = screen.getByRole('button', { name: 'Take over' });
    expect(b).toBeDisabled();
    fireEvent.click(b);
    expect(onTakeOver).not.toHaveBeenCalled();
  });
});

describe('AgentState busy reads', () => {
  it.each<[string, AgentStateView]>([
    ['unknown · send', { kind: 'sendUnknown', onCheck: vi.fn(), onDismiss: vi.fn(), checking: true }],
    ['unknown · new chat', { kind: 'newChatUnknown', computer: 'atlas', onCheck: vi.fn(), onDismiss: vi.fn(), checking: true }],
  ])('%s: while a check is running, Check again is off, so one press makes one read', (_n, state) => {
    render(<AgentState state={state} />);
    expect(screen.getByRole('button', { name: /Check again/ }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('AgentState refused (typed)', () => {
  // The words come from kit/states errorWords for the rejection's code, else its status; the Band adds a Details button
  // after the supplied actions and nothing else.
  const refusal = (error: unknown, actions?: ReactNode) => {
    render(<AgentState state={{ kind: 'refused', error, actions }} />);
    return screen.getByRole('alert');
  };
  const buttons = (alert: HTMLElement) => within(alert).getAllByRole('button').map((b) => b.textContent);
  it.each([
    ['a conflict by its code', { status: 409, code: 'CONFLICT' }, 'It changed in the meantime. Check the current state, then try again.'],
    ['a conflict by its status', { status: 412, code: null }, 'It changed in the meantime. Check the current state, then try again.'],
    ['a missing item by its code', { status: 404, code: 'NOT_FOUND' }, 'It no longer exists, or it was moved.'],
    ['the code before the status', { status: 500, code: 'NOT_FOUND' }, 'It no longer exists, or it was moved.'],
    ['too large by its code', { status: 400, code: 'PAYLOAD_TOO_LARGE' }, 'That is too large to send.'],
  ])('%s shows the agent\'s words for it', (_n, error, words) => {
    const alert = refusal(error);
    expect(within(alert).getByText(words)).toBeTruthy();
    expect(alert).not.toHaveTextContent(/Fix it/);
  });
  it('lists exactly the supplied actions, then Details, and each press calls only its own callback', () => {
    const onFix = vi.fn();
    const onOther = vi.fn();
    const alert = refusal(
      { status: 409, code: 'CONFLICT' },
      <>
        <button type="button" onClick={onFix}>Fix it</button>
        <button type="button" onClick={onOther}>Leave it</button>
      </>,
    );
    expect(buttons(alert)).toEqual(['Fix it', 'Leave it', 'Details']);
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }));
    expect(onFix).toHaveBeenCalledTimes(1);
    expect(onOther).not.toHaveBeenCalled();
  });
  it('without actions offers only Details', () => {
    expect(buttons(refusal({ status: 409, code: 'CONFLICT' }))).toEqual(['Details']);
  });
});
