// New computer from a snapshot inside a realm: the API makes it in the shown realm and refuses a
// project that realm does not hold (403 INSUFFICIENT_PERMISSIONS, "Project is not in requested realm"). The drawer
// offers only the realm's own projects, never sends the source's project from outside it, and a realm refusal says
// what to change instead of a bare "Didn't go through".
import { answers, bootFixtureCore, containersRoute, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
import { bump, setRealm } from '@core/ctx';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '../routes';
import pageStrings from '../strings.en.json';
import type { Computer } from '../types';
import { snapshotRows } from './fixtures';
import { snapshotRoutes } from './routes';
import { SnapshotsTab } from './SnapshotsTab';
import strings from './strings.en.json';

/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;

const P = 'p'.repeat(24);
const Q = 'q'.repeat(24);
const S1 = 's'.repeat(24);
const R1 = 'a'.repeat(24);
const C: Computer = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: P, server_id: S1, server_name: 'n12' } as Computer;

interface World { copies: unknown[]; projects: Array<{ id: string; alias: string }> | 'down'; copy: 'ok' | 'realm' }
const world = (o: Partial<World> = {}): World => ({ copies: [], projects: [{ id: Q, alias: 'Lab' }], copy: 'ok', ...o });

function rules(w: World): FixtureRule[] {
  return [
    reply(snapshotRoutes.list, answers.ok({ data: { computer_id: C.id, snapshot_count: snapshotRows.length, max_snapshots: 10, snapshots: snapshotRows } })),
    reply(snapshotRoutes.copyFrom, (r: FixtureRequest) => {
      w.copies.push(r.body);
      return w.copy === 'realm' ? answers.refused(403, 'INSUFFICIENT_PERMISSIONS') : answers.ok({ statusCode: 201, data: { id: 'f'.repeat(24), status: 'copying' } });
    }),
    reply(containersRoute, answers.ok({ data: { computers: [{ id: C.id, name: 'atlas', project_id: P }] } })),
    reply(routes.projects, () => (w.projects === 'down' ? answers.refused(500, 'INTERNAL_ERROR') : answers.ok({ data: { projects: w.projects } }))),
    reply(routes.servers, answers.ok({ data: [{ server: { id: S1, name: 'n12', city: 'Singapore', specs: {} }, status: 'active' }] })),
  ];
}

function mount() {
  return render(
    routed(<QueryClientProvider client={queryClient}>
      <SnapshotsTab computer={C} canWrite />
    </QueryClientProvider>),
  );
}
const dlg = () => screen.getByRole('dialog');
const user = () => userEvent.setup();
const switchTo = (r: string) => act(() => { setRealm(r); bump('switch'); });
const settle = () => act(async () => new Promise((r) => setTimeout(r, 60)));
async function openFrom() {
  await screen.findByText('before-upgrade');
  // New computer from this is in the row's ⋯ menu.
  const row = (await screen.findByText('before-upgrade')).closest('[data-row-id]') as HTMLElement;
  await user().click(within(row).getByRole('button', { name: 'Row actions' }));
  await user().click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['snap.row.new']) }));
  return within(await screen.findByRole('dialog'));
}

afterEach(async () => {
  cleanup();
  queryClient.clear();
  await switchTo('all');
});

describe('new computer from a snapshot, in a realm', () => {
  it('a source project outside the realm is never sent: the realm\'s project must be picked, and only it is sent', async () => {
    const w = world({ projects: [{ id: Q, alias: 'Lab' }, { id: 'r'.repeat(24), alias: 'Ops' }] });
    bootFixtureCore({ rules: rules(w) });
    await switchTo(R1);
    mount();
    const d = await openFrom();
    expect(await d.findByText(strings['from.projectOutside'])).toBeInTheDocument();
    const go = d.getByRole('button', { name: strings['from.go'] });
    expect(go).toBeDisabled();
    await user().click(d.getByRole('button', { name: new RegExp(strings['field.project']) }));
    await user().click(await screen.findByRole('radio', { name: /^Lab/ }));
    await waitFor(() => expect(within(dlg()).getByRole('button', { name: strings['from.go'] })).toBeEnabled());
    await user().click(within(dlg()).getByRole('button', { name: strings['from.go'] }));
    await waitFor(() => expect(w.copies).toHaveLength(1));
    expect(w.copies[0]).toMatchObject({ target_project_id: Q, source_snapshot: 'before-upgrade' });
  });

  it('a realm with one project outside the source still shows the picker (never a hidden guess)', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    await switchTo(R1);
    mount();
    const d = await openFrom();
    expect(await d.findByText(strings['from.projectOutside'])).toBeInTheDocument();
    expect(d.getByRole('button', { name: new RegExp(strings['field.project']) })).toBeInTheDocument();
    expect(d.getByRole('button', { name: strings['from.go'] })).toBeDisabled();
  });

  it('a realm with no project says so and sends nothing', async () => {
    const w = world({ projects: [] });
    bootFixtureCore({ rules: rules(w) });
    await switchTo(R1);
    mount();
    const d = await openFrom();
    expect(await d.findByText(strings['from.noProject'])).toBeInTheDocument();
    expect(d.getByRole('button', { name: strings['from.go'] })).toBeDisabled();
    await settle();
    expect(w.copies).toEqual([]);
  });

  it('an unread projects list offers Retry and sends nothing (no guess from the source computer)', async () => {
    const w = world({ projects: 'down' });
    bootFixtureCore({ rules: rules(w) });
    await switchTo(R1);
    mount();
    const d = await openFrom();
    expect(await d.findByText(pageStrings['create.projectsFail'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(d.getByRole('button', { name: strings['from.go'] })).toBeDisabled();
    expect(w.copies).toEqual([]);
  });

  it('the source\'s own project, held by the realm, is the default and is sent', async () => {
    const w = world({ projects: [{ id: P, alias: 'Personal' }, { id: Q, alias: 'Lab' }] });
    bootFixtureCore({ rules: rules(w) });
    await switchTo(R1);
    mount();
    const d = await openFrom();
    await waitFor(() => expect(d.getByRole('button', { name: strings['from.go'] })).toBeEnabled());
    expect(d.queryByText(strings['from.projectOutside'])).toBeNull();
    await user().click(d.getByRole('button', { name: strings['from.go'] }));
    await waitFor(() => expect(w.copies).toHaveLength(1));
    expect(w.copies[0]).toMatchObject({ target_project_id: P });
  });

  it('a realm refusal keeps the kit\'s refusal line and adds the note naming the realm\'s rules; not held, sent once', async () => {
    const w = world({ projects: [{ id: P, alias: 'Personal' }], copy: 'realm' });
    bootFixtureCore({ rules: rules(w) });
    await switchTo(R1);
    mount();
    const d = await openFrom();
    await waitFor(() => expect(d.getByRole('button', { name: strings['from.go'] })).toBeEnabled());
    await user().click(d.getByRole('button', { name: strings['from.go'] }));
    expect(await within(dlg()).findByText(strings['from.realmRefused'])).toBeInTheDocument();
    expect(within(dlg()).getByText(/You don't have permission to do this/)).toBeInTheDocument();
    expect(within(dlg()).queryByText(/may already have been made/)).toBeNull();
    expect(w.copies).toHaveLength(1);
  });

  it('in All realms the source\'s own project is sent even when the projects read does not list it', async () => {
    const w = world({ projects: [{ id: Q, alias: 'Lab' }] });
    bootFixtureCore({ rules: rules(w) });
    await switchTo('all');
    mount();
    const d = await openFrom();
    await waitFor(() => expect(d.getByRole('button', { name: strings['from.go'] })).toBeEnabled());
    expect(d.queryByText(strings['from.projectOutside'])).toBeNull();
    await user().click(d.getByRole('button', { name: strings['from.go'] }));
    await waitFor(() => expect(w.copies).toHaveLength(1));
    expect(w.copies[0]).toMatchObject({ target_project_id: P });
  });

  it('in All realms the source\'s own project stays offered after another is picked: back to it, it is what is sent', async () => {
    const w = world({ projects: [{ id: Q, alias: 'Lab' }] });
    bootFixtureCore({ rules: rules(w) });
    await switchTo('all');
    mount();
    const d = await openFrom();
    await waitFor(() => expect(d.getByRole('button', { name: strings['from.go'] })).toBeEnabled());
    await user().click(d.getByRole('button', { name: new RegExp(strings['field.project']) }));
    await user().click(await screen.findByRole('radio', { name: /^Lab/ }));
    await user().click(within(dlg()).getByRole('button', { name: new RegExp(strings['field.project']) }));
    await user().click(await screen.findByRole('radio', { name: /own project/ }));
    await user().click(within(dlg()).getByRole('button', { name: strings['from.go'] }));
    await waitFor(() => expect(w.copies).toHaveLength(1));
    expect(w.copies[0]).toMatchObject({ target_project_id: P });
  });

  it('in All realms the same refusal keeps the kit\'s permission sentence, never a bare failure', async () => {
    const w = world({ projects: [{ id: P, alias: 'Personal' }], copy: 'realm' });
    bootFixtureCore({ rules: rules(w) });
    await switchTo('all');
    mount();
    const d = await openFrom();
    await waitFor(() => expect(d.getByRole('button', { name: strings['from.go'] })).toBeEnabled());
    await user().click(d.getByRole('button', { name: strings['from.go'] }));
    expect(await within(dlg()).findByText(/You don't have permission to do this/)).toBeInTheDocument();
    expect(within(dlg()).queryByText(strings['from.realmRefused'])).toBeNull();
    expect(w.copies).toHaveLength(1);
  });
});
