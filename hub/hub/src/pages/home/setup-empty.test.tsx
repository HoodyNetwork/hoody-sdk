// Vitest: the empty account on Home. A setup read that answers 'empty' (no computer, nothing setting one up) never
// shows the "being set up" panel: Home shows its empty view with Get a computer instead.
// eslint-disable-next-line no-restricted-imports -- a test harness for the page's hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, renderPage, screen, waitFor } from '@app/testing';
import { useOverview } from './data';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

const mock = vi.hoisted(() => ({ on: true, kind: 'empty' as string, zeroRealms: false }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const real = core.useSetupState as (o?: { enabled?: boolean }) => Record<string, unknown>;
  const realRealms = core.useRealms as () => { rows?: Array<Record<string, unknown>> };
  return {
    ...core,
    // zeroRealms: the realm list counts no computer in any realm (the account is proven empty).
    useRealms: () => { const r = realRealms(); return mock.zeroRealms && r.rows ? { ...r, rows: r.rows.map((x) => ({ ...x, computers: 0 })) } : r; },
    useSetupState: (o?: { enabled?: boolean }) => {
      const r = real(o);
      return mock.on && o?.enabled !== false ? { ...r, data: mock.kind === 'empty' ? { kind: 'empty', freeSetup: true } : { kind: mock.kind }, status: 'success', isSuccess: true } : r;
    },
  };
});

describe('home: setup empty', () => {
  it('an all-realms account whose setup read says empty sees the empty view, never "being set up"', async () => {
    mock.on = true;
    mock.kind = 'empty';
    await renderPage(page, { state: 'capacity', realm: 'all' });
    expect(await screen.findByText(strings['empty.titleAll'])).toBeInTheDocument();
    expect(screen.queryByText(strings['setup.provisioning.title'])).toBeNull();
  });
  it('a proven empty account routed to the empty view keeps its proven absence (facts.computer false, never unknown)', async () => {
    mock.on = true;
    mock.kind = 'empty';
    mock.zeroRealms = true;
    const r = await renderPage(page, { state: 'capacity', realm: 'all' });
    await screen.findByText(strings['empty.titleAll']);
    const h = renderHook(() => useOverview(), { wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: r.queryClient }, children) });
    await waitFor(() => expect(h.result.current.data).toBeDefined());
    expect(h.result.current.data!.accountEmpty).toBe(false); // routed to the empty view, not the setup panel
    expect(h.result.current.data!.setup).toBeUndefined();
    expect(h.result.current.data!.facts.computer).toBe(false);
    mock.zeroRealms = false;
  });
  it('no mock: an account whose free server is claimed but has no computer sees the empty view, never "being set up"', async () => {
    mock.on = false;
    await renderPage(page, { state: 'provisioning', realm: 'all' });
    expect(await screen.findByText(strings['empty.titleAll'])).toBeInTheDocument();
    expect(screen.queryByText(strings['setup.provisioning.title'])).toBeNull();
  });
  it('control: without the mock the same state shows its setup panel', async () => {
    mock.on = false;
    await renderPage(page, { state: 'capacity', realm: 'all' });
    expect(await screen.findByText(strings['setup.capacity.title'])).toBeInTheDocument();
  });
});
