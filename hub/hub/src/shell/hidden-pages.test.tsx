// A page this load hides is unreachable from the shell: the palette, the shortcut list, the sidebar and the
// bottom bar show nothing for it, and nothing links to another Hub.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { BottomNav } from './BottomNav';
import { CommandPalette } from './CommandPalette';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { useShortcuts } from './shortcuts';
import { Sidebar } from './Sidebar';

const pg = (id: string, extra: Partial<PageManifest> = {}) =>
  ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready', nav: { icon: 'apps', group: 'main' }, ...extra }) as unknown as PageManifest;

// Served: home (with a command that points into hidden Computers) and notifications.
const HOME = pg('home', {
  commands: [
    { id: 'own', label: 'Customize home', to: '/home?customize=1' },
    { id: 'leak', label: 'Get a computer', to: '/computers/new' },
  ],
} as Partial<PageManifest>);
const SERVED = [HOME, pg('notifications')];

async function inRouter(node: ReactNode, path = '/home') {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <PagesProvider pages={SERVED}>{node}</PagesProvider> }),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(async () => {
    render(
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' } }}>
        <RouterProvider router={router} />
      </ShellDataProvider>,
    );
    await router.load();
  });
}

afterEach(() => vi.restoreAllMocks());

describe('hidden pages from the shell', () => {
  it('the palette lists only served pages, and no command that points into a hidden page', async () => {
    await inRouter(<CommandPalette pages={SERVED} isOpen onOpenChange={() => {}} />);
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(3);
    // Page rows end with their g-jump keys (hidden from the accessible name).
    expect(screen.getByRole('menuitem', { name: 'home' })).toHaveTextContent(/^homegh$/);
    expect(screen.getByRole('menuitem', { name: 'notifications' })).toHaveTextContent(/^notificationsgn$/);
    expect(screen.getByRole('menuitem', { name: 'Customize home' })).toBeInTheDocument();
  });

  it('the shortcut list offers no g-jump to a hidden page', () => {
    const { result } = renderHook(() => useShortcuts(), { wrapper: ({ children }) => <PagesProvider pages={SERVED}>{children}</PagesProvider> });
    const go = result.current.find((g) => g.id === 'go')?.rows.map((r) => r.keys.join(' '));
    expect(go).toEqual(['g h', 'g n']);
  });

  it('the sidebar and the bottom bar show no hidden page', async () => {
    await inRouter(
      <>
        <Sidebar pages={SERVED} collapsed={false} onToggleCollapsed={() => {}} onNavigate={() => {}} />
        <BottomNav pages={SERVED} onMore={() => {}} moreOpen={false} />
      </>,
    );
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs.some((h) => h?.startsWith('/computers'))).toBe(false);
    expect(hrefs.some((h) => h?.startsWith('/auth/'))).toBe(false);
    expect(hrefs).toContain('/notifications');
  });

});
