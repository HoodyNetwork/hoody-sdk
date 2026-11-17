// The dirty drawer's leave-site question when the context ends (drawer-ctxend): only the core's own leave
// (lifecycle 'leaving', sent right before it navigates) turns it off, so another tab's sign-out never holds this tab.
// A bump alone, of any reason, keeps the page (a realm switch, a fallback, a suspension; a logout that still waits for
// its work or stops on a retry panel), so a drawer still open there keeps asking before a reload. The caller here
// refuses every close (as a busy checkout does while a charge is in flight), so the drawer stays mounted through each
// step; the question is read the way the browser asks it, from a cancelable beforeunload on window (the hash history's
// own listener). The core's navigation is stubbed: nothing leaves the test page.
import { createHashHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bump, setIdentity } from '@core/ctx';
import { configureLifecycle, resetLifecycle, superseded, suspend } from '@core/lifecycle';
import { Drawer } from './Overlays';

const navigated: string[] = [];

function Refusing() {
  return (
    <Drawer resizeKey="test-drawer-ctxend" isOpen onOpenChange={() => {}} title="T" dirty>
      <p>typed</p>
    </Drawer>
  );
}

async function mount() {
  const router = createRouter({ routeTree: createRootRoute({ component: Refusing }), history: createHashHistory() });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

/** True when the page would ask before unloading. */
function asks(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

beforeEach(() => {
  navigated.length = 0;
  configureLifecycle({ navigate: (u) => { navigated.push(u); }, herePath: () => '/here' });
});

afterEach(() => {
  cleanup();
  resetLifecycle();
  setIdentity(null);
});

describe('Drawer NavGuard: the leave-site question when the context ends', () => {
  it('asks while the context lives', async () => {
    await mount();
    expect(asks()).toBe(true);
  });

  for (const reason of ['switch', 'fallback', 'suspended', 'late', 'fixture-boot', 'account', 'signout', 'logout'])
    it(`still asks after a '${reason}' bump alone (the core has not left the page)`, async () => {
      await mount();
      act(() => { bump(reason); });
      expect(navigated).toEqual([]);
      expect(asks()).toBe(true);
    });

  it('still asks after a suspension (the lifecycle tells the page, which stays)', async () => {
    setIdentity({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', banned: false });
    await mount();
    act(() => { suspend(); });
    expect(navigated).toEqual([]);
    expect(asks()).toBe(true);
  });

  it("does not ask once the core leaves the page (another tab's sign-out or account switch: superseded())", async () => {
    await mount();
    act(() => { superseded(); });
    expect(navigated).toHaveLength(1);
    expect(asks()).toBe(false);
  });
});
