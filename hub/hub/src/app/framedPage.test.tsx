// The framed lock on pages: a page whose manifest says `sensitive: true` is refused in
// a framed Hub. Nothing of it loads there (no render, visit, hover or idle load evaluates its chunk) and the refusal
// shows in its place; a page that is not sensitive draws as ever, and an unframed Hub draws every page as before.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { definePage, type PageManifest } from '@kit/page';
import kitStrings from '@kit/strings.en.json';
import { framedRefused, preloadOnIdle, preloadPage, type IdleScheduler } from '@shell/preload';
import { buildPageRouter } from './pageRouter';
import { discoverPages } from './pages';

const strings = { title: 'Page', nav: 'Page' } as const;
const view = (name: string) =>
  function View(): ReactElement {
    return (
      <h1 data-hub-title tabIndex={-1}>
        {name}
      </h1>
    );
  };

/** A page whose view load is counted. */
function counted(id: string, sensitive: boolean, order = 10) {
  const load = vi.fn(async (): Promise<{ default: ComponentType }> => ({ default: view(`${id} view`) }));
  const page = definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load, status: 'ready', sensitive, strings, nav: { group: 'main', order, icon: 'apps', label: 'nav' } });
  return { page, load };
}

async function open(pages: PageManifest[], path: string) {
  const router = buildPageRouter(pages, { queryClient: new QueryClient(), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  const go = async (href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
  };
  return { go };
}

/** Nothing but the page's own view in the page slot (no refusal, whatever its words). */
const onlyView = (name: string) => {
  const slot = document.querySelector('[data-hub-page]');
  expect(slot?.textContent).toBe(name);
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('framed Hub: a sensitive page is refused before anything of it loads', () => {
  it('the refusal shows, with a link to open the page in its own tab; the view never loads', async () => {
    boot({ framed: true });
    const secret = counted('secret', true);
    await open([secret.page], '/secret');
    expect(await screen.findByText(kitStrings['page.framed.title'])).toBeInTheDocument();
    expect(screen.getByText(kitStrings['page.framed.body'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: kitStrings['page.framed.open'] })).toHaveAttribute('href', window.location.href);
    // The page's own title is the h1 the shell's route focus lands on.
    const h1 = screen.getByRole('heading', { level: 1, name: strings.title });
    expect(h1).toHaveAttribute('data-hub-title');
    expect(h1).toHaveAttribute('tabindex', '-1');
    await act(async () => {});
    expect(secret.load).not.toHaveBeenCalled();
    expect(screen.queryByText('secret view')).toBeNull();
  });

  it('a page that is not sensitive draws as ever in a frame; moving to a sensitive one refuses it, unloaded', async () => {
    boot({ framed: true });
    const plain = counted('plain', false);
    const secret = counted('secret', true, 20);
    const { go } = await open([plain.page, secret.page], '/plain');
    expect(await screen.findByRole('heading', { name: 'plain view' })).toBeInTheDocument();
    onlyView('plain view');
    await go('/secret/sub');
    expect(await screen.findByText(kitStrings['page.framed.title'])).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'plain view' })).toBeNull();
    expect(secret.load).not.toHaveBeenCalled();
  });

  it('hover, focus and press intent and the idle loads never load a sensitive page in a frame; the others still load', () => {
    boot({ framed: true });
    const plain = counted('plain', false, 10);
    const secret = counted('secret', true, 20);
    preloadPage(secret.page);
    expect(secret.load).not.toHaveBeenCalled();
    const runs: ((d: { timeRemaining: () => number }) => void)[] = [];
    const idle: IdleScheduler = { request: (r) => runs.push(r), cancel: vi.fn() };
    preloadOnIdle([secret.page, plain.page], idle);
    while (runs.length > 0) runs.shift()!({ timeRemaining: () => 50 });
    expect(plain.load).toHaveBeenCalledTimes(1);
    expect(secret.load).not.toHaveBeenCalled();
  });

  it('every sensitive page of the Hub is refused framed, its own view never loaded', async () => {
    boot({ framed: true });
    const sensitive = discoverPages().pages.filter((p) => p.sensitive);
    // The pages that show secret, payment, key or 2FA UI; a new one joins by its manifest alone. Logs is one: its
    // Explain drawer's model chooser can open the provider key step.
    expect(sensitive.map((p) => p.id)).toEqual(expect.arrayContaining(['account', 'ai', 'billing', 'board', 'bots', 'keys', 'logs', 'scripts', 'vault']));
    for (const p of sensitive) {
      const load = vi.fn(p.load);
      expect(framedRefused(p)).toBe(true);
      await open([{ ...p, load }], p.path);
      expect(await screen.findByText(kitStrings['page.framed.title'])).toBeInTheDocument();
      expect(load).not.toHaveBeenCalled();
      cleanup();
    }
  });
});

describe('unframed Hub: nothing changes', () => {
  it('a sensitive page draws its view; no refusal', async () => {
    boot();
    const secret = counted('secret', true);
    await open([secret.page], '/secret');
    expect(await screen.findByRole('heading', { name: 'secret view' })).toBeInTheDocument();
    onlyView('secret view');
    expect(secret.load).toHaveBeenCalledTimes(1);
  });

  it('intent and idle loads load sensitive pages as before', () => {
    boot();
    const secret = counted('secret', true);
    preloadPage(secret.page);
    expect(secret.load).toHaveBeenCalledTimes(1);
    const later = counted('later', true, 20);
    const runs: ((d: { timeRemaining: () => number }) => void)[] = [];
    preloadOnIdle([later.page], { request: (r) => runs.push(r), cancel: vi.fn() });
    while (runs.length > 0) runs.shift()!({ timeRemaining: () => 50 });
    expect(later.load).toHaveBeenCalledTimes(1);
  });

  it('every sensitive page of the Hub draws its own content, never the refusal', async () => {
    boot();
    for (const p of discoverPages().pages.filter((x) => x.sensitive)) {
      const load = vi.fn(async (): Promise<{ default: ComponentType }> => ({ default: view(`${p.id} view`) }));
      await open([{ ...p, load }], p.path);
      expect(await screen.findByRole('heading', { name: `${p.id} view` })).toBeInTheDocument();
      onlyView(`${p.id} view`);
      expect(load).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });
});
