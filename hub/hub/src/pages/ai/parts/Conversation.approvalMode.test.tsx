// The open chat's approvals control: the composer's chip reads the chat's approvals, and Allow everything reaches the chat's own
// active source (through the page's wrapper) once, only after the red confirm, naming this chat's computer; a source that has no
// switch of its own gets no write at all from here.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import {
  can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type ShellData,
} from '@kit';
import { forgetApprovalAttempts } from '@kit/agent/useApproval';
import strings from '@kit/agent/ApprovalMode.strings.en.json';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import { resetAttemptsForTests } from '@kit/agent/convComposer';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };
const LIVE: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const IDLE: ConvSnapshot = {
  facts: LIVE, turnConfirmed: true, title: 'Fix the cart total',
  blocks: [{ k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000 }],
  gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' },
};
const sent: string[] = [];
function provider(withSwitch: boolean) {
  const setAutoApprove = vi.fn((_want: boolean, _at?: unknown) => true);
  const approvalChanged = vi.fn();
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source: ActiveSource = {
        kind: 'session', ref, snapshot: () => IDLE, subscribe: () => () => {}, watch: () => {}, can: (a) => can(a, IDLE.facts),
        send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide: async () => ({ k: 'done' }), answer: async () => ({ k: 'done' }),
        check: async () => ({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
        ...(withSwitch ? { setAutoApprove, approvalChanged } : {}),
      };
      return { source, release: vi.fn() };
    },
  };
  return { p, setAutoApprove };
}

async function open() {
  const usage = reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }));
  const read = reply(agent.agentRoutes.approval, () => answers.ok({ mode: 'default', locked: false, revision: 1, yolo: false }));
  // No write of the approvals may leave the page's own hook in these cases: each is recorded.
  const yolo = reply(agent.agentRoutes.yolo, (r) => { sent.push(`yolo ${JSON.stringify(r.body)}`); return answers.ok({ yolo: true }); });
  const mode = reply(agent.approvalRoutes.setMode, (r) => { sent.push(`mode ${JSON.stringify(r.body)}`); return answers.ok({}); });
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), usage, read, yolo, mode] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
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
  await screen.findByText('Round the cart total half up, please.');
}
const chip = () => document.querySelector<HTMLElement>('[data-approval-mode]');
const everything = () => within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /^Allow everything/ });

beforeEach(() => {
  sent.length = 0;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
});
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  forgetApprovalAttempts();
  provideActiveConversations(null);
  queryClient.clear();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the approvals chip of an open chat', () => {
  it('shows the mode the chat has, in the composer bar', async () => {
    provideActiveConversations(provider(true).p);
    await open();
    await waitFor(() => expect(chip()?.getAttribute('data-approval-mode')).toBe('default'));
    expect(chip()?.textContent).toContain(strings['am.state.default']);
  });

  it('Allow everything: nothing is sent until the confirm; then the chat\'s own source gets it once, for this computer', async () => {
    const src = provider(true);
    provideActiveConversations(src.p);
    await open();
    await waitFor(() => expect(chip()?.getAttribute('data-approval-mode')).toBe('default'));
    fireEvent.click(chip()!);
    fireEvent.click(everything());
    const dlg = await screen.findByRole('alertdialog');
    expect(src.setAutoApprove).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: strings['am.confirmGo'] }));
    expect(src.setAutoApprove).toHaveBeenCalledTimes(1);
    const [want, at] = src.setAutoApprove.mock.calls[0]!;
    expect(want).toBe(true);
    expect((at as { container: { id: string } }).container.id).toBe(atlas.id);
    // The page's own approvals hook sent nothing: the write is the source's alone.
    expect(sent).toEqual([]);
  });

  it('Cancel sends nothing', async () => {
    const src = provider(true);
    provideActiveConversations(src.p);
    await open();
    await waitFor(() => expect(chip()?.getAttribute('data-approval-mode')).toBe('default'));
    fireEvent.click(chip()!);
    fireEvent.click(everything());
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(src.setAutoApprove).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('a source with no switch of its own: Allow everything is not offered and nothing is sent', async () => {
    provideActiveConversations(provider(false).p);
    await open();
    await waitFor(() => expect(chip()?.getAttribute('data-approval-mode')).toBe('default'));
    fireEvent.click(chip()!);
    expect(everything().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(everything());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sent).toEqual([]);
  });
});
