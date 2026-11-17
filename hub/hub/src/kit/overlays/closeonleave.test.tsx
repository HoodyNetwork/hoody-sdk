// Vitest: an open menu closes when the person leaves it without choosing. A new history
// entry (same page or not) closes it, a kept page hiding closes it, a kit Dialog or Drawer opening closes it, and none of
// these fire while it is closed or on a re-render. Works with no router at all (most kit tests mount without one).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageNavHoldContext, type PageNavHold } from '../nav';
import { useCloseOnLeave, useOverlayStack } from './shared';

afterEach(cleanup);

let closes = 0;
function Menu({ isOpen }: { isOpen: boolean }) {
  useCloseOnLeave(isOpen, () => { closes += 1; });
  return null;
}
let rerun: (() => void) | null = null;
function Host({ isOpen, hold }: { isOpen: boolean; hold: PageNavHold | null }) {
  const [, set] = useState(0);
  rerun = () => set((n) => n + 1);
  return <PageNavHoldContext.Provider value={hold}><Menu isOpen={isOpen} /></PageNavHoldContext.Provider>;
}

async function mount(isOpen: boolean, hold: PageNavHold | null = null, entries = ['/files?sel=a']) {
  closes = 0;
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Host isOpen={isOpen} hold={hold} /> }),
    history: createMemoryHistory({ initialEntries: entries, initialIndex: entries.length - 1 }),
  });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
  return router;
}

describe('useCloseOnLeave', () => {
  it('a same-page search step (a new entry) closes an open menu once', async () => {
    const router = await mount(true);
    await act(async () => { await router.navigate({ href: '/files?sel=b' } as never); });
    expect(closes).toBe(1);
  });

  it('a cross-page navigation closes it', async () => {
    const router = await mount(true);
    await act(async () => { await router.navigate({ href: '/home' } as never); });
    expect(closes).toBe(1);
  });

  it('Back (a same-page search step) closes it: Back is navigation, never a dismissal entry', async () => {
    const router = await mount(true, null, ['/files?sel=a', '/files?sel=b']);
    await act(async () => { router.history.back(); await new Promise((r) => setTimeout(r, 20)); });
    expect(router.state.location.search).toEqual({ sel: 'a' });
    expect(closes).toBe(1);
  });

  it('a re-render never closes it, and nothing fires while it is closed', async () => {
    await mount(true);
    act(() => rerun?.());
    expect(closes).toBe(0);
    const router = await mount(false);
    await act(async () => { await router.navigate({ href: '/files?sel=c' } as never); });
    expect(closes).toBe(0);
  });

  it('a kept page hiding (Activity cleanup while hidden) closes it; an unload does not ask', async () => {
    let hidden = false;
    const hold: PageNavHold = { location: null, owns: () => true, hidden: () => hidden };
    await mount(true, hold);
    hidden = true;
    act(() => cleanup());
    expect(closes).toBe(1);
    hidden = false;
    await mount(true, hold);
    act(() => cleanup());
    expect(closes).toBe(0);
  });

  it('a kit Dialog or Drawer opening closes it', () => {
    closes = 0;
    function Dlg({ open }: { open: boolean }) { useOverlayStack('dialog', open); return null; }
    const { rerender } = render(<><Menu isOpen /><Dlg open={false} /></>);
    expect(closes).toBe(0);
    rerender(<><Menu isOpen /><Dlg open /></>);
    expect(closes).toBe(1);
  });

  it('works with no router (a plain mount): no throw, no close', () => {
    closes = 0;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Menu isOpen />);
    expect(closes).toBe(0);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
