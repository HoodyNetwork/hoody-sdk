// A containers list with rows that are not computers (an empty object, null, an empty or non-string id) never blanks
// the Hub: the shell still draws the page (#hub-main), with no root error, and such rows count as no computer. The
// shell reads that list for every page (its computer picker and the Bots badge, core/bots), so one bad row that threw
// would throw from the root route ("Something went wrong!").
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { answers, bootFixtureCore, queryClient, reply } from '@core';
import { containersRoute } from '@core/shell';
import { target } from '@core/ctx';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';

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
const running = { id: 'c-good', name: 'good', status: 'running', project_id: 'p1', server_name: 'n1' };

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  queryClient.clear();
});

async function mount(): Promise<void> {
  const router = buildRouter(PAGES, { queryClient, shell: true, history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1, name: 'Home' });
  // The list has answered and reached the shell (its computer picker no longer says it is loading).
  await waitFor(() => expect(document.body.textContent).not.toMatch(/Loading computers/), { timeout: 8000 });
}

describe('the shell over a containers list with rows that are not computers', () => {
  it.each([
    ['the shown realm', undefined, 'only bad rows', [{}, null, { id: '' }, { id: 123 }]],
    ['the shown realm', undefined, 'bad rows around a running computer', [{}, null, running, { id: '' }, { id: 123 }]],
    ['all realms', 'all', 'only bad rows', [{}, null, { id: '' }, { id: 123 }]],
    ['all realms', 'all', 'bad rows around a running computer', [{}, null, running, { id: '' }, { id: 123 }]],
  ])('%s, %s: the page draws in #hub-main, no root error', async (_realmName, realm, _name, computers) => {
    bootFixtureCore({ ...(realm ? { realm } : {}), rules: [reply(containersRoute, answers.ok({ data: { computers, pagination: { totalPages: 1 } } }, 200))] });
    queryClient.clear();
    await mount();
    expect(document.getElementById('hub-main')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });

  it('a full page with a dropped row is not the whole list: the computer shown, absent from it, stays', async () => {
    // 99 computers and one null row, no pagination: the page is full (100 rows), so later pages may hold the shown
    // computer. Counting only the 99 kept rows would read it as whole and re-pick the first running one.
    const computers: unknown[] = Array.from({ length: 99 }, (_, i) => ({ ...running, id: `c-${i}`, name: `c${i}` }));
    computers.push(null);
    bootFixtureCore({ realm: 'all', rules: [reply(containersRoute, answers.ok({ data: { computers } }, 200))] });
    queryClient.clear();
    const shown = target()?.container.id;
    expect(shown).toBeTruthy();
    await mount();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(target()?.container.id).toBe(shown);
  });
});
