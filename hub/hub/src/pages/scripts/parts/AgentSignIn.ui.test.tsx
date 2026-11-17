// Vitest at the part: the agent sign-in box of the writing assistant. Real: the hook, the box, its
// words and the order of the press. Replaced in '@core': the sign-in itself (signInAgent), Check again (checkAgentLogin), the page's
// status re-read (refreshFresh) and the context (a fixed computer and account). What is pinned: each state shows its words; one press
// gives one sign-in, then the page's status read, then the ask once the page shows the assistant ready; an unknown outcome sends no
// ask and offers only Check again; an unticked box, shared access or a busy press sends nothing; a stale result shows nothing and
// sends nothing; no key ever reaches the page.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Core from '@core';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompScripts } from '../types';
import { AgentSignIn, useAgentSignIn } from './AgentSignIn';

const SECRET = 'hk_live_SECRET_must_never_show';
const READY = { auth_active: true, account_id: 'acct1', owner_fingerprint: 'fp1', restriction: 'none' };

const w = vi.hoisted(() => ({
  offered: true,
  order: [] as string[],
  signIn: (async () => ({ kind: 'signedIn' })) as () => Promise<unknown>,
  check: (async () => 'ready') as () => Promise<unknown>,
  /** What the page's status re-read does: by default it flips the computer's assistant to ready. */
  reread: null as null | (() => Promise<unknown>),
  setComp: (_: (c: CompScripts) => CompScripts) => {},
  setView: (_: string) => {},
  /** The Hub shows this computer (container id). */
  shown: 'c1',
  /** watchComputer's listeners: a test moves the Hub's computer without a render (w.move). */
  watchers: new Set<() => void>(),
  /** The hook's state as the harness last rendered it. */
  state: null as null | { press: () => Promise<void> },
}));

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const target = () => ({ project: { id: 'p1' }, container: { id: w.shown } });
  return {
    ...real,
    capture: () => ({ account: 'acct1', target: target(), gen: 1 }),
    useCore: () => ({ target: target(), account: 'acct1' }),
    signInOffered: () => w.offered,
    agentBaseFor: () => 'https://agent.example/',
    signInAgent: async () => { w.order.push('signIn'); return w.signIn(); },
    checkAgentLogin: async () => { w.order.push('check'); return w.check(); },
    refreshFresh: async () => { w.order.push('reread'); return w.reread ? w.reread() : ready(); },
    watchComputer: (id: string, onLeave: () => void) => { const f = () => { if (w.shown !== id) onLeave(); }; w.watchers.add(f); return () => { w.watchers.delete(f); }; },
  };
});

function ready() {
  act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: true, writerWhy: undefined, signIn: undefined } })));
  return { state: 'fresh', answers: [{ data: READY }] };
}

const signedOut = (o: Record<string, unknown> = {}): CompScripts => ({
  id: 'c1', name: 'atlas', agentRealm: 'global',
  agent: { templates: true, writer: false, writerWhy: 'login', signIn: 'offer', guardedDelete: true, ...o },
} as never);

function Harness({ start, myself = true, blocked = '' }: { start: CompScripts; myself?: boolean; blocked?: string }) {
  const [comp, setComp] = useState(start);
  const [view, setView] = useState('open');
  w.setComp = (f) => setComp((c) => f(c));
  w.setView = setView;
  const st = useAgentSignIn(comp, () => { w.order.push('ask'); }, view);
  w.state = st;
  const button = myself ? 'Write it for me' : 'Send';
  return (
    <>
      <AgentSignIn comp={comp} state={st} button={button} myself={myself} blocked={blocked} />
      <button type="button" disabled={!st.canPress || blocked !== ''} onClick={() => void st.press()}>{button}</button>
    </>
  );
}

/** The Hub shows another computer (core only, no render), as ctx.setTarget does. */
const move = (id: string) => { w.shown = id; for (const f of [...w.watchers]) f(); };
/** The page's status changes after its read answered, as TanStack Query notifies its views (setTimeout 0, after the read's promise). */
const pageLater = (f: (c: CompScripts) => CompScripts) => setTimeout(() => act(() => w.setComp(f)), 0);
const deferred = <T,>() => { let res!: (v: T) => void; const p = new Promise<T>((r) => { res = r; }); return { p, res }; };
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  w.offered = true; w.order = []; w.shown = 'c1'; w.reread = null; w.watchers.clear();
  w.signIn = async () => ({ kind: 'signedIn' });
  w.check = async () => 'ready';
});

describe('the box', () => {
  it('shows ticked, names the computer and the press, and the press may go', () => {
    render(<Harness start={signedOut()} />);
    expect(text()).toContain("The assistant works through the agent on atlas, and that agent isn't signed in yet.");
    const box = screen.getByRole('checkbox', { name: /Sign the agent in to my Hoody account/ });
    expect(box).toBeChecked();
    expect(text()).toContain('This happens when you press Write it for me.');
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeEnabled();
  });

  it('says signed out again for a rejected login', () => {
    render(<Harness start={signedOut({ signIn: 'renew' })} />);
    expect(text()).toContain('The agent on atlas was signed out.');
    expect(screen.getByRole('checkbox', { name: /Sign the agent in again/ })).toBeChecked();
  });

  it('unticked: the press cannot go and the note names the other ways', async () => {
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(text()).toContain('Sign it in yourself in the Agent app, or use Write the code myself.');
    expect(screen.getByRole('link', { name: /Open the Agent app/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    expect(w.order).toEqual([]);
  });

  it('the drawer names no way to write the code yourself', async () => {
    render(<Harness start={signedOut()} myself={false} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(text()).toContain("The assistant can't write while the agent is signed out. Sign it in yourself in the Agent app.");
    expect(text()).not.toMatch(/Write (it|the code) myself/);
  });

  it('shared access: no box, the note says the owner signs in, nothing can be sent', () => {
    w.offered = false;
    render(<Harness start={signedOut()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(text()).toContain("You're using shared access. Only the account's owner can sign this agent in. You can still use Write the code myself.");
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
  });

  it('no realm chosen: the press cannot go', () => {
    render(<Harness start={{ ...signedOut(), agentRealm: null } as never} />);
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    // The box stays, and the page says why the press cannot go.
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(text()).toContain('Choose a realm at the top to sign the agent in and use the assistant.');
  });

  it('unticked, the press itself sends nothing (not only the disabled button)', async () => {
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('checkbox'));
    await act(async () => { await w.state!.press(); });
    expect(w.order).toEqual([]);
  });

  it('another computer starts ticked again', async () => {
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    act(() => w.setComp((c) => ({ ...c, id: 'c9', name: 'vega' })));
    expect(text()).toContain('the agent on vega');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('starts ticked again on a new view (never remembered)', async () => {
    const { unmount } = render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    unmount();
    render(<Harness start={signedOut()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});

describe('the press', () => {
  it('signs in once, reads the page status, then sends the ask once', async () => {
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'reread', 'ask']));
    expect(screen.queryByTestId('agent-signin')).toBeNull();
  });

  it('a second press while busy sends nothing more', async () => {
    const d = deferred<unknown>();
    w.signIn = () => d.p;
    render(<Harness start={signedOut()} />);
    const btn = screen.getByRole('button', { name: 'Write it for me' });
    await userEvent.click(btn);
    expect(text()).toContain('Signing the agent in to your account…');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(w.order).toEqual(['signIn']);
    await act(async () => { d.res({ kind: 'signedIn' }); });
    await waitFor(() => expect(w.order).toEqual(['signIn', 'reread', 'ask']));
  });

  it('proven but the page does not show it ready yet: no ask, the person presses again', async () => {
    w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(text()).toContain('The agent on atlas is signed in to your account. Press Write it for me to continue.'));
    expect(w.order).toEqual(['signIn', 'reread']);
    // The box asked for consent to a sign-in; proven, it goes. Pressing again reads the status again, never signs in again.
    expect(screen.queryByRole('checkbox')).toBeNull();
    w.reread = null;
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'reread', 'reread', 'ask']));
  });

  it('proven, then the page shows another account: that note, and no ask', async () => {
    // The production order: the read answers, the page updates a tick later.
    w.reread = async () => {
      pageLater((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'account', signIn: undefined } }));
      return { state: 'fresh', answers: [{ data: { ...READY, account_id: 'other' } }] };
    };
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    // The page's newer status wins over the proof's words: the other-account note and its way out.
    await waitFor(() => expect(text()).toContain('The agent on atlas is signed in to a different Hoody account'));
    expect(text()).not.toContain('is signed in to your account');
    expect(screen.getByRole('link', { name: /Open the Agent app/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    expect(w.order).toEqual(['signIn', 'reread']);
  });

  it('unknown: no ask, only Check again; Check again reads and never signs in', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await screen.findByText("The agent may have been signed in, but we couldn't confirm it. Nothing was written yet.");
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(text()).not.toMatch(/wasn't signed in|is signed in to your account/);
    expect(w.order).toEqual(['signIn']);
    // C9: no second sign-in after an unknown outcome, by the button or the press itself.
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    await act(async () => { await w.state!.press(); });
    expect(w.order).toEqual(['signIn']);
    w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(text()).toContain('is signed in to your account. Press Write it for me to continue.'));
    expect(w.order).toEqual(['signIn', 'check', 'reread']);
  });

  it('unknown, then Check again reads signed out: still held, the press never signs in again', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    w.check = async () => 'login';
    w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'check', 'reread']));
    expect(text()).toContain("couldn't confirm it");
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    await act(async () => { await w.state!.press(); });
    expect(w.order).toEqual(['signIn', 'check', 'reread']);
  });

  it('a Check again that answers after another computer is shown shows nothing there', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    const d = deferred<unknown>();
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    w.reread = () => d.p;
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'check', 'reread']));
    w.shown = 'c2';
    act(() => w.setComp(() => ({ ...signedOut(), id: 'c2', name: 'borealis' } as never)));
    await act(async () => { d.res({ state: 'fresh', answers: [{ data: READY }] }); await d.p; });
    expect(text()).not.toMatch(/is signed in to your account/);
    expect(screen.getByRole('checkbox')).toBeChecked();
    // Away and back: still nothing from the old read.
    w.shown = 'c1';
    act(() => w.setComp(() => signedOut()));
    expect(text()).not.toMatch(/is signed in to your account/);
  });

  it('a new view during the sign-in (the drawer closed): no ask afterwards, and it starts ticked again', async () => {
    const d = deferred<unknown>();
    w.signIn = () => d.p;
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    act(() => w.setView('closed'));
    await act(async () => { d.res({ kind: 'signedIn' }); await d.p; });
    await act(async () => { await Promise.resolve(); });
    expect(w.order).not.toContain('ask');
    // Unticked, closed and opened again: ticked (never remembered).
    act(() => w.setView('open'));
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    act(() => w.setView('closed'));
    act(() => w.setView('open'));
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('a refusal that answers after a new view shows nothing there (closed and opened again)', async () => {
    const d = deferred<unknown>();
    w.signIn = () => d.p;
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    act(() => w.setView('closed'));
    await act(async () => { d.res({ kind: 'refused', reason: 'key' }); await d.p; });
    expect(text()).not.toMatch(/wasn't signed in/);
    act(() => w.setView('open'));
    expect(text()).not.toMatch(/wasn't signed in/);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('a new view during the page status read after the proof: no ask', async () => {
    const d = deferred<unknown>();
    w.reread = () => d.p;
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'reread']));
    act(() => w.setView('closed'));
    await act(async () => { d.res(ready()); await d.p; });
    expect(w.order).toEqual(['signIn', 'reread']);
  });

  it('proven, a blocker note, then the page reads signed out: still no second sign-in', async () => {
    w.reread = async () => {
      pageLater((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'identity', signIn: undefined } }));
      return { state: 'fresh', answers: [{ data: { auth_active: true } }] };
    };
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(text()).toContain("hasn't said"));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'login', signIn: 'offer' } })));
    expect(screen.queryByRole('checkbox')).toBeNull();
    await act(async () => { await w.state!.press(); });
    expect(w.order.filter((x) => x === 'signIn')).toEqual(['signIn']);
  });

  it('Check again reads ready but the page then shows another account: that note, not "signed in"', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    w.reread = async () => {
      pageLater((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'account', signIn: undefined } }));
      return { state: 'fresh', answers: [{ data: { ...READY, account_id: 'other' } }] };
    };
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(text()).toContain('signed in to a different Hoody account'));
    expect(text()).not.toContain('is signed in to your account');
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
  });

  it('the page shows ready before the proof lands: the ask goes once, by itself', async () => {
    const d = deferred<unknown>();
    w.signIn = () => d.p;
    w.reread = async () => ({ state: 'fresh', answers: [{ data: READY }] });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: true, writerWhy: undefined, signIn: undefined } })));
    await act(async () => { d.res({ kind: 'signedIn' }); await d.p; });
    await waitFor(() => expect(w.order).toEqual(['signIn', 'reread', 'ask']));
    // Nothing stays armed: a later flip to ready in this view sends nothing more.
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'loading' } })));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: true, writerWhy: undefined } })));
    await act(async () => { await Promise.resolve(); });
    expect(w.order.filter((x) => x === 'ask')).toEqual(['ask']);
  });

  it('the page is ready when the proof lands: holding the ask checks the page again, the ask goes without waiting for the read', async () => {
    const d = deferred<unknown>();
    const r = deferred<unknown>();
    w.signIn = () => d.p;
    w.reread = () => r.p;
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: true, writerWhy: undefined, signIn: undefined } })));
    await act(async () => { d.res({ kind: 'signedIn' }); await d.p; });
    await waitFor(() => expect(w.order).toEqual(['signIn', 'reread', 'ask']));
    await act(async () => { r.res({ state: 'fresh', answers: [{ data: READY }] }); await r.p; });
    expect(w.order).toEqual(['signIn', 'reread', 'ask']);
  });

  it('away and back while the page status read is out (no render between): nothing from it shows', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    const d = deferred<unknown>();
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    w.reread = () => d.p;
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'check', 'reread']));
    move('c2');
    move('c1');
    await act(async () => { d.res({ state: 'fresh', answers: [{ data: READY }] }); await d.p; });
    expect(text()).not.toMatch(/is signed in to your account/);
  });

  it('away and back while the page status read after the proof is out (no render between): no ask', async () => {
    const d = deferred<unknown>();
    w.reread = () => d.p;
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'reread']));
    move('c2');
    move('c1');
    await act(async () => { d.res(ready()); await d.p; });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(w.order).toEqual(['signIn', 'reread']);
  });

  it('settled on "press to continue", then the page shows another account: that note, Write off', async () => {
    w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(text()).toContain('Press Write it for me to continue'));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'account', signIn: undefined } })));
    expect(text()).toContain('signed in to a different Hoody account');
    expect(text()).not.toContain('is signed in to your account');
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    await act(async () => { await w.state!.press(); });
    expect(w.order).toEqual(['signIn', 'reread']);
  });

  it('Check again reads ready but the page then has no identity: that note, not "signed in"', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    w.reread = async () => {
      pageLater((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'identity', signIn: undefined } }));
      return { state: 'fresh', answers: [{ data: { auth_active: true } }] };
    };
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(text()).toContain("hasn't said"));
    expect(text()).not.toContain('is signed in to your account');
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    expect(w.order.filter((x) => x === 'signIn')).toEqual(['signIn']);
  });

  it('the ask went, then the page reads signed out in the same view: no box, the press never signs in again (the hold)', async () => {
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'reread', 'ask']));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'login', signIn: 'offer' } })));
    expect(screen.queryByRole('checkbox')).toBeNull();
    w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
    await act(async () => { await w.state!.press(); });
    expect(w.order.filter((x) => x === 'signIn')).toEqual(['signIn']);
  });

  it('Check again from the identity note reads ready, then the page reads signed out: no box, the press never signs in (the hold)', async () => {
    w.reread = async () => ({ state: 'fresh', answers: [{ data: READY }] });
    render(<Harness start={signedOut({ writerWhy: 'identity', signIn: undefined })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(w.order).toEqual(['check', 'reread']));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'login', signIn: 'offer' } })));
    expect(screen.queryByRole('checkbox')).toBeNull();
    w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
    await act(async () => { await w.state!.press(); });
    expect(w.order).not.toContain('signIn');
  });

  it('the page shows an old agent when the proof lands: its note, no "signed in" words, no ask', async () => {
    const d = deferred<unknown>();
    w.signIn = () => d.p;
    w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: false, writerWhy: 'old', signIn: undefined } })));
    await act(async () => { d.res({ kind: 'signedIn' }); await d.p; });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(text()).not.toContain('is signed in to your account');
    expect(w.order).not.toContain('ask');
  });

  for (const myself of [true, false]) {
    it(`an owner never reads "shared access" after an unknown outcome (${myself ? 'New script' : 'the drawer'})`, async () => {
      w.signIn = async () => ({ kind: 'unknown' });
      render(<Harness start={signedOut()} myself={myself} />);
      await userEvent.click(screen.getByRole('button', { name: myself ? 'Write it for me' : 'Send' }));
      await waitFor(() => expect(text()).toContain("couldn't confirm it"));
      expect(text()).not.toContain('shared access');
      w.check = async () => 'login';
      w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
      await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
      await waitFor(() => expect(w.order).toEqual(['signIn', 'check', 'reread']));
      expect(text()).not.toContain('shared access');
    });

    it(`an owner never reads "shared access" after a proof while the page still reads signed out (${myself ? 'New script' : 'the drawer'})`, async () => {
      w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false } }] });
      render(<Harness start={signedOut()} myself={myself} />);
      await userEvent.click(screen.getByRole('button', { name: myself ? 'Write it for me' : 'Send' }));
      await waitFor(() => expect(text()).toContain('to continue'));
      expect(text()).not.toContain('shared access');
    });
  }

  it('Check again from the identity note does not say a sign-in is under way', async () => {
    const d = deferred<unknown>();
    w.check = () => d.p;
    render(<Harness start={signedOut({ writerWhy: 'identity', signIn: undefined })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(text()).not.toContain('Signing the agent in');
    await act(async () => { d.res('unread'); await d.p; });
  });

  it('the ask sent from a ready page clears the earlier words', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    w.reread = async () => ({ state: 'fresh', answers: [{ data: READY }] });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(text()).toContain('Press Write it for me to continue'));
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: true, writerWhy: undefined, signIn: undefined } })));
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    expect(w.order.at(-1)).toBe('ask');
    expect(text()).not.toContain('Press Write it for me to continue');
  });

  it('Check again with no answer keeps the unknown words', async () => {
    w.signIn = async () => ({ kind: 'unknown' });
    w.check = async () => 'unread';
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'check']));
    expect(text()).toContain("couldn't confirm it");
  });

  it.each([
    ['key', "The agent wasn't signed in, so nothing was written. The Hub couldn't make a sign-in key for it.", true],
    ['refused', "The agent wasn't signed in, so nothing was written. The agent refused the sign-in.", true],
    ['disabled', 'This agent is set to refuse sign-in from the Hub.', false],
    ['notThisBox', "The agent couldn't confirm that atlas is yours.", false],
    ['computerLogin', "The agent has a sign-in set on the computer that the Hub can't replace.", false],
  ])('refused %s: says why, no ask', async (reason, words, retry) => {
    w.signIn = async () => ({ kind: 'refused', reason });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(text()).toContain(words));
    expect(!!screen.queryByRole('button', { name: 'Try again' })).toBe(retry);
    expect(screen.getByRole('link', { name: /Open the Agent app/ })).toBeInTheDocument();
    expect(w.order).toEqual(['signIn']);
  });

  it('Try again signs in once more, then the ask', async () => {
    let n = 0;
    w.signIn = async () => (++n === 1 ? { kind: 'refused', reason: 'key' } : { kind: 'signedIn' });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'signIn', 'reread', 'ask']));
  });

  it('an earlier sign-in still finishing: "still finishing elsewhere" (nothing was sent, never "wasn\'t signed in"), Try again presses once more', async () => {
    let n = 0;
    w.signIn = async () => (++n === 1 ? { kind: 'refused', reason: 'busy' } : { kind: 'signedIn' });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await screen.findByText('Sign-in is still finishing elsewhere. Try again in a moment.');
    expect(screen.queryByText(/wasn't signed in/)).toBeNull();
    expect(w.order).toEqual(['signIn']);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'signIn', 'reread', 'ask']));
  });

  // Try again is the place's press again, so it goes only when that press could.
  it.each([['key'], ['refused'], ['busy']])('refused %s, then the place blocks its own press (empty idea, ask locked): Try again cannot go', async (reason) => {
    w.signIn = async () => ({ kind: 'refused', reason });
    const { rerender } = render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    const again = await screen.findByRole('button', { name: 'Try again' });
    expect(again).toBeEnabled();
    expect(screen.queryByText('Describe what it should do first.')).toBeNull();
    rerender(<Harness start={signedOut()} blocked="Describe what it should do first." />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    // The place's reason shows under the band, and the button names it (aria-describedby).
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAccessibleDescription('Describe what it should do first.');
    expect(screen.getByText('Describe what it should do first.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(w.order).toEqual(['signIn']);
  });

  it.each([['key'], ['busy']])('refused %s, then the box is unticked: Try again cannot go, like the place\'s own press', async (reason) => {
    w.signIn = async () => ({ kind: 'refused', reason });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await screen.findByRole('button', { name: 'Try again' });
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('a refusal with no block shows no reason and Try again names none', async () => {
    w.signIn = async () => ({ kind: 'refused', reason: 'key' });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    const again = await screen.findByRole('button', { name: 'Try again' });
    expect(again).not.toHaveAttribute('aria-describedby');
  });

  it('a block with no Try again shown (a refusal without one) shows no reason', async () => {
    w.signIn = async () => ({ kind: 'refused', reason: 'disabled' });
    const { rerender } = render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(text()).toContain('This agent is set to refuse sign-in from the Hub.'));
    rerender(<Harness start={signedOut()} blocked="Describe what it should do first." />);
    expect(screen.queryByText('Describe what it should do first.')).toBeNull();
  });

  // A Check again can run while a refusal stays shown. If the page's status
  // lets the press go while that check is out, Try again still waits for it (the busy guard).
  it('a refusal shown, then a Check again in flight while the page lets the press go: Try again waits for the check', async () => {
    w.signIn = async () => ({ kind: 'refused', reason: 'key' });
    const check = deferred<unknown>();
    w.check = () => check.p;
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await screen.findByRole('button', { name: 'Try again' });
    // The page now reads no identity for the agent: its note offers Check again (no box), and the press cannot go.
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writerWhy: 'identity', signIn: undefined } })));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'check']));
    // While the check is out, the page reads the agent ready: the press could go, but the check is still running.
    act(() => w.setComp((c) => ({ ...c, agent: { ...c.agent, writer: true, writerWhy: undefined } })));
    expect(w.state).toMatchObject({ canPress: true, busy: true });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    await act(async () => check.res('unread'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled());
    expect(w.order).toEqual(['signIn', 'check']);
  });

  it('a Try again under way: the next Try again cannot go until it answers', async () => {
    const second = deferred<unknown>();
    let n = 0;
    w.signIn = async () => (++n === 1 ? { kind: 'refused', reason: 'key' } : second.p);
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(w.order).toEqual(['signIn', 'signIn']));
    const again = screen.queryByRole('button', { name: 'Try again' });
    if (again) expect(again).toBeDisabled();
    await act(async () => second.res({ kind: 'refused', reason: 'key' }));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('cancelled code prompt: a quiet line, nothing sent', async () => {
    w.signIn = async () => ({ kind: 'refused', reason: 'cancelled' });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await screen.findByText('Not signed in. Nothing was changed.');
    expect(w.order).toEqual(['signIn']);
  });

  it.each([
    ['shared', "You're using shared access."],
    ['admin', "An administrator account can't sign agents in from the Hub."],
    ['otherAccount', 'is signed in to a different Hoody account'],
  ])('not allowed %s: says so, no box, no ask', async (reason, words) => {
    w.signIn = async () => ({ kind: 'notAllowed', reason });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(text()).toContain(words));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Write it for me' })).toBeDisabled();
    await act(async () => { await w.state!.press(); });
    expect(w.order).toEqual(['signIn']);
  });

  it('stale (the Hub moved on): nothing shown, nothing sent', async () => {
    w.signIn = async () => ({ kind: 'stale' });
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    await waitFor(() => expect(text()).not.toContain('Signing the agent in'));
    expect(w.order).toEqual(['signIn']);
    expect(text()).not.toMatch(/signed in to your account|wasn't signed in|couldn't confirm/);
  });

  it('another computer shown: the press does nothing', async () => {
    w.shown = 'c2';
    render(<Harness start={signedOut()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    expect(w.order).toEqual([]);
  });

  it('assistant already ready: the press is the ask, no sign-in', async () => {
    render(<Harness start={{ ...signedOut(), agent: { templates: true, writer: true, guardedDelete: true } } as never} />);
    expect(screen.queryByTestId('agent-signin')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
    expect(w.order).toEqual(['ask']);
  });

  it('no key in the page, whatever the result', async () => {
    for (const r of [{ kind: 'signedIn', token: SECRET }, { kind: 'unknown', token: SECRET }, { kind: 'refused', reason: 'key', token: SECRET }]) {
      w.order = []; w.reread = async () => ({ state: 'fresh', answers: [{ data: { auth_active: false, token: SECRET } }] });
      w.signIn = async () => r;
      const { unmount } = render(<Harness start={signedOut()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Write it for me' }));
      await waitFor(() => expect(w.order[0]).toBe('signIn'));
      await act(async () => {});
      expect(document.documentElement.outerHTML).not.toContain(SECRET);
      unmount();
    }
  });
});
