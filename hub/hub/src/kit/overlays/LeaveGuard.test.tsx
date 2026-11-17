// LeaveGuard: while active, leaving the path is held and handed to onBlock (proceed leaves, reset stays); inactive
// or without a router it holds nothing; a same-path search change and a same-path Back pass, and the Drawer's
// deliberate-close token is left for the Drawer.
import { act, render } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LeaveGuard } from './LeaveGuard';
import { allowNextNavigation, takeAllowedNavigation } from './shared';

async function inRouter(Component: () => ReactElement, path = '/board') {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: [path] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

describe('LeaveGuard', () => {
  it('active: leaving the path is held; proceed leaves, reset stays', async () => {
    let held: { proceed: () => void; reset: () => void } | null = null;
    const onBlock = vi.fn((proceed: () => void, reset: () => void) => { held = { proceed, reset }; });
    const router = await inRouter(() => <LeaveGuard active onBlock={onBlock} />);
    await act(async () => { void router.navigate({ to: '/keys' as never }); await new Promise((r) => setTimeout(r, 10)); });
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/board');
    await act(async () => { held!.reset(); await new Promise((r) => setTimeout(r, 10)); });
    expect(router.state.location.pathname).toBe('/board');
    await act(async () => { void router.navigate({ to: '/keys' as never }); await new Promise((r) => setTimeout(r, 10)); });
    await act(async () => { held!.proceed(); await new Promise((r) => setTimeout(r, 10)); });
    expect(router.state.location.pathname).toBe('/keys');
  });
  it('a same-path search change passes; inactive holds nothing', async () => {
    const onBlock = vi.fn();
    const router = await inRouter(() => <LeaveGuard active onBlock={onBlock} />);
    await act(async () => { void router.navigate({ to: '/board' as never, search: { b: '2' } as never }); await new Promise((r) => setTimeout(r, 10)); });
    expect(onBlock).not.toHaveBeenCalled();
    const off = vi.fn();
    const r2 = await inRouter(() => <LeaveGuard active={false} onBlock={off} />);
    await act(async () => { void r2.navigate({ to: '/keys' as never }); await new Promise((r) => setTimeout(r, 10)); });
    expect(off).not.toHaveBeenCalled();
    expect(r2.state.location.pathname).toBe('/keys');
  });
  it('a same-path Back passes and leaves the deliberate-close token unread; Back to another path is held', async () => {
    const onBlock = vi.fn();
    const router = await inRouter(() => <LeaveGuard active onBlock={onBlock} />);
    await act(async () => { void router.navigate({ to: '/board' as never, search: { edit: '1' } as never }); await new Promise((r) => setTimeout(r, 10)); });
    allowNextNavigation();
    await act(async () => { router.history.back(); await new Promise((r) => setTimeout(r, 10)); });
    expect(onBlock).not.toHaveBeenCalled();
    expect(takeAllowedNavigation()).toBe(true);
    const r2 = await inRouter(() => <LeaveGuard active onBlock={onBlock} />, '/keys');
    await act(async () => { void r2.navigate({ to: '/board' as never }); await new Promise((r) => setTimeout(r, 10)); });
    expect(onBlock).toHaveBeenCalledTimes(1);
  });
  it('without a router it renders nothing and holds nothing', () => {
    const { container } = render(<LeaveGuard active onBlock={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
