// A kept Board that is broadcasting still asks before the person leaves it, and
// confirming stops the broadcast before the next page renders (the capture shows what the tab shows). The guard here
// has the shape of the Board's LeaveGuard: a router blocker on a pathname change, asking, then Stop and proceed.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider, useBlocker } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { useKeepPage } from './pageHost';

let log: string[] = [];
let live = false;

function Board() {
  useKeepPage(true);
  const [on, setOn] = useState(live);
  const blocker = useBlocker({ shouldBlockFn: ({ current, next }) => on && current.pathname !== next.pathname, withResolver: true });
  return (
    <div>
      <h1 data-hub-title tabIndex={-1}>
        Board
      </h1>
      <iframe title="tile" />
      <button type="button" onClick={() => setOn(true)}>
        start broadcast
      </button>
      <p data-testid="broadcast">{on ? 'live' : 'off'}</p>
      {blocker.status === 'blocked' ? (
        <div role="alertdialog" aria-label="Stop broadcast?">
          <button
            type="button"
            onClick={() => {
              log.push('stop');
              setOn(false);
              blocker.proceed?.();
            }}
          >
            stop and leave
          </button>
          <button type="button" onClick={() => blocker.reset?.()}>
            stay
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Home() {
  log.push('home');
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}

const strings = { title: 'Page' } as const;
const page = (id: string, component: () => ReactElement): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: component }), status: 'ready', sensitive: false, strings });
const PAGES = [page('board', Board), page('home', Home)];

async function open(path: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: false, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1 });
  // A blocked navigation settles only when the guard answers, so it is started, not awaited.
  const go = async (href: string) => {
    await act(async () => {
      void router.navigate({ href } as never);
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  return { router, go };
}

const frame = () => document.querySelector('iframe[title="tile"]');
const heading = () => screen.getAllByRole('heading', { level: 1 }).filter((h) => h.checkVisibility?.() ?? !h.closest('[data-hub-page-hidden]'));
const shownTitle = () => document.querySelector('[data-hub-page]:not([data-hub-page-hidden]) h1')?.textContent;

beforeEach(() => {
  log = [];
  live = false;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('a kept Board that is broadcasting still asks before leaving', () => {
  it('leaving asks first: the next page does not render, and confirming stops the broadcast before it does', async () => {
    live = true;
    const { router, go } = await open('/board');
    const tile = frame();
    await go('/home');
    expect(screen.getByRole('alertdialog', { name: 'Stop broadcast?' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/board');
    expect(log).not.toContain('home');
    expect(shownTitle()).toBe('Board');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'stop and leave' }));
      await new Promise((r) => setTimeout(r, 0));
    });
    await screen.findByText('Home');
    expect(shownTitle()).toBe('Home');
    expect(log.indexOf('stop')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('stop')).toBeLessThan(log.indexOf('home'));
    // Still kept: the tile is the same node, hidden, and its broadcast is off.
    expect(frame()).toBe(tile);
    expect(screen.getByTestId('broadcast').textContent).toBe('off');
    expect(heading().map((h) => h.textContent)).not.toContain('Board');
  });

  it('staying keeps the Board shown and the broadcast on', async () => {
    live = true;
    const { router, go } = await open('/board');
    await go('/home');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'stay' }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(router.state.location.pathname).toBe('/board');
    expect(shownTitle()).toBe('Board');
    expect(screen.getByTestId('broadcast').textContent).toBe('live');
    expect(log).not.toContain('home');
  });

  it('kept and shown again, a broadcast started then is guarded too (the guard comes back with the page)', async () => {
    const { router, go } = await open('/board');
    const tile = frame();
    await go('/home');
    expect(shownTitle()).toBe('Home');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await go('/board');
    expect(shownTitle()).toBe('Board');
    expect(frame()).toBe(tile);
    log = [];
    fireEvent.click(screen.getByRole('button', { name: 'start broadcast' }));
    await go('/home');
    expect(screen.getByRole('alertdialog', { name: 'Stop broadcast?' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/board');
    expect(log).not.toContain('home');
  });
});
