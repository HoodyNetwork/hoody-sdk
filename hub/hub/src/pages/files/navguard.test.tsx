// Vitest: Files moves itself in place twice, the computer page's link
// (?computer=) becoming pane A and pane A binding to the top bar's computer. Each move replaces the history entry, so it
// is made only while the browser still shows the Files route: a late run, after Back or a link already moved on,
// replaces nobody's entry. Each arrival moves once, never in a loop.
import { useCallback } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor } from '@app/testing';
import type * as Kit from '@kit';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';

const S = vi.hoisted(() => ({ live: null as string | null, replaced: [] as string[] }));
vi.mock('@kit', async (orig) => {
  const real = await orig<typeof Kit>();
  return {
    ...real,
    // The route the browser shows: the router's own while `live` is null, else the one a person already moved to.
    useLiveRoute: () => {
      const read = real.useLiveRoute();
      return useCallback(() => S.live ?? read(), [read]);
    },
    useGo: () => {
      const go = real.useGo();
      return useCallback((to: string, opts?: Parameters<typeof go>[1]) => { if (opts?.replace) S.replaced.push(to); go(to, opts); }, [go]);
    },
  };
});

// The page's view loads lazily: load it once up front, so the first case does not time out on that load.
beforeAll(async () => {
  await import('./view');
}, 30000);

function reset(live: string | null) {
  S.live = live;
  S.replaced.length = 0;
}

describe('Files moves itself only on its own route', () => {
  it('the computer page link becomes pane A with one replace', async () => {
    reset(null);
    const { router } = await renderPage(page, { path: links.at('atlas.00a1', '/srv') });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1', ap: '/srv' }));
    expect(S.replaced).toEqual(['/files?a=atlas.00a1&ap=%2Fsrv']);
  });

  it('the computer page link moves nobody once the browser shows another route', async () => {
    reset('/computers');
    const { router } = await renderPage(page, { path: links.at('atlas.00a1', '/srv') });
    await waitFor(() => expect(router.state.status).toBe('idle'));
    expect(S.replaced).toEqual([]);
    expect(router.state.location.search).toMatchObject({ computer: 'atlas.00a1' });
    expect(router.history.length).toBe(1);
  });

  it('pane A binds to the top bar computer with one replace', async () => {
    reset(null);
    const { router } = await renderPage(page, { path: '/files' });
    await waitFor(() => expect(router.state.location.search).toMatchObject({ a: 'atlas.00a1' }));
    expect(S.replaced).toEqual(['/files?a=atlas.00a1']);
  });

  it('pane A binds nobody once the browser shows another route', async () => {
    reset('/notes');
    const { router } = await renderPage(page, { path: '/files' });
    // The computers read has come back (pane A could bind now), and the pane still asks for a computer.
    expect(await screen.findByText(strings['pick.placeholder'])).toBeInTheDocument();
    expect(S.replaced).toEqual([]);
    expect(router.state.location.search).not.toHaveProperty('a');
  });
});
