// Every storage type the files program can connect, from one searchable list; the generated forms
// (providers.gen.json) send only what the person set, keep secrets masked, and the S3-compatible services open the S3
// form with their provider (Backblaze B2 its own form; the platform's own storage is not offered).
import { bootFixtureCore, queryClient, type FixtureRequest } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { storageRules, type StorageOpts } from './fixtures';
import { SECRET_KEYS } from './providers';
import { StorageTab, type StorageComputer } from './StorageTab';
import strings from './strings.en.json';
/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as StorageComputer;
const SECRET = 'b2-app-key-K005EXAMPLEEXAMPLEEXAMPLE';

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
const mount = () => render(routed(<QueryClientProvider client={queryClient}><StorageTab computer={C} canWrite /></QueryClientProvider>));
const dlg = () => screen.getByRole('dialog');
const box = () => within(dlg()).getByRole('combobox', { name: new RegExp(strings['f.type']) });
async function open() {
  await userEvent.click(await addButton());
}
/** The first option of that name (a type's own entry comes before its S3-compatible entry). */
async function choose(typed: string, name: string = typed) {
  await userEvent.clear(box());
  await userEvent.type(box(), typed);
  await userEvent.click((await screen.findAllByRole('option', { name }))[0]!);
}
const field = (label: string) => within(dlg()).getByLabelText(new RegExp(`^${label}`));
const send = () => userEvent.click(within(dlg()).getByRole('button', { name: strings['connect.go'] }));

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('storage picker and generated forms', () => {
  it('Backblaze B2 found by name under the S3-compatible services opens the b2 form; its key is masked and sent once', async () => {
    const sent = boot();
    mount();
    await open();
    await userEvent.clear(box());
    await userEvent.type(box(), 'Backblaze');
    const options = await screen.findAllByRole('option', { name: 'Backblaze B2' });
    expect(options.length).toBeGreaterThanOrEqual(1);
    await userEvent.click(options.at(-1)!);
    await userEvent.type(field('Account'), 'acct123');
    const key = field('Key');
    expect(key).toHaveAttribute('type', 'password');
    await userEvent.type(key, SECRET);
    await send();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.path).toBe('/api/v1/backends/b2');
    expect(sent[0]!.body).toEqual({ account: 'acct123', key: SECRET });
  });

  it('an S3-compatible service opens the S3 form with its provider set', async () => {
    const sent = boot();
    mount();
    await open();
    await choose('Hetzner', 'Hetzner Object Storage');
    await userEvent.type(field(strings['f.access_key_id']), 'AKID');
    await userEvent.type(field(strings['f.secret_access_key']), SECRET);
    await send();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.path).toBe('/api/v1/backends/s3');
    expect(sent[0]!.body).toMatchObject({ provider: 'Hetzner', access_key_id: 'AKID' });
  });

  it('the platform\'s own storage is not offered', async () => {
    boot();
    mount();
    await open();
    await userEvent.clear(box());
    await userEvent.type(box(), 'Amazon');
    expect(await screen.findByRole('option', { name: 'Amazon S3' })).toBeInTheDocument();
    await userEvent.clear(box());
    await userEvent.type(box(), 'Hoody');
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Amazon S3' })).toBeNull());
    expect(screen.queryByRole('option', { name: /hoody/i })).toBeNull();
  });

  it('More options stay folded until asked; a switch set against the program\'s default and a whole number are sent typed, a bad number sends nothing', async () => {
    const sent = boot();
    mount();
    await open();
    await choose('Backblaze B2');
    expect(within(dlg()).queryByLabelText(/^Hard delete/)).toBeNull();
    await userEvent.click(within(dlg()).getByRole('button', { name: /^More options \(\d+\)$/ }));
    await userEvent.type(field('Account'), 'acct123');
    await userEvent.type(field('Key'), SECRET);
    await userEvent.click(within(dlg()).getByRole('checkbox', { name: /^Hard delete/ }));
    await userEvent.type(field('Lifecycle'), 'ten');
    expect(within(dlg()).getByText(strings['f.int.bad'])).toBeInTheDocument();
    expect(within(dlg()).getByRole('button', { name: strings['connect.go'] })).toBeDisabled();
    await userEvent.clear(field('Lifecycle'));
    await userEvent.type(field('Lifecycle'), '7');
    await send();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toEqual({ account: 'acct123', key: SECRET, hard_delete: true, lifecycle: 7 });
  });

  it('a value the program takes no other of is sent without being shown', async () => {
    const sent = boot();
    mount();
    await open();
    await choose('Oracle', 'Oracle Cloud Infrastructure Object Storage');
    expect(within(dlg()).queryByLabelText(/^Provider/)).toBeNull();
    await userEvent.type(field('Namespace'), 'ns');
    await userEvent.type(field('Region'), 'eu-frankfurt-1');
    await userEvent.type(field('Compartment'), 'ocid1.compartment');
    await send();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ namespace: 'ns', region: 'eu-frankfurt-1', compartment: 'ocid1.compartment', provider: 'no_auth' });
  });

  it('HTTP headers (they may carry an Authorization or a cookie) are masked, a secret of the connect route, and cleared by a refused connect', async () => {
    const sent = boot({ refuse: true });
    mount();
    await open();
    await choose('HTTP');
    await userEvent.click(within(dlg()).getByRole('button', { name: /^More options \(\d+\)$/ }));
    const headers = field('Headers');
    expect(headers).toHaveAttribute('type', 'password');
    expect(SECRET_KEYS).toContain('headers');
    await userEvent.type(field('URL'), 'https://files.example.com');
    await userEvent.type(headers, 'Authorization,Bearer abc123');
    await send();
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toMatchObject({ url: 'https://files.example.com', headers: 'Authorization,Bearer abc123' });
    await waitFor(() => expect(field('Headers')).toHaveValue(''));
    expect(field('URL')).toHaveValue('https://files.example.com');
  });

  it('an option nobody reviewed as plain (Proton Drive\'s client UID) is masked, a route secret, and cleared by a refused connect', async () => {
    const sent = boot({ refuse: true });
    mount();
    await open();
    await choose('Proton Drive');
    const uid = field('Client uid');
    expect(uid).toHaveAttribute('type', 'password');
    expect(SECRET_KEYS).toContain('client_uid');
    await userEvent.type(field('Username'), 'me@example.com');
    await userEvent.type(field('Password'), 'pw-123456');
    await userEvent.type(uid, 'uid-abc');
    await send();
    await waitFor(() => expect(sent).toHaveLength(1));
    await waitFor(() => expect(field('Client uid')).toHaveValue(''));
    expect(field('Username')).toHaveValue('me@example.com');
  });

  it('Proton Drive\'s 2FA code is masked', async () => {
    boot();
    mount();
    await open();
    await choose('Proton Drive');
    await userEvent.click(within(dlg()).getByRole('button', { name: /^More options \(\d+\)$/ }));
    expect(field('2fa')).toHaveAttribute('type', 'password');
  });

  it('a generated sign-in type shows the rclone command with rclone\'s own type name', async () => {
    boot();
    mount();
    await open();
    await choose('Google Cloud Storage');
    const cmd = within(dlg()).getByRole('figure', { name: strings['token.cmdLabel'] }).querySelector('pre')!.textContent;
    expect(cmd).toBe('rclone authorize "google cloud storage"');
  });
});
