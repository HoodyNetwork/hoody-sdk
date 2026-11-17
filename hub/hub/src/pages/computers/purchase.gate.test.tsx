// Computers offers a purchase (Upgrade, See plans, Pay now, Renew) only to a
// session that may buy (financial.subscriptions.purchase, core/routePerms.ts) on an unframed page (a framed page refuses
// every change, core/api.ts). Before, the billing page being served was enough, so a token without the leaf was shown
// Upgrade and refused at checkout. Controls that only read or browse (Rent a server, Browse market) are not gated here.
// eslint-disable-next-line no-restricted-imports -- a test harness for the Servers view, not page code
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the Servers view, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderPage, screen } from '@app/testing';
import type { Server, Subscription } from './types';
import { ServersView } from './parts/ServersView';
import page from './page';
import strings from './strings.en.json';

const gate = vi.hoisted(() => ({ purchase: true, framed: false }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const can = core.useCan as (cap: string) => boolean;
  return {
    ...core,
    useCan: (cap: string) => (cap === 'financial.subscriptions.purchase' ? gate.purchase : can(cap)),
    isFramed: () => gate.framed,
  };
});
afterEach(() => {
  gate.purchase = true;
  gate.framed = false;
});

const button = (name: string) => screen.queryByRole('button', { name });
// The full server's upgrade is the kit link: "Full: Get more room".
const upgrade = () => screen.queryByRole('link', { name: new RegExp(strings['srv.upgrade']) });
const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const SID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const full: Server = { id: SID, name: 'node-7', place: 'Singapore', cc: 'SG', cpu: null, ram: null, disk: null, free: false, days: 38, status: 'active', cap: { used: 3, max: 3 } };
const owed: Subscription = { id: 's1', state: 'past_due', server_name: 'node-7', paid_through: '2026-10-20T00:00:00.000Z', auto_renew: true };

async function servers() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ServersView servers={[full]} subs={{ items: [owed], more: false }} computers={[]} known={{ computers: true, subs: true }} loading={false} error={null} onRetry={() => {}} />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/computers/servers'] }),
  });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  await screen.findAllByText('node-7');
}

describe('Computers offers a purchase only to a session that may buy', () => {
  it('Servers: a session that may buy sees Upgrade on the full server and Pay now on the overdue plan', async () => {
    await servers();
    expect(await screen.findByRole('link', { name: new RegExp(strings['srv.upgrade']) })).toHaveAttribute('data-upgrade', 'full');
    expect(screen.getByRole('button', { name: strings['sub.payNow'] })).toBeInTheDocument();
  });

  it('Servers: a token without the purchase leaf sees neither Upgrade nor Pay now', async () => {
    gate.purchase = false;
    await servers();
    expect(upgrade()).toBeNull();
    expect(button(strings['sub.payNow'])).toBeNull();
  });

  it('Servers: a framed page sees neither Upgrade nor Pay now, even with the leaf', async () => {
    gate.framed = true;
    await servers();
    expect(upgrade()).toBeNull();
    expect(button(strings['sub.payNow'])).toBeNull();
  });

  it('zero state, all servers full: Rent stays for everyone; See plans only for a session that may buy', async () => {
    await renderPage(page, { state: 'emptyCapacity', realm: R1 });
    expect(await screen.findByRole('button', { name: strings['zero.capacity.rent'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['zero.plans'] })).toBeInTheDocument();
  }, 30000);

  it('zero state, all servers full, purchase not allowed: Rent shows, See plans does not', async () => {
    gate.purchase = false;
    await renderPage(page, { state: 'emptyCapacity', realm: R1 });
    expect(await screen.findByRole('button', { name: strings['zero.capacity.rent'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(button(strings['zero.plans'])).toBeNull();
  }, 30000);

  it('zero state, access ended: Renew for a session that may buy, nothing to press without the leaf', async () => {
    await renderPage(page, { state: 'emptyExpired', realm: R1 });
    expect(await screen.findByRole('button', { name: strings['zero.expired.renew'] }, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);

  it('zero state, access ended, purchase not allowed: no Renew', async () => {
    gate.purchase = false;
    await renderPage(page, { state: 'emptyExpired', realm: R1 });
    await screen.findByText(strings['zero.expired.title'], undefined, { timeout: 8000 });
    expect(button(strings['zero.expired.renew'])).toBeNull();
  }, 30000);
});
