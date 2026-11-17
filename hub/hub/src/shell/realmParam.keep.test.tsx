// While the shell waits on a realm a link asked for, only the page the
// route shows waits; a page kept loaded (the Board's running broadcast) stays mounted and hidden, its state intact. An id
// that turns out unknown leaves it exactly as it was. And the route's own kept page, linked into one of its own
// subroutes, keeps reading the location it was showing until the wait ends.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { usePathname } from '@kit/nav';
import { useKeepPage } from './pageHost';

const ctl = vi.hoisted(() => ({
  list: [] as string[],
  load: null as null | (() => Promise<string[]>),
  switches: [] as string[],
}));
vi.mock('@core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRealms: () => ({ selected: 'all', pinned: null, rows: [] }),
}));
vi.mock('@core/shell', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  realmList: () => ctl.list,
  loadRealms: () => (ctl.load ? ctl.load() : Promise.resolve(ctl.list)),
  beginSwitch: (id: string) => {
    ctl.switches.push(id);
    return { done: Promise.resolve(true), cancel: () => undefined };
  },
  switchRevision: () => 0,
}));

const UNKNOWN = '6a00000000000000000000e1';

function Board() {
  useKeepPage(true);
  const [count, setCount] = useState(0);
  // Like the live Board: a subroute shows another view in place of the canvas.
  if (usePathname().startsWith('/board/open/')) return <p>Program view</p>;
  return (
    <div>
      <h1 data-hub-title tabIndex={-1}>
        Board
      </h1>
      <button type="button" onClick={() => setCount((n) => n + 1)}>
        Broadcast {count}
      </button>
    </div>
  );
}
function Home() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
const page = (id: string, C: () => ReactElement): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: C }), status: 'ready', sensitive: false, strings: { title: id } });
const PAGES = [page('board', Board), page('home', Home)];

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
async function open(path: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await settle();
  return router;
}
const go = async (router: Awaited<ReturnType<typeof open>>, href: string) => {
  await act(async () => {
    await router.navigate({ href } as never);
  });
  await settle();
};
const boardSlot = () => document.querySelector('[data-hub-page="board"]');
// The page area's wait (RealmWait); the switch line, not the wait itself, announces it.
const waiting = () => document.querySelector('[data-hub-realm-wait]');

beforeEach(() => {
  Object.assign(ctl, { list: [], load: null, switches: [] });
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

async function boardAtTwo() {
  const router = await open('/board');
  const btn = screen.getByRole('button', { name: 'Broadcast 0' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  // The same DOM node later means the page was never unmounted (a hidden Activity keeps its nodes; a remount makes new).
  const node = screen.getByRole('button', { name: 'Broadcast 2' });
  return { router, node };
}

describe('a kept page while a ?open_realm= link waits', () => {
  it('stays mounted and hidden during the wait, and after an unknown id is exactly as it was', async () => {
    const { router, node } = await boardAtTwo();
    let answer: (ids: string[]) => void = () => {};
    ctl.load = () => new Promise<string[]>((r) => (answer = r));
    await go(router, `/home?open_realm=${UNKNOWN}`);
    // Waiting: Home not drawn yet, the Board's slot still there, hidden, never unmounted.
    expect(waiting()).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Home' })).toBeNull();
    expect(boardSlot()).not.toBeNull();
    expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(true);
    expect(node.isConnected).toBe(true);
    await act(async () => answer([]));
    await settle();
    expect(ctl.switches).toEqual([]);
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeTruthy();
    expect(node.isConnected).toBe(true);
    await go(router, '/board');
    expect(screen.getByRole('button', { name: 'Broadcast 2' })).toBe(node);
  });

  it('the kept page is the route itself: hidden while it waits, then shown with its state', async () => {
    const { router, node } = await boardAtTwo();
    let answer: (ids: string[]) => void = () => {};
    ctl.load = () => new Promise<string[]>((r) => (answer = r));
    await go(router, `/board?open_realm=${UNKNOWN}`);
    expect(waiting()).not.toBeNull();
    expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(true);
    await act(async () => answer([]));
    await settle();
    expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(false);
    expect(screen.getByRole('button', { name: 'Broadcast 2' })).toBe(node);
  });

  it("a link into the kept page's own subroute: the page keeps showing what it showed until the wait ends", async () => {
    const { router, node } = await boardAtTwo();
    let answer: (ids: string[]) => void = () => {};
    ctl.load = () => new Promise<string[]>((r) => (answer = r));
    await go(router, `/board/open/x?open_realm=${UNKNOWN}`);
    expect(waiting()).not.toBeNull();
    expect(node.isConnected).toBe(true);
    expect(screen.queryByText('Program view')).toBeNull();
    await act(async () => answer([]));
    await settle();
    // The wait over (unknown id, no switch), the page follows its route.
    expect(screen.getByText('Program view')).toBeTruthy();
  });
});
