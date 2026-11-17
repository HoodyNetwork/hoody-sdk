// ApprovalSection + useApproval: the exact Default/Strict/locked words; the mode disabled with
// the reason while the chat is busy or another change is held; a 409 session_busy said and never resent; Auto-approve
// hidden under Strict and behind a red confirm naming the computer; its 409s mapped to the one sentence; a raced
// revision read again; and C9 (Saved only when the read-back shows it; a lost answer offers Check again, which sends
// nothing).
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CoreMod from '@core';
import type { Target } from '@core';
import { ApprovalSection } from './ApprovalSection';
import { forgetApprovalAttempts, takeApprovalAttempt, useApproval } from './useApproval';
import strings from './ApprovalSection.strings.en.json';
import type { FaqItem } from '../layouts/Faq';

type Settled = { ok: true; body: unknown } | { ok: false; err: { kind: 'failed' | 'pending' | 'stale'; code: string; status: number; retryAfter: null; details: Record<string, never> } };
const W = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  // The next change's answer: ok, a refusal (code, status) or lost.
  answer: { kind: 'ok' as 'ok' | 'fail' | 'lost', code: '', status: 409 },
  lands: true,
  sent: [] as string[],
  reads: 0,
  failReads: 0,
  // Other conversations' approvals by id (default: W.row), and reads held until released.
  rows: {} as Record<string, Record<string, unknown>>,
  holdReads: false,
  held: [] as Array<() => void>,
  // Changes wait for their answer until released, and the approvals reads by conversation id.
  holdChanges: false,
  changeHeld: [] as Array<() => void>,
  readIds: [] as string[],
}));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  const err = (kind: 'failed' | 'pending', code: string, status: number): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
  const change = (k: string, v: unknown, apply: () => void): Promise<Settled> => {
    W.sent.push(`${k}=${String(v)}`);
    const a = W.answer;
    const r: Settled = a.kind === 'ok' ? { ok: true, body: { status: 'ok' } } : a.kind === 'fail' ? err('failed', a.code, a.status) : err('pending', '', 0);
    const land = () => {
      if (a.kind !== 'fail' && W.lands) apply();
    };
    if (!W.holdChanges) {
      land();
      return Promise.resolve(r);
    }
    return new Promise<Settled>((resolve) => W.changeHeld.push(() => {
      land();
      resolve(r);
    }));
  };
  const fake = (realm?: string): CoreMod.agent.ApprovalApi => ({
    approval: (id) => {
      W.reads += 1;
      W.readIds.push(realm ? `${realm}:${id}` : id);
      if (W.failReads > 0) {
        W.failReads -= 1;
        return Promise.resolve(err('failed', 'boom', 500));
      }
      const r: Settled = { ok: true, body: { ...(W.rows[id] ?? W.row) } };
      if (!W.holdReads) return Promise.resolve(r);
      return new Promise<Settled>((resolve) => W.held.push(() => resolve(r)));
    },
    setMode: (_id, m, rev) => change('mode', `${m}@${rev}`, () => {
      W.row.mode = m;
      W.row.revision = (W.row.revision as number) + 1;
    }),
    setYolo: (_id, on) => change('yolo', on, () => {
      W.row.yolo = on;
    }),
  });
  return { ...real, agent: { ...real.agent, approvalApi: (_t?: unknown, realm?: string) => fake(realm) } };
});

const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'srv' } } as unknown as Target;
const S = strings as Record<string, string>;

function Harness(p: { busy?: boolean | null; waiting?: boolean; session?: string; realm?: string; strictFaq?: FaqItem }) {
  const data = useApproval(TARGET, p.session ?? 's1', p.realm ?? 'global');
  return (
    <>
      <ApprovalSection data={data} computer="atlas" busy={p.busy === undefined ? false : p.busy} waiting={p.waiting === true} {...(p.strictFaq ? { strictFaq: p.strictFaq } : {})} />
      <button type="button" data-testid="reread" hidden onClick={data.retry} />
    </>
  );
}

const radio = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}`) });
const yolo = () => screen.queryByRole('switch', { name: S['ap.yolo'] });

beforeEach(() => {
  W.row = { mode: 'default', locked: false, revision: 3, yolo: false };
  W.answer = { kind: 'ok', code: '', status: 409 };
  W.lands = true;
  W.sent = [];
  W.reads = 0;
  W.failReads = 0;
  W.rows = {};
  W.holdReads = false;
  W.held = [];
  W.holdChanges = false;
  W.changeHeld = [];
  W.readIds = [];
  forgetApprovalAttempts();
});

describe('ApprovalSection', () => {
  it('Default carries the design words; Strict is one sentence (the full list moved to the AI questions); the read mode is the one chosen', async () => {
    render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    expect(screen.getByText(S['ap.defaultDesc']!)).toBeInTheDocument();
    expect(screen.getByText(S['ap.strictShort']!)).toBeInTheDocument();
    // It names only what asks; memory saves and TODO edits have effects but never ask (the Why says so).
    expect(S['ap.strictShort']).toBe('Asks before commands, file changes, changing web requests, computer actions, images and notifications; helpers, your hooks and MCP servers stay off.');
    expect(S['ap.strictDesc']).toBeUndefined();
    expect(S['ap.defaultDesc']).toBe('Asks when an action needs you. What you allow in this chat, your rules and your hooks can let actions run without asking.');
    // Without a page question (the kit gallery) there is no Why.
    expect(screen.queryByRole('button', { name: S['ap.why.q'] })).toBeNull();
  });

  it('the host\'s Strict question rides a closed Why under the mode; its answer says what never asks, its link opens the full list', async () => {
    const user = userEvent.setup();
    const item: FaqItem = { id: 'faq-ai-strict', q: 'What does Strict ask about?', a: 'The whole Strict list.' };
    // The Why's link is a FAQ link: it reads the router, as it does on the AI page that passes the question.
    const router = createRouter({
      routeTree: createRootRoute({ component: () => <Harness strictFaq={item} /> }),
      history: createMemoryHistory({ initialEntries: ['/ai'] }),
    });
    await act(async () => {
      render(<RouterProvider router={router} />);
      await router.load();
    });
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    const why = screen.getByRole('button', { name: S['ap.why.q'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(S['ap.why.a']!)).not.toBeVisible();
    expect(screen.queryByRole('link', { name: S['ap.why.more'] })).toBeNull();
    await user.click(why);
    expect(screen.getByText(S['ap.why.a']!)).toBeVisible();
    expect(screen.getByRole('link', { name: S['ap.why.more'] })).toBeInTheDocument();
  });

  it('choosing Strict sends one PUT with the read revision; Saved only once the read-back shows it; Auto-approve then hides', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    expect(yolo()).toBeInTheDocument();
    await user.click(radio(S['ap.strict']!));
    await waitFor(() => expect(screen.getByText(S['ap.saved']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['mode=always@3']);
    expect(radio(S['ap.strict']!)).toBeChecked();
    expect(yolo()).toBeNull();
  });

  it('while the chat works or waits, the mode is disabled with the reason; unknown busy is disabled too', async () => {
    const { rerender } = render(<Harness busy />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    expect(radio(S['ap.strict']!)).toBeDisabled();
    expect(screen.getByText(S['ap.busy']!)).toBeInTheDocument();
    rerender(<Harness busy={null} />);
    expect(radio(S['ap.strict']!)).toBeDisabled();
    rerender(<Harness waiting />);
    expect(radio(S['ap.strict']!)).toBeDisabled();
    expect(screen.getByText(S['ap.wait']!)).toBeInTheDocument();
    rerender(<Harness />);
    expect(radio(S['ap.strict']!)).not.toBeDisabled();
  });

  it('a 409 session_busy changed nothing, says why and is never resent', async () => {
    const user = userEvent.setup();
    W.answer = { kind: 'fail', code: 'session_busy', status: 409 };
    render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await user.click(radio(S['ap.strict']!));
    await waitFor(() => expect(screen.getByText(S['ap.busy']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['mode=always@3']);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    expect(screen.queryByText(S['ap.saved']!)).toBeNull();
    expect(W.sent).toHaveLength(1);
  });

  it('a locked policy shows its mode read-only with the policy words; Auto-approve shows disabled with the one sentence', async () => {
    W.row = { mode: 'default', locked: true, revision: 5, yolo: false };
    render(<Harness />);
    await waitFor(() => expect(screen.getByText(S['ap.locked']!)).toBeInTheDocument());
    expect(radio(S['ap.default']!)).toBeChecked();
    expect(radio(S['ap.strict']!)).toBeDisabled();
    expect(yolo()).toBeDisabled();
    expect(screen.getByText(S['ap.yoloRefused']!)).toBeInTheDocument();
  });

  it('a locked Strict policy: Strict chosen, read-only, no Auto-approve', async () => {
    W.row = { mode: 'always', locked: true, revision: 5 };
    render(<Harness />);
    await waitFor(() => expect(radio(S['ap.strict']!)).toBeChecked());
    expect(radio(S['ap.default']!)).toBeDisabled();
    expect(yolo()).toBeNull();
  });

  it('Auto-approve on asks first in a red confirm naming the computer; Cancel sends nothing; Turn on sends once', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(yolo()).toBeInTheDocument());
    await user.click(yolo()!);
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent('Allow everything in this chat?');
    expect(dlg).toHaveTextContent('The Agent on atlas will run every action in this chat without asking you first, as you: commands, file changes and deletions, and some actions normally kept for a person. Deny rules still win. Questions, hooks that ask and connected tool servers that confirm each call still wait for you.');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(W.sent).toEqual([]);
    await user.click(yolo()!);
    await user.click(await screen.findByRole('button', { name: S['ap.yoloConfirmGo'] }));
    await waitFor(() => expect(yolo()).toBeChecked());
    expect(W.sent).toEqual(['yolo=true']);
    await waitFor(() => expect(screen.getByText(S['ap.saved']!)).toBeInTheDocument());
  });

  it('Auto-approve off is sent without a confirm', async () => {
    const user = userEvent.setup();
    W.row.yolo = true;
    render(<Harness />);
    await waitFor(() => expect(yolo()).toBeChecked());
    await user.click(yolo()!);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(yolo()).not.toBeChecked());
    expect(W.sent).toEqual(['yolo=false']);
  });

  it.each(['approval_policy_locked', 'approval_policy_active'])('Auto-approve refused %s: the one sentence, nothing changed, never resent', async (code) => {
    const user = userEvent.setup();
    W.answer = { kind: 'fail', code, status: 409 };
    render(<Harness />);
    await waitFor(() => expect(yolo()).toBeInTheDocument());
    await user.click(yolo()!);
    await user.click(await screen.findByRole('button', { name: S['ap.yoloConfirmGo'] }));
    await waitFor(() => expect(screen.getByText(S['ap.yoloRefused']!)).toBeInTheDocument());
    expect(yolo()).not.toBeChecked();
    expect(W.sent).toEqual(['yolo=true']);
  });

  it('a raced revision (412): nothing changed, said, and read again so the next choice carries the new revision', async () => {
    const user = userEvent.setup();
    W.answer = { kind: 'fail', code: 'precondition_failed', status: 412 };
    render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    W.row.revision = 4;
    await user.click(radio(S['ap.strict']!));
    await waitFor(() => expect(screen.getByText(S['ap.conflict']!)).toBeInTheDocument());
    W.answer = { kind: 'ok', code: '', status: 409 };
    await waitFor(() => expect(radio(S['ap.strict']!)).not.toBeDisabled());
    await user.click(radio(S['ap.strict']!));
    await waitFor(() => expect(screen.getByText(S['ap.saved']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['mode=always@3', 'mode=always@4']);
  });

  it('Strict that this chat cannot satisfy says why', async () => {
    const user = userEvent.setup();
    W.answer = { kind: 'fail', code: 'approval_policy_unsatisfiable', status: 409 };
    render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await user.click(radio(S['ap.strict']!));
    await waitFor(() => expect(screen.getByText(S['ap.unsatisfiable']!)).toBeInTheDocument());
  });

  it('C9: a lost answer is "may have gone through", the controls wait, and Check again reads without sending', async () => {
    const user = userEvent.setup();
    W.answer = { kind: 'lost', code: '', status: 0 };
    W.lands = false;
    render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await user.click(radio(S['ap.strict']!));
    const check = await screen.findByRole('button', { name: /check again/i });
    expect(screen.queryByText(S['ap.saved']!)).toBeNull();
    expect(radio(S['ap.strict']!)).toBeDisabled();
    expect(yolo()).toBeDisabled();
    W.row.mode = 'always';
    W.row.revision = 4;
    const before = W.reads;
    await user.click(check);
    await waitFor(() => expect(screen.getByText(S['ap.saved']!)).toBeInTheDocument());
    expect(W.reads).toBe(before + 1);
    expect(W.sent).toEqual(['mode=always@3']);
  });

  it('no revision read: the mode is never sent and the reason is said', async () => {
    W.row = { mode: 'default', locked: false, yolo: false };
    render(<Harness />);
    await waitFor(() => expect(screen.getByText(S['ap.noRevision']!)).toBeInTheDocument());
    expect(radio(S['ap.strict']!)).toBeDisabled();
  });

  it('a failed read shows the error with Retry, which reads again', async () => {
    const user = userEvent.setup();
    W.failReads = 1;
    render(<Harness />);
    await screen.findByText(S['ap.readFailed']!);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await act(async () => {});
    expect(W.sent).toEqual([]);
  });

  it('the Auto-approve confirm is the red one (danger mark), not a plain confirm', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(yolo()).toBeInTheDocument());
    await user.click(yolo()!);
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg.querySelector('[class*="mark"]')).not.toBeNull();
  });

  it('another conversation: an answer for the one before is dropped, whatever order the answers come in', async () => {
    W.holdReads = true;
    W.rows = { s1: { mode: 'always', locked: false, revision: 1 }, s2: { mode: 'default', locked: false, revision: 7, yolo: false } };
    const { rerender } = render(<Harness session="s1" />);
    await waitFor(() => expect(W.held).toHaveLength(1));
    rerender(<Harness session="s2" />);
    await waitFor(() => expect(W.held).toHaveLength(2));
    await act(async () => W.held[1]!());
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await act(async () => W.held[0]!());
    await act(async () => {});
    expect(radio(S['ap.default']!)).toBeChecked();
    expect(yolo()).toBeInTheDocument();
  });
});

// An attempt that can end unknown binds to its target (the computer and conversation captured
// at send), not to the render or the dialog.
describe('ApprovalSection: attempts bind to their target', () => {
  const lose = () => {
    W.answer = { kind: 'lost', code: '', status: 0 };
    W.lands = false;
  };

  it('an unknown change survives another conversation and back: still unknown, held, Check again, never resent', async () => {
    const user = userEvent.setup();
    lose();
    W.rows = { s2: { mode: 'default', locked: false, revision: 9, yolo: false } };
    const { rerender } = render(<Harness session="s1" />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await user.click(radio(S['ap.strict']!));
    await screen.findByRole('button', { name: /check again/i });
    rerender(<Harness session="s2" />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /check again/i })).toBeNull());
    rerender(<Harness session="s1" />);
    await screen.findByRole('button', { name: /check again/i });
    expect(radio(S['ap.strict']!)).toBeDisabled();
    expect(W.sent).toEqual(['mode=always@3']);
  });

  it('an unknown change survives unmount and remount', async () => {
    const user = userEvent.setup();
    lose();
    const first = render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await user.click(radio(S['ap.strict']!));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
    render(<Harness />);
    await screen.findByRole('button', { name: /check again/i });
    expect(radio(S['ap.strict']!)).toBeDisabled();
    W.row.mode = 'always';
    W.row.revision = 4;
    await user.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(screen.getByText(S['ap.saved']!)).toBeInTheDocument());
    expect(W.sent).toEqual(['mode=always@3']);
  });

  it('an answer that arrives after a move to another conversation still settles its own: lost → unknown there; Check again reads that conversation', async () => {
    const user = userEvent.setup();
    lose();
    W.holdChanges = true;
    W.rows = { s2: { mode: 'default', locked: false, revision: 9, yolo: false } };
    const { rerender } = render(<Harness session="s1" />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await user.click(radio(S['ap.strict']!));
    await waitFor(() => expect(W.changeHeld).toHaveLength(1));
    rerender(<Harness session="s2" />);
    await waitFor(() => expect(radio(S['ap.default']!)).not.toBeDisabled());
    await act(async () => W.changeHeld[0]!());
    expect(screen.queryByRole('button', { name: /check again/i })).toBeNull();
    rerender(<Harness session="s1" />);
    const check = await screen.findByRole('button', { name: /check again/i });
    W.readIds = [];
    await user.click(check);
    await act(async () => {});
    expect(W.readIds).toEqual(['global:s1']);
    expect(W.sent).toEqual(['mode=always@3']);
  });

  it('the Auto-approve confirm belongs to the conversation that opened it: another conversation closes it', async () => {
    const user = userEvent.setup();
    W.rows = { s2: { mode: 'default', locked: false, revision: 9, yolo: false } };
    const { rerender } = render(<Harness session="s1" />);
    await waitFor(() => expect(yolo()).toBeInTheDocument());
    await user.click(yolo()!);
    await screen.findByRole('alertdialog');
    rerender(<Harness session="s2" />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(W.sent).toEqual([]);
  });

  it('the confirm closes when Auto-approve stops being on offer: a read that finds the policy locked', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await waitFor(() => expect(yolo()).toBeInTheDocument());
    await user.click(yolo()!);
    await screen.findByRole('alertdialog');
    W.row = { ...W.row, locked: true };
    fireEvent.click(screen.getByTestId('reread'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(W.sent).toEqual([]);
  });

  it('another change of the tab held meanwhile: the open confirm stays but cannot send', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await waitFor(() => expect(yolo()).toBeInTheDocument());
    await user.click(yolo()!);
    await screen.findByRole('alertdialog');
    rerender(<Harness waiting />);
    expect(screen.getByRole('button', { name: S['ap.yoloConfirmGo'] })).toBeDisabled();
    await user.keyboard('{Enter}');
    await act(async () => {});
    expect(W.sent).toEqual([]);
  });

  it('the hook itself refuses a second change on a target whose change is unknown (not only the disabled controls)', async () => {
    lose();
    const { result } = renderHook(() => useApproval(TARGET, 's1', 'global'));
    await waitFor(() => expect(result.current.approval).not.toBeNull());
    act(() => result.current.save({ field: 'mode', value: 'always' }));
    await waitFor(() => expect(result.current.change?.kind).toBe('pending'));
    act(() => result.current.save({ field: 'yolo', value: true }));
    await act(async () => {});
    expect(W.sent).toEqual(['mode=always@3']);
  });
});

// recovery is never hidden, attempts carry the realm, a failed refresh authorizes nothing.
describe('ApprovalSection: recovery, realm and refresh', () => {
  const lose = () => {
    W.answer = { kind: 'lost', code: '', status: 0 };
    W.lands = false;
  };

  it('an unknown Auto-approve change whose read-back finds Strict keeps its Check again (Strict hides the switch, not the outcome)', async () => {
    const user = userEvent.setup();
    lose();
    W.holdChanges = true;
    render(<Harness />);
    await waitFor(() => expect(yolo()).toBeInTheDocument());
    await user.click(yolo()!);
    await user.click(await screen.findByRole('button', { name: S['ap.yoloConfirmGo'] }));
    await waitFor(() => expect(W.changeHeld).toHaveLength(1));
    W.row = { mode: 'always', locked: false, revision: 4, yolo: false };
    await act(async () => W.changeHeld[0]!());
    await screen.findByRole('button', { name: /check again/i });
    expect(yolo()).toBeNull();
    expect(W.sent).toEqual(['yolo=true']);
  });

  it('an unknown change stays checkable when the approvals cannot be read on remount', async () => {
    const user = userEvent.setup();
    lose();
    const first = render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await user.click(radio(S['ap.strict']!));
    await screen.findByRole('button', { name: /check again/i });
    first.unmount();
    W.failReads = 1;
    render(<Harness />);
    await screen.findByText(S['ap.readFailed']!);
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  it('the attempt carries its realm: the same conversation id in another realm is another target, and Check again reads the captured realm', async () => {
    const user = userEvent.setup();
    lose();
    const { rerender } = render(<Harness realm="aaaaaaaaaaaaaaaaaaaaaaaa" />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    await user.click(radio(S['ap.strict']!));
    await screen.findByRole('button', { name: /check again/i });
    rerender(<Harness realm="global" />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /check again/i })).toBeNull());
    rerender(<Harness realm="aaaaaaaaaaaaaaaaaaaaaaaa" />);
    const check = await screen.findByRole('button', { name: /check again/i });
    W.readIds = [];
    await user.click(check);
    await act(async () => {});
    expect(W.readIds).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa:s1']);
  });

  it('a refused change whose fresh read is malformed leaves no stale approvals to choose from', async () => {
    const user = userEvent.setup();
    W.answer = { kind: 'fail', code: 'precondition_failed', status: 412 };
    render(<Harness />);
    await waitFor(() => expect(radio(S['ap.default']!)).toBeChecked());
    W.row = { mode: 'always', locked: 'no', revision: 4 };
    await user.click(radio(S['ap.strict']!));
    await waitFor(() => expect(screen.getByText(S['ap.readFailed']!)).toBeInTheDocument());
    expect(screen.queryByRole('radio', { name: /^Ask every time/ })).toBeNull();
    expect(W.sent).toEqual(['mode=always@3']);
  });
});


// :2199 (b): an ordinary read is fenced by its conversation's change count, as useLiveSession's: one that began before a
// change of that conversation (here the ask dock's switch, through takeApprovalAttempt) is read again, never shown.
describe('useApproval: a read that predates a change is not shown', () => {
  it('the ask dock changes Auto-approve while the first read is out: that read is dropped and the approvals are read again', async () => {
    W.holdReads = true;
    const { result } = renderHook(() => useApproval(TARGET, 's1', 'global'));
    await waitFor(() => expect(W.held.length).toBe(1));
    // The dock's change lands and is answered while the read (of the approvals before it) is still out.
    const att = takeApprovalAttempt(TARGET, 'global', 's1', { field: 'yolo', value: true })!;
    W.row.yolo = true;
    att.settle();
    W.holdReads = false;
    await act(async () => {
      for (const f of W.held.splice(0)) f();
    });
    await waitFor(() => expect(result.current.approval?.yolo).toBe(true));
    expect(W.reads).toBe(2);
    expect(W.sent).toEqual([]);
  });

  it('a read with no change meanwhile is shown at once (one read)', async () => {
    const { result } = renderHook(() => useApproval(TARGET, 's1', 'global'));
    await waitFor(() => expect(result.current.approval?.yolo).toBe(false));
    await act(async () => {});
    expect(W.reads).toBe(1);
  });
});
