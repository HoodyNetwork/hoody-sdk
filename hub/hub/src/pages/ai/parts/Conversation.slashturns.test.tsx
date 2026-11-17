// /fork and /trim are the Hub's own, run by the reply menu's items (the same Fork and Remove what follows, never a
// copy). /fork forks the whole chat, /fork N from finished turn N; /trim N opens Remove what follows on turn N. Nothing is sent to
// the agent: a missing or unknown turn, or an item that cannot run now, is said in a note.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import { can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type Draft, type DraftFile, type SendOutcome, type ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import kc from '@kit/agent/Conversation.strings.en.json';
import cs from './Conversation.strings.en.json';
import trim from './TrimDialog.strings.en.json';
import { slashRoutes } from './slashData';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

const IDLE: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};

interface Fake { p: ActiveConversationProvider; send: ReturnType<typeof vi.fn>; fork: ReturnType<typeof vi.fn>; setFacts(f: CapFacts): void }
/** The host's own draft files: none in these tests. */
const hostFiles: readonly DraftFile[] = [];
function fake(answer: (d: Draft) => Promise<SendOutcome>, facts: CapFacts = IDLE): Fake {
  let f = facts;
  const subs = new Set<() => void>();
  let snap: ConvSnapshot = { facts: f, title: 'Fix the cart total', gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' }, blocks: [] };
  const send = vi.fn((d: Draft) => answer(d));
  // A fork that never answers: these tests read only what was asked of it.
  const fork = vi.fn(() => new Promise(() => undefined));
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source = {
        kind: 'session', ref, snapshot: () => snap, subscribe: (cb: () => void) => { subs.add(cb); return () => subs.delete(cb); }, watch: () => undefined,
        can: (a: Parameters<ActiveSource['can']>[0]) => can(a, f),
        send, fork, draftFiles: () => hostFiles, dropDraftFile: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: () => undefined, canDismiss: () => false,
      } as unknown as ActiveSource;
      return { source, release: vi.fn() };
    },
  };
  return { p, send, fork, setFacts(n) { f = n; snap = { ...snap, facts: n }; act(() => { for (const cb of subs) cb(); }); } };
}

async function open(h: Fake, strict = false) {
  provideActiveConversations(h.p);
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false })), reply(slashRoutes.commands, () => answers.ok({ items: AGENT_LIST }))] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
  await act(async () => {
    render(
      strict
        ? <StrictMode><ShellDataProvider value={shell}><main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main></ShellDataProvider></StrictMode>
        : <ShellDataProvider value={shell}><main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main></ShellDataProvider>,
    );
    await router.load();
  });
  return router;
}
const box = () => screen.getByRole('textbox', { name: kc['agent.composer'] }) as HTMLTextAreaElement;
async function type(text: string) { await act(async () => { fireEvent.change(box(), { target: { value: text } }); }); }
async function pressSend() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); }); }
let created: string[] = [];
let revoked: string[] = [];
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
  created = []; revoked = [];
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { const u = `blob:t/${++n}`; created.push(u); return u; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => { revoked.push(u); });
});
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  provideActiveConversations(null);
  queryClient.clear();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

const AGENT_LIST = [
  { name: 'fork', description: 'Fork a new session from a turn (/fork [N]; omit N for the last turn)', kind: 'builtin', category: 'conversation', args: 'optional', tui_only: true },
  { name: 'trim', description: 'Delete all messages AFTER a turn (/trim N)', kind: 'builtin', category: 'conversation', args: 'required', tui_only: true },
];
const THREE: CapFacts = { ...IDLE, completedTurns: 3 };
const dialog = () => screen.queryByRole('alertdialog') ?? screen.queryByRole('dialog');
const note = (text: string) => screen.findByText(text);
const C = cs as Record<string, string>;
const fill = (k: string, v: Record<string, string>) => Object.entries(v).reduce((s, [a, b]) => s.replace(`{{${a}}}`, b), C[k] as string);

describe('/fork and /trim run the reply menu\'s own items', () => {
  it('/fork alone forks the whole chat; nothing is sent', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE);
    await open(h);
    await type('/fork');
    await pressSend();
    await waitFor(() => expect(h.fork).toHaveBeenCalledTimes(1));
    expect(h.fork.mock.calls[0]![0]).toBeUndefined(); // no turn: the whole chat
    expect(h.send).not.toHaveBeenCalled();
    expect(box().value).toBe('');
  });

  it('/fork 2 forks from finished turn 2 (the reply menu\'s Fork on that reply)', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE);
    await open(h);
    await type('/fork 2');
    await pressSend();
    await waitFor(() => expect(h.fork).toHaveBeenCalledTimes(1));
    expect(h.fork.mock.calls[0]![0]).toMatchObject({ turn: 1 });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('/fork with a turn the chat has not finished says so; nothing is forked or sent', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE);
    await open(h);
    await type('/fork 9');
    await pressSend();
    expect(await note(fill('slash.turn.none', { n: '9' }))).toBeTruthy();
    expect(h.fork).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('/fork with words that are not a turn number says how to use it; nothing is forked or sent', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE);
    await open(h);
    await type('/fork the cart branch');
    await pressSend();
    expect(await note(C['slash.fork.usage'] as string)).toBeTruthy();
    expect(h.fork).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('/fork when the chat cannot fork now says why (the item\'s own reason); nothing is sent', async () => {
    const NAME = 'fork';
    const h = fake(async () => ({ k: 'done' }), { ...IDLE, completedTurns: 0 });
    await open(h);
    await type('/fork');
    await pressSend();
    expect(await screen.findByText(/Nothing was sent\.$/u)).toBeTruthy();
    // The item's own reason, never the terminal-only note an unrun built-in gets.
    expect(screen.queryByText(fill('slash.terminalNote', { name: NAME }))).toBeNull();
    expect(h.fork).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('/trim 1 opens Remove what follows for turn 1 (the reply menu\'s dialog); nothing is sent', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE);
    await open(h);
    await type('/trim 1');
    await pressSend();
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(within(dialog()!).getByText(trim['trim.title'])).toBeTruthy();
    expect(h.send).not.toHaveBeenCalled();
    expect(box().value).toBe('');
  });

  it('/trim on the last finished turn says nothing follows it; no dialog, nothing sent', async () => {
    const NAME = 'trim';
    const h = fake(async () => ({ k: 'done' }), THREE);
    await open(h);
    await type('/trim 3');
    await pressSend();
    expect(await screen.findByText(/Nothing was sent\.$/u)).toBeTruthy();
    // The item's own reason, never the terminal-only note an unrun built-in gets.
    expect(screen.queryByText(fill('slash.terminalNote', { name: NAME }))).toBeNull();
    expect(dialog()).toBeNull();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('/trim alone says how to use it; nothing is sent', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE);
    await open(h);
    await type('/trim');
    await pressSend();
    expect(await note(C['slash.trim.usage'] as string)).toBeTruthy();
    expect(dialog()).toBeNull();
    expect(h.send).not.toHaveBeenCalled();
  });
});
