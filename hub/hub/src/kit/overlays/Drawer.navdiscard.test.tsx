// A dirty Drawer held in the page's own state (not a URL parameter): Back asks first, and Discard lets the step go. A
// same-page Back keeps the page mounted, so proceeding alone left the drawer open over a page whose URL moved on
// (the drawer must close then). After the step the drawer closes through onOpenChange(false) when it is still mounted and
// still open; a URL-kept drawer the step already closed, or a page that left, gets no extra call.
import { createBrowserHistory, createRootRoute, createRouter, RouterProvider, useRouterState } from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import strings from './strings.en.json';
import { Drawer } from './Overlays';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 100)); });

// The page at /access, then a same-page step to ?sel=a (the entry Back returns from); browser Back is a popstate.
function mount(Page: () => ReactElement) {
  window.history.replaceState(null, '', '/access');
  const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createBrowserHistory() });
  const done = (async () => {
    await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
    await act(async () => { await router.navigate({ to: '/access' as never, search: { sel: 'a' } as never }); });
  })();
  return { router, done };
}

describe('Drawer: Discard on a navigation ask', () => {
  it('a state-held drawer closes after a same-page Back is discarded', async () => {
    const changes = vi.fn();
    function Page() {
      const [open, setOpen] = useState(true);
      return (
        <Drawer resizeKey="test-navdiscard-a" isOpen={open} onOpenChange={(o) => { changes(o); setOpen(o); }} title="Add access" dirty>
          <input aria-label="Who" defaultValue="x" />
        </Drawer>
      );
    }
    const { router, done } = mount(Page);
    await done;
    await act(async () => { window.history.back(); });
    await settle();
    // Back was held: the ask shows, the URL has not moved.
    expect(screen.getByRole('alert')).toHaveTextContent(strings.discardAsk);
    expect(router.state.location.search).toEqual({ sel: 'a' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings.discard })); });
    await settle();
    expect(router.state.location.search).toEqual({});
    expect(changes).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Keep editing holds the step and closes nothing', async () => {
    const changes = vi.fn();
    const { router, done } = mount(() => (
      <Drawer resizeKey="test-navdiscard-b" isOpen onOpenChange={changes} title="Add access" dirty>
        <input aria-label="Who" defaultValue="x" />
      </Drawer>
    ));
    await done;
    await act(async () => { window.history.back(); });
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings.keepEditing })); });
    await settle();
    expect(router.state.location.search).toEqual({ sel: 'a' });
    expect(changes).not.toHaveBeenCalled();
  });

  it('a drawer the step itself closed (open follows the URL) gets no extra onOpenChange', async () => {
    const changes = vi.fn();
    function UrlPage() {
      const sel = useRouterState({ select: (st) => (st.location.search as { sel?: string }).sel });
      return (
        <Drawer resizeKey="test-navdiscard-c" isOpen={sel !== undefined} onOpenChange={changes} title="Add access" dirty>
          <input aria-label="Who" defaultValue="x" />
        </Drawer>
      );
    }
    const { router, done } = mount(UrlPage);
    await done;
    await act(async () => { window.history.back(); });
    await settle();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: strings.discard })); });
    await settle();
    expect(router.state.location.search).toEqual({});
    expect(changes).not.toHaveBeenCalled();
  });
});
