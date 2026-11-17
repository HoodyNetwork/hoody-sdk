// A link asking for another realm on the path already shown, while that page holds work a switch would lose: the page
// stays drawn (its switch guard registered) until core asks, so the leave question names that work. Stay keeps the
// page as it was; a link to another path still waits as before.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactElement, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSwitchGuard, switchLosses } from '@core';
import { definePage, type PageManifest } from '@kit/page';
import { buildRouter } from '../app/router';

const ctl = vi.hoisted(() => ({
  list: [] as string[],
  asked: [] as string[][],
  answer: true,
}));
vi.mock('@core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRealms: () => ({ selected: 'all', pinned: null, rows: [] }),
}));
vi.mock('@core/shell', async (importOriginal) => {
  const real = await importOriginal<object>();
  const core = await import('@core');
  return {
    ...real,
    realmList: () => ctl.list,
    loadRealms: () => Promise.resolve(ctl.list),
    // Core reads the losses after its probe, a moment after the switch starts.
    beginSwitch: () => ({
      done: new Promise<boolean>((r) =>
        setTimeout(() => {
          ctl.asked.push(core.switchLosses());
          r(ctl.answer);
        }, 5),
      ),
      cancel: () => undefined,
    }),
    switchRevision: () => 0,
  };
});

const OTHER = '6a00000000000000000000a2';

function Draft() {
  useEffect(() => registerSwitchGuard(() => 'Leave New script? Your changes here aren’t kept: what you typed.'), []);
  return (
    <h1 data-hub-title tabIndex={-1}>
      Draft
    </h1>
  );
}
function Home() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
const page = (id: string, C: () => ReactElement): PageManifest =>
  definePage({ id, path: `/${id}`, title: 'title', layout: 'settings', load: async () => ({ default: C }), status: 'ready', sensitive: false, strings: { title: id } });
const PAGES = [page('draft', Draft), page('home', Home)];

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
async function open(path: string) {
  const router = buildRouter(PAGES, { queryClient: new QueryClient(), shell: true, history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await settle();
  return router;
}

beforeEach(() => {
  ctl.list = [OTHER];
  ctl.asked = [];
  ctl.answer = true;
});
afterEach(cleanup);

describe('a realm link on the path shown, while its page holds work', () => {
  it('the switch question still sees the page’s guard: the page is not dropped before core asks', async () => {
    const router = await open('/draft');
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeTruthy();
    await act(async () => {
      await router.navigate({ href: `/draft?open_realm=${OTHER}` } as never);
    });
    await settle();
    expect(ctl.asked).toHaveLength(1);
    expect(ctl.asked[0]).toEqual(['Leave New script? Your changes here aren’t kept: what you typed.']);
  });

  it('Stay: the page stays mounted as it was, its guard still registered', async () => {
    ctl.answer = false;
    const router = await open('/draft');
    await act(async () => {
      await router.navigate({ href: `/draft?open_realm=${OTHER}` } as never);
    });
    await settle();
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeTruthy();
    expect(switchLosses()).toHaveLength(1);
  });

  it('a link to another path still waits: the page left is not held', async () => {
    const router = await open('/draft');
    await act(async () => {
      await router.navigate({ href: `/home?open_realm=${OTHER}` } as never);
    });
    await settle();
    expect(ctl.asked).toEqual([[]]);
  });
});
