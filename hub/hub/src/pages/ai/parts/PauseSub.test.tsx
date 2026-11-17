// The computer's event.pause_state reaching the one pause store the AI pane's foot shows. The stream side
// (ask/pauseBus.ts, the data.ts tee) is tested in ask/; here the pane is driven through the bus's subscribe door (`@ask/io`
// subscribePause), recorded, so a test publishes exactly what a stream frame would.
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient, type agent, type FixtureRequest } from '@core';
import type { ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The fixture side of core's seam (pageFixtures): New chat reads the computer's realms through it (../data useComputer),
// and this harness renders the tab at /ai without app/testing (which loads it), so without this New chat draws FIXTURES_NOT_INSTALLED.
import '@app/fixtures';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
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
const PERSONAL = fixtureWorld.realms[0]!.id;
let sent: FixtureRequest[] = [];
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

async function open(path: string) {
  sent = [];
  bootFixtureCore({ rules: chatRules({ onSend: (r) => sent.push(r) }) });
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
/** What an open session's stream tells the bus: the state, as the computer's subscriber hears it. */
const publish = (st: agent.PauseState) => act(() => { for (const s of [...subs]) if (s.container === atlas.id) s.fn(st); });
const ON = (gen: number): agent.PauseState => ({ paused: true, sinceMs: 1700000000000, gen });
const OFF = (gen: number): agent.PauseState => ({ paused: false, sinceMs: 0, gen });
const reads = () => sent.filter((r) => r.method === 'GET' && r.path.endsWith('/pause')).length;

beforeEach(() => {
  subs.length = 0;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1300 });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the pane\'s subscription to the computer\'s pause_state', () => {
  it('a running computer: the foot holds the pause quietly (Pause is in its gear) and says nothing is paused', async () => {
    await open('/ai');
    await waitFor(() => expect(reads()).toBeGreaterThan(0));
    expect(document.querySelector('[data-pause="running"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /pause agents/i })).toBeNull();
    expect(screen.queryByText(pause['pause.strip'])).toBeNull();
  });

  it('a pause_state event from an open session\'s stream puts the foot to paused, without any poll', async () => {
    await open('/ai');
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    await waitFor(() => expect(reads()).toBeGreaterThan(0));
    const before = reads();
    publish(ON(5));
    expect(await screen.findByText(pause['pause.strip'])).toBeInTheDocument();
    expect(reads()).toBe(before);
  });

  it('a newer state says running again, and a late older state changes nothing', async () => {
    await open('/ai');
    await waitFor(() => expect(subs.length).toBeGreaterThan(0));
    publish(ON(5));
    await screen.findByText(pause['pause.strip']);
    publish(OFF(4));
    expect(screen.getByText(pause['pause.strip'])).toBeInTheDocument();
    publish(OFF(6));
    await waitFor(() => expect(screen.queryByText(pause['pause.strip'])).toBeNull());
    publish(ON(5));
    expect(screen.queryByText(pause['pause.strip'])).toBeNull();
  });

  it('subscribes once, for the shown computer, and lets go when the pane goes', async () => {
    await open('/ai');
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
