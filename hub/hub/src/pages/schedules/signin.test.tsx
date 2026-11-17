// Vitest at the page: a signed-out agent's loops. The page shows the shared sign-in (app/AgentSignIn, own button) in
// place of its "signed out" line, and signs the agent in through core's signInAgent, never by sending the person to Bots. Real: the
// page, the shared hook and box, the page's fixtures. Replaced in '@core': the sign-in (signInAgent), Check again (checkAgentLogin)
// and whether this session may sign in (signInOffered); in './data': what the page's read answers again after the press.
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import type * as Core from '@core';
import type * as Data from './data';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import shared from '@app/agentSignIn.strings.en.json';
import page from './page';
import strings from './strings.en.json';
import type { RawSchedules } from './logic';

const w = vi.hoisted(() => ({
  offered: true,
  calls: [] as string[],
  signIn: (async () => ({ kind: 'signedIn' })) as () => Promise<unknown>,
  check: (async () => 'login') as () => Promise<unknown>,
  /** The agent's loops answer on the page's next read (signed in for the page). */
  answersAfter: true,
  /** The page's read has answered since the press. */
  answered: false,
  /** A later read of the loops (after they answered): another state, e.g. failed or private. */
  later: null as null | string,
  ver: 0,
  subs: new Set<() => void>(),
}));
/** The page reads its loops again and gets `state` (TanStack Query notifies its views). */
const laterRead = (state: string) => { w.later = state; w.ver++; for (const f of [...w.subs]) f(); };

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return {
    ...real,
    signInOffered: () => w.offered,
    signInAgent: async () => { w.calls.push('signIn'); const r = await w.signIn(); if ((r as { kind: string }).kind === 'signedIn' && w.answersAfter) w.answered = true; return r; },
    checkAgentLogin: async () => { w.calls.push('check'); return w.check(); },
  };
});

const loopsOk = (d: RawSchedules): RawSchedules => ({ ...d, loop: { ...d.loop, state: 'ok', complete: true, items: [] } });
const shape = (d: RawSchedules): RawSchedules => {
  if (!w.answered) return d;
  const ok = loopsOk(d);
  return w.later ? { ...ok, loop: { ...ok.loop, state: w.later as never, complete: false } } : ok;
};
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const React = await import('react');
  return {
    ...real,
    useSchedules: () => {
      React.useSyncExternalStore((f) => { w.subs.add(f); return () => { w.subs.delete(f); }; }, () => w.ver);
      const r = real.useSchedules();
      const data = r.data ? shape(r.data) : r.data;
      return { ...r, data, refetch: async () => { w.calls.push('reread'); const x = await r.refetch(); return { data: x.data ? shape(x.data) : x.data }; } };
    },
  };
});

beforeEach(() => {
  w.offered = true; w.calls = []; w.answersAfter = true; w.answered = false; w.later = null; w.ver = 0;
  w.signIn = async () => ({ kind: 'signedIn' });
  w.check = async () => 'login';
});

const pressButton = () => screen.findByRole('button', { name: shared['signin.press'] });
const signInBox = () => screen.findByTestId('agent-signin');

describe('schedules: a signed-out agent signs in here', () => {
  it('shows the shared box with the page\'s own sentence and its own button; no Bots link, no second "signed out" line', async () => {
    await renderPage(page, { state: 'signed-out' });
    const box = await signInBox();
    expect(box).toHaveTextContent(strings['n.agentSignedOut']);
    expect(await pressButton()).toBeEnabled();
    expect(screen.getAllByText(strings['n.agentSignedOut'])).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Bots/ })).toBeNull();
    expect(w.calls).toEqual([]);
  });

  it('one press: one core sign-in, then the page reads again; the loops answer and it says signed in', async () => {
    await renderPage(page, { state: 'signed-out' });
    await userEvent.click(await pressButton());
    await waitFor(() => expect(screen.getByTestId('agent-signin')).toHaveTextContent(/is signed in to your account/));
    expect(w.calls).toEqual(['signIn', 'reread']);
    expect(screen.queryByText(strings['n.agentSignedOut'])).toBeNull();
    expect(screen.queryByRole('button', { name: shared['signin.press'] })).toBeNull();
    expect(screen.queryByRole('button', { name: shared['signin.check'] })).toBeNull();
  });

  it('core says signed in, but the page still reads the loops signed out: never "signed in" yet, Check again only, never a second sign-in', async () => {
    w.answersAfter = false;
    await renderPage(page, { state: 'signed-out' });
    await userEvent.click(await pressButton());
    await screen.findByRole('button', { name: shared['signin.check'] });
    const box = screen.getByTestId('agent-signin');
    expect(box).toHaveTextContent(/says it's signed in, but this page can't show it yet/);
    expect(box).not.toHaveTextContent(/is signed in to your account/);
    expect(screen.queryByRole('button', { name: shared['signin.press'] })).toBeNull();
    // Check again: the agent now reads signed out and so does the page. The unconfirmed words and Check again stay (never an
    // empty box, never the sign-in button again).
    await userEvent.click(screen.getByRole('button', { name: shared['signin.check'] }));
    await waitFor(() => expect(w.calls).toEqual(['signIn', 'reread', 'check', 'reread']));
    expect(await screen.findByRole('button', { name: shared['signin.check'] })).toBeInTheDocument();
    expect(screen.getByTestId('agent-signin')).toHaveTextContent(/says it's signed in, but this page can't show it yet/);
    expect(screen.queryByRole('button', { name: shared['signin.press'] })).toBeNull();
    // Check again once the loops answer: signed in, and nothing more to press.
    w.check = async () => 'ready';
    w.answered = true;
    await userEvent.click(screen.getByRole('button', { name: shared['signin.check'] }));
    await waitFor(() => expect(screen.getByTestId('agent-signin')).toHaveTextContent(/is signed in to your account/));
    expect(screen.queryByRole('button', { name: shared['signin.check'] })).toBeNull();
    expect(w.calls.filter((c) => c === 'signIn')).toHaveLength(1);
  });

  it.each(['failed', 'private', 'not_checked'])('signed in and the loops answered, then a later read says %s: "signed in" is taken back to the agent\'s word, with Check again', async (state) => {
    await renderPage(page, { state: 'signed-out' });
    await userEvent.click(await pressButton());
    await waitFor(() => expect(screen.getByTestId('agent-signin')).toHaveTextContent(/is signed in to your account/));
    act(() => laterRead(state));
    await waitFor(() => expect(screen.getByTestId('agent-signin')).not.toHaveTextContent(/is signed in to your account/));
    expect(screen.getByTestId('agent-signin')).toHaveTextContent(/says it's signed in, but this page can't show it yet/);
    expect(screen.getByRole('button', { name: shared['signin.check'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: shared['signin.press'] })).toBeNull();
    expect(w.calls.filter((c) => c === 'signIn')).toHaveLength(1);
  });

  it('an unknown outcome: "may have been signed in", Check again only; the press is gone (C9)', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    await renderPage(page, { state: 'signed-out' });
    await userEvent.click(await pressButton());
    expect(await screen.findByText(shared['signin.unknown.own'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: shared['signin.check'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: shared['signin.press'] })).toBeNull();
    expect(w.calls).toEqual(['signIn']);
  });

  it('a refusal: "wasn\'t signed in" with its reason; nothing read as signed in', async () => {
    w.signIn = async () => ({ kind: 'refused', reason: 'disabled' });
    await renderPage(page, { state: 'signed-out' });
    await userEvent.click(await pressButton());
    expect(await signInBox()).toHaveTextContent(shared['signin.notDone.own']);
    expect(screen.queryByText(/is signed in to your account/)).toBeNull();
    expect(w.calls).toEqual(['signIn']);
  });

  it('a stale result (the Hub moved away) shows nothing and reads nothing', async () => {
    w.signIn = async () => ({ kind: 'stale' });
    await renderPage(page, { state: 'signed-out' });
    await userEvent.click(await pressButton());
    await waitFor(() => expect(w.calls).toEqual(['signIn']));
    expect(await pressButton()).toBeEnabled();
    expect(screen.queryByText(shared['signin.unknown.own'])).toBeNull();
  });

  it('shared access: the "signed out" line stays, the box says only the owner can sign in, and there is no button', async () => {
    w.offered = false;
    await renderPage(page, { state: 'signed-out' });
    expect(await screen.findByText(strings['n.agentSignedOut'])).toBeInTheDocument();
    expect(await signInBox()).toHaveTextContent(shared['signin.shared']);
    expect(screen.queryByRole('button', { name: shared['signin.press'] })).toBeNull();
  });

  it('a computer whose loops answer shows no sign-in at all, and no empty notice row above the list', async () => {
    await renderPage(page, { state: 'many' });
    await screen.findAllByRole('row');
    expect(screen.queryByTestId('agent-signin')).toBeNull();
    expect(document.querySelector('.listToolbar')).toBeNull();
  });
});
