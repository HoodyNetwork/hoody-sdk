// A Drawer body that scrolls with nothing focusable inside (every field disabled while a save is pending) takes
// keyboard focus itself, so a keyboard user can still scroll it (hub-platform dark axe pass:
// scrollable-region-focusable); a body with an enabled control, or one that does not scroll, stays out of the
// tab order.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from './Overlays';

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const frames = () =>
  act(async () => {
    await new Promise((r) => window.requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 5));
  });

// jsdom lays nothing out: the body "overflows" when its scrollHeight beats its clientHeight.
let tall = true;
beforeEach(() => {
  tall = true;
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => (tall ? 900 : 100));
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 100);
});
afterEach(() => vi.restoreAllMocks());

const body = () => screen.getByRole('dialog').querySelector<HTMLElement>('[data-drawer-body]');

describe('Drawer: a scrolling body keyboard users can reach', () => {
  it('a scrolling body whose fields are all disabled is focusable', async () => {
    await inRouter(() => (
      <Drawer resizeKey="test-drawerscroll-test" isOpen onOpenChange={() => undefined} title="Schedule" busy>
        <input aria-label="Name" disabled />
        <textarea aria-label="Notes" disabled />
      </Drawer>
    ));
    await frames();
    expect(body()).toHaveAttribute('tabindex', '0');
  });

  it('a scrolling body with an enabled field stays out of the tab order', async () => {
    await inRouter(() => (
      <Drawer resizeKey="test-drawerscroll-test-2" isOpen onOpenChange={() => undefined} title="Schedule">
        <input aria-label="Name" />
      </Drawer>
    ));
    await frames();
    expect(body()).not.toHaveAttribute('tabindex');
  });

  it('a body that does not scroll stays out of the tab order', async () => {
    tall = false;
    await inRouter(() => (
      <Drawer resizeKey="test-drawerscroll-test-3" isOpen onOpenChange={() => undefined} title="Schedule" busy>
        <input aria-label="Name" disabled />
      </Drawer>
    ));
    await frames();
    expect(body()).not.toHaveAttribute('tabindex');
  });
});
