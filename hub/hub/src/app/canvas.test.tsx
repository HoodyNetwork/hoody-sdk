// Board: a 'canvas' page (kit CanvasPage) in focus mode (shell useChromeHidden) through the
// real router. The chrome comes back on Esc and when the route is left, whatever the page does.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasPage } from '@kit';
import { definePage, type PageManifest } from '@kit/page';
import { restoreChrome, useChromeHidden, useChromeIsHidden } from '../shell/chrome';
import { useGlobalKeys } from '../shell/keys';
import { buildRouter } from './router';

function Canvas() {
  useChromeHidden(true);
  return (
    <CanvasPage title="Board">
      <div>tiles</div>
    </CanvasPage>
  );
}

function Other() {
  return <h1>Other</h1>;
}

const strings = { title: 'Page' } as const;
const page = (id: string, component: () => ReactElement, layout: PageManifest['layout']): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout, load: async () => ({ default: component }), status: 'ready', sensitive: false, strings });
const PAGES = [page('canvas', Canvas, 'canvas'), page('other', Other, 'settings')];

const seen = { hidden: false };
function Keys() {
  useGlobalKeys(PAGES, { palette: () => {}, shortcuts: () => {}, toggleSidebar: () => {}, toggleAsk: () => {}, go: () => {} });
  seen.hidden = useChromeIsHidden();
  return null;
}

async function open(path: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: false, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Keys />
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { level: 1, name: 'Board' });
  return router;
}

afterEach(() => {
  cleanup();
  act(() => restoreChrome());
});

describe('canvas page in focus mode', () => {
  it('Esc from the canvas page restores the chrome', async () => {
    await open('/canvas');
    expect(seen.hidden).toBe(true);
    const title = screen.getByRole('heading', { level: 1, name: 'Board' });
    act(() => title.focus());
    act(() => {
      title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(seen.hidden).toBe(false);
  });

  it('leaving the route restores the chrome', async () => {
    const router = await open('/canvas');
    expect(seen.hidden).toBe(true);
    await act(async () => {
      await router.navigate({ href: '/other' } as never);
    });
    await screen.findByRole('heading', { level: 1, name: 'Other' });
    expect(seen.hidden).toBe(false);
  });
});
