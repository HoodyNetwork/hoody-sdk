// Each page keeps its own scroll place. A page the person comes back to opens where
// they left it; a page not yet visited opens at its top, never at the offset the page left had; a navigation inside one
// page (its search, its subroute) leaves the scroll alone; content that grows late is scrolled into once it is tall
// enough, unless the person scrolls first.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';

const strings = { title: 'Page', nav: 'Page' } as const;
const plain = (id: string, name: string, order: number): PageManifest =>
  definePage({
    id,
    path: `/${id}`,
    title: 'title',
    layout: 'settings',
    load: async () => ({
      default: function View(): ReactElement {
        return (
          <h1 data-hub-title tabIndex={-1}>
            {name}
          </h1>
        );
      },
    }),
    status: 'ready',
    sensitive: false,
    strings: { ...strings, nav: name },
    nav: { group: 'main', order, icon: 'apps', label: 'nav' },
  });

async function open(pages: PageManifest[], path: string) {
  const router = buildRouter(pages, { queryClient: new QueryClient(), shell: true, history: createMemoryHistory({ initialEntries: [path] }) });
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
const main = () => document.getElementById('hub-main') as HTMLElement;
/** The person scrolls the content area to `y` (happy-dom fires no scroll event for a scrollTop write). */
const scrollTo = (y: number) => {
  main().scrollTop = y;
  fireEvent.scroll(main());
};
/** A content area only `room()` tall: like a browser, a scrollTop past it stops at it. */
function clampTo(room: () => number) {
  let top = 0;
  Object.defineProperty(main(), 'scrollTop', { configurable: true, get: () => top, set: (v: number) => (top = Math.max(0, Math.min(v, room()))) });
}
const frames = async (n: number) => {
  for (let i = 0; i < n; i += 1) await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('each page keeps its own scroll place', () => {
  it('a page not yet visited opens at its top; coming back opens where the person left it', async () => {
    const { go } = await open([plain('one', 'One', 10), plain('two', 'Two', 20)], '/one');
    scrollTo(300);
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(main().scrollTop).toBe(0);
    scrollTo(40);
    await go('/one');
    expect(await screen.findByRole('heading', { name: 'One' })).toBeInTheDocument();
    expect(main().scrollTop).toBe(300);
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    expect(main().scrollTop).toBe(40);
  });

  it('a navigation inside the page shown (its search) leaves the scroll where it is', async () => {
    const { go } = await open([plain('one', 'One', 10), plain('two', 'Two', 20)], '/one');
    scrollTo(250);
    await go('/one?q=abc');
    expect(main().scrollTop).toBe(250);
  });

  it('content that grows late: the place is reached once the page is tall enough', async () => {
    let room = 1000;
    const { go } = await open([plain('one', 'One', 10), plain('two', 'Two', 20)], '/one');
    clampTo(() => room);
    scrollTo(600);
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    room = 100; // One's data is still loading: only a skeleton's height
    await go('/one');
    expect(await screen.findByRole('heading', { name: 'One' })).toBeInTheDocument();
    expect(main().scrollTop).toBe(100);
    room = 1000; // the data arrives
    await frames(3);
    expect(main().scrollTop).toBe(600);
  });

  it('the page scrolls itself while its content grows (a row brought into view): its scroll wins, nothing jumps back', async () => {
    let room = 1000;
    const { go } = await open([plain('one', 'One', 10), plain('two', 'Two', 20)], '/one');
    clampTo(() => room);
    scrollTo(600);
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    room = 100;
    await go('/one');
    expect(await screen.findByRole('heading', { name: 'One' })).toBeInTheDocument();
    expect(main().scrollTop).toBe(100);
    room = 1000;
    main().scrollTop = 850; // the page's own scroll, no input from the person
    await frames(3);
    expect(main().scrollTop).toBe(850);
  });

  it('the person scrolls before the content grows: their scroll wins, nothing jumps later', async () => {
    let room = 1000;
    const { go } = await open([plain('one', 'One', 10), plain('two', 'Two', 20)], '/one');
    clampTo(() => room);
    scrollTo(600);
    await go('/two');
    expect(await screen.findByRole('heading', { name: 'Two' })).toBeInTheDocument();
    room = 100;
    await go('/one');
    expect(await screen.findByRole('heading', { name: 'One' })).toBeInTheDocument();
    fireEvent.wheel(main());
    scrollTo(20);
    room = 1000;
    await frames(3);
    expect(main().scrollTop).toBe(20);
  });
});
