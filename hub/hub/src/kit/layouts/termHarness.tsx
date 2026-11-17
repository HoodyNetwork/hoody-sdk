// Test harness for kit terminal siblings that read the route (selection, pane state, handoff): the children at a
// memory-history path, inside the focus root. Terminal tests only (*.term.test.tsx).
import '../../term/env/router-globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/history';
import { createRootRoute, createRoute, createRouter, RouterProvider, type AnyRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { FocusRoot } from '../../term/prim';
import { parseSearch, stringifySearch } from '../../term/app/router';

export function routed(children: () => ReactNode, path = '/page'): { element: ReactNode; router: AnyRouter } {
  const root = createRootRoute({ component: () => <>{children()}</> });
  const any = createRoute({ getParentRoute: () => root, path: '$', component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([any]), history: createMemoryHistory({ initialEntries: [path] }),
    origin: 'http://hub.term', parseSearch, stringifySearch,
    // No router hash scroll, as in the terminal Hub (term/app/history.ts turns it off on every location): TanStack's
    // would answer a #hash navigation (a FaqLink landing) with document.getElementById, a strict-global trap. A start
    // path here carries no #hash, so the navigation default is enough.
    defaultHashScrollIntoView: false,
  } as never) as unknown as AnyRouter;
  const element = (
    <QueryClientProvider client={new QueryClient()}>
      <FocusRoot><RouterProvider router={router as never} /></FocusRoot>
    </QueryClientProvider>
  );
  return { element, router };
}
