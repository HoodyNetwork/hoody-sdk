// Holds keep their sender in Files' Storage tab: core records each hold's sender as
// 's:<source id>:<key>', and Storage keeps the source id 'computers', so a hold sent before the move (here: by this
// source from another mount) is still this page's own: Check again reads, and its sender's warned Dismiss frees exactly
// it. A hold another page sent under the same lock stays that page's (read-only here), the new kinds included.
import { bootFixtureCore, coreSource, heldChanges, queryClient, subjectOf, targetOf, type FixtureRequest, type Subject } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CONNECT_LOCK, DELIVER_LOCK, DISCARD_LOCK, MOUNT_LOCK, REMOVE_LOCK, STOP_LOCK, UNMOUNT_LOCK, useConnect, useMount, useRemove, useUnmount } from './data';
import { storageRules, type StorageFixture } from './fixtures';
import { storageRoutes } from './routes';
import { StorageTab, type StorageComputer } from './StorageTab';
import strings from './strings.en.json';
/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;

const C: StorageComputer = { id: 'c'.repeat(24), status: 'running', project_id: 'p'.repeat(24), server_name: 'n12' };
const B1 = 'a'.repeat(16);
const M1 = 'mount_' + 'b'.repeat(32);
const P1 = '1'.repeat(32);
const seed: StorageFixture = {
  backends: [{ id: B1, backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: [] }],
  mounts: [{ id: M1, backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' }],
  held: [{ id: P1, backend_id: B1, mount_id: M1, state: 'pending', since: 1_700_000_000, file_count: 1, incomplete_count: 0, total_bytes: 1, reasons: {}, deliverable: true }],
};
const tab = () => render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={C} canWrite /></QueryClientProvider>));
const sub = subjectOf(C);

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- holds live in localStorage; each test starts clean
  localStorage.clear();
});

describe('hold senders across the move', () => {
  const kinds = [
    { key: 'connect', lock: CONNECT_LOCK, use: useConnect, vars: { ...sub, type: 's3', body: {} } },
    { key: 'mount', lock: MOUNT_LOCK, use: useMount, vars: { ...sub, backend: B1, label: 'Box', leaf: 'box' } },
    { key: 'unmount', lock: UNMOUNT_LOCK, use: useUnmount, vars: { ...sub, mount: M1, label: 'Backups box' } },
    { key: 'remove', lock: REMOVE_LOCK, use: useRemove, vars: { ...sub, backend: B1, name: 'deploy on SFTP server' } },
  ] as const;

  it.each(kinds)("a $key hold sent by this source is this page's own: Check again reads, Dismiss frees exactly it", async ({ key, lock, use, vars }) => {
    const reads: FixtureRequest[] = [];
    bootFixtureCore({ rules: storageRules({ seed, pending: true, onRead: (r) => reads.push(r) }) });
    function Earlier() {
      const m = (use as () => { mutateAsync: (v: unknown) => Promise<unknown> })();
      return <button onClick={() => void m.mutateAsync(vars)}>send before</button>;
    }
    const view = render(<QueryClientProvider client={queryClient}><Earlier /></QueryClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'send before' }));
    await waitFor(() => expect(heldChanges(lock, { realm: 'all' })).toHaveLength(1));
    // The sender core recorded: the source id is a stable name, never the folder.
    expect(heldChanges(lock, { realm: 'all' })[0]!.by).toBe(`s:computers:${key}`);
    view.unmount();
    tab();
    const dismiss = await screen.findByRole('button', { name: strings['held.dismiss'] });
    expect(screen.queryByText(new RegExp(strings['held.elsewhere'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull();
    const before = reads.length;
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(reads.length).toBeGreaterThan(before));
    expect(heldChanges(lock, { realm: 'all' })).toHaveLength(1);
    await userEvent.click(dismiss);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(heldChanges(lock, { realm: 'all' })).toHaveLength(0));
  });

  it.each([
    { lock: DELIVER_LOCK, route: storageRoutes.deliver, text: 'pu.held.deliver' },
    { lock: STOP_LOCK, route: storageRoutes.stopHeld, text: 'pu.held.stop' },
    { lock: DISCARD_LOCK, route: storageRoutes.discard, text: 'pu.held.discard' },
  ] as const)("another page's hold of $lock stays that page's: read-only here, no Dismiss", async ({ lock, route, text }) => {
    bootFixtureCore({ rules: storageRules({ seed, pending: true }) });
    type V = Subject & { item: string };
    const other = coreSource('storage-other-sender', {
      reads: {},
      changes: { go: { route, input: (v: V) => ({ target: targetOf(v), params: { id: v.item } }), lock, lockKey: (v: V) => ({ computer: v.id, item: v.item }), identity: (v: V) => ({ computer: v.id, item: v.item, name: 'Backups box' }), acrossRealms: true } },
    });
    function Other() {
      const m = other.useMutation<unknown, V>('go');
      return <button onClick={() => void m.mutateAsync({ ...sub, item: P1 })}>send elsewhere</button>;
    }
    const view = render(<QueryClientProvider client={queryClient}><Other /></QueryClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'send elsewhere' }));
    await waitFor(() => expect(heldChanges(lock, { realm: 'all' })).toHaveLength(1));
    view.unmount();
    tab();
    expect(await screen.findByText(new RegExp(strings[text].replace('{{name}}', 'Backups box').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(strings['held.elsewhere'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
  });
});
