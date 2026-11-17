// Both scenario drivers mount the component under a memory router and a query client, so a component (web or
// terminal) that reads the route or queries runs as it does in the app. The element is the root route's component at
// a neutral path; each driver passes its platform's search codec (the app's own). Scenario files no longer need a
// per-owner helper (kit/layouts/scenarioRoute.tsx keeps working: an inner router simply takes over).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createElement, type ReactElement } from 'react';

export interface SearchCodec { parseSearch(s: string): Record<string, unknown>; stringifySearch(s: Record<string, unknown>): string }

// The router calls scrollTo after a navigation without a guard; a terminal has none (the app installs the same no-op).
const g = globalThis as { scrollTo?: unknown };
if (typeof g.scrollTo !== 'function') Object.defineProperty(globalThis, 'scrollTo', { value: (): void => {}, configurable: true, writable: true });

export const SCENARIO_PATH = '/page';

/** Where a routed mount's router is: pathname plus search, as the app writes it. */
export interface RouterSeen { location(): string; queryClient: QueryClient }

/** The web driver wraps the element in React Aria's router (links and menus navigate through it), as the app's
 *  AriaBridge does (app/pageRouter.tsx); the terminal kit navigates through the TanStack router directly. */
export type NavBridge = (el: ReactElement, navigate: (href: string) => void) => ReactElement;

export function routed(el: ReactElement, codec: SearchCodec, origin: string, at: string = SCENARIO_PATH, seen?: (r: RouterSeen) => void, bridge?: NavBridge): ReactElement {
  let nav: (href: string) => void = () => {};
  const root = createRootRoute({ component: () => (bridge ? bridge(el, (href) => nav(href)) : el) });
  const any = createRoute({ getParentRoute: () => root, path: '$', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([any]), history: createMemoryHistory({ initialEntries: [at] }), origin, ...codec } as never) as unknown as { state: { location: { pathname: string; searchStr?: string; href?: string } } };
  nav = (href) => { void (router as unknown as { navigate(o: { href: string }): Promise<void> }).navigate({ href }); };

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seen?.({ queryClient: client, location: () => { const l = router.state.location; return l.href ?? `${l.pathname}${l.searchStr ?? ''}`; } });
  return createElement(QueryClientProvider, { client }, createElement(RouterProvider as never, { router }));
}
