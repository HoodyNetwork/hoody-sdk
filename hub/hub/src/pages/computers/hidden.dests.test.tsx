// A place Computers sends people to that this load does not serve gets no control at all:
// with no classic Hub to fall back to, a shown control with no link would do nothing. Billing hidden: no
// Upgrade, no Pay now; Market hidden: no Browse market (header) or Browse servers (empty list); Keys hidden: no
// Manage key; Guide hidden: no Learn; Logs hidden: no See logs in a failed computer's menu. Served, each one shows.
// eslint-disable-next-line no-restricted-imports -- a test harness for the Servers view, not page code
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the Servers view, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as kitModule from '@kit';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type { Computer, Server, Subscription } from './types';
import { computerMenu } from './parts/menu';
import { ServersView } from './parts/ServersView';
import page from './page';
import strings from './strings.en.json';

// The pages this load hides; a page test has no served list, so every other page counts as served.
const hidden = new Set<string>();
vi.mock('@kit', async (importOriginal) => {
  const orig = await importOriginal<typeof kitModule>();
  return {
    ...orig,
    usePageVisible: (id: string) => !hidden.has(id),
    usePageLink: (id: string) => (hidden.has(id) ? null : orig.usePageLink(id)),
  };
});
// The kit upgrade piece asks the shell itself whether billing is served.
vi.mock('../../shell/pageLinks', async (importOriginal) => {
  const orig = await importOriginal<{ usePageLink: (id: string) => unknown }>();
  return { ...orig, usePageLink: (id: string) => (hidden.has(id) ? null : orig.usePageLink(id)) };
});
afterEach(() => hidden.clear());

const button = (name: string) => screen.queryByRole('button', { name });
const upgrade = () => screen.queryByRole('link', { name: new RegExp(strings['srv.upgrade']) });

const SID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const full: Server = { id: SID, name: 'node-7', place: 'Singapore', cc: 'SG', cpu: null, ram: null, disk: null, free: false, days: 38, status: 'active', cap: { used: 3, max: 3 } };
const owed: Subscription = { id: 's1', state: 'past_due', server_name: 'node-7', paid_through: '2026-10-20T00:00:00.000Z', auto_renew: true };

async function servers(rows: Server[], subs: Subscription[]) {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <ServersView servers={rows} subs={{ items: subs, more: false }} computers={[]} known={{ computers: true, subs: true }} loading={false} error={null} onRetry={() => {}} />
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
}

describe('Computers: places this load hides get no control', () => {
  it('Billing hidden: a full server offers no Upgrade and an overdue subscription no Pay now', async () => {
    hidden.add('billing');
    await servers([full], [owed]);
    await screen.findAllByText('node-7');
    expect(upgrade()).toBeNull();
    expect(button(strings['sub.payNow'])).toBeNull();
  });

  it('Billing served: both show', async () => {
    await servers([full], [owed]);
    expect(await screen.findByRole('link', { name: new RegExp(strings['srv.upgrade']) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['sub.payNow'] })).toBeInTheDocument();
  });

  it('Market hidden: an empty server list offers no Browse servers; served, it does', async () => {
    hidden.add('market');
    await servers([], []);
    await screen.findByText(strings['srv.empty']);
    expect(button(strings['srv.browse'])).toBeNull();
  });

  it('Market served: an empty server list offers Browse servers', async () => {
    await servers([], []);
    expect(await screen.findByRole('button', { name: strings['srv.browse'] })).toBeInTheDocument();
  });

  it('Market hidden: the Servers header has no Browse market; served, it has', async () => {
    hidden.add('market');
    await renderPage(page, { path: '/computers/servers' });
    await screen.findByRole('heading', { level: 1 });
    expect(button(strings['srv.market'])).toBeNull();
  });

  it('Market served: the Servers header offers Browse market', async () => {
    await renderPage(page, { path: '/computers/servers' });
    expect(await screen.findByRole('button', { name: strings['srv.market'] }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('Keys served: Connect offers Manage key', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    expect(await screen.findByRole('button', { name: strings['ssh.key.manage'] }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('Keys hidden: Connect has no Manage key', async () => {
    hidden.add('keys');
    await renderPage(page, { path: '/computers?sel=atlas.00a1&tab=connect' });
    await screen.findByRole('tab', { name: strings['tab.connect'], selected: true }, { timeout: 8000 });
    expect(button(strings['ssh.key.manage'])).toBeNull();
  });

  // Access is explained and changed on the Permissions tab; the Overview keeps one line and a link there,
  // so How access works is gone from the Overview whether Guide is served or not.
  it('Guide served: Overview has no How access works (it moved to the Permissions tab)', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await screen.findByText(strings['ov.who'], {}, { timeout: 8000 });
    expect(button(strings['fact.learn'])).toBeNull();
  });

  it('Guide hidden: Overview has no How access works', async () => {
    hidden.add('guide');
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await screen.findByText(strings['fact.access'], {}, { timeout: 8000 });
    expect(button(strings['fact.learn'])).toBeNull();
  });

  // The mounted menus (the table row's and the detail header's), on the fixtures' failed computer (ember).
  const emberRow = async () => {
    const table = await screen.findByRole('table', { name: strings['title'] }, { timeout: 8000 });
    return within(table).findByRole('row', { name: /ember/ }, { timeout: 8000 });
  };
  const menuItems = async () => within(await screen.findByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent ?? '');

  it('Logs hidden: the table row menu of a failed computer has no See logs', async () => {
    hidden.add('logs');
    await renderPage(page, { path: '/computers' });
    await userEvent.click(within(await emberRow()).getByRole('button', { name: /actions/i }));
    expect(await menuItems()).not.toContain(strings['menu.logs']);
  });

  it('Logs served: the table row menu offers See logs and it opens Logs on that computer', async () => {
    const { router } = await renderPage(page, { path: '/computers' });
    await userEvent.click(within(await emberRow()).getByRole('button', { name: /actions/i }));
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: strings['menu.logs'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/logs'));
    expect(String((router.state.location.search as Record<string, unknown>).computer)).toMatch(/^ember/);
  });

  it('Logs hidden: the detail header menu of a failed computer has no See logs', async () => {
    const path = '/computers?sel=ember.00e5';
    hidden.add('logs');
    await renderPage(page, { path });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'ember') }, { timeout: 8000 }));
    expect(await menuItems()).not.toContain(strings['menu.logs']);
  });

  it('Logs served: the detail header menu offers See logs', async () => {
    await renderPage(page, { path: '/computers?sel=ember.00e5' });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'ember') }, { timeout: 8000 }));
    expect(await menuItems()).toContain(strings['menu.logs']);
  });

  it('Logs hidden: a failed computer\'s menu has no See logs; served, it has (the builder)', () => {
    const failed = { id: 'c1', name: 'atlas', status: 'failed' } as Computer;
    const ids = (logs: boolean) => computerMenu(failed, 'all', false, (k: string) => k, () => {}, { terminal: true, logs }).map((e) => (e === '-' ? '-' : e.id));
    expect(ids(true)).toContain('logs');
    expect(ids(false)).not.toContain('logs');
  });
});
