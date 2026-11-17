// The chat's own "/" commands. /exit opens the chat menu's Close and /rename its Rename (the same dialogs), /usage
// the Usage tab and /effort and /verbosity the Session tab of Details. None of them is sent; /exit or /usage with words after
// goes to the agent as typed.
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
import menu from './ConvMenu.strings.en.json';
import det from '@kit/agent/DetailsPanel.strings.en.json';
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

interface Fake { p: ActiveConversationProvider; send: ReturnType<typeof vi.fn>; setFacts(f: CapFacts): void }
/** The host's own draft files: none in these tests. */
const hostFiles: readonly DraftFile[] = [];
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
  { name: 'rename', description: 'Rename this session', kind: 'builtin', category: 'session', args: 'optional', tui_only: true },
  { name: 'usage', description: 'Show token usage', kind: 'builtin', category: 'session', args: 'none', tui_only: true },
  { name: 'effort', description: 'Set the thinking effort', kind: 'builtin', category: 'model', args: 'required', tui_only: true },
  { name: 'verbosity', description: 'Set the verbosity', kind: 'builtin', category: 'model', args: 'optional', tui_only: true },
  // A skill that takes the reserved name: /exit stays the Hub's.
  { name: 'exit', description: 'Wrap up the work', kind: 'skill' },
];
const option = (name: string) => screen.findByRole('option', { name: new RegExp('^/' + name) });
const dialog = () => screen.queryByRole('alertdialog') ?? screen.queryByRole('dialog');

describe('the chat\'s own "/" commands', () => {
  it('a typed /exit opens the chat\'s Close dialog (the menu\'s own), even before the list is read; nothing is sent', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/exit');
    await pressSend();
    expect(h.send).not.toHaveBeenCalled();
    expect(within(dialog()!).getByText(menu['close.title'])).toBeTruthy();
    expect(box().value).toBe('');
  });

  it('/exit with words after it is not the command: it goes to the agent as typed', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/exit now please');
    await pressSend();
    expect(dialog()).toBeNull();
    expect(lastDraft(h).text).toBe('/exit now please');
  });

  it('/rename picked from the list leaves "/rename " for a name; sent bare, Rename opens with the title shown now', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/ren');
    await act(async () => { fireEvent.click(await option('rename')); });
    expect(box().value).toBe('/rename ');
    expect(dialog()).toBeNull();
    await pressSend();
    expect(h.send).not.toHaveBeenCalled();
    expect(within(dialog()!).getByText(menu['rename.title'])).toBeTruthy();
    expect((within(dialog()!).getByRole('textbox', { name: menu['rename.label'] }) as HTMLInputElement).value).toBe('Fix the failing checkout tests'); // the chat row's title, as the header shows it
  });

  it('/rename with a name opens Rename with that name in the field; --auto starts it empty', async () => {
    for (const [typed, want] of [['/rename Cart totals', 'Cart totals'], ['/rename --auto', '']] as const) {
      const h = fake(async () => ({ k: 'done' }));
      await open(h);
      await type(typed);
      await pressSend();
      expect(h.send).not.toHaveBeenCalled();
      expect((within(dialog()!).getByRole('textbox', { name: menu['rename.label'] }) as HTMLInputElement).value).toBe(want);
      cleanup(); resetAttemptsForTests(); provideActiveConversations(null); queryClient.clear();
    }
  });

  it('one /exit is one open: Cancel closes it, and only a new /exit opens it again', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/exit');
    await pressSend();
    await act(async () => { fireEvent.click(within(dialog()!).getByRole('button', { name: /cancel/iu })); });
    await waitFor(() => expect(dialog()).toBeNull());
    await type('/ex');
    expect(dialog()).toBeNull();
    await type('/exit');
    await pressSend();
    expect(within(dialog()!).getByText(menu['close.title'])).toBeTruthy();
  });

  it('/usage opens Details on Usage, and /effort or /verbosity on Session; nothing is sent', async () => {
    for (const [typed, tab] of [['/usage', det['det.tab.usage']], ['/effort high', det['det.tab.session']], ['/verbosity', det['det.tab.session']]] as const) {
      const h = fake(async () => ({ k: 'done' }));
      await open(h);
      await type(typed);
      await pressSend();
      expect(h.send).not.toHaveBeenCalled();
      const tabs = await screen.findByRole('tablist', { name: det['det.tabs'] });
      expect(within(tabs).getByRole('tab', { name: tab }).getAttribute('aria-selected')).toBe('true');
      cleanup(); resetAttemptsForTests(); provideActiveConversations(null); queryClient.clear();
    }
  });

  it('/usage with words after it goes to the agent as typed', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/usage for this week');
    await pressSend();
    expect(lastDraft(h).text).toBe('/usage for this week');
  });

  it('a skill named exit never takes /exit: typed after the list is read, it still opens Close and sends nothing', async () => {
    const h = fake(async () => ({ k: 'done' }));
    await open(h);
    await type('/ex');
    await option('exit');
    await type('/exit');
    await pressSend();
    expect(h.send).not.toHaveBeenCalled();
    expect(within(dialog()!).getByText(menu['close.title'])).toBeTruthy();
  });
});
