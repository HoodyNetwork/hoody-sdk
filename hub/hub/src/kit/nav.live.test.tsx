// Vitest: useLiveRoute reads the route the browser shows as the router parses it (escapes as the router keeps them),
// even while the page's own location is held (PageNavHold: a page redrawn as the person leaves it). useLiveLocation reads
// the same location with its search string.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, type ParsedLocation } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageNavHoldContext, type LiveLocation, type PageNavHold, useLiveLocation, useLiveRoute, usePathname } from './nav';

afterEach(cleanup);

let seen: { held: string; live: () => string; loc: () => LiveLocation } | null = null;
function Probe() {
  const held = usePathname();
  const live = useLiveRoute();
  const loc = useLiveLocation();
  seen = { held, live, loc };
  return null;
}

async function mount(at: string, hold: PageNavHold | null) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <PageNavHoldContext.Provider value={hold}><Probe /></PageNavHoldContext.Provider> }),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
  return router;
}

describe('useLiveRoute', () => {
  it('names the shown route as usePathname does, an escaped colon included', async () => {
    await mount('/ai/c/sess_01HX.y%3Az-9?computer=atlas.a1b2&realm=global', null);
    expect(seen!.live()).toBe(seen!.held);
    expect(seen!.live().startsWith('/ai/c/sess_01HX.y')).toBe(true);
  });

  it('reads the browser route while the page holds its own last one', async () => {
    let held: ParsedLocation | null = null;
    const hold: PageNavHold = { get location() { return held; }, owns: (p) => p.startsWith('/ai'), hidden: () => false };
    const router = await mount('/ai/new', hold);
    held = router.state.location;
    await act(async () => { await router.navigate({ href: '/home' } as never); });
    expect(seen!.held).toBe('/ai/new');
    expect(seen!.live()).toBe('/home');
  });
});

describe('useLiveLocation', () => {
  it('reads the path and the search the browser shows now, also while the page holds its own last location', async () => {
    let held: ParsedLocation | null = null;
    const hold: PageNavHold = { get location() { return held; }, owns: (p) => p.startsWith('/notes'), hidden: () => false };
    const router = await mount('/notes?computer=atlas', hold);
    expect(seen!.loc().pathname).toBe('/notes');
    expect(/[?&]computer=/.test(seen!.loc().searchStr)).toBe(true);
    held = router.state.location;
    await act(async () => { await router.navigate({ href: '/home' } as never); });
    expect(seen!.held).toBe('/notes');
    expect(seen!.loc().pathname).toBe('/home');
    expect(/[?&]computer=/.test(seen!.loc().searchStr)).toBe(false);
  });
});
