// The boot's Billing landing on a live page: the real boot gate's capture
// (public/auth/hub-boot-gate.js), the real shared.js session, core's own stash readers and the real Billing page,
// reached through adoptViewParam's default wiring and the hash router. A website buy link opens the Checkout drawer on
// its plan and a payment return shows its verified result; a token session, a stale stash or an explicit place stays
// where it was. The way through login and 2FA to this signed-in page is the
// API server's own test (the real login and 2FA pages).
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, UID } from '@core/test/env';
import { definePage, type PageManifest } from '@kit/page';
import gateSource from '../../../public/auth/hub-boot-gate.js?raw';
import { buildRouter } from '../app/router';
import billing from '../pages/billing/page';
import { adoptViewParam } from './hubUrl';

// The Billing hooks as a production build binds them. data.ts picks Fx or Live once, when it first loads; here that is
// the warm-up below, under a false __HUB_FIXTURES__, so it binds Live. This keeps it so whatever loads it first.
vi.mock('../pages/billing/data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return {
    ...a,
    useTopUpHeld: a.useTopUpHeldLive,
    usePaymentReturn: a.usePaymentReturnLive,
    useListing: a.useListingLive,
    useUnknownCheckouts: a.useUnknownCheckoutsLive,
    useCheckout: a.useCheckoutLive,
    useTopUp: a.useTopUpLive,
  };
});

const PLAN = '0123456789abcdef01234567';
const PAY = 'abcdefabcdefabcdefabcdef';
const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const tokenRecord = JSON.stringify({ v: 1, token: TOKEN, realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });

function Home() {
  return (
    <h1 data-hub-title tabIndex={-1}>
      Home
    </h1>
  );
}
const PAGES: PageManifest[] = [
  definePage({ id: 'home', path: '/home', title: 'title', layout: 'settings', load: async () => ({ default: Home }), status: 'ready', sensitive: false, strings: { title: 'Home' } }),
  billing,
];

// What the boot gate (public/auth/hub-boot-gate.js) stashes, word for word.
const stashIntent = (at = Date.now()) => sessionStorage.setItem('hub_buy_intent', JSON.stringify({ kind: 'subserver', plan: PLAN, at }));
const stashReturn = (at = Date.now()) => sessionStorage.setItem('hub_topup_return', JSON.stringify({ payment: PAY, status: 'success', provider: 'card', at }));
const intentLeft = () => sessionStorage.getItem('hub_buy_intent') ?? localStorage.getItem('hub_buy_intent');
/** The real boot gate, the first script of /auth/home, on this signed-in page: it stashes and strips ?buy= or ?payment=.
 *  Its belt timer and load listener are recorded and removed after each test, so no gate outlives its test. */
const gateLeft: { timers: unknown[]; loads: EventListener[] } = { timers: [], loads: [] };
const runGate = () => {
  // The gate calls setTimeout bare (the global) and window.addEventListener.
  const realSet = globalThis.setTimeout, realAdd = window.addEventListener;
  globalThis.setTimeout = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => {
    const id = realSet(fn, ms, ...a);
    gateLeft.timers.push(id);
    return id;
  }) as typeof globalThis.setTimeout;
  window.addEventListener = ((type: string, fn: EventListener, o?: boolean | AddEventListenerOptions) => {
    if (type === 'load') gateLeft.loads.push(fn);
    realAdd.call(window, type, fn, o);
  }) as typeof window.addEventListener;
  try {
    new Function(gateSource)();
  } finally {
    globalThis.setTimeout = realSet;
    window.addEventListener = realAdd;
  }
};
const dropGate = () => {
  for (const id of gateLeft.timers.splice(0)) clearTimeout(id as Parameters<typeof clearTimeout>[0]);
  for (const fn of gateLeft.loads.splice(0)) window.removeEventListener('load', fn);
  delete (window as { HubBootGate?: unknown }).HubBootGate;
};

/** The boot on `url`: the real boot gate when `gate`, adoptViewParam with its default wiring (the stored session and
 *  commerce's stash), then the router. */
async function bootAt(url: string, gate = false) {
  window.history.replaceState(null, '', url);
  if (gate) {
    runGate();
    expect(gateLeft.timers.length, 'the gate set its belt timer').toBeGreaterThan(0);
  }
  adoptViewParam(PAGES);
  const router = buildRouter(PAGES, { queryClient, shell: false });
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  return router;
}

beforeEach(() => {
  boot();
  // A live page: no fixtures compiled in. Set after the modules loaded, so it reaches the boot's checks and Billing's
  // own (takeBuyIntent, dropPaymentReturn), as on a production page.
  vi.stubGlobal('__HUB_FIXTURES__', false);
});
// Billing's chunk loaded once before the first test: on a loaded host its first import alone can outlast a find's wait.
// Loaded as a live page (no fixtures), the way each test then runs it: its modules pick Live when they first load.
beforeAll(async () => {
  vi.stubGlobal('__HUB_FIXTURES__', false);
  try {
    await billing.load();
  } finally {
    vi.unstubAllGlobals();
  }
}, 60_000);
afterEach(() => {
  dropGate();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('hub-booting');
  document.documentElement.removeAttribute('data-hub-boot');
  window.history.replaceState(null, '', '/');
  queryClient.clear();
});

describe('a waiting buy link or payment return opens the real Billing page', () => {
  it('a buy link: the gate stashes it, Billing opens its Checkout drawer on the plan, the stash consumed', async () => {
    onFetch((c) =>
      c.url.includes('/subserver-plans')
        ? { status: 200, body: { data: { plans: [{ id: 'planv100000000000000000a', family_id: PLAN, price_cents_per_month: 1200, hold_days: 7, text: { title: 'Builder' } }] } } }
        : { status: 200, body: { data: {} } },
    );
    const router = await bootAt(`/auth/home?buy=subserver&plan=${PLAN}`, true);
    expect(window.location.search).toBe('');
    await screen.findByRole('heading', { level: 1, name: 'Plans & Billing' });
    await waitFor(() => expect(router.state.location.search).toEqual({ checkout: 'buy', plan: PLAN }));
    expect(router.state.location.pathname).toBe('/billing');
    const drawer = await screen.findByRole('dialog', { name: 'Buy a plan' });
    await within(drawer).findByText('Builder', { exact: false });
    expect(intentLeft()).toBeNull();
  });

  it('a payment return: the gate stashes it, Billing checks the payment with the server and shows it received', async () => {
    onFetch((c) =>
      c.url.includes(`/wallet/payments/card/intents/${PAY}`)
        ? { status: 200, body: { data: { status: 'completed', credited_at: '2026-10-25T00:00:00Z' } } }
        : { status: 200, body: { data: {} } },
    );
    const router = await bootAt(`/auth/home?payment=${PAY}&status=success&provider=card`, true);
    expect(window.location.search).toBe('');
    await screen.findByRole('heading', { level: 1, name: 'Plans & Billing' });
    expect(router.state.location.pathname).toBe('/billing');
    await waitFor(() => expect(document.querySelector('[data-band="return-received"]')).not.toBeNull());
    expect(calls.some((c) => c.method === 'GET' && c.url.includes(`/wallet/payments/card/intents/${PAY}`))).toBe(true);
  });

  it('a token session never lands on Billing (and leaves the stash alone)', async () => {
    boot({ signedIn: false, identity: false, storage: { hub_token_session_v1: tokenRecord } });
    stashIntent();
    const router = await bootAt('/auth/home?hub=v3');
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(router.state.location.pathname).toBe('/home');
    expect(intentLeft()).not.toBeNull();
  });

  it('a stale buy link or payment return lands on Home; commerce drops the stale stash', async () => {
    stashIntent(Date.now() - 61 * 60 * 1000);
    stashReturn(Date.now() - 25 * 60 * 60 * 1000);
    const router = await bootAt('/auth/home?hub=v3');
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(router.state.location.pathname).toBe('/home');
    expect(intentLeft()).toBeNull();
  });

  it('an explicit place wins: a hash keeps its page, the stash waits', async () => {
    stashIntent();
    const router = await bootAt('/auth/home?hub=v3#/home');
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(router.state.location.pathname).toBe('/home');
    expect(intentLeft()).not.toBeNull();
  });

  it('an explicit place wins: a sign-in view (here one this load does not serve) never asks, the stash waits', async () => {
    stashIntent();
    const router = await bootAt('/auth/home?hub=v3&view=bots');
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(router.state.location.pathname).toBe('/home');
    expect(window.location.search).toBe('?hub=v3');
    expect(intentLeft()).not.toBeNull();
  });
});
