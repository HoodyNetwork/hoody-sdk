// The pause band in an open AI chat, and the computer's pause_state events reaching the one pause store
// the foot and the band share. The stream side (ask/pauseBus.ts, the data.ts tee) is tested in ask/; here the page is driven through
// the bus's subscribe door (`@ask/io` subscribePause), recorded, so a test publishes exactly what a stream frame would.
import { agent as core, answers, bootFixtureCore, chooseComputer, fixtureWorld, queryClient, reply, type agent, type FixtureRequest } from '@core';
import {
  can, provideActiveConversations, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot, type ShellData,
} from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The fixture side of core's seam (pageFixtures): New chat reads the computer's realms through it (../data useComputer),
// and this harness renders the tab at /ai without app/testing (which loads it), so without this New chat draws FIXTURES_NOT_INSTALLED.
import '@app/fixtures';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import { resetAttemptsForTests } from '@kit/agent/convComposer';
import pause from '@kit/agent/Pause.strings.en.json';

type Sub = { container: string; fn: (s: agent.PauseState) => void; off: ReturnType<typeof vi.fn> };
const hoisted = vi.hoisted(() => ({ subs: [] as unknown[] }));
const subs = hoisted.subs as Sub[];
vi.mock('@ask/io', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  subscribePause: (container: string, fn: Sub['fn']) => {
    const off = vi.fn(() => { const i = subs.findIndex((x) => x.off === off); if (i >= 0) subs.splice(i, 1); });
    subs.push({ container, fn, off });
    return off;
  },
}));

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const SID = 's-today';
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const BAND = fill(pause['pause.band'], { computer: 'atlas' });
let sent: FixtureRequest[] = [];
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

const FACTS: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'unknown', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'missing' },
};
const SNAP: ConvSnapshot = {
  facts: FACTS, turnConfirmed: true, title: 'Fix the cart total', gates: [],
  blocks: [{ k: 'user', key: 'u1', text: 'Round the cart total half up, please.', at: 1000 }],
  meta: { computer: HANDLE, realm: PERSONAL, status: 'idle' },
};
const provider: ActiveConversationProvider = {
  open(_account, ref) {
    const source: ActiveSource = {
      kind: 'session', ref, snapshot: () => SNAP, subscribe: () => () => {}, watch: () => {}, can: (a) => can(a, SNAP.facts),
      send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide: async () => ({ k: 'done' }), answer: async () => ({ k: 'done' }), check: async () => ({ k: 'done' }),
      dismissDecision: () => {}, canDismiss: () => false,
    };
    return { source, release: () => {} };
  },
};

async function open(path: string, putPause = false) {
  sent = [];
  // putPause: the agent answers a PUT /pause with the state it asked for, one gen past the newest the test published.
  const put = reply(core.pauseRoutes.set, (r) => {
    sent.push(r);
    return answers.ok({ paused: (r.body as { paused: boolean }).paused, since_ms: 0, gen: 100 });
  });
  bootFixtureCore({ rules: [...(putPause ? [put] : []), ...chatRules({ onSend: (r) => sent.push(r) })] });
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
/** What an open session's stream tells the bus: the state, as the computer's subscriber hears it. */
const publish = (st: agent.PauseState) => act(() => { for (const s of [...subs]) if (s.container === atlas.id) s.fn(st); });
/** The band: the alert that carries the band's sentence (the foot is outside it). */
const band = () => screen.getByText(BAND).closest<HTMLElement>('[role="alert"]')!;
const ON = (gen: number): agent.PauseState => ({ paused: true, sinceMs: 1700000000000, gen });
const OFF = (gen: number): agent.PauseState => ({ paused: false, sinceMs: 0, gen });

beforeEach(() => {
  subs.length = 0;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
  provideActiveConversations(provider);
});
afterEach(() => {
  cleanup();
  resetAttemptsForTests();
  provideActiveConversations(null);
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the pause band in an open chat', () => {
  it('a running computer: the chat shows no band', async () => {
    await open(chat());
    expect(await screen.findByText('Round the cart total half up, please.')).toBeInTheDocument();
    await waitFor(() => expect(sent.some((r) => r.method === 'GET' && r.path.endsWith('/pause'))).toBe(true));
    expect(screen.queryByText(BAND)).toBeNull();
  });

  it('a pause_state event from an open session\'s stream shows the band, with Resume, without any poll', async () => {
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    const reads = sent.filter((r) => r.path.endsWith('/pause')).length;
    publish(ON(5));
    expect(await screen.findByText(BAND)).toBeInTheDocument();
    // The band's own Resume (the foot has one too: the band is its alert, scoped here).
    expect(within(band()).getByRole('button', { name: pause['pause.resume'] })).toBeInTheDocument();
    expect(sent.filter((r) => r.path.endsWith('/pause')).length).toBe(reads);
  });

  it('the band goes when a newer state says running, and a late older state changes nothing', async () => {
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    publish(ON(5));
    await screen.findByText(BAND);
    publish(OFF(4));
    expect(screen.getByText(BAND)).toBeInTheDocument();
    publish(OFF(6));
    await waitFor(() => expect(screen.queryByText(BAND)).toBeNull());
    publish(ON(5));
    expect(screen.queryByText(BAND)).toBeNull();
  });

  it('the foot and the band are one store: the foot says paused too', async () => {
    await open(chat());
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    publish(ON(7));
    await screen.findByText(BAND);
    expect(screen.getByText(pause['pause.strip'])).toBeInTheDocument();
  });

  it('one store, proved by an action: Resume pressed in the band clears the foot too, with no event', async () => {
    await open(chat(), true);
    await screen.findByText('Round the cart total half up, please.');
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    publish(ON(7));
    await screen.findByText(BAND);
    expect(screen.getByText(pause['pause.strip'])).toBeInTheDocument();
    const published = subs.length;
    await userEvent.click(within(band()).getByRole('button', { name: pause['pause.resume'] }));
    // Only the band's store took the PUT's answer: a second store fed by the same bus would keep the foot paused.
    await waitFor(() => expect(screen.queryByText(BAND)).toBeNull());
    await waitFor(() => expect(screen.queryByText(pause['pause.strip'])).toBeNull());
    expect(sent.filter((r) => r.method === 'PUT' && r.path.endsWith('/pause')).map((r) => r.body)).toEqual([{ paused: false }]);
    expect(subs.length).toBe(published);
  });

  it('a chat of another computer than the pane\'s shows no band, though the pane\'s computer is paused', async () => {
    await open(chat('other.0000'));
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    publish(ON(5));
    await screen.findByText(pause['pause.strip']);
    expect(screen.queryByText(BAND)).toBeNull();
  });

  it('with no chat open the foot shows the pause and no band', async () => {
    await open('/ai');
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    publish(ON(5));
    expect(await screen.findByText(pause['pause.strip'])).toBeInTheDocument();
    expect(screen.queryByText(BAND)).toBeNull();
  });
});

describe('the pane\'s subscription to the computer\'s pause_state', () => {
  it('subscribes once, for the shown computer, and lets go when the pane goes', async () => {
    await open(chat());
    await waitFor(() => expect(subs.length).toBe(1));
    expect(subs[0]!.container).toBe(atlas.id);
    const off = subs[0]!.off;
    cleanup();
    expect(off).toHaveBeenCalledTimes(1);
    expect(subs).toHaveLength(0);
  });

  it('choosing another computer moves the subscription with it: the old computer is let go, the new one heard', async () => {
    const BOREAL = fixtureWorld.computers[1]!;
    await open('/ai');
    await waitFor(() => expect(subs.map((x) => x.container)).toEqual([atlas.id]));
    await act(async () => { chooseComputer(BOREAL); });
    await waitFor(() => expect(subs.map((x) => x.container)).toEqual([BOREAL.id]));
  });
});
