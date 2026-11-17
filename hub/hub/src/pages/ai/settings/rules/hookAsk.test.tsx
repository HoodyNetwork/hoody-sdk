// Hooks → Add hook… → Write it with the Agent: the start goes through the kit's starter (a fake provider here) once, on the
// hooks editor agent, with Strict approvals (every tool call waits for the person, so no tool the agent holds saves a hook
// without asking) and Approve automatically left off, in the chosen folder for a folder's hook, and its first message is
// exactly the text shown under "Exact instructions sent with it". No hook is written by the page. A start the starter shows as
// opened leaves for its chat, one taken up again after a reload included.
// eslint-disable-next-line no-restricted-imports -- a router harness, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient, useCurrentComputer, useRealms } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { provideActiveConversations, type ActiveConversationProvider, type StartOpts, type StartPhase, type StartState, type Starter } from '@kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// eslint-disable-next-line hub/page-boundaries -- the provider's own create body, to prove what this start sends
import { createBody } from '../../../../ask/logic';
import { agentScopes, HOOKS_AGENT, HookAskDialog, HookHowDialog, hookMessage } from './HookAsk';
import strings from './HookAsk.strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const FOLDER = '/home/ada/shop';
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await settle(); }); };

let starts: Array<{ text: string; opts: StartOpts }> = [];
let setPhase: (p: StartPhase) => void = () => {};
function fakeStarter() {
  let state: StartState = { door: { ok: true }, phase: { k: 'none' } };
  const subs = new Set<() => void>();
  const set = (p: StartPhase) => { state = { ...state, phase: p }; for (const f of [...subs]) f(); };
  setPhase = (p) => act(() => set(p));
  const starter: Starter = {
    state: () => state,
    subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; },
    start: (text, opts) => {
      if (state.phase.k !== 'none') return false;
      starts.push({ text, opts });
      set({ k: 'starting' });
      return true;
    },
    check: () => {},
    settle: (shown) => { if (shown !== state.phase) return false; set({ k: 'none' }); return true; },
    release: () => {},
  };
  const provider: ActiveConversationProvider = { open: () => null, starter: () => starter };
  provideActiveConversations(provider);
}

let closed = 0;
function Host({ cwd }: { cwd?: string }) {
  const target = useCurrentComputer();
  const realm = useRealms().selected;
  if (!target) return null;
  return <HookAskDialog at={{ target, realm, ...(cwd !== undefined ? { cwd } : {}) }} computer="atlas" scopes={['user', 'project', 'local']} onClose={() => { closed++; }} />;
}
let router: ReturnType<typeof createRouter>;
async function show(cwd?: string) {
  router = createRouter({ routeTree: createRootRoute({ component: () => <Host {...(cwd !== undefined ? { cwd } : {})} /> }), history: createMemoryHistory({ initialEntries: ['/ai/rules'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router as never} /></QueryClientProvider>);
    await router.load();
  });
  await flush();
  return screen.findByRole('dialog', { name: strings['ask.title'] });
}
const ask = (dlg: HTMLElement) => within(dlg).getByRole('textbox', { name: new RegExp(`^${strings['ask.text']}`) });
const start = (dlg: HTMLElement) => within(dlg).getByRole('button', { name: strings['ask.start'] });

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch(() => ({ status: 404, body: {} }));
  starts = [];
  closed = 0;
  fakeStarter();
});
afterEach(() => { cleanup(); provideActiveConversations(null); });

describe('hooks: write it with the Agent', () => {
  it('the first message is a fixed sentence, then the words as typed (trimmed)', () => {
    expect(hookMessage('  Log every shell command  ', 'project')).toBe('Add one new hook to the shared hooks of this folder. Keep every other hook as it is. What it should do: Log every shell command');
    expect(hookMessage('Log every shell command', 'user')).toBe('Add one new hook to my hooks for every folder in this realm. Keep every other hook as it is. What it should do: Log every shell command');
  });

  it('a folder: saved in the folder\'s shared hooks by default; Start sends once, the shown text, on the hooks editor, in that folder, asking first', async () => {
    const dlg = await show(FOLDER);
    await userEvent.type(ask(dlg), 'Log every shell command');
    // The exact first message is shown as its own section, not folded away.
    expect(within(dlg).getByRole('group', { name: strings['ask.exact'] })).toBeInTheDocument();
    const shown = hookMessage('Log every shell command', 'project');
    expect(within(dlg).getByText(shown)).toBeInTheDocument();
    // It is the whole first message; the start also names the agent, the approvals and the folder, so "nothing else" is not said.
    expect(within(dlg).getByText(strings['ask.exactLine'])).toBeInTheDocument();
    expect(strings['ask.exactLine']).toMatch(/complete first message/);
    expect(dlg.textContent).not.toMatch(/Nothing else is sent/);
    expect(within(dlg).getByText(strings['ask.localNote'])).toBeInTheDocument();
    await userEvent.click(start(dlg));
    await flush();
    expect(starts).toEqual([{ text: shown, opts: { agent: HOOKS_AGENT, strict: true, askFirst: true, cwd: FOLDER, from: 'hooks' } }]);
    // The create the provider sends for it asks for every tool call (approval mode "always").
    expect(createBody(R1, 'c1', { agent: starts[0]!.opts.agent, cwd: FOLDER, strict: starts[0]!.opts.strict })).toMatchObject({ agent: HOOKS_AGENT, cwd: FOLDER, approval: { mode: 'always' } });
    // Pressed again while it starts: nothing more leaves.
    await userEvent.click(start(dlg));
    await flush();
    expect(starts).toHaveLength(1);
    // Nothing is written by the page itself.
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('the realm: the realm\'s hooks, no folder, no folder note', async () => {
    const dlg = await show();
    expect(within(dlg).queryByText(strings['ask.localNote'])).toBeNull();
    await userEvent.type(ask(dlg), 'Tell me when a chat ends');
    await userEvent.click(start(dlg));
    await flush();
    expect(starts).toEqual([{ text: hookMessage('Tell me when a chat ends', 'user'), opts: { agent: HOOKS_AGENT, strict: true, askFirst: true, from: 'hooks' } }]);
  });

  it('with no words nothing is sent and Start says why', async () => {
    const dlg = await show(FOLDER);
    await userEvent.click(start(dlg));
    await flush();
    expect(starts).toHaveLength(0);
  });

  it('once the chat is proven open, the dialog closes and the chat opens', async () => {
    const dlg = await show(FOLDER);
    await userEvent.type(ask(dlg), 'Log every shell command');
    await userEvent.click(start(dlg));
    await flush();
    setPhase({ k: 'opened', ref: { sid: 's-1', computer: 'atlas', realm: R1 } as never, from: 'hooks' });
    await flush();
    expect(closed).toBe(1);
    expect(router.state.location.pathname).toBe('/ai/c/s-1');
  });

  it('a start taken up again after a reload (it carries no kind): once Check again proves it, the dialog closes and the chat opens', async () => {
    const dlg = await show(FOLDER);
    setPhase({ k: 'unknown', taken: true });
    await flush();
    await userEvent.click(within(dlg).getByRole('button', { name: strings.check }));
    setPhase({ k: 'opened', ref: { sid: 's-2', computer: 'atlas', realm: R1 } as never });
    await flush();
    expect(closed).toBe(1);
    expect(router.state.location.pathname).toBe('/ai/c/s-2');
  });
});

describe('hooks: Add asks how, and says plainly where the Agent cannot save', () => {
  it('the Agent writes a realm\'s hooks and a folder\'s shared hooks only, of those that may change', () => {
    expect(agentScopes(['user', 'project', 'local'], true)).toEqual(['project', 'user']);
    expect(agentScopes(['user', 'project', 'local'], false)).toEqual(['user']);
    expect(agentScopes(['local'], true)).toEqual([]);
  });

  it('a folder whose own hooks may change: both ways, and one line saying just-me hooks are written by hand', async () => {
    let agent = 0;
    let self = 0;
    render(<HookHowDialog agentOff={false} localByHand onAgent={() => { agent++; }} onSelf={() => { self++; }} onClose={() => {}} />);
    const dlg = await screen.findByRole('dialog', { name: strings['how.title'] });
    expect(within(dlg).getByText(strings['ask.localNote'])).toBeInTheDocument();
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`^${strings['how.agent']}`) }));
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`^${strings['how.self']}`) }));
    expect([agent, self]).toEqual([1, 1]);
  });

  it('only just-me hooks may change: with the Agent cannot be picked and says why; by hand still opens', async () => {
    let agent = 0;
    let self = 0;
    render(<HookHowDialog agentOff localByHand onAgent={() => { agent++; }} onSelf={() => { self++; }} onClose={() => {}} />);
    const dlg = await screen.findByRole('dialog', { name: strings['how.title'] });
    const withAgent = within(dlg).getByRole('button', { name: new RegExp(`^${strings['how.agent']}`) });
    expect(withAgent).toHaveAttribute('aria-disabled', 'true');
    expect(dlg.textContent).toContain(strings['how.agent.noScope']);
    await userEvent.click(withAgent);
    await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(`^${strings['how.self']}`) }));
    expect([agent, self]).toEqual([0, 1]);
  });
});

