// The Backups tab: the check before a delete names the delete; Check again on a proved take or copy closes its drawer
// (as rename's does); a list read still in flight when the tab shows another computer sends nothing and leaves no
// busy band behind.
import { answers, bootFixtureCore, containersRoute, FIXTURE_REALM, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '../routes';
import type { Computer } from '../types';
import { snapshotRows } from './fixtures';
import { snapshotRoutes } from './routes';
import { SnapshotsTab } from './SnapshotsTab';
import strings from './strings.en.json';

const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;

const P = 'p'.repeat(24);
const S1 = 's'.repeat(24);
const C: Computer = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: P, server_id: S1, server_name: 'n12' } as Computer;
const D: Computer = { id: 'd'.repeat(24), name: 'borealis', status: 'running', project_id: P, server_id: S1, server_name: 'n12' } as Computer;

interface World { snaps: Array<Record<string, unknown>>; rows: Array<Record<string, unknown>>; sends: string[]; listDelay: number }
const world = (): World => ({ snaps: snapshotRows.map((x) => ({ ...x })), rows: [{ id: C.id, name: 'atlas', project_id: P }], sends: [], listDelay: 0 });
const nameOf = (r: FixtureRequest) => decodeURIComponent(/\/snapshots\/([^/?]+)/.exec(r.path)?.[1] ?? '');

function rules(w: World, o: { take?: 'pending'; copy?: 'pending' } = {}): FixtureRule[] {
  return [
    reply(snapshotRoutes.list, (r: FixtureRequest) => answers.ok({ data: { computer_id: /\/computers\/([^/]+)\//.exec(r.path)?.[1], snapshot_count: w.snaps.length, max_snapshots: 10, snapshots: w.snaps } }, w.listDelay || undefined)),
    reply(snapshotRoutes.create, (r: FixtureRequest) => {
      w.sends.push('take');
      return o.take === 'pending' ? answers.pending5xx(502) : answers.ok({ statusCode: 201, data: { snapshot: { name: String((r.body as { alias?: string }).alias) } } });
    }),
    reply(snapshotRoutes.remove, (r: FixtureRequest) => { w.sends.push('drop ' + nameOf(r)); return answers.ok({ data: { snapshot_name: nameOf(r) } }); }),
    reply(snapshotRoutes.restore, (r: FixtureRequest) => { w.sends.push('restore ' + r.path); return answers.ok({ data: { success: true } }); }),
    reply(snapshotRoutes.copyFrom, () => { w.sends.push('copy'); return o.copy === 'pending' ? answers.pending5xx(502) : answers.ok({ statusCode: 201, data: { id: 'f'.repeat(24), status: 'copying' } }); }),
    reply(containersRoute, () => answers.ok({ data: { computers: w.rows } })),
    reply(routes.projects, answers.ok({ data: { projects: [{ id: P, alias: 'Personal' }] } })),
    reply(routes.servers, answers.ok({ data: [{ server: { id: S1, name: 'n12', city: 'Singapore', specs: {} }, status: 'active' }] })),
  ];
}

const tree = (c: Computer) => routed(<QueryClientProvider client={queryClient}><SnapshotsTab computer={c} canWrite /></QueryClientProvider>);
const tab = () => document.body;
let showComputer: (c: Computer) => void = () => {};
function Switching({ first }: { first: Computer }) {
  const [c, setC] = useState(first);
  showComputer = setC;
  return <QueryClientProvider client={queryClient}><SnapshotsTab computer={c} canWrite /></QueryClientProvider>;
}
const user = () => userEvent.setup();
const rowOf = async (name: string) => (await screen.findByText(name)).closest('[data-row-id]') as HTMLElement;
async function menuItem(snap: string, label: string) {
  await user().click(within(await rowOf(snap)).getByRole('button', { name: 'Row actions' }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(label) });
}
const pause = (ms = 60) => act(async () => new Promise((r) => setTimeout(r, ms)));

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('snapshots tab: the check before a delete', () => {
  it('names the delete, never the restore, while the list is read before deleting', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    render(tree(C));
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    w.listDelay = 400;
    await user().click(await screen.findByRole('button', { name: strings['drop.go'] }));
    expect(await within(tab()).findByText(strings['drop.checking'] ?? '(no drop.checking string)')).toBeInTheDocument();
    expect(within(tab()).queryByText(strings['restore.checking'])).toBeNull();
    await waitFor(() => expect(w.sends).toEqual(['drop before-upgrade']));
  });
});

describe('snapshots tab: Check again on a proved hold closes its drawer', () => {
  it('take: the drawer closes, and the next Take opens on a fresh form', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { take: 'pending' }) });
    render(tree(C));
    await within(tab()).findByText('before-upgrade');
    await user().click(within(document.getElementById('snapshots')!).getByRole('button', { name: strings['take.go'] }));
    const d = await screen.findByRole('dialog');
    const field = within(d).getByRole('textbox', { name: strings['field.snapName'] });
    await user().clear(field);
    await user().type(field, 'lost-one');
    await user().click(within(d).getByRole('button', { name: strings['take.go'] }));
    await within(d).findByText(/A snapshot named lost-one may already have been taken/);
    w.snaps = [{ name: 'lost-one', alias: 'lost-one', created_at: '2026-10-24T06:00:00.000Z', size: 1 }, ...w.snaps];
    await user().click(within(d).getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user().click(within(document.getElementById('snapshots')!).getByRole('button', { name: strings['take.go'] }));
    const again = await screen.findByRole('dialog');
    expect(within(again).getByRole('textbox', { name: strings['field.snapName'] })).not.toHaveValue('lost-one');
    expect(w.sends).toEqual(['take']);
  });

  it('copy: the drawer closes once the made computer is read', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { copy: 'pending' }) });
    render(tree(C));
    await within(tab()).findByText('before-upgrade');
    await pause();
    await user().click(await menuItem('before-upgrade', strings['snap.row.new']));
    const d = await screen.findByRole('dialog');
    await user().click(await within(d).findByRole('button', { name: strings['from.go'] }));
    await within(d).findByText(/A computer named atlas-before-upgrade may already have been made/);
    w.rows = [...w.rows, { id: 'e'.repeat(24), name: 'atlas-before-upgrade', project_id: P, realm_ids: [FIXTURE_REALM], server_id: S1 }];
    await user().click(within(d).getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(w.sends).toEqual(['copy']);
  });
});

describe('snapshots tab: another computer while the list is read', () => {
  it('a restore confirmed on one computer sends nothing once the tab shows another, and no busy band stays', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    render(routed(<Switching first={C} />));
    await within(tab()).findByText('before-upgrade');
    await user().click(within(await rowOf('before-upgrade')).getByRole('button', { name: 'Restore before-upgrade' }));
    w.listDelay = 400;
    await user().click(await screen.findByRole('button', { name: strings['restore.go'] }));
    await within(tab()).findByText(strings['restore.checking']);
    act(() => showComputer(D));
    await pause(700);
    expect(w.sends).toEqual([]);
    expect(within(tab()).queryByText(strings['restore.checking'])).toBeNull();
    expect(within(tab()).queryByText(strings['restore.unread'])).toBeNull();
    expect(await within(tab()).findByText(/straight from borealis/)).toBeInTheDocument();
  });
});
