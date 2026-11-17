// The page shown stays until the next page's view is ready, never a blank or a
// skeleton in its place, with a thin pending line while it waits; focus then moves to the new page's title; a left-nav
// link loads its page's view when the pointer rests on it or it takes focus; once idle, the nav pages load one by one.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ComponentType, type ReactElement, type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capture, vgen } from '@core/ctx';
import { holdSecret, type HeldSecret } from '@core/secret';
import { usePathname, useSearchParam } from '@kit/nav';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { ShownPageWait, useKeepPage } from './pageHost';
import { preloadOnIdle, preloadPage, type IdleScheduler } from './preload';

const strings = { title: 'Page', nav: 'Page' } as const;
const titled = (name: string) =>
  function View(): ReactElement {
    return (
      <>
        <h1 data-hub-title tabIndex={-1}>
          {name}
        </h1>
        <p>{`${name} body`}</p>
      </>
    );
  };

/** A page whose view arrives when the test says so; `load` counts the calls. */
function gated(id: string, name: string, order: number) {
  let open: (v: { default: ComponentType }) => void = () => undefined;
  const ready = new Promise<{ default: ComponentType }>((r) => (open = r));
  const load = vi.fn(() => ready);
  const page = definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load, status: 'ready', sensitive: false, strings: { ...strings, nav: name }, nav: { group: 'main', order, icon: 'apps', label: 'nav' } });
  return { page, load, release: () => open({ default: titled(name) }) };
}
const plain = (id: string, name: string, order: number): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: titled(name) }), status: 'ready', sensitive: false, strings: { ...strings, nav: name }, nav: { group: 'main', order, icon: 'apps', label: 'nav' } });

async function open(pages: PageManifest[], path: string, shell = false) {
  const router = buildRouter(pages, { queryClient: new QueryClient(), shell, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1 });
  const go = async (href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
  };
  return { router, go };
}
/** The router inside a ShownPageWait the test sets (what the shell's realm link hold provides), in a #hub-main. */
async function openHeld(pages: PageManifest[], path: string) {
  const router = buildRouter(pages, { queryClient: new QueryClient(), shell: false, history: createMemoryHistory({ initialEntries: [path] }) });
  let setWait: (w: ReactNode) => void = () => undefined;
  function Held() {
    const [wait, set] = useState<ReactNode>(null);
    setWait = set;
    return (
      <main id="hub-main">
        <ShownPageWait value={wait}>
          <RouterProvider router={router} />
        </ShownPageWait>
      </main>
    );
  }
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Held />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1 });
  const go = async (href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
  };
  const hold = async (w: ReactNode) => {
    await act(async () => {
      setWait(w);
    });
  };
  return { router, go, hold };
}
const slot = (id: string) => document.querySelector(`[data-hub-page="${id}"]`);
const pendingLine = () => document.querySelector('[data-hub-nav-pending]');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('a page switch keeps the page shown until the next one is ready', () => {
  it('the next view still loading: the page shown stays, no skeleton, a pending line; then the next page shows', async () => {
    const two = gated('two', 'Two', 20);
    const { go } = await open([plain('one', 'One', 10), two.page], '/one');
    await go('/two');
    // The click's page stays drawn and whole while Two's view loads.
    expect(screen.getByRole('heading', { name: 'One' })).toBeInTheDocument();
    expect(screen.getByText('One body')).toBeInTheDocument();
    expect(document.querySelector('[data-skeleton]')).toBeNull();
    expect(slot('two')).toBeNull();
    expect(pendingLine()).not.toBeNull();
    await act(async () => {
      two.release();
    });
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'One' })).toBeNull();
    expect(pendingLine()).toBeNull();
  });

  it('the page left does not render again on the switch: it reads its own last path, and the route moving is no cause', async () => {
    let renders = 0;
    function Counted(): ReactElement {
      renders += 1;
      const path = usePathname();
      return (
        <h1 data-hub-title tabIndex={-1}>
          {`Counted ${path}`}
        </h1>
      );
    }
    const counted = definePage({ id: 'one', path: '/one', title: 'title', layout: 'settings', load: async () => ({ default: Counted }), status: 'ready', sensitive: false, strings });
    const { go } = await open([counted, plain('two', 'Two', 20)], '/one');
    const before = renders;
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(renders).toBe(before);
  });

  it('a view already loaded shows at once, with no pending line left behind', async () => {
    const { go } = await open([plain('one', 'One', 10), plain('two', 'Two', 20)], '/one');
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    await go('/one');
    expect(screen.getByRole('heading', { name: 'One' })).toBeInTheDocument();
    expect(pendingLine()).toBeNull();
  });

  it('a view loaded ahead draws in the same pass: no skeleton at any moment of the switch', async () => {
    const two = gated('two', 'Two', 20);
    const { go } = await open([plain('one', 'One', 10), two.page], '/one');
    preloadPage(two.page);
    await act(async () => {
      two.release();
    });
    let skeletons = 0;
    const seen = new MutationObserver(() => {
      if (document.querySelector('[data-skeleton]')) skeletons += 1;
    });
    seen.observe(document.body, { childList: true, subtree: true });
    await go('/two');
    seen.disconnect();
    expect(screen.getByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(skeletons).toBe(0);
  });

  it('a view that fails to load: the page error shows in its place, nothing waits on it', async () => {
    const bad = definePage({ id: 'bad', path: '/bad', title: 'title', layout: 'settings', load: () => Promise.reject(new Error('chunk gone')), status: 'ready', sensitive: false, strings });
    const { go } = await open([plain('one', 'One', 10), bad], '/one');
    await go('/bad');
    await waitFor(() => expect(slot('bad')).not.toBeNull());
    expect(screen.queryByRole('heading', { name: 'One' })).toBeNull();
    expect(pendingLine()).toBeNull();
    expect(within(slot('bad') as HTMLElement).getByText('This page didn\'t load. Try again in a moment.')).toBeInTheDocument();
  });

  it('with the shell: focus moves to the new page title once its late view shows', async () => {
    const two = gated('two', 'Two', 20);
    const { go } = await open([plain('one', 'One', 10), two.page], '/one', true);
    await go('/two');
    await act(async () => {
      two.release();
    });
    const h = await screen.findByRole('heading', { name: 'Two' });
    await waitFor(() => expect(document.activeElement).toBe(h));
  });
});

describe('a page switch and what the page left still holds', () => {
  it('the view moves with the page drawn: a secret reaching the page left while the next one loads is dropped when the next one draws', async () => {
    let late: () => void = () => undefined;
    let held: HeldSecret | null = null;
    function Minting(): ReactElement {
      const [, setN] = useState(0);
      late = () => {
        held = holdSecret('s3cret-late', capture());
        setN((n) => n + 1);
      };
      return (
        <h1 data-hub-title tabIndex={-1}>
          Minting
        </h1>
      );
    }
    const one = definePage({ id: 'one', path: '/one', title: 'title', layout: 'settings', load: async () => ({ default: Minting }), status: 'ready', sensitive: false, strings: { ...strings, nav: 'One' }, nav: { group: 'main', order: 10, icon: 'apps', label: 'nav' } });
    const two = gated('two', 'Two', 20);
    const { go } = await open([one, two.page], '/one', true);
    const before = vgen();
    await go('/two');
    // The route moved; the page drawn did not: its view has not ended.
    expect(screen.getByRole('heading', { name: 'Minting' })).toBeInTheDocument();
    expect(vgen()).toBe(before);
    await act(async () => {
      late();
    });
    expect(held).not.toBeNull();
    const h = held as unknown as HeldSecret;
    expect(h.reveal(h.ctx)).toBe('s3cret-late');
    await act(async () => {
      two.release();
    });
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(vgen()).toBe(before + 1);
    expect(h.dropped).toBe(true);
    expect(h.reveal(h.ctx)).toBeNull();
  });

  it('a held page whose wait ends before its view loads: the wait stays until the view is ready, no skeleton at any moment', async () => {
    const two = gated('two', 'Two', 20);
    const { go, hold } = await openHeld([plain('one', 'One', 10), two.page], '/one');
    await hold(<p>Waiting for the realm</p>);
    await go('/two');
    expect(screen.getByText('Waiting for the realm')).toBeInTheDocument();
    let skeletons = 0;
    const seen = new MutationObserver(() => {
      if (document.querySelector('[data-skeleton]')) skeletons += 1;
    });
    seen.observe(document.body, { childList: true, subtree: true });
    await hold(null);
    expect(document.querySelector('[data-skeleton]')).toBeNull();
    expect(screen.getByText('Waiting for the realm')).toBeInTheDocument();
    await act(async () => {
      two.release();
    });
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    seen.disconnect();
    expect(skeletons).toBe(0);
    expect(screen.queryByText('Waiting for the realm')).toBeNull();
  });

  it('a held page takes the title focus once its wait ends and it shows', async () => {
    const { go, hold } = await openHeld([plain('one', 'One', 10), plain('two', 'Two', 20)], '/one');
    await hold(<p>Waiting for the realm</p>);
    await go('/two');
    await hold(null);
    const h = await screen.findByRole('heading', { name: 'Two' });
    await waitFor(() => expect(document.activeElement).toBe(h));
  });

  it('a switch to a view still loading leaves React no complaint: the wait goes through use() every render', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const two = gated('two', 'Two', 20);
    const { go } = await open([plain('one', 'One', 10), two.page], '/one');
    await go('/two');
    await act(async () => {
      two.release();
    });
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    const said = errors.mock.calls.map((c) => c.map(String).join(' '));
    errors.mockRestore();
    expect(said.filter((m) => /use\(\)|suspended/i.test(m))).toEqual([]);
  });
});

describe('a page left and come back to before the next one drew (logs page.spec)', () => {
  /** A page that reads its ?v= once, as it mounts (a one-time restore), counts its mounts, and notes every ?v= each
   *  instance renders with (`<mount>:<v>`): a page that saved what it renders with as the view to remember (as Logs
   *  did before its view moved to the address alone) must never render the bare return as its own. */
  function remembering(keep: boolean) {
    const seen = { mounts: 0, reads: [] as string[] };
    function View(): ReactElement {
      useKeepPage(keep);
      const [v] = useSearchParam('v');
      const shown = typeof v === 'string' ? v : '-';
      const [me] = useState(() => (seen.mounts += 1));
      const [atMount] = useState(shown);
      seen.reads.push(`${me}:${shown}`);
      return (
        <h1 data-hub-title tabIndex={-1}>
          {`One ${atMount}`}
        </h1>
      );
    }
    const page = definePage({ id: 'one', path: '/one', title: 'title', layout: 'settings', load: async () => ({ default: View }), status: 'ready', sensitive: false, strings });
    return { page, seen };
  }

  it('is a new visit: it mounts afresh and reads the return as its own first location', async () => {
    const one = remembering(false);
    const two = gated('two', 'Two', 20);
    const { go } = await open([one.page, two.page], '/one?v=a');
    expect(screen.getByRole('heading', { name: 'One a' })).toBeInTheDocument();
    await go('/two');
    // Two's view is still loading: One stays drawn, the same instance.
    expect(screen.getByRole('heading', { name: 'One a' })).toBeInTheDocument();
    await go('/one');
    expect(await screen.findByRole('heading', { name: 'One -' })).toBeInTheDocument();
    expect(one.seen.mounts).toBe(2);
    // The instance left never rendered the bare return as its own (it would save it over the remembered view).
    expect(one.seen.reads.filter((r) => r.startsWith('1:'))).not.toContain('1:-');
    expect(document.querySelector('[data-skeleton]')).toBeNull();
  });

  it('a page kept loaded (useKeepPage) stays as it is: the same instance, never remounted', async () => {
    const one = remembering(true);
    const two = gated('two', 'Two', 20);
    const { go } = await open([one.page, two.page], '/one?v=a');
    await go('/two');
    await go('/one');
    expect(await screen.findByRole('heading', { name: 'One a' })).toBeInTheDocument();
    expect(one.seen.mounts).toBe(1);
    // Drawn for the new visit, the same instance reads the live location again.
    await go('/one?v=c');
    expect(one.seen.reads).toContain('1:c');
  });

  it('a page kept hidden does not render again when the host draws a visit to another page', async () => {
    const one = remembering(true);
    const { go } = await open([one.page, plain('two', 'Two', 20), plain('three', 'Three', 30)], '/one?v=a');
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    const before = one.seen.reads.length;
    await go('/three');
    expect(await screen.findByRole('heading', { name: 'Three' })).toBeInTheDocument();
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(one.seen.reads.slice(before)).toEqual([]);
  });

  it('a move inside the page shown is no new visit: it keeps its instance', async () => {
    const one = remembering(false);
    const { go } = await open([one.page, plain('two', 'Two', 20)], '/one?v=a');
    await go('/one?v=b');
    expect(screen.getByRole('heading', { name: 'One a' })).toBeInTheDocument();
    expect(one.seen.mounts).toBe(1);
  });
});

describe('page views load ahead of a visit', () => {
  it('a left-nav link loads its page view on focus and on hover, once', async () => {
    const two = gated('two', 'Two', 20);
    await open([plain('one', 'One', 10), two.page], '/one', true);
    const link = screen.getAllByRole('link', { name: 'Two' })[0]!;
    expect(two.load).not.toHaveBeenCalled();
    act(() => link.focus());
    expect(two.load).toHaveBeenCalledTimes(1);
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    fireEvent.pointerOver(link, { pointerType: 'mouse' });
    expect(two.load).toHaveBeenCalledTimes(1);
  });

  it('a left-nav link loads its page view on hover', async () => {
    const two = gated('two', 'Two', 20);
    await open([plain('one', 'One', 10), two.page], '/one', true);
    const link = screen.getAllByRole('link', { name: 'Two' })[0]!;
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    fireEvent.pointerOver(link, { pointerType: 'mouse' });
    expect(two.load).toHaveBeenCalledTimes(1);
  });

  it('a failed load is forgotten: the next intent loads again', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: titled('X') });
    const p = { load } as unknown as PageManifest;
    preloadPage(p);
    await act(async () => {});
    preloadPage(p);
    expect(load).toHaveBeenCalledTimes(2);
    preloadPage(p);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('idle: nav pages load one per idle period, lowest order first; a page with no nav entry never; stop ends it', () => {
    const runs: ((d: { timeRemaining: () => number }) => void)[] = [];
    const idle: IdleScheduler = { request: (r) => runs.push(r), cancel: vi.fn() };
    const a = gated('a', 'A', 30), b = gated('b', 'B', 10), c = gated('c', 'C', 20);
    const hidden = { ...gated('h', 'H', 0).page, nav: undefined } as PageManifest;
    const hiddenLoad = vi.spyOn(hidden, 'load');
    const stop = preloadOnIdle([a.page, b.page, hidden, c.page], idle);
    runs.shift()!({ timeRemaining: () => 40 });
    expect(b.load).toHaveBeenCalledTimes(1);
    expect(c.load).not.toHaveBeenCalled();
    // A busy period loads nothing and waits for the next one.
    runs.shift()!({ timeRemaining: () => 2 });
    expect(c.load).not.toHaveBeenCalled();
    runs.shift()!({ timeRemaining: () => 40 });
    expect(c.load).toHaveBeenCalledTimes(1);
    stop();
    expect(idle.cancel).toHaveBeenCalled();
    runs.shift()?.({ timeRemaining: () => 40 });
    expect(a.load).not.toHaveBeenCalled();
    expect(hiddenLoad).not.toHaveBeenCalled();
  });
});

