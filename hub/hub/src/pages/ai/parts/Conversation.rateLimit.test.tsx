// The open chat's composer shows the Claude Code account's usage-limit chip from its active
// source's rateLimit(), read under the source's subscribe so a new reading redraws it; a source with no reading, or none at
// all (a native chat), shows no chip; the page's wrapper keeps the operation; and the chip's reset timer goes with the page.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import {
  can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type ShellData,
} from '@kit';
import type { RateLimitReading } from '@kit/agent/rateLimit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
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
/** The 5-hour window, limiting, resetting ten minutes from now. */
const reading = (utilization: number, status = 'allowed'): RateLimitReading => ({
  status, usingOverage: false, overageStatus: '', rev: 1, epoch: 1,
  windows: [{ name: 'five_hour', utilization, hasUtilization: true, resetsAt: Math.floor(Date.now() / 1000) + 600, limiting: true }],
} as RateLimitReading);

/** A source whose reading the test sets; `set` notifies its subscribers as an engine publish would. */
function provider(withLimit: boolean, first: RateLimitReading | null) {
  let held = first;
  const subs = new Set<() => void>();
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source: ActiveSource = {
        kind: 'session', ref, snapshot: () => IDLE, subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; }, watch: () => {}, can: (a) => can(a, IDLE.facts),
        send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide: async () => ({ k: 'done' }), answer: async () => ({ k: 'done' }),
        check: async () => ({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
        ...(withLimit ? { rateLimit: () => held } : {}),
      };
      return { source, release: vi.fn() };
    },
  };
  return { p, set: (r: RateLimitReading | null) => { held = r; act(() => { for (const f of [...subs]) f(); }); } };
}

async function open() {
  const usage = reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }));
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), usage] });
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
const chip = () => screen.queryByText(/^5-hour window /);

beforeEach(() => {
  // The clock is pinned to local noon (Date only, timers stay real): a reset past local midnight reads "Sat 00:08", not
  // the time alone these cases expect, so the real clock turned them red for the ten minutes before midnight.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0, 0));
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
});
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  provideActiveConversations(null);
  queryClient.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the usage-limit chip in the composer', () => {
  it('a Claude Code chat at 92% shows "5-hour window 92%, resets …" in the composer bar', async () => {
    provideActiveConversations(provider(true, reading(0.92)).p);
    await open();
    expect(chip()?.textContent).toMatch(/^5-hour window 92%, resets \d\d:\d\d$/);
  });

  it('a used-up window says so, with no number', async () => {
    provideActiveConversations(provider(true, reading(1, 'rejected')).p);
    await open();
    expect(chip()?.textContent).toMatch(/^5-hour window used up, resets \d\d:\d\d$/);
  });

  it('no reading yet: no chip; a reading that arrives later (the source publishes) draws it', async () => {
    const src = provider(true, null);
    provideActiveConversations(src.p);
    await open();
    expect(chip()).toBeNull();
    src.set(reading(0.75));
    expect(chip()?.textContent).toMatch(/^5-hour window 75%/);
  });

  it('a source without rateLimit (a native chat) shows no chip', async () => {
    provideActiveConversations(provider(false, null).p);
    await open();
    expect(chip()).toBeNull();
  });

  it('the chip’s reset timer is cleared when the page goes', async () => {
    const set = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    provideActiveConversations(provider(true, reading(0.5)).p);
    await open();
    expect(chip()).not.toBeNull();
    // The chip's wake is the only timer this page arms past a minute (the window resets in ten minutes, or local midnight first).
    const ids = set.mock.calls.map((c, i) => [c[1], set.mock.results[i]?.value] as const).filter(([ms]) => typeof ms === 'number' && ms > 60_000).map(([, id]) => id);
    expect(ids.length).toBeGreaterThan(0);
    cleanup();
    for (const id of ids) expect(clear).toHaveBeenCalledWith(id);
  });
});
