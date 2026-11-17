// The page groups scroll above the fixed foot; the current page's row is kept in view there,
// scrolling the groups alone and only as far as needed.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import { ShellDataProvider } from './context';
import { PagesProvider } from './pageLinks';
import { Sidebar } from './Sidebar';

const pg = (id: string, title: string) => ({ id, path: `/${id}`, title, nav: {}, strings: { [title]: title }, status: 'ready' }) as unknown as PageManifest;
const PAGES = [pg('home', 'Home'), pg('computers', 'Computers'), pg('bots', 'Bots'), pg('logs', 'Logs'), pg('keys', 'Keys'), pg('account', 'Account')];

/** Rects by element: the groups scroller shows y 100..300; the current row sits at `rowTop` (`rowH` tall). */
function layout(rowTop: number, rowH = 40) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const at = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 200, width: 200, height: h, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    if (Array.from(this.children).some((c) => c.getAttribute('role') === 'group')) return at(100, 200);
    if (this.tagName === 'LI' && this.querySelector('[aria-current="page"]')) return at(rowTop, rowH);
    return at(0, 0);
  });
}

/** Draws the sidebar as its rail from outside the tree, at an unchanged path. */
let setRail: (rail: boolean) => void = () => {};

async function sidebar(at: string) {
  const Component = () => {
    const [rail, set] = useState(false);
    setRail = set;
    return (
      <PagesProvider pages={PAGES}>
        <ShellDataProvider value={{ realms: [], realmId: 'all', computers: [] }}>
          <Sidebar pages={PAGES} collapsed={rail} onToggleCollapsed={() => {}} onNavigate={() => {}} />
        </ShellDataProvider>
      </PagesProvider>
    );
  };
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: [at] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  const groups = screen.getAllByRole('group')[0]!.parentElement as HTMLElement;
  return { router, groups };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Sidebar: the current page stays in view in the scrolling groups', () => {
  it('a current row below the fold scrolls the groups up just enough to show it', async () => {
    layout(330);
    const { groups } = await sidebar('/account');
    // Row bottom 370, view bottom 300: 70 px.
    expect(groups.scrollTop).toBe(70);
    // Only the groups scroll: the nav around them and the page stay put.
    expect(groups.parentElement!.scrollTop).toBe(0);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(window.scrollY).toBe(0);
  });
  it('a current row taller than the view scrolls only until its top is at the view top', async () => {
    layout(150, 250);
    const { groups } = await sidebar('/account');
    // Row 150..400, view 100..300: bringing the bottom in (100) would hide its top; it stops at the top (50).
    expect(groups.scrollTop).toBe(50);
  });
  it('drawing the sidebar as its rail at the same page keeps the row in view', async () => {
    layout(150);
    const { groups } = await sidebar('/account');
    expect(groups.scrollTop).toBe(0);
    vi.restoreAllMocks();
    layout(330);
    await act(async () => {
      setRail(true);
    });
    // The same scroller, now drawn as the rail; the path did not change.
    expect(groups.isConnected).toBe(true);
    expect(groups.scrollTop).toBe(70);
  });
  it('a current row above the view scrolls the groups back down to its top', async () => {
    layout(330);
    const { router, groups } = await sidebar('/account');
    expect(groups.scrollTop).toBe(70);
    vi.restoreAllMocks();
    layout(60);
    await act(async () => {
      await router.navigate({ to: '/home' } as never);
    });
    // Row top 60, view top 100: 40 px back.
    expect(groups.scrollTop).toBe(30);
  });
  it('a current row already in view does not move the groups', async () => {
    layout(150);
    const { groups } = await sidebar('/bots');
    expect(groups.scrollTop).toBe(0);
  });
  it('arriving at another page keeps that row in view too', async () => {
    layout(150);
    const { router, groups } = await sidebar('/home');
    expect(groups.scrollTop).toBe(0);
    vi.restoreAllMocks();
    layout(320);
    await act(async () => {
      await router.navigate({ to: '/keys' } as never);
    });
    expect(screen.getByRole('link', { name: 'Keys' })).toHaveAttribute('aria-current', 'page');
    expect(groups.scrollTop).toBe(60);
  });
});
