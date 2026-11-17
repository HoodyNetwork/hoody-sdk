// While a page's view loads, its title stays on screen over the loading lines (the header never drops out); once the
// view is there, only the view draws. A canvas page has no header row, so it waits with the lines alone.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { definePage, type PageLayout } from '@kit/page';
import { buildPageRouter } from './pageRouter';

afterEach(cleanup);

const strings = { title: 'Ledger', nav: 'Ledger' } as const;
function View(): ReactElement {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Ledger, loaded
    </h1>
  );
}

function held(layout: PageLayout) {
  let done!: (m: { default: ComponentType }) => void;
  const load = () => new Promise<{ default: ComponentType }>((r) => { done = r; });
  const page = definePage({ id: 'ledger', path: '/ledger', title: 'title', layout, load, status: 'ready', sensitive: false, strings, nav: { group: 'main', order: 10, icon: 'apps', label: 'nav' } });
  return { page, finish: () => done({ default: View }) };
}

async function open(page: ReturnType<typeof held>['page']) {
  const router = buildPageRouter([page], { queryClient: new QueryClient(), history: createMemoryHistory({ initialEntries: ['/ledger'] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
}

describe('a page whose view is still loading', () => {
  it('shows its title as the h1 over the loading lines, then only the view', async () => {
    const p = held('settings');
    await open(p.page);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Ledger' });
    expect(h1.hasAttribute('data-hub-title')).toBe(true);
    expect(document.querySelector('[data-page-loading]')).not.toBeNull();
    await act(async () => {
      p.finish();
      await Promise.resolve();
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Ledger, loaded' })).toBeTruthy();
    expect(document.querySelector('[data-page-loading]')).toBeNull();
    expect(document.querySelectorAll('h1').length).toBe(1);
  });

  it('a canvas page waits with the lines alone: it has no header row', async () => {
    const p = held('canvas');
    await open(p.page);
    expect(document.querySelector('h1')).toBeNull();
    expect(document.querySelector('[data-page-loading]')).toBeNull();
  });
});
