// The phone bar shows Home, AI, Computers, Bots for the pages this build serves, then More.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { ASK_ENABLED, setAskForFixtures } from '@kit/ask';
import { BottomNav } from './BottomNav';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';

const page = (id: string, title: string) => ({ id, path: `/${id}`, title, strings: { [title]: title }, status: 'ready' }) as unknown as PageManifest;
const ALL = [page('home', 'Home'), page('ai', 'AI'), page('computers', 'Computers'), page('bots', 'Bots')];

async function show(path: string, waiting = 0, pages: readonly PageManifest[] = ALL, atLeast = false) {
  const Component = () => (
    <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], botsWaiting: waiting, botsWaitingAtLeast: atLeast }}>
      <BottomNav pages={pages} onMore={() => undefined} moreOpen={false} />
    </ShellDataProvider>
  );
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

afterEach(() => setAskForFixtures(false));

describe('BottomNav', () => {
  it('a page this build does not serve gets no tab, AI included; there is no Ask button any more', async () => {
    expect(ASK_ENABLED).toBe(true);
    await show('/home', 0, [ALL[0]!]);
    const bar = screen.getByRole('navigation', { name: 'Quick navigation' });
    expect(Array.from(bar.querySelectorAll('a, button')).map((el) => el.textContent)).toEqual(['Home', 'More']);
  });
  it('has the five items in order, AI second', async () => {
    await show('/computers');
    const bar = screen.getByRole('navigation', { name: 'Quick navigation' });
    const names = Array.from(bar.querySelectorAll('a, button')).map((el) => el.textContent);
    expect(names).toEqual(['Home', 'AI', 'Computers', 'Bots', 'More']);
    expect(within(bar).getByRole('link', { name: 'AI' })).toHaveAttribute('href', '/ai');
    expect(within(bar).queryAllByRole('button').map((el) => el.textContent)).toEqual(['More']);
    expect(within(bar).getByRole('link', { name: 'Computers' })).toHaveAttribute('aria-current', 'page');
  });
  it('the AI tab is current anywhere under /ai', async () => {
    await show('/ai/knowledge/instructions');
    const bar = screen.getByRole('navigation', { name: 'Quick navigation' });
    expect(within(bar).getByRole('link', { name: 'AI' })).toHaveAttribute('aria-current', 'page');
  });
  // WCAG 2.5.3: the name starts with the words drawn, in order (badge, then label), spaced as read.
  it('marks Bots when Bots wait for the user', async () => {
    await show('/home', 2);
    // An accent count badge (as in the sidebar), not a bare dot; the name carries the same count.
    expect(screen.getByRole('link', { name: '2 Bots waiting for you' })).toHaveTextContent(/^2 Bots$/);
  });
  it('caps the Bots count like every other badge', async () => {
    await show('/home', 250);
    expect(screen.getByRole('link', { name: '99+ Bots waiting for you' })).toHaveTextContent(/^99\+ Bots$/);
  });
  it('a lower-bound count reads as drawn, then says it is a lower bound', async () => {
    await show('/home', 2, ALL, true);
    expect(screen.getByRole('link', { name: '2+ Bots, at least 2 waiting for you' })).toHaveTextContent(/^2\+ Bots$/);
  });
  it('with nothing waiting the tab is its label alone', async () => {
    await show('/home', 0);
    expect(screen.getByRole('link', { name: 'Bots' })).toHaveTextContent(/^Bots$/);
  });
});
