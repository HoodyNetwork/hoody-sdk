// Download folders as the user meets it: the up-front count decides what each folder offers (a download link built
// from the computer's files-program address, subfolders in the row's ⋯ menu when it is too big, or the link with an
// honest note when the count cannot say), the started mark never claims an end, and the picker (the Add folder drawer)
// reads folders one level at a time.
import { answers, bootFixtureCore, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Computer } from '../types';
import { programUrl } from '../urls';
import { countRoute, folderRoute, rootRoute } from './files';
import { ZipBackup } from './ZipBackup';
import strings from './strings.en.json';

/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;

const C = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24), server_name: 'n12' } as Computer;

/** Per folder path: 'fits' | 'over' | 'fail' (default fits). Folder listings from `tree`. */
/** `seen`: the folders whose size was asked; `listed`: the folders whose subfolders were read (the picker). */
/** `raw`: the folder listings' request paths as sent (encoding included). */
function rules(counts: Record<string, 'fits' | 'over' | 'fail'> = {}, tree: Record<string, string[]> = {}, seen: string[] = [], listed: string[] = [], raw: string[] = []): FixtureRule[] {
  const pathOf = (r: FixtureRequest, skip: number) => '/' + r.path.split('?')[0]!.split('/').slice(skip).map(decodeURIComponent).join('/');
  return [
    reply(countRoute, (r: FixtureRequest) => {
      const p = pathOf(r, 5);
      seen.push(p);
      const k = counts[p] ?? 'fits';
      if (k === 'fail') return answers.refused(429, 'TOO_MANY');
      return answers.ok(k === 'fits' ? { total_scanned: 40, truncated: false, entries: [], count: 0 } : { total_scanned: 100_001, truncated: true, entries: [], count: 0 });
    }),
    reply(rootRoute, () => (listed.push('/'), answers.ok({ breadcrumb: '', paths: (tree['/'] ?? []).map((name) => ({ path_type: 'Dir', name, mtime: 0, size: 0 })), allow_upload: false, allow_delete: false }))),
    reply(folderRoute, (r: FixtureRequest) => {
      const p = pathOf(r, 4);
      listed.push(p);
      raw.push(r.path.split('?')[0]!);
      return answers.ok({ path: p, count: 0, entries: (tree[p] ?? []).map((name) => ({ name, is_dir: true, size: 0 })) });
    }),
  ];
}

const mount = (c: Computer = C) => render(routed(<QueryClientProvider client={queryClient}><ZipBackup computer={c} /></QueryClientProvider>));
const row = (path: string) => {
  const el = document.querySelector<HTMLElement>(`[data-row-id="${path}"]`);
  if (!el) throw new Error(`no row ${path}`);
  return el;
};
/** A row once the table has drawn it. */
const findRow = async (path: string) => { await waitFor(() => row(path)); return row(path); };
const go = (path: string) => ({ name: `Download ${path} as .zip` });
/** The row's ⋯ menu, opened: its items. */
async function menuOf(path: string) {
  await userEvent.click(within(row(path)).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menu');
}
/** Opens the Add folder drawer from the card head. */
async function openAdd() {
  await userEvent.click(await screen.findByRole('button', { name: strings['zip.add'] }));
  return screen.findByRole('dialog');
}
/** Opens the drawer and its picker (Browse folders): only then are folders read. */
async function openPicker() {
  const d = await openAdd();
  await userEvent.click(within(d).getByRole('button', { name: strings['pick.open'] }));
  return d;
}
/** Types a folder into the drawer and adds it. */
async function typeFolder(path: string) {
  const d = await openAdd();
  await userEvent.type(within(d).getByRole('textbox', { name: strings['zip.field'] }), path);
  await userEvent.click(within(d).getByRole('button', { name: strings['zip.add'] }));
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('files as .zip', () => {
  it('a folder under the count gets a download link from the files-program address, with no token in it', async () => {
    bootFixtureCore({ rules: rules() });
    mount();
    const link = await within(await findRow('/root')).findByRole('link', go('/root'));
    const base = programUrl(C, 'files').replace(/\/+$/, '');
    expect(link).toHaveAttribute('href', base + '/api/v1/files/root?zip');
    expect(new URL(link.getAttribute('href')!).search).toBe('?zip');
    // An estimate, never a proof: the card's description keeps the browser's progress and failure in view.
    expect(screen.getByText(strings['zip.lede'].replace('{{name}}', 'atlas'))).toBeInTheDocument();
    expect(within(row('/root')).getByText(strings['zip.under'])).toBeInTheDocument();
    expect(within(await menuOf('/root')).queryByRole('menuitem', { name: new RegExp(strings['zip.subfolders']) })).toBeNull();
  });

  it('a folder over the count says it may be too big, keeps the download (only the archive knows), and offers its subfolders', async () => {
    bootFixtureCore({ rules: rules({ '/home': 'over' }, { '/home': ['amy', 'bob'] }) });
    mount();
    expect(await within(await findRow('/home')).findByText(strings['zip.over'])).toBeInTheDocument();
    expect(within(row('/home')).getByRole('link', go('/home'))).toBeInTheDocument();
    await userEvent.click(within(await menuOf('/home')).getByRole('menuitem', { name: new RegExp(strings['zip.subfolders']) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add amy to the list' }));
    await userEvent.keyboard('{Escape}');
    expect(await within(await findRow('/home/amy')).findByRole('link', go('/home/amy'))).toBeInTheDocument();
  });

  // Core writes a first part the files program would read as a command (stat, grep, glob, realpath, its
  // health check ...) with its first letter as %XX on every request (core/files-path.ts), so such a top folder is
  // listed like any other: its subfolders are offered, and the picker opens it.
  it('an oversized top folder named like a files-program command offers its subfolders, read with its first letter encoded', async () => {
    const listed: string[] = [], raw: string[] = [];
    bootFixtureCore({ rules: rules({ '/stat': 'over', '/health': 'over' }, { '/stat': ['logs'], '/health': ['probe'] }, [], listed, raw) });
    mount();
    await typeFolder('/stat');
    expect(await within(await findRow('/stat')).findByText(strings['zip.over'])).toBeInTheDocument();
    expect(within(row('/stat')).getByRole('link', go('/stat'))).toHaveAttribute('href', expect.stringContaining('/api/v1/files/%73tat?zip'));
    await userEvent.click(within(await menuOf('/stat')).getByRole('menuitem', { name: new RegExp(strings['zip.subfolders']) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add logs to the list' }));
    await userEvent.keyboard('{Escape}');
    expect(await within(await findRow('/stat/logs')).findByRole('link', go('/stat/logs'))).toHaveAttribute('href', expect.stringContaining('/api/v1/files/%73tat/logs?zip'));
    expect(raw).toContain('/api/v1/files/%73tat');
    expect(listed).toContain('/stat');
    await typeFolder('/health');
    expect(await within(await findRow('/health')).findByText(strings['zip.over'])).toBeInTheDocument();
    await userEvent.click(within(await menuOf('/health')).getByRole('menuitem', { name: new RegExp(strings['zip.subfolders']) }));
    expect(await screen.findByRole('button', { name: 'Add probe to the list' })).toBeInTheDocument();
    expect(raw).toContain('/api/v1/files/%68ealth');
  });

  it('the picker opens a top folder named like a files-program command (read with its first letter encoded)', async () => {
    const raw: string[] = [];
    bootFixtureCore({ rules: rules({}, { '/': ['glob', 'home'], '/glob': ['deep'] }, [], [], raw) });
    mount();
    await openPicker();
    const open = await screen.findByRole('button', { name: 'Open glob' });
    expect(open).toBeEnabled();
    await userEvent.click(open);
    expect(await screen.findByRole('button', { name: 'Open deep' })).toBeInTheDocument();
    expect(raw).toEqual(['/api/v1/files/%67lob']);
  });

  it('a count that cannot say still offers the download, with the honest note', async () => {
    bootFixtureCore({ rules: rules({ '/etc': 'fail' }) });
    mount();
    expect(await within(await findRow('/etc')).findByText(strings['zip.unknown'])).toBeInTheDocument();
    expect(within(row('/etc')).getByRole('link', go('/etc'))).toBeInTheDocument();
  });

  it('a started download is marked started, never finished', async () => {
    bootFixtureCore({ rules: rules() });
    mount();
    const link = await within(await findRow('/root')).findByRole('link', go('/root'));
    await userEvent.click(link);
    expect(within(row('/root')).getByText(/^Started .+\. Your browser shows the progress\.$/)).toBeInTheDocument();
    expect(within(row('/root')).getByRole('link', { name: 'Download /root again' })).toBeInTheDocument();
    expect(screen.queryByText(/finished|complete|done/i)).toBeNull();
  });

  it('a typed folder is cleaned and counted; a bad one is refused; no folder list is read for it', async () => {
    const seen: string[] = [];
    const listed: string[] = [];
    bootFixtureCore({ rules: rules({}, {}, seen, listed) });
    mount();
    const d = await openAdd();
    const field = within(d).getByRole('textbox', { name: strings['zip.field'] });
    await userEvent.type(field, 'home/../etc');
    expect(within(d).getByRole('button', { name: strings['zip.add'] })).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, '/srv//my app/');
    await userEvent.click(within(d).getByRole('button', { name: strings['zip.add'] }));
    await userEvent.keyboard('{Escape}');
    const link = await within(await findRow('/srv/my app')).findByRole('link', go('/srv/my app'));
    expect(link.getAttribute('href')).toMatch(/\/api\/v1\/files\/srv\/my%20app\?zip$/);
    await waitFor(() => expect(seen).toContain('/srv/my app'));
    // The picker never opened: no folder of the computer was listed.
    expect(listed).toEqual([]);
  });

  it('the picker walks folders and adds one; Up goes back', async () => {
    bootFixtureCore({ rules: rules({}, { '/': ['root'], '/root': ['code'], '/root/code': ['site'] }) });
    mount();
    await openPicker();
    await userEvent.click(await screen.findByRole('button', { name: 'Open root' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open code' }));
    expect(await screen.findByRole('button', { name: 'Open site' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['pick.add'] }));
    expect(await screen.findByRole('button', { name: strings['pick.added'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['pick.up'] }));
    expect(await screen.findByRole('button', { name: 'Open code' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await within(await findRow('/root/code')).findByRole('link', go('/root/code'))).toBeInTheDocument();
  });

  it('the top folder is read from the files program\'s root listing as JSON (GET /?json, listRootDirectory)', async () => {
    const seen: { path: string; query: Readonly<Record<string, string>> }[] = [];
    bootFixtureCore({
      rules: [
        reply(rootRoute, (r: FixtureRequest) => {
          seen.push({ path: r.path, query: r.query });
          // listRootDirectory's own shape (DirectoryListing): paths[] with path_type, not the REST entries[]/is_dir.
          return answers.ok({ breadcrumb: '', paths: [
            { path_type: 'Dir', name: 'root', mtime: 0, size: 4096 },
            { path_type: 'SymlinkDir', name: 'data', mtime: 0, size: 4096 },
            { path_type: 'File', name: 'notes.txt', mtime: 0, size: 12 },
            { path_type: 'SymlinkFile', name: 'link.txt', mtime: 0, size: 12 },
          ], allow_upload: false, allow_delete: false });
        }),
        ...rules(),
      ],
    });
    mount();
    const d = await openAdd();
    // The drawer alone reads no folders: the picker opens on Browse folders.
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([]);
    await userEvent.click(within(d).getByRole('button', { name: strings['pick.open'] }));
    expect(await screen.findByRole('button', { name: 'Open root' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open data' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open notes.txt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open link.txt' })).toBeNull();
    expect(rootRoute.path).toBe('/');
    expect(seen[0]?.path.split('?')[0]).toBe('/');
    expect(seen[0]?.query).toEqual({ json: '' });
  });

  it('a stopped computer gets the reason, no link and no read; a typed folder can still be added, browsing waits', async () => {
    const seen: string[] = [];
    bootFixtureCore({ rules: rules({}, {}, seen) });
    mount({ ...C, status: 'stopped' } as Computer);
    expect((await screen.findAllByText(strings['zip.notRunning'])).length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('link')).toBeNull();
    expect(seen).toEqual([]);
    const d = await openAdd();
    // No browser fold to open; the drawer says why in its place.
    expect(within(d).queryByRole('button', { name: strings['pick.open'] })).toBeNull();
    expect(within(d).getByText(strings['zip.notRunning'])).toBeInTheDocument();
    await userEvent.type(within(d).getByRole('textbox', { name: strings['zip.field'] }), '/srv/data');
    await userEvent.click(within(d).getByRole('button', { name: strings['zip.add'] }));
    await userEvent.keyboard('{Escape}');
    await findRow('/srv/data');
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([]);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a folder path reads left to right in a right-to-left page (isolated, text only)', async () => {
    bootFixtureCore({ rules: rules() });
    mount();
    const cell = within(await findRow('/root')).getByText((t) => t.includes('/root') && !t.startsWith('Download'));
    expect(cell.textContent).toBe('\u2066/root\u2069');
  });
});

// Add folder and Close are the drawer's own footer, the field stands alone on its line, and the folder
// browser is a fold (closed until asked; the ⋯ menu's Subfolders opens it at that folder).
describe('Add a folder drawer', () => {
  it('the footer holds Add folder and Close; Browse folders is a closed fold that opens the picker', async () => {
    bootFixtureCore({ rules: rules({}, { '/': ['srv'] }) });
    mount();
    const d = await openAdd();
    const footer = d.querySelector('footer') ?? d;
    expect(within(footer as HTMLElement).getByRole('button', { name: strings['zip.add'] })).toBeInTheDocument();
    expect(within(footer as HTMLElement).getByRole('button', { name: strings['zip.close'] })).toBeInTheDocument();
    const fold = within(d).getByRole('button', { name: strings['pick.open'] });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(within(d).queryByRole('region', { name: strings['pick.title'] })).toBeNull();
    await userEvent.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(await within(d).findByRole('region', { name: strings['pick.title'] })).toBeInTheDocument();
    await userEvent.click(within(footer as HTMLElement).getByRole('button', { name: strings['zip.close'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a typed folder is added from the footer and the field empties', async () => {
    bootFixtureCore({ rules: rules() });
    mount();
    const d = await openAdd();
    await userEvent.type(within(d).getByRole('textbox', { name: strings['zip.field'] }), '/srv/site');
    // The drawer's own footer holds Add folder, never an inline button outside it.
    const footer = d.querySelector('footer');
    expect(footer).not.toBeNull();
    await userEvent.click(within(footer as HTMLElement).getByRole('button', { name: strings['zip.add'] }));
    expect(within(d).getByRole('textbox', { name: strings['zip.field'] })).toHaveValue('');
    await userEvent.keyboard('{Escape}');
    expect(await findRow('/srv/site')).toBeInTheDocument();
  });
});
