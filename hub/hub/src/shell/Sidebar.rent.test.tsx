// "Rent servers" at the bottom of the side menu: a real link to the Market page's rent
// view (its default Listings tab), inside the Hub when the market page is served, and absent while it is hidden.
// It shows in the open sidebar, as an icon with a tooltip on the collapsed rail, and at the same
// spot in the phone menu sheet; the keyboard reaches and opens it.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';

const pg = (id: string, group?: string) =>
  ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready', ...(group ? { nav: { group, order: 1, label: id } } : {}) }) as unknown as PageManifest;
const HELP = pg('guide', 'help');

async function mount(pages: PageManifest[], o: { collapsed?: boolean; drawer?: boolean } = {}) {
  const onNavigate = vi.fn();
  const Component = () => (
    <PagesProvider pages={pages}>
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' } }}>
        <Sidebar pages={pages} collapsed={o.collapsed ?? false} onToggleCollapsed={() => {}} onNavigate={onNavigate} drawer={o.drawer} />
      </ShellDataProvider>
    </PagesProvider>
  );
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  // React Aria links route through the app's router (app/router.tsx wires the same provider).
  await act(async () => {
    render(
      <AriaRouterProvider navigate={(to) => void router.navigate({ href: to } as never)}>
        <RouterProvider router={router} />
      </AriaRouterProvider>,
    );
    await router.load();
  });
  return { router, onNavigate, link: () => screen.getByRole('link', { name: 'Rent servers' }) };
}

describe('Sidebar "Rent servers"', () => {
  it('links to the market page inside the Hub when it is served', async () => {
    const { link } = await mount([pg('home', 'main'), pg('market'), HELP]);
    expect(link()).toHaveAttribute('href', '/market');
  });

  it('is absent while the market page is hidden: no Not Found link, no link to another Hub', async () => {
    await mount([pg('home', 'main'), HELP]);
    expect(screen.queryByRole('link', { name: 'Rent servers' })).toBeNull();
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href')).some((h) => h?.startsWith('/auth/'))).toBe(false);
  });

  it('sits at the bottom of the menu, below the page groups, before the Guide', async () => {
    await mount([pg('home', 'main'), pg('market'), HELP]);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const links = within(nav).getAllByRole('link');
    const rent = links.findIndex((l) => l.getAttribute('href') === '/market' && l.textContent?.includes('Rent servers'));
    const home = links.findIndex((l) => l.getAttribute('href') === '/home');
    const guide = links.findIndex((l) => l.getAttribute('href') === '/guide');
    expect(rent).toBeGreaterThan(home);
    expect(rent).toBeLessThan(guide);
  });

  it('on the collapsed rail it is an icon named "Rent servers" with a tooltip', async () => {
    const user = userEvent.setup();
    const { link } = await mount([pg('home', 'main'), pg('market'), HELP], { collapsed: true });
    expect(link()).toHaveAccessibleName('Rent servers');
    // The rail hides the visible label (display: none in Sidebar.module.css, which jsdom does not apply), so the name
    // must be the link's own aria-label.
    expect(link()).toHaveAttribute('aria-label', 'Rent servers');
    // Keyboard focus opens a rail tooltip at once (hover waits for the pointer's delay).
    for (let i = 0; i < 10 && document.activeElement !== link(); i += 1) await user.tab();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Rent servers'));
  });

  it('is in the phone menu sheet at the same spot', async () => {
    const { link } = await mount([pg('home', 'main'), pg('market'), HELP], { drawer: true });
    expect(link()).toHaveAttribute('href', '/market');
  });

  it('the keyboard reaches it and Enter opens the market page', async () => {
    const user = userEvent.setup();
    const { link, router, onNavigate } = await mount([pg('home', 'main'), pg('market'), HELP]);
    for (let i = 0; i < 10 && document.activeElement !== link(); i += 1) await user.tab();
    expect(link()).toHaveFocus();
    expect(link()).toHaveAttribute('data-focus-visible');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/market'));
    expect(onNavigate).toHaveBeenCalled();
  });
});
