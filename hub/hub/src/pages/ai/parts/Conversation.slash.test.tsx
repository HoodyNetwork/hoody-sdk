// The "/" commands the AI tab's composer carries out itself. /clear asks first (it cannot be undone), then sends
// "/clear" exact, with no files, only between turns; /memory consolidate and /memory wipe are never sent and point to the Memory
// page; every other form goes to the agent as typed.
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
import strings from './Conversation.strings.en.json';
import { slashRoutes } from './slashData';
import { links } from '../links';

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
const RUNNING: CapFacts = { ...IDLE, state: 'running', turn: true };

const txt = (name: string, body: string) => new File([body], name, { type: 'text/plain' });

interface Fake { p: ActiveConversationProvider; send: ReturnType<typeof vi.fn>; setFacts(f: CapFacts): void }
/** The host's own draft files (a taken-back message's), as the active source reports them; empty unless a test sets them. */
let hostFiles: readonly DraftFile[] = [];
function fake(answer: (d: Draft) => Promise<SendOutcome>, facts: CapFacts = IDLE): Fake {
  let f = facts;
  const subs = new Set<() => void>();
  let snap: ConvSnapshot = { facts: f, title: 'Fix the cart total', gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' }, blocks: [] };
  const send = vi.fn((d: Draft) => answer(d));
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source = {
        kind: 'session', ref, snapshot: () => snap, subscribe: (cb: () => void) => { subs.add(cb); return () => subs.delete(cb); }, watch: () => undefined,
        can: (a: Parameters<ActiveSource['can']>[0]) => can(a, f),
        send, draftFiles: () => hostFiles, dropDraftFile: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: () => undefined, canDismiss: () => false,
      } as unknown as ActiveSource;
      return { source, release: vi.fn() };
    },
  };
  return { p, send, setFacts(n) { f = n; snap = { ...snap, facts: n }; act(() => { for (const cb of subs) cb(); }); } };
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
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
async function add(...files: File[]) {
  await act(async () => { fireEvent.change(fileInput(), { target: { files } }); });
}
const chips = () => { const l = screen.queryByRole('list', { name: kc['agent.attList'] }); return l ? within(l).queryAllByRole('listitem') : []; };
async function type(text: string) { await act(async () => { fireEvent.change(box(), { target: { value: text } }); }); }
async function pressSend() { await act(async () => { fireEvent.click(screen.getByRole('button', { name: kc['agent.send'] })); }); }
const lastDraft = (h: Fake): Draft => h.send.mock.calls.at(-1)![0] as Draft;
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
  { name: 'clear', description: 'Clear conversation history', kind: 'builtin', category: 'conversation', args: 'none', tui_only: false },
  { name: 'memory', description: 'Memory status', kind: 'builtin', category: 'session', args: 'optional', tui_only: false },
];
const option = (name: string) => screen.findByRole('option', { name: new RegExp('^/' + name) });
/** Types the draft, waits for the agent's list (the menu opens on "/"), then presses Send. */
async function sendTyped(text: string) {
  await type(text.split(' ')[0] as string);
  await option((text.split(' ')[0] as string).slice(1));
  await type(text);
  await pressSend();
}
const dialog = () => screen.queryByRole('alertdialog');
const clickIn = async (name: string) => { await act(async () => { fireEvent.click(within(dialog()!).getByRole('button', { name })); }); };

describe('the composer\'s own "/" commands', () => {
  it('a typed /clear asks first: Cancel sends nothing; Clear sends "/clear" once', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await sendTyped('/clear');
    expect(h.send).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain(strings['slash.clear.title']);
    expect(box().value, 'the draft empties: the command is the host\'s').toBe('');
    await clickIn('Cancel');
    await waitFor(() => expect(dialog()).toBeNull());
    expect(h.send).not.toHaveBeenCalled();
    await sendTyped('/clear');
    await clickIn(strings['slash.clear.confirm']);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(lastDraft(h)).toEqual({ text: '/clear' });
  });

  it('picking /clear in the menu opens the same confirm and sends nothing by itself', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/cl');
    const o = await option('clear');
    await act(async () => { fireEvent.click(o); });
    expect(dialog()?.textContent).toContain(strings['slash.clear.body']);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('the confirmed /clear carries no attached file: the files stay for the next message', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await add(txt('a.txt', 'hello'));
    await waitFor(() => expect(chips()).toHaveLength(1));
    await sendTyped('/clear');
    await clickIn(strings['slash.clear.confirm']);
    expect(lastDraft(h)).toEqual({ text: '/clear' });
    expect(chips()).toHaveLength(1);
  });

  it('the chat\'s draft holds a taken-back message\'s file: Clear sends nothing (the source would send the file with it) and says why', async () => {
    hostFiles = [{ id: 'f1', kind: 'text', name: 'notes.txt', url: null, bytes: 5, lines: 1 }];
    try {
      const h = fake(async () => ({ k: 'done' }));
      await open(h);
      await sendTyped('/clear');
      await clickIn(strings['slash.clear.confirm']);
      expect(h.send).not.toHaveBeenCalled();
      expect(screen.getByText(strings['slash.clear.files'])).toBeTruthy();
    } finally { hostFiles = []; }
  });

  it('"/clear" with a line break after it is not the agent\'s /clear: it goes as typed, with no confirm', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/clear');
    await option('clear');
    await type('/clear\n');
    await pressSend();
    expect(dialog()).toBeNull();
    expect(lastDraft(h).text).toBe('/clear\n');
  });

  it('/memory wipe sent before the agent\'s list was ever read is still never sent', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/memory wipe');
    await pressSend();
    expect(h.send).not.toHaveBeenCalled();
    expect(screen.getByText(strings['slash.memoryNote'].replace('{{what}}', 'wipe'))).toBeTruthy();
  });

  it('a turn that starts while the confirm is open: Clear sends nothing and says it waits', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await sendTyped('/clear');
    h.setFacts(RUNNING);
    await clickIn(strings['slash.clear.confirm']);
    expect(h.send).not.toHaveBeenCalled();
    expect(screen.getByText(strings['slash.clear.wait'])).toBeTruthy();
  });

  it('a follow-up still queued for the chat: Clear waits too, nothing sent', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await sendTyped('/clear');
    h.setFacts({ ...IDLE, queued: true });
    await clickIn(strings['slash.clear.confirm']);
    expect(h.send).not.toHaveBeenCalled();
    expect(screen.getByText(strings['slash.clear.wait'])).toBeTruthy();
  });

  it('a clear the agent refused, or whose answer was lost, says so', async () => {
    for (const o of [{ k: 'refused', code: 'x' }, { k: 'unknown' }] as const) {
      const h = fake(async () => o as SendOutcome);
      await open(h);
      await sendTyped('/clear');
      await clickIn(strings['slash.clear.confirm']);
      await waitFor(() => expect(screen.getByText(strings[o.k === 'refused' ? 'slash.clear.refused' : 'slash.clear.unknown'])).toBeTruthy());
      cleanup(); resetAttemptsForTests(); provideActiveConversations(null); queryClient.clear();
    }
  });

  it('/clear with words is not the agent\'s /clear: it goes as typed, with no confirm', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await sendTyped('/clear the cache');
    expect(dialog()).toBeNull();
    expect(lastDraft(h).text).toBe('/clear the cache');
  });

  it('/memory wipe and /memory consolidate are never sent: a note points to the Memory page', async () => {
    for (const what of ['wipe', 'Consolidate']) {
      const h = fake(async () => ({ k: 'done' }));
      const router = await open(h);
      await sendTyped('/memory ' + what);
      expect(h.send).not.toHaveBeenCalled();
      const note = strings['slash.memoryNote'].replace('{{what}}', what.toLowerCase());
      expect(screen.getByText(note)).toBeTruthy();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings['slash.memoryOpen'] })); });
      await waitFor(() => expect(router.state.location.pathname).toBe(links.memory));
      cleanup(); resetAttemptsForTests(); provideActiveConversations(null); queryClient.clear();
    }
  });

  it('/memory, bare or with status, is the agent\'s: sent as typed', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await sendTyped('/memory status');
    expect(lastDraft(h).text).toBe('/memory status');
  });
});
