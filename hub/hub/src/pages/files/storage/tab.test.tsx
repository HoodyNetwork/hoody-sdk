// The Storage tab as the user meets it, on real core (fixture transport): the lists, add with secrets that never
// stay (no prefill; cleared on send, close and failure; never in storage or the query cache; a private key masked),
// open as folder, close folder, remove (refused while a folder is open), and C9 for every change (one send; an
// unknown outcome held until a fresh list proves it or a warned Dismiss of the shown hold; never shown as failed;
// another sender's hold read-only).
import { bootFixtureCore, coreSource, heldChanges, queryClient, subjectOf, targetOf, useRunner, type FixtureRequest, type Subject } from '@core';
import kitStrings from '@kit/strings.en.json';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONNECT_LOCK, useConnect, type ConnectVars } from './data';
import { storageRules, type StorageFixture, type StorageOpts } from './fixtures';
import { storageRoutes } from './routes';
import { StorageTab, type StorageComputer } from './StorageTab';
import strings from './strings.en.json';

// Builds a fake credential from parts, so no source line holds a whole key-shaped string.
const fake = (...p: string[]) => p.join('');
/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;
/** A row's ⋯ menu item (the menu opens first). */
async function menuItem(row: HTMLElement, label: string | RegExp) {
  if (screen.queryByRole('menu')) {
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  }
  await userEvent.click(within(row).getByRole('button', { name: kitStrings['table.rowActions'] }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: typeof label === 'string' ? new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : label });
}

/** Picks a storage choice in the open form's searchable list: its name typed, then its option (the list is long). */
async function choose(name: string) {
  const box = within(screen.getByRole('dialog')).getByRole('combobox', { name: new RegExp(strings['f.type']) });
  await userEvent.clear(box);
  await userEvent.type(box, name);
  await userEvent.click(await screen.findByRole('option', { name }));
}
const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as StorageComputer;
const SECRET = 'wJalrXUtnFEMI-K7MDENG-bPxRfiCYEXAMPLEKEY';
const B1 = 'a'.repeat(16);
const M1 = 'mount_' + 'b'.repeat(32);
const seed = (mounted = false): Partial<StorageFixture> => ({
  backends: [{ id: B1, backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:00:00Z', mount_paths: [] }],
  mounts: mounted ? [{ id: M1, backend_id: B1, mount_path: '/mnt/hoody/box', label: 'Backups box', status: 'active' }] : [],
});

/** Add storage once it can be pressed: it waits, off with its reason, until the storage list is read whole. */
async function addButton() {
  // The card's head is drawn again once the lists are read: the button is looked up afresh until it is on.
  return waitFor(() => {
    const b = screen.getByRole('button', { name: strings.add });
    expect(b).not.toHaveAttribute('aria-disabled', 'true');
    return b;
  });
}
function boot(o: StorageOpts = {}) {
  const sent: FixtureRequest[] = [];
  bootFixtureCore({ rules: storageRules({ ...o, onSend: (r) => sent.push(r) }) });
  return sent;
}
const mount = (c: StorageComputer = C, canWrite = true) => render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={c} canWrite={canWrite} /></QueryClientProvider>));
/** The storage table (one row per storage; an open folder is that row's columns). The name is kept for reading. */
const list = (_name?: string) => document.getElementById('storage')!;
const findSec = async () => { await waitFor(() => expect(document.querySelector('#storage [data-row-id]')).not.toBeNull()); return list(); };
/** The row of a storage, or of a folder by its label ("<label> at <path>"). */
const rowOf = (_name: string, text: string) => within(list()).getAllByText((_c, el) => !!el && el.children.length === 0 && (el.textContent === text || (el.textContent ?? '').startsWith(`${text} at `))).map((e) => e.closest<HTMLElement>('[data-row-id]')).find(Boolean)!;
/** True when a control is off (a disabled button or menu item). */
const isOff = (el: HTMLElement) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
/** A row's control: its inline button when drawn, else its ⋯ menu item (Open as folder sits in the menu once a folder is open). */
async function ctl(row: HTMLElement, key: 'row.mount' | 'row.remove' | 'm.unmount' | 'row.test') {
  if (screen.queryByRole('menu')) {
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  }
  const inline = within(row).queryAllByRole('button').find((b) => (b.textContent ?? '').trim() === strings[key]);
  if (inline) return inline;
  return menuItem(row, key === 'row.mount' ? /^Open as folder: / : strings[key]);
}
const dlg = () => screen.getByRole('dialog');
/** The rclone command block in the open dialog (a kit CodeBlock: shell colouring splits its text into tokens). */
const command = () => within(dlg()).getByRole('figure', { name: strings['token.cmdLabel'] });
/** The command exactly as shown (the block's <pre>, without the Copy button's status text). */
const commandText = () => command().querySelector('pre')!.textContent;
/** A private key or token field's own Show/Hide button: the eye beside its text area (every secret field has one). */
const eyeOf = (box: HTMLElement) => within(box.parentElement as HTMLElement).getByRole('button');
/** What a text area holds: hidden, a secret field holds bullets and line ends only. */
const held = (box: HTMLElement) => (box as HTMLTextAreaElement).value;

async function fillS3(secret = SECRET) {
  await userEvent.click(await addButton());
  await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.access_key_id'])), 'AKIDEXAMPLE');
  await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.secret_access_key'])), secret);
}
/** Everything the browser keeps, and everything in the query and mutation caches, as text. */
function kept(): string {
  // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps, to prove no secret is stored
  const ls = Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`).join('\n');
  // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps, to prove no secret is stored
  const ss = Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`).join('\n');
  const q = JSON.stringify(queryClient.getQueryCache().getAll().map((x) => [x.queryKey, x.state.data]));
  const m = JSON.stringify(queryClient.getMutationCache().getAll().map((x) => x.state.variables));
  return [ls, ss, q, m].join('\n');
}
async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps, to prove no secret is stored
  localStorage.clear();
});

describe('storage tab', () => {
  it('lists connected storage and folders, and says in plain words where keys are kept', async () => {
    boot({ seed: seed(true) });
    mount();
    expect(await screen.findByText('deploy on SFTP server')).toBeInTheDocument();
    expect(within(list()).getByText('Backups box at /mnt/hoody/box')).toBeInTheDocument();
    expect(screen.getByText(strings.where)).toBeInTheDocument();
  });

  it('connects once with the keys, then shows the new storage; the form opens again with no key in it', async () => {
    const sent = boot();
    mount();
    await fillS3();
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
    expect(await within(await findSec()).findByText(strings['prov.s3'])).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.path).toBe('/api/v1/backends/s3');
    expect(sent[0]!.body).toEqual({ provider: 'AWS', access_key_id: 'AKIDEXAMPLE', secret_access_key: SECRET });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(await addButton());
    expect(within(dlg()).getByLabelText(new RegExp(strings['f.secret_access_key']))).toHaveValue('');
    expect(kept()).not.toContain(SECRET);
  });

  it('a refused connect clears the keys (the other fields stay to fix) and says it did not go through', async () => {
    const sent = boot({ refuse: true });
    mount();
    await fillS3();
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
    expect(await within(dlg()).findByText(strings['connect.failed'])).toBeInTheDocument();
    expect(within(dlg()).getByLabelText(new RegExp(strings['f.secret_access_key']))).toHaveValue('');
    expect(within(dlg()).getByLabelText(new RegExp(strings['f.access_key_id']))).toHaveValue('AKIDEXAMPLE');
    expect(sent).toHaveLength(1);
  });

  it('closing the form clears what was typed', async () => {
    boot();
    mount();
    await fillS3();
    await userEvent.keyboard('{Escape}');
    const discard = await screen.findByRole('button', { name: /discard/i });
    await userEvent.click(discard);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(await addButton());
    expect(within(dlg()).getByLabelText(new RegExp(strings['f.secret_access_key']))).toHaveValue('');
    expect(within(dlg()).getByLabelText(new RegExp(strings['f.access_key_id']))).toHaveValue('');
  });

  it('a connect whose answer was lost is never failed or resent, keeps no trace of the key, and stays held though the list shows it', async () => {
    const sent = boot({ appliedThenLost: true });
    mount();
    await fillS3();
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
    // A list row cannot say which connect made it (another one of the same kind looks the same): held, not proved.
    expect(await within(dlg()).findByText(strings['held.connect'].replace('{{name}}', strings['prov.s3']))).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await within(await findSec()).findByText(strings['prov.s3'])).toBeInTheDocument();
    expect(screen.getByText(strings['held.connect'].replace('{{name}}', strings['prov.s3']))).toBeInTheDocument();
    expect(screen.queryByText(/didn.t go through|failed/i)).toBeNull();
    // Nothing derived from the key is kept: not the key, not its digest. The send's variables leave the mutation
    // cache once the send settles.
    await waitFor(() => expect(kept()).not.toContain(SECRET));
    expect(kept()).not.toContain(await sha256(SECRET));
    expect(sent).toHaveLength(1);
  });

  it('an unknown connect that nothing proves stays held after the form closes, and only a warned Dismiss frees it', async () => {
    const sent = boot({ pending: true });
    const view = mount();
    await fillS3();
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
    await within(dlg()).findByText(strings['held.connect'].replace('{{name}}', strings['prov.s3']));
    // The kept hold is named by the computer alone: its digest is of {computer}, never of the keys.
    // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps, to prove no secret is stored
    const records = JSON.parse(localStorage.getItem('hub.v3.changes') ?? '[]') as Array<{ id: string; keyBytes?: string }>;
    expect(records).toHaveLength(1);
    expect(records[0]!.id.split('\u0000').pop()).toBe(await sha256(JSON.stringify({ computer: C.id })));
    // No digest of the variables rides with it (they hold the key), and no hash of the key is anywhere kept.
    expect(records[0]).not.toHaveProperty('keyBytes');
    expect(kept()).not.toContain(await sha256(SECRET));
    await waitFor(() => expect(kept()).not.toContain(SECRET));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    view.unmount();
    mount();
    const text = strings['held.connect'].replace('{{name}}', strings['prov.s3']);
    expect(await screen.findByText(text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    expect(screen.getByText(text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['held.dismiss'] }));
    expect(await screen.findByText(strings['held.dismissBodyConnect'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(screen.queryByText(text)).toBeNull());
    expect(sent).toHaveLength(1);
  });

  it('opens storage as a folder under a unique name, once', async () => {
    const sent = boot({ seed: seed() });
    mount();
    await screen.findByText('deploy on SFTP server');
    // Not open yet: Open as folder is the row's one visible button (its name says which storage).
    const open = within(rowOf(strings['backends.title'], 'deploy on SFTP server')).getByRole('button', { name: /^Open as folder: / });
    expect(open).toHaveTextContent(strings['row.mount']);
    await userEvent.click(open);
    const field = within(dlg()).getByLabelText(new RegExp(strings['mount.label']));
    expect(field).toHaveValue('deploy on SFTP server');
    // A name stops at the 64 characters the rule allows: a longer one was an error that spoke only of unique names.
    expect(field).toHaveAttribute('maxlength', '64');
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['mount.go'] }));
    expect(await within(await findSec()).findByText(/^deploy on SFTP server at /)).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatchObject({ backend_id: B1, label: 'deploy on SFTP server' });
    // Its own folder, made once for this press: the name made plain plus a random part.
    expect((sent[0]!.body as { mount_path: string }).mount_path).toMatch(/^deploy-on-sftp-server-[0-9a-f]{16}$/);
  });

  it('a lost mount still opening proves nothing: held', async () => {
    const sent = boot({ seed: seed(), appliedThenLost: true, mountStatus: 'mounting' });
    mount();
    await screen.findByText('deploy on SFTP server');
    await userEvent.click(await ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.mount'));
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['mount.go'] }));
    expect(await within(dlg()).findByText(strings['held.mount'].replace('{{name}}', 'deploy on SFTP server'))).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });

  it('a mount whose answer was lost is proved by the folder name in the fresh list, never resent', async () => {
    const sent = boot({ seed: seed(), appliedThenLost: true });
    mount();
    await screen.findByText('deploy on SFTP server');
    await userEvent.click(await ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.mount'));
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['mount.go'] }));
    expect(await within(await findSec()).findByText(/^deploy on SFTP server at /)).toBeInTheDocument();
    expect(screen.queryByText(strings['held.mount'].replace('{{name}}', 'deploy on SFTP server'))).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('an unknown mount that nothing proves stays held and offers no second send', async () => {
    const sent = boot({ seed: seed(), pending: true });
    mount();
    await screen.findByText('deploy on SFTP server');
    await userEvent.click(await ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.mount'));
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['mount.go'] }));
    const text = strings['held.mount'].replace('{{name}}', 'deploy on SFTP server');
    expect(await within(dlg()).findByText(text)).toBeInTheDocument();
    expect(within(dlg()).queryByRole('button', { name: strings['mount.go'] })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(isOff(await ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.mount'))).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('two entries of the same kind and account are told apart by their ID, in the row and in the Remove question', async () => {
    const B2 = 'f'.repeat(10) + 'b2b2b2';
    boot({ seed: { backends: [...seed().backends!, { id: B2, backend_type: 'sftp', server: 'sftp:generic', user: 'deploy', connected: true, created_at: '2026-10-24T06:01:00Z', mount_paths: [] }], mounts: [] } });
    mount();
    const named = (id: string) => strings['row.nameId'].replace('{{name}}', 'deploy on SFTP server').replace('{{id}}', id);
    await screen.findByText(named('aaaaaa'));
    const rows = [B1, B2].map((id) => list().querySelector<HTMLElement>(`[data-row-id="b:${id}"]`)!);
    expect(within(rows[0]!).getByText(named('aaaaaa'))).toBeInTheDocument();
    expect(within(rows[1]!).getByText(named('b2b2b2'))).toBeInTheDocument();
    await userEvent.click(await ctl(rows[1]!, 'row.remove'));
    expect(await screen.findByRole('heading', { name: /b2b2b2/ })).toBeInTheDocument();
  });

  it('the Dismiss words for a lost connect claim nothing the list or Test cannot prove', () => {
    // A row cannot be tied to this send (another connect makes the same row) and Test checks the details stored now.
    for (const k of ['held.dismissBodyConnect', 'held.dismissBodyToken'] as const) {
      expect(strings[k]).not.toMatch(/(it|this) went through/i);
      expect(strings[k]).toMatch(/can.t tell whether/);
      expect(strings[k]).toMatch(/stays unknown/);
      // Whether connecting again reuses the entry depends on the details (a named account, the refresh token): never promised.
      expect(strings[k]).not.toMatch(/keeps one entry|makes its own entry/);
      expect(strings[k]).toMatch(/may update the existing entry or add another/);
    }
  });

  it('a backend with an open folder cannot be removed, and says to close the folder first', async () => {
    boot({ seed: seed(true) });
    mount();
    await screen.findByText('deploy on SFTP server');
    const row = rowOf(strings['backends.title'], 'deploy on SFTP server');
    expect(isOff(await ctl(row, 'row.remove'))).toBe(true);
    // The reason stands under the item in the menu.
    expect(within(screen.getByRole('menu')).getByText(strings['row.removeBlocked'])).toBeInTheDocument();
  });

  it('closing a folder asks first, naming it, sends once, and the fresh list shows it gone', async () => {
    const sent = boot({ seed: seed(true) });
    mount();
    await within(await findSec()).findByText('Backups box at /mnt/hoody/box');
    await userEvent.click(await ctl(rowOf(strings['backends.title'], 'Backups box'), 'm.unmount'));
    expect(await screen.findByText(strings['unmount.title'].replace('{{name}}', 'Backups box'))).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['unmount.go'] }));
    // The storage stays, no longer open as a folder.
    expect(await within(await findSec()).findByText(strings['row.notMounted'])).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.query).toEqual({ uploads: 'keep' });
    // With its folder closed, the storage can be removed.
    await waitFor(async () => expect(isOff(await ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.remove'))).toBe(false));
  });

  it('an unknown removal is held, never failed; the list cannot prove it while the backend is still listed', async () => {
    const sent = boot({ seed: seed(), pending: true });
    mount();
    await screen.findByText('deploy on SFTP server');
    await userEvent.click(await ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.remove'));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['remove.go'] }));
    const text = strings['held.remove'].replace('{{name}}', 'deploy on SFTP server (ID ends in aaaaaa)');
    expect(await screen.findByText(text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['held.check'] }));
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(isOff(await ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.remove'))).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('the private key is masked until shown, and goes in the body with its line ends as \\n', async () => {
    const sent = boot();
    mount();
    await userEvent.click(await addButton());
    await choose(strings['prov.sftp']);
    await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.host'])), 'files.example.com');
    await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.user'])), 'deploy');
    const key = within(dlg()).getByRole('textbox', { name: strings['f.key_pem'] });
    expect(key).toHaveAttribute('spellcheck', 'false');
    await userEvent.type(key, '-----BEGIN KEY-----{Enter}AAAA{Enter}-----END KEY-----');
    expect(held(key)).not.toContain('AAAA');
    await userEvent.click(eyeOf(key));
    expect(held(key)).toContain('AAAA');
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({ host: 'files.example.com', user: 'deploy', key_pem: '-----BEGIN KEY-----\\nAAAA\\n-----END KEY-----' });
  });

  it('an address with a password in it is refused, with a word on where the password goes', async () => {
    const sent = boot();
    mount();
    await userEvent.click(await addButton());
    await choose(strings['prov.webdav']);
    await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.url'])), fake('https://me:', 'hunter2@dav.example.com/'));
    expect(within(dlg()).getByText(strings['f.address.creds'])).toBeInTheDocument();
    expect(within(dlg()).getByRole('button', { name: strings['connect.go'] })).toBeDisabled();
    expect(sent).toHaveLength(0);
  });

  it("another page's held connect is shown read-only here: Check again, no Dismiss", async () => {
    boot({ pending: true });
    // Another page's change under the same lock (the same computer), sent and left unknown.
    const other = coreSource('storage-other-sender', {
      reads: {},
      changes: { connect: { route: storageRoutes.connect, input: (v: Subject) => ({ target: targetOf(v), params: { type: 's3' }, body: {} }), lock: CONNECT_LOCK, lockKey: (v: Subject) => ({ computer: v.id }), identity: (v: Subject) => ({ computer: v.id, type: 's3', user: '' }), acrossRealms: true } },
    });
    function Other() {
      const m = other.useMutation<unknown, Subject>('connect');
      return <button onClick={() => void m.mutateAsync(subjectOf(C))}>send elsewhere</button>;
    }
    const view = render(<QueryClientProvider client={queryClient}><Other /></QueryClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'send elsewhere' }));
    await waitFor(() => expect(heldChanges(CONNECT_LOCK, { realm: 'all' })).toHaveLength(1));
    view.unmount();
    mount();
    const text = strings['held.connect'].replace('{{name}}', strings['prov.s3']);
    expect(await screen.findByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(strings['held.elsewhere'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['held.check'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
  });

  it('a removal whose fresh read fails sends nothing and says so', async () => {
    let mountsFail = false;
    const sent = boot({ seed: seed(), lists: (which) => (which === 'mounts' && mountsFail ? 'fail' : 'ok') });
    mount();
    await screen.findByText('deploy on SFTP server');
    const row = () => rowOf(strings['backends.title'], 'deploy on SFTP server');
    await waitFor(async () => expect(isOff(await ctl(row(), 'row.remove'))).toBe(false));
    mountsFail = true;
    await userEvent.click(await ctl(row(), 'row.remove'));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['remove.go'] }));
    expect(await screen.findByText(strings['remove.unread'])).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    // The folder list's last read failed: its older copy no longer counts, so Open and Remove wait.
    expect(isOff(await ctl(row(), 'row.mount'))).toBe(true);
    expect(isOff(await ctl(row(), 'row.remove'))).toBe(true);
  });

  it('while a removal reads the lists again, Open and Remove wait', async () => {
    let lists: 'ok' | 'slow' = 'ok';
    const sent = boot({ seed: seed(), lists: () => lists });
    // Its own computer: the reads left waiting here never meet a later test's.
    mount({ ...C, id: 'e'.repeat(24) });
    await screen.findByText('deploy on SFTP server');
    lists = 'slow';
    const row = () => rowOf(strings['backends.title'], 'deploy on SFTP server');
    await userEvent.click(await ctl(row(), 'row.remove'));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['remove.go'] }));
    await waitFor(async () => expect(isOff(await ctl(row(), 'row.mount'))).toBe(true));
    expect(isOff(await ctl(row(), 'row.remove'))).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('removes once, keeping files not uploaded yet, after reading both lists again', async () => {
    const sent = boot({ seed: seed() });
    mount();
    await screen.findByText('deploy on SFTP server');
    const removeButton = () => ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.remove');
    await waitFor(async () => expect(isOff(await removeButton())).toBe(false));
    await userEvent.click(await removeButton());
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['remove.go'] }));
    expect(await screen.findByText(strings['backends.empty'])).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.path).toBe(`/api/v1/backends/${B1}`);
    expect(sent[0]!.query).toEqual({ uploads: 'keep' });
  });

  it('a folder opened elsewhere before the removal re-read stops the removal', async () => {
    let opened = false;
    const sent = boot({
      seed: seed(),
      // Another client opens a folder of it after this page's last read.
      meanwhile: (st) => {
        if (opened && !st.mounts.length) st.mounts.push({ id: M1, backend_id: B1, mount_path: '/mnt/hoody/elsewhere', label: 'Elsewhere', status: 'active' });
      },
    });
    mount();
    await screen.findByText('deploy on SFTP server');
    const removeButton = () => ctl(rowOf(strings['backends.title'], 'deploy on SFTP server'), 'row.remove');
    await waitFor(async () => expect(isOff(await removeButton())).toBe(false));
    opened = true;
    await userEvent.click(await removeButton());
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: strings['remove.go'] }));
    expect(await within(await findSec()).findByText('Elsewhere at /mnt/hoody/elsewhere')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('with the folder list unread, Open and Remove wait', async () => {
    const sent = boot({ seed: seed(), lists: (which) => (which === 'mounts' ? 'fail' : 'ok') });
    mount();
    await waitFor(() => expect(document.getElementById('storage')).not.toBeNull());
    // One table over both lists: with the folder list unread none of its rows is shown as "not open" (that could be
    // false), so the table says it could not be read, and nothing can be opened or removed from it.
    const sec = list();
    expect(await within(sec).findByRole('button', { name: kitStrings['action.retry'] })).toBeInTheDocument();
    expect(sec.querySelector('[data-row-id]')).toBeNull();
    expect(screen.queryByText(strings['row.notMounted'])).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('a hold that comes while keys are typed takes them away: nothing typed waits behind the band', async () => {
    const sent = boot({ pending: true });
    let other: ((v: ConnectVars) => Promise<unknown>) | undefined;
    // Another send for this computer (the same lock, as from another form) goes out while this form has keys in it.
    function Other() {
      const r = useRunner(useConnect(), { lock: CONNECT_LOCK, pick: (i) => i.computer === C.id, vars: (): ConnectVars => ({ ...subjectOf(C), type: 's3', body: {} }) });
      other = r.run;
      return null;
    }
    render(<QueryClientProvider client={queryClient}><Other /></QueryClientProvider>);
    mount();
    await fillS3();
    await act(async () => { void other!({ ...subjectOf(C), type: 's3', body: { access_key_id: 'AKIDOTHER', secret_access_key: 'x' } }); });
    await within(dlg()).findByText(strings['held.connect'].replace('{{name}}', strings['prov.s3']));
    await userEvent.click(within(dlg()).getByRole('button', { name: strings['held.dismiss'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    // The form is back: the access key id (not secret) may stay, the secret key never does.
    const field = await within(dlg()).findByLabelText(new RegExp(strings['f.secret_access_key']));
    expect(field).toHaveValue('');
    expect(sent).toHaveLength(1);
  });

  it('a typed private key is wiped when the page is hidden away', async () => {
    boot();
    mount();
    await userEvent.click(await addButton());
    await choose(strings['prov.sftp']);
    const key = within(dlg()).getByRole('textbox', { name: strings['f.key_pem'] });
    await userEvent.type(key, 'AAAA');
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await waitFor(() => expect(within(dlg()).getByRole('textbox', { name: strings['f.key_pem'] })).toHaveValue(''));
  });

  it('a private key shown, then wiped, is masked again for the next one', async () => {
    boot();
    mount();
    await userEvent.click(await addButton());
    await choose(strings['prov.sftp']);
    const key = () => within(dlg()).getByRole('textbox', { name: strings['f.key_pem'] });
    await userEvent.type(key(), 'AAAA');
    await userEvent.click(eyeOf(key()));
    expect(held(key())).toBe('AAAA');
    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await waitFor(() => expect(key()).toHaveValue(''));
    await userEvent.type(key(), 'BBBB');
    expect(held(key())).not.toContain('BBBB');
  });

  it('a stopped computer reads nothing and offers nothing', async () => {
    const reads: FixtureRequest[] = [];
    const sent = boot({ seed: seed(), onRead: (r) => reads.push(r) });
    mount({ ...C, status: 'stopped' } as StorageComputer);
    expect(await screen.findByText(strings['notRunning.title'])).toBeInTheDocument();
    expect(screen.getByText(strings.notRunning)).toBeInTheDocument();
    // Give any read time to go out before counting.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByRole('button', { name: strings.add })).toBeNull();
    expect(sent).toHaveLength(0);
    expect(reads).toHaveLength(0);
  });

  it("on the computer page a stopped computer offers Start, which is the page's own start (nothing is sent from here)", async () => {
    const sent = boot({ seed: seed() });
    const onStart = vi.fn();
    render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={{ ...C, status: 'stopped' }} canWrite onStart={onStart} /></QueryClientProvider>));
    await userEvent.click(await screen.findByRole('button', { name: strings.start }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
  });

  it("the glance shows the computer's own disk only when the page gives it (usage on), and Can't tell when it cannot say", async () => {
    boot({ seed: seed() });
    const view = (disk?: { used: number; total: number } | null) => render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={C} canWrite {...(disk === undefined ? {} : { disk })} /></QueryClientProvider>));
    const first = view();
    await screen.findByText('deploy on SFTP server');
    expect(screen.queryByText(strings['glance.disk'])).toBeNull();
    first.unmount();
    const second = view({ used: 2 * 1024 ** 3, total: 10 * 1024 ** 3 });
    expect(await screen.findByText(strings['glance.disk'])).toBeInTheDocument();
    expect(screen.getAllByText(strings['glance.disk.n'].replace('{{used}}', '2 GB').replace('{{total}}', '10 GB')).length).toBeGreaterThan(0);
    second.unmount();
    view(null);
    const fact = (await screen.findByText(strings['glance.disk'])).parentElement!;
    expect(within(fact).getByText(strings['glance.cantTell'])).toBeInTheDocument();
  });

  it('without the right to change the computer: Add, Open, Close and Remove are off (the kit DataTable has no inline reason yet); Test still works', async () => {
    boot({ seed: seed(true) });
    mount(C, false);
    await screen.findByText('deploy on SFTP server');
    expect(isOff(screen.getByRole('button', { name: strings.add }))).toBe(true);
    const row = rowOf(strings['backends.title'], 'deploy on SFTP server');
    expect(isOff(await ctl(row, 'row.mount'))).toBe(true);
    expect(isOff(await ctl(rowOf(strings['backends.title'], 'Backups box'), 'm.unmount'))).toBe(true);
    await userEvent.click(await ctl(row, 'row.test'));
    expect(await within(row).findByText(strings['test.pill.connected'])).toBeInTheDocument();
  });

  describe('phase B: pasted rclone tokens', () => {
    const ACCESS = 'ya29.a0AfB_byCexample-ACCESS';
    const REFRESH = '1//0gRfexample-REFRESH';
    const TOKEN = `{"access_token":"${ACCESS}","token_type":"Bearer","refresh_token":"${REFRESH}","expiry":"2026-10-24T10:00:00Z"}`;
    const PRINTED = `Paste the following into your remote machine --->\n${TOKEN}\n<---End paste`;
    const CSECRET = 'GOCSPX-example-client-secret';
    const label = (k: keyof typeof strings) => new RegExp(strings[k].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const tokenBox = () => within(dlg()).getByRole('textbox', { name: new RegExp(`^${strings['f.token']}`) });
    async function pick(type: 'drive' | 'dropbox' | 'onedrive' | 'pcloud' | 'box') {
      await userEvent.click(await addButton());
      await choose(strings[`prov.${type}`]);
    }
    async function pick2(type: 'drive' | 'dropbox' | 'onedrive' | 'pcloud' | 'box') {
      await choose(strings[`prov.${type}`]);
    }
    async function paste(el: HTMLElement, text: string) {
      await userEvent.click(el);
      await userEvent.paste(text);
    }
    async function noTrace() {
      const k = kept();
      for (const x of [TOKEN, ACCESS, REFRESH, CSECRET]) expect(k).not.toContain(x);
      for (const x of [TOKEN, ACCESS, REFRESH, CSECRET]) expect(k).not.toContain(await sha256(x));
    }

    it('says where it is kept without claiming encryption, for every kind of storage', async () => {
      boot();
      mount();
      await screen.findByRole('button', { name: strings.add });
      expect(screen.getByText(strings.where)).toBeInTheDocument();
      expect(strings.where).toMatch(/private file/);
      for (const v of Object.values(strings)) expect(v).not.toMatch(/encrypt/i);
    });

    it('says nothing is sent until Connect for key storages and sign-in storages alike, once', async () => {
      boot();
      mount();
      await userEvent.click(await addButton()); // opens on S3, a key storage
      expect(within(dlg()).getAllByText(strings['connect.nothingSent'])).toHaveLength(1);
      await pick2('drive');
      expect(within(dlg()).getAllByText(strings['connect.nothingSent'])).toHaveLength(1);
    });

    it('Google Drive: short steps with the rclone command and the retiring shared app, a masked token sent once as printed', async () => {
      const sent = boot();
      mount();
      await pick('drive');
      expect(commandText()).toBe('rclone authorize "drive"');
      const written: string[] = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => (written.push(text), Promise.resolve()) } });
      await userEvent.click(within(command()).getByRole('button', { name: kitStrings['code.copy'] }));
      await waitFor(() => expect(written).toEqual(['rclone authorize "drive"']));
      expect(within(command()).getByText('rclone')).toBeInTheDocument(); // coloured as a shell command: its own token
      expect(within(command()).queryByRole('region')).toBeNull(); // wraps rather than scrolling sideways in the drawer
      // The steps: where they happen, then install, run, paste; the fields come after them in the same card.
      const steps = within(dlg()).getByRole('group', { name: strings['token.title'] });
      expect(within(dlg()).getByText(strings['token.where'])).toBeInTheDocument();
      for (const k of ['token.step.install', 'token.step.run', 'token.step.paste'] as const) expect(within(steps).getByText(strings[k])).toBeInTheDocument();
      expect(steps.compareDocumentPosition(tokenBox()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The retiring shared app is the step's warning; the advice to set up an own client ID is in the Why.
      expect(within(dlg()).getByText(strings['token.retiring'])).toBeInTheDocument();
      expect(dlg().querySelector('[data-step="token"]')?.className).toMatch(/tone_warn/);
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['token.ownClient.q'] }));
      expect(dlg().textContent).toContain(`${strings['token.ownClient']} ${strings['token.retiring.fix']}`);
      expect(within(dlg()).getByText(strings['connect.nothingSent'])).toBeInTheDocument();
      const box = tokenBox();
      expect(box).toHaveValue('');
      expect(box).toHaveAttribute('spellcheck', 'false');
      await paste(box, PRINTED);
      expect(held(box)).not.toContain(ACCESS);
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.path).toBe('/api/v1/backends/drive');
      expect(sent[0]!.body).toEqual({ token: TOKEN });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(await within(await findSec()).findByText(strings['prov.drive'])).toBeInTheDocument();
      await waitFor(() => expect(kept()).not.toContain(ACCESS));
      await noTrace();
      await userEvent.click(await addButton());
      await choose(strings['prov.drive']);
      expect(tokenBox()).toHaveValue('');
    });

    it('text that is not rclone token text is refused here, without repeating it, and nothing is sent', async () => {
      const sent = boot();
      mount();
      await pick('dropbox');
      await paste(tokenBox(), 'sl.not-a-token-PASTED-WRONG');
      expect(within(dlg()).getByText(strings['f.token.bad'])).toBeInTheDocument();
      expect(within(dlg()).queryByText(/PASTED-WRONG/, { ignore: 'textarea, script, style' })).toBeNull();
      expect(within(dlg()).getByRole('button', { name: strings['connect.go'] })).toBeDisabled();
      expect(sent).toHaveLength(0);
    });

    it('an own client id goes with its secret; a secret without the id is refused', async () => {
      const sent = boot();
      mount();
      await pick('dropbox');
      await paste(tokenBox(), TOKEN);
      const secret = within(dlg()).getByLabelText(label('f.client_secret'));
      await userEvent.type(secret, CSECRET);
      expect(within(dlg()).getByText(strings['f.client_secret.needs'])).toBeInTheDocument();
      expect(within(dlg()).getByRole('button', { name: strings['connect.go'] })).toBeDisabled();
      await userEvent.type(within(dlg()).getByLabelText(label('f.client_id')), 'my-app-id');
      expect(commandText()).toBe('rclone authorize "dropbox" "my-app-id" "<your client secret>"');
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.body).toEqual({ token: TOKEN, client_id: 'my-app-id', client_secret: CSECRET });
      // The secret is never shown back, not even in the command line it belongs to; once the send settles nothing
      // derived from it is kept (while a send is pending, core's mutation state holds it: a known core gap).
      expect(screen.queryByText(new RegExp(CSECRET))).toBeNull();
      await waitFor(() => expect(kept()).not.toContain(ACCESS));
      await noTrace();
    });

    it('a refused connect clears the token and the client secret, keeps the client id, and says it did not go through', async () => {
      const sent = boot({ refuse: true });
      mount();
      await pick('drive');
      await paste(tokenBox(), TOKEN);
      await userEvent.type(within(dlg()).getByLabelText(label('f.client_id')), 'my-app-id');
      await userEvent.type(within(dlg()).getByLabelText(label('f.client_secret')), CSECRET);
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
      expect(await within(dlg()).findByText(strings['connect.failed'])).toBeInTheDocument();
      expect(tokenBox()).toHaveValue('');
      expect(within(dlg()).getByLabelText(label('f.client_secret'))).toHaveValue('');
      expect(within(dlg()).getByLabelText(label('f.client_id'))).toHaveValue('my-app-id');
      expect(sent).toHaveLength(1);
      await noTrace();
    });

    it('a lost connect stays held, named by the provider, with nothing derived from the token kept', async () => {
      const sent = boot({ pending: true });
      mount();
      await pick('pcloud');
      await paste(tokenBox(), TOKEN);
      await userEvent.type(within(dlg()).getByLabelText(label('f.client_id')), 'my-app-id');
      await userEvent.type(within(dlg()).getByLabelText(label('f.client_secret')), CSECRET);
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
      expect(await within(dlg()).findByText(strings['held.connect'].replace('{{name}}', strings['prov.pcloud']))).toBeInTheDocument();
      expect(screen.queryByText(/didn.t go through|failed/i)).toBeNull();
      // eslint-disable-next-line no-restricted-globals -- the test reads what the browser keeps, to prove no secret is stored
      const records = JSON.parse(localStorage.getItem('hub.v3.changes') ?? '[]') as Array<Record<string, unknown>>;
      expect(records).toHaveLength(1);
      expect(records[0]).not.toHaveProperty('keyBytes');
      await waitFor(() => expect(kept()).not.toContain(ACCESS));
      await noTrace();
      expect(sent).toHaveLength(1);
    });

    it('a pasted token is wiped when the page is hidden away, and masked again once emptied', async () => {
      boot();
      mount();
      await pick('drive');
      await paste(tokenBox(), TOKEN);
      await userEvent.click(eyeOf(tokenBox()));
      expect(held(tokenBox())).toContain(ACCESS);
      await act(async () => { window.dispatchEvent(new Event('pagehide')); });
      await waitFor(() => expect(tokenBox()).toHaveValue(''));
      await paste(tokenBox(), TOKEN);
      expect(held(tokenBox())).not.toContain(ACCESS);
    });

    it('a client ID a shell would act on is refused, and never put into the command', async () => {
      const sent = boot();
      mount();
      await pick('onedrive');
      await pick2('drive');
      await userEvent.type(within(dlg()).getByLabelText(label('f.client_id')), '$(id)');
      expect(within(dlg()).getByText(strings['f.client_id.bad'])).toBeInTheDocument();
      expect(within(dlg()).queryByText(/\$\(id\)/, { ignore: 'input, textarea, script, style' })).toBeNull();
      expect(commandText()).toBe('rclone authorize "drive"');
      expect(sent).toHaveLength(0);
    });

    it('Drive, Dropbox and Box need the client secret with an own client ID', async () => {
      boot();
      mount();
      await pick('box');
      await paste(tokenBox(), TOKEN);
      await userEvent.type(within(dlg()).getByLabelText(label('f.client_id')), 'my-app-id');
      expect(within(dlg()).getByText(strings['f.client_id.needs'])).toBeInTheDocument();
      expect(within(dlg()).getByRole('button', { name: strings['connect.go'] })).toBeDisabled();
    });

    it('while a send is out the secret fields are locked, and a failed send leaves them empty', async () => {
      const sent = boot({ refuse: true, refuseDelayMs: 600 });
      mount();
      await pick('drive');
      await paste(tokenBox(), TOKEN);
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(tokenBox()).toBeDisabled();
      expect(within(dlg()).getByLabelText(label('f.client_secret'))).toBeDisabled();
      expect(await within(dlg()).findByText(strings['connect.failed'])).toBeInTheDocument();
      expect(tokenBox()).toHaveValue('');
      expect(tokenBox()).not.toBeDisabled();
    });

    it('a lost sign-in connect says a new token makes a new entry (two such entries are told apart by their ID)', async () => {
      boot({ appliedThenLost: true });
      mount();
      await pick('drive');
      await paste(tokenBox(), TOKEN);
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
      await within(dlg()).findByText(strings['held.connect'].replace('{{name}}', strings['prov.drive']));
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['held.dismiss'] }));
      expect(await screen.findByText(strings['held.dismissBodyToken'].replace('{{name}}', strings['prov.drive']))).toBeInTheDocument();
      expect(screen.queryByText(strings['held.dismissBodyConnect'])).toBeNull();
      // One entry of its kind needs no ID; two are told apart by it (the two-entries test above).
      expect(rowOf(strings['backends.title'], strings['prov.drive'])).toBeTruthy();
    });

    it('a password typed into an FTP host is refused, with a word on where it goes', async () => {
      const sent = boot();
      mount();
      await userEvent.click(await addButton());
      await choose(strings['prov.ftp']);
      await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.host'])), 'ftp://me:hunter2@files.example.com');
      expect(within(dlg()).getByText(strings['f.address.creds'])).toBeInTheDocument();
      expect(within(dlg()).getByRole('button', { name: strings['connect.go'] })).toBeDisabled();
      expect(sent).toHaveLength(0);
    });

    it('FTP connects with host, port 21 by default, and a password that is cleared', async () => {
      const sent = boot();
      mount();
      await userEvent.click(await addButton());
      await choose(strings['prov.ftp']);
      expect(within(dlg()).getByLabelText(new RegExp(strings['f.port']))).toHaveValue('21');
      await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.host'])), 'ftp.example.com');
      await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.user'])), 'me');
      await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.pass'])), CSECRET);
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.path).toBe('/api/v1/backends/ftp');
      expect(sent[0]!.body).toEqual({ host: 'ftp.example.com', port: 21, user: 'me', pass: CSECRET });
      await waitFor(() => expect(kept()).not.toContain(CSECRET));
    });

    it('OneDrive asks for its drive and says where to find it; Box says it opens as a plain folder only', async () => {
      const sent = boot();
      mount();
      await pick('onedrive');
      // No one command makes OneDrive's token: the steps go through an rclone config, each command a line to copy.
      expect(within(dlg()).getByText(strings['token.od.why'])).toBeInTheDocument();
      const steps = within(dlg()).getByRole('group', { name: strings['token.title'] });
      for (const cmd of ['rclone config', 'rclone config show', 'rclone config delete']) expect(within(steps).getByText(cmd)).toBeInTheDocument();
      for (const k of ['token.od.show.note', 'token.od.delete.note'] as const) expect(within(steps).getByText(strings[k])).toBeInTheDocument();
      expect(within(dlg()).queryByRole('figure', { name: strings['token.cmdLabel'] })).toBeNull();
      await paste(tokenBox(), TOKEN);
      expect(within(dlg()).getByRole('button', { name: strings['connect.go'] })).toBeDisabled();
      await userEvent.type(within(dlg()).getByLabelText(new RegExp(strings['f.drive_id'])), 'b!drive');
      await userEvent.click(within(dlg()).getByRole('button', { name: new RegExp(strings['f.drive_type']) }));
      await userEvent.click(await screen.findByRole('option', { name: 'personal' }));
      await userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.body).toEqual({ token: TOKEN, drive_id: 'b!drive', drive_type: 'personal' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await pick('box');
      expect(within(dlg()).getByText(strings['token.box'])).toBeInTheDocument();
      // The shared-app retirement is Google Drive's: Box and pCloud are not told it.
      expect(within(dlg()).queryByText(strings['token.retiring'])).toBeNull();
      await pick2('pcloud');
      expect(within(dlg()).queryByText(strings['token.retiring'])).toBeNull();
    });
  });
});
