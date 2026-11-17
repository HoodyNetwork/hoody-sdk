// Vitest at the part: the shared agent sign-in in its own-button shape (place "own", no send: Schedules). Real: the hook and the
// box. Replaced in '@core': the sign-in (signInAgent), Check again (checkAgentLogin), the session check (signInOffered) and the
// context (a fixed computer and account). Pinned: "signed in" shows only while the page's own read shows the agent signed in; a
// later signed-out page takes it back to the agent's word with Check again, never the sign-in button again (C9).
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Core from '@core';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentSignIn, useAgentSignIn, type SignInComp } from './AgentSignIn';
import strings from './agentSignIn.strings.en.json';

const w = vi.hoisted(() => ({
  calls: [] as string[],
  ready: true,
  setComp: (_: SignInComp) => {},
}));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const target = () => ({ project: { id: 'p1' }, container: { id: 'c1' } });
  return {
    ...real,
    capture: () => ({ account: 'acct1', target: target(), gen: 1 }),
    useCore: () => ({ target: target(), account: 'acct1' }),
    signInOffered: () => true,
    agentBaseFor: () => 'https://agent.example/',
    signInAgent: async () => { w.calls.push('signIn'); return { kind: 'signedIn' }; },
    checkAgentLogin: async () => { w.calls.push('check'); return 'ready'; },
    watchComputer: () => () => {},
  };
});

const signedOut: SignInComp = { id: 'c1', name: 'atlas', agent: { writer: false, writerWhy: 'login', signIn: 'offer' } };
const signedIn: SignInComp = { id: 'c1', name: 'atlas', agent: { writer: true } };

function Harness() {
  const [comp, setComp] = useState(signedOut);
  w.setComp = setComp;
  const reread = async () => { w.calls.push('reread'); if (w.ready) setTimeout(() => act(() => setComp(signedIn)), 0); return w.ready; };
  const st = useAgentSignIn(comp, null, reread);
  return <AgentSignIn comp={comp} state={st} place="own" need="Its schedules can't be shown." />;
}

beforeEach(() => { w.calls = []; w.ready = true; });

describe('the own-button sign-in (no send)', () => {
  it('signed in once the page shows it; a later signed-out page takes it back to Check again, never a second sign-in', async () => {
    render(<Harness />);
    expect(screen.getByText("Its schedules can't be shown.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['signin.press'] }));
    await waitFor(() => expect(screen.getByTestId('agent-signin')).toHaveTextContent(/is signed in to your account/));
    expect(screen.queryByRole('button', { name: strings['signin.check'] })).toBeNull();
    act(() => w.setComp(signedOut));
    expect(await screen.findByRole('button', { name: strings['signin.check'] })).toBeInTheDocument();
    expect(screen.getByTestId('agent-signin')).not.toHaveTextContent(/is signed in to your account/);
    expect(screen.queryByRole('button', { name: strings['signin.press'] })).toBeNull();
    expect(w.calls).toEqual(['signIn', 'reread']);
  });

  it('Check again that reads ready while the page still does not: the agent\'s word, never "signed in"', async () => {
    w.ready = false;
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: strings['signin.press'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['signin.check'] }));
    await waitFor(() => expect(w.calls).toEqual(['signIn', 'reread', 'check', 'reread']));
    expect(screen.getByTestId('agent-signin')).not.toHaveTextContent(/is signed in to your account/);
    expect(screen.getByRole('button', { name: strings['signin.check'] })).toBeInTheDocument();
  });
});
