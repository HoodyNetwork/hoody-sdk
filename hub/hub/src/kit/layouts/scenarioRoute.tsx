// Scenario mount for kit layouts that read the route (selection, ?tab=, ?section=, ?step=, pane state): the component
// at a memory-history path with a query client. Platform-neutral (web and terminal run the same file); scenario files
// only (*.scenario.ts), never product code.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createElement as h, type ReactElement } from 'react';

// The router calls scrollTo after a navigation without a guard; a terminal has none (the app installs the same no-op).
const g = globalThis as { scrollTo?: unknown };
if (typeof g.scrollTo !== 'function') Object.defineProperty(globalThis, 'scrollTo', { value: (): void => {}, configurable: true, writable: true });

export function atRoute(node: () => ReactElement, path = '/page'): ReactElement {
  const root = createRootRoute({ component: () => node() });
  const any = createRoute({ getParentRoute: () => root, path: '$', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([any]), history: createMemoryHistory({ initialEntries: [path] }), origin: 'http://hub.test' } as never);
  return h(QueryClientProvider, { client: new QueryClient() }, h(RouterProvider, { router: router as never }));
}

/** A component typed for scenario props: cases give partial props (a `mount` adds the rest) and plain string literals,
 *  which the strict prop types refuse. The runtime value is the component itself. */
export function loose(c: unknown): (p: Record<string, unknown>) => ReactElement | null {
  return c as (p: Record<string, unknown>) => ReactElement | null;
}
