// A router harness for the Agents view's tests (not page code): the list keeps its search, filter and sort in the URL and
// the detail's close moves the route, so the view mounts under a memory router. `mount` resolves once the router loaded;
// `rerender` hands the same root a new element (props), `router` shows where the view navigated to. The view sits under
// core's query client, as every page does in the app: its realm (aiRealm.ts) reads the computer list through it.
// eslint-disable-next-line no-restricted-imports -- a router harness for the view's URL state, as workflows.test.tsx
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { CoreQueryProvider } from '@core';
import { act, render } from '@testing-library/react';
import { type ReactElement, useState } from 'react';

export async function mount(ui: ReactElement, entry = '/ai/agents') {
  let push: (e: ReactElement) => void = () => {};
  function Root() {
    const [el, set] = useState(ui);
    push = set;
    return el;
  }
  const root = createRootRoute({ component: Root });
  const any = createRoute({ getParentRoute: () => root, path: '$', component: () => null });
  const router = createRouter({ routeTree: root.addChildren([any]), history: createMemoryHistory({ initialEntries: [entry] }) });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  return {
    router,
    unmount: () => view.unmount(),
    rerender: async (e: ReactElement) => {
      await act(async () => push(e));
    },
  };
}
