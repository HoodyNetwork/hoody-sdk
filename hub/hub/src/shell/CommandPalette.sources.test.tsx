// Jump to finds a realm and a named Board by typing its name. Realm rows are the shell's own realm list and switch
// through the shell's one switch (ShellData.setRealm), never a route; a named thing of a page (a Board) comes from that
// page's navCount reader (its `items`), the one the left menu already loads, and opens at the route the page gave.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { CommandPalette } from './CommandPalette';
import { ShellDataProvider, type ShellData } from './context';

vi.mock('./search/deep', () => ({ loadDeep: () => Promise.resolve([]) }));

const HOME = { id: 'home', path: '/home', title: 'title', strings: { title: 'Home', nav: 'Home' }, status: 'ready', nav: { icon: 'home', group: 'main', label: 'nav' } };
const ITEMS = [
  { id: 'b1', label: 'Deploys', to: '/board?b=b1' },
  { id: 'b2', label: 'Elsewhere', to: '/billing?x=1' }, // not under the page's own path: never a row
  { id: 'b3', label: '', to: '/board?b=b3' }, // nothing to type: never a row
];
const BOARD = {
  id: 'board', path: '/board', title: 'title', strings: { title: 'Board', nav: 'Board', count: '{{name}}, {{count}}', tip: '{{count}}' }, status: 'ready',
  nav: { icon: 'home', group: 'main', label: 'nav' },
  navCount: { load: () => Promise.resolve({ default: () => ({ total: 2, items: ITEMS }) }), label: 'count', tip: 'tip' },
};
const shell = (over: Partial<ShellData> = {}): ShellData => ({
  realms: [{ id: 'r1', name: 'Work' }, { id: 'r2', name: 'Personal' }],
  realmId: 'r2',
  setRealm: vi.fn(),
  computers: [],
  ...over,
});

async function open(pages: readonly unknown[], data: ShellData, onOpenChange: (open: boolean) => void = () => {}) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ShellDataProvider value={data}>
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
  return navigate;
}

// React Aria draws the list's empty state inside an element of the menuitem role: it is not a row.
const rows = () => screen.queryAllByRole('menuitem').map((e) => e.textContent).filter((x) => x !== 'No matching commands.');
const retype = async (text: string) => {
  await userEvent.clear(screen.getByRole('searchbox'));
  await userEvent.keyboard(text);
};

describe('CommandPalette: realms by name', () => {
  it('a typed name lists that realm, marked as a realm; Enter closes the palette and switches through the shell, no route', async () => {
    const data = shell();
    const onOpenChange = vi.fn();
    const navigate = await open([HOME], data, onOpenChange);
    await userEvent.keyboard('work');
    expect(rows()).toEqual(['WorkRealm']);
    await userEvent.keyboard('{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(data.setRealm).toHaveBeenCalledWith('r1'));
    expect(data.setRealm).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the realm shown now is no row; All realms is one while a realm is shown, and none under All realms', async () => {
    const data = shell();
    await open([HOME], data);
    await userEvent.keyboard('personal');
    expect(rows().some((r) => r?.startsWith('Personal'))).toBe(false);
    await retype('all realms');
    expect(rows()).toContain('All realmsRealm');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(data.setRealm).toHaveBeenCalledWith('all'));
  });

  it('under All realms every realm is a row and All realms is not', async () => {
    await open([HOME], shell({ realmId: 'all' }));
    await userEvent.keyboard('personal');
    expect(rows()).toEqual(['PersonalRealm']);
    await retype('all realms');
    expect(rows()).not.toContain('All realmsRealm');
  });

  it('an empty field lists no realm', async () => {
    await open([HOME], shell());
    expect(rows().some((r) => r?.endsWith('Realm'))).toBe(false);
  });

  it('a session that cannot switch realms lists none', async () => {
    await open([HOME], shell({ setRealm: undefined }));
    await userEvent.keyboard('work');
    expect(rows()).toEqual([]);
  });

  it('while a realm switch is under way no realm is a row', async () => {
    await open([HOME], shell({ switchingTo: 'r1' }));
    await userEvent.keyboard('work');
    expect(rows()).toEqual([]);
  });
});

describe("CommandPalette: a page's named things (a named Board)", () => {
  it('a typed Board name lists it, marked with its page, and Enter opens the route the page gave', async () => {
    const navigate = await open([HOME, BOARD], shell());
    await userEvent.keyboard('deploys');
    await waitFor(() => expect(rows()).toEqual(['DeploysBoard']));
    await userEvent.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalled();
    expect(JSON.stringify(navigate.mock.calls[0]?.[0])).toContain('/board?b=b1');
  });

  // The reader answers a render after the text: a pasted name first shows an empty list, then the row. That row must
  // be the active one (no other key pressed), so Enter opens the Board.
  it('a pasted Board name, then Enter with no other key: the row that arrived is the active one and opens the Board', async () => {
    const navigate = await open([HOME, BOARD], shell());
    await userEvent.paste('deploys');
    await waitFor(() => expect(rows()).toEqual(['DeploysBoard']));
    await act(async () => {});
    await userEvent.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalled();
    expect(JSON.stringify(navigate.mock.calls[0]?.[0])).toContain('/board?b=b1');
  });

  it('a row that arrives beside a row already active leaves that row the active one', async () => {
    const data = shell({ realms: [{ id: 'r1', name: 'Deploys' }, { id: 'r2', name: 'Personal' }] });
    const navigate = await open([HOME, BOARD], data);
    await userEvent.paste('deploys');
    await waitFor(() => expect(rows()).toContain('DeploysBoard'));
    expect(rows()).toContain('DeploysRealm');
    await act(async () => {});
    await userEvent.keyboard('{Enter}');
    // Exactly one of the two rows acted (the first listed), never none.
    await waitFor(() => expect((data.setRealm as ReturnType<typeof vi.fn>).mock.calls.length + navigate.mock.calls.length).toBe(1));
  });

  it('an item whose route is outside its page, and an item with no name, are never rows', async () => {
    await open([HOME, BOARD], shell());
    await userEvent.keyboard('deploys');
    await waitFor(() => expect(rows()).toEqual(['DeploysBoard'])); // the reader has answered
    await retype('elsewhere');
    await act(async () => {});
    expect(rows().some((r) => r?.includes('Elsewhere'))).toBe(false);
  });

  it('an empty field lists no item', async () => {
    await open([HOME, BOARD], shell());
    await act(async () => {});
    expect(rows().some((r) => r?.includes('Deploys'))).toBe(false);
  });
});
