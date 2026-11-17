// A stop that meets the upload's own end stops, finds nothing
// held when it reads the item back, and answers 404 PENDING_UPLOAD_NOT_FOUND (the files program's stop).
// The stop may have happened, so it is never shown as failed (C9): held, and a fresh list showing the item gone says so.
import { bootFixtureCore, queryClient, type FixtureRequest } from '@core';
import kitStrings from '@kit/strings.en.json';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { storageRules, type HeldFixture, type StorageFixture, type StorageOpts } from './fixtures';
import { StorageTab, type StorageComputer } from './StorageTab';
import strings from './strings.en.json';
/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;
/** A row's ⋯ menu item (the menu opens first). */
async function menuItem(row: HTMLElement, label: string) {
  if (screen.queryByRole('menu')) {
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  }
  await userEvent.click(within(row).getByRole('button', { name: kitStrings['table.rowActions'] }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
}

const C: StorageComputer = { id: 'c'.repeat(24), status: 'running', project_id: 'p'.repeat(24), server_name: 'n12' };
const B1 = 'a'.repeat(16);
const M1 = 'mount_' + 'b'.repeat(32);
const P1 = '1'.repeat(32);
const idle = { auto_deliver: true, pending_uploads: { count: 0, bytes: 0 }, uploads: { state: 'idle', dirty: 0, open_handles: 0 } };
const backends: StorageFixture['backends'] = [{ id: B1, backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: [] }];
const mountRow = { id: M1, backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active', ...idle };
const heldItem = (extra: Partial<HeldFixture> = {}): HeldFixture => ({
  id: P1, backend_id: B1, mount_id: M1, state: 'uploading', since: 1_700_000_000, file_count: 2, incomplete_count: 0, total_bytes: 2048,
  reasons: { open_when_stopped: 0, unconfirmed_at_stop: 2, metadata_unreadable: 0, upload_failing: 0, stopped_by_request: 0, changed_on_storage: 0, check_failed: 0, cannot_verify: 0 },
  deliverable: false,
  files: [{ path_b64: 'ZG9jcy9hLnR4dA', path: 'docs/a.txt', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true }],
  ...extra,
});
function boot(o: StorageOpts = {}) {
  const sent: FixtureRequest[] = [];
  bootFixtureCore({ rules: storageRules({ ...o, onSend: (r) => sent.push(r) }) });
  return sent;
}
const mount = () => render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={C} canWrite /></QueryClientProvider>));
/** The waiting item's row (its folder's name; the storage table shows the folder as "name at path"). */
const heldRow = async () => (await screen.findByText('Backups box')).closest('[data-row-id]') as HTMLElement;

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- each test starts with nothing held
  localStorage.clear();
});

describe('a stop answered not-found after the upload ended', () => {
  it('is held, never failed, says the item is no longer held once a fresh list shows it gone, and is sent once', async () => {
    const sent = boot({ seed: { backends, mounts: [mountRow], held: [heldItem()] }, stopThenGone: true });
    mount();
    await userEvent.click(await menuItem(await heldRow(), strings['pu.stop']));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['pu.stop.go'] }));
    expect(await screen.findByText(strings['pu.gone'].replace('{{storage}}', 'deploy on SFTP server'))).toBeInTheDocument();
    expect(screen.queryByText(kitStrings['outcome.failed.title'])).toBeNull();
    expect(screen.queryByText(strings['pu.stop.done'])).toBeNull();
    // Only the sender's Dismiss frees it; nothing offers a second Stop.
    expect(screen.getByRole('button', { name: strings['held.dismiss'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['pu.stop'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(screen.getByText(strings['pu.gone'].replace('{{storage}}', 'deploy on SFTP server'))).toBeInTheDocument());
    expect(sent).toHaveLength(1);
  });
});
