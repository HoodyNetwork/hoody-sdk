// Page test helper for Vitest (page.test.ts): render one page through the real router, in a
// chosen fixture state, without the shell (app/pageRouter.tsx: the shell and Ask are not even
// loaded). Core is booted on fixtureWorld with the page's rules.
//
//   import { renderPage, screen } from '@app/testing';
//   import page from './page';
//   await renderPage(page, { state: 'empty' });
//   expect(await screen.findByText('…')).toBeInTheDocument();
import { bootFixtureCore, installFixtureSeam, queryClient as coreQueryClient, type FixtureRule } from '@core';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import type { PageManifest } from '@kit/page';
import { pageReady } from '@shell/preload';
import { LATENCY_MS, fixtureSource, fixtureStore, loadCoreRules, type Latency } from './fixtures';

// Page data modules read their fixtures through core's seam (pageFixtures), which app/fixtures.ts installs with its OWN
// fixtureSource. A test that vi.mocks '@app/fixtures' to wrap fixtureSource (record a change, answer a refusal) must
// still reach the page: the seam answers through the fixtureSource this module sees, the mocked one in such a test
// and the real one otherwise. Otherwise those wrappers would be skipped silently.
const seamThroughTestFixtures = (): void => installFixtureSeam({ page: (id) => fixtureSource(id) as never });
seamThroughTestFixtures();
import { buildPageRouter } from './pageRouter';

export * from '@testing-library/react';
export { userEvent };

/** A pending button is aria-disabled and still focusable (kit Button), so a button is "off" when it is `disabled` or
 *  `aria-disabled`. Any other element (an input, a checkbox) is off only when natively `disabled`: aria-disabled alone does not
 *  stop it being edited. */
export const isOff = (el: Element): boolean =>
  el.hasAttribute('disabled') || (el.getAttribute('aria-disabled') === 'true' && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'));

export interface RenderPageOptions {
  /** Fixture state (defaults to the fixtures' default). */
  state?: string;
  latency?: Latency;
  /** Hash path with search, e.g. '/demo?sel=item-2'. Defaults to the page path. */
  path?: string;
  /** 'all' or a realm id of the world (default Personal). */
  realm?: string;
  /** false boots with no current computer (default: core picks one). */
  computer?: false;
  /** Core-format rules that answer before the page's own (e.g. the computer list with other realms, pages/ai/realmRules.testing.ts). */
  rules?: readonly FixtureRule[];
}

export interface RenderedPage extends RenderResult {
  router: ReturnType<typeof buildPageRouter>;
  queryClient: QueryClient;
}

export async function renderPage(page: PageManifest, opts: RenderPageOptions = {}): Promise<RenderedPage> {
  const latency = opts.latency ?? 'instant';
  fixtureStore.set({ state: opts.state ?? null, latency });
  seamThroughTestFixtures();
  // Core on fixtureWorld with this page's core-format rules for the state (old-format fixtures
  // answer through fixtureSource as before). One query client, as in the app, emptied per render.
  const rules = [...(opts.rules ?? []), ...(await loadCoreRules([page.id], opts.state ?? null))];
  // The page's view chunk before the first render (the one load the router reads, shell/preload.ts). Imported cold
  // inside the render, a big page (computers, files, scripts) took longer than a test's find wait on a loaded host and
  // the test saw only the router's Suspense skeleton ("Loading…") while later tests in the same file passed.
  await pageReady(page);
  bootFixtureCore({ rules, ...(opts.realm !== undefined && { realm: opts.realm }), ...(opts.computer === false && { target: null }) }).setExtraDelay(LATENCY_MS[latency]);
  const queryClient = coreQueryClient;
  queryClient.clear();
  const history = createMemoryHistory({ initialEntries: [opts.path ?? page.path] });
  const router = buildPageRouter([page], { queryClient, history }); // no shell: app/pageRouter.tsx
  let result!: RenderResult;
  await act(async () => {
    result = render(createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router })));
    await router.load();
  });
  return Object.assign(result, { router, queryClient });
}
