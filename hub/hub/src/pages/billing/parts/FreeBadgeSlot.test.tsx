// The Free badge's top-bar slot: billing's manifest names it, the shell can lazy-load it, and what it draws is the badge
// (nothing at all when the account is not known to be all free).
// eslint-disable-next-line no-restricted-imports -- a test harness for the slot, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the slot, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@core/query';
import { boot, onFetch, settle } from '@core/test/env';
import page from '../page';
import strings from '../strings.en.json';
import { resetFreeBadgeForTests } from './FreeBadge.data';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};
const free = { id: 'a'.repeat(24), is_free_tier: true, status: 'active' };
const rented = { id: 'b'.repeat(24), is_free_tier: false, status: 'active' };
const serve = (rows: unknown[]) =>
  onFetch((c) =>
    c.url.includes('/subserver-subscriptions')
      ? { status: 200, body: { data: [], total: 0, limit: 200, offset: 0 } }
      : { status: 200, body: { data: rows } },
  );

const slot = async (): Promise<ComponentType> => {
  const top = page.topBar;
  if (!top) throw new Error('billing declares no topBar');
  return (await top.load()).default;
};
const mount = async (Slot: ComponentType) => {
  const r = createRouter({ routeTree: createRootRoute({ component: () => <Slot /> }), history: createMemoryHistory({ initialEntries: ['/computers'] }) });
  let box!: HTMLElement;
  await act(async () => {
    box = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={r} />
      </QueryClientProvider>,
    ).container;
    await r.load();
  });
  await act(flush);
  return box;
};

beforeEach(() => {
  boot();
  queryClient.clear();
  resetFreeBadgeForTests();
});

describe('Free badge top-bar slot', () => {
  it('is declared by the billing manifest with a page-rule id and a lazy default export', async () => {
    expect(page.topBar?.id).toMatch(/^[a-z][a-z0-9-]{0,39}$/);
    expect(typeof (await slot())).toBe('function');
  });

  it('draws the badge when every server is free', async () => {
    serve([free]);
    await mount(await slot());
    expect(await screen.findByRole('button', { name: strings['free.badge'] })).toBeInTheDocument();
  });

  it('draws nothing at all when a rented server is among them', async () => {
    serve([free, rented]);
    const box = await mount(await slot());
    expect(screen.queryByRole('button', { name: strings['free.badge'] })).toBeNull();
    expect(box.textContent).toBe('');
  });
});
