// A ?open_realm= link whose switch is superseded by a newer pick stops
// withholding the page at once, whether the newer switch commits or is cancelled. It never waits for its own obsolete
// probe. The link's param stays in the address (the request ended without its switch), and the newer switch is left
// alone. Real core (test env), a slow probe per realm.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from '@core';
import { realm as selected, snapshot } from '@core/ctx';
import { boot, deferred, onFetch, R1, R2, settle } from '@core/test/env';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';
import { cancelSwitch, startSwitch } from './switchOp';

function Home() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
const PAGES: PageManifest[] = [
  definePage({ id: 'home', path: '/home', title: 'title', layout: 'settings', load: async () => ({ default: Home }), status: 'ready', sensitive: false, strings: { title: 'Home' } }),
];
const waiting = () => document.querySelector('[data-hub-realm-wait]');

function world() {
  boot({ realm: R1 });
  queryClient.clear();
  const probes = { [R1]: deferred(), [R2]: deferred() };
  onFetch(async (c) => {
    if (c.url.includes('/realms')) return { status: 200, body: { data: { realm_ids: [R1, R2] } } };
    if (c.url.includes('/projects')) {
      const id = c.url.includes(R2) ? R2 : R1;
      await probes[id].p;
    }
    return { status: 200, body: { data: {} } };
  });
  return probes;
}

async function openLink(id: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history: createMemoryHistory({ initialEntries: [`/home?open_realm=${id}`] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await act(async () => settle());
  return router;
}

afterEach(() => cleanup());

describe('a ?open_realm= link superseded by a newer pick', () => {
  it('a newer pick that commits ends the wait at once; the param stays', async () => {
    const probes = world();
    const router = await openLink(R2);
    expect(snapshot().switching).toBe(R2);
    expect(waiting()).not.toBeNull();
    // The menu's pick (live.tsx setRealm goes through startSwitch); 'all' has no probe and commits at once.
    await act(async () => {
      void startSwitch('all');
      await settle();
    });
    expect(selected()).toBe('all');
    expect(snapshot().switching).toBe(null);
    expect(waiting()).toBeNull();
    expect((router.state.location.search as { open_realm?: string }).open_realm).toBe(R2);
    // The obsolete probe answering later changes nothing.
    await act(async () => {
      probes[R2].res();
      await settle();
    });
    expect([selected(), waiting()]).toEqual(['all', null]);
  });

  it('a newer pick that is cancelled ends the wait at once, in the realm the page showed', async () => {
    const probes = world();
    await openLink(R2);
    expect(waiting()).not.toBeNull();
    // Back to R1 (allowed while a switch is pending), its probe slow too; then the switch line's Cancel.
    await act(async () => {
      void startSwitch(R1);
      await settle();
    });
    expect(snapshot().switching).toBe(R1);
    let cancelled = false;
    await act(async () => {
      cancelled = cancelSwitch();
      await settle();
    });
    expect(cancelled).toBe(true);
    expect(snapshot().switching).toBe(null);
    expect(waiting()).toBeNull();
    expect(selected()).toBe(R1);
    await act(async () => {
      probes[R1].res();
      probes[R2].res();
      await settle();
    });
    expect([selected(), waiting()]).toEqual([R1, null]);
  });
});
