// The phone drawer's account item opens Account settings inside the Hub when that page is served,
// and is absent when it is hidden (never a link that lands on Not Found or on another Hub).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;

async function drawer(pages: PageManifest[]) {
  const Component = () => (
    <PagesProvider pages={pages}>
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' } }}>
        <Sidebar pages={pages} collapsed={false} onToggleCollapsed={() => {}} onNavigate={() => {}} drawer />
      </ShellDataProvider>
    </PagesProvider>
  );
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return screen.queryByRole('link', { name: /Ada/ });
}

describe('Sidebar drawer account item', () => {
  it('links inside the Hub when the account page is served', async () => {
    expect(await drawer([pg('home'), pg('account')])).toHaveAttribute('href', '/account');
  });
  it('is absent when the account page is hidden', async () => {
    expect(await drawer([pg('home')])).toBeNull();
  });
});
