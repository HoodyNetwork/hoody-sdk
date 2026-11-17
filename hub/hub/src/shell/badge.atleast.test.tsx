// A Bots-waiting count that is only a lower bound (core's read says atLeast: a computer past the first
// page, or one whose Bots read failed, may hold more) shows as "N+" and is read as "at least N", in the sidebar and in
// the phone bar; a whole count keeps its plain number.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { BottomNav } from './BottomNav';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';

const page = (id: string, title: string) => ({ id, path: `/${id}`, title, strings: { [title]: title }, status: 'ready', nav: { group: 'main', order: 0 } }) as unknown as PageManifest;
const PAGES = [page('home', 'Home'), page('computers', 'Computers'), page('bots', 'Bots')];

async function show(ui: 'sidebar' | 'bottom', waiting: number, atLeast?: boolean) {
  const Component = () => (
    <PagesProvider pages={PAGES}>
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], botsWaiting: waiting, botsWaitingAtLeast: atLeast }}>
        {ui === 'sidebar' ? (
          <Sidebar pages={PAGES} collapsed={false} onToggleCollapsed={() => {}} onNavigate={() => {}} />
        ) : (
          <BottomNav pages={PAGES} onMore={() => undefined} moreOpen={false} />
        )}
      </ShellDataProvider>
    </PagesProvider>
  );
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

afterEach(() => { document.body.innerHTML = ''; });

describe('Bots badge: a lower bound reads "N+", "at least N"', () => {
  it('sidebar: a lower bound shows 2+ and says at least 2', async () => {
    await show('sidebar', 2, true);
    const link = screen.getByRole('link', { name: 'Bots 2+, at least 2 waiting for you' });
    expect(link).toHaveTextContent(/2\+/);
  });
  it('sidebar: a whole count keeps its plain number', async () => {
    await show('sidebar', 2, false);
    const link = screen.getByRole('link', { name: 'Bots 2 waiting for you' });
    expect(link).toHaveTextContent(/2/);
    expect(link).not.toHaveTextContent(/2\+/);
  });
  it('sidebar: a lower bound over 99 says at least 99', async () => {
    await show('sidebar', 140, true);
    expect(screen.getByRole('link', { name: 'Bots 99+, at least 99 waiting for you' })).toHaveTextContent(/99\+/);
  });
  it('phone bar: a lower bound shows 2+ and says at least 2', async () => {
    await show('bottom', 2, true);
    expect(screen.getByRole('link', { name: '2+ Bots, at least 2 waiting for you' })).toHaveTextContent(/^2\+ Bots$/);
  });
  it('phone bar: a whole count keeps its plain number', async () => {
    await show('bottom', 2, false);
    expect(screen.getByRole('link', { name: '2 Bots waiting for you' })).toHaveTextContent(/^2 Bots$/);
  });
});
