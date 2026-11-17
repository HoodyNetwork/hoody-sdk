// Jump to lists the deep index: from two typed letters, the places only the pages' views draw
// (here the passcode lock of Account), each landing on its page path plus its tail; only pages this load serves.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';
import type { DeepEntry } from './search/types';

const DEEP: DeepEntry[] = [
  { page: 'account', kind: 'section', label: 'Passcode lock', to: '?section=passcode', words: '' },
  { page: 'account', kind: 'setting', label: 'No passcode', to: '?section=passcode', under: 'Passcode lock', words: '' },
  { page: 'gone', kind: 'section', label: 'Passcode elsewhere', to: '?section=x', words: '' },
];
vi.mock('./search/deep', () => ({ loadDeep: () => Promise.resolve(DEEP) }));

const pages = [
  { id: 'home', path: '/home', title: 'home', strings: { home: 'Home' }, status: 'ready', nav: { icon: 'home', group: 'main' } },
  { id: 'account', path: '/account', title: 'title', strings: { title: 'Account' }, status: 'ready', nav: { icon: 'home', group: 'account' } },
] as unknown as PageManifest[];

async function open() {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <CommandPalette pages={pages} isOpen onOpenChange={() => {}} /> }),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

describe('CommandPalette deep entries', () => {
  it('typing passcode lists the section and its row, with their page, and lands on the section', async () => {
    const router = await open();
    await userEvent.type(screen.getByRole('searchbox'), 'passcode');
    expect(await screen.findByRole('menuitem', { name: /^Passcode lock/ })).toHaveTextContent('Passcode lockAccount');
    expect(screen.getByRole('menuitem', { name: /^No passcode/ })).toHaveTextContent('Account · Passcode lock');
    const navigate = vi.spyOn(router, 'navigate');
    await userEvent.click(screen.getByRole('menuitem', { name: /^Passcode lock/ }));
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/account?section=passcode' });
  });

  it('leaves out places of pages this load does not serve', async () => {
    await open();
    await userEvent.type(screen.getByRole('searchbox'), 'passcode');
    await screen.findByRole('menuitem', { name: /^Passcode lock/ });
    expect(screen.queryByRole('menuitem', { name: /^Passcode elsewhere/ })).toBeNull();
  });

  it('one letter lists no deep entries; the second lists them', async () => {
    await open();
    await userEvent.type(screen.getByRole('searchbox'), 'p');
    await act(async () => {}); // the index has loaded (the mock answers at once)
    expect(screen.queryByRole('menuitem', { name: /^Passcode lock/ })).toBeNull();
    await userEvent.type(screen.getByRole('searchbox'), 'a');
    expect(await screen.findByRole('menuitem', { name: /^Passcode lock/ })).toBeInTheDocument();
  });
});
