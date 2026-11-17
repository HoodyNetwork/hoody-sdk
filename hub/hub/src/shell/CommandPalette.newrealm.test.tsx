// Jump to finds New realm by what it is for, not only by its title: the realms page's manifest command
// (cmd.new) carries the words create, separate, space and share, and Enter opens /realms/new.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import realms from '../pages/realms/page';
import { CommandPalette } from './CommandPalette';

vi.mock('./search/deep', () => ({ loadDeep: () => Promise.resolve([]) }));

const pages = [
  { id: 'billing', path: '/billing', title: 'title', strings: { title: 'Billing', nav: 'Billing' }, status: 'ready', nav: { icon: 'home', group: 'account', label: 'nav' } },
  realms,
] as unknown as PageManifest[];

async function open() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <CommandPalette pages={pages} isOpen onOpenChange={() => {}} /> }),
    history: createMemoryHistory({ initialEntries: ['/billing'] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  const navigate = vi.spyOn(router, 'navigate');
  await userEvent.click(screen.getByRole('searchbox'));
  await act(async () => {});
  return navigate;
}

const rows = () => screen.queryAllByRole('menuitem').map((e) => e.textContent ?? '');

describe('Jump to: New realm', () => {
  it.each(['separate', 'create realm', 'new realm'])('"%s" finds New realm first, and Enter opens it', async (q) => {
    const navigate = await open();
    await userEvent.keyboard(q);
    expect(rows()[0], rows().join(' | ')).toMatch(/^New realm/);
    await userEvent.keyboard('{Enter}');
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/realms/new' });
  });
});
