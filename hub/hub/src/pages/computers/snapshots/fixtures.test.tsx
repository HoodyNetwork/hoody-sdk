// The exported preview rules behave like the API for the tab: a take shows in the list, a delete leaves it, and the
// pending variant holds both (never proved by the fixture alone).
import { answers, bootFixtureCore, containersRoute, fixtureWorld, queryClient, reply } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '../routes';
import type { Computer } from '../types';
import { snapshotRules } from './fixtures';
import { SnapshotsTab } from './SnapshotsTab';
import strings from './strings.en.json';

/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;

const C = { id: fixtureWorld.computers[0]?.id ?? 'c'.repeat(24), name: 'atlas', status: 'running', project_id: 'p'.repeat(24), server_id: 's'.repeat(24) } as Computer;
const page = [
  reply(containersRoute, answers.ok({ data: { computers: [] } })),
  reply(routes.projects, answers.ok({ data: { projects: [] } })),
  reply(routes.servers, answers.ok({ data: [] })),
];
const mount = () => render(routed(<QueryClientProvider client={queryClient}><SnapshotsTab computer={C} canWrite /></QueryClientProvider>));
const ask = async () => screen.findByRole('alertdialog').catch(() => screen.getAllByRole('dialog').at(-1)!);
const rowOf = (name: string) => screen.getAllByText(name).map((e) => e.closest<HTMLElement>('[data-row-id]')).find(Boolean)!;
async function menuItem(name: string, label: string) {
  await userEvent.click(within(rowOf(name)).getByRole('button', { name: 'Row actions' }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(label) });
}
/** Take from the card head: the drawer, a name and maybe days, then its Take. */
async function takeOne(name: string, days = '') {
  await userEvent.click(within(document.getElementById('snapshots')!).getByRole('button', { name: strings['take.go'] }));
  const d = within(await screen.findByRole('dialog'));
  const field = d.getByRole('textbox', { name: strings['field.snapName'] });
  await userEvent.clear(field);
  await userEvent.type(field, name);
  if (days) await userEvent.type(d.getByRole('textbox', { name: strings['take.expiry'] }), days);
  await userEvent.click(d.getByRole('button', { name: strings['take.go'] }));
}
const glance = () => within(document.getElementById('snap-glance')!);

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('snapshotRules (preview)', () => {
  it('a take shows in the list and a delete leaves it', async () => {
    bootFixtureCore({ rules: [...snapshotRules(), ...page] });
    mount();
    await screen.findByText('before-upgrade');
    await takeOne('preview-one');
    expect(await screen.findByText('preview-one')).toBeInTheDocument();
    await userEvent.click(await menuItem('before-upgrade', strings['snap.row.delete']));
    await userEvent.click(within(await ask()).getByRole('button', { name: strings['drop.go'] }));
    await waitFor(() => expect(screen.queryByText('before-upgrade')).toBeNull());
  });
  it('a restore moves the snapshot to last used, a rename changes its label, and a take with days shows its expiry', async () => {
    bootFixtureCore({ rules: [...snapshotRules(), ...page] });
    mount();
    await screen.findByText('before-upgrade');
    // Newest names it already; Last used does not yet.
    expect(glance().getAllByText(/\(before-upgrade\)$/)).toHaveLength(1);
    await userEvent.click(within(rowOf('before-upgrade')).getByRole('button', { name: 'Restore before-upgrade' }));
    await userEvent.click(within(await ask()).getByRole('button', { name: strings['restore.go'] }));
    // The glance's Last used now names it.
    await waitFor(() => expect(glance().getAllByText(/\(before-upgrade\)$/).length).toBeGreaterThan(1));
    await userEvent.click(await menuItem('before-upgrade', strings['snap.row.rename']));
    const label = await screen.findByRole('textbox', { name: strings['field.label'] });
    await userEvent.clear(label);
    await userEvent.type(label, 'golden');
    await userEvent.click(screen.getByRole('button', { name: strings['rename.go'] }));
    expect(await screen.findByText(/^golden \(/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await takeOne('keep-a-week', '7');
    const kept = (await screen.findAllByText('keep-a-week')).map((e) => e.closest<HTMLElement>('[data-row-id]')).find(Boolean)!;
    expect(within(kept).queryByText(strings['expires.never'])).toBeNull();
  });
  it('the pending variant holds a restore', async () => {
    bootFixtureCore({ rules: [...snapshotRules({ pending: true }), ...page] });
    mount();
    await screen.findByText('before-upgrade');
    await userEvent.click(screen.getAllByRole('button', { name: /^Restore / })[0]!);
    await userEvent.click(within(await ask()).getByRole('button', { name: strings['restore.go'] }));
    expect(await screen.findByText(/may already have gone through/)).toBeInTheDocument();
  });
  it('the pending variant holds a delete', async () => {
    bootFixtureCore({ rules: [...snapshotRules({ pending: true }), ...page] });
    mount();
    await screen.findByText('before-upgrade');
    await userEvent.click(await menuItem('before-upgrade', strings['snap.row.delete']));
    await userEvent.click(within(await ask()).getByRole('button', { name: strings['drop.go'] }));
    expect(await screen.findByText(/may already have been deleted/)).toBeInTheDocument();
  });
});
