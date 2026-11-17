// The held-files drawer opens on the batch's verdict (where the files are, the one marked phrase when some may
// be incomplete) and its facts (how many, how large, why held); each file row says its state in StatusPills
// (Incomplete, Name approximate) with its size and reason as the row's meta.
import { bootFixtureCore, queryClient } from '@core';
import { formatBytes } from '@kit';
import kitStrings from '@kit/strings.en.json';
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
const P1 = '1'.repeat(32);
const backends: StorageFixture['backends'] = [{ id: B1, backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: [] }];
const mountRow = { id: M1, backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active', auto_deliver: true, pending_uploads: { count: 0, bytes: 0 }, uploads: { state: 'idle', dirty: 0, open_handles: 0 } };
const reasons = { open_when_stopped: 0, unconfirmed_at_stop: 2, metadata_unreadable: 0, upload_failing: 0, stopped_by_request: 0, changed_on_storage: 0, check_failed: 0, cannot_verify: 0 };
const heldItem = (extra: Partial<HeldFixture> = {}): HeldFixture => ({
  id: P1, backend_id: B1, mount_id: M1, state: 'pending', since: 1_700_000_000, file_count: 2, incomplete_count: 0, total_bytes: 2048, reasons, deliverable: true,
  files: [
    { path_b64: 'ZG9jcy9hLnR4dA', path: 'docs/a.txt', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true },
    { path_b64: 'ZG9jcy9iLnR4dA', path: 'docs/b.txt', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true },
  ],
  ...extra,
});
const words = (key: keyof typeof strings, vars: Record<string, string | number> = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), strings[key]);

async function openFiles(item: HeldFixture) {
  bootFixtureCore({ rules: storageRules({ seed: { backends, mounts: [mountRow], held: [item] } }) });
  render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={C} canWrite /></QueryClientProvider>));
  await waitFor(() => expect(document.getElementById('storage-waiting')?.querySelector(`[data-row-id="${P1}"]`)).toBeTruthy());
  const row = document.getElementById('storage-waiting')!.querySelector<HTMLElement>(`[data-row-id="${P1}"]`)!;
  await userEvent.click(within(row).getByRole('button', { name: kitStrings['table.rowActions'] }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pu.files']) }));
  const list = await screen.findByRole('list', { name: words('pu.files.title', { name: 'Backups box' }) });
  return { list, verdict: screen.getByRole('group', { name: strings['pu.files.verdict'] }) };
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- holds live in localStorage; each test starts clean
  localStorage.clear();
});

describe('held files drawer', () => {
  it('opens on a calm verdict with no marked phrase when every file is whole, and the facts say how many, how large and why', async () => {
    const { verdict } = await openFiles(heldItem());
    expect(within(verdict).getByText(strings['pu.files.s.all'])).toBeInTheDocument();
    expect(verdict.querySelector('[data-verdict-mark]')).toBeNull();
    const facts = document.querySelector<HTMLElement>(`dl[aria-label="${strings['pu.files.verdict']}"]`)!;
    expect(facts).not.toBeNull();
    // The facts are the plate's own (Verdict facts=), after its sentence.
    expect(verdict.contains(facts)).toBe(true);
    expect(within(verdict).getByText(strings['pu.files.s.all']).compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const valueOf = (label: string) => within(facts).getByText(label).nextElementSibling?.textContent;
    expect(valueOf(strings['pu.files.f.files'])).toBe('2');
    expect(valueOf(strings['pu.files.f.size'])).toBe(formatBytes(2048));
    expect(within(facts).getByText(words('pu.files.why', { reason: strings['pu.reason.unconfirmed_at_stop'], n: 2 }))).toBeInTheDocument();
  });

  it('marks the files that may be incomplete as the one warn phrase, and says what that means', async () => {
    const files = heldItem().files!.map((f, i) => (i === 1 ? { ...f, complete: false } : f));
    const { verdict, list } = await openFiles(heldItem({ incomplete_count: 1, files }));
    const mark = verdict.querySelector('[data-verdict-mark]');
    expect(mark?.getAttribute('data-verdict-mark')).toBe('warn');
    expect(mark?.textContent).toBe(words('pu.files.s.mark', { n: 1 }));
    expect(verdict.textContent).toContain(strings['pu.files.s.end']);
    const b = within(list).getByText('docs/b.txt').closest('li')!;
    expect(within(b).getByText(strings['pu.files.pill.incomplete'])).toBeInTheDocument();
    const a = within(list).getByText('docs/a.txt').closest('li')!;
    expect(within(a).queryByText(strings['pu.files.pill.incomplete'])).toBeNull();
  });

  it('a name the page cannot show exactly carries the Name approximate pill and its reason line; size and reason are the row meta', async () => {
    const files = [{ path_b64: 'b2RkAQ', path_display: 'odd?', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true }];
    const { list } = await openFiles(heldItem({ file_count: 1, files }));
    const row = within(list).getByText('odd?').closest('li')!;
    expect(within(row).getByText(strings['pu.files.pill.inexact'])).toBeInTheDocument();
    expect(within(row).getByText(strings['pu.files.inexact'])).toBeInTheDocument();
    expect(within(row).getByText(new RegExp(` · ${strings['pu.reason.unconfirmed_at_stop']}$`))).toBeInTheDocument();
  });
});
