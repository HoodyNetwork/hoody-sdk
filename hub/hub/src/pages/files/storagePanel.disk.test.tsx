// Files' Storage tab shows the computer's own disk in its glance: read from the API's stats while the computer runs,
// "used of total" in the page's byte words with a meter; "Reading…" before the answer; "Can't tell" when the read
// fails (never 0); no disk at all for a stopped computer.
import { bootFixtureCore, queryClient } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the panel, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the panel reads the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FilesComputers } from './data';
import { StoragePanel } from './StoragePanel';
import { storageRules, type StorageOpts } from './storage/fixtures';
import strings from './storage/strings.en.json';

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' };
const GIB = 1024 ** 3;
const list = (status: string) => ({ rows: [{ ...C, status }], failed: false, error: null, complete: true, more: false, capped: false, unproven: false, loading: false, retry: () => undefined }) as unknown as FilesComputers;

function mount(status: string, disk?: StorageOpts['disk']) {
  bootFixtureCore({ rules: storageRules({ seed: { backends: [], mounts: [], held: [] }, ...(disk === undefined ? {} : { disk }) }) });
  render(
    <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => <QueryClientProvider client={queryClient}><StoragePanel computers={list(status)} /></QueryClientProvider> }), history: createMemoryHistory({ initialEntries: [`/?acid=${C.id}`] }) })} />,
  );
}
const fact = async () => (await screen.findByText(strings['glance.disk'])).parentElement!;

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe("Files' Storage tab: the computer's own disk", () => {
  it('a running computer: used of total in bytes words, with a meter', async () => {
    mount('running', { usage: 2 * GIB, total: 10 * GIB });
    const f = await fact();
    const words = strings['glance.disk.n'].replace('{{used}}', '2 GB').replace('{{total}}', '10 GB');
    expect(await within(f).findAllByText(words)).not.toHaveLength(0);
    expect(within(f).getByRole('meter', { name: words })).toBeInTheDocument();
  });

  it('a failed read says Can\'t tell, never 0', async () => {
    mount('running', 'fail');
    const f = await fact();
    expect(await within(f).findByText(strings['glance.cantTell'])).toBeInTheDocument();
    expect(within(f).queryByText(/0 B/)).toBeNull();
  });

  it('an answer without a size says Can\'t tell', async () => {
    mount('running', { usage: 3 * GIB, total: 0 });
    const f = await fact();
    expect(await within(f).findByText(strings['glance.cantTell'])).toBeInTheDocument();
  });

  it('before the answer: Reading…', async () => {
    mount('running', 'slow');
    const f = await fact();
    expect(within(f).getByText(strings['glance.reading'])).toBeInTheDocument();
  });

  it('a stopped computer: no disk', async () => {
    mount('stopped');
    await screen.findByText(strings['notRunning.title']);
    expect(screen.queryByText(strings['glance.disk'])).toBeNull();
  });
});
