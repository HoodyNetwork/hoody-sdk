// The sidebar's "On <computer>" group label opens the same computer switcher as the
// top bar (openComputerSwitcher, no second picker). It stays plain text while no switcher is mounted or there is no
// computer to choose.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';

const sw = vi.hoisted(() => ({ ready: true, open: vi.fn() }));
vi.mock('./Switchers', () => ({ useComputerSwitcherReady: () => sw.ready, openComputerSwitcher: sw.open }));

const pg = (id: string, group: string) =>
  ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready', nav: { group, label: id } }) as unknown as PageManifest;
const pages = [pg('home', 'main'), pg('programs', 'build')];

async function sidebar(computers: { id: string; name: string }[], computerId?: string) {
  const Component = () => (
    <PagesProvider pages={pages}>
      <ShellDataProvider value={{ realms: [], realmId: 'all', computers, computerId, account: { name: 'Ada' } } as never}>
        <Sidebar pages={pages} collapsed={false} onToggleCollapsed={() => {}} onNavigate={() => {}} />
      </ShellDataProvider>
    </PagesProvider>
  );
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

beforeEach(() => {
  sw.ready = true;
  sw.open.mockClear();
});

describe('the sidebar "On <computer>" label', () => {
  it('is a button that opens the computer switcher', async () => {
    await sidebar([{ id: 'c1', name: 'Box' }], 'c1');
    const button = screen.getByRole('button', { name: /^On Box/ });
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(button);
    expect(sw.open).toHaveBeenCalledTimes(1);
  });

  it('is a button too when no computer is picked yet but there are some to choose', async () => {
    await sidebar([{ id: 'c1', name: 'Box' }]);
    expect(screen.getByRole('button', { name: /^On this computer/ })).toBeInTheDocument();
  });

  it('stays plain text while no switcher is mounted', async () => {
    sw.ready = false;
    await sidebar([{ id: 'c1', name: 'Box' }], 'c1');
    expect(screen.queryByRole('button', { name: /^On Box/ })).toBeNull();
    expect(screen.getByRole('group', { name: 'On Box' })).toBeInTheDocument();
  });

  it('stays plain text when there is no computer to choose', async () => {
    await sidebar([]);
    expect(screen.queryByRole('button', { name: /^On this computer/ })).toBeNull();
  });
});
