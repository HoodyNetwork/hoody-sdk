// The working bar's Stop in the AI tab: the bar under the transcript carries the composer's own Stop, so a turn can be stopped
// from where the person is reading. One attempt for both: a press on either sends ONE cancellation, and both then show it held.
// No Stop while nothing runs.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import { can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type Draft, type DraftFile, type SendOutcome, type ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import kc from '@kit/agent/Conversation.strings.en.json';
import sv from '@kit/agent/SessionView.strings.en.json';
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

interface Fake { p: ActiveConversationProvider; send: ReturnType<typeof vi.fn>; fork: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; setFacts(f: CapFacts): void }
/** The host's own draft files: none in these tests. */
const hostFiles: readonly DraftFile[] = [];
function fake(answer: (d: Draft) => Promise<SendOutcome>, facts: CapFacts = IDLE, blocks: ConvSnapshot['blocks'] = []): Fake {
  let f = facts;
  const subs = new Set<() => void>();
  let snap: ConvSnapshot = { facts: f, title: 'Fix the cart total', gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' }, blocks };
  const send = vi.fn((d: Draft) => answer(d));
  // A fork that never answers: these tests read only what was asked of it.
  const fork = vi.fn(() => new Promise(() => undefined));
  // A Stop whose answer is still out: the attempt stays `stopping`.
  const stop = vi.fn(() => new Promise(() => undefined));
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source = {
        kind: 'session', ref, snapshot: () => snap, subscribe: (cb: () => void) => { subs.add(cb); return () => subs.delete(cb); }, watch: () => undefined,
        can: (a: Parameters<ActiveSource['can']>[0]) => can(a, f),
        send, fork, draftFiles: () => hostFiles, dropDraftFile: vi.fn(), stop, decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: () => undefined, canDismiss: () => false,
      } as unknown as ActiveSource;
      return { source, release: vi.fn() };
    },
  };
  return { p, send, fork, stop, setFacts(n) { f = n; snap = { ...snap, facts: n }; act(() => { for (const cb of subs) cb(); }); } };
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
  { name: 'copy', description: 'Copy the last reply (/copy [N])', kind: 'builtin', category: 'conversation', args: 'optional', tui_only: true },
];

const user = (key: string, text: string) => ({ k: 'user' as const, key, text, at: 0 });
const RUNNING: CapFacts = { ...IDLE, state: 'running', turn: true };
const barStop = () => document.querySelector('[data-work-bar]')?.querySelector('button') ?? null;
const SV = sv as Record<string, string>;

describe('the working bar carries the composer\'s Stop', () => {
  it('a running turn: the bar under the transcript has Stop, and pressing it stops the turn once', async () => {
    const h = fake(async () => ({ k: 'done' }), RUNNING, [user('u0', 'Fix it')]);
    await open(h);
    await waitFor(() => expect(barStop()).not.toBeNull());
    expect(barStop()!.textContent).toContain(SV['sv.work.stop']);
    await act(async () => { fireEvent.click(barStop()!); });
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.stop.mock.calls[0]![0]).toBe('turn');
    // The same attempt: a second press, on the bar or on the composer's Stop, sends nothing more.
    await act(async () => { fireEvent.click(barStop()!); });
    const composerStop = screen.getAllByRole('button', { name: /Stop/ }).find((b) => !b.closest('[data-work-bar]'));
    if (composerStop) await act(async () => { fireEvent.click(composerStop); });
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('nothing runs: no working bar, no Stop in it', async () => {
    const h = fake(async () => ({ k: 'done' }), IDLE, [user('u0', 'Fix it')]);
    await open(h);
    await screen.findByRole('textbox', { name: kc['agent.composer'] });
    expect(document.querySelector('[data-work-bar]')).toBeNull();
  });

  it('the turn ends: the bar and its Stop go away', async () => {
    const h = fake(async () => ({ k: 'done' }), RUNNING, [user('u0', 'Fix it')]);
    await open(h);
    await waitFor(() => expect(barStop()).not.toBeNull());
    h.setFacts(IDLE);
    await waitFor(() => expect(document.querySelector('[data-work-bar]')).toBeNull());
  });
});
