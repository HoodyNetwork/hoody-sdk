// A page's manifest may contribute a part of the top bar (`topBar`, the Free badge). The shell draws
// it before the account menu on every page, lazily; a part that renders nothing takes no space, and one that fails to
// load or throws draws nothing and leaves the bar whole. Hidden on the phone with the account menu.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { definePage, type PageManifest, type PageTopBar } from '@kit/page';
import { buildRouter } from '../app/router';
import strings from './strings.en.json';

function Home() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
function Badge() {
  return (
    <button type="button" data-testid="badge">
      Free servers
    </button>
  );
}
function Nothing() {
  return null;
}
function Throws(): ReactElement {
  throw new Error('the part failed');
}

const as = (C: ComponentType) => async () => ({ default: C });
const page = (id: string, topBar?: PageTopBar): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: Home }), status: 'ready', sensitive: false, strings: { title: id }, ...(topBar ? { topBar } : {}) });

async function open(pages: PageManifest[], path = '/home') {
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
  // Let the lazy parts load.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

const account = () => screen.getByRole('button', { name: strings['top.account'] });
const parts = () => document.querySelector('header [data-hub-topbar-parts]');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('top-bar parts pages contribute (topBar)', () => {
  it('a page\'s part shows in the top bar before the account menu, on another page too', async () => {
    await open([page('home'), page('billing', { id: 'free', load: as(Badge) })]);
    const badge = await screen.findByTestId('badge');
    expect(badge.closest('header')).not.toBeNull();
    expect(badge.compareDocumentPosition(account()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a part that renders nothing leaves nothing in the bar (its holder draws no box)', async () => {
    await open([page('home'), page('billing', { id: 'free', load: as(Nothing) })]);
    // The part's own holder is a box-less span (display: contents, TopBar.module.css .part) and stays empty.
    const holders = [...(parts()?.children ?? [])];
    expect(holders.map((h) => h.getAttribute('data-hub-topbar-part'))).toEqual(['billing:free']);
    for (const h of holders) expect(h.childElementCount).toBe(0);
    expect(parts()?.textContent).toBe('');
    expect(account()).toBeTruthy();
  });

  it('with no page contributing, the bar has no holder at all', async () => {
    await open([page('home'), page('billing')]);
    expect(parts()).toBeNull();
    expect(account()).toBeTruthy();
  });

  it('a part whose load fails or that throws draws nothing; the bar and the other parts stay', async () => {
    await open([
      page('home'),
      page('broken', { id: 'x', load: () => Promise.reject(new Error('chunk failed')) }),
      page('throws', { id: 'y', load: as(Throws) }),
      page('billing', { id: 'free', load: as(Badge) }),
    ]);
    expect(await screen.findByTestId('badge')).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(`^${strings['top.search']} `) })).toBeTruthy();
    expect(account()).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Home');
  });

  it('while a part is still loading, the bar and the page are drawn (only the part waits)', async () => {
    await open([page('home'), page('billing', { id: 'free', load: () => new Promise<never>(() => undefined) })]);
    expect(account()).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Home');
  });

  it('the holder has no box of its own, and is hidden on the phone with the account menu', () => {
    const css = readFileSync(join(import.meta.dirname, 'TopBar.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const base = css.slice(css.indexOf('.parts {'));
    expect(base.slice(0, base.indexOf('}'))).toMatch(/display:\s*contents/);
    const phone = css.slice(css.lastIndexOf('@media (width < 768px)'));
    expect(phone).toMatch(/\.ask,\s*\.parts,\s*\.account\s*{\s*display:\s*none/);
  });
});
