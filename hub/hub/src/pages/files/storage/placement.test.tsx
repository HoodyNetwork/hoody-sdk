// Where each explanation of the Storage tab shows: the
// texts the old tab put in one block now sit in the place they explain: the Connected storage section's heading and
// lede, its Add action's reason, the Connect drawer, the Waiting to upload section and the glance.
import { bootFixtureCore, queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { storageRules, type HeldFixture, type StorageFixture } from './fixtures';
import { StorageTab, type StorageComputer } from './StorageTab';
import strings from './strings.en.json';

const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;
const C: StorageComputer = { id: 'c'.repeat(24), status: 'running', project_id: 'p'.repeat(24), server_name: 'n12' };
const B1 = 'a'.repeat(16);
const M1 = 'mount_' + 'b'.repeat(32);
const idle = { auto_deliver: true, pending_uploads: { count: 0, bytes: 0 }, uploads: { state: 'idle', dirty: 0, open_handles: 0 } };
const backends: StorageFixture['backends'] = [{ id: B1, backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: [] }];
const mountRow = { id: M1, backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active', ...idle };
const held: HeldFixture = {
  id: '1'.repeat(32), backend_id: B1, mount_id: M1, state: 'pending', since: 1_700_000_000, file_count: 1, incomplete_count: 0, total_bytes: 1024,
  reasons: { open_when_stopped: 0, unconfirmed_at_stop: 1, metadata_unreadable: 0, upload_failing: 0, stopped_by_request: 0, changed_on_storage: 0, check_failed: 0, cannot_verify: 0 },
  deliverable: true,
  files: [{ path_b64: 'ZG9jcy9hLnR4dA', path: 'docs/a.txt', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true }],
};
const mount = (canWrite = true) => render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={C} canWrite={canWrite} /></QueryClientProvider>));
const drawn = async (id: string) => { await waitFor(() => expect(document.getElementById(id)).not.toBeNull()); return document.getElementById(id)!; };

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- holds live in localStorage; each test starts clean
  localStorage.clear();
});

describe('the Storage tab holds its explanations where they apply', () => {
  it('the Connected storage section carries its heading and lede', async () => {
    bootFixtureCore({ rules: storageRules({ seed: { backends, mounts: [mountRow], held: [] } }) });
    mount();
    const sec = await drawn('storage');
    expect(await within(sec).findByRole('heading', { name: strings['backends.title'] })).toBeInTheDocument();
    expect(within(sec).getByText(strings.lede)).toBeInTheDocument();
  });

  it('the Connect drawer says where keys go', async () => {
    bootFixtureCore({ rules: storageRules({ seed: { backends, mounts: [mountRow], held: [] } }) });
    mount();
    await screen.findByText('deploy on SFTP server');
    await userEvent.click(screen.getByRole('button', { name: strings.add }));
    expect(within(await screen.findByRole('dialog')).getByText(strings.where)).toBeInTheDocument();
  });

  it('without the right to change the computer, Add gives the reason', async () => {
    bootFixtureCore({ rules: storageRules({ seed: { backends, mounts: [mountRow], held: [] } }) });
    mount(false);
    await screen.findByText('deploy on SFTP server');
    expect(screen.getByRole('button', { name: strings.add })).toHaveAccessibleDescription(strings.noWrite);
  });

  it('what waits on the computer has its own section, heading and lede, and a glance fact', async () => {
    bootFixtureCore({ rules: storageRules({ seed: { backends, mounts: [mountRow], held: [held] } }) });
    mount();
    const sec = await drawn('storage-waiting');
    expect(await within(sec).findByRole('heading', { name: strings['pu.title'] })).toBeInTheDocument();
    expect(within(sec).getByText(strings['pu.lede'])).toBeInTheDocument();
    expect(within(await drawn('storage-glance')).getByText(strings['pu.title'])).toBeInTheDocument();
  });
});
