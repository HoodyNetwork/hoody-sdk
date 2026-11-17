// Jump to lists Get a computer and Sign out.
// Get a computer opens the Computers page's own drawer (?get=1); Sign out runs the shell's one sign-out path
// (ShellData.signOut, the account menu's); one Escape closes the palette, with text in the field too.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';
import { ShellDataProvider, type ShellData } from './context';

vi.mock('./search/deep', () => ({ loadDeep: () => Promise.resolve([]) }));

const COMPUTERS = { id: 'computers', path: '/computers', title: 'title', strings: { title: 'Computers', nav: 'Computers' }, status: 'ready', nav: { icon: 'home', group: 'main', label: 'nav' } };
const HOME = { id: 'home', path: '/home', title: 'title', strings: { title: 'Home', nav: 'Home' }, status: 'ready', nav: { icon: 'home', group: 'main', label: 'nav' } };

async function open(pages: readonly unknown[], shell: Partial<ShellData> = {}) {
  const onOpenChange = vi.fn();
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], ...shell }}>
          <CommandPalette pages={pages as PageManifest[]} isOpen onOpenChange={onOpenChange} />
        </ShellDataProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  const navigate = vi.spyOn(router, 'navigate');
  await userEvent.click(screen.getByRole('searchbox'));
  await act(async () => {}); // the index has loaded
  return { navigate, onOpenChange };
}

// React Aria draws the list's empty state inside an element of the menuitem role: it is not a row.
const rows = () => screen.queryAllByRole('menuitem').map((e) => e.textContent).filter((x) => x !== 'No matching commands.');

describe('CommandPalette: Get a computer, Sign out, Escape', () => {
  it('"new computer" finds Get a computer; Enter opens the Computers page drawer', async () => {
    const { navigate, onOpenChange } = await open([HOME, COMPUTERS]);
    await userEvent.keyboard('new computer');
    expect(rows()).toEqual(['Get a computer']);
    await userEvent.keyboard('{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(JSON.stringify(navigate.mock.calls[0]?.[0])).toContain('/computers?get=1');
  });

  it('a load that hides the Computers page offers no Get a computer', async () => {
    await open([HOME]);
    expect(rows().some((r) => r?.includes('Get a computer'))).toBe(false);
    await userEvent.keyboard('new computer');
    expect(rows()).toEqual([]);
  });

  it('"sign out" and "logout" find Sign out; Enter closes the palette and asks the shell to sign out, once, going nowhere', async () => {
    const signOut = vi.fn();
    const { navigate, onOpenChange } = await open([HOME], { signOut });
    await userEvent.keyboard('logout');
    expect(rows()).toEqual(['Sign out']);
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.keyboard('sign out');
    expect(rows()).toEqual(['Sign out']);
    expect(signOut).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the empty field lists both under Commands', async () => {
    const first = await open([HOME, COMPUTERS], { signOut: () => {} });
    expect(rows()).toEqual(expect.arrayContaining(['Get a computer', 'Sign out']));
    expect(first.onOpenChange).not.toHaveBeenCalled();
  });

  it('a shell with no sign-out offers no Sign out', async () => {
    await open([HOME]);
    expect(rows().some((r) => r?.includes('Sign out'))).toBe(false);
    await userEvent.keyboard('sign out');
    expect(rows()).toEqual([]);
  });

  it('one Escape closes the palette with text that matches nothing', async () => {
    const { onOpenChange } = await open([HOME]);
    await userEvent.keyboard('zzzzqq');
    expect(screen.getByText('No matching commands.')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('one Escape closes the palette with a result listed', async () => {
    const { onOpenChange } = await open([HOME]);
    await userEvent.keyboard('home');
    expect(rows().length).toBeGreaterThan(0);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
