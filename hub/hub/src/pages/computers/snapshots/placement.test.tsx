// Where each explanation of the snapshots page shows: the
// texts of the page sit in the place they explain, each section's own lede, the Take and Add
// folder drawers, a disabled action's reason, the picker. This file asserts each one is on screen there.
import { answers, bootFixtureCore, containersRoute, queryClient, reply, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { interpolate } from '@kit';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '../routes';
import type { Computer } from '../types';
import { countRoute, folderRoute, MAX_DEPTH, rootRoute } from './files';
import { snapshotRows } from './fixtures';
import { snapshotRoutes } from './routes';
import { SnapshotsTab } from './SnapshotsTab';
import { MAX_FOLDERS } from './zip';
import { ZipBackup } from './ZipBackup';
import strings from './strings.en.json';

const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;
const P = 'p'.repeat(24);
const S1 = 's'.repeat(24);
const C: Computer = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: P, server_id: S1, server_name: 'n12' } as Computer;

function snapRules(max: number): FixtureRule[] {
  return [
    reply(snapshotRoutes.list, () => answers.ok({ data: { computer_id: C.id, snapshot_count: snapshotRows.length, max_snapshots: max, snapshots: snapshotRows } })),
    reply(containersRoute, () => answers.ok({ data: { computers: [{ id: C.id, name: 'atlas', project_id: P }] } })),
    reply(routes.projects, answers.ok({ data: { projects: [{ id: P, alias: 'Personal' }] } })),
    reply(routes.servers, answers.ok({ data: [{ server: { id: S1, name: 'n12', city: 'Singapore', specs: {} }, status: 'active' }] })),
  ];
}
/** A chain of folders /d1/d2/... deeper than the picker reads. */
function zipRules(): FixtureRule[] {
  const chain = Array.from({ length: MAX_DEPTH + 1 }, (_, i) => `d${i + 1}`);
  const subOf = (p: string) => { const n = p.split('/').filter(Boolean).length; return n < chain.length ? [chain[n]!] : []; };
  return [
    reply(countRoute, () => answers.ok({ total_scanned: 40, truncated: false, entries: [], count: 0 })),
    reply(rootRoute, () => answers.ok({ breadcrumb: '', paths: [{ path_type: 'Dir', name: chain[0], mtime: 0, size: 0 }], allow_upload: false, allow_delete: false })),
    reply(folderRoute, (r) => {
      const p = '/' + r.path.split('?')[0]!.split('/').slice(4).map(decodeURIComponent).join('/');
      return answers.ok({ path: p, count: 0, entries: subOf(p).map((name) => ({ name, is_dir: true, size: 0 })) });
    }),
  ];
}
const snaps = (c: Computer = C) => render(routed(<QueryClientProvider client={queryClient}><SnapshotsTab computer={c} canWrite /></QueryClientProvider>));
const zip = (c: Computer = C) => render(routed(<QueryClientProvider client={queryClient}><ZipBackup computer={c} /></QueryClientProvider>));
const section = (id: string) => document.getElementById(id)!;
/** The section once the router has drawn it. */
const drawn = async (id: string) => { await waitFor(() => expect(document.getElementById(id)).not.toBeNull()); return section(id); };

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('the Snapshots section holds its own explanations', () => {
  it('its title and lede head the section (once the combined page lede and "Full snapshot")', async () => {
    bootFixtureCore({ rules: snapRules(10) });
    snaps();
    await screen.findByText('before-upgrade');
    expect(within(section('snapshots')).getByRole('heading', { name: strings['snap.list'] })).toBeInTheDocument();
    expect(within(section('snapshots')).getByText(strings['snap.lede'])).toBeInTheDocument();
  });

  it('the Take drawer carries its title and the name and keep-for rules', async () => {
    bootFixtureCore({ rules: snapRules(10) });
    snaps();
    await screen.findByText('before-upgrade');
    await userEvent.click(within(section('snapshots')).getByRole('button', { name: strings['take.go'] }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading', { name: strings['take.title'] })).toBeInTheDocument();
    expect(within(d).getByText(strings['field.snapRule'])).toBeInTheDocument();
    expect(within(d).getByText(strings['take.expiryHelp'])).toBeInTheDocument();
  });

  it('at the cap the section says so with the number (once "N of M snapshots kept"), and the glance keeps the count', async () => {
    bootFixtureCore({ rules: snapRules(snapshotRows.length) });
    snaps();
    await screen.findByText('before-upgrade');
    expect(within(section('snapshots')).getByText(interpolate(strings['snap.full'], { max: snapshotRows.length }))).toBeInTheDocument();
    expect(within(section('snap-glance')).getByText(interpolate(strings['glance.kept.max'], { count: snapshotRows.length, max: snapshotRows.length }))).toBeInTheDocument();
  });
});

describe('the Download folders section holds its own explanations', () => {
  it('its title and lede head the section (once "Files as .zip" and the large-download note)', async () => {
    bootFixtureCore({ rules: zipRules() });
    zip();
    expect(await within(await drawn('zip')).findByRole('heading', { name: strings['zip.title'] })).toBeInTheDocument();
    expect(within(section('zip')).getByText(interpolate(strings['zip.lede'], { name: 'atlas' }))).toBeInTheDocument();
  });

  it('a computer whose files program has no address says so in the section', async () => {
    bootFixtureCore({ rules: zipRules() });
    zip({ ...C, server_name: '', server_id: '' } as unknown as Computer);
    expect((await within(await drawn('zip')).findAllByText(strings['zip.noAddress'])).length).toBeGreaterThan(0);
  });

  it('a full list gives Add folder its reason', async () => {
    bootFixtureCore({ rules: zipRules() });
    zip();
    await drawn('zip');
    // The list starts with the computer's usual folders: add new ones while Add is on. Add must stay on below
    // MAX_FOLDERS rows and turn off exactly at MAX_FOLDERS (an early or late cut fails the row count).
    const add = () => within(section('zip')).getByRole('button', { name: strings['zip.add'] });
    const rows = () => new Set(Array.from(section('zip').querySelectorAll('[data-row-id]'), (r) => r.getAttribute('data-row-id'))).size;
    await waitFor(() => expect(rows()).toBeGreaterThan(0));
    for (let i = 0; i < MAX_FOLDERS && add().getAttribute('aria-disabled') !== 'true'; i++) {
      await userEvent.click(add());
      const d = await screen.findByRole('dialog');
      await userEvent.type(within(d).getByRole('textbox', { name: strings['zip.field'] }), `/srv/f${i}`);
      await userEvent.click(within(d).getByRole('button', { name: strings['zip.add'] }));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(within(section('zip')).getAllByText(`/srv/f${i}`, { exact: false }).length).toBeGreaterThan(0));
    }
    expect(rows()).toBe(MAX_FOLDERS);
    expect(add()).toHaveAttribute('aria-disabled', 'true');
    expect(within(section('zip')).getByRole('button', { name: strings['zip.add'] })).toHaveAccessibleDescription(interpolate(strings['zip.full'], { max: MAX_FOLDERS }));
  }, 30000);

  it('the picker says the top cannot be added, and past its depth that deeper folders are typed', async () => {
    bootFixtureCore({ rules: zipRules() });
    zip();
    await userEvent.click(await within(await drawn('zip')).findByRole('button', { name: strings['zip.add'] }));
    const d = await screen.findByRole('dialog');
    await userEvent.click(within(d).getByRole('button', { name: strings['pick.open'] }));
    expect(await within(d).findByText(strings['pick.top'])).toBeInTheDocument();
    for (let i = 1; i <= MAX_DEPTH; i++) await userEvent.click(await within(d).findByRole('button', { name: `Open d${i}` }));
    expect(await within(d).findByText(strings['pick.deep'])).toBeInTheDocument();
  }, 30000);
});
