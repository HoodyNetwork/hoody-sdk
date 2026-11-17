// The Board's program count on its left-menu item. The shell loads the page's count reader through
// the manifest's navCount (never the page), shows the total as a neutral count beside the item when it is known and
// above 0 (99+ past 99), names it in the item's accessible name and in a tip on hover and focus, and shows nothing at 0,
// while the count is unknown, or when the reader fails to load or throws. A new count redraws the same link (focus on
// it stays). On the collapsed rail the count is in the tooltip, never an alert dot.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { use, useSyncExternalStore } from 'react';
import { describe, expect, it } from 'vitest';
import { definePage, type NavCount, type PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';

const boardStrings = {
  title: 'Board',
  nav: 'Board',
  'nav.count_one': '{{name}}, {{count}} program',
  'nav.count_other': '{{name}}, {{count}} programs',
  'nav.countTip_one': '{{count}} program on this Board',
  'nav.countTip_other': '{{count}} programs on this Board',
} as const;

/** A count the test sets, read the way a page's reader would (a store with subscribers). */
function countStore(first: NavCount | null) {
  let now = first;
  const subs = new Set<() => void>();
  const set = (c: NavCount | null) => {
    now = c;
    for (const s of subs) s();
  };
  const useCount = () =>
    useSyncExternalStore(
      (cb) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
      () => now,
    );
  return { set, useCount, listeners: () => subs.size };
}

// `id`: the page's place comes from the shell's NAV_PLACE ('guide' sits in the help group, in the menu's foot).
const board = (load: () => Promise<{ default: () => NavCount | null }>, id = 'board') =>
  definePage({
    id,
    path: '/board',
    title: 'title',
    layout: 'canvas',
    load: async () => ({ default: () => null }),
    status: 'ready',
    sensitive: false,
    strings: boardStrings,
    nav: { group: 'main', order: 50, icon: 'apps', label: 'nav' },
    navCount: { load, label: 'nav.count', tip: 'nav.countTip' },
  });
const home = { id: 'home', path: '/home', title: 'home', load: async () => ({ default: () => null }), strings: { home: 'Home' }, status: 'ready', nav: { group: 'main', order: 10, label: 'home' } } as unknown as PageManifest;

/** Mounts the menu over `first`; the returned setter swaps the page list (an item leaving and coming back). `extra`:
 *  more shell data (a shell badge's source). */
async function mount(first: PageManifest[], collapsed = false, extra: { botsWaiting?: number } = {}) {
  let pages = first;
  const subs = new Set<() => void>();
  const setPages = (next: PageManifest[]) => {
    pages = next;
    for (const s of subs) s();
  };
  const Component = () => {
    const now = useSyncExternalStore(
      (cb) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
      () => pages,
    );
    return (
      <PagesProvider pages={now}>
        <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [], account: { name: 'Ada' }, ...extra }}>
          <Sidebar pages={now} collapsed={collapsed} onToggleCollapsed={() => {}} onNavigate={() => {}} />
        </ShellDataProvider>
      </PagesProvider>
    );
  };
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return setPages;
}
const boardLink = () => document.querySelector<HTMLAnchorElement>('a[href="/board"]') as HTMLAnchorElement;
const pill = () => boardLink().querySelector('[data-count-badge]');

describe('the Board count on its menu item', () => {
  it('a known count above 0: a neutral count beside the item, named with the item, and a tip on focus', async () => {
    const user = userEvent.setup();
    const c = countStore({ total: 3 });
    await mount([home, board(async () => ({ default: c.useCount }))]);
    expect(boardLink()).toHaveAccessibleName('Board, 3 programs');
    expect(pill()).toHaveTextContent('3');
    for (let i = 0; i < 10 && document.activeElement !== boardLink(); i += 1) await user.tab();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('3 programs on this Board'));
  });

  it('the tip also opens on hover, without focus', async () => {
    const user = userEvent.setup();
    const c = countStore({ total: 3 });
    await mount([home, board(async () => ({ default: c.useCount }))]);
    // As in a browser, the pointer moves on the page before it reaches the item: react-aria counts a hover only once a
    // pointer move has set the pointer modality, and user.hover sends its enter events before its own move.
    await user.pointer({ target: document.body });
    await user.hover(boardLink());
    expect(document.activeElement).not.toBe(boardLink());
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('3 programs on this Board'));
  });

  // The link's name comes from its aria-label, so a pill that tools could read would not change the name: check it directly.
  it('the pill is hidden from assistive tech; the count is read only in the name', async () => {
    const c = countStore({ total: 3 });
    await mount([home, board(async () => ({ default: c.useCount }))]);
    expect(pill()).toHaveTextContent('3');
    // The kit badge sits in the shell's count mark, which hides it (and everything in it) from assistive tech.
    expect(pill()!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(boardLink().contains(pill()!.closest('[aria-hidden="true"]'))).toBe(true);
    expect(boardLink()).toHaveAccessibleName('Board, 3 programs');
  });

  it('one program reads in the singular; past 99 the count shows 99+ and the name keeps the number', async () => {
    const c = countStore({ total: 1 });
    await mount([home, board(async () => ({ default: c.useCount }))]);
    expect(boardLink()).toHaveAccessibleName('Board, 1 program');
    await act(async () => c.set({ total: 120 }));
    expect(pill()).toHaveTextContent('99+');
    expect(boardLink()).toHaveAccessibleName('Board, 120 programs');
  });

  it('nothing at 0 or while unknown; a count arriving later draws on the same link', async () => {
    const c = countStore(null);
    await mount([home, board(async () => ({ default: c.useCount }))]);
    const link = boardLink();
    expect(link).toHaveAccessibleName('Board');
    expect(link.textContent).toBe('Board');
    await act(async () => c.set({ total: 0 }));
    expect(boardLink().textContent).toBe('Board');
    await act(async () => c.set({ total: 2 }));
    expect(boardLink()).toBe(link);
    expect(link).toHaveAccessibleName('Board, 2 programs');
    await act(async () => c.set(null));
    expect(link).toHaveAccessibleName('Board');
    expect(link.textContent).toBe('Board');
  });

  it('a reader that fails to load, or throws, leaves the item as it is without a count', async () => {
    await mount([home, board(() => Promise.reject(new Error('chunk gone')))]);
    expect(boardLink()).toHaveAccessibleName('Board');
    document.body.innerHTML = '';
    await mount([
      home,
      board(async () => ({
        default: () => {
          throw new Error('reader broke');
        },
      })),
    ]);
    expect(boardLink()).toHaveAccessibleName('Board');
    expect(boardLink().textContent).toBe('Board');
  });

  it('a reader that suspends or throws after a count showed takes the count away with it', async () => {
    let state: NavCount | null | Promise<void> | Error = { total: 3 };
    const subs = new Set<() => void>();
    const set = (v: typeof state) => {
      state = v;
      for (const f of subs) f();
    };
    const useCount = () => {
      const v = useSyncExternalStore(
        (cb) => {
          subs.add(cb);
          return () => subs.delete(cb);
        },
        () => state,
      );
      if (v instanceof Promise) use(v);
      if (v instanceof Error) throw v;
      return v as NavCount | null;
    };
    await mount([home, board(async () => ({ default: useCount }))]);
    const link = boardLink();
    expect(link).toHaveAccessibleName('Board, 3 programs');
    let done: () => void = () => undefined;
    await act(async () => set(new Promise<void>((r) => (done = r))));
    expect(link).toHaveAccessibleName('Board');
    expect(link.textContent).toBe('Board');
    await act(async () => {
      state = { total: 5 };
      done();
    });
    await waitFor(() => expect(link).toHaveAccessibleName('Board, 5 programs'));
    await act(async () => set(new Error('reader broke later')));
    expect(boardLink()).toBe(link);
    expect(link).toHaveAccessibleName('Board');
    expect(link.textContent).toBe('Board');
  });

  it('a counted page in the help group shows its count too', async () => {
    const c = countStore({ total: 2 });
    await mount([home, board(async () => ({ default: c.useCount }), 'guide')]);
    expect(boardLink()).toHaveAccessibleName('Board, 2 programs');
    expect(pill()).toHaveTextContent('2');
  });

  it('on the collapsed rail: no alert dot for a count, the tooltip carries it', async () => {
    const user = userEvent.setup();
    const c = countStore({ total: 4 });
    await mount([home, board(async () => ({ default: c.useCount }))], true);
    expect(boardLink()).toHaveAccessibleName('Board, 4 programs');
    expect(boardLink().querySelector('.railDot')).toBeNull();
    for (let i = 0; i < 10 && document.activeElement !== boardLink(); i += 1) await user.tab();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Board4 programs on this Board'));
  });

  it('focus on the item stays through count changes: the same link keeps it while the count comes, moves and goes', async () => {
    const c = countStore(null);
    await mount([home, board(async () => ({ default: c.useCount }))]);
    const link = boardLink();
    act(() => link.focus());
    expect(document.activeElement).toBe(link);
    for (const total of [2, 3, 120, 0, 5]) {
      await act(async () => c.set({ total }));
      expect(boardLink()).toBe(link);
      expect(document.activeElement).toBe(link);
    }
    await act(async () => c.set(null));
    expect(document.activeElement).toBe(link);
  });

  it('one reader load per page, also when its item leaves the menu and comes back; nothing stays subscribed meanwhile', async () => {
    const c = countStore({ total: 2 });
    let loads = 0;
    const page = board(async () => {
      loads += 1;
      return { default: c.useCount };
    });
    const setPages = await mount([home, page]);
    expect(boardLink()).toHaveAccessibleName('Board, 2 programs');
    await act(async () => setPages([home]));
    expect(boardLink()).toBeNull();
    expect(c.listeners()).toBe(0);
    await act(async () => c.set({ total: 4 }));
    await act(async () => setPages([home, page]));
    await waitFor(() => expect(boardLink()).toHaveAccessibleName('Board, 4 programs'));
    expect(c.listeners()).toBe(1);
    expect(loads).toBe(1);
  });

  it('a badge the shell sets itself wins over the page count (Bots waiting, with a navCount)', async () => {
    const c = countStore({ total: 3 });
    await mount([home, board(async () => ({ default: c.useCount }), 'bots')], false, { botsWaiting: 2 });
    expect(boardLink()).toHaveAccessibleName('Board 2 waiting for you');
    expect(pill()).toHaveTextContent('2');
  });

  it('definePage refuses a navCount whose load is not a function, or that names no label', () => {
    const base = { id: 'x', path: '/x', title: 'title', layout: 'canvas', load: async () => ({ default: () => null }), status: 'ready', sensitive: false, strings: boardStrings, nav: { group: 'main', order: 1, icon: 'apps', label: 'nav' } } as const;
    const nc = { load: async () => ({ default: () => null }), label: 'nav.count', tip: 'nav.countTip' } as const;
    expect(() => definePage({ ...base, navCount: { ...nc, load: 'board-count' as never } })).toThrow(/bad navCount/);
    expect(() => definePage({ ...base, navCount: { ...nc, label: undefined as never } })).toThrow(/bad navCount/);
    expect(() => definePage({ ...base, navCount: nc })).not.toThrow();
  });

  it('definePage refuses a navCount without a menu item, or with strings the page does not have', () => {
    const base = { id: 'x', path: '/x', title: 'title', layout: 'canvas', load: async () => ({ default: () => null }), status: 'ready', sensitive: false, strings: boardStrings } as const;
    const nc = { load: async () => ({ default: () => null }), label: 'nav.count', tip: 'nav.countTip' } as const;
    expect(() => definePage({ ...base, navCount: nc })).toThrow(/bad navCount/);
    expect(() => definePage({ ...base, nav: { group: 'main', order: 1, icon: 'apps', label: 'nav' }, navCount: { ...nc, tip: 'nope' as never } })).toThrow(/bad navCount/);
    expect(() => definePage({ ...base, nav: { group: 'main', order: 1, icon: 'apps', label: 'nav' }, navCount: nc })).not.toThrow();
  });
});
