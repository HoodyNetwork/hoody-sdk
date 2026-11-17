// The Backups tab as the user meets it, on real core (fixture transport): the glance, the list, Take (its drawer from the
// card head), New computer from a snapshot (the row's ⋯ menu), and C9 for both changes (one send, an unknown outcome held until a fresh read proves it or a warned
// Dismiss of the shown hold; never shown as failed; a remount or a realm switch shows the hold, never a fresh form).
import { answers, bootFixtureCore, containersRoute, FIXTURE_REALM, fixtureSession, heldChanges, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
import { bump, setRealm } from '@core/ctx';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { interpolate } from '@kit';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '../routes';
import type { Computer } from '../types';
import { snapshotRows } from './fixtures';
import { COPY_FROM_LOCK, SNAP_LOCK } from './data';
import { snapshotRoutes } from './routes';
import { SnapshotsTab } from './SnapshotsTab';
import strings from './strings.en.json';

/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;

const P = 'p'.repeat(24);
const S1 = 's'.repeat(24);
const C: Computer = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: P, server_id: S1, server_name: 'n12' } as Computer;

interface World { malformed?: boolean; snaps: Array<Record<string, unknown>>; rows: Array<Record<string, unknown>>; takes: unknown[]; copies: unknown[]; drops: string[]; lists: number; max: number; rowReads?: number }

function rules(w: World, o: { take?: 'ok' | 'pending' | string; copy?: 'ok' | 'pending'; drop?: 'ok' | 'pending' } = {}): FixtureRule[] {
  const unknown = answers.pending5xx(502);
  return [
    reply(snapshotRoutes.list, () => {
      w.lists += 1;
      if (w.malformed) return answers.ok({ data: {} });
      return answers.ok({ data: { computer_id: C.id, snapshot_count: w.snaps.length, max_snapshots: w.max, snapshots: w.snaps } });
    }),
    reply(snapshotRoutes.create, (r: FixtureRequest) => {
      w.takes.push(r.body);
      const take = o.take ?? 'ok';
      if (take === 'pending') return unknown;
      if (take !== 'ok') return answers.refused(400, take);
      const alias = String((r.body as { alias?: string }).alias);
      w.snaps = [{ name: alias, alias, created_at: '2026-10-24T06:00:00.000Z', size: 1 }, ...w.snaps];
      return answers.ok({ statusCode: 201, data: { snapshot: { name: alias, alias } } });
    }),
    reply(snapshotRoutes.remove, (r: FixtureRequest) => {
      const name = decodeURIComponent(r.path.split('/').pop() ?? '');
      w.drops.push(name);
      if ((o.drop ?? 'ok') === 'pending') return unknown;
      w.snaps = w.snaps.filter((x) => x.name !== name);
      return answers.ok({ data: { snapshot_name: name } });
    }),
    reply(snapshotRoutes.copyFrom, (r: FixtureRequest) => {
      w.copies.push(r.body);
      return (o.copy ?? 'ok') === 'pending' ? unknown : answers.ok({ statusCode: 201, data: { id: 'f'.repeat(24), status: 'copying' } });
    }),
    reply(containersRoute, () => {
      w.rowReads = (w.rowReads ?? 0) + 1;
      return answers.ok({ data: { computers: w.rows } });
    }),
    reply(routes.projects, answers.ok({ data: { projects: [{ id: P, alias: 'Personal' }] } })),
    reply(routes.servers, answers.ok({ data: [{ server: { id: S1, name: 'n12', city: 'Singapore', specs: {} }, status: 'active' }] })),
  ];
}

const world = (): World => ({ snaps: snapshotRows.map((x) => ({ ...x })), rows: [{ id: C.id, name: 'atlas', project_id: P }], takes: [], copies: [], drops: [], lists: 0, max: 10 });

function mount(c: Computer = C, canWrite = true) {
  return render(
    routed(<QueryClientProvider client={queryClient}>
      <SnapshotsTab computer={c} canWrite={canWrite} />
    </QueryClientProvider>),
  );
}

// The tab is the page; the copy form is its drawer.
const tab = () => document.body;
const dlg = () => screen.getByRole('dialog');
const switchTo = (r: string) => act(() => { setRealm(r); bump('switch'); });
const user = () => userEvent.setup();
/** The Take button in the Snapshots card head (the drawer's submit has the same words, so the card's own). */
const takeHead = () => within(document.getElementById('snapshots')!).getByRole('button', { name: strings['take.go'] });
/** Opens the Take drawer from the card head and gives it. */
async function openTake() {
  await user().click(takeHead());
  return screen.findByRole('dialog');
}
/** The drawer's Take submit. */
const takeGo = async () => user().click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['take.go'] }));
const rowOf = async (name: string) => (await screen.findByText(name)).closest('[data-row-id]') as HTMLElement;
/** A row's ⋯ menu item (opened from that row). */
async function menuItem(snap: string, label: string) {
  await user().click(within(await rowOf(snap)).getByRole('button', { name: 'Row actions' }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(label) });
}
const closeMenu = async () => user().keyboard('{Escape}');
/** Every row menu holds this item off (aria-disabled), looked at row by row. */
async function allOff(label: string, snaps = ['before-upgrade', 'snap-20261018-2140']) {
  for (const n of snaps) {
    expect(await menuItem(n, label)).toHaveAttribute('aria-disabled', 'true');
    await closeMenu();
  }
}

afterEach(() => {
  cleanup();
  queryClient.clear();
});

describe('snapshots tab: list and take', () => {
  it('lists the kept snapshots with the count and cap', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    expect(await within(tab()).findByText('before-upgrade')).toBeInTheDocument();
    expect(within(tab()).getByText('snap-20261018-2140')).toBeInTheDocument();
    expect(within(document.getElementById('snap-glance')!).getByText('2 of 10')).toBeInTheDocument();
    expect(within(tab()).getAllByRole('button', { name: /^Restore / })).toHaveLength(2);
    expect(await menuItem('before-upgrade', strings['snap.row.new'])).toBeInTheDocument();
  });

  it('Take sends one POST with the typed name as the alias, then the list shows it', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const d = await openTake();
    const field = within(d).getByRole('textbox', { name: strings['field.snapName'] });
    await user().clear(field);
    await user().type(field, 'pre-deploy');
    await takeGo();
    expect(await within(tab()).findByText('pre-deploy')).toBeInTheDocument();
    // A proved take closes the drawer and says so in the card.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(document.getElementById('snapshots')!).getByText(strings['take.done'])).toBeInTheDocument();
    expect(w.takes).toEqual([{ alias: 'pre-deploy' }]);
  });

  it('a typed name survives a list read that moves (a refetch never replaces it)', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const d = await openTake();
    const field = within(d).getByRole('textbox', { name: strings['field.snapName'] });
    await user().clear(field);
    await user().type(field, 'mine');
    const before = w.lists;
    w.snaps = [{ name: 'other', alias: null, created_at: '2026-10-24T07:00:00.000Z', size: 1 }, ...w.snaps];
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(w.lists).toBeGreaterThan(before));
    expect(await within(tab()).findByText('other')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('textbox', { name: strings['field.snapName'] })).toHaveValue('mine');
  });

  it('an invalid name or a computer that cannot take one sends nothing', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount({ ...C, status: 'paused' } as Computer);
    await within(tab()).findByText('before-upgrade');
    // Take stays focusable but does nothing, and says why.
    expect(takeHead()).toHaveAttribute('aria-disabled', 'true');
    expect(takeHead()).toHaveAccessibleDescription(strings['take.state']);
    await user().click(takeHead());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(w.takes).toEqual([]);
  });

  it('an invalid name in the drawer keeps its Take off', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const d = await openTake();
    const field = within(d).getByRole('textbox', { name: strings['field.snapName'] });
    await user().clear(field);
    await user().type(field, '-bad name-');
    await takeGo();
    expect(w.takes).toEqual([]);
  });

  it('a cleared name is marked at the field (the form needs one though it opens filled in)', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const d = await openTake();
    const field = within(d).getByRole('textbox', { name: strings['field.snapName'] });
    // The suggested name is no error.
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
    await user().clear(field);
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await takeGo();
    expect(w.takes).toEqual([]);
  });

  it('a refusal keeps its sentence and is not held', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { take: 'COMPUTER_SNAPSHOT_LIMIT' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await openTake();
    await takeGo();
    expect(await within(screen.getByRole('dialog')).findByText(strings['err.COMPUTER_SNAPSHOT_LIMIT'])).toBeInTheDocument();
    expect(within(tab()).queryByText(/A snapshot named .+ may already have been taken/)).toBeNull();
    expect(w.takes).toHaveLength(1);
  });

  it('a refusal code the tab has no sentence for reads the kit\'s general words, not held', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { take: 'SOME_OTHER_REFUSAL' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await openTake();
    await takeGo();
    const d = screen.getByRole('dialog');
    expect(await within(d).findByText("Didn't go through")).toBeInTheDocument();
    for (const [k, v] of Object.entries(strings)) if (k.startsWith('err.')) expect(within(d).queryByText(v)).toBeNull();
    expect(within(tab()).queryByText(/A snapshot named .+ may already have been taken/)).toBeNull();
    expect(w.takes).toHaveLength(1);
  });
});

describe('snapshots tab: Take reads the list first', () => {
  it('a name the fresh list already holds sends nothing and says so', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const d = await openTake();
    const field = within(d).getByRole('textbox', { name: strings['field.snapName'] });
    await user().clear(field);
    await user().type(field, 'late-one');
    // Another tab takes a snapshot of that name after this tab's list was read.
    w.snaps = [{ name: 'late-one', alias: 'late-one', created_at: '2026-10-24T05:00:00.000Z', size: 1 }, ...w.snaps];
    await takeGo();
    expect(await within(d).findByText(interpolate(strings['take.taken'], { name: 'late-one' }))).toBeInTheDocument();
    expect(w.takes).toEqual([]);
    expect(heldChanges(SNAP_LOCK, { realm: 'all' })).toHaveLength(0);
  });

  it('a list that cannot be read just before the send sends nothing and says so', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const d = await openTake();
    w.malformed = true;
    await takeGo();
    expect(await within(d).findByText(strings['take.unread'])).toBeInTheDocument();
    expect(w.takes).toEqual([]);
  });

  it('an unknown take sent after a fresh list lacked its name is held marked fresh', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { take: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await openTake();
    await takeGo();
    await within(screen.getByRole('dialog')).findByText(/A snapshot named .+ may already have been taken/);
    expect(heldChanges(SNAP_LOCK, { realm: 'all' }).map((h) => (h.identity as { fresh?: boolean } | undefined)?.fresh)).toEqual([true]);
  });
});

describe('snapshots tab: an unknown take (C9)', () => {
  it('is held across a remount, never sent again, and freed only by a list showing the sent name', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { take: 'pending' }) });
    const first = mount();
    await within(tab()).findByText('before-upgrade');
    const d = await openTake();
    const field = within(d).getByRole('textbox', { name: strings['field.snapName'] });
    await user().clear(field);
    await user().type(field, 'lost-one');
    await takeGo();
    // The drawer shows the hold instead of the form.
    expect(await within(d).findByText(/A snapshot named lost-one may already have been taken/)).toBeInTheDocument();
    expect(within(tab()).queryByRole('textbox', { name: strings['field.snapName'] })).toBeNull();
    expect(within(tab()).queryByText(/failed|could not be (taken|deleted|made)/i)).toBeNull();
    first.unmount();
    mount();
    expect(await within(tab()).findByText(/A snapshot named lost-one may already have been taken/)).toBeInTheDocument();
    expect(takeHead()).toHaveAttribute('aria-disabled', 'true');
    expect(takeHead()).toHaveAccessibleDescription(strings['take.heldReason']);
    // A list without the name proves nothing.
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(within(tab()).getByText(/A snapshot named lost-one may already have been taken/)).toBeInTheDocument();
    // The snapshot shows up: Check again frees the hold.
    w.snaps = [{ name: 'lost-one', alias: 'lost-one', created_at: '2026-10-24T06:00:00.000Z', size: 1 }, ...w.snaps];
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(within(tab()).queryByText(/A snapshot named .+ may already have been taken/)).toBeNull());
    expect(takeHead()).not.toHaveAttribute('aria-disabled');
    const again = await openTake();
    expect(within(again).getByRole('textbox', { name: strings['field.snapName'] })).toBeInTheDocument();
    expect(w.takes).toHaveLength(1);
  });

  it('a warned Dismiss frees exactly the shown hold and sends nothing', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { take: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await openTake();
    await takeGo();
    await within(screen.getByRole('dialog')).findByText(/A snapshot named .+ may already have been taken/);
    await user().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user().click(within(tab()).getByRole('button', { name: strings['held.dismiss'] }));
    const ask = await screen.findByRole('alertdialog').catch(() => screen.getAllByRole('dialog').at(-1)!);
    await user().click(within(ask).getByRole('button', { name: strings['held.dismissGo'] }));
    await waitFor(() => expect(screen.queryByText(/A snapshot named .+ may already have been taken/)).toBeNull());
    expect(w.takes).toHaveLength(1);
  });
});

describe('snapshots tab: a new computer from a snapshot', () => {
  it('sends one copy with source_snapshot, the suggested name and the project, from its drawer', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.new']));
    expect(await within(dlg()).findByRole('textbox', { name: strings['field.name'] })).toHaveValue('atlas-before-upgrade');
    await user().click(within(dlg()).getByRole('button', { name: strings['from.go'] }));
    await waitFor(() => expect(w.copies).toHaveLength(1));
    expect(w.copies[0]).toEqual({ name: 'atlas-before-upgrade', target_project_id: P, target_server_id: S1, source_snapshot: 'before-upgrade' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closing the copy form after an edit asks before the edit is lost', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.new']));
    const field = await within(dlg()).findByRole('textbox', { name: strings['field.name'] });
    await user().clear(field);
    await user().type(field, 'mine-now');
    await user().keyboard('{Escape}');
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(within(dlg()).getByRole('textbox', { name: strings['field.name'] })).toHaveValue('mine-now');
    expect(w.copies).toEqual([]);
  });

  it('an unknown copy is held, shown in the tab after a remount, and proved only by a new computer of the name in the project', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { copy: 'pending' }) });
    const first = mount();
    await within(tab()).findByText('before-upgrade');
    // The page's list is in before the press: what it shows under the name is what a read-back must not count.
    await waitFor(() => expect(w.rowReads ?? 0).toBeGreaterThan(0));
    await user().click(await menuItem('before-upgrade', strings['snap.row.new']));
    await user().click(await within(dlg()).findByRole('button', { name: strings['from.go'] }));
    expect(await within(dlg()).findByText(/A computer named atlas-before-upgrade may already have been made/)).toBeInTheDocument();
    expect(within(dlg()).queryByRole('button', { name: strings['from.go'] })).toBeNull();
    first.unmount();
    mount();
    // The tab shows the held copy above the list, and no snapshot offers a fresh copy while it is held.
    expect(await within(tab()).findByText(/A computer named atlas-before-upgrade may already have been made/)).toBeInTheDocument();
    await within(tab()).findByText('before-upgrade');
    await allOff(strings['snap.row.new']);
    w.rows = [...w.rows, { id: 'f'.repeat(24), name: 'atlas-before-upgrade', project_id: 'q'.repeat(24), server_id: S1 }];
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(within(tab()).getByText(/may already have been made/)).toBeInTheDocument();
    // The computer it made carries the realm it was sent in (the API puts a realm's copy in that realm only).
    w.rows = [...w.rows, { id: 'e'.repeat(24), name: 'atlas-before-upgrade', project_id: P, realm_ids: [FIXTURE_REALM], server_id: S1 }];
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(within(tab()).queryByText(/may already have been made/)).toBeNull());
    expect(w.copies).toHaveLength(1);
  });

  it('a copy to a name its project already holds is never read as made by that computer (the API answers it 409)', async () => {
    const w = world();
    const D = 'd'.repeat(24);
    // The suggested name is taken in the project: the API refuses the copy, and here its answer is lost.
    w.rows = [...w.rows, { id: D, name: 'atlas-before-upgrade', project_id: P, realm_ids: [FIXTURE_REALM], server_id: S1 }];
    bootFixtureCore({ rules: rules(w, { copy: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await waitFor(() => expect(w.rowReads ?? 0).toBeGreaterThan(0));
    await user().click(await menuItem('before-upgrade', strings['snap.row.new']));
    await user().click(await within(dlg()).findByRole('button', { name: strings['from.go'] }));
    expect(await within(dlg()).findByText(/A computer named atlas-before-upgrade may already have been made/)).toBeInTheDocument();
    // The hold names every computer the list showed at the press (the one under that name among them), and the realm
    // it was sent in.
    const held = heldChanges(COPY_FROM_LOCK, { realm: 'all' });
    expect(held).toHaveLength(1);
    expect(held[0]?.identity).toMatchObject({ name: 'atlas-before-upgrade', project: P, before: [C.id, D], realm: FIXTURE_REALM, server: S1 });
    // Check again reads the list again, which still shows that computer: nothing is proved, the copy stays held.
    const reads = w.rowReads ?? 0;
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(w.rowReads ?? 0).toBeGreaterThan(reads));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(within(tab()).getAllByText(/may already have been made/).length).toBeGreaterThan(0);
    expect(heldChanges(COPY_FROM_LOCK, { realm: 'all' })).toHaveLength(1);
    // A new computer of that name in that project and realm, but on another server, proves nothing: the copy was sent
    // to S1, where the API puts it (data.ts listMadeNew `server`).
    w.rows = [...w.rows, { id: '9'.repeat(24), name: 'atlas-before-upgrade', project_id: P, realm_ids: [FIXTURE_REALM], server_id: 't'.repeat(24) }];
    const elsewhere = w.rowReads ?? 0;
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(w.rowReads ?? 0).toBeGreaterThan(elsewhere));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(heldChanges(COPY_FROM_LOCK, { realm: 'all' })).toHaveLength(1);
    // The control: a new computer of that name in that project and realm, on S1, proves it.
    w.rows = [...w.rows, { id: 'e'.repeat(24), name: 'atlas-before-upgrade', project_id: P, realm_ids: [FIXTURE_REALM], server_id: S1 }];
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(heldChanges(COPY_FROM_LOCK, { realm: 'all' })).toHaveLength(0));
    expect(w.copies).toHaveLength(1);
  });

  it('a computer the list showed under another name, renamed into the sent name after the press, never proves the copy', async () => {
    const w = world();
    const O = '8'.repeat(24);
    // At the press the list shows `atlas-old` (same project, realm and server) and nothing of the suggested name.
    w.rows = [...w.rows, { id: O, name: 'atlas-old', project_id: P, realm_ids: [FIXTURE_REALM], server_id: S1 }];
    bootFixtureCore({ rules: rules(w, { copy: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await waitFor(() => expect(w.rowReads ?? 0).toBeGreaterThan(0));
    await user().click(await menuItem('before-upgrade', strings['snap.row.new']));
    await user().click(await within(dlg()).findByRole('button', { name: strings['from.go'] }));
    expect(await within(dlg()).findByText(/A computer named atlas-before-upgrade may already have been made/)).toBeInTheDocument();
    const held = heldChanges(COPY_FROM_LOCK, { realm: 'all' });
    expect(held).toHaveLength(1);
    expect(held[0]?.identity).toMatchObject({ name: 'atlas-before-upgrade', project: P, before: [C.id, O], realm: FIXTURE_REALM, server: S1 });
    // Another tab renames atlas-old to the sent name: Check again's read shows it, which must not read as made.
    w.rows = w.rows.map((x) => (x.id === O ? { ...x, name: 'atlas-before-upgrade' } : x));
    const reads = w.rowReads ?? 0;
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(w.rowReads ?? 0).toBeGreaterThan(reads));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(within(tab()).getAllByText(/may already have been made/).length).toBeGreaterThan(0);
    expect(heldChanges(COPY_FROM_LOCK, { realm: 'all' })).toHaveLength(1);
    // The control: a new computer of that name in that project and realm, on S1, proves it.
    w.rows = [...w.rows, { id: 'e'.repeat(24), name: 'atlas-before-upgrade', project_id: P, realm_ids: [FIXTURE_REALM], server_id: S1 }];
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(heldChanges(COPY_FROM_LOCK, { realm: 'all' })).toHaveLength(0));
    expect(w.copies).toHaveLength(1);
  });

  it('a list that may not be the whole list (a full page) records no before: a computer of the name beyond it never proves the copy', async () => {
    const w = world();
    const D = 'd'.repeat(24);
    // The page's list is a full page (100 rows, its limit). A computer of the suggested name sits beyond it in the
    // project, so the API refuses the copy, and here its answer is lost.
    const others = Array.from({ length: 99 }, (_, i) => ({ id: (0x7d0000 + i).toString(16).padStart(24, '0'), name: `other-${i}`, project_id: P }));
    w.rows = [...w.rows, ...others];
    bootFixtureCore({ rules: rules(w, { copy: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await waitFor(() => expect(w.rowReads ?? 0).toBeGreaterThan(0));
    await user().click(await menuItem('before-upgrade', strings['snap.row.new']));
    await user().click(await within(dlg()).findByRole('button', { name: strings['from.go'] }));
    expect(await within(dlg()).findByText(/A computer named atlas-before-upgrade may already have been made/)).toBeInTheDocument();
    // The hold names the sent copy and its realm, and no `before`: the list could not tell what the project held.
    const held = heldChanges(COPY_FROM_LOCK, { realm: 'all' });
    expect(held).toHaveLength(1);
    expect(held[0]?.identity).toMatchObject({ name: 'atlas-before-upgrade', project: P, realm: FIXTURE_REALM, server: S1 });
    expect(held[0]?.identity).not.toHaveProperty('before');
    // A computer gone moves the one beyond the page up: Check again's read shows it, which must not read as made.
    w.rows = [...w.rows.slice(0, 99), { id: D, name: 'atlas-before-upgrade', project_id: P, realm_ids: [FIXTURE_REALM], server_id: S1 }];
    const reads = w.rowReads ?? 0;
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(w.rowReads ?? 0).toBeGreaterThan(reads));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(within(tab()).getAllByText(/may already have been made/).length).toBeGreaterThan(0);
    expect(heldChanges(COPY_FROM_LOCK, { realm: 'all' })).toHaveLength(1);
    expect(w.copies).toHaveLength(1);
  });
});

describe('snapshots tab: delete', () => {
  const ask = async () => screen.findByRole('alertdialog').catch(() => screen.getAllByRole('dialog').at(-1)!);

  it('asks first, naming the snapshot; Cancel sends nothing; confirm sends one DELETE and the list drops it', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    let q = await ask();
    expect(within(q).getByText('Delete before-upgrade?')).toBeInTheDocument();
    await user().click(within(q).getByRole('button', { name: /cancel/i }));
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    expect(w.drops).toEqual([]);
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    q = await ask();
    await user().click(within(q).getByRole('button', { name: strings['drop.go'] }));
    await waitFor(() => expect(within(tab()).queryByText('before-upgrade')).toBeNull());
    expect(w.drops).toEqual(['before-upgrade']);
  });

  it('an unknown delete is held across a remount, blocks every row action, and is freed only by a list without the name', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { drop: 'pending' }) });
    const first = mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    await user().click(within(await ask()).getByRole('button', { name: strings['drop.go'] }));
    expect(await within(tab()).findByText(/The snapshot before-upgrade may already have been deleted/)).toBeInTheDocument();
    expect(within(tab()).queryByText(/failed|could not be (taken|deleted|made)/i)).toBeNull();
    first.unmount();
    mount();
    expect(await within(tab()).findByText(/The snapshot before-upgrade may already have been deleted/)).toBeInTheDocument();
    await within(tab()).findByText('before-upgrade');
    await allOff(strings['snap.row.delete']);
    await allOff(strings['snap.row.new']);
    // Soft-disabled with its reason (the kit's disabled row action, as the menu items above): focusable, and its one tip
    // says the whole action (the visible word is only "Restore") and why it waits.
    for (const b of within(tab()).getAllByRole('button', { name: /^Restore \S/ })) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b).toHaveAccessibleDescription(`${b.getAttribute('aria-label') ?? ''}. ${strings['row.busy']}`);
    }
    // A list still holding the name proves nothing.
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(within(tab()).getByText(/may already have been deleted/)).toBeInTheDocument();
    w.snaps = w.snaps.filter((x) => x.name !== 'before-upgrade');
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(within(tab()).queryByText(/may already have been deleted/)).toBeNull());
    expect(w.drops).toEqual(['before-upgrade']);
  });

  it('a snapshot replaced under the same name since the question opened is not deleted, and says so', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    const q = await ask();
    // Another tab deletes it and takes a new one of the same name while the question is open.
    w.snaps = w.snaps.map((x) => (x.name === 'before-upgrade' ? { ...x, created_at: '2026-10-25T09:00:00.000Z' } : x));
    await user().click(within(q).getByRole('button', { name: strings['drop.go'] }));
    expect(await within(tab()).findByText(interpolate(strings['drop.changed'], { name: 'before-upgrade' }))).toBeInTheDocument();
    expect(w.drops).toEqual([]);
  });

  it('a snapshot already gone from a fresh list is not sent for, and says it is already deleted', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    const q = await ask();
    w.snaps = w.snaps.filter((x) => x.name !== 'before-upgrade');
    await user().click(within(q).getByRole('button', { name: strings['drop.go'] }));
    expect(await within(tab()).findByText(interpolate(strings['drop.gone'], { name: 'before-upgrade' }))).toBeInTheDocument();
    expect(w.drops).toEqual([]);
  });

  it('a list that cannot be read just before the delete sends nothing and says so', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    const q = await ask();
    w.malformed = true;
    await user().click(within(q).getByRole('button', { name: strings['drop.go'] }));
    expect(await within(tab()).findByText(strings['drop.unread'])).toBeInTheDocument();
    expect(w.drops).toEqual([]);
  });

  it('a malformed list answer never proves an unknown delete (no second DELETE)', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { drop: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    await user().click(within(await ask()).getByRole('button', { name: strings['drop.go'] }));
    await within(tab()).findByText(/may already have been deleted/);
    w.malformed = true;
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await act(async () => new Promise((r) => setTimeout(r, 80)));
    expect(within(tab()).getByText(/may already have been deleted/)).toBeInTheDocument();
    expect(within(tab()).getByText(strings['snap.error'])).toBeInTheDocument();
    expect(w.drops).toHaveLength(1);
  });

  it('at the cap Take is off with the reason and a pointer to Delete; a delete brings it back', async () => {
    const w = world();
    w.max = 2;
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const fullText = interpolate(strings['snap.full'], { max: 2 });
    expect(within(tab()).getByText(fullText)).toBeInTheDocument();
    expect(takeHead()).toHaveAttribute('aria-disabled', 'true');
    expect(takeHead()).toHaveAccessibleDescription(strings['take.fullReason']);
    await user().click(takeHead());
    expect(w.takes).toEqual([]);
    await user().click(await menuItem('snap-20261018-2140', strings['snap.row.delete']));
    await user().click(within(await ask()).getByRole('button', { name: strings['drop.go'] }));
    await waitFor(() => expect(within(tab()).queryByText(fullText)).toBeNull());
    expect(takeHead()).not.toHaveAttribute('aria-disabled');
    expect(w.drops).toEqual(['snap-20261018-2140']);
  });
});

describe('snapshots tab: a realm switch never offers a second send (C9)', () => {
  const R1 = 'a'.repeat(24);
  const R2 = 'b'.repeat(24);
  afterEach(() => { setRealm('all'); bump('switch'); });

  it('a held take stays held in another realm view, and nothing is sent again', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { take: 'pending' }) });
    switchTo(R1);
    mount();
    await within(tab()).findByText('before-upgrade');
    await openTake();
    await takeGo();
    await within(tab()).findByText(/A snapshot named .+ may already have been taken/);
    switchTo(R2);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(within(tab()).getByText(/A snapshot named .+ may already have been taken/)).toBeInTheDocument();
    expect(within(tab()).queryByRole('textbox', { name: strings['field.snapName'] })).toBeNull();
    expect(takeHead()).toHaveAttribute('aria-disabled', 'true');
    expect(w.takes).toHaveLength(1);
  });

  it('a held copy stays held in another realm view, and no snapshot offers a fresh copy', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { copy: 'pending' }) });
    switchTo(R1);
    const first = mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.new']));
    await user().click(await within(dlg()).findByRole('button', { name: strings['from.go'] }));
    await within(dlg()).findByText(/may already have been made/);
    first.unmount();
    switchTo(R2);
    mount();
    expect(await within(tab()).findByText(/may already have been made/)).toBeInTheDocument();
    await within(tab()).findByText('before-upgrade');
    await allOff(strings['snap.row.new']);
    expect(w.copies).toHaveLength(1);
  });

  it('a held delete stays held in another realm view, and nothing is sent again', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { drop: 'pending' }) });
    switchTo(R1);
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    const q = await screen.findByRole('alertdialog').catch(() => screen.getAllByRole('dialog').at(-1)!);
    await user().click(within(q).getByRole('button', { name: strings['drop.go'] }));
    await within(tab()).findByText(/may already have been deleted/);
    switchTo(R2);
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(within(tab()).getByText(/may already have been deleted/)).toBeInTheDocument();
    await allOff(strings['snap.row.delete']);
    expect(w.drops).toHaveLength(1);
  });
});

describe('snapshots tab: access', () => {
  it('a session without the snapshots permission reads and sends nothing', async () => {
    const w = world();
    bootFixtureCore({ rules: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read'] }), ...rules(w)] });
    mount();
    expect(await within(tab()).findByText(strings['snap.noAccess'])).toBeInTheDocument();
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(w.lists).toBe(0);
    expect(within(tab()).queryByRole('button', { name: strings['take.go'] })).toBeNull();
  });

  it('snapshots without the right to make computers: the list and Take show, New computer is off with its reason', async () => {
    const w = world();
    bootFixtureCore({ rules: [fixtureSession({ kind: 'token', caps: ['computers.read', 'projects.read', 'computers.features.snapshots'] }), ...rules(w)] });
    mount(C, false);
    expect(await within(tab()).findByText('before-upgrade')).toBeInTheDocument();
    expect(takeHead()).toBeInTheDocument();
    await user().click(within(await rowOf('before-upgrade')).getByRole('button', { name: 'Row actions' }));
    const item = within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['snap.row.new']) });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription(strings['from.noAccess']);
    // Restore needs the same right as making a computer.
    expect(within(tab()).queryByRole('button', { name: /^Restore / })).toBeNull();
  });
});

// A session that cannot make computers sees "New computer from this" off, with the reason, never a
// drawer with no footer.
describe('snapshots tab: no right to make computers', () => {
  it('without the right to make computers, New computer from this is off with the reason and opens nothing', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount(C, false);
    await within(tab()).findByText('before-upgrade');
    const item = await menuItem('before-upgrade', strings['snap.row.new']);
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription(strings['from.noAccess']);
    await user().click(item);
    // No copy form opens (the menu's own popover is a dialog too: look for the form's field).
    expect(screen.queryByRole('textbox', { name: strings['field.name'] })).toBeNull();
    expect(w.copies).toEqual([]);
  });

});
