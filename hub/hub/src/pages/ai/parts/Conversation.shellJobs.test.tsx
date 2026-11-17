// The open chat draws its shell jobs under Details → Activity → Running now from its active source's own store, and
// only while the store has a row to show, so "Nothing is running or waiting." stays right. The page's wrapper keeps the
// operation (a wrapper that dropped it would hide the rows), and Stop on a row goes through that store, once per press.
import { agent, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply } from '@core';
import {
  can, createShellJobStops, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot,
  type ShellData, type ShellJobStops,
} from '@kit';
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
import head from '@kit/agent/ConvHeader.strings.en.json';
import det from '@kit/agent/DetailsPanel.strings.en.json';
import sj from '@kit/agent/ShellJobRows.strings.en.json';

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
const row = (jobId: string, command: string, state = 'running') => ({ job_id: jobId, command, started_ms: Date.now(), state, last_line: '', remote: false });

/** A store over a scripted list and stop, already read once (the host's own reads are ask/active.ts's, tested there). */
async function jobs(items: unknown[]) {
  const stop = vi.fn(async (t: { jobId: string }) => ({ ok: true, status: 200, body: { job_id: t.jobId, outcome: 'stopped', already_ended: false, remote: false, duplicate: false } }));
  let n = 0;
  const store = createShellJobStops({
    chat: { computer: HANDLE, realm: PERSONAL, sid: SID }, list: async () => ({ ok: true, body: { items } }), stop, newKey: () => `k${++n}`, can: () => ({ ok: true }),
  });
  await store.refresh();
  return { store, stop };
}
function provider(store: ShellJobStops | undefined) {
  const p: ActiveConversationProvider = {
    open(_account, ref) {
      const source: ActiveSource = {
        kind: 'session', ref, snapshot: () => IDLE, subscribe: () => () => undefined, watch: () => {}, can: (a) => can(a, IDLE.facts),
        send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide: async () => ({ k: 'done' }), answer: async () => ({ k: 'done' }),
        check: async () => ({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
        ...(store ? { shellJobs: () => store } : {}),
      };
      return { source, release: vi.fn() };
    },
  };
  return p;
}
/** One store per chat id (a source per chat, as the host gives). */
function providerBy(stores: Record<string, ShellJobStops>) {
  const base = provider(undefined);
  const p: ActiveConversationProvider = {
    open(account, ref, at) {
      const opened = base.open(account, ref, at);
      const store = stores[ref.sid];
      return opened && store ? { ...opened, source: { ...opened.source, shellJobs: () => store } } : opened;
    },
  };
  return p;
}
let lastRouter: { navigate: (o: { to: string }) => Promise<void> } | null = null;
async function open() {
  const usage = reply(agent.usageRoutes.session, () => answers.ok({ items: [], totals: null, next_after_id: 0, has_more: false }));
  bootFixtureCore({ rules: [...chatRules({ onSend: () => undefined }), usage] });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: AiTab }), history: createMemoryHistory({ initialEntries: [`/ai/c/${SID}?computer=${HANDLE}&realm=${PERSONAL}`] }) });
  lastRouter = router as unknown as typeof lastRouter;
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
  fireEvent.click(screen.getByRole('button', { name: head['head.details'] }));
  fireEvent.click(await screen.findByRole('tab', { name: det['det.tab.activity'] }));
  return document.querySelector('[data-details-panel]') as HTMLElement;
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
});
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  provideActiveConversations(null);
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the open chat’s shell jobs', () => {
  it('a running job shows under Activity with its Stop, and Stop goes through the source’s store once', async () => {
    const { store, stop } = await jobs([row('j1', 'npm run dev')]);
    provideActiveConversations(provider(store));
    const panel = await open();
    const list = await within(panel).findByRole('list', { name: sj['sj.list'] });
    expect(within(list).getByText('npm run dev')).toBeInTheDocument();
    expect(within(panel).queryByText(det['det.state.nothing'])).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: sj['sj.stopJob'].replace('{{name}}', 'npm run dev') }));
    expect(await within(list).findByText(sj['sj.stopped'])).toBeInTheDocument();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('with no job to show the panel keeps its "nothing is running" words and draws no shell list', async () => {
    const { store } = await jobs([row('j9', 'make', 'ended')]);
    provideActiveConversations(provider(store));
    const panel = await open();
    expect(await within(panel).findByText(det['det.state.nothing'])).toBeInTheDocument();
    expect(within(panel).queryByRole('list', { name: sj['sj.list'] })).toBeNull();
  });

  it('a source without shell jobs opens as before, with no shell list', async () => {
    provideActiveConversations(provider(undefined));
    const panel = await open();
    await waitFor(() => expect(within(panel).getByText(det['det.state.nothing'])).toBeInTheDocument());
    expect(within(panel).queryByRole('list', { name: sj['sj.list'] })).toBeNull();
  });
});

// Ages (kit useNow) move once a minute with nothing else changing, and any render reads the time it is
// drawn (a store that reads a new job between ticks shows every age as it is then, never the clock's last tick).
describe('the shell jobs’ ages follow time', () => {
  const startedNow = sj['sj.startedNow'];
  const oneMinute = sj['sj.running_one'].replace('{{count}}', '1');

  it('a job started 50 s ago reads as just started, then as running for a minute once the minute passes', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    try {
      const { store } = await jobs([{ ...row('j1', 'npm run dev'), started_ms: Date.now() - 50_000 }]);
      provideActiveConversations(provider(store));
      const panel = await open();
      const list = await within(panel).findByRole('list', { name: sj['sj.list'] });
      expect(within(list).getByText(startedNow)).toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(60_000); });
      expect(within(list).getByText(oneMinute)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a render between ticks shows each age as it is then: a job read later does not leave the first one on the old clock', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    try {
      const items: unknown[] = [{ ...row('j1', 'npm run dev'), started_ms: Date.now() - 50_000 }];
      const { store } = await jobs(items);
      provideActiveConversations(provider(store));
      const panel = await open();
      const list = await within(panel).findByRole('list', { name: sj['sj.list'] });
      expect(within(list).getByText(startedNow)).toBeInTheDocument();
      // 30 s on (no tick yet): the store reads a second job, which draws the list again.
      vi.setSystemTime(Date.now() + 30_000);
      items.push(row('j2', 'make watch'));
      await act(async () => { await store.refresh(); });
      await within(list).findByText('make watch');
      expect(within(list).getByText(oneMinute)).toBeInTheDocument();
      expect(within(list).getByText(startedNow)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('another chat’s shell-job store shows its ages at once, without waiting for the next tick', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    try {
      const a = await jobs([row('j1', 'npm run dev')]);
      const b = await jobs([{ ...row('j2', 'make watch'), started_ms: Date.now() - 40_000 }]);
      provideActiveConversations(providerBy({ [SID]: a.store, 's-old': b.store }));
      const panel = await open();
      expect(await within(panel).findByText('npm run dev')).toBeInTheDocument();
      // 30 s on, no tick yet: the other chat opens in the same page, with its own store (its job is now 70 s old).
      vi.setSystemTime(Date.now() + 30_000);
      await act(async () => { await lastRouter!.navigate({ to: `/ai/c/s-old?computer=${HANDLE}&realm=${PERSONAL}` }); });
      const list = await within(document.querySelector('[data-details-panel]') as HTMLElement).findByRole('list', { name: sj['sj.list'] });
      expect(await within(list).findByText('make watch')).toBeInTheDocument();
      expect(within(list).getByText(oneMinute)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // The page has other once-a-minute timers (the list's query refetches); the age clock is the one whose callback sets the
  // clock's time.
  const ageClocks = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.filter((c) => c[1] === 60_000 && String(c[0]).includes('setNow(Date.now())')).length;

  it('a chat without a shell-job store runs no age clock', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    try {
      provideActiveConversations(provider(undefined));
      const panel = await open();
      await waitFor(() => expect(within(panel).getByText(det['det.state.nothing'])).toBeInTheDocument());
      expect(ageClocks(spy)).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('a chat with a shell-job store runs one age clock, once a minute', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    try {
      const { store } = await jobs([row('j1', 'npm run dev')]);
      provideActiveConversations(provider(store));
      const panel = await open();
      await within(panel).findByRole('list', { name: sj['sj.list'] });
      expect(ageClocks(spy)).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

// The age clock's interval is cleared when the chat's store goes away, when the page
// moves to a chat without one, and on unmount. Live clocks are the age-clock intervals started (the callback that sets
// the clock's time, 60 s) less those cleared, so the page's other timers never count.
describe('the shell jobs’ age clock is cleared', () => {
  function ageClocks() {
    const started = vi.spyOn(globalThis, 'setInterval');
    const cleared = vi.spyOn(globalThis, 'clearInterval');
    return {
      live: () => {
        const ids = started.mock.calls.flatMap((c, i) =>
          c[1] === 60_000 && String(c[0]).includes('setNow(Date.now())') ? [started.mock.results[i]?.value] : []);
        const gone = new Set(cleared.mock.calls.map((c) => c[0]));
        return ids.filter((id) => !gone.has(id)).length;
      },
      restore: () => { started.mockRestore(); cleared.mockRestore(); },
    };
  }

  it('when the chat’s store goes away', async () => {
    const clocks = ageClocks();
    try {
      const { store } = await jobs([row('j1', 'npm run dev')]);
      provideActiveConversations(provider(store));
      const panel = await open();
      await within(panel).findByRole('list', { name: sj['sj.list'] });
      expect(clocks.live()).toBe(1);
      // The host now gives the same chat without a shell-job store (holders open again on the new provider).
      act(() => provideActiveConversations(provider(undefined)));
      await waitFor(() => expect(within(panel).queryByRole('list', { name: sj['sj.list'] })).toBeNull());
      expect(clocks.live()).toBe(0);
    } finally {
      clocks.restore();
    }
  });

  it('when the page moves to a chat without a store', async () => {
    const clocks = ageClocks();
    try {
      const { store } = await jobs([row('j1', 'npm run dev')]);
      provideActiveConversations(providerBy({ [SID]: store }));
      const panel = await open();
      await within(panel).findByRole('list', { name: sj['sj.list'] });
      expect(clocks.live()).toBe(1);
      await act(async () => { await lastRouter!.navigate({ to: `/ai/c/s-old?computer=${HANDLE}&realm=${PERSONAL}` }); });
      await waitFor(() => expect(screen.queryByText('npm run dev')).toBeNull());
      expect(clocks.live()).toBe(0);
    } finally {
      clocks.restore();
    }
  });

  it('on unmount', async () => {
    const clocks = ageClocks();
    try {
      const { store } = await jobs([row('j1', 'npm run dev')]);
      provideActiveConversations(provider(store));
      const panel = await open();
      await within(panel).findByRole('list', { name: sj['sj.list'] });
      expect(clocks.live()).toBe(1);
      cleanup();
      expect(clocks.live()).toBe(0);
    } finally {
      clocks.restore();
    }
  });
});

