// Delivery to storage as the user meets it: an open storage folder says whether what was written
// there has reached the storage (synced, syncing, waiting, unknown; never a guess), and what waits on the computer
// (pending uploads) is listed with where it stands. Deliver, stop and discard are each sent once (C9): a lost answer is
// held until a fresh list proves it, and an item gone from the list is never called delivered: it was delivered or
// discarded and the page says it cannot tell which. Held files can be downloaded.
import { bootFixtureCore, queryClient, type FixtureRequest } from '@core';
import kitStrings from '@kit/strings.en.json';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageRules, type HeldFixture, type StorageFixture, type StorageOpts } from './fixtures';
import { StorageTab, SyncWords, type StorageComputer } from './StorageTab';
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
const mountRow = (extra: Record<string, unknown> = {}) => ({ id: M1, backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active', ...idle, ...extra });
const heldItem = (extra: Partial<HeldFixture> = {}): HeldFixture => ({
  id: P1, backend_id: B1, mount_id: M1, state: 'pending', since: 1_700_000_000, file_count: 2, incomplete_count: 0, total_bytes: 2048,
  reasons: { open_when_stopped: 0, unconfirmed_at_stop: 2, metadata_unreadable: 0, upload_failing: 0, stopped_by_request: 0, changed_on_storage: 0, check_failed: 0, cannot_verify: 0 },
  deliverable: true,
  files: [
    { path_b64: 'ZG9jcy9hLnR4dA', path: 'docs/a.txt', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true, bytes: 'AAAA' },
    { path_b64: 'ZG9jcy9iLnR4dA', path: 'docs/b.txt', size: 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true },
  ],
  ...extra,
});

function boot(o: StorageOpts = {}) {
  const sent: FixtureRequest[] = [];
  bootFixtureCore({ rules: storageRules({ ...o, onSend: (r) => sent.push(r) }) });
  return sent;
}
const mount = (c: StorageComputer = C, canWrite = true) => render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={c} canWrite={canWrite} /></QueryClientProvider>));
/** The Waiting to upload table (drawn only while something waits or a send has something to say). */
const heldList = async () => { await waitFor(() => expect(document.getElementById('storage-waiting')).not.toBeNull()); return document.getElementById('storage-waiting')!; };
/** A waiting item's row, by its id. */
const heldRowOf = async (id: string) => { const sec = await heldList(); await waitFor(() => expect(sec.querySelector(`[data-row-id="${id}"]`)).not.toBeNull()); return sec.querySelector<HTMLElement>(`[data-row-id="${id}"]`)!; };
const heldRow = () => heldRowOf(P1);
/** A storage row by its open folder ("<label> at <path>"). */
const folderRow = async (label: string) => (await screen.findAllByText(`${label} at /mnt/hoody/box`)).map((e) => e.closest<HTMLElement>('#storage [data-row-id]')).find(Boolean)!;
/** The glance's Waiting to upload fact says nothing waits. */
const nothingWaits = async () => { await screen.findByText(strings['glance.nothing']); expect(document.getElementById('storage-waiting')).toBeNull(); };
const deliverName = (name = 'Backups box') => words('pu.deliverName', { name });
const words = (key: keyof typeof strings, vars: Record<string, string | number> = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), strings[key]);

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- holds live in localStorage; each test starts clean
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('storage delivery', () => {
  it('an open folder says in a word or two whether what was written there reached the storage (the row names it)', async () => {
    boot({ seed: { backends, mounts: [
      mountRow(),
      mountRow({ id: 'mount_' + 'c'.repeat(32), label: 'Photos', uploads: { state: 'busy', dirty: 3, open_handles: 0 } }),
      mountRow({ id: 'mount_' + 'd'.repeat(32), label: 'Docs', pending_uploads: { count: 1, bytes: 5 } }),
      mountRow({ id: 'mount_' + 'e'.repeat(32), label: 'Music', uploads: { state: 'unknown', dirty: null, open_handles: null } }),
    ] } });
    mount();
    const rows = { 'Backups box': await folderRow('Backups box'), Photos: await folderRow('Photos'), Docs: await folderRow('Docs'), Music: await folderRow('Music') };
    const row = (label: keyof typeof rows) => rows[label];
    expect(within(row('Backups box')).getByText(strings['sync.synced'])).toBeInTheDocument();
    expect(within(row('Photos')).getByText(strings['sync.syncing'])).toBeInTheDocument();
    expect(within(row('Docs')).getByText(strings['sync.waiting'])).toBeInTheDocument();
    expect(within(row('Music')).getByText(strings['sync.unknown'])).toBeInTheDocument();
  });

  it('a folder still opening behind a waiting delivery says it opens after that delivery, not a sync state', async () => {
    boot({ seed: { backends, mounts: [mountRow({ status: 'mounting', delivery: { pending_upload_id: P1 } })], held: [heldItem()] } });
    mount();
    const row = await folderRow('Backups box');
    expect(within(row).getByText(strings['sync.opening'])).toBeInTheDocument();
    expect(within(row).queryByText(strings['sync.waiting'])).toBeNull();
  });

  it('a mount whose program sends no delivery fields says the sync state is unknown, never synced', async () => {
    boot({ seed: { backends, mounts: [{ id: M1, backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' }] } });
    mount();
    expect(within(await folderRow('Backups box')).getByText(strings['sync.unknown'])).toBeInTheDocument();
    expect(screen.queryByText(strings['sync.synced'])).toBeNull();
  });

  it('lists what waits on the computer, named by its folder, with where each stands and only the actions it allows', async () => {
    boot({ seed: { backends, mounts: [mountRow()], held: [
      heldItem(),
      heldItem({ id: '2'.repeat(32), mount_id: undefined, backend_id: undefined, state: 'uploading', deliverable: false }),
      heldItem({ id: '3'.repeat(32), mount_id: undefined, state: 'delivering', deliverable: false }),
    ] } });
    mount();
    const list = await heldList();
    await waitFor(() => expect(list.querySelectorAll('[data-row-id]')).toHaveLength(3));
    const held = await heldRowOf(P1);
    const uploading = await heldRowOf('2'.repeat(32));
    const delivering = await heldRowOf('3'.repeat(32));
    expect(within(held).getByText('Backups box')).toBeInTheDocument();
    expect(within(held).getByText(strings['pu.pill.pending'])).toBeInTheDocument();
    expect(within(held).getByRole('button', { name: deliverName() })).toBeEnabled();
    for (const k of ['pu.files', 'pu.discard'] as const) expect(await menuItem(held, strings[k])).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(within(held).getByRole('button', { name: kitStrings['table.rowActions'] }));
    expect(within(await screen.findByRole('menu')).queryByRole('menuitem', { name: strings['pu.stop'] })).toBeNull();
    await userEvent.keyboard('{Escape}');
    // No folder or storage left to name it by: said so, never an id.
    expect(within(uploading).getByText(strings['pu.noStorage'])).toBeInTheDocument();
    expect(within(uploading).getByText(strings['pu.pill.uploading'])).toBeInTheDocument();
    expect(within(uploading).queryByRole('button', { name: /^Deliver/ })).toBeNull();
    expect(await menuItem(uploading, strings['pu.stop'])).not.toHaveAttribute('aria-disabled', 'true');
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: strings['pu.discard'] })).toBeNull();
    await userEvent.keyboard('{Escape}');
    // Named by its storage when its folder is gone.
    expect(within(delivering).getByText('deploy on SFTP server')).toBeInTheDocument();
    expect(within(delivering).getByText(strings['pu.pill.delivering'])).toBeInTheDocument();
    expect(await menuItem(delivering, strings['pu.stop'])).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('nothing waiting: the glance says Nothing and no empty card is drawn; a list that cannot be read says so with Try again', async () => {
    boot({ seed: { backends, mounts: [mountRow()] } });
    mount();
    await nothingWaits();
    cleanup();
    queryClient.clear();
    boot({ seed: { backends, mounts: [mountRow()] }, lists: (w) => (w === 'held' ? 'fail' : 'ok') });
    mount();
    const sec = await heldList();
    expect(await within(sec).findByRole('button', { name: kitStrings['action.retry'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['glance.nothing'])).toBeNull();
  });

  it('deliver asks first, saying it replaces newer copies; sends once with no body; the fresh list shows it being delivered', async () => {
    const sent = boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] } });
    mount();
    await userEvent.click(within(await heldRow()).getByRole('button', { name: deliverName() }));
    const ask = screen.getByRole('alertdialog');
    expect(within(ask).getByText(strings['pu.deliver.body'])).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: strings['pu.deliver.go'] }));
    await waitFor(async () => expect(within(await heldRow()).getByText(strings['pu.pill.delivering'])).toBeInTheDocument());
    expect(sent).toHaveLength(1);
    expect(sent[0]!.path).toBe(`/api/v1/pending-uploads/${P1}/deliver`);
    expect(sent[0]!.body ?? undefined).toBeUndefined();
  });

  it('a lost deliver is held, never failed or resent; a fresh list showing it being delivered proves it', async () => {
    const sent = boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] }, appliedThenLost: true });
    mount();
    await userEvent.click(within(await heldRow()).getByRole('button', { name: deliverName() }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['pu.deliver.go'] }));
    // Applied and lost: the fresh list shows it being delivered, which proves it (no band left).
    await waitFor(async () => expect(within(await heldRow()).getByText(strings['pu.pill.delivering'])).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(words('pu.held.deliver', { name: 'Backups box' }))).toBeNull());
    expect(screen.queryByText(/failed|did not go through/i)).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('a lost deliver that nothing proves stays held, and its row offers no second send', async () => {
    const sent = boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] }, pending: true });
    mount();
    await userEvent.click(within(await heldRow()).getByRole('button', { name: deliverName() }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['pu.deliver.go'] }));
    const text = words('pu.held.deliver', { name: 'Backups box' });
    expect(await screen.findByText(text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    expect(screen.getByText(text)).toBeInTheDocument();
    // Soft-disabled with its reason (the kit's disabled row action): focusable, says why.
    expect(within(await heldRow()).getByRole('button', { name: deliverName() })).toHaveAttribute('aria-disabled', 'true');
    // The visible word is only "Deliver": its one tip says the whole action and why it waits.
    expect(within(await heldRow()).getByRole('button', { name: deliverName() })).toHaveAccessibleDescription(`${deliverName()}. ${strings['why.busy']}`);
    expect(await menuItem(await heldRow(), strings['pu.discard'])).toHaveAttribute('aria-disabled', 'true');
    expect(sent).toHaveLength(1);
  });

  it('an item gone from the list after a lost deliver is never called delivered: no longer held, look in the storage', async () => {
    let gone = false;
    boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] }, pending: true, meanwhile: (st) => { if (gone) st.held = []; } });
    mount();
    await userEvent.click(within(await heldRow()).getByRole('button', { name: deliverName() }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['pu.deliver.go'] }));
    await screen.findByText(words('pu.held.deliver', { name: 'Backups box' }));
    gone = true;
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    expect(await screen.findByText(words('pu.gone', { storage: 'deploy on SFTP server' }))).toBeInTheDocument();
    expect(screen.queryByText(strings['pu.deliver.done'])).toBeNull();
    expect(screen.queryByText(/delivered/i)).toBeNull();
    // Only the sender's Dismiss frees it.
    expect(screen.getByRole('button', { name: strings['held.dismiss'] })).toBeInTheDocument();
  });

  it('stop holds an uploading item; a lost stop is proved by the item held in a fresh list', async () => {
    const sent = boot({ seed: { backends, mounts: [mountRow()], held: [heldItem({ state: 'uploading', deliverable: false })] }, appliedThenLost: true });
    mount();
    await userEvent.click(await menuItem(await heldRow(), strings['pu.stop']));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['pu.stop.go'] }));
    await waitFor(async () => expect(within(await heldRow()).getByText(strings['pu.pill.pending'])).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(words('pu.held.stop', { name: 'Backups box' }))).toBeNull());
    expect(sent).toHaveLength(1);
  });

  it('a stop answered busy while its cancel goes on is held, never failed, and offers no second Stop until a fresh list shows it held', async () => {
    let settled = false;
    const sent = boot({ seed: { backends, mounts: [mountRow()], held: [heldItem({ state: 'delivering', deliverable: false })] }, stopUnconfirmed: true, meanwhile: (st) => { if (settled) st.held = st.held.map((h) => ({ ...h, state: 'pending', deliverable: true })); } });
    mount();
    await userEvent.click(await menuItem(await heldRow(), strings['pu.stop']));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['pu.stop.go'] }));
    const text = words('pu.held.stop', { name: 'Backups box' });
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/failed|did not go through/i)).toBeNull();
    expect(await menuItem(await heldRow(), strings['pu.stop'])).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    settled = true;
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(screen.queryByText(text)).toBeNull());
    expect(sent).toHaveLength(1);
  });

  it('discard needs the folder name typed, says the files are deleted for good, and sends once', async () => {
    const sent = boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] } });
    mount();
    await userEvent.click(await menuItem(await heldRow(), strings['pu.discard']));
    const ask = screen.getByRole('alertdialog');
    expect(within(ask).getByText(strings['pu.discard.c2'])).toBeInTheDocument();
    const go = within(ask).getByRole('button', { name: strings['pu.discard.go'] });
    expect(go).toBeDisabled();
    await userEvent.type(within(ask).getByRole('textbox'), 'Backups box');
    await userEvent.click(go);
    // The table is empty now; the card stays while its outcome has something to say.
    expect(await screen.findByText(strings['pu.empty'])).toBeInTheDocument();
    // Its own 204 seen: discarded.
    expect(screen.getByText(strings['pu.discard.done'])).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.method).toBe('DELETE');
  });

  it('a lost discard is never proved by the list: the item gone reads no longer held (never discarded), held until its sender dismisses it', async () => {
    const sent = boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] }, appliedThenLost: true });
    mount();
    await userEvent.click(await menuItem(await heldRow(), strings['pu.discard']));
    const ask = screen.getByRole('alertdialog');
    await userEvent.type(within(ask).getByRole('textbox'), 'Backups box');
    await userEvent.click(within(ask).getByRole('button', { name: strings['pu.discard.go'] }));
    expect(await screen.findByText(strings['pu.empty'])).toBeInTheDocument();
    expect(await screen.findByText(words('pu.gone', { storage: 'deploy on SFTP server' }))).toBeInTheDocument();
    expect(screen.queryByText(strings['pu.discard.done'])).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings['held.dismiss'] }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(screen.queryByText(words('pu.gone', { storage: 'deploy on SFTP server' }))).toBeNull());
    expect(sent).toHaveLength(1);
  });

  it('incomplete files: the row says they can only be downloaded or discarded; an item that cannot be delivered offers no Deliver', async () => {
    boot({ seed: { backends, mounts: [mountRow()], held: [heldItem({ incomplete_count: 1, deliverable: false })] } });
    mount();
    const row = await heldRow();
    expect(within(row).getByText(words('pu.incomplete', { n: 1 }), { exact: false })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^Deliver/ })).toBeNull();
  });

  it('shows the held files and downloads one by its path bytes, saved as a file', async () => {
    const reads: FixtureRequest[] = [];
    boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] }, onRead: (r) => reads.push(r) });
    const made = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:held');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    mount();
    await userEvent.click(await menuItem(await heldRow(), strings['pu.files']));
    const files = await screen.findByRole('list', { name: words('pu.files.title', { name: 'Backups box' }) });
    const a = within(files).getByText('docs/a.txt').closest('li')!;
    await userEvent.click(within(a).getByRole('button', { name: strings['pu.files.download'] }));
    await waitFor(() => expect(made).toHaveBeenCalled());
    const fileRead = reads.find((r) => r.path.endsWith('/file'));
    expect(fileRead?.query).toEqual({ path_b64: 'ZG9jcy9hLnR4dA' });
  });

  it('a held file too large to hold in the browser is not fetched: the row says so', async () => {
    const reads: FixtureRequest[] = [];
    const big = heldItem({ files: [{ path_b64: 'YmlnLmlzbw', path: 'big.iso', size: 300 * 1024 * 1024, modified_at: 1, reason: 'unconfirmed_at_stop', complete: true }] });
    boot({ seed: { backends, mounts: [mountRow()], held: [big] }, onRead: (r) => reads.push(r) });
    const made = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:held');
    mount();
    await userEvent.click(await menuItem(await heldRow(), strings['pu.files']));
    const files = await screen.findByRole('list', { name: words('pu.files.title', { name: 'Backups box' }) });
    const row = within(files).getByText('big.iso').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: strings['pu.files.download'] }));
    expect(await within(row).findByText(strings['pu.files.tooBig'])).toBeInTheDocument();
    expect(reads.some((r) => r.path.endsWith('/file'))).toBe(false);
    expect(made).not.toHaveBeenCalled();
  });

  it('after a folder is closed, the files it kept show as waiting (the list is read again)', async () => {
    let closed = false;
    boot({ seed: { backends, mounts: [mountRow()] }, meanwhile: (st) => { if (closed && !st.held.length && !st.mounts.length) st.held.push(heldItem({ mount_id: undefined })); } });
    mount();
    await nothingWaits();
    await userEvent.click(await menuItem(await folderRow('Backups box'), strings['m.unmount']));
    closed = true;
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['unmount.go'] }));
    expect(await within(await heldRow()).findByText('deploy on SFTP server')).toBeInTheDocument();
  });

  it('without the right to change the computer: files can be looked at and downloaded, nothing delivered, stopped or discarded', async () => {
    boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] } });
    mount(C, false);
    const row = await heldRow();
    // Shown, each off (Stop is not offered for an item already held); the inline Deliver says why.
    expect(within(row).getByRole('button', { name: deliverName() })).toHaveAttribute('aria-disabled', 'true');
    expect(within(row).getByRole('button', { name: deliverName() })).toHaveAccessibleDescription(`${deliverName()}. ${strings['noWrite']}`);
    expect(await menuItem(row, strings['pu.files'])).not.toHaveAttribute('aria-disabled', 'true');
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pu.discard']) })).toHaveAttribute('aria-disabled', 'true');
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: new RegExp(strings['pu.stop']) })).toBeNull();
  });

  it("a file's sync state in plain words (Files shows them beside the file)", () => {
    const say = (state: Parameters<typeof SyncWords>[0]['state']) => { const { container, unmount } = render(<SyncWords state={state} storage="Backups box" />); const text = container.textContent; unmount(); return text; };
    expect(say('sent')).toBe('Sent to the computer, syncing to Backups box');
    expect(say('syncing')).toBe('Syncing to Backups box…');
    expect(say('synced')).toBe('Synced to Backups box');
    expect(say('held')).toBe('Not synced: held on the computer');
    expect(say('unknown')).toBe('Sync state unknown');
  });

  it('a pending-upload list with a row it cannot read never says nothing is waiting: it says the list may be missing items', async () => {
    boot({ seed: { backends, mounts: [mountRow()], held: [heldItem({ file_count: '1' as never })] } });
    mount();
    const sec = await heldList();
    expect(await within(sec).findByRole('button', { name: kitStrings['outcome.pending.check'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['pu.empty'])).toBeNull();
    expect(screen.queryByText(strings['glance.nothing'])).toBeNull();
  });

  it('a files page with a row it cannot read says so, never "no files", and keeps More files when the program says more follow', async () => {
    const bad = { path_b64: 'eA', path: 'x', size: 'big' as never, modified_at: 1, reason: 'cannot_verify', complete: true };
    const files = Array.from({ length: 3 }, () => ({ ...bad }));
    boot({ seed: { backends, mounts: [mountRow()], held: [heldItem({ files })] } });
    mount();
    await userEvent.click(await menuItem(await heldRow(), strings['pu.files']));
    const list = await screen.findByRole('list', { name: words('pu.files.title', { name: 'Backups box' }) });
    expect(await within(list).findByText(strings['pu.files.partial'])).toBeInTheDocument();
    expect(within(list).queryByText(strings['pu.files.empty'])).toBeNull();
  });

  it('a folder whose sync state is unknown offers Check again, which reads the folder list again (nothing is sent)', async () => {
    let known = false;
    const sent = boot({ seed: { backends, mounts: [mountRow({ uploads: { state: 'unknown', dirty: null, open_handles: null } })] }, meanwhile: (st) => { if (known) st.mounts = st.mounts.map((m) => ({ ...m, ...idle })); } });
    mount();
    const row = await folderRow('Backups box');
    expect(within(row).getByText(strings['sync.unknown'])).toBeInTheDocument();
    known = true;
    await userEvent.click(within(row).getByRole('button', { name: strings['held.check'] }));
    expect(await within(await folderRow('Backups box')).findByText(strings['sync.synced'])).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('a folder still syncing is read again on its own until it is synced (the words never stay on an old read)', async () => {
    let done = false;
    boot({ seed: { backends, mounts: [mountRow({ uploads: { state: 'busy', dirty: 2, open_handles: 0 } })] }, meanwhile: (st) => { if (done) st.mounts = st.mounts.map((m) => ({ ...m, ...idle })); } });
    mount();
    const row = await folderRow('Backups box');
    expect(within(row).getByText(strings['sync.syncing'])).toBeInTheDocument();
    done = true;
    expect(await within(document.getElementById('storage')!).findByText(strings['sync.synced'], {}, { timeout: 9_000 })).toBeInTheDocument();
  }, 15_000);

  it('files held for a person do not make the page read every few seconds: only the 30 s read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      let reads = 0;
      boot({ seed: { backends, mounts: [mountRow({ pending_uploads: { count: 2, bytes: 10 } })], held: [heldItem()] }, onRead: (r) => { if (r.path === '/api/v1/mounts') reads++; } });
      mount();
      await folderRow('Backups box');
      await waitFor(() => expect(reads).toBe(1));
      act(() => { vi.advanceTimersByTime(20_000); });
      await new Promise((r) => setTimeout(r, 50));
      expect(reads).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an upload that starts waiting meanwhile shows up on the 30 s read, with nothing moving', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      let later = false;
      boot({ seed: { backends, mounts: [mountRow()], held: [] }, meanwhile: (st) => { if (later && st.held.length === 0) { st.held = [heldItem()]; st.mounts = st.mounts.map((m) => ({ ...m, pending_uploads: { count: 2, bytes: 2048 } })); } } });
      mount();
      await nothingWaits();
      later = true;
      act(() => { vi.advanceTimersByTime(31_000); });
      expect(await heldRow()).toBeInTheDocument();
      expect(screen.queryByText(strings['glance.nothing'])).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('folder sync words read long ago say when they were checked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      boot({ seed: { backends, mounts: [mountRow()] }, mountsSlowMs: 600_000 });
      mount();
      expect(await within(await folderRow('Backups box')).findByText(strings['sync.synced'])).toBeInTheDocument();
      expect(screen.queryByText(/^Last checked/)).toBeNull();
      act(() => { vi.advanceTimersByTime(120_000); });
      expect(await screen.findByText(words('mounts.checked', { time: '2 minutes ago' }))).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the tab clock moves every 15 s: a read just past 90 s old shows its time at the next 15 s tick, not before', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      boot({ seed: { backends, mounts: [mountRow()] }, mountsSlowMs: 600_000 });
      mount();
      expect(await within(await folderRow('Backups box')).findByText(strings['sync.synced'])).toBeInTheDocument();
      // The faked clock stands still until advanced (real time under load must not move it), so the read and the tab clock share one
      // start: at the 90 s tick the read is exactly 90 s old, not past STALE_MS, and the 105 s tick is the first past it.
      act(() => { vi.advanceTimersByTime(104_000); });
      expect(screen.queryByText(/^Last checked/)).toBeNull();
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(await screen.findByText(/^Last checked/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a stopped computer reads nothing waiting', async () => {
    const reads: FixtureRequest[] = [];
    boot({ seed: { backends, mounts: [mountRow()], held: [heldItem()] }, onRead: (r) => reads.push(r) });
    mount({ ...C, status: 'stopped' });
    await screen.findByText(strings['notRunning.title']);
    expect(reads).toHaveLength(0);
  });
});
