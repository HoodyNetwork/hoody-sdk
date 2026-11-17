// New chat opened from an agent's page, /ai/new?agent=<name>, starts on that agent. A name the computer does not
// offer (gone, never there, or not an agent name at all) falls back to the agent New chat would pick anyway (the
// remembered one, else the computer's default agent) and says the linked agent was not found: never a blank form. On real core (fixture
// transport), through the tab's routes, as NewChat.test.tsx.
import { accountPref, bootFixtureCore, chooseComputer, fixtureWorld, queryClient } from '@core';
import type { ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// The fixture side of core's seam (pageFixtures): New chat reads the computer's realms through it (../data useComputer),
// and this harness renders the tab without app/testing (which loads it), so without this New chat draws FIXTURES_NOT_INSTALLED.
import '@app/fixtures';
import AiTab from '../tab';
import { newChatRules } from './fixtures';
import { PREF_KEY } from './NewChat';
import { parseRemembered } from './logic';
import strings from './NewChat.strings.en.json';

const atlas = fixtureWorld.computers[0]!;
const PERSONAL = fixtureWorld.realms[0]!.id;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

/** remount: the same page session drawn again (no new boot), as after leaving New chat and coming back. */
async function open(path: string, o: { remount?: boolean } = {}) {
  if (!o.remount) {
    bootFixtureCore({ rules: newChatRules() });
    act(() => chooseComputer(atlas));
  }
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
  await screen.findByRole('heading', { level: 1, name: strings.title });
  return router;
}
/** The agent chip names the agent the chat would start on. */
const chip = () => screen.getByRole('button', { name: /^Agent: / });
const agentIs = (agent: string) => expect(chip()).toHaveAccessibleName(fill(strings['agent.chip'], { name: agent }));
const WORK = strings['agent.general'];
const CHAT = strings['agent.chat'];
/** Either "not found" note (a missing agent's, or a link whose text is no agent name). */
const linkNote = () => screen.queryByText(fill(strings['agent.linkMissing'], { name: 'gone', computer: 'atlas' })) ?? screen.queryByText(strings['agent.linkBad']);

let width = 1300;
beforeEach(() => {
  width = 1300;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('New chat with ?agent=', () => {
  it('preselects the agent the link names, with no note', async () => {
    await open('/ai/new?agent=reviewer');
    await waitFor(() => agentIs('reviewer'));
    expect(screen.queryByText(fill(strings['agent.linkMissing'], { name: 'reviewer', computer: 'atlas' }))).toBeNull();
    expect(screen.queryByText(strings['agent.linkBad'])).toBeNull();
  });

  it('an agent the computer does not list falls back to the usual agent (the computer\'s default) and says it was not found', async () => {
    await open('/ai/new?agent=gone');
    await waitFor(() => expect(screen.queryByText(fill(strings['agent.linkMissing'], { name: 'gone', computer: 'atlas' }))).toBeInTheDocument());
    agentIs(WORK);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('the usual agent is the remembered one: a missing link agent falls back to it, and the link never overwrites it', async () => {
    await open('/ai/new');
    await waitFor(() => expect(accountPref(PREF_KEY, parseRemembered).set({ v: 2, agent: { kind: 'other', name: 'reviewer' }, approvals: 'default', runsWith: 'hoody' })).toBe(true));
    cleanup();
    await open('/ai/new?agent=mine', { remount: true });
    await waitFor(() => agentIs('mine'));
    cleanup();
    await open('/ai/new?agent=gone', { remount: true });
    await waitFor(() => expect(screen.queryByText(fill(strings['agent.linkMissing'], { name: 'gone', computer: 'atlas' }))).toBeInTheDocument());
    agentIs('reviewer');
    // The link's agent was never stored.
    expect(accountPref(PREF_KEY, parseRemembered).get().agent).toEqual({ kind: 'other', name: 'reviewer' });
  });

  it('a product-owned agent, or text that is no agent name, is not found either: the usual agent, with the note', async () => {
    await open('/ai/new?agent=bot');
    await waitFor(() => expect(screen.queryByText(fill(strings['agent.linkMissing'], { name: 'bot', computer: 'atlas' }))).toBeInTheDocument());
    agentIs(WORK);
    cleanup();
    await open(`/ai/new?agent=${encodeURIComponent('../Not An Agent')}`, { remount: true });
    await waitFor(() => expect(screen.queryByText(strings['agent.linkBad'])).toBeInTheDocument());
    agentIs(WORK);
  });

  it('a pick of the person\'s own takes over from the link, and the note goes', async () => {
    const router = await open('/ai/new?agent=gone');
    await waitFor(() => expect(linkNote()).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${strings['sug.chat']}`) }));
    await waitFor(() => agentIs(CHAT));
    expect(linkNote()).toBeNull();
    expect((router.state.location.search as { agent?: unknown }).agent).toBeUndefined();
  });

  it("Do it every day on a link's Just chat goes to the General agent, and the link's agent goes with it", async () => {
    const router = await open('/ai/new?agent=chat');
    await waitFor(() => agentIs(CHAT));
    const card = screen.getByText(strings['sug.daily']).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: strings['sug.dailyAsk'] }));
    await waitFor(() => agentIs(WORK));
    expect((router.state.location.search as { agent?: unknown }).agent).toBeUndefined();
  });
});
