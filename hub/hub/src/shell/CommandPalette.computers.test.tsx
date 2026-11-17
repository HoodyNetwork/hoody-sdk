// Jump to finds a computer by its name. The shell's own list
// of computers (the top bar's) is searched by name; a row opens that computer on the Computers page.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';
import { ShellDataProvider, type ShellData } from './context';

vi.mock('./search/deep', () => ({ loadDeep: () => Promise.resolve([]) }));

const COMPUTERS = { id: 'computers', path: '/computers', title: 'title', strings: { title: 'Computers', nav: 'Computers' }, status: 'ready', nav: { icon: 'home', group: 'main', label: 'nav' } };
const HOME = { id: 'home', path: '/home', title: 'title', strings: { title: 'Home', nav: 'Home' }, status: 'ready', nav: { icon: 'home', group: 'main', label: 'nav' } };
const data: ShellData = {
  realms: [],
  realmId: 'all',
  computers: [
    { id: 'aaaaaaaaaaaaaaaaaaaa1111', name: 'devbox-rp-d' },
    { id: 'bbbbbbbbbbbbbbbbbbbb2222', name: 'devbox-w2-c1' },
    { id: 'cccccccccccccccccccc3333', name: 'build box' },
  ],
};

async function open(pages: readonly unknown[], shell: ShellData = data) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ShellDataProvider value={shell}>
          <CommandPalette pages={pages as PageManifest[]} isOpen onOpenChange={() => {}} />
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
  return navigate;
}

// React Aria draws the list's empty state inside an element of the menuitem role: it is not a row.
const rows = () => screen.queryAllByRole('menuitem').map((e) => e.textContent).filter((x) => x !== 'No matching commands.');

describe('CommandPalette: computers by name', () => {
  it('a typed name lists that computer, marked as a computer, and Enter opens it on the Computers page', async () => {
    const navigate = await open([HOME, COMPUTERS]);
    await userEvent.keyboard('devbox-rp-d');
    expect(rows()).toEqual(['devbox-rp-dComputer']);
    expect(screen.queryByText('No matching commands.')).toBeNull();
    await userEvent.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalled();
    expect(JSON.stringify(navigate.mock.calls[0]?.[0])).toContain('devbox-rp-d.1111');
  });

  it('the start of a name finds every computer it starts; the Computers page itself stays first for its own name', async () => {
    await open([HOME, COMPUTERS]);
    await userEvent.keyboard('devbox');
    expect(rows()).toEqual(['devbox-rp-dComputer', 'devbox-w2-c1Computer']);
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.keyboard('devbox-w2');
    expect(rows()).toEqual(['devbox-w2-c1Computer']);
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.keyboard('computers');
    // The page row (it may end with its g-jump keys); no computer is named "computers".
    expect(rows()[0]).toMatch(/^Computers/);
    expect(rows().some((r) => r?.includes('devbox'))).toBe(false);
  });

  it('an empty field lists no computer', async () => {
    await open([HOME, COMPUTERS]);
    expect(rows().some((r) => r?.includes('devbox'))).toBe(false);
  });

  it('a load that hides the Computers page offers no computer row', async () => {
    await open([HOME]);
    await userEvent.keyboard('devbox-rp-d');
    expect(rows()).toEqual([]);
    expect(screen.getByText('No matching commands.')).toBeInTheDocument();
  });
});
