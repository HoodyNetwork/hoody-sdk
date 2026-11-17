// Below PANE_MIN_PAGE the chat list is the whole screen and names it with a visually
// hidden h1 (the shell's route focus target, data-hub-title); beside the page, and on a chat's own screen, the layout
// adds none (the main region's screen carries its heading).
import { bootFixtureCore, chooseComputer, fixtureWorld, queryClient } from '@core';
import type { ShellData } from '@kit';
// eslint-disable-next-line no-restricted-imports -- the shell's data provider, a test harness for the computer name, not page code
import { ShellDataProvider } from '@shell/context';
// eslint-disable-next-line no-restricted-imports -- a router harness for the tab's routes, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
// eslint-disable-next-line no-restricted-imports -- a test harness for the view, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
// The fixture side of core's seam (pageFixtures): New chat reads the computer's realms through it (../data useComputer),
// and this harness renders the tab without app/testing (which loads it), so without this New chat draws FIXTURES_NOT_INSTALLED.
import '@app/fixtures';
import AiTab from '../tab';
import { chatRules } from './fixtures.chats';
import newChatStrings from '../new/NewChat.strings.en.json';
import strings from './Pane.strings.en.json';
import { PANE_MIN_PAGE } from './Pane';

const atlas = fixtureWorld.computers[0]!;
const HANDLE = `atlas.${atlas.id.slice(-4)}`;
const PERSONAL = fixtureWorld.realms[0]!.id;
const shell: ShellData = { realms: [], realmId: PERSONAL, computers: [{ id: atlas.id, name: 'atlas', running: true }] as ShellData['computers'] };

async function open(path: string, width: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  bootFixtureCore({ rules: chatRules({}) });
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
}

const layoutTitle = () => document.querySelector('#hub-main h1[data-hub-title]');

afterEach(() => {
  cleanup();
  queryClient.clear();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the AI tab names its chat list screen', () => {
  it('a phone-width /ai (the chat list alone) has a visually hidden h1 the route focus can land on', async () => {
    await open('/ai', 390);
    expect(await screen.findByRole('navigation', { name: strings['pane.label'] })).toBeInTheDocument();
    const h1 = screen.getByRole('heading', { level: 1, name: strings['pane.label'] });
    expect(h1).toHaveAttribute('data-hub-title');
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(h1.className).toContain('srOnly');
  });
  it('just under the side-by-side width it is still the list screen with its h1', async () => {
    await open('/ai', PANE_MIN_PAGE - 1);
    expect(await screen.findByRole('navigation', { name: strings['pane.label'] })).toBeInTheDocument();
    expect(layoutTitle()).not.toBeNull();
  });
  it('beside the page (side by side) the layout adds no h1', async () => {
    await open('/ai', PANE_MIN_PAGE);
    expect(await screen.findByRole('navigation', { name: strings['pane.label'] })).toBeInTheDocument();
    // The main region's screen (New chat) carries the page's heading, not the layout.
    expect(layoutTitle()).toHaveTextContent(newChatStrings.title);
    expect(layoutTitle()?.className).not.toMatch(/srOnly/);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });
  it("a chat's own screen on a phone gets no list h1 (the pane is not on screen)", async () => {
    await open(`/ai/c/s-today?computer=${HANDLE}&realm=${PERSONAL}`, 390);
    expect(screen.queryByRole('navigation', { name: strings['pane.label'] })).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: strings['pane.label'] })).toBeNull();
  });
});
