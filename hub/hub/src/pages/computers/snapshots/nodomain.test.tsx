// A page that names no realm API domain (no hx-api-realm-domain meta) sends a realm's copy from a snapshot to the base
// host (core hubApiBase), where the copy takes its source's realms: the hold records 'all' (snapshots/data.ts copyFrom,
// listMadeNew), never the realm shown, which the new computer may not be in. realmDomain is overridden for the whole
// file; core's own routing is not (only what the tab records is judged). With a realm domain: tab.test.tsx.
import { answers, bootFixtureCore, containersRoute, heldChanges, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
import type * as Core from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../routes';
import type { Computer } from '../types';
import { snapshotRows } from './fixtures';
import { COPY_FROM_LOCK } from './data';
import { snapshotRoutes } from './routes';
import { SnapshotsTab } from './SnapshotsTab';
import strings from './strings.en.json';

vi.mock('@core', async (importOriginal) => ({ ...(await importOriginal<typeof Core>()), realmDomain: () => '' }));

const P = 'p'.repeat(24);
const S1 = 's'.repeat(24);
const C: Computer = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: P, server_id: S1, server_name: 'n12' } as Computer;
const w = { copies: [] as unknown[], rowReads: 0 };

const rules = (): FixtureRule[] => [
  reply(snapshotRoutes.list, () => answers.ok({ data: { computer_id: C.id, snapshot_count: snapshotRows.length, max_snapshots: 10, snapshots: snapshotRows.map((x) => ({ ...x })) } })),
  // The copy's answer is lost: it may have gone through.
  reply(snapshotRoutes.copyFrom, (r: FixtureRequest) => {
    w.copies.push(r.body);
    return answers.pending5xx(502);
  }),
  reply(containersRoute, () => {
    w.rowReads += 1;
    return answers.ok({ data: { computers: [{ id: C.id, name: 'atlas', project_id: P }] } });
  }),
  reply(routes.projects, answers.ok({ data: { projects: [{ id: P, alias: 'Personal' }] } })),
  reply(routes.servers, answers.ok({ data: [{ server: { id: S1, name: 'n12', city: 'Singapore', specs: {} }, status: 'active' }] })),
];

function mount() {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <QueryClientProvider client={queryClient}><SnapshotsTab computer={C} canWrite /></QueryClientProvider> }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  w.copies = [];
  w.rowReads = 0;
});

describe('snapshots tab: no realm API domain', () => {
  it("a copy from a snapshot records the base host ('all'), not the realm shown", async () => {
    bootFixtureCore({ rules: rules() });
    mount();
    const u = userEvent.setup();
    const row = (await screen.findByText('before-upgrade')).closest('[data-row-id]') as HTMLElement;
    // The page's list is in before the press (`before` is read from it).
    await waitFor(() => expect(w.rowReads).toBeGreaterThan(0));
    await u.click(within(row).getByRole('button', { name: 'Row actions' }));
    await u.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['snap.row.new']) }));
    await u.click(await within(screen.getByRole('dialog')).findByRole('button', { name: strings['from.go'] }));
    expect(await within(screen.getByRole('dialog')).findByText(/may already have been made/)).toBeInTheDocument();
    expect(w.copies).toHaveLength(1);
    const held = heldChanges(COPY_FROM_LOCK, { realm: 'all' });
    expect(held).toHaveLength(1);
    // Before: the realm shown (FIXTURE_REALM) was recorded.
    expect(held[0]?.identity).toMatchObject({ name: 'atlas-before-upgrade', project: P, before: [C.id], realm: 'all' });
  });
});
