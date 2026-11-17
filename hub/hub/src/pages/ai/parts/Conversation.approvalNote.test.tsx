// The open chat's approvals chip and the note over the composer follow the chat's approvals as they are NOW: a mode change
// finished here is not said any more once auto-approve came on (from Details, or from another client whose switch reaches
// this page only as the chat's stream saying so), and a change whose outcome is unknown makes the chip unsure instead of
// naming the mode the last read had.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply, type Target } from '@core';
import {
  can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type ShellData,
} from '@kit';
import { forgetApprovalAttempts, takeApprovalAttempt, type ApprovalAttempt } from '@kit/agent/useApproval';
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
  auto: false, prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const IDLE: ConvSnapshot = {
  facts: LIVE, turnConfirmed: true, title: 'Fix the cart total',
  blocks: [{ k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000 }],
  gates: [], meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' },
};

/** The chat on the computer: its approvals as the agent holds them (any client may change them). */
const agentSide = { mode: 'always' as 'always' | 'default', yolo: false };
let seen: Target | null = null;

/** The chat's active source, whose facts move as its stream reports (`moved`), telling its subscribers. */
function provider() {
  let snap: ConvSnapshot = IDLE;
  const subs = new Set<() => void>();
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source: ActiveSource = {
        kind: 'session', ref, snapshot: () => snap, subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; }, watch: () => {},
        can: (a) => can(a, snap.facts),
        send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide: async () => ({ k: 'done' }), answer: async () => ({ k: 'done' }),
        check: async () => ({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
        setAutoApprove: vi.fn(() => true), approvalChanged: vi.fn(),
      };
      return { source, release: vi.fn() };
    },
  };
  const moved = (f: Partial<CapFacts>) => act(() => {
    snap = { ...snap, facts: { ...snap.facts, ...f } };
    for (const fn of [...subs]) fn();
  });
  return { p, moved };
}

async function open() {
  const usage = reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }));
  const read = reply(agent.agentRoutes.approval, (r) => {
    seen = r.target;
    return answers.ok({ mode: agentSide.mode, locked: false, revision: 1, yolo: agentSide.yolo });
  });
  const mode = reply(agent.approvalRoutes.setMode, (r) => { agentSide.mode = (r.body as { mode: 'always' | 'default' }).mode; return answers.ok({}); });
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), usage, read, mode] });
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
const modeIs = (m: string) => waitFor(() => expect(chip()?.getAttribute('data-approval-mode')).toBe(m));
const choose = (name: string) => {
  fireEvent.click(chip()!);
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: new RegExp(`^${name}`) }));
};
/** A switch of Allow everything another surface of this page takes (Details → Session, the dock), for this chat. */
function otherSurfaceTakes(want: boolean): ApprovalAttempt {
  expect(seen).not.toBeNull();
  let h: ApprovalAttempt | null = null;
  act(() => { h = takeApprovalAttempt(seen!, PERSONAL, SID, { field: 'yolo', value: want }); });
  expect(h).not.toBeNull();
  return h as unknown as ApprovalAttempt;
}
/** Ask every time → Ask when needed from the chip: the switch is read back and said over the composer. */
async function switchedToAskWhenNeeded() {
  await modeIs('always');
  choose('Ask when needed');
  await screen.findByText(strings['am.done.default']);
  await modeIs('default');
}

beforeEach(() => {
  agentSide.mode = 'always';
  agentSide.yolo = false;
  seen = null;
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

describe('the approvals note over the composer, after the mode was switched here', () => {
  it('another client turns Allow everything on: the chip follows the stream, and "now asks when needed" is not said any more', async () => {
    const src = provider();
    provideActiveConversations(src.p);
    await open();
    await switchedToAskWhenNeeded();
    // Only the chat's stream says so (no reply, approval or queue moved): the page reads the approvals again.
    agentSide.yolo = true;
    src.moved({ auto: true });
    await modeIs('everything');
    expect(screen.queryByText(strings['am.done.default'])).toBeNull();
  });

  it('a read that shows Allow everything on ends the "now asks when needed" note, whatever brought the read', async () => {
    const src = provider();
    provideActiveConversations(src.p);
    await open();
    await switchedToAskWhenNeeded();
    agentSide.yolo = true;
    src.moved({ turn: true });
    await modeIs('everything');
    expect(screen.queryByText(strings['am.done.default'])).toBeNull();
  });

  it('a switch of Allow everything from Details ends it as soon as it begins, and it does not come back after', async () => {
    const src = provider();
    provideActiveConversations(src.p);
    await open();
    await switchedToAskWhenNeeded();
    const h = otherSurfaceTakes(true);
    await waitFor(() => expect(screen.queryByText(strings['am.done.default'])).toBeNull());
    agentSide.yolo = true;
    act(() => h.settle());
    await modeIs('everything');
    expect(screen.queryByText(strings['am.done.default'])).toBeNull();
  });
});

describe('a switch whose outcome is unknown', () => {
  it('the chip is unsure (never the mode the last read had) and the note says it may have gone through', async () => {
    agentSide.mode = 'default';
    const src = provider();
    provideActiveConversations(src.p);
    await open();
    await modeIs('default');
    const h = otherSurfaceTakes(true);
    act(() => h.unknown());
    await modeIs('unknown');
    expect(chip()?.textContent).not.toContain(strings['am.state.default']);
    expect(screen.getByText(strings['am.maybe'])).toBeTruthy();
  });
});
