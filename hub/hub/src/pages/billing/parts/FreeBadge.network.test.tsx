// The Free card's network line: the cap of the person's free server comes from the API's free row in GET /servers
// (`network_limit_mbps`, the cap the platform enforces), never from a number written in the Hub. No number, no line.
// eslint-disable-next-line no-restricted-imports -- a test harness for the badge, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the badge, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@core/query';
import { boot, onFetch, settle } from '@core/test/env';
import strings from '../strings.en.json';
import { FreeBadge } from './FreeBadge';
import { resetFreeBadgeForTests } from './FreeBadge.data';
import { freeNetworkMbps } from './FreeBadge.logic';

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const realCan = real.useCan as (cap: string) => boolean;
  return { ...real, useCan: (cap: string): boolean => (cap === 'account' ? true : realCan(cap)) };
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};
const free = { id: 'a'.repeat(24), is_free_tier: true, status: 'active' };
const serve = (rows: unknown[]) =>
  onFetch((c) =>
    c.url.includes('/subserver-subscriptions')
      ? { status: 200, body: { data: [], total: 0, limit: 200, offset: 0 } }
      : { status: 200, body: { data: rows } },
  );
const mount = async () => {
  const r = createRouter({ routeTree: createRootRoute({ component: () => <FreeBadge /> }), history: createMemoryHistory({ initialEntries: ['/computers'] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={r} />
      </QueryClientProvider>,
    );
    await r.load();
  });
  await act(flush);
};
const open = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['free.badge'] }));
  return screen.findByText(strings['free.title']);
};
const line = (n: number) => strings['free.network'].replace('{{n}}', String(n));

beforeEach(() => {
  // eslint-disable-next-line no-restricted-globals -- core's retained purchases live in browser storage; each test starts with none
  localStorage.clear();
  boot();
  queryClient.clear();
  resetFreeBadgeForTests();
});

describe('Free card network cap', () => {
  it("states the API's cap of the free server", async () => {
    serve([{ ...free, network_limit_mbps: 37 }]);
    await mount();
    await open();
    expect(screen.getByText(line(37), { exact: false })).toBeInTheDocument();
  });

  it.each([
    ['an older API sends no cap', free],
    ['a corrupt cap reads null', { ...free, network_limit_mbps: null }],
  ])('says nothing about the network when %s', async (_why, row) => {
    serve([row]);
    await mount();
    await open();
    expect(screen.getByText(strings['free.body'])).toBeInTheDocument();
    expect(screen.queryByText(/Mbit\/s/)).toBeNull();
  });

  it('the shown number is only ever the one read (no default written in the Hub)', async () => {
    serve([{ ...free, network_limit_mbps: 10 }]);
    await mount();
    await open();
    expect(screen.getByText(line(10), { exact: false })).toBeInTheDocument();
    expect(strings['free.network']).toContain('{{n}}');
    expect(strings['free.network']).not.toMatch(/\d/);
  });
});

describe('freeNetworkMbps', () => {
  const list = (...rows: unknown[]) => ({ data: rows });
  it('reads the one cap of the live free servers', () => {
    expect(freeNetworkMbps(list({ ...free, network_limit_mbps: 25 }))).toBe(25);
    expect(freeNetworkMbps(list({ ...free, network_limit_mbps: 25 }, { ...free, id: 'c'.repeat(24), network_limit_mbps: 25 }))).toBe(25);
  });
  it('gives no number when free servers disagree, or none carries a whole positive cap', () => {
    expect(freeNetworkMbps(list({ ...free, network_limit_mbps: 25 }, { ...free, id: 'c'.repeat(24), network_limit_mbps: 10 }))).toBeNull();
    for (const v of [null, undefined, 0, -5, 2.5, '10', Number.NaN]) expect(freeNetworkMbps(list({ ...free, network_limit_mbps: v }))).toBeNull();
    expect(freeNetworkMbps(list({ ...free, network_limit_mbps: 25 }, { ...free, id: 'c'.repeat(24) }))).toBeNull();
    expect(freeNetworkMbps(undefined)).toBeNull();
    expect(freeNetworkMbps({ data: 'x' })).toBeNull();
  });
  it('skips ended and non-free rows', () => {
    expect(
      freeNetworkMbps(
        list(
          { ...free, network_limit_mbps: 25 },
          { ...free, id: 'd'.repeat(24), status: 'terminated', network_limit_mbps: 99 },
          { id: 'b'.repeat(24), is_free_tier: false, status: 'active', network_limit_mbps: 77 },
        ),
      ),
    ).toBe(25);
  });
});
