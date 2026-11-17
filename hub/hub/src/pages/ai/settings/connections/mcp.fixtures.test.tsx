// Settings → Connections → MCP servers on the AI tab's own fixtures (the preview's default state), on real
// core and the real settings session manager. The fixtures answer the settings session (sign-in status, create, lease) and the
// list read on it, so the section opens and lists the servers instead of saying the settings chat was refused.
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the section, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness for the table's URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import aiFixtures from '../../fixtures';
import { setSettingsSessionsForTests, settingsSessions } from '../rules/Session';
import McpServers from './Mcp';
import strings from './Mcp.strings.en.json';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;

async function show() {
  bootFixtureCore({ rules: aiFixtures.states.default.rules });
  act(() => chooseComputer(atlas));
  const router = createRouter({ routeTree: createRootRoute({ component: () => <McpServers computer="atlas" /> }), history: createMemoryHistory({ initialEntries: ['/ai/connections'] }) });
  await act(async () => {
    render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);
    await router.load();
  });
}

afterEach(() => {
  cleanup();
  settingsSessions().reset();
  setSettingsSessionsForTests(null);
  queryClient.clear();
});

describe('MCP servers on the AI fixtures', () => {
  it('opens the settings chat and lists the servers', async () => {
    await show();
    const section = within((await screen.findByRole('heading', { name: strings.title })).closest('section') as HTMLElement);
    // The rows the fixture agent lists (name · kind), read on the session the section opened.
    expect(await section.findByText(/^pg · /)).toBeInTheDocument();
    expect(section.getByText(/^linear · /)).toBeInTheDocument();
    expect(screen.queryByText(strings['open.failed'])).toBeNull();
  });

  // every change must settle: fixtures that answered only the list would leave each change pending for ever, holding the lock.
  const rowMenu = async (text: RegExp, item: string) => {
    let row: HTMLElement | null = await screen.findByText(text);
    while (row && !row.querySelector('[data-row-menu]')) row = row.parentElement;
    await userEvent.click(row!.querySelector('[data-row-menu] button') as HTMLElement);
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(item) }));
  };
  it('a change is answered: turning one off, then removing another, both land and the list follows', async () => {
    await show();
    await rowMenu(/^pg · /, strings.turnOff);
    expect(await screen.findByText(strings['off.done'])).toBeInTheDocument();
    await rowMenu(/^linear · /, strings.remove);
    const c = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await userEvent.click(within(c).getByRole('button', { name: strings['rm.confirm'] }));
    await waitFor(() => expect(screen.queryByText(/^linear · /)).toBeNull());
    expect(screen.getByText(/^pg · /)).toBeInTheDocument();
  });
});
