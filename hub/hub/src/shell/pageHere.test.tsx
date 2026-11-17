// A section marked "here" (kit scrollSettingsSection) never outlives its page. The shell ends the mark when
// the page's slot hides or unloads, for every page, Guide's own sections included: no attribute stays on the section and
// its timer is cancelled. jsdom has no layout: every box is 0 high, so a jump moves nothing and marks.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { type ReactElement, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollSettingsSection } from '@kit/layouts/Layouts';
import { definePage } from '@kit/page';
import { buildRouter } from '../app/router';
import { useKeepPage } from './pageHost';

const strings = { title: 'Page', nav: 'Page' } as const;
let section: HTMLElement | null = null;

const marking = (keep: boolean) =>
  function View(): ReactElement {
    useKeepPage(keep);
    const ref = useRef<HTMLElement>(null);
    return (
      <>
        <h1 data-hub-title tabIndex={-1}>
          One
        </h1>
        <section
          ref={(el) => {
            ref.current = el;
            if (el) section = el;
          }}
        >
          body
        </section>
        <button type="button" onClick={() => scrollSettingsSection(ref.current, true)}>
          Jump
        </button>
      </>
    );
  };
const two = () => (
  <h1 data-hub-title tabIndex={-1}>
    Two
  </h1>
);
const page = (id: string, view: () => ReactElement) => definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: view }), status: 'ready', sensitive: false, strings });

async function open(keep: boolean) {
  const router = buildRouter([page('one', marking(keep)), page('two', two)], { queryClient: new QueryClient(), shell: false, history: createMemoryHistory({ initialEntries: ['/one'] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <main id="hub-main">
          <RouterProvider router={router} />
        </main>
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findByRole('heading', { name: 'One' });
  return async (href: string) => {
    await act(async () => {
      await router.navigate({ href } as never);
    });
    await screen.findByRole('heading', { name: href === '/two' ? 'Two' : 'One' });
  };
}

beforeEach(() => {
  section = null;
  HTMLElement.prototype.scrollTo = vi.fn() as never;
});
afterEach(() => vi.restoreAllMocks());

describe('the shell ends a page\'s "here" mark with the page', () => {
  it.each([
    ['unloads', false],
    ['is kept hidden', true],
  ])('leaving a page that %s takes the mark off its section and cancels its timer', async (_how, keep) => {
    const go = await open(keep);
    await act(async () => screen.getByRole('button', { name: 'Jump' }).click());
    const marked = section!;
    expect(marked).toHaveAttribute('data-hub-here');
    const cleared = vi.spyOn(window, 'clearTimeout');
    await go('/two');
    expect(marked).not.toHaveAttribute('data-hub-here');
    expect(cleared).toHaveBeenCalled();
  });
});
