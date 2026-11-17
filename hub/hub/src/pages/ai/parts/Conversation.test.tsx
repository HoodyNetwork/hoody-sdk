// The open chat on /ai/c/<sid>, through the tab's routes on real core
// (fixture transport). The ACTIVE source comes from the chat's own reference and the computer the top bar shows (a provider
// registered as Ask registers its own); the transcript and its gate show; Send, Stop and the gate's buttons act only when the
// source's capability allows and otherwise say why; an outcome without proof stays "may have gone through" (C9). Details holds
// Usage, read for this chat's id and realm; leaving the chat lets the source go; with no source the chat's header says why.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply, type FixtureRequest } from '@core';
import { setRealm } from '@core/ctx';
import { pin } from '@core/realm';
import {
  can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvRef, type ConvSnapshot, type ForkOutcome, type ForkRowView, type SendOutcome,
  type ShellData, type ShownComputer,
} from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The toasts the page shows (Fork's outcomes), recorded; nothing else in this file reads a toast.
const toasts: { title: string; body?: string; tone?: string; action?: { label: string; onAction: () => unknown } }[] = [];
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'k'; } }));
import AiTab from '../tab';
import { chatRules, chatWorld } from './fixtures.chats';
import paneStrings from './Pane.strings.en.json';
import strings from './Conversation.strings.en.json';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import { forkOrigins } from './forkOrigins';
import sv from '@kit/agent/SessionView.strings.en.json';
import head from '@kit/agent/ConvHeader.strings.en.json';
import kc from '@kit/agent/Conversation.strings.en.json';
import menu from './ConvMenu.strings.en.json';
import fm from '@kit/agent/ForkMenu.strings.en.json';
import ti from './TrimItems.strings.en.json';
import td from './TrimDialog.strings.en.json';
import sessionStrings from '@kit/agent/SessionTab.strings.en.json';
import { routes as aiRoutes } from '../routes';
import { attemptKey, closeAttempts } from './closeAttempts';
import { deleteAttempts } from './deleteAttempts';
import { renameAttempts } from './renameAttempts';
import { trimAttempts } from './trimAttempts';
import { isOff } from '@app/testing';
import { agentRoutes } from '@core/agent/routes';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
let sent: FixtureRequest[] = [];
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

const FACTS: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'unknown', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'missing' },
};
const SNAP: ConvSnapshot = {
  facts: FACTS,
  turnConfirmed: true,
  title: 'Fix the cart total',
  blocks: [
    { k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000 },
    { k: 'reply', key: 'r1', text: 'Found it: the total rounds down in cart.ts.', streaming: false, final: true, cost: null, at: 2000 },
  ],
  gates: [{ key: 'g1', ref: { id: 'g1', generation: 1 }, gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: 'npm test' } }, helper: false, addressing: false, held: null, decision: null }],
  meta: { computer: HANDLE, realm: PERSONAL, status: 'needs' },
};

const DONE: SendOutcome = { k: 'done' };
type Ops = Pick<ActiveSource, 'send' | 'stop' | 'decide' | 'answer' | 'check'>;
/** A scripted active source per open: every operation is a spy (done unless the test says otherwise), and `set` publishes a new
 *  snapshot to every open source. */
function provider(snap: ConvSnapshot = SNAP, o: { refuse?: boolean; ops?: Partial<Ops>; fork?: NonNullable<ActiveSource['fork']>; recover?: Pick<ActiveSource, 'checkFork' | 'hideFork' | 'forks'> } = {}) {
  const opened: { account: string; ref: ConvRef; at: ShownComputer | null; release: ReturnType<typeof vi.fn> }[] = [];
  const ops = {
    send: vi.fn<Ops['send']>(async () => DONE), stop: vi.fn<Ops['stop']>(async () => DONE), decide: vi.fn<Ops['decide']>(async () => DONE),
    answer: vi.fn<Ops['answer']>(async () => DONE), check: vi.fn<Ops['check']>(async () => DONE),
  };
  Object.assign(ops, o.ops ?? {});
  let cur = snap;
  const subs = new Set<() => void>();
  const p: ActiveConversationProvider = {
    open(account, ref, at) {
      const release = vi.fn();
      opened.push({ account, ref, at, release });
      if (o.refuse) return null;
      const source: ActiveSource = {
        kind: 'session', ref, snapshot: () => cur, subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; }, watch: () => {}, can: (a) => can(a, cur.facts),
        send: (...a) => ops.send(...a), stop: (...a) => ops.stop(...a), decide: (...a) => ops.decide(...a), answer: (...a) => ops.answer(...a), check: (...a) => ops.check(...a),
        dismissDecision: () => {}, canDismiss: () => false,
        ...(o.fork ? { fork: (...a: Parameters<NonNullable<ActiveSource['fork']>>) => o.fork!(...a) } : {}),
        ...(o.recover ?? {}),
      };
      return { source, release };
    },
  };
  const set = (s: ConvSnapshot) => { cur = s; act(() => { for (const f of [...subs]) f(); }); };
  return { p, opened, ops, set };
}

// The next open() answers the agents list with a server error (Details → Session).
let agentsFail = false;
// While set, the agent answers every read of a chat with a server error, slowly (the header's model read included).
let liveFail = false;

async function open(path: string, sh: ShellData = shell) {
  sent = [];
  // The chat's usage read, recorded with the others.
  const usage = reply(agent.usageRoutes.session, (r) => { sent.push(r); return answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }); });
  // The agents list of Details → Session, recorded with the others.
  const failAgents = agentsFail; agentsFail = false;
  const agentsList = reply(aiRoutes.agents, (r) => { sent.push(r); return failAgents ? answers.refused(500, 'internal_error') : answers.ok({ items: [] }); });
  liveFail = false;
  const liveDown = reply(agentRoutes.session, (r) => { sent.push(r); return { ...answers.refused(500, 'internal_error'), delayMs: 4000 }; }, { when: () => liveFail });
  bootFixtureCore({ rules: [liveDown, ...chatRules({ onSend: (r) => sent.push(r) }), usage, agentsList] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={sh}>
        <main id="hub-main">
          <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
        </main>
      </ShellDataProvider>,
    );
    await router.load();
  });
  return router;
}
/** open() for a test that booted core itself (its own rules). */
async function openNoBoot(path: string) {
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={shell}>
        <main id="hub-main">
          <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
        </main>
      </ShellDataProvider>,
    );
    await router.load();
  });
  return router;
}
const chat = (computer = HANDLE) => `/ai/c/${SID}?computer=${computer}&realm=${PERSONAL}`;

let width = 1300;
beforeEach(() => {
  width = 1300;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
});
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  provideActiveConversations(null);
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the open chat', () => {
  it('a chat that cannot be read shows its reason first and "Can\'t reach", never an empty Idle chat (C9)', async () => {
    const why = "Can't reach the agent on atlas.";
    const down: ConvSnapshot = { facts: { ...FACTS, reach: 'unreachable', state: 'loading', turn: false, gate: 'none' }, title: null, blocks: [{ k: 'line', key: 'reach', text: why, tone: 'bad' }], gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'unreachable' } };
    provideActiveConversations(provider(down).p);
    await open(chat());
    expect(await screen.findByText(why)).toBeInTheDocument();
    expect(screen.getByText(head['head.status.unreachable'])).toBeInTheDocument();
    expect(screen.queryByText(head['head.status.idle'])).toBeNull();
    expect(screen.queryByText(head['head.status.running'])).toBeNull();
  });

  // Triage 9a: a chat whose history is still being read says so; it is never drawn as an empty chat or as one that can't be read.
  it('a chat still being read shows "Reading this chat…" and a skeleton, never an empty chat or "can\'t be read"', async () => {
    const reading: ConvSnapshot = { facts: { ...FACTS, state: 'loading', turn: false, gate: 'none' }, title: null, blocks: [], gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'loading' } };
    provideActiveConversations(provider(reading).p);
    await open(chat());
    // In the transcript (the Details panel's state line may say the same words).
    expect(await within(await screen.findByRole('log')).findByText('Reading this chat…')).toBeInTheDocument();
    expect(document.querySelector('[role="log"] [data-skeleton]')).not.toBeNull();
    expect(screen.queryByText(strings['conv.unavailable'])).toBeNull();
    expect(screen.queryByText(head['head.status.idle'])).toBeNull();
  });

  // A computer with no name yet says reading only while the computer list is still read; one that stays
  // nameless (gone from the list) is not "reading" forever.
  it('a nameless computer reads as "Reading this chat…" only while the computer list is loading', async () => {
    provideActiveConversations(null);
    await open(chat(), { ...shell, computers: [{ id: atlas.id, name: '', running: true }] as ShellData['computers'], computersRead: 'loading' });
    expect(await screen.findByText(strings['conv.reading'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.unavailable'])).toBeNull();
  });
  it('a computer still nameless once the list answered is not "reading" forever: it says the chat can\'t be read here', async () => {
    provideActiveConversations(null);
    await open(chat(), { ...shell, computers: [{ id: atlas.id, name: '', running: true }] as ShellData['computers'] });
    expect(await screen.findByText(strings['conv.unavailable'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.reading'])).toBeNull();
  });

  it('opens the chat’s own reference on the shown computer and draws its transcript, gate and header', async () => {
    const { p, opened } = provider();
    provideActiveConversations(p);
    await open(chat());
    expect(await screen.findByText('Round the cart total half up, please.')).toBeInTheDocument();
    expect(screen.getByText('Found it: the total rounds down in cart.ts.')).toBeInTheDocument();
    // The chat list's title wins over the engine's once the list has read the chat.
    expect(await screen.findByRole('heading', { name: 'Fix the failing checkout tests' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fix the cart total' })).toBeNull();
    await waitFor(() => expect(opened.length).toBeGreaterThan(0));
    const last = opened.at(-1)!;
    expect(last.ref).toEqual({ computer: HANDLE, realm: PERSONAL, sid: SID });
    expect(last.at, 'the shown computer carries the server its agent runs on').toEqual({ project: atlas.project_id, id: atlas.id, name: 'atlas', server: atlas.server_name });
    // Every hold but the one in use was let go (one engine for the chat).
    expect(opened.filter((o) => !o.release.mock.calls.length)).toHaveLength(1);
    // The pane stays beside the chat at l.
    expect(screen.getByRole('navigation', { name: paneStrings['pane.label'] })).toBeInTheDocument();
  });

  it('the chat names its agent as a link to that agent\'s page, in the header and in Details', async () => {
    const { p } = provider();
    provideActiveConversations(p);
    const world = chatWorld();
    world.sessions = world.sessions.map((x) => (x.id === SID ? { ...x, agent: 'workflow-editor' } : x));
    bootFixtureCore({ rules: [...chatRules({ world }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false })), reply(aiRoutes.agents, () => answers.ok({ items: [] }))] });
    await openNoBoot(chat());
    const inHeader = await screen.findByRole('link', { name: 'workflow-editor' });
    expect(inHeader).toHaveAttribute('href', '/ai/agents/workflow-editor');
    fireEvent.click(screen.getByRole('button', { name: head['head.details'] }));
    const both = await waitFor(() => { const l = screen.getAllByRole('link', { name: 'workflow-editor' }); expect(l).toHaveLength(2); return l; });
    for (const l of both) expect(l).toHaveAttribute('href', '/ai/agents/workflow-editor');
  });
  it('under All realms the link takes the chat\'s realm along: the agents page reads the top bar\'s', async () => {
    const { p } = provider();
    provideActiveConversations(p);
    const world = chatWorld();
    world.sessions = world.sessions.map((x) => (x.id === SID ? { ...x, agent: 'workflow-editor' } : x));
    bootFixtureCore({ rules: [...chatRules({ world }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false })), reply(aiRoutes.agents, () => answers.ok({ items: [] }))] });
    act(() => setRealm('all'));
    await openNoBoot(chat());
    const inHeader = await screen.findByRole('link', { name: 'workflow-editor' });
    expect(inHeader).toHaveAttribute('href', `/ai/agents/workflow-editor?open_realm=${PERSONAL}`);
  });
  it('a token session pinned to All realms: nothing can switch it, so the name shows without a link', async () => {
    const { p } = provider();
    provideActiveConversations(p);
    const world = chatWorld();
    world.sessions = world.sessions.map((x) => (x.id === SID ? { ...x, agent: 'workflow-editor' } : x));
    bootFixtureCore({ rules: [...chatRules({ world }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false })), reply(aiRoutes.agents, () => answers.ok({ items: [] }))] });
    act(() => { pin('all'); });
    await openNoBoot(chat());
    await screen.findAllByText('workflow-editor');
    expect(screen.queryByRole('link', { name: 'workflow-editor' })).toBeNull();
  });
  it('an agent name a link can\'t carry shows as words: the chat still opens', async () => {
    const { p } = provider();
    provideActiveConversations(p);
    const world = chatWorld();
    const odd = `bad${String.fromCharCode(0xd800)}name`;
    world.sessions = world.sessions.map((x) => (x.id === SID ? { ...x, agent: odd } : x));
    bootFixtureCore({ rules: [...chatRules({ world }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false })), reply(aiRoutes.agents, () => answers.ok({ items: [] }))] });
    await openNoBoot(chat());
    await screen.findAllByText(/^bad.*name$/);
    expect(screen.queryByRole('link', { name: /^bad.*name$/ })).toBeNull();
  });
  it('a chat whose list row names no agent shows none: no name is assumed and nothing links', async () => {
    const { p } = provider();
    provideActiveConversations(p);
    await open(chat());
    await screen.findByRole('heading', { name: 'Fix the failing checkout tests' });
    expect(document.querySelector('main a[href^="/ai/agents/"]')).toBeNull();
    expect(screen.queryByText('general'), 'no default agent named in the header').toBeNull();
    fireEvent.click(screen.getByRole('button', { name: head['head.details'] }));
    const where = (await screen.findByRole('heading', { name: 'Where it runs' })).closest('section');
    expect(where, 'Details shows where the chat runs').not.toBeNull();
    expect(within(where as HTMLElement).queryByText('Agent'), 'nor an agent in Details').toBeNull();
    expect(screen.queryByText('general'), 'nor a default agent anywhere').toBeNull();
  });
  it('read only: the gate card cannot decide and says why; Send says why and does nothing', async () => {
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    expect(screen.getAllByText(sv['sv.why.read_only']).length).toBeGreaterThan(0);
    // The reason is Send's description, not its name.
    const sendBtn = screen.getByRole('button', { name: kc['agent.send'] });
    expect(sendBtn).toHaveAccessibleDescription(sv['sv.why.read_only']);
    expect(isOff(sendBtn)).toBe(true);
    const writes = () => sent.filter((r) => r.method !== 'GET');
    fireEvent.click(sendBtn);
    expect(writes()).toEqual([]);
  });

  it('Details holds Usage, read for this chat’s id on its computer', async () => {
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    fireEvent.click(screen.getByRole('button', { name: head['head.details'] }));
    const usageTab = await screen.findByRole('tab', { name: /usage/i });
    fireEvent.click(usageTab);
    await waitFor(() => expect(sent.some((r) => r.method === 'GET' && r.path.endsWith(`/sessions/${SID}/usage`))).toBe(true));
    const read = sent.find((r) => r.path.endsWith(`/sessions/${SID}/usage`))!;
    // The chat's own computer (the fixture transport does not record the realm; createUsageStore is given the link's).
    expect(read.target?.container.id).toBe(atlas.id);
  });

  it('Details holds Session: opening it reads this chat\'s settings on its computer and the agents list once, and not before (the header reads the model once)', async () => {
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    fireEvent.click(screen.getByRole('button', { name: head['head.details'] }));
    const sessionTab = await screen.findByRole('tab', { name: /session/i });
    const settingsRead = (r: { method: string; path: string }) => r.method === 'GET' && r.path.endsWith(`/sessions/${SID}`);
    expect(sent.some((r) => r.method === 'GET' && /\/agents(\?|$)/.test(r.path))).toBe(false);
    // Before Session opens, only the header's model chip has read the chat (once, while Details was closed).
    await waitFor(() => expect(sent.filter(settingsRead)).toHaveLength(1));
    fireEvent.click(sessionTab);
    expect(await screen.findByRole('group', { name: sessionStrings['st.title'] })).toBeInTheDocument();
    await waitFor(() => expect(sent.some((r) => r.method === 'GET' && r.path.endsWith(`/sessions/${SID}`) && r.target?.container.id === atlas.id)).toBe(true));
    await waitFor(() => expect(sent.filter((r) => r.method === 'GET' && /\/agents(\?|$)/.test(r.path))).toHaveLength(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); // a later duplicate read would land here
    expect(sent.filter((r) => r.method === 'GET' && /\/agents(\?|$)/.test(r.path))).toHaveLength(1);
    expect(sent.filter(settingsRead)).toHaveLength(3); // the header's model read, then the same route once for the settings (readSettings) and once for the live state (readLive); none repeated
    expect(sent.filter((r) => r.method !== 'GET')).toEqual([]); // reading changes nothing
  });

  it('the header names the chat\'s model as its agent reports it, and its chip opens Details on Session (nothing is sent)', async () => {
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    const chip = await screen.findByRole('button', { name: /^Model: / }, { timeout: 5000 });
    expect(chip.textContent?.trim()).not.toBe('');
    expect(chip.textContent).not.toContain('hoody-ai/');
    fireEvent.click(chip);
    expect(await screen.findByRole('group', { name: sessionStrings['st.title'] })).toBeInTheDocument();
    expect(sent.filter((r) => r.method !== 'GET')).toEqual([]);
  });

  it('closing Details never shows the model read before it: the chip waits for a fresh read, and a read that fails draws none', async () => {
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await screen.findByRole('button', { name: /^Model: / }, { timeout: 5000 });
    // The header's own toggle (the panel has a close button of its own).
    const toggle = () => document.querySelector<HTMLElement>('[data-details-toggle]')!;
    fireEvent.click(toggle());
    await waitFor(() => expect(toggle().getAttribute('aria-label')).toBe(head['head.detailsClose']));
    // A switch made in Details may have replaced the model: the header's earlier read no longer says which one runs.
    liveFail = true;
    const before = sent.filter((r) => r.method === 'GET' && r.path.endsWith(`/sessions/${SID}`)).length;
    fireEvent.click(toggle());
    expect(screen.queryByRole('button', { name: /^Model: / })).toBeNull();
    await waitFor(() => expect(sent.filter((r) => r.method === 'GET' && r.path.endsWith(`/sessions/${SID}`)).length).toBeGreaterThan(before));
    // While the fresh read is out (long enough for the computer's model list, which names the chip, to be read again) and
    // after it failed: no chip.
    await expect(screen.findByRole('button', { name: /^Model: / }, { timeout: 3000 })).rejects.toThrow();
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); });
    expect(screen.queryByRole('button', { name: /^Model: / })).toBeNull();
    // The next read that answers draws it again.
    liveFail = false;
    fireEvent.click(toggle());
    await waitFor(() => expect(toggle().getAttribute('aria-label')).toBe(head['head.detailsClose']));
    fireEvent.click(toggle());
    expect(await screen.findByRole('button', { name: /^Model: / }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('Details → Session: an agents list that cannot be read is said, and the agent cannot be changed (never a shorter list)', async () => {
    agentsFail = true;
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    fireEvent.click(screen.getByRole('button', { name: head['head.details'] }));
    fireEvent.click(await screen.findByRole('tab', { name: /session/i }));
    expect(await screen.findByText(sessionStrings['st.agentsFailed'])).toBeInTheDocument();
    expect(isOff(screen.getByRole('button', { name: new RegExp(sessionStrings['st.agent']!) }))).toBe(true);
    expect(sent.filter((r) => r.method !== 'GET')).toEqual([]);
  });

  it('a chat on another computer that this computer cannot read has no Details at all (the fallback is drawn), so no Session tab', async () => {
    provideActiveConversations(provider(SNAP, { refuse: true }).p);
    await open(chat('orion.0b2c'));
    await screen.findByText(fill(strings['conv.elsewhere'], { computer: 'orion.0b2c' }));
    expect(screen.queryByRole('button', { name: head['head.details'] })).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('a readable chat whose link names another computer than the one it runs on: Details draws its tabs and none is Session (its settings are not read through this computer)', async () => {
    provideActiveConversations(provider().p);
    await open(chat('orion.0b2c'));
    await screen.findByText('Round the cart total half up, please.');
    fireEvent.click(screen.getByRole('button', { name: head['head.details'] }));
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
    expect(screen.queryByRole('tab', { name: /session/i })).toBeNull();
    expect(sent.filter((r) => r.method !== 'GET')).toEqual([]);
  });

  it('leaving the chat lets its source go', async () => {
    const { p, opened } = provider();
    provideActiveConversations(p);
    const router = await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { router.history.push('/ai'); });
    await waitFor(() => expect(opened.every((o) => o.release.mock.calls.length === 1)).toBe(true));
  });

  it('no provider: the chat’s header says it cannot be read here; nothing else is drawn as the chat', async () => {
    provideActiveConversations(null);
    await open(chat());
    expect(await screen.findByText(strings['conv.unavailable'])).toBeInTheDocument();
    expect(screen.queryByRole('log')).toBeNull();
  });

  it('a chat on another computer: it says where it runs, and never draws the shown computer’s chat', async () => {
    const { p, opened } = provider(SNAP, { refuse: true });
    provideActiveConversations(p);
    await open(chat('orion.0b2c'));
    expect(await screen.findByText(fill(strings['conv.elsewhere'], { computer: 'orion.0b2c' }))).toBeInTheDocument();
    expect(screen.queryByText('Round the cart total half up, please.')).toBeNull();
    expect(opened.every((o) => o.ref.computer === 'orion.0b2c')).toBe(true);
  });

  it('phone: the chat alone with Back to chats; the list is not drawn', async () => {
    width = 390;
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    expect(screen.getByRole('button', { name: head['head.back'] })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: paneStrings['pane.label'] })).toBeNull();
  });

  it('m: Details takes the pane’s place', async () => {
    width = 1000;
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    expect(screen.getByRole('navigation', { name: paneStrings['pane.label'] })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: head['head.details'] }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: paneStrings['pane.label'] })).toBeNull());
    expect(within(document.querySelector('[data-details-panel]') as HTMLElement).getAllByRole('tab').length).toBeGreaterThan(0);
  });
});

// The chat sends, stops and decides through its active source, and only once per press (C9).
const LIVE: CapFacts = { ...FACTS, mode: 'active', approval: 'default', prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' } };
const IDLE: ConvSnapshot = { ...SNAP, facts: { ...LIVE, state: 'idle', turn: false, gate: 'none' }, gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' } };
const RUNNING: ConvSnapshot = { ...IDLE, turnId: 'T1', facts: { ...IDLE.facts, state: 'running', turn: true }, meta: { computer: HANDLE, realm: PERSONAL, status: 'running' } };
const GATED: ConvSnapshot = { ...SNAP, facts: { ...LIVE, gate: 'confirm' } };
/** A promise the test settles by hand. */
function later<T>() {
  let settle: (v: T) => void = () => {};
  let fail: (e: unknown) => void = () => {};
  const p = new Promise<T>((res, rej) => { settle = res; fail = rej; });
  return { p, settle, fail };
}
const box = () => screen.getByRole('textbox', { name: kc['agent.composer'] }) as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const sendButton = () => screen.getByRole('button', { name: kc['agent.send'] });

describe('sending, stopping and deciding on /ai/c (C9)', () => {
  it('Send sends the draft once and clears it when the agent took it', async () => {
    const h = provider(IDLE);
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(h.ops.send).toHaveBeenCalledTimes(1);
    expect(h.ops.send.mock.calls[0]![0]).toEqual({ text: 'Now add a test for it.' });
    await waitFor(() => expect(box().value).toBe(''));
    expect(screen.queryByText(strings['conv.send.unknown'])).toBeNull();
    expect(screen.queryByText(strings['conv.send.notSent'])).toBeNull();
  });

  it('a refused send keeps the text, says "Not sent; nothing ran.", and Send it now is one new send', async () => {
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(async () => ({ k: 'refused', code: 'not_sent' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(await screen.findByText(strings['conv.send.notSent'])).toBeInTheDocument();
    expect(box().value).toBe('Now add a test for it.');
    h.ops.send.mockImplementation(async () => DONE);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.again'] })); });
    expect(h.ops.send).toHaveBeenCalledTimes(2);
    expect(h.ops.send.mock.calls[1]![0]).toEqual({ text: 'Now add a test for it.' });
    await waitFor(() => expect(box().value).toBe(''));
    expect(screen.queryByText(strings['conv.send.notSent'])).toBeNull();
  });

  it('an unknown outcome says "may have gone through", offers only Stop tracking, and nothing can send that text again', async () => {
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(await screen.findByText(strings['conv.send.unknown'])).toBeInTheDocument();
    // Never shown as done or failed, and the text is not left in the box to be sent again by a second press.
    expect(screen.queryByText(strings['conv.send.notSent'])).toBeNull();
    expect(screen.queryByRole('button', { name: strings['conv.send.again'] })).toBeNull();
    expect(box().value).toBe('');
    // Send is held for this chat until the person has checked and dismissed, even for a new text.
    type('Something else.');
    const heldBtn = screen.getByRole('button', { name: kc['agent.send'] });
    expect(heldBtn).toHaveAccessibleDescription(strings['conv.send.held']);
    expect(isOff(heldBtn)).toBe(true);
    fireEvent.click(heldBtn);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(h.ops.send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: strings['conv.send.dismiss'] }));
    expect(await screen.findByText(strings['conv.send.dismissed'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.send.unknown'])).toBeNull();
    // Dismissing records nothing as failed and sends nothing; Send is free again for a new message.
    expect(screen.queryByText(strings['conv.send.notSent'])).toBeNull();
    expect(h.ops.send).toHaveBeenCalledTimes(1);
    expect(isOff(sendButton())).toBe(false);
  });

  it('a second press while a send is on its way sends nothing more', async () => {
    const w = later<SendOutcome>();
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(() => w.p) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    fireEvent.click(sendButton());
    fireEvent.click(sendButton());
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(h.ops.send).toHaveBeenCalledTimes(1);
    await act(async () => { w.settle(DONE); });
    await waitFor(() => expect(box().value).toBe(''));
  });

  it('a send that throws is unknown, never failed', async () => {
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(async () => { throw new Error('boom'); }) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(await screen.findByText(strings['conv.send.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.send.notSent'])).toBeNull();
  });

  it('an answer that arrives after the chat changed is not shown on the new chat, and its draft is untouched', async () => {
    const w = later<SendOutcome>();
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(() => w.p) } });
    provideActiveConversations(h.p);
    const router = await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    fireEvent.click(sendButton());
    await act(async () => { router.history.push(`/ai/c/s-other?computer=${HANDLE}&realm=${PERSONAL}`); });
    await waitFor(() => expect(h.opened.at(-1)!.ref.sid).toBe('s-other'));
    type('A draft for the other chat.');
    await act(async () => { w.settle({ k: 'unknown' }); });
    expect(screen.queryByText(strings['conv.send.unknown'])).toBeNull();
    expect(box().value).toBe('A draft for the other chat.');
    // The answer landed on the chat it was sent to: back there, it says so (attempts bind to their target).
    await act(async () => { router.history.push(chat()); });
    expect(await screen.findByText(strings['conv.send.unknown'])).toBeInTheDocument();
    expect(box().value).toBe('');
  });

  it('the link moves to another realm on the same page: the answer lands on the chat it was sent to, not the one shown', async () => {
    const OTHER = fixtureWorld.realms[1]!.id;
    const w = later<SendOutcome>();
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(() => w.p) } });
    provideActiveConversations(h.p);
    const router = await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    fireEvent.click(sendButton());
    await act(async () => { router.history.push(`/ai/c/${SID}?computer=${HANDLE}&realm=${OTHER}`); });
    await waitFor(() => expect(h.opened.at(-1)!.ref.realm).toBe(OTHER));
    await act(async () => { w.settle({ k: 'unknown' }); });
    expect(screen.queryByText(strings['conv.send.unknown'])).toBeNull();
    await act(async () => { router.history.push(chat()); });
    expect(await screen.findByText(strings['conv.send.unknown'])).toBeInTheDocument();
  });

  it('leaving the chat while a send is on its way and coming back: Send is still held, nothing is sent again', async () => {
    const w = later<SendOutcome>();
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(() => w.p) } });
    provideActiveConversations(h.p);
    const router = await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    fireEvent.click(sendButton());
    await act(async () => { router.history.push('/ai'); });
    await act(async () => { router.history.push(chat()); });
    await screen.findByText('Round the cart total half up, please.');
    expect(box().value).toBe('Now add a test for it.');
    fireEvent.click(sendButton());
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(h.ops.send).toHaveBeenCalledTimes(1);
    await act(async () => { w.settle(DONE); });
    await waitFor(() => expect(box().value).toBe(''));
  });

  it('an answer lands on the chat it was sent to even when the chat’s source was opened again (attempts bind to their target)', async () => {
    const w = later<SendOutcome>();
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(() => w.p) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    fireEvent.click(sendButton());
    const h2 = provider(IDLE);
    act(() => provideActiveConversations(h2.p));
    await waitFor(() => expect(h2.opened.length).toBeGreaterThan(0));
    // Still on its way: the new source cannot send it a second time.
    fireEvent.click(sendButton());
    expect(h2.ops.send).not.toHaveBeenCalled();
    await act(async () => { w.settle({ k: 'unknown' }); });
    expect(await screen.findByText(strings['conv.send.unknown'])).toBeInTheDocument();
    expect(h.ops.send).toHaveBeenCalledTimes(1);
  });

  it('duplicate_held (an earlier message is unresolved, perhaps without its text after a reload) never says it was sent', async () => {
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(async () => ({ k: 'refused', code: 'duplicate_held' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Something else.');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(await screen.findByText(strings['conv.send.unresolved'])).toBeInTheDocument();
    expect(strings['conv.send.unresolved']).not.toMatch(/\bsent\b|same message/i);
    expect(screen.queryByRole('button', { name: strings['conv.send.again'] })).toBeNull();
    expect(box().value).toBe('Something else.');
    expect(h.ops.send).toHaveBeenCalledTimes(1);
  });

  it('without the prerequisites Send says why and sends nothing', async () => {
    const h = provider({ ...IDLE, facts: { ...IDLE.facts, prereq: { ...LIVE.prereq, attachment: false } } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Now add a test for it.');
    expect(isOff(screen.getByRole('button', { name: kc['agent.send'] }))).toBe(true);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(h.ops.send).not.toHaveBeenCalled();
    expect(box().value).toBe('Now add a test for it.');
  });

  it('while a turn runs Send is a follow-up through the same source', async () => {
    const h = provider(RUNNING);
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Also check the tax line.');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(h.ops.send).toHaveBeenCalledTimes(1);
  });

  it('Allow once on the gate card decides through the chat’s source, once', async () => {
    const h = provider(GATED);
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: new RegExp(kc['agent.allowOnce']) })); });
    expect(h.ops.decide).toHaveBeenCalledTimes(1);
    expect(h.ops.decide.mock.calls[0]![0]).toEqual({ id: 'g1', generation: 1 });
    expect(h.ops.decide.mock.calls[0]![1]).toMatchObject({ choice: 'once' });
  });

  it('Stop stops the running turn once and is busy until the answer', async () => {
    const w = later<SendOutcome>();
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(() => w.p) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    const stopBtn = screen.getByRole('button', { name: kc['agent.stop'] });
    fireEvent.click(stopBtn);
    fireEvent.click(stopBtn);
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
    expect(h.ops.stop.mock.calls[0]![0]).toBe('turn');
    expect(isOff(screen.getByRole('button', { name: kc['agent.stop'] }))).toBe(true);
    await act(async () => { w.settle(DONE); });
    h.set(IDLE);
    await waitFor(() => expect(screen.queryByRole('button', { name: kc['agent.stop'] })).toBeNull());
  });

  it('a Stop without an answer says it may have gone through, and is never shown as failed', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.stop.refused'])).toBeNull();
  });

  it('after a Stop without an answer, Stop stays held for that turn: a second press sends nothing, and it is not shown as failed', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    const again = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(again)).toBe(true);
    fireEvent.click(again);
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(strings['conv.stop.refused'])).toBeNull();
  });

  it('an unresolved Stop survives leaving and reopening the chat (a new source): still held, nothing sent again', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    const router = await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    await act(async () => { router.history.push('/ai'); });
    // The reopened source rebuilt its rows (new row keys) for the same turn: the turn id is what binds the Stop.
    const h2 = provider({ ...RUNNING, blocks: RUNNING.blocks.map((b) => (b.k === 'user' ? { ...b, key: 'h7' } : b)) });
    act(() => provideActiveConversations(h2.p));
    await act(async () => { router.history.push(chat()); });
    await screen.findByText('Round the cart total half up, please.');
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] }));
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
    expect(h2.ops.stop).not.toHaveBeenCalled();
  });

  it('a stop_pending answer never clears or fails the Stop: it stays unresolved until the turn ends', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'refused', code: 'stop_pending' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.stop.refused'])).toBeNull();
    expect(isOff(screen.getByRole('button', { name: kc['agent.stop'] }))).toBe(true);
  });

  it('the turn ending settles an unresolved Stop; a later turn can be stopped again', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    h.set(IDLE);
    await waitFor(() => expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull());
    const next: ConvSnapshot = { ...RUNNING, turnId: 'T2', blocks: [...RUNNING.blocks, { k: 'user', key: 'u2', text: 'Now the tax line.', at: 3000 }] };
    h.set(next);
    const stopBtn = await screen.findByRole('button', { name: kc['agent.stop'] });
    expect(isOff(stopBtn)).toBe(false);
    await act(async () => { fireEvent.click(stopBtn); });
    expect(h.ops.stop).toHaveBeenCalledTimes(2);
  });

  it('facts that cannot be read never settle an unresolved Stop: when the same turn shows again, Stop is still held', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    h.set({ ...RUNNING, facts: { ...RUNNING.facts, reach: 'unreachable', state: 'loading', turn: false } });
    h.set(RUNNING);
    const again = await screen.findByRole('button', { name: kc['agent.stop'] });
    expect(isOff(again)).toBe(true);
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    fireEvent.click(again);
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
  });

  it('a Stop that throws or rejects is unresolved, never shown as not stopped', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(() => { throw new Error('x'); }) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.stop.refused'])).toBeNull();
    cleanup(); resetAttemptsForTests();
    const h2 = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(() => Promise.reject(new Error('x'))) } });
    provideActiveConversations(h2.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.stop.refused'])).toBeNull();
  });

  it('a late answer for an earlier turn\'s Stop never overwrites the Stop pressed for a later turn', async () => {
    const w1 = later<SendOutcome>(), w2 = later<SendOutcome>();
    const stop = vi.fn<Ops['stop']>().mockImplementationOnce(() => w1.p).mockImplementationOnce(() => w2.p);
    const h = provider(RUNNING, { ops: { stop } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] }));
    const next: ConvSnapshot = { ...RUNNING, turnId: 'T2', blocks: [...RUNNING.blocks, { k: 'user', key: 'u2', text: 'Now the tax line.', at: 3000 }] };
    h.set(next);
    await screen.findByText('Now the tax line.');
    fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] }));
    expect(stop).toHaveBeenCalledTimes(2);
    await act(async () => { w1.settle({ k: 'unknown' }); });
    const again = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(again)).toBe(true);
    fireEvent.click(again);
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('a follow-up in the same turn (a new message row, the same turn id) keeps the unresolved Stop held', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    h.set({ ...RUNNING, blocks: [...RUNNING.blocks, { k: 'user', key: 'u2', text: 'Also the tax line.', at: 3000 }] });
    await screen.findByText('Also the tax line.');
    const again = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(again)).toBe(true);
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    fireEvent.click(again);
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
  });

  it('a new turn whose last message row is unchanged (a queued follow-up became the turn) can be stopped', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    h.set({ ...RUNNING, turnId: 'T2' });
    await waitFor(() => expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull());
    const stopBtn = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(stopBtn)).toBe(false);
    await act(async () => { fireEvent.click(stopBtn); });
    expect(h.ops.stop).toHaveBeenCalledTimes(2);
  });

  it('a Stop never answered is retired by certain turn-end facts and never holds the next turn; its late answer is dropped', async () => {
    const w1 = later<SendOutcome>();
    const stop = vi.fn<Ops['stop']>().mockImplementationOnce(() => w1.p).mockImplementation(async () => DONE);
    const h = provider(RUNNING, { ops: { stop } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] }));
    h.set(IDLE);
    h.set({ ...RUNNING, turnId: 'T2' });
    const stopBtn = await screen.findByRole('button', { name: kc['agent.stop'] });
    await waitFor(() => expect(isOff(stopBtn)).toBe(false));
    await act(async () => { w1.settle({ k: 'unknown' }); });
    expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull();
    expect(isOff(screen.getByRole('button', { name: kc['agent.stop'] }))).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('a no_turn answer keeps the Stop unresolved and held until certain facts settle it', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'refused', code: 'no_turn' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.stop.refused'])).toBeNull();
    expect(isOff(screen.getByRole('button', { name: kc['agent.stop'] }))).toBe(true);
    h.set(IDLE);
    await waitFor(() => expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull());
  });

  it('a Stop pressed before the agent named the turn stays held when the agent names it (the same turn), until nothing runs', async () => {
    const UNNAMED: ConvSnapshot = { ...RUNNING, turnId: undefined };
    const h = provider(UNNAMED, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    h.set(RUNNING);
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    const again = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(again)).toBe(true);
    fireEvent.click(again);
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
    h.set(IDLE);
    await waitFor(() => expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull());
  });

  it('a never-answered Stop for an unnamed turn is retired when nothing runs, and never holds the next turn', async () => {
    const w1 = later<SendOutcome>();
    const stop = vi.fn<Ops['stop']>().mockImplementationOnce(() => w1.p).mockImplementation(async () => DONE);
    const h = provider({ ...RUNNING, turnId: undefined }, { ops: { stop } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] }));
    h.set(IDLE);
    h.set({ ...RUNNING, turnId: 'T2' });
    const stopBtn = await screen.findByRole('button', { name: kc['agent.stop'] });
    await waitFor(() => expect(isOff(stopBtn)).toBe(false));
    await act(async () => { fireEvent.click(stopBtn); });
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('a reopened chat that shows only its stored record (idle, the agent\'s state not read yet) keeps the unresolved Stop; when the read finds the same turn, nothing is sent again', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    const router = await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    await act(async () => { router.history.push('/ai'); });
    const h2 = provider({ ...IDLE, turnConfirmed: undefined });
    act(() => provideActiveConversations(h2.p));
    await act(async () => { router.history.push(chat()); });
    await screen.findByText('Round the cart total half up, please.');
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    h2.set(RUNNING);
    const again = await screen.findByRole('button', { name: kc['agent.stop'] });
    expect(isOff(again)).toBe(true);
    fireEvent.click(again);
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
    expect(h2.ops.stop).not.toHaveBeenCalled();
  });

  it('a running turn without an id (a provisional send) never settles a named Stop: held through it and when the named turn shows again', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    h.set({ ...RUNNING, turnId: undefined });
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    const mid = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(mid)).toBe(true);
    fireEvent.click(mid);
    h.set(RUNNING);
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    const again = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(again)).toBe(true);
    fireEvent.click(again);
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
  });

  it('the captured turn shown ended by its own id settles the unresolved Stop even before the agent\'s state is read again', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    h.set({ ...IDLE, turnConfirmed: undefined, endedTurnId: 'T0' });
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    h.set({ ...IDLE, turnConfirmed: undefined, endedTurnId: 'T1' });
    await waitFor(() => expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull());
  });

  it('another named turn on facts not yet agreeing with the agent\'s state (a stored turn still shown) never replaces the unresolved Stop: held, no call; once confirmed, it settles and the new turn can be stopped', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    await screen.findByText(strings['conv.stop.unknown']);
    h.set({ ...RUNNING, turnId: 'T2', turnConfirmed: undefined });
    expect(screen.getByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    const mid = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(mid)).toBe(true);
    await act(async () => { fireEvent.click(mid); });
    expect(h.ops.stop).toHaveBeenCalledTimes(1);
    h.set({ ...RUNNING, turnId: 'T2' });
    await waitFor(() => expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull());
    const now = screen.getByRole('button', { name: kc['agent.stop'] });
    expect(isOff(now)).toBe(false);
    await act(async () => { fireEvent.click(now); });
    expect(h.ops.stop).toHaveBeenCalledTimes(2);
  });

  it('no Stop while nothing runs', async () => {
    provideActiveConversations(provider(IDLE).p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    expect(screen.queryByRole('button', { name: kc['agent.stop'] })).toBeNull();
  });
});

describe('the chat\'s own menu (ConvMenu) in the open chat\'s header', () => {
  const ACTIVE: ConvSnapshot = { ...SNAP, facts: { ...FACTS, mode: 'active', state: 'idle', turn: false, gate: 'none' }, gates: [] };
  const openMenu = async () => { await act(async () => { fireEvent.click(await screen.findByRole('button', { name: menu['menu.label'] })); }); };
  const item = (name: string) => screen.findByRole('menuitem', { name: new RegExp(name) });
  const listReads = () => sent.filter((r) => r.method === 'GET' && /\/sessions$/.test(r.path)).length;
  // Export saves through a hidden link click on a blob URL: record what it would have saved (file name, Blob), save nothing.
  const captureDownload = () => {
    const names: string[] = [], blobs: Blob[] = [];
    const mk = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { blobs.push(b as Blob); return 'blob:probe'; });
    const rv = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const ck = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    return { names, blobs, restore: () => { mk.mockRestore(); rv.mockRestore(); ck.mockRestore(); } };
  };

  it('the header carries the chat menu; its items follow the capability table (read-only: Rename says why, Export works)', async () => {
    provideActiveConversations(provider().p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await openMenu();
    expect(await item(menu['menu.rename'])).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menu').textContent).toContain(sv['sv.why.read_only']);
    const exp = await item(menu['menu.export']);
    expect(exp).not.toHaveAttribute('aria-disabled', 'true');
    // Export really runs: one file, a Markdown name, the chat's own words in it.
    const dl = captureDownload();
    try {
      await act(async () => { fireEvent.click(exp); });
      expect(dl.names).toHaveLength(1);
      expect(dl.names[0]).toMatch(/\.md$/);
      expect(await dl.blobs[0]!.text()).toContain('Round the cart total half up, please.');
    } finally { dl.restore(); }
  });

  it('the menu goes to the computer the top bar shows: an active chat can be renamed, and the list reloads once', async () => {
    let renamed = 0;
    const renames: FixtureRequest[] = [];
    const rename = reply(agent.sessionRoutes.rename, (r) => { renamed++; renames.push(r); sent.push(r); return answers.ok({ status: 'ok', name: 'Cart' }); });
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), rename, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(listReads()).toBeGreaterThan(0));
    await openMenu();
    const r = await item(menu['menu.rename']);
    expect(r).not.toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(r); });
    const d = await screen.findByRole('alertdialog');
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'Cart' } });
    const before = listReads();
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: menu['rename.go'] })); });
    await waitFor(() => expect(renamed).toBe(1));
    await waitFor(() => expect(listReads()).toBe(before + 1));
    // The request is the chat's own on the computer the top bar shows (the realm rides the URL, which a fixture request does not carry:
    // the transport tests in core/agent/session.test.ts pin it).
    expect(renames[0]!.method).toBe('PATCH');
    expect(renames[0]!.path).toContain(`/sessions/${SID}`);
    expect(renames[0]!.target?.container.id).toBe(atlas.id);
    expect(renames[0]!.body).toEqual({ name: 'Cart' });
  });

  it('a rename made for a chat of another realm than the list shows reloads nothing (listShows)', async () => {
    const other = fixtureWorld.realms[1]!.id;
    let renamed = 0;
    const rename = reply(agent.sessionRoutes.rename, () => { renamed++; return answers.ok({ status: 'ok', name: 'Cart' }); });
    provideActiveConversations(provider({ ...ACTIVE, meta: { computer: HANDLE, realm: other, status: 'needs' } }).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), rename, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    await openNoBoot(`/ai/c/${SID}?computer=${HANDLE}&realm=${other}`);
    await screen.findByText('Round the cart total half up, please.');
    await openMenu();
    await act(async () => { fireEvent.click(await item(menu['menu.rename'])); });
    const d = await screen.findByRole('alertdialog');
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'Cart' } });
    const before = listReads();
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: menu['rename.go'] })); });
    await waitFor(() => expect(renamed).toBe(1));
    await act(async () => { await new Promise((res) => setTimeout(res, 50)); });
    expect(listReads()).toBe(before);
  });

  it('a chat whose computer the top bar does not show: the menu sends nothing there (Rename says why and pressing it opens nothing and writes nothing), Export still works', async () => {
    let writes = 0;
    const count = (route: Parameters<typeof reply>[0]) => reply(route, () => { writes++; return answers.ok({ status: 'ok' }); });
    provideActiveConversations(provider({ ...ACTIVE, meta: { computer: 'orion.0b2c', realm: PERSONAL, status: 'needs' } }).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), count(agent.sessionRoutes.rename), count(agent.sessionRoutes.close), count(agent.sessionRoutes.delete), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    await openNoBoot(chat('orion.0b2c'));
    await screen.findByText('Round the cart total half up, please.');
    await openMenu();
    const ren = await item(menu['menu.rename']);
    expect(ren).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menu').textContent).toContain(menu['menu.noComputer']);
    await act(async () => { fireEvent.click(ren); });
    await act(async () => { await new Promise((res) => setTimeout(res, 30)); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(writes).toBe(0);
    expect(sent.filter((r) => r.method !== 'GET')).toEqual([]);
    const exp = await item(menu['menu.export']);
    expect(exp).not.toHaveAttribute('aria-disabled', 'true');
    const dl = captureDownload();
    try {
      await act(async () => { fireEvent.click(exp); });
      expect(dl.names).toHaveLength(1);
      expect(await dl.blobs[0]!.text()).toContain('Round the cart total half up, please.');
    } finally { dl.restore(); }
  });

  const deleteRule = (st: 200 | 404 = 200) => reply(agent.sessionRoutes.delete, (r) => { sent.push(r); return st === 200 ? answers.ok({ status: 'ok', closed: true, hard: true }) : answers.refused(404, 'not_found'); });
  const pressDelete = async () => {
    await openMenu();
    await act(async () => { fireEvent.click(await item(menu['menu.delete'])); });
    const d = await screen.findByRole('alertdialog');
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: menu['delete.go'] })); });
    return d;
  };
  const deletes = () => sent.filter((r) => r.method === 'DELETE' && /\/sessions\/[^/]+$/.test(r.path));

  it('Delete from the open chat: one hard delete to the shown computer, the list reloads, and the page leaves the deleted chat', async () => {
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), deleteRule(), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    const router = await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(listReads()).toBeGreaterThan(0));
    const before = listReads();
    await pressDelete();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0]!.path).toContain(`/sessions/${SID}`);
    expect(deletes()[0]!.target?.container.id).toBe(atlas.id);
    await waitFor(() => expect(listReads()).toBeGreaterThan(before));
    await waitFor(() => expect(router.state.location.pathname.startsWith('/ai/c/')).toBe(false));
    expect(deletes()).toHaveLength(1);
  });

  it('a delete the agent could not find leaves the chat open, reloads the list and says nothing was deleted', async () => {
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), deleteRule(404), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    const router = await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(listReads()).toBeGreaterThan(0));
    const before = listReads();
    const d = await pressDelete();
    await waitFor(() => expect(within(d).getByText(menu['delete.missing'])).toBeInTheDocument());
    await waitFor(() => expect(listReads()).toBeGreaterThan(before));
    expect(router.state.location.pathname.startsWith('/ai/c/')).toBe(true);
  });

  it('a delete that finishes after the page moved to another chat never moves the page', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const held = reply(agent.sessionRoutes.delete, (r) => { sent.push(r); return gate.then(() => answers.ok({ status: 'ok', closed: true, hard: true })); });
    const h = provider(ACTIVE);
    provideActiveConversations(h.p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), held, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    const router = await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await pressDelete();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    const other = `/ai/c/s-other?computer=${HANDLE}&realm=${PERSONAL}`;
    await act(async () => { router.history.push(other); });
    await waitFor(() => expect(h.opened.at(-1)!.ref.sid).toBe('s-other'));
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); });
    expect(router.state.location.pathname).toBe('/ai/c/s-other');
    expect(deletes()).toHaveLength(1);
  });

  it('a delete that finishes after the page went back to the list does not navigate again', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const held = reply(agent.sessionRoutes.delete, (r) => { sent.push(r); return gate.then(() => answers.ok({ status: 'ok', closed: true, hard: true })); });
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), held, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    const router = await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await pressDelete();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    await act(async () => { router.history.push('/ai/ai-other-tab-probe'); });
    const away = router.state.location.pathname;
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); });
    expect(router.state.location.pathname).toBe(away);
  });

  it('a delete that finishes after the page moved to the same session id in another realm never moves the page', async () => {
    const OTHER = fixtureWorld.realms[1]!.id;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const held = reply(agent.sessionRoutes.delete, (r) => { sent.push(r); return gate.then(() => answers.ok({ status: 'ok', closed: true, hard: true })); });
    const h = provider(ACTIVE);
    provideActiveConversations(h.p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), held, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    const router = await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await pressDelete();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    await act(async () => { router.history.push(`/ai/c/${SID}?computer=${HANDLE}&realm=${OTHER}`); });
    await waitFor(() => expect(h.opened.at(-1)!.ref.realm).toBe(OTHER));
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); });
    expect(router.state.location.pathname).toBe(`/ai/c/${SID}`);
  });

  const BOREAL = fixtureWorld.computers[1]!;
  const BOREAL_HANDLE = `${BOREAL.name}.${BOREAL.id.slice(-4)}`;
  const heldDelete = () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const rule = reply(agent.sessionRoutes.delete, (r) => { sent.push(r); return gate.then(() => answers.ok({ status: 'ok', closed: true, hard: true })); });
    return { rule, release: () => release() };
  };

  it('a delete that finishes after the page moved to the same session id and realm on another computer never moves the page', async () => {
    const { rule, release } = heldDelete();
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), rule, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    const router = await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await pressDelete();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    await act(async () => { router.history.push(chat(BOREAL_HANDLE)); });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ computer: BOREAL_HANDLE }));
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); });
    expect(router.state.location.pathname).toBe(`/ai/c/${SID}`);
    expect(router.state.location.search).toMatchObject({ computer: BOREAL_HANDLE });
  });

  it('a delete that finishes after another computer was chosen in the top bar refreshes no list of the new computer', async () => {
    const { rule, release } = heldDelete();
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), rule, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await pressDelete();
    await waitFor(() => expect(deletes()).toHaveLength(1));
    await act(async () => { chooseComputer(BOREAL); });
    const lists = (id: string) => sent.filter((r) => r.method === 'GET' && /\/sessions$/.test(r.path) && r.target?.container.id === id).length;
    await waitFor(() => expect(lists(BOREAL.id)).toBeGreaterThan(0));
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    const settled = lists(BOREAL.id), atlasBefore = lists(atlas.id);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 200)); });
    expect(lists(BOREAL.id)).toBe(settled);
    expect(lists(atlas.id)).toBe(atlasBefore);
  });

  const CLOSE_KEY = () => attemptKey({ computer: HANDLE, realm: PERSONAL, sid: SID, target: atlas.id });
  const loopsRule = () => reply(agent.sessionRoutes.loops, () => answers.ok({ items: [], meta: { total: 0 } }));
  const closes = () => sent.filter((r) => r.method === 'POST' && /\/sessions\/[^/]+\/close$/.test(r.path));
  const pressClose = async () => {
    await openMenu();
    await act(async () => { fireEvent.click(await item(menu['menu.close'])); });
    const d = await screen.findByRole('alertdialog');
    const go = within(d).getByRole('button', { name: menu['close.go'] });
    await waitFor(() => expect(isOff(go)).toBe(false));
    await act(async () => { fireEvent.click(go); });
    return d;
  };
  // The tab's close records outlive a page: one test's unknown close must not lock the next.
  const endCloseRecord = () => { const a = closeAttempts.get(CLOSE_KEY()); if (a) closeAttempts.end(a, 'failed', 'refused'); };

  it('a Close the read-back proves reloads the matching list once, and sends one close to the shown computer', async () => {
    const rules = [reply(agent.sessionRoutes.close, (r) => { sent.push(r); return answers.ok({ status: 'ok' }); }), loopsRule()];
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), ...rules, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(listReads()).toBeGreaterThan(0));
    try {
      const before = listReads();
      await pressClose();
      await waitFor(() => expect(closes()).toHaveLength(1));
      await waitFor(() => expect(listReads()).toBe(before + 1));
      await act(async () => { await new Promise((res) => setTimeout(res, 60)); });
      expect(listReads()).toBe(before + 1);
      expect(closes()).toHaveLength(1);
      expect(closes()[0]!.path).toContain(`/sessions/${SID}`);
      expect(closes()[0]!.target?.container.id).toBe(atlas.id);
      expect(closeAttempts.get(CLOSE_KEY())).toBeUndefined();
    } finally { endCloseRecord(); }
  });

  it('a Close whose answer is lost stays unknown and reloads nothing', async () => {
    const rules = [reply(agent.sessionRoutes.close, (r) => { sent.push(r); return answers.lost(50); }), loopsRule()];
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), ...rules, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(listReads()).toBeGreaterThan(0));
    try {
      const before = listReads();
      await pressClose();
      await waitFor(() => expect(closes()).toHaveLength(1));
      await waitFor(() => expect(closeAttempts.get(CLOSE_KEY())?.phase).toBe('unknown'));
      await act(async () => { await new Promise((res) => setTimeout(res, 60)); });
      expect(listReads()).toBe(before);
      expect(closes()).toHaveLength(1);
    } finally { endCloseRecord(); }
  });

  it('a Close the read-back says is still attached ends failed and reloads nothing', async () => {
    let closeSent = false;
    const stillOpen = reply(agent.agentRoutes.session, () => answers.ok({ session: { id: SID, attached: true, live: true }, attached: true }), { when: () => closeSent });
    const rules = [reply(agent.sessionRoutes.close, (r) => { closeSent = true; sent.push(r); return answers.ok({ status: 'ok' }); }), loopsRule()];
    provideActiveConversations(provider(ACTIVE).p);
    sent = [];
    bootFixtureCore({ rules: [stillOpen, ...chatRules({ onSend: (r) => sent.push(r) }), ...rules, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    await openNoBoot(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(listReads()).toBeGreaterThan(0));
    try {
      const before = listReads();
      await pressClose();
      await waitFor(() => expect(closes()).toHaveLength(1));
      await waitFor(() => expect(closeAttempts.get(CLOSE_KEY())).toBeUndefined());
      expect(await screen.findByText(menu['close.open'])).toBeTruthy();
      await act(async () => { await new Promise((res) => setTimeout(res, 60)); });
      expect(listReads()).toBe(before);
    } finally { endCloseRecord(); }
  });

  it('a Close for a chat of another realm than the list shows reloads nothing (listShows)', async () => {
    const other = fixtureWorld.realms[1]!.id;
    const rules = [reply(agent.sessionRoutes.close, (r) => { sent.push(r); return answers.ok({ status: 'ok' }); }), loopsRule()];
    provideActiveConversations(provider({ ...ACTIVE, meta: { computer: HANDLE, realm: other, status: 'needs' } }).p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), ...rules, reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
    await openNoBoot(`/ai/c/${SID}?computer=${HANDLE}&realm=${other}`);
    await screen.findByText('Round the cart total half up, please.');
    const k = attemptKey({ computer: HANDLE, realm: other, sid: SID, target: atlas.id });
    try {
      const before = listReads();
      await pressClose();
      await waitFor(() => expect(closes()).toHaveLength(1));
      await waitFor(() => expect(closeAttempts.get(k)).toBeUndefined());
      await act(async () => { await new Promise((res) => setTimeout(res, 60)); });
      expect(listReads()).toBe(before);
    } finally { const a = closeAttempts.get(k); if (a) closeAttempts.end(a, 'failed', 'refused'); }
  });

  it('with no source (the chat cannot be read here) the header has no menu', async () => {
    provideActiveConversations(provider(SNAP, { refuse: true }).p);
    await open(chat());
    await screen.findByText(strings['conv.unavailable']);
    expect(screen.queryByRole('button', { name: menu['menu.label'] })).toBeNull();
  });
});

// AI-5b-2 Part B: "Auto-approve this reply" in the composer's Send menu. One pick is one send carrying it; Send stays plain;
// Strict hides it; a running turn shows it disabled with the reason; a refused auto send's Send it now asks for it again,
// only while the draft is still the refused text.
describe('AI-5b-2 Auto-approve this reply in the Send menu', () => {
  const sendMenu = () => screen.queryByRole('button', { name: kc['agent.sendMenu'] });
  const pick = async () => {
    await act(async () => { fireEvent.click(sendMenu()!); });
    return screen.getByRole('menuitem', { name: new RegExp(strings['conv.aat.label']) });
  };
  it('one pick is one send of the draft with autoApproveTurn; the next Send is plain', async () => {
    const h = provider(IDLE);
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Fix the tests.');
    const item = await pick();
    expect(screen.getByText(strings['conv.aat.desc'])).toBeInTheDocument();
    await act(async () => { fireEvent.click(item); });
    expect(h.ops.send).toHaveBeenCalledTimes(1);
    expect(h.ops.send.mock.calls[0]).toEqual([{ text: 'Fix the tests.' }, { autoApproveTurn: true }]);
    await waitFor(() => expect(box().value).toBe(''));
    type('And the docs.');
    await act(async () => { fireEvent.click(sendButton()); });
    expect(h.ops.send.mock.calls[1]![0]).toEqual({ text: 'And the docs.' });
    expect(h.ops.send.mock.calls[1]![1], 'a plain Send asks for nothing').toBeUndefined();
  });
  it('Strict hides it', async () => {
    provideActiveConversations(provider({ ...IDLE, facts: { ...IDLE.facts, approval: 'always' } }).p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Fix the tests.');
    expect(sendMenu()).toBeNull();
  });
  it('while a turn runs it is disabled with the reason, and choosing it sends nothing', async () => {
    const h = provider(RUNNING);
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Fix the tests.');
    const item = await pick();
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(strings['conv.aat.why.later'])).toBeInTheDocument();
    await act(async () => { fireEvent.click(item); });
    expect(h.ops.send).not.toHaveBeenCalled();
  });
  it('a refused auto send keeps the text, and Send it now asks for it again (never without it)', async () => {
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(async () => ({ k: 'refused', code: 'auto_turn_unavailable' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Fix the tests.');
    await act(async () => { fireEvent.click(await pick()); });
    expect(await screen.findByText(strings['conv.send.notSent'])).toBeInTheDocument();
    expect(box().value).toBe('Fix the tests.');
    h.ops.send.mockImplementation(async () => DONE);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.again'] })); });
    expect(h.ops.send).toHaveBeenCalledTimes(2);
    expect(h.ops.send.mock.calls[1]).toEqual([{ text: 'Fix the tests.' }, { autoApproveTurn: true }]);
  });
  it('text edited after an auto refusal: Send it now sends it plain; auto is never inherited by other text', async () => {
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(async () => ({ k: 'refused', code: 'auto_turn_unavailable' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Fix the tests.');
    await act(async () => { fireEvent.click(await pick()); });
    expect(await screen.findByText(strings['conv.send.notSent'])).toBeInTheDocument();
    type('Delete the database.');
    h.ops.send.mockImplementation(async () => DONE);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.again'] })); });
    expect(h.ops.send).toHaveBeenCalledTimes(2);
    expect(h.ops.send.mock.calls[1]![0]).toEqual({ text: 'Delete the database.' });
    expect(h.ops.send.mock.calls[1]![1], 'edited text goes plain').toBeUndefined();
  });
  it('text edited while the auto send is pending, then refused: Send it now sends the new text plain', async () => {
    let refuse!: () => void;
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(() => new Promise((r) => { refuse = () => r({ k: 'refused', code: 'auto_turn_unavailable' }); })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Fix the tests.');
    await act(async () => { fireEvent.click(await pick()); });
    expect(h.ops.send).toHaveBeenCalledTimes(1);
    type('Delete the database.');
    await act(async () => { refuse(); });
    expect(await screen.findByText(strings['conv.send.notSent'])).toBeInTheDocument();
    expect(box().value).toBe('Delete the database.');
    h.ops.send.mockImplementation(async () => DONE);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['conv.send.again'] })); });
    expect(h.ops.send).toHaveBeenCalledTimes(2);
    expect(h.ops.send.mock.calls[1]![0]).toEqual({ text: 'Delete the database.' });
    expect(h.ops.send.mock.calls[1]![1], 'text written while pending goes plain').toBeUndefined();
  });
  it('an unknown auto send holds Send like any other (C9): nothing offers it again', async () => {
    const h = provider(IDLE, { ops: { send: vi.fn<Ops['send']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    type('Fix the tests.');
    await act(async () => { fireEvent.click(await pick()); });
    expect(await screen.findByText(strings['conv.send.unknown'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['conv.send.again'] })).toBeNull();
    type('Again.');
    const item = await pick();
    expect(item.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(item); });
    expect(h.ops.send).toHaveBeenCalledTimes(1);
  });
});

describe('AI-11b-2 Remove what follows on a finished reply (the turn menu in the open chat)', () => {
  const THREE: ConvSnapshot = {
    ...SNAP,
    facts: { ...FACTS, mode: 'active', state: 'idle', turn: false, gate: 'none', completedTurns: 3 },
    gates: [],
    blocks: [
      { k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000 },
      { k: 'reply', key: 'r1', text: 'Found it: the total rounds down in cart.ts.', streaming: false, final: true, cost: null, at: 2000, turn: 0 },
      { k: 'user', key: 'u2', text: 'Now add a test.', at: 3000 },
      { k: 'reply', key: 'r2', text: 'Added cart.test.ts.', streaming: false, final: true, cost: null, at: 4000, turn: 1 },
      { k: 'user', key: 'u3', text: 'Run them.', at: 5000 },
      { k: 'reply', key: 'r3', text: 'All green.', streaming: false, final: true, cost: null, at: 6000, turn: 2 },
    ],
  };
  const KEY = attemptKey({ computer: HANDLE, realm: PERSONAL, sid: SID, target: atlas.id });
  // The tab's trim records outlive a page (by design): a record one test leaves must not lock the next.
  afterEach(() => { const a = trimAttempts.get(KEY); if (a) trimAttempts.end(a, 'failed'); });
  const trims = () => sent.filter((r) => r.method === 'POST' && /\/sessions\/[^/]+\/trim$/.test(r.path));
  const turnsOf2 = (n: number, realm: string = PERSONAL) => ({ session_id: SID, realm, after_turn: 0, turns_total: n, turns_returned: n, turn_boundaries: Array.from({ length: n }, (_, i) => i * 4 + 1), messages: Array.from({ length: n * 4 }, () => ({})) });
  const usage = () => reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }));
  const trimRule = (a: () => ReturnType<typeof answers.ok> | ReturnType<typeof answers.lost> | ReturnType<typeof answers.refused>) => reply(agent.sessionRoutes.trim, (r) => { sent.push(r); return a(); });
  const transcriptRule = (n: number | 'bad', realm?: string) => reply(agent.sessionRoutes.transcript, (r) => { sent.push(r); return answers.ok(n === 'bad' ? { nope: true } : turnsOf2(n, realm)); });
  const boot = async (snap: ConvSnapshot, rules: ReturnType<typeof reply>[]) => {
    const h = provider(snap);
    provideActiveConversations(h.p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), usage(), ...rules] });
    await openNoBoot(chat());
    await screen.findByText('All green.');
    return h;
  };
  const menus = () => screen.findAllByRole('button', { name: fm['tm.more'] });
  const pressItem = async (reply: 0 | 1 | 2) => {
    await act(async () => { fireEvent.click((await menus())[reply]!); });
    return screen.findByRole('menuitem', { name: new RegExp(ti['trim.item']) });
  };
  const confirm = async () => {
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(ti['trim.item']) })); });
    const d = await screen.findByRole('alertdialog');
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: td['trim.go'] })); });
    return d;
  };

  it('every indexed finished reply carries the menu; Remove what follows is offered where something follows and says why where nothing does', async () => {
    await boot(THREE, []);
    expect(await menus()).toHaveLength(3);
    for (const i of [0, 1] as const) {
      expect(await pressItem(i)).not.toHaveAttribute('aria-disabled', 'true');
      await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); });
    }
    const last = await pressItem(2);
    expect(last).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menu').textContent).not.toBe('');
  });

  it('a reply finished live has no turn index and so no menu (nothing is offered that the daemon could cut at the wrong place)', async () => {
    const live: ConvSnapshot = { ...THREE, blocks: [...THREE.blocks, { k: 'user', key: 'u4', text: 'And again.', at: 7000 }, { k: 'reply', key: 'r4', text: 'Done again.', streaming: false, final: true, cost: null, at: 8000 }] };
    const h = provider(live);
    provideActiveConversations(h.p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), usage()] });
    await openNoBoot(chat());
    await screen.findByText('Done again.');
    expect(await menus()).toHaveLength(3);
  });

  it('a 202 whose body looks done is not done: the record stays unknown, the chat is not reloaded, nothing is sent again', async () => {
    const h = await boot(THREE, [trimRule(() => ({ ...answers.ok({ status: 'ok', outcome: 'done' }), status: 202 })), transcriptRule(3)]);
    await pressItem(1);
    await confirm();
    await waitFor(() => expect(trimAttempts.get(KEY)?.phase).toBe('unknown'));
    expect(trims()).toHaveLength(1);
    expect(h.opened).toHaveLength(1);
  });

  it('a running turn disables it with the table\'s own reason, and nothing is sent', async () => {
    await boot({ ...THREE, turnId: 'T1', facts: { ...THREE.facts, state: 'running', turn: true } }, []);
    const it0 = await pressItem(0);
    expect(it0).toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(it0); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(trims()).toHaveLength(0);
  });

  it('the trim is sent once to the shown computer with the kept turn, and a 200 done reopens the chat so the transcript is read again', async () => {
    const h = await boot(THREE, [trimRule(() => answers.ok({ status: 'ok', outcome: 'done' }))]);
    expect(h.opened).toHaveLength(1);
    await pressItem(1);
    await confirm();
    await waitFor(() => expect(trims()).toHaveLength(1));
    expect(trims()[0]!.path).toContain(`/sessions/${SID}/trim`);
    expect(trims()[0]!.target?.container.id).toBe(atlas.id);
    expect(trims()[0]!.body).toEqual({ turn_idx: 1 });
    await waitFor(() => expect(h.opened.length).toBeGreaterThan(1));
    expect(h.opened[0]!.release).toHaveBeenCalled();
    expect(trims()).toHaveLength(1);
    expect(trimAttempts.get(KEY)).toBeUndefined();
  });

  it('a lost answer is unknown (C9): the chat is not reloaded, the item stays for Check again, and nothing is sent twice', async () => {
    const h = await boot(THREE, [trimRule(() => answers.lost(50)), transcriptRule(3)]);
    await pressItem(1);
    await confirm();
    await waitFor(() => expect(trimAttempts.get(KEY)?.phase).toBe('unknown'));
    expect(trims()).toHaveLength(1);
    expect(h.opened).toHaveLength(1);
    const d = await screen.findByRole('alertdialog');
    expect(isOff(within(d).getByRole('button', { name: td['trim.go'] }))).toBe(true);
    // Three finished turns still: the read proves nothing was cut (keeping through turn 1 leaves 2), so it stays unknown.
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: /check/i })); });
    await waitFor(() => expect(sent.filter((r) => /\/transcript$/.test(r.path))).toHaveLength(1));
    expect(trimAttempts.get(KEY)?.phase).toBe('unknown');
    expect(h.opened).toHaveLength(1);
    expect(trims()).toHaveLength(1);
  });

  it('Check again proves the cut from the whole transcript (exactly the kept turns), then reopens the chat once', async () => {
    const h = await boot(THREE, [trimRule(() => answers.lost(50)), transcriptRule(2)]);
    await pressItem(1);
    await confirm();
    await waitFor(() => expect(trimAttempts.get(KEY)?.phase).toBe('unknown'));
    const d = await screen.findByRole('alertdialog');
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: /check/i })); });
    await waitFor(() => expect(trimAttempts.get(KEY)).toBeUndefined());
    await waitFor(() => expect(h.opened.length).toBeGreaterThan(1));
    expect(trims()).toHaveLength(1);
  });

  it('a read of the same session id in another realm proves nothing: the record stays unknown, the chat is not reloaded', async () => {
    const h = await boot(THREE, [trimRule(() => answers.lost(50)), transcriptRule(2, 'cccccccccccccccccccccccc')]);
    await pressItem(1);
    await confirm();
    await waitFor(() => expect(trimAttempts.get(KEY)?.phase).toBe('unknown'));
    const d = await screen.findByRole('alertdialog');
    await act(async () => { fireEvent.click(within(d).getByRole('button', { name: /check/i })); });
    await waitFor(() => expect(sent.filter((r) => /\/transcript$/.test(r.path))).toHaveLength(1));
    expect(trimAttempts.get(KEY)?.phase).toBe('unknown');
    expect(h.opened).toHaveLength(1);
  });

  it('a trim that finishes after the top bar chose another computer (the URL still names the first) never reopens the chat now shown', async () => {
    const BOREAL = fixtureWorld.computers[1]!;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const h = provider(THREE);
    provideActiveConversations(h.p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), usage(), reply(agent.sessionRoutes.trim, (r) => { sent.push(r); return gate.then(() => answers.ok({ status: 'ok', outcome: 'done' })); })] });
    await openNoBoot(chat());
    await screen.findByText('All green.');
    await pressItem(1);
    await confirm();
    await waitFor(() => expect(trims()).toHaveLength(1));
    await act(async () => { chooseComputer(BOREAL); });
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    const opened = h.opened.length;
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 200)); });
    await waitFor(() => expect(trimAttempts.get(KEY)).toBeUndefined());
    expect(h.opened).toHaveLength(opened);
  });

  it('a trim that may have gone through keeps the item available on the last reply, where the table now says nothing follows', async () => {
    const h = await boot(THREE, [trimRule(() => answers.lost(50))]);
    await pressItem(1);
    await confirm();
    await waitFor(() => expect(trimAttempts.get(KEY)?.phase).toBe('unknown'));
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); });
    h.set({ ...THREE, facts: { ...THREE.facts, completedTurns: 2 }, blocks: THREE.blocks.slice(0, 4) });
    const only = await pressItem(1);
    expect(only).not.toHaveAttribute('aria-disabled', 'true');
  });

  it.each([['Rename', renameAttempts], ['Close', closeAttempts], ['Delete', deleteAttempts]] as const)('an unsettled %s of the open chat holds the Remove what follows confirm back, and nothing is sent', async (_n, store) => {
    await boot(THREE, [trimRule(() => answers.ok({ status: 'ok', outcome: 'done' }))]);
    const rec = { key: KEY, chat: { computer: HANDLE, realm: PERSONAL, sid: SID, target: atlas.id }, sid: SID, realm: PERSONAL, calls: {}, name: 'x', phase: 'unknown' } as never;
    (store as { set(a: never): void }).set(rec);
    try {
      await pressItem(1);
      await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(ti['trim.item']) })); });
      const d = await screen.findByRole('alertdialog');
      expect(isOff(within(d).getByRole('button', { name: td['trim.go'] }))).toBe(true);
      expect(within(d).getByText(new RegExp(td['trim.blocked']))).toBeInTheDocument();
      await act(async () => { fireEvent.click(within(d).getByRole('button', { name: td['trim.go'] })); });
      expect(trims()).toHaveLength(0);
      expect(trimAttempts.get(KEY)).toBeUndefined();
    } finally {
      (store as { end(a: never, p: 'failed'): void }).end(rec, 'failed');
    }
  });

  it('a definite refusal (a turn started meanwhile) says so, leaves no record, and the chat is not reloaded', async () => {
    const h = await boot(THREE, [trimRule(() => answers.refused(409, 'turn_in_flight'))]);
    await pressItem(1);
    await confirm();
    expect(await screen.findByText(td['trim.busy'])).toBeInTheDocument();
    expect(trimAttempts.get(KEY)).toBeUndefined();
    expect(h.opened).toHaveLength(1);
    expect(trims()).toHaveLength(1);
  });

  it('the daemon\'s 500 trim_failed (through the real route) says nothing was removed, leaves no record, and the chat is not reloaded', async () => {
    const h = await boot(THREE, [trimRule(() => answers.refused(500, 'trim_failed'))]);
    await pressItem(1);
    await confirm();
    expect(await screen.findByText(td['trim.failed'])).toBeInTheDocument();
    expect(trimAttempts.get(KEY)).toBeUndefined();
    expect(h.opened).toHaveLength(1);
    expect(trims()).toHaveLength(1);
  });

  it('a trim that finishes after the page moved to another chat never reopens the chat now shown', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const h = provider(THREE);
    provideActiveConversations(h.p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), usage(), reply(agent.sessionRoutes.trim, (r) => { sent.push(r); return gate.then(() => answers.ok({ status: 'ok', outcome: 'done' })); })] });
    const router = await openNoBoot(chat());
    await screen.findByText('All green.');
    await pressItem(1);
    await confirm();
    await waitFor(() => expect(trims()).toHaveLength(1));
    await act(async () => { router.history.push(`/ai/c/s-other?computer=${HANDLE}&realm=${PERSONAL}`); });
    await waitFor(() => expect(h.opened.at(-1)!.ref.sid).toBe('s-other'));
    const opened = h.opened.length;
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); });
    await waitFor(() => expect(trimAttempts.get(KEY)).toBeUndefined());
    expect(h.opened).toHaveLength(opened);
    expect(router.state.location.pathname).toBe('/ai/c/s-other');
  });
});

describe('AI-11a-2 Fork from here on a finished reply (the turn menu in the open chat)', () => {
  const FOUR: ConvSnapshot = {
    ...SNAP,
    facts: { ...FACTS, mode: 'active', state: 'idle', turn: false, gate: 'none', completedTurns: 2 },
    gates: [],
    blocks: [
      { k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000 },
      { k: 'reply', key: 'r1', text: 'Found it: the total rounds down in cart.ts.', streaming: false, final: true, cost: null, at: 2000, turn: 0 },
      { k: 'user', key: 'u2', text: 'Now add a test.', at: 3000 },
      { k: 'reply', key: 'r2', text: 'Added cart.test.ts.', streaming: false, final: true, cost: null, at: 4000, turn: 1 },
    ],
  };
  const usage = () => reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }));
  const boot = async (snap: ConvSnapshot, o: Parameters<typeof provider>[1] = {}) => {
    toasts.length = 0;
    forkOrigins.clear();
    const h = provider(snap, o);
    provideActiveConversations(h.p);
    sent = [];
    bootFixtureCore({ rules: [...chatRules({ onSend: (r) => sent.push(r) }), usage()] });
    const router = await openNoBoot(chat());
    await screen.findByText('Added cart.test.ts.');
    return { h, router };
  };
  const menus = () => screen.findAllByRole('button', { name: fm['tm.more'] });
  const openMenu = async (reply: 0 | 1) => { await act(async () => { fireEvent.click((await menus())[reply]!); }); };
  const forkItem = () => screen.findByRole('menuitem', { name: new RegExp(fm['tm.fork']) });
  const fill1 = (k: string, n: number) => fill(fm[k as keyof typeof fm], { n: String(n) });

  it('Fork from here is offered on every indexed reply, beside Remove what follows (the danger item stays last)', async () => {
    await boot(FOUR, { fork: vi.fn(async (): Promise<ForkOutcome> => ({ k: 'refused', words: 'x', reason: 'refused' })) });
    expect(await menus()).toHaveLength(2);
    await openMenu(0);
    const names = (await screen.findAllByRole('menuitem')).map((x) => x.textContent ?? '');
    expect(names.findIndex((x) => x.includes(fm['tm.fork']))).toBe(0);
    expect(names.findIndex((x) => x.includes(ti['trim.item']))).toBe(1);
    expect(await forkItem()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('a press forks from that reply\'s turn once, and opens the new chat only once the create is settled', async () => {
    const fork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-forked' }));
    const { router } = await boot(FOUR, { fork });
    await openMenu(1);
    await act(async () => { fireEvent.click(await forkItem()); });
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/s-forked'));
    expect(fork).toHaveBeenCalledTimes(1);
    expect(fork).toHaveBeenCalledWith({ turn: 1 });
    expect(router.state.location.search).toMatchObject({ computer: HANDLE, realm: PERSONAL });
  });

  it('a refusal says why and stays on this chat; an unknown outcome says it may have been made and opens nothing', async () => {
    let next: ForkOutcome = { k: 'refused', words: 'The agent did not fork it.', reason: 'refused' };
    const fork = vi.fn(async () => next);
    const { router } = await boot(FOUR, { fork });
    await openMenu(0);
    await act(async () => { fireEvent.click(await forkItem()); });
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(fill1('tm.forkRefused', 1)));
    expect(toasts.find((x) => x.title === fill1('tm.forkRefused', 1))?.body).toBe('The agent did not fork it.');
    next = { k: 'unknown', words: 'No answer came.', reason: 'lost', k1: 'k-lost' };
    await openMenu(1);
    await act(async () => { fireEvent.click(await forkItem()); });
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(fill1('tm.forkUnknown', 2)));
    expect(router.state.location.pathname).toBe(`/ai/c/${SID}`);
    expect(fork).toHaveBeenCalledTimes(2);
  });

  it('a fork that opened but whose chat has no link here says it was made and where to find it, and navigates nowhere', async () => {
    const fork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 'not a link' }));
    const { router } = await boot(FOUR, { fork });
    await openMenu(0);
    await act(async () => { fireEvent.click(await forkItem()); });
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(fill1('tm.forkMade', 1)));
    expect(router.state.location.pathname).toBe(`/ai/c/${SID}`);
  });

  it('a reply whose earlier fork is still unconfirmed offers Check the fork (the source\'s recovery reaches the menu); Check opens the chat once it proves it', async () => {
    const row: ForkRowView = { k1: 'k-pending', parent: SID, turn: 0, bad: false, hidden: false, mine: false };
    const fork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-never' }));
    const checkFork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-recovered' }));
    const { router } = await boot(FOUR, { fork, recover: { checkFork, forks: () => [row] } });
    await openMenu(1);
    expect(await forkItem()).not.toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); });
    await openMenu(0);
    expect(screen.queryByRole('menuitem', { name: new RegExp(fm['tm.fork']) })).toBeNull();
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: fm['tm.check'] })); });
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/s-recovered'));
    expect(checkFork).toHaveBeenCalledTimes(1);
    expect(checkFork).toHaveBeenCalledWith('k-pending');
    expect(fork).not.toHaveBeenCalled();
  });

  it('a Check decided for an account that is no longer shown opens nothing: it becomes unknown, and the row stays for another Check', async () => {
    const row: ForkRowView = { k1: 'k-pending', parent: SID, turn: 0, bad: false, hidden: false, mine: false };
    let shown = true;
    const checkFork = vi.fn(async (): Promise<ForkOutcome> => {
      shown = false;
      return { k: 'opened', sid: 's-recovered', guard: { still: () => shown, moved: { words: 'The signed-in account changed.', k1: 'k-pending' } } };
    });
    const { router } = await boot(FOUR, { fork: vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-never' })), recover: { checkFork, forks: () => [row] } });
    await openMenu(0);
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: fm['tm.check'] })); });
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(fill1('tm.forkUnknown', 1)));
    expect(toasts.find((x) => x.title === fill1('tm.forkUnknown', 1))?.body).toBe('The signed-in account changed.');
    expect(router.state.location.pathname).toBe(`/ai/c/${SID}`);
    expect(checkFork).toHaveBeenCalledTimes(1);
    expect(forkOrigins.size()).toBe(0); // the guard made it unknown: no record is kept for a chat that never opens
  });

  // A fork or a Check whose answer comes only when the test releases it, so the page can move first.
  const held = () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    return { gate, release: async () => { await act(async () => { release(); await new Promise((r) => setTimeout(r, 100)); }); } };
  };
  const OTHER_REALM = fixtureWorld.realms[1]!.id;
  const OTHER_COMPUTER = `${fixtureWorld.computers[1]!.name}.${fixtureWorld.computers[1]!.id.slice(-4)}`;
  const forkAndMove = async (how: 'fork' | 'check', move: (r: Awaited<ReturnType<typeof boot>>['router']) => Promise<void>) => {
    const h = held();
    const row: ForkRowView = { k1: 'k-pending', parent: SID, turn: 0, bad: false, hidden: false, mine: false };
    const late = async (): Promise<ForkOutcome> => { await h.gate; return { k: 'opened', sid: 's-late' }; };
    const { router } = await boot(FOUR, how === 'fork' ? { fork: vi.fn(late) } : { fork: vi.fn(late), recover: { checkFork: vi.fn(late), forks: () => [row] } });
    await openMenu(0);
    await act(async () => { fireEvent.click(how === 'fork' ? await forkItem() : await screen.findByRole('menuitem', { name: fm['tm.check'] })); });
    await move(router);
    const at = `${router.state.location.pathname}${router.state.location.searchStr}`;
    await h.release();
    return { router, at };
  };
  const moves: Record<string, (r: Awaited<ReturnType<typeof boot>>['router']) => Promise<void>> = {
    'to another chat': async (r) => { await act(async () => { r.history.push(`/ai/c/s-other?computer=${HANDLE}&realm=${PERSONAL}`); }); await waitFor(() => expect(r.state.location.pathname).toBe('/ai/c/s-other')); },
    'to the same chat in another realm': async (r) => { await act(async () => { r.history.push(`/ai/c/${SID}?computer=${HANDLE}&realm=${OTHER_REALM}`); }); await waitFor(() => expect(r.state.location.search).toMatchObject({ realm: OTHER_REALM })); },
    'to the same chat on another computer': async (r) => { await act(async () => { r.history.push(chat(OTHER_COMPUTER)); }); await waitFor(() => expect(r.state.location.search).toMatchObject({ computer: OTHER_COMPUTER })); },
    'away from the tab (the page unmounts)': async (r) => { await act(async () => { r.history.push('/ai/ai-other-tab-probe'); }); await waitFor(() => expect(r.state.location.pathname.startsWith('/ai/c/')).toBe(false)); },
  };
  for (const how of ['fork', 'check'] as const) {
    for (const [name, move] of Object.entries(moves)) {
      it(`a ${how} that is answered after the page moved ${name} never moves the page again, and says the fork was made`, async () => {
        const { router, at } = await forkAndMove(how, move);
        expect(`${router.state.location.pathname}${router.state.location.searchStr}`).toBe(at);
        expect(toasts.map((x) => x.title)).toContain(fill1('tm.forkMade', 1));
      });
    }
  }

  // The kit keeps the source of the render that made the menu: a toast's Try again / Check again runs on THAT source after the page moved.
  for (const how of ['retry', 'check'] as const) {
    for (const [name, move] of Object.entries(moves)) {
      if (name.startsWith('away')) continue;
      it(`the ${how === 'retry' ? 'Try again' : 'Check again'} of a toast, pressed after the page moved ${name}, is answered for the chat it was made on: nothing opens under the page now shown`, async () => {
        const row: ForkRowView = { k1: 'k-pending', parent: SID, turn: 0, bad: false, hidden: false, mine: false };
        let n = 0;
        const first = async (): Promise<ForkOutcome> => (how === 'retry' ? { k: 'refused', words: 'Not this time.', reason: 'refused' } : { k: 'unknown', words: 'No answer.', reason: 'lost', k1: 'k-pending' });
        const later = async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-late' });
        const fork = vi.fn(async (): Promise<ForkOutcome> => (n++ === 0 ? first() : later()));
        const checkFork = vi.fn(later);
        const { router } = await boot(FOUR, { fork, recover: { checkFork, forks: () => [row].filter(() => how === 'check' && n > 0) } });
        await openMenu(0);
        await act(async () => { fireEvent.click(await forkItem()); });
        await waitFor(() => expect(toasts.some((x) => x.action)).toBe(true));
        const action = toasts.find((x) => x.action)!.action!;
        await move(router);
        const at = `${router.state.location.pathname}${router.state.location.searchStr}`;
        await act(async () => { action.onAction(); await new Promise((r) => setTimeout(r, 100)); });
        expect(how === 'retry' ? fork : checkFork).toHaveBeenCalled();
        expect(`${router.state.location.pathname}${router.state.location.searchStr}`).toBe(at);
        expect(toasts.map((x) => x.title)).toContain(fill1('tm.forkMade', 1));
        expect(forkOrigins.size()).toBe(0);
      });
    }
  }

  it('a fork answered while its chat is still the one shown opens the new chat on that chat\'s computer and realm', async () => {
    const { router } = await forkAndMove('fork', async () => undefined);
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/s-late'));
    expect(router.state.location.search).toMatchObject({ computer: HANDLE, realm: PERSONAL });
    expect(forkOrigins.size()).toBe(0);
  });

  // Two operations on one chat that return the same new session id (a session id has one parent, so they were made on the same computer, realm and chat).
  for (const [name, firstMoved] of [['both answered', false], ['the first one\'s account guard says moved', true]] as const) {
    it(`two overlapping forks of one chat that return the same new chat (${name}) settle each on their own and navigate under no wrong origin`, async () => {
      const h = held();
      let shown = true;
      const guard = { still: () => shown, moved: { words: 'The signed-in account changed.', k1: 'k-1' } };
      let calls = 0;
      const fork = vi.fn(async (): Promise<ForkOutcome> => {
        const mine = calls++;
        await h.gate;
        if (mine === 0 && firstMoved) shown = false;
        return { k: 'opened', sid: 's-same', ...(mine === 0 && firstMoved ? { guard } : {}) };
      });
      const { router } = await boot(FOUR, { fork });
      await openMenu(0);
      await act(async () => { fireEvent.click(await forkItem()); });
      await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); });
      await openMenu(1);
      await act(async () => { fireEvent.click(await forkItem()); });
      await waitFor(() => expect(fork).toHaveBeenCalledTimes(2));
      await h.release();
      const titles = () => toasts.map((x) => x.title);
      if (firstMoved) {
        await waitFor(() => expect(titles()).toContain(fill1('tm.forkUnknown', 1)));
        expect(titles()).toContain(fill1('tm.forkMade', 2)); // the second finds no record: made, open it from the list
        expect(router.state.location.pathname).toBe(`/ai/c/${SID}`);
      } else {
        await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/s-same'));
        expect(router.state.location.search).toMatchObject({ computer: HANDLE, realm: PERSONAL });
        expect(titles()).toContain(fill1('tm.forkMade', 2));
      }
      expect(forkOrigins.size()).toBe(0);
    });
  }

  // Fork this chat: the header menu's item, the kit's whole-chat item on the SAME host as the reply item.
  const openHeader = async () => { await act(async () => { fireEvent.click(await screen.findByRole('button', { name: menu['menu.label'] })); }); };
  const wholeItem = () => screen.findByRole('menuitem', { name: new RegExp(fm['tm.wholeFork']) });
  const wholeRow = (over: Partial<ForkRowView> = {}): ForkRowView => ({ k1: 'k-whole', parent: SID, turn: null, bad: false, hidden: false, mine: false, ...over });

  it('the header menu offers Fork this chat first, and a press forks the whole chat (no turn) and opens the new chat only once it is settled', async () => {
    const h = held();
    const fork = vi.fn(async (): Promise<ForkOutcome> => { await h.gate; return { k: 'opened', sid: 's-whole' }; });
    const { router } = await boot(FOUR, { fork });
    await openHeader();
    const names = (await screen.findAllByRole('menuitem')).map((x) => x.textContent ?? '');
    expect(names[0]).toContain(fm['tm.wholeFork']);
    expect(names[1]).toContain(menu['menu.rename']);
    expect(await wholeItem()).not.toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(await wholeItem()); });
    await waitFor(() => expect(fork).toHaveBeenCalledTimes(1));
    expect((fork.mock.calls[0] as unknown[] | undefined)?.[0]).toBeUndefined(); // the whole chat: no turn, no pin
    expect(router.state.location.pathname).toBe(`/ai/c/${SID}`); // nothing opens while the create is unsettled
    await h.release();
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/s-whole'));
    expect(router.state.location.search).toMatchObject({ computer: HANDLE, realm: PERSONAL });
    expect(forkOrigins.size()).toBe(0);
  });

  for (const [name, outcome, title] of [
    ['refused', { k: 'refused', words: 'Not this time.', reason: 'refused' }, 'tm.wholeRefused'],
    ['unconfirmed', { k: 'unknown', words: 'No answer.', reason: 'lost', k1: 'k-whole' }, 'tm.wholeUnknown'],
  ] as const) {
    it(`a ${name} whole-chat fork says so in whole-chat words and opens nothing`, async () => {
      const { router } = await boot(FOUR, { fork: vi.fn(async (): Promise<ForkOutcome> => outcome) });
      await openHeader();
      await act(async () => { fireEvent.click(await wholeItem()); });
      await waitFor(() => expect(toasts.map((x) => x.title)).toContain(fm[title]));
      expect(router.state.location.pathname).toBe(`/ai/c/${SID}`);
    });
  }

  it('the capability table decides: a closed chat shows Fork this chat disabled and a press sends nothing', async () => {
    const fork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-whole' }));
    await boot({ ...FOUR, facts: { ...FOUR.facts, state: 'closed' } }, { fork });
    await openHeader();
    const it0 = await wholeItem();
    expect(it0).toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(it0); });
    expect(fork).not.toHaveBeenCalled();
  });

  it('a source that cannot fork gives the header menu no Fork item', async () => {
    await boot(FOUR, {});
    await openHeader();
    await screen.findByRole('menuitem', { name: new RegExp(menu['menu.rename']) });
    expect(screen.queryByRole('menuitem', { name: new RegExp(fm['tm.wholeFork']) })).toBeNull();
  });

  it('an unconfirmed whole-chat fork offers Check the fork, and Check opens the recovered chat', async () => {
    const checkFork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-recovered' }));
    const fork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-never' }));
    const { router } = await boot(FOUR, { fork, recover: { checkFork, forks: () => [wholeRow()] } });
    await openHeader();
    expect(screen.queryByRole('menuitem', { name: new RegExp(fm['tm.wholeFork']) })).toBeNull();
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: fm['tm.check'] })); });
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/s-recovered'));
    expect(checkFork).toHaveBeenCalledWith('k-whole');
    expect(fork).not.toHaveBeenCalled();
  });

  it('an unconfirmed fork of a REPLY does not turn the header item into a Check', async () => {
    const checkFork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-recovered' }));
    await boot(FOUR, { fork: vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-never' })), recover: { checkFork, forks: () => [wholeRow({ k1: 'k-reply', turn: 0 })] } });
    await openHeader();
    expect(await wholeItem()).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('menuitem', { name: fm['tm.check'] })).toBeNull();
  });

  // A whole-chat fork or Check answered only when the test releases it, so the page can move first (the same moves as the reply item's fork cases).
  for (const how of ['fork', 'check'] as const) {
    for (const [name, move] of Object.entries(moves)) {
      it(`a whole-chat ${how} answered after the page moved ${name} never moves the page again, and says the fork was made`, async () => {
        const h = held();
        const late = async (): Promise<ForkOutcome> => { await h.gate; return { k: 'opened', sid: 's-late' }; };
        const { router } = await boot(FOUR, how === 'fork' ? { fork: vi.fn(late) } : { fork: vi.fn(late), recover: { checkFork: vi.fn(late), forks: () => [wholeRow()] } });
        await openHeader();
        await act(async () => { fireEvent.click(how === 'fork' ? await wholeItem() : await screen.findByRole('menuitem', { name: fm['tm.check'] })); });
        await move(router);
        const at = `${router.state.location.pathname}${router.state.location.searchStr}`;
        await h.release();
        expect(`${router.state.location.pathname}${router.state.location.searchStr}`).toBe(at);
        expect(toasts.map((x) => x.title)).toContain(fm['tm.wholeMade']);
        expect(forkOrigins.size()).toBe(0);
      });
    }
  }

  it('the capability table decides: a closed chat shows Fork disabled with its reason and a press sends nothing', async () => {
    const fork = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-forked' }));
    await boot({ ...FOUR, facts: { ...FOUR.facts, state: 'closed' } }, { fork });
    await openMenu(0);
    const it0 = await forkItem();
    expect(it0).toHaveAttribute('aria-disabled', 'true');
    await act(async () => { fireEvent.click(it0); });
    expect(fork).not.toHaveBeenCalled();
  });

  it('a source that cannot fork offers Remove what follows only', async () => {
    await boot(FOUR);
    await openMenu(0);
    await screen.findByRole('menuitem', { name: new RegExp(ti['trim.item']) });
    expect(screen.queryByRole('menuitem', { name: new RegExp(fm['tm.fork']) })).toBeNull();
  });
});

describe('a Stop without an answer on /ai/c is said once (C9)', () => {
  it('while the transcript says it (a stop line with Check again) the composer adds no note; once the line is gone the note is back', async () => {
    const h = provider(RUNNING, { ops: { stop: vi.fn<Ops['stop']>(async () => ({ k: 'unknown' })) } });
    provideActiveConversations(h.p);
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.stop'] })); });
    // Before the transcript says anything the note is the one message.
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    const line = 'Stop may have gone through. The task still showed as running when it was last read.';
    h.set({ ...RUNNING, blocks: [...RUNNING.blocks, { k: 'line', key: 's0', text: line, tone: 'info', recheck: true, stop: true }] });
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.queryByText(strings['conv.stop.unknown'])).toBeNull();
    expect(screen.getAllByText(/^Stop may have gone through/)).toHaveLength(1);
    // Stop stays held for the turn all the while.
    expect(isOff(screen.getByRole('button', { name: kc['agent.stop'] }))).toBe(true);
    // The line gone (a fresh engine knows nothing of the lost answer) while the Stop is still unresolved: the note is back.
    h.set(RUNNING);
    expect(await screen.findByText(strings['conv.stop.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(line)).toBeNull();
  });
});
