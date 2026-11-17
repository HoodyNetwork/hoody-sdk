// Servers > Subscriptions: Pay now is the kit row action of an owed subscription
// (DataTable actions, inline), not a column of its own: the table has no Actions column, the button sits in the row's
// actions, an active subscription offers none, and the press goes to Billing.
// eslint-disable-next-line no-restricted-imports -- a test harness for the Servers view, not page code
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the Servers view, not page code
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { act, render, screen, userEvent, within } from '@app/testing';
import type { Subscription } from './types';
import { ServersView } from './parts/ServersView';
import strings from './strings.en.json';

const owed: Subscription = { id: 's1', state: 'past_due', server_name: 'node-7', paid_through: '2026-10-20T00:00:00.000Z', auto_renew: true };
const paid: Subscription = { id: 's2', state: 'active', server_name: 'node-8', paid_through: '2026-12-20T00:00:00.000Z', auto_renew: true };

async function servers(subs: Subscription[]) {
  const root = createRootRoute();
  const view = createRoute({
    getParentRoute: () => root,
    path: '/computers/servers',
    component: () => <ServersView servers={[]} subs={{ items: subs, more: false }} computers={[]} known={{ computers: true, subs: true }} loading={false} error={null} onRetry={() => {}} />,
  });
  const billing = createRoute({ getParentRoute: () => root, path: '/billing', component: () => <p>billing page</p> });
  const router = createRouter({ routeTree: root.addChildren([view, billing]), history: createMemoryHistory({ initialEntries: ['/computers/servers'] }) });
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await router.load();
  });
  return router;
}

const subsTable = () => screen.getByRole('table', { name: strings['srv.subs'] });

describe('Servers subscriptions: Pay now is a row action', () => {
  it('has no Actions column; the owed row holds Pay now among its row actions, the active row none', async () => {
    await servers([owed, paid]);
    await screen.findByText('node-7');
    const table = subsTable();
    expect(within(table).queryByRole('columnheader', { name: strings['srv.col.action'] })).toBeNull();
    const pay = within(table).getAllByRole('button', { name: strings['sub.payNow'] });
    expect(pay).toHaveLength(1);
    expect(pay[0]!.closest('[data-row-actions]')).not.toBeNull();
    expect(pay[0]!.closest('tr')).toHaveTextContent('node-7');
  });

  it('Pay now goes to Billing', async () => {
    const router = await servers([owed]);
    await screen.findByText('node-7');
    await userEvent.click(within(subsTable()).getByRole('button', { name: strings['sub.payNow'] }));
    await screen.findByText('billing page');
    expect(router.state.location.pathname).toBe('/billing');
  });
});
