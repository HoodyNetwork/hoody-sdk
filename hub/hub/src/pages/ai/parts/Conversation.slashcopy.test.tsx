// /copy [N] is the Hub's own, as in the terminal app: it copies a finished reply's text (the reply's own Copy), the last one or
// finished turn N's, and sends nothing to the agent. A missing turn, words that are not a turn, or a clipboard that refuses are said
// in a note.
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
function fake(answer: (d: Draft) => Promise<SendOutcome>, facts: CapFacts = IDLE, blocks: ConvSnapshot['blocks'] = []): Fake {
  let f = facts;
  const subs = new Set<() => void>();
  let snap: ConvSnapshot = { facts: f, title: 'Fix the cart total', gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' }, blocks };
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
  { name: 'copy', description: 'Copy the last reply (/copy [N])', kind: 'builtin', category: 'conversation', args: 'optional', tui_only: true },
];
const THREE: CapFacts = { ...IDLE, completedTurns: 3 };
const note = (text: string) => screen.findByText(text);
const C = cs as Record<string, string>;
const fill = (k: string, v: Record<string, string>) => Object.entries(v).reduce((s, [a, b]) => s.replace(`{{${a}}}`, b), C[k] as string);

type Reply = Extract<ConvSnapshot['blocks'][number], { k: 'reply' }>;
const rep = (turn: number | undefined, text: string, o: Partial<Reply> = {}): Reply => ({ k: 'reply', key: `r${turn ?? 'x'}`, text, streaming: false, final: true, cost: null, at: null, ...(turn === undefined ? {} : { turn }), ...o });
const user = (key: string, text: string) => ({ k: 'user' as const, key, text, at: 0 });
const CHAT = [user('u0', 'one'), rep(0, 'First answer'), user('u1', 'two'), rep(1, 'Second answer'), user('u2', 'three'), rep(2, 'Third answer')] as ConvSnapshot['blocks'];
let written: string[] = [];
let refuse = false;
beforeEach(() => {
  written = []; refuse = false;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (refuse ? Promise.reject(new Error('denied')) : (written.push(s), Promise.resolve())) } });
});

describe('/copy copies a finished reply, as the terminal app does', () => {
  it('/copy alone copies the last finished reply; nothing is sent', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE, CHAT);
    await open(h);
    await type('/copy');
    await pressSend();
    await waitFor(() => expect(written).toEqual(['Third answer']));
    expect(await note(C['slash.copy.doneLast'] as string)).toBeTruthy();
    expect(h.send).not.toHaveBeenCalled();
    expect(box().value).toBe('');
  });

  it('/copy 2 copies the reply that closes finished turn 2', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE, CHAT);
    await open(h);
    await type('/copy 2');
    await pressSend();
    await waitFor(() => expect(written).toEqual(['Second answer']));
    expect(await note(fill('slash.copy.done', { n: '2' }))).toBeTruthy();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('/copy alone skips a reply still being written: the last FINISHED one is copied', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE, [...CHAT, user('u3', 'four'), rep(undefined, 'Half a rep', { streaming: true, final: false })] as ConvSnapshot['blocks']);
    await open(h);
    await type('/copy');
    await pressSend();
    await waitFor(() => expect(written).toEqual(['Third answer']));
  });

  it('/copy 5 on a chat with three finished turns copies nothing and says so', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE, CHAT);
    await open(h);
    await type('/copy 5');
    await pressSend();
    expect(await note(fill('slash.copy.none', { n: '5' }))).toBeTruthy();
    expect(written).toEqual([]);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('/copy on a chat with no finished reply copies nothing and says so', async () => {
    const h = fake(async () => ({ k: 'done' }), IDLE, []);
    await open(h);
    await type('/copy');
    await pressSend();
    expect(await note(C['slash.copy.empty'] as string)).toBeTruthy();
    expect(written).toEqual([]);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('/copy with words that are not a turn number says how to use it; nothing is copied or sent', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE, CHAT);
    await open(h);
    await type('/copy the last one');
    await pressSend();
    expect(await note(C['slash.copy.usage'] as string)).toBeTruthy();
    expect(written).toEqual([]);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('a clipboard that refuses is said; nothing is sent', async () => {
    refuse = true;
    const h = fake(async () => ({ k: 'done' }), THREE, CHAT);
    await open(h);
    await type('/copy');
    await pressSend();
    expect(await note(C['slash.copy.failed'] as string)).toBeTruthy();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('the menu shows /copy with its turn hint, not as terminal only', async () => {
    const h = fake(async () => ({ k: 'done' }), THREE, CHAT);
    await open(h);
    await type('/co');
    const opt = await screen.findByRole('option', { name: /copy/ });
    expect(within(opt).queryByText(C['slash.terminalOnly'] as string)).toBeNull();
    expect(within(opt).getByText(C['slash.hint.copy'] as string)).toBeTruthy();
  });
});
