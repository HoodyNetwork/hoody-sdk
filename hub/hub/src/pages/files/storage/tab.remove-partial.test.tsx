// Remove: hoody-files closes a storage's folders one by one, and a folder opened elsewhere
// after the page's own re-read can refuse with 409 MOUNT_PATH_CHANGED or MOUNT_PATH_IN_USE after others were closed
// as well. The storage stays, so the removal is refused (proven); the words say some folders may have
// closed, and both lists are read again.
import { bootFixtureCore, queryClient, type FixtureRequest } from '@core';
import kitStrings from '@kit/strings.en.json';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { storageRules, type StorageFixture, type StorageOpts } from './fixtures';
import { StorageTab, type StorageComputer } from './StorageTab';
import strings from './strings.en.json';

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as StorageComputer;
const B1 = 'a'.repeat(16);
const seed = (): Partial<StorageFixture> => ({
  backends: [{ id: B1, backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: [] }],
  mounts: [],
});
function boot(o: StorageOpts = {}) {
  const sent: FixtureRequest[] = [];
  bootFixtureCore({ rules: storageRules({ ...o, onSend: (r) => sent.push(r) }) });
  return sent;
}
/** The table reads the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;
/** The tab, once the router has drawn it (the card exists from the first draw, in any state). */
async function mount(c: StorageComputer = C) {
  const view = render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={c} canWrite /></QueryClientProvider>));
  await waitFor(() => expect(document.getElementById('storage')).not.toBeNull());
  return view;
}
/** The storage card (one table: a row per storage and the folder it is open as). */
const sec = () => document.getElementById('storage')!;
/** The first table row holding the text. */
const rowOf = (text: string | RegExp) => within(sec()).getAllByText(text).map((e) => e.closest('[data-row-id]')).find(Boolean) as HTMLElement;
/** A row's ⋯ menu item (the menu opens first). */
async function menuItem(row: HTMLElement, label: string) {
  if (screen.queryByRole('menu')) {
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  }
  await userEvent.click(within(row).getByRole('button', { name: kitStrings['table.rowActions'] }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(label) });
}
/** The card's own Check again (a row whose sync is unknown has one too). */
const recheck = () => within(sec()).getAllByRole('button', { name: kitStrings['outcome.pending.check'] }).find((b) => !b.closest('[data-row-id]'))!;
const PARTIAL = /could not be read/;
const STALE = /The newest read failed/;

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- each test starts with nothing held
  localStorage.clear();
});

describe('Remove that closed some folders before a refusal', () => {
  it.each(['MOUNT_PATH_CHANGED', 'MOUNT_PATH_IN_USE'])('409 %s: a refusal of the removal that says some folders may have closed; both lists read again; sent once', async (code) => {
    const sent = boot({ seed: seed(), removeRefused: { code, opened: 2, closed: 1 } });
    await mount();
    await screen.findByText('deploy on SFTP server');
    // The row shows once both lists are read whole, so Remove is on.
    const remove = await menuItem(rowOf('deploy on SFTP server'), strings['row.remove']);
    expect(remove).not.toHaveAttribute('aria-disabled');
    await userEvent.click(remove);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['remove.go'] }));
    // The storage stayed (a proven refusal, never held as unknown), and what may have happened in part is said.
    expect(await screen.findByText(strings['remove.partial'])).toBeInTheDocument();
    expect(screen.queryByText(strings['held.remove'].replace('{{name}}', 'deploy on SFTP server (ID ends in aaaaaa)'))).toBeNull();
    expect(screen.queryByText(strings['remove.done'])).toBeNull();
    // The folder lists were read again: the folder the program could not close shows, the one it closed does not.
    expect(await screen.findByText(/^Opened elsewhere 2 at /)).toBeInTheDocument();
    expect(screen.queryByText(/^Opened elsewhere 1 at /)).toBeNull();
    expect(sent).toHaveLength(1);
  });
  it('another refusal of the removal keeps the plain refusal words', async () => {
    const sent = boot({ seed: seed(), removeRefused: { code: 'BACKEND_IN_USE', opened: 0, closed: 0 } });
    await mount();
    await screen.findByText('deploy on SFTP server');
    // The row shows once both lists are read whole, so Remove is on.
    const remove = await menuItem(rowOf('deploy on SFTP server'), strings['row.remove']);
    expect(remove).not.toHaveAttribute('aria-disabled');
    await userEvent.click(remove);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['remove.go'] }));
    expect((await screen.findByRole('alert')).getAttribute('data-outcome')).toBe('failed');
    expect(screen.queryByText(strings['remove.partial'])).toBeNull();
    expect(sent).toHaveLength(1);
  });
});

describe('a list whose rows could not be read never says it is empty', () => {
  it('every storage row unreadable: no "No storage connected yet", the couldn\'t-read band with Check again, and the rows once readable', async () => {
    let broken = true;
    const good = seed().backends![0]!;
    boot({ seed: { backends: [{ ...good, backend_type: '' }], mounts: [] }, meanwhile: (st) => { if (!broken) st.backends = [good]; } });
    await mount();
    expect(await within(sec()).findByText(PARTIAL)).toBeInTheDocument();
    expect(within(sec()).queryByText(strings['backends.empty'])).toBeNull();
    broken = false;
    await userEvent.click(recheck());
    expect((await within(sec()).findAllByText(/^deploy on SFTP server/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(within(sec()).queryByText(PARTIAL)).toBeNull());
  });
  it('one storage row unreadable beside a good one: the good row shows, with the band', async () => {
    const good = seed().backends![0]!;
    boot({ seed: { backends: [good, { ...good, id: 'b'.repeat(16), backend_type: '' }], mounts: [] } });
    await mount();
    expect((await within(sec()).findAllByText(/^deploy on SFTP server/)).length).toBeGreaterThan(0);
    expect(within(sec()).getByText(PARTIAL)).toBeInTheDocument();
  });
  it('every folder row unreadable: never "Not open as a folder", the band with Check again', async () => {
    let broken = true;
    const row = { id: 'mount_' + 'b'.repeat(32), backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' };
    boot({ seed: { ...seed(), mounts: [{ ...row, id: 'not-a-mount-id', backend_id: 'z'.repeat(16) }] }, meanwhile: (st) => { if (!broken) st.mounts = [row]; } });
    await mount();
    expect(await within(sec()).findByText(PARTIAL)).toBeInTheDocument();
    expect(within(sec()).queryByText(strings['backends.empty'])).toBeNull();
    // The storage's row cannot say it is not open: its folder may be the row the read could not take (the storage list
    // names no folder for it here, and the unreadable row's storage is not one it knows).
    expect(within(rowOf('deploy on SFTP server')).getByText(strings['row.folderUnread'])).toBeInTheDocument();
    expect(within(sec()).queryByText(strings['row.notMounted'])).toBeNull();
    broken = false;
    await userEvent.click(recheck());
    expect(await within(sec()).findByText(/^Backups box at /)).toBeInTheDocument();
    await waitFor(() => expect(within(sec()).queryByText(PARTIAL)).toBeNull());
  });
});

describe('rows and the glance say only what the lists prove', () => {
  it('a folder whose storage is not in a storage list read in part names no storage as gone', async () => {
    const good = seed().backends![0]!;
    const row = { id: 'mount_' + 'b'.repeat(32), backend_id: 'c'.repeat(16), mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' };
    boot({ seed: { backends: [good, { ...good, id: 'b'.repeat(16), backend_type: '' }], mounts: [row] } });
    await mount();
    expect(await within(sec()).findByText(PARTIAL)).toBeInTheDocument();
    expect(within(rowOf(/^Backups box at /)).getByText(strings['row.storageUnread'])).toBeInTheDocument();
    expect(within(sec()).queryByText(strings['pu.noStorage'])).toBeNull();
  });
  it('a failed refresh makes the glance counts unsaid (the table keeps the older rows, marked)', async () => {
    let fail = false;
    boot({ seed: seed(), lists: (w) => (fail && w === 'backends' ? 'fail' : 'ok') });
    await mount();
    const glance = () => document.getElementById('storage-glance')!;
    expect(await within(glance()).findByText(strings['glance.storage.n'].replace('{{count}}', '1'))).toBeInTheDocument();
    fail = true;
    await queryClient.refetchQueries();
    expect(await within(sec()).findByText(STALE)).toBeInTheDocument();
    expect(within(glance()).queryByText(strings['glance.storage.n'].replace('{{count}}', '1'))).toBeNull();
    expect(within(glance()).getAllByText(strings['glance.cantTell']).length).toBeGreaterThan(0);
  });
});

describe('the waiting list and the glance say only what the lists prove', () => {
  const heldOf = (backend: string) => ({
    id: '1'.repeat(32), backend_id: backend, mount_id: 'mount_' + 'b'.repeat(32), state: 'pending', since: 1_793_000_000, file_count: 2, incomplete_count: 0, total_bytes: 2048,
    reasons: { open_when_stopped: 0, unconfirmed_at_stop: 2, metadata_unreadable: 0, upload_failing: 0, stopped_by_request: 0, changed_on_storage: 0, check_failed: 0, cannot_verify: 0 },
    deliverable: true,
    files: [{ path_b64: 'ZG9jcy9hLnR4dA', path: 'docs/a.txt', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true }],
  });
  it('a waiting item whose storage is not in a storage list read in part is not said to be on a storage no longer connected', async () => {
    const good = seed().backends![0]!;
    boot({ seed: { backends: [good, { ...good, id: 'b'.repeat(16), backend_type: '' }], mounts: [], held: [heldOf('b'.repeat(16))] } as Partial<StorageFixture> });
    await mount();
    expect((await screen.findAllByText(strings['row.storageUnread'])).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['pu.noStorage'])).toBeNull();
  });
  it('with the storage list read whole, a waiting item whose storage is gone says so', async () => {
    boot({ seed: { ...seed(), held: [heldOf('b'.repeat(16))] } as Partial<StorageFixture> });
    await mount();
    expect((await screen.findAllByText(strings['pu.noStorage'])).length).toBeGreaterThan(0);
  });
  it('a waiting item whose folder a folder list read in part did not show is not named by its storage alone, row and discard alike', async () => {
    const row = { id: 'mount_' + 'd'.repeat(32), backend_id: B1, mount_path: '/mnt/hoody/other', label: 'Other', status: 'active' };
    boot({ seed: { ...seed(), mounts: [row, { ...row, id: 'not-a-mount-id' }], held: [heldOf(B1)] } as Partial<StorageFixture> });
    await mount();
    const name = strings['pu.folderUnread'].replace('{{storage}}', 'deploy on SFTP server');
    const cell = await screen.findByText(name);
    const item = cell.closest('[data-row-id]') as HTMLElement;
    await userEvent.click(await menuItem(item, strings['pu.discard']));
    expect(within(screen.getByRole('alertdialog')).getByText(strings['pu.discard.title'].replace('{{name}}', name))).toBeInTheDocument();
  });
  it('the glance counts only folders the list says are open (opening, closing and failed ones are not open)', async () => {
    const row = { id: 'mount_' + 'b'.repeat(32), backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' };
    boot({ seed: { ...seed(), mounts: [row, { ...row, id: 'mount_' + 'd'.repeat(32), mount_path: '/mnt/hoody/b2', status: 'mounting' }, { ...row, id: 'mount_' + 'e'.repeat(32), mount_path: '/mnt/hoody/b3', status: 'error' }, { ...row, id: 'mount_' + 'f'.repeat(32), mount_path: '/mnt/hoody/b4', status: 'unmounting' }] } });
    await mount();
    const glance = () => document.getElementById('storage-glance')!;
    expect(await within(glance()).findByText(strings['glance.folders.n'].replace('{{count}}', '1'))).toBeInTheDocument();
  });
});

describe('a list whose fresh read fails keeps the rows read before, marked as such', () => {
  it('storage: the good row stays, the stale band shows, and Add and the row actions wait', async () => {
    let fail = false;
    const good = seed().backends![0]!;
    boot({ seed: { backends: [good, { ...good, id: 'b'.repeat(16), backend_type: '' }], mounts: [] }, lists: (w) => (fail && w === 'backends' ? 'fail' : 'ok') });
    await mount();
    expect(await within(sec()).findByText(PARTIAL)).toBeInTheDocument();
    fail = true;
    await userEvent.click(recheck());
    expect(await within(sec()).findByText(STALE)).toBeInTheDocument();
    expect(await menuItem(rowOf('deploy on SFTP server'), strings['row.remove'])).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(within(sec()).getByRole('button', { name: strings['add'] })).toHaveAttribute('aria-disabled', 'true');
  });
  it('folders: the good row stays, the stale band shows, and Close waits', async () => {
    let fail = false;
    const row = { id: 'mount_' + 'b'.repeat(32), backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' };
    boot({ seed: { ...seed(), mounts: [row, { ...row, id: 'not-a-mount-id' }] }, lists: (w) => (fail && w === 'mounts' ? 'fail' : 'ok') });
    await mount();
    expect(await within(sec()).findByText(PARTIAL)).toBeInTheDocument();
    fail = true;
    await userEvent.click(recheck());
    expect(await within(sec()).findByText(STALE)).toBeInTheDocument();
    expect(await menuItem(rowOf(/^Backups box at /), strings['m.unmount'])).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('a Close confirmation opened before a fresh read fails waits too', () => {
  it('the dialog\'s Close is disabled and sends nothing while the folder list is stale, and sends once after it recovers', async () => {
    let fail = false;
    const row = { id: 'mount_' + 'b'.repeat(32), backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' };
    const sent = boot({ seed: { ...seed(), mounts: [row] }, lists: (w) => (fail && w === 'mounts' ? 'fail' : 'ok') });
    await mount();
    await within(sec()).findByText(/^Backups box at /);
    await userEvent.click(await menuItem(rowOf(/^Backups box at /), strings['m.unmount']));
    const go = () => within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['unmount.go'] });
    expect(go()).toBeEnabled();
    fail = true;
    await queryClient.refetchQueries();
    await waitFor(() => expect(go()).toBeDisabled());
    await userEvent.click(go());
    expect(sent).toHaveLength(0);
    fail = false;
    await queryClient.refetchQueries();
    await waitFor(() => expect(go()).toBeEnabled());
    await userEvent.click(go());
    await waitFor(() => expect(sent).toHaveLength(1));
  });
});
