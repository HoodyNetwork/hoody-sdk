// With core's own realm list and switch (fixture core): a link's ?open_realm=<id> lands the page in that
// realm, mounted once, there; the realm list and the switch are core's, not stand-ins.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { capture, useCore } from '@core';
import { switchRealm } from '@core/shell';
import { FIXTURE_REALM_2 } from '@core/fixtures';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';

const mounts: string[] = [];
function Home() {
  const realm = useCore().realm;
  // Each realm the page was drawn in, once: a page drawn in the realm left would add that one first.
  useEffect(() => {
    mounts.push(realm);
  }, [realm]);
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
const PAGES: PageManifest[] = [
  definePage({ id: 'home', path: '/home', title: 'title', layout: 'settings', load: async () => ({ default: Home }), status: 'ready', sensitive: false, strings: { title: 'Home' } }),
];

afterEach(async () => {
  cleanup();
  document.body.innerHTML = '';
  mounts.length = 0;
  await switchRealm('all');
});

describe('?open_realm=<id> with core', () => {
  it('switches to the realm and mounts the page once, in it', async () => {
    expect(capture().realm).not.toBe(FIXTURE_REALM_2);
    const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history: createMemoryHistory({ initialEntries: [`/home?open_realm=${FIXTURE_REALM_2}`] }) });
    await act(async () => {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
      await router.load();
    });
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(capture().realm).toBe(FIXTURE_REALM_2);
    expect(mounts).toEqual([FIXTURE_REALM_2]);
    expect(router.state.location.search).toEqual({});
  });
});
