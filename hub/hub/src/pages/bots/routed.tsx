// A router harness for the Chat apps People and Chats sections' tests (not page code): their tables keep the search and sort
// params in the URL, so a section mounts under a memory router. `mount` resolves once the router loaded; `rerender` hands the
// same root a new element (props).
// eslint-disable-next-line no-restricted-imports -- a router harness for the tables' URL state, as pages/ai/agents/routed.tsx
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render } from '@testing-library/react';
import { type ReactElement, useState } from 'react';

export async function mount(ui: ReactElement, entry = '/bots') {
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
    view = render(<RouterProvider router={router} />);
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
