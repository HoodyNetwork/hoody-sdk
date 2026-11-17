// Vitest: Servers are grouped Free / Subservers / Bare metal (and Other servers when the answer
// does not say), in list and in cards; the Cards / List switch is one choice shared by Computers, Servers and Projects,
// kept on reload; a full server's card keeps its Upgrade button in the footer.
// eslint-disable-next-line no-restricted-imports -- a test harness for the Servers view, not page code
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the Servers view, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { localSetting } from '@core';
import { act, render, renderPage, screen, userEvent, within } from '@app/testing';
import type { Computer, Server, Usage } from './types';
import { computers } from './fixtures';
import { ComputersList } from './parts/ComputersList';
import { ServersView } from './parts/ServersView';
import page from './page';
import strings from './strings.en.json';

// The shared choice, read and written through core like the page does (core is ready only once a test runs).
const present = () => localSetting('hub.v3.table.present.machines');
afterEach(() => {
  present().set(null);
});

const serversTable = () => screen.getByRole('table', { name: strings['srv.title'] });
const rowsOf = (table: HTMLElement) =>
  [...table.querySelectorAll('tbody tr')].map((r) => (r.querySelector('strong')?.textContent ?? r.textContent?.replace(/\d+$/, '').trim()) || '');
const groupNames = () => within(serversTable()).getAllByRole('button', { expanded: true }).map((b) => b.textContent?.replace(/\d+$/, '').trim());
const cardOf = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('[data-row-id]') as HTMLElement;

describe('computers: Servers grouped by kind', () => {
  it('shows Free, Subservers and Bare metal, with each server under its own heading', async () => {
    await renderPage(page, { path: '/computers/servers' });
    await screen.findByText('n12', { selector: 'strong' }, { timeout: 8000 });
    expect(groupNames()).toEqual(['Free', 'Subservers', 'Bare metal']);
    expect(rowsOf(serversTable())).toEqual(['Free', 'ash-3', 'Subservers', 'fra-7', 'Bare metal', 'n12']);
  });

  it('puts a server whose answer does not say what it is under Other servers, never a guessed group', async () => {
    await renderPage(page, { path: '/computers/servers', state: 'serversKinds' });
    await screen.findByText('old-1', { selector: 'strong' }, { timeout: 8000 });
    expect(groupNames()).toEqual(['Free', 'Subservers', 'Bare metal', 'Other servers']);
    expect(rowsOf(serversTable()).slice(-2)).toEqual(['Other servers', 'old-1']);
  });
});

describe('computers: one Cards / List switch for Computers, Servers and Projects', () => {
  // Kept on reload: the kit test reads a stored choice (Presentation.test.tsx); renderPage starts with clean storage.
  it('opens in Cards with nothing stored; List on Servers is List on Projects and on Computers, and back', async () => {
    const { router } = await renderPage(page, { path: '/computers/servers' });
    await screen.findByText('n12', { selector: 'strong' }, { timeout: 8000 });
    expect(present().get()).toBeNull();
    expect(screen.getByRole('radio', { name: 'Cards', checked: true })).toBeTruthy();
    expect(cardOf('n12').getAttribute('role')).toBe('row');
    expect(serversTable().getAttribute('role')).toBe('table');
    await userEvent.click(screen.getByRole('radio', { name: 'List' }));
    expect(cardOf('n12').getAttribute('role')).toBeNull();
    expect(present().get()).toBe('list');

    await act(async () => {
      router.history.push('/computers/projects');
    });
    await screen.findByRole('radio', { name: 'List', checked: true }, { timeout: 8000 });
    expect(screen.getByRole('table').hasAttribute('role')).toBe(false);

    await act(async () => {
      router.history.push('/computers');
    });
    await screen.findByRole('radio', { name: 'List', checked: true }, { timeout: 8000 });
    expect(screen.getByRole('table').hasAttribute('role')).toBe(false);
    // Back to Cards from Computers: Servers follows.
    await userEvent.click(screen.getByRole('radio', { name: 'Cards' }));
    expect(screen.getByRole('table').getAttribute('role')).toBe('table');
    await act(async () => {
      router.history.push('/computers/servers');
    });
    await screen.findByText('n12', { selector: 'strong' }, { timeout: 8000 });
    expect(cardOf('n12').getAttribute('role')).toBe('row');
  });

  // The list's usage read has no route yet (data.ts: usageAll is not wired), so the list is given readings directly.
  it('Show usage in Cards puts the CPU and RAM readings in each card (two bars)', async () => {
    const first = computers[0] as Computer;
    const usage: Record<string, Usage | null> = { [first.id]: { cpu: 12, mem: { used: 1, total: 4 }, disk: { used: 10, total: 40 }, at: '2026-10-25T00:00:00Z' } };
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <ComputersList computers={[first]} projects={[]} realms={[]} caps="all" currentId={undefined} loading={false} error={null} onRetry={() => {}} ops={{}} usage={usage} servers={[]} onAction={() => {}} onBulk={() => {}} empty={null} />
        ),
      }),
      history: createMemoryHistory({ initialEntries: ['/computers'] }),
    });
    await act(async () => {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
      await router.load();
    });
    const meters = await within(screen.getByRole('table')).findAllByRole('meter');
    expect(meters).toHaveLength(2);
    for (const m of meters) expect(m.closest('article [data-card-usage]')).not.toBeNull();
  });

  it('a server card that is full keeps its upgrade in its footer', async () => {
    // A shared slice (a whole machine has nothing bigger to buy, so it gets none).
    const full: Server = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'node-7', place: 'Singapore', cc: 'SG', cpu: null, ram: null, disk: null, free: false, kind: 'subserver', days: 38, status: 'active', cap: { used: 3, max: 3 } };
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => <ServersView servers={[full]} subs={undefined} computers={[]} known={{ computers: true, subs: true }} loading={false} error={null} onRetry={() => {}} />,
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
    const btn = await screen.findByRole('link', { name: new RegExp(strings['srv.upgrade']) });
    expect(btn).toHaveAttribute('data-upgrade', 'full');
    expect(btn.closest('[class*="cardFoot"]')).not.toBeNull();
    expect(within(btn.closest('[data-row-id]') as HTMLElement).getByText('node-7', { selector: 'strong' })).toBeTruthy();
  });
});
