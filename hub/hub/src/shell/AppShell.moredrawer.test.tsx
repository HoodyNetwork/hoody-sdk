// The phone More drawer in the real AppShell is modal while open: focus moves into it (on the current page's row), the
// skip link, top bar, switch line, page and bottom bar behind its scrim are inert, and Escape or a tap on the scrim
// closes it and gives focus back to the More tab. At a desktop width nothing is made inert.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import strings from './strings.en.json';

vi.mock('../ask', () => ({
  AskPanel: () => null,
  focusAsk: () => false,
  askHasFocus: () => false,
  useAskWaiting: () => false,
  useAskActivityLabel: () => ({ activity: null, label: '' }),
}));

function setViewport(w: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  vi.stubGlobal('matchMedia', (q: string) => {
    const m = /\(width\s*(<|>=)\s*(\d+)px\)/.exec(q);
    return {
      matches: m ? (m[1] === '<' ? w < Number(m[2]) : w >= Number(m[2])) : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    };
  });
}

const titled = (name: string) =>
  function Page(): ReactElement {
    return (
      <h1 data-hub-title tabIndex={-1}>
        {name}
      </h1>
    );
  };
const page = (id: string, name: string, order: number): PageManifest =>
  definePage({
    id,
    path: `/${id}`,
    title: 'title',
    layout: 'settings',
    load: async () => ({ default: titled(name) }),
    status: 'ready',
    sensitive: false,
    nav: { group: 'main', order, icon: 'hoody-ai', label: 'nav' },
    strings: { title: name, nav: name },
  });

async function shell(at: string) {
  const router = buildRouter([page('board', 'Board', 1), page('other', 'Other', 2)], {
    queryClient: new QueryClient(),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1, name: 'Board' });
  return router;
}

const main = () => document.getElementById('hub-main') as HTMLElement;
const shellRoot = () => main().parentElement as HTMLElement;
const drawer = () => screen.getByRole('navigation', { name: strings['nav.label'] });
const bottomBar = () => document.querySelector(`nav[aria-label="${strings['bottom.label']}"]`) as HTMLElement;
const behind = () => [
  document.querySelector('a[href="#hub-main"]') as HTMLElement,
  shellRoot().querySelector('header') as HTMLElement,
  document.querySelector('[data-hub-switch-line]') as HTMLElement,
  main(),
  bottomBar(),
];
const scrim = () => [...shellRoot().children].find((el) => el.classList.contains('scrim')) as HTMLElement;

async function openMore() {
  const more = screen.getByRole('button', { name: strings['bottom.more'] });
  more.focus();
  fireEvent.click(more);
  expect(more).toHaveAttribute('aria-expanded', 'true');
  return more;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('phone More drawer', () => {
  it('opening moves focus onto the current page row in the drawer and makes everything behind it inert', async () => {
    setViewport(375);
    await shell('/board');
    await openMore();
    expect(drawer().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveAttribute('aria-current', 'page');
    for (const el of behind()) expect(el).toHaveAttribute('inert');
    expect(drawer()).not.toHaveAttribute('inert');
  });

  it('Escape closes it, lifts the inert and gives focus back to More', async () => {
    setViewport(375);
    await shell('/board');
    const more = await openMore();
    // Focus is in the drawer first, so giving it back to More is the close's doing.
    expect(drawer().contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    for (const el of behind()) expect(el).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(more);
  });

  it('a tap on the scrim closes it and gives focus back to More', async () => {
    setViewport(375);
    await shell('/board');
    const more = await openMore();
    // Focus is in the drawer first, so giving it back to More is the close's doing.
    expect(drawer().contains(document.activeElement)).toBe(true);
    fireEvent.click(scrim());
    expect(more).toHaveAttribute('aria-expanded', 'false');
    for (const el of behind()) expect(el).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(more);
  });

  it('at a desktop width the More state makes nothing inert and moves no focus', async () => {
    setViewport(1280);
    await shell('/board');
    const more = await openMore();
    for (const el of behind()) expect(el).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(more);
  });
});
