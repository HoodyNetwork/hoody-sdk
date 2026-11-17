// A wizard page has no floating action button: the shell marks main for a `layout: 'wizard'` page
// (.wizard) so phones keep only the bottom bar's strip under its sticky footer, as a canvas page does (.canvas).
// Other pages keep the button's room; a canvas page keeps its own class unchanged.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';

const strings = { title: 'Page' } as const;
const view = (name: string) => () => <h1>{name}</h1>;
const page = (id: string, component: () => ReactElement, layout: PageManifest['layout']): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout, load: async () => ({ default: component }), status: 'ready', sensitive: false, strings });
const PAGES = [page('new', view('New'), 'wizard'), page('board', view('Board'), 'canvas'), page('other', view('Other'), 'settings')];

async function open(path: string, name: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1, name });
}

const mainClasses = () => [...(document.getElementById('hub-main')?.classList ?? [])].join(' ');

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('AppShell main on a wizard page', () => {
  it('a wizard page gets the wizard main, not the canvas one', async () => {
    await open('/new', 'New');
    expect(mainClasses()).toMatch(/wizard/);
    expect(mainClasses()).not.toMatch(/canvas/);
  });

  it('a canvas page keeps the canvas main and is not a wizard', async () => {
    await open('/board', 'Board');
    expect(mainClasses()).toMatch(/canvas/);
    expect(mainClasses()).not.toMatch(/wizard/);
  });

  it('another page gets neither', async () => {
    await open('/other', 'Other');
    expect(mainClasses()).not.toMatch(/wizard|canvas/);
  });
});
