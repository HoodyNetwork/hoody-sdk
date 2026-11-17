// The AI tab and a turn whose end could not be read. The chat's source offers Check again (recheckOutcome: a read, never a
// send) on that line; `withHost` must hand it to the kit view like every other operation of the source, or the line says
// "Couldn't tell how this task ended" with nothing to press. A source without it shows the line alone.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import { can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import sv from '@kit/agent/SessionView.strings.en.json';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

const FACTS: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const UNSURE = "Couldn't tell how this task ended: it may have failed or finished.";
const SNAP: ConvSnapshot = {
  facts: FACTS, title: 'Fix the cart total', gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' },
  blocks: [
    { k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000 },
    { k: 'line', key: 'q0', text: UNSURE, tone: 'info', recheck: true },
  ],
};

function provider(o: { recheck: boolean }) {
  const recheckOutcome = vi.fn();
  const send = vi.fn(async () => ({ k: 'done' as const }));
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source = {
        kind: 'session', ref, snapshot: () => SNAP, subscribe: () => () => undefined, watch: () => undefined, can: (a: Parameters<ActiveSource['can']>[0]) => can(a, FACTS),
        send, stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: () => undefined, canDismiss: () => false,
        ...(o.recheck ? { recheckOutcome } : {}),
      } as unknown as ActiveSource;
      return { source, release: vi.fn() };
    },
  };
  return { p, recheckOutcome, send };
}

async function open() {
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }))] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
  await act(async () => {
    render(
      <ShellDataProvider value={shell}>
        <main id="hub-main"><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></main>
      </ShellDataProvider>,
    );
    await router.load();
  });
}

beforeEach(() => { Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 }); });
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  provideActiveConversations(null);
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the AI tab and a turn whose end could not be read', () => {
  it('offers Check again on the line; pressing it reads the chat again through the source and sends nothing', async () => {
    const h = provider({ recheck: true });
    provideActiveConversations(h.p);
    await open();
    await screen.findByText(UNSURE);
    const again = screen.getAllByRole('button', { name: sv['sv.checkAgain'] });
    expect(again).toHaveLength(1);
    fireEvent.click(again[0]!);
    expect(h.recheckOutcome).toHaveBeenCalledTimes(1);
    expect(h.send).not.toHaveBeenCalled();
  });
  it('a source that cannot read it again: the line alone, no Check again', async () => {
    const h = provider({ recheck: false });
    provideActiveConversations(h.p);
    await open();
    await screen.findByText(UNSURE);
    expect(screen.queryAllByRole('button', { name: sv['sv.checkAgain'] })).toHaveLength(0);
  });
});
