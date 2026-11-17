// What a snapshot offers beyond take, delete and copy: restore (the row's one button), rename (its ⋯ menu),
// how long to keep one, the glance's last-used fact and the row's Disk only / Disk + memory tag, and the folder picker
// (the Add folder drawer) opening at the top of the computer. Restore and rename follow C9:
// one send, an unknown outcome held until a fresh read proves it, never shown as failed.
import { answers, bootFixtureCore, containersRoute, queryClient, reply, type FixtureRequest, type FixtureRule } from '@core';
// eslint-disable-next-line no-restricted-imports -- a test harness for the tab, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '../routes';
import type { Computer } from '../types';
import { countRoute, folderRoute, rootRoute } from './files';
import { snapshotRoutes } from './routes';
import { SnapshotsTab } from './SnapshotsTab';
import { ZipBackup } from './ZipBackup';
import strings from './strings.en.json';
import kit from '@kit/strings.en.json';

/** The tables read the URL (kit DataTable): the tab renders inside a memory router. */
const routed = (node: ReactElement) => <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history: createMemoryHistory({ initialEntries: ['/'] }) })} />;

const P = 'p'.repeat(24);
const S1 = 's'.repeat(24);
const C: Computer = { id: 'c'.repeat(24), name: 'atlas', status: 'running', project_id: P, server_id: S1, server_name: 'n12' } as Computer;

type Row = Record<string, unknown>;
interface World { owner?: string; listFail: boolean; containerReads: number; snaps: Row[]; restores: Array<{ name: string; body: unknown }>; renames: Array<{ name: string; body: unknown }>; takes: unknown[]; lists: number }
const row = (name: string, more: Row = {}): Row => ({ name, alias: null, created_at: '2026-10-20T09:12:00.000Z', last_used_at: null, expires_at: null, stateful: false, size: 1024 ** 3, ...more });
const world = (): World => ({
  snaps: [row('before-upgrade', { alias: 'before-upgrade' }), row('snap-20261018-2140', { stateful: true, last_used_at: '2026-10-21T10:00:00.000Z', expires_at: '2026-11-17T21:40:00.000Z' })],
  restores: [], renames: [], takes: [], lists: 0, containerReads: 0, listFail: false,
});

const nameOf = (r: FixtureRequest) => decodeURIComponent(/\/snapshots\/([^/?]+)/.exec(r.path)?.[1] ?? '');

function rules(w: World, o: { restore?: 'ok' | 'pending' | string; rename?: 'ok' | 'pending' | string; remove?: 'gone' | 'gone-unnamed' | 'gone-listfail' | 'refused' } = {}): FixtureRule[] {
  const unknown = answers.pending5xx(502);
  return [
    reply(snapshotRoutes.list, () => {
      w.lists += 1;
      if (w.listFail) return answers.refused(500, 'INTERNAL_ERROR');
      return answers.ok({ data: { computer_id: w.owner ?? C.id, snapshot_count: w.snaps.length, max_snapshots: 10, snapshots: w.snaps } });
    }),
    reply(snapshotRoutes.create, (r: FixtureRequest) => {
      w.takes.push(r.body);
      const alias = String((r.body as { alias?: string }).alias);
      w.snaps = [row(alias, { alias }), ...w.snaps];
      return answers.ok({ statusCode: 201, data: { snapshot: { name: alias, alias } } });
    }),
    reply(snapshotRoutes.restore, (r: FixtureRequest) => {
      w.restores.push({ name: nameOf(r), body: r.body });
      const k = o.restore ?? 'ok';
      if (k === 'pending') return unknown;
      if (k !== 'ok') return answers.refused(409, k);
      w.snaps = w.snaps.map((x) => (x.name === nameOf(r) ? { ...x, last_used_at: '2026-10-25T08:00:00.000Z' } : x));
      return answers.ok({ data: { success: true, message: 'Container restored from snapshot successfully' } });
    }),
    reply(snapshotRoutes.rename, (r: FixtureRequest) => {
      w.renames.push({ name: nameOf(r), body: r.body });
      const k = o.rename ?? 'ok';
      if (k === 'pending') return unknown;
      if (k !== 'ok') return answers.refused(400, k);
      const alias = (r.body as { alias: string | null }).alias;
      w.snaps = w.snaps.map((x) => (x.name === nameOf(r) ? { ...x, alias } : x));
      return answers.ok({ data: { snapshot: { name: nameOf(r), alias } } });
    }),
    reply(snapshotRoutes.remove, (r: FixtureRequest) => {
      if (o.remove === 'refused') return answers.refused(409, 'COMPUTER_OPERATION_IN_PROGRESS');
      w.snaps = w.snaps.filter((x) => x.name !== nameOf(r));
      if (o.remove === 'gone-unnamed') w.snaps = [...w.snaps, { alias: 'x' }];
      if (o.remove === 'gone-listfail') w.listFail = true;
      return answers.refused(404, 'SNAPSHOT_NOT_FOUND');
    }),
    reply(containersRoute, () => { w.containerReads += 1; return answers.ok({ data: { computers: [{ id: C.id, name: 'atlas', project_id: P }] } }); }),
    reply(routes.projects, answers.ok({ data: { projects: [{ id: P, alias: 'Personal' }] } })),
    reply(routes.servers, answers.ok({ data: [{ server: { id: S1, name: 'n12', city: 'Singapore', specs: {} }, status: 'active' }] })),
  ];
}

function mount(canWrite = true) {
  return render(
    routed(<QueryClientProvider client={queryClient}>
      <SnapshotsTab computer={C} canWrite={canWrite} />
    </QueryClientProvider>),
  );
}
const tab = () => document.body;
const user = () => userEvent.setup();
const ask = async () => screen.findByRole('alertdialog').catch(() => screen.getAllByRole('dialog').at(-1)!);
const rowOf = (name: string) => within(tab()).getAllByText(name).map((e) => e.closest<HTMLElement>('[data-row-id]')).find(Boolean)!;
/** The row's one button: Restore, named with the snapshot. */
const restoreIn = (name: string) => within(rowOf(name)).getByRole('button', { name: `Restore ${name}` });
/** A row's ⋯ menu item. */
async function menuItem(name: string, label: string) {
  await user().click(within(rowOf(name)).getByRole('button', { name: 'Row actions' }));
  return within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(label) });
}
async function allOff(label: string) {
  for (const n of ['before-upgrade', 'snap-20261018-2140']) {
    expect(await menuItem(n, label)).toHaveAttribute('aria-disabled', 'true');
    await user().keyboard('{Escape}');
  }
}
const settle = () => act(async () => new Promise((r) => setTimeout(r, 60)));

afterEach(() => {
  cleanup();
  queryClient.clear();
});

/** A glance fact's value, by its label. */
const fact = (label: string) => within(document.getElementById('snap-glance')!).getByText(label).closest('div')!.querySelector('dd')!;

describe('a snapshot row: the facts the API gives', () => {
  it('tags what it holds, says when it expires, and the glance says when one was last used', async () => {
    bootFixtureCore({ rules: rules(world()) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const r = rowOf('snap-20261018-2140');
    expect(within(r).getByText(strings['kind.memory'])).toBeInTheDocument();
    expect(within(r).queryByText(strings['expires.never'])).toBeNull();
    const plain = rowOf('before-upgrade');
    expect(within(plain).getByText(strings['kind.disk'])).toBeInTheDocument();
    expect(within(plain).getByText(strings['expires.never'])).toBeInTheDocument();
    // Each fact against its own label: Last used names the used one, Newest the newest.
    expect(fact(strings['glance.used'])).toHaveTextContent(/\(snap-20261018-2140\)$/);
    expect(fact(strings['glance.newest'])).toHaveTextContent(/\(before-upgrade\)$/);
    expect(fact(strings['glance.space'])).toHaveTextContent(/^2 GB$/);
  });

  it('a row without its taken time leaves Newest unsaid (the order cannot be told)', async () => {
    const w = world();
    w.snaps = [w.snaps[0]!, { ...w.snaps[1]!, created_at: null }];
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    expect(fact(strings['glance.newest'])).toHaveTextContent(strings['glance.cantTell']);
    expect(fact(strings['glance.used'])).toHaveTextContent(/\(snap-20261018-2140\)$/);
  });

  it('a taken time that is not a time leaves Newest unsaid; times are compared as times, not as text', async () => {
    const w = world();
    w.snaps = [w.snaps[0]!, { ...w.snaps[1]!, created_at: 'soon' }];
    bootFixtureCore({ rules: rules(w) });
    const m = mount();
    await within(tab()).findByText('before-upgrade');
    expect(fact(strings['glance.newest'])).toHaveTextContent(strings['glance.cantTell']);
    m.unmount();
    queryClient.clear();
    // 09:30 at +08:00 is 01:30 UTC, older than before-upgrade's 09:12 UTC, though its text sorts later.
    const w2 = world();
    w2.snaps = [w2.snaps[0]!, { ...w2.snaps[1]!, created_at: '2026-10-20T09:30:00+08:00' }];
    bootFixtureCore({ rules: rules(w2) });
    mount();
    await within(tab()).findByText('before-upgrade');
    expect(fact(strings['glance.newest'])).toHaveTextContent(/\(before-upgrade\)$/);
  });

  it('a used time that is not a time leaves Last used unsaid and the table shows the text as it came', async () => {
    const w = world();
    w.snaps = [w.snaps[0]!, { ...w.snaps[1]!, last_used_at: 'yesterday', expires_at: 'later' }];
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    expect(fact(strings['glance.used'])).toHaveTextContent(strings['glance.cantTell']);
    expect(within(tab()).getAllByText('later').length).toBeGreaterThan(0);
  });

  it('Last used is compared as times, not as text', async () => {
    const w = world();
    // 12:00 at +08:00 is 04:00 UTC, before the other row's 10:00 UTC, though its text sorts later.
    w.snaps = [{ ...w.snaps[0]!, last_used_at: '2026-10-21T12:00:00+08:00' }, w.snaps[1]!];
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    expect(fact(strings['glance.used'])).toHaveTextContent(/\(snap-20261018-2140\)$/);
  });

  it('a failed refresh over a list that was already missing rows says both', async () => {
    const w = world();
    w.snaps = [...w.snaps, { ...row('x'), name: undefined } as unknown as Row];
    bootFixtureCore({ rules: rules(w) });
    mount();
    expect(await within(tab()).findByText(/could not be read/)).toBeInTheDocument();
    w.listFail = true;
    await queryClient.refetchQueries();
    expect(await within(tab()).findByText(strings['snap.partialOld'])).toBeInTheDocument();
  });

  it('an answer naming another computer is not this one\'s list: the glance says Can\'t tell', async () => {
    const w = world();
    w.owner = 'd'.repeat(24);
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    for (const k of ['glance.kept', 'glance.newest', 'glance.space', 'glance.used'] as const) expect(fact(strings[k])).toHaveTextContent(strings['glance.cantTell']);
  });

  it('a list with a row it could not take is not whole: the glance says Can\'t tell for every fact and the table never says it holds them all', async () => {
    const w = world();
    w.snaps = [...w.snaps, { ...row('x'), name: undefined } as unknown as Row];
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    for (const k of ['glance.kept', 'glance.newest', 'glance.space', 'glance.used'] as const) expect(fact(strings[k])).toHaveTextContent(strings['glance.cantTell']);
    expect(await within(tab()).findByText(/could not be read/)).toBeInTheDocument();
    expect(within(tab()).queryByText(strings['snap.empty'])).toBeNull();
  });

  it('the glance says Never while no snapshot was used, and Can\'t tell when the list cannot be read', async () => {
    const w = world();
    w.snaps = w.snaps.map((x) => ({ ...x, last_used_at: null }));
    bootFixtureCore({ rules: rules(w) });
    const m = mount();
    await within(tab()).findByText('before-upgrade');
    const glance = () => document.getElementById('snap-glance')!;
    expect(within(glance()).getByText(strings['glance.used.never'])).toBeInTheDocument();
    m.unmount();
    queryClient.clear();
    w.listFail = true;
    mount();
    await waitFor(() => expect(within(glance()).getAllByText(strings['glance.cantTell'])).toHaveLength(4));
  });
});

describe('restore', () => {
  it('asks first, says what is lost, and sends nothing on Cancel', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(restoreIn('before-upgrade'));
    const q = await ask();
    expect(within(q).getByText('Restore before-upgrade?')).toBeInTheDocument();
    expect(within(q).getByText(/atlas goes back to how it was when before-upgrade was taken\. Files and settings changed since then are lost/)).toBeInTheDocument();
    await user().click(within(q).getByRole('button', { name: /cancel/i }));
    await settle();
    expect(w.restores).toEqual([]);
  });

  it('Confirm sends one PATCH for exactly that snapshot, then says the computer was restored and reads the list again', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await within(tab()).findByText('before-upgrade');
    const before = w.lists;
    await user().click(restoreIn('snap-20261018-2140'));
    await user().click(within(await ask()).getByRole('button', { name: strings['restore.go'] }));
    expect(await within(tab()).findByText(strings['restore.done'])).toBeInTheDocument();
    expect(w.restores).toEqual([{ name: 'snap-20261018-2140', body: {} }]);
    await waitFor(() => expect(w.lists).toBeGreaterThan(before));
  });

  it('a refusal shows its own sentence and is not held', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { restore: 'COMPUTER_NETWORK_POLICY_MISSING' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(restoreIn('before-upgrade'));
    await user().click(within(await ask()).getByRole('button', { name: strings['restore.go'] }));
    expect(await within(tab()).findByText(strings['err.COMPUTER_NETWORK_POLICY_MISSING'])).toBeInTheDocument();
    expect(within(tab()).queryByText(/may already have gone through/)).toBeNull();
    expect(w.restores).toHaveLength(1);
  });

  it('stopping tracking of a held restore says a second send repeats it, never that it makes a second one', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { restore: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(restoreIn('before-upgrade'));
    await user().click(within(await ask()).getByRole('button', { name: strings['restore.go'] }));
    await within(tab()).findByText(/Restoring before-upgrade may already have gone through/);
    await user().click(within(tab()).getAllByRole('button', { name: new RegExp(`^${strings['held.dismiss']}`) })[0]!);
    const d = await screen.findByRole('alertdialog');
    expect(d).toHaveTextContent(strings['held.dismissBodyChange']);
    expect(d).not.toHaveTextContent(strings['held.dismissBody']);
  });

  it('an unknown outcome is held, blocks every row action, and is freed only by a moved last_used_at', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { restore: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(restoreIn('before-upgrade'));
    await user().click(within(await ask()).getByRole('button', { name: strings['restore.go'] }));
    expect(await within(tab()).findByText(/Restoring before-upgrade may already have gone through/)).toBeInTheDocument();
    expect(within(tab()).queryByText(/failed|could not be (restored|renamed|saved)/i)).toBeNull();
    // Soft-disabled with its reason (the kit's disabled row action, as the menu items above): focusable, and its one tip
    // says the whole action (the visible word is only "Restore") and why it waits.
    for (const b of within(tab()).getAllByRole('button', { name: /^Restore \S/ })) {
      expect(b).toHaveAttribute('aria-disabled', 'true');
      expect(b).toHaveAccessibleDescription(`${b.getAttribute('aria-label') ?? ''}. ${strings['row.busy']}`);
    }
    await allOff(strings['snap.row.delete']);
    // The snapshot has not been used since: nothing is proved.
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await settle();
    expect(within(tab()).getByText(/may already have gone through/)).toBeInTheDocument();
    // The API moved last_used_at: the restore reached it.
    w.snaps = w.snaps.map((x) => (x.name === 'before-upgrade' ? { ...x, last_used_at: '2026-10-25T08:00:00.000Z' } : x));
    const reads = w.containerReads;
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(within(tab()).queryByText(/may already have gone through/)).toBeNull());
    expect(w.restores).toHaveLength(1);
    // A proved restore moves the page's computers list, as a proved take or delete does.
    await waitFor(() => expect(w.containerReads).toBeGreaterThan(reads));
  });

  it('a snapshot already used before the send is proved only by a later last_used_at', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { restore: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(restoreIn('snap-20261018-2140'));
    await user().click(within(await ask()).getByRole('button', { name: strings['restore.go'] }));
    await within(tab()).findByText(/may already have gone through/);
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await settle();
    expect(within(tab()).getByText(/may already have gone through/)).toBeInTheDocument();
    w.snaps = w.snaps.map((x) => (x.name === 'snap-20261018-2140' ? { ...x, last_used_at: '2026-10-25T08:30:00.000Z' } : x));
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(within(tab()).queryByText(/may already have gone through/)).toBeNull());
  });

  it('is not offered to a session that cannot write', async () => {
    bootFixtureCore({ rules: rules(world()) });
    mount(false);
    await within(tab()).findByText('before-upgrade');
    expect(within(tab()).queryByRole('button', { name: /^Restore / })).toBeNull();
    expect(await menuItem('before-upgrade', strings['snap.row.rename'])).toBeInTheDocument();
  });
});

describe('rename', () => {
  const open = async (name: string) => {
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem(name, strings['snap.row.rename']));
    return screen.findByRole('textbox', { name: strings['field.label'] });
  };

  it('opens on the current label, keeps Save off until it changes, and sends one PATCH with the new label', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    const field = await open('before-upgrade');
    expect(field).toHaveValue('before-upgrade');
    const save = screen.getByRole('button', { name: strings['rename.go'] });
    expect(save).toBeDisabled();
    await user().clear(field);
    await user().type(field, '  pre-deploy  ');
    await user().click(screen.getByRole('button', { name: strings['rename.go'] }));
    await waitFor(() => expect(w.renames).toEqual([{ name: 'before-upgrade', body: { alias: 'pre-deploy' } }]));
    // The label first, the snapshot's own name after it.
    const renamed = await within(tab()).findByText('pre-deploy (before-upgrade)');
    expect(renamed.closest('[data-row-id]')).not.toBeNull();
  });

  it('an empty label removes it (alias null)', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    const field = await open('before-upgrade');
    await user().clear(field);
    await user().click(screen.getByRole('button', { name: strings['rename.go'] }));
    await waitFor(() => expect(w.renames).toEqual([{ name: 'before-upgrade', body: { alias: null } }]));
  });

  it('a hidden character keeps Save off and sends nothing', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    const field = await open('snap-20261018-2140');
    await user().type(field, 'a​b');
    expect(screen.getByRole('button', { name: strings['rename.go'] })).toBeDisabled();
    // The rule is shown twice: as the help and as the error of the field.
    expect(screen.getAllByText(strings['field.labelRule']).length).toBeGreaterThan(1);
    await settle();
    expect(w.renames).toEqual([]);
  });

  it('an unknown outcome is held and proved only by the new label in a fresh list', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { rename: 'pending' }) });
    mount();
    const field = await open('before-upgrade');
    await user().clear(field);
    await user().type(field, 'kept');
    await user().click(screen.getByRole('button', { name: strings['rename.go'] }));
    expect(await screen.findByText(/The label of before-upgrade may already have changed/)).toBeInTheDocument();
    expect(screen.queryByText(/failed|could not be (restored|renamed|saved)/i)).toBeNull();
    await user().click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await settle();
    expect(screen.getAllByText(/may already have changed/).length).toBeGreaterThan(0);
    w.snaps = w.snaps.map((x) => (x.name === 'before-upgrade' ? { ...x, alias: 'kept' } : x));
    await user().click(screen.getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(screen.queryByText(/may already have changed/)).toBeNull());
    expect(w.renames).toHaveLength(1);
  });
});

describe('a held rename after its drawer is closed', () => {
  it('stays on the page as the held band, with Check again, until a fresh list proves it', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { rename: 'pending' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.rename']));
    const field = await screen.findByRole('textbox', { name: strings['field.label'] });
    await user().clear(field);
    await user().type(field, 'kept');
    await user().click(screen.getByRole('button', { name: strings['rename.go'] }));
    await screen.findByText(/The label of before-upgrade may already have changed/);
    await user().keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/The label of before-upgrade may already have changed/)).toBeInTheDocument();
    await allOff(strings['snap.row.rename']);
    w.snaps = w.snaps.map((x) => (x.name === 'before-upgrade' ? { ...x, alias: 'kept' } : x));
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await waitFor(() => expect(screen.queryByText(/may already have changed/)).toBeNull());
    expect(w.renames).toHaveLength(1);
  });
});

describe('restore asks the server\'s list first and never sends for a snapshot that is not there as asked', () => {
  const confirm = async (name: string) => {
    await within(tab()).findByText(name);
    await user().click(restoreIn(name));
    const q = await ask();
    return q;
  };
  it('a snapshot another session removed since the list was drawn: nothing is sent, and it says so', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    const q = await confirm('before-upgrade');
    w.snaps = w.snaps.filter((x) => x.name !== 'before-upgrade');
    await user().click(within(q).getByRole('button', { name: strings['restore.go'] }));
    expect(await within(tab()).findByText(/before-upgrade is no longer in the list, so nothing was restored/)).toBeInTheDocument();
    expect(w.restores).toEqual([]);
  });
  it('a snapshot replaced under the same name: nothing is sent', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    const q = await confirm('before-upgrade');
    w.snaps = w.snaps.map((x) => (x.name === 'before-upgrade' ? { ...x, created_at: '2026-10-25T07:00:00.000Z' } : x));
    await user().click(within(q).getByRole('button', { name: strings['restore.go'] }));
    expect(await within(tab()).findByText(/before-upgrade has changed since you opened this question/)).toBeInTheDocument();
    expect(w.restores).toEqual([]);
  });
  it('a list that cannot be read just before sending: nothing is sent, and it is not shown as a failed restore', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    const q = await confirm('before-upgrade');
    w.listFail = true;
    await user().click(within(q).getByRole('button', { name: strings['restore.go'] }));
    expect(await within(tab()).findByText(/could not be read just before sending, so nothing was restored/)).toBeInTheDocument();
    expect(w.restores).toEqual([]);
  });
  it('the baseline of the proof is the fresh read, not the older row: an unknown restore is not proved by a timestamp it already had', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { restore: 'pending' }) });
    mount();
    const q = await confirm('before-upgrade');
    // another session used the snapshot after the list was drawn: the fresh read carries this timestamp
    w.snaps = w.snaps.map((x) => (x.name === 'before-upgrade' ? { ...x, last_used_at: '2026-10-25T07:30:00.000Z' } : x));
    await user().click(within(q).getByRole('button', { name: strings['restore.go'] }));
    expect(await within(tab()).findByText(/may already have gone through/)).toBeInTheDocument();
    await user().click(within(tab()).getAllByRole('button', { name: strings['held.check'] })[0]!);
    await settle();
    expect(within(tab()).getByText(/may already have gone through/)).toBeInTheDocument();
  });
});

describe('a delete of a snapshot another session already deleted', () => {
  it('a list that already lacks the name when the question is confirmed: "already deleted" from that fresh read, nothing sent', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { remove: 'gone-listfail' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    const ok = await screen.findByRole('button', { name: strings['drop.go'] });
    // another session removed it, and a refresh elsewhere cached its absence while the question stayed open
    w.snaps = w.snaps.filter((x) => x.name !== 'before-upgrade');
    await act(async () => { await queryClient.refetchQueries(); });
    await user().click(ok);
    // The delete reads the list first; a fresh, complete read without the name is the proof, so no DELETE goes out.
    expect(await within(tab()).findByText(/was already deleted/)).toBeInTheDocument();
    expect(w.listFail).toBe(false); // the DELETE (which turns list reads into failures here) never went out
  });
  it('a read that fails after the 404 keeps the older list: it never says "already deleted"', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { remove: 'gone-listfail' }) });
    mount();
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    await user().click(await screen.findByRole('button', { name: strings['drop.go'] }));
    await waitFor(() => expect(w.lists).toBeGreaterThan(1));
    await settle();
    expect(within(tab()).queryByText(/was already deleted/)).toBeNull();
  });
  const drop = async (): Promise<void> => {
    await within(tab()).findByText('before-upgrade');
    await user().click(await menuItem('before-upgrade', strings['snap.row.delete']));
    await user().click(await screen.findByRole('button', { name: strings['drop.go'] }));
  };
  it('reads the list again and says "already deleted" when the fresh complete list lacks it; the stale row goes', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { remove: 'gone' }) });
    mount();
    await drop();
    expect(await within(tab()).findByText(/was already deleted/)).toBeInTheDocument();
    expect(within(tab()).queryByText("Didn't go through", { exact: false })).toBeNull();
    await waitFor(() => expect(within(tab()).queryByText('before-upgrade')).toBeNull());
  });
  it('a fresh list that is not complete (a row without a name) proves nothing: no "already deleted"', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { remove: 'gone-unnamed' }) });
    mount();
    await drop();
    await waitFor(() => expect(w.lists).toBeGreaterThan(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(within(tab()).queryByText(/was already deleted/)).toBeNull();
  });
  it('a refusal that is not "gone" never says it was already deleted', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w, { remove: 'refused' }) });
    mount();
    await drop();
    await waitFor(() => expect(w.lists).toBeGreaterThan(1));
    expect(within(tab()).queryByText(/was already deleted/)).toBeNull();
    expect(within(tab()).getByText('before-upgrade')).toBeInTheDocument();
  });
});

describe('take with a keep-for number of days', () => {
  const head = () => within(document.getElementById('snapshots')!).getByRole('button', { name: strings['take.go'] });
  const drawer = () => screen.getByRole('dialog');
  const go = () => within(drawer()).getByRole('button', { name: strings['take.go'] });
  const fill = async (days: string) => {
    await within(tab()).findByText('before-upgrade');
    await user().click(head());
    const field = within(await screen.findByRole('dialog')).getByRole('textbox', { name: strings['field.snapName'] });
    await user().clear(field);
    await user().type(field, 'pre-deploy');
    if (days) await user().type(within(drawer()).getByRole('textbox', { name: strings['take.expiry'] }), days);
  };

  it('sends expiry with the alias when days are typed, and only the alias when they are not', async () => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await fill('30');
    await user().click(go());
    await within(tab()).findByText('pre-deploy');
    expect(w.takes).toEqual([{ alias: 'pre-deploy', expiry: 30 }]);
    // The next one starts without the days.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user().click(head());
    expect(within(await screen.findByRole('dialog')).getByRole('textbox', { name: strings['take.expiry'] })).toHaveValue('');
    const field = within(drawer()).getByRole('textbox', { name: strings['field.snapName'] });
    await user().clear(field);
    await user().type(field, 'second');
    await user().click(go());
    await within(tab()).findByText('second');
    expect(w.takes[1]).toEqual({ alias: 'second' });
  });

  it.each(['0', '3651', 'abc', '1.5', '-3', '12345'])('%s keeps Take off and sends nothing', async (days) => {
    const w = world();
    bootFixtureCore({ rules: rules(w) });
    mount();
    await fill(days);
    expect(go()).toBeDisabled();
    await user().click(go());
    expect(w.takes).toEqual([]);
  });
});

describe('the folder picker opens at the top of the computer', () => {
  const tree: Record<string, string[]> = { '/': ['etc', 'home', 'root', 'stat'], '/home': ['amy'] };
  function treeRules(seen: string[]): FixtureRule[] {
    const list = (p: string) => answers.ok({ path: p, count: 0, entries: (tree[p] ?? []).map((name) => ({ name, is_dir: true, size: 0 })) });
    return [
      reply(rootRoute, () => { seen.push('/'); return answers.ok({ breadcrumb: '', paths: (tree['/'] ?? []).map((name) => ({ path_type: 'Dir', name, mtime: 0, size: 0 })), allow_upload: false, allow_delete: false }); }),
      reply(folderRoute, (r: FixtureRequest) => {
        const p = '/' + r.path.split('?')[0]!.split('/').slice(4).map(decodeURIComponent).join('/');
        seen.push(p);
        return list(p);
      }),
      reply(countRoute, answers.ok({ total_scanned: 3, truncated: false, entries: [], count: 0 })),
    ];
  }
  const zip = () => render(routed(<QueryClientProvider client={queryClient}><ZipBackup computer={C} /></QueryClientProvider>));

  it('Browse folders reads and shows the top folder first, not a home folder', async () => {
    const seen: string[] = [];
    bootFixtureCore({ rules: treeRules(seen) });
    zip();
    await user().click(await screen.findByRole('button', { name: strings['zip.add'] }));
    await user().click(await screen.findByRole('button', { name: strings['pick.open'] }));
    expect(await screen.findByRole('button', { name: 'Open home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open etc' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open root' })).toBeInTheDocument();
    expect(seen[0]).toBe('/');
    expect(seen).not.toContain('/root');
    expect(screen.getByText(strings['pick.top'])).toBeInTheDocument();
  });

  it('the top itself cannot be added; a folder inside it can; Up from a top folder goes back to the top', async () => {
    bootFixtureCore({ rules: treeRules([]) });
    zip();
    await user().click(await screen.findByRole('button', { name: strings['zip.add'] }));
    await user().click(await screen.findByRole('button', { name: strings['pick.open'] }));
    await screen.findByRole('button', { name: 'Open home' });
    // Off with its reason (the kit's reason button stays focusable): the top cannot be added, a listed folder is in the list.
    expect(screen.getByRole('button', { name: strings['pick.add'] })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Add home to the list' })).toHaveAttribute('aria-disabled', 'true');
    await user().click(screen.getByRole('button', { name: 'Open home' }));
    expect(await screen.findByRole('button', { name: 'Open amy' })).toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Add amy to the list' }));
    expect((await screen.findAllByText('\u2066/home/amy\u2069')).length).toBeGreaterThan(0);
    await user().click(screen.getByRole('button', { name: strings['pick.up'] }));
    expect(await screen.findByRole('button', { name: 'Open root' })).toBeInTheDocument();
  });

  // Core writes such a first part with its first letter as %XX, so the folder is listed like any other.
  it('a top folder the files program reads as a command (stat) opens like any other, and can be added', async () => {
    const seen: string[] = [];
    bootFixtureCore({ rules: treeRules(seen) });
    zip();
    await user().click(await screen.findByRole('button', { name: strings['zip.add'] }));
    await user().click(await screen.findByRole('button', { name: strings['pick.open'] }));
    await screen.findByRole('button', { name: 'Open home' });
    expect(screen.getByRole('button', { name: 'Add stat to the list' })).toBeEnabled();
    await user().click(screen.getByRole('button', { name: 'Open stat' }));
    await waitFor(() => expect(seen).toContain('/stat'));
    await user().click(await screen.findByRole('button', { name: strings['pick.add'] }));
    expect((await screen.findAllByText('\u2066/stat\u2069')).length).toBeGreaterThan(0);
  });

  it('the quick buttons include the top and still reach the well-known folders', async () => {
    const seen: string[] = [];
    bootFixtureCore({ rules: treeRules(seen) });
    zip();
    await user().click(await screen.findByRole('button', { name: strings['zip.add'] }));
    await user().click(await screen.findByRole('button', { name: strings['pick.open'] }));
    await screen.findByRole('button', { name: 'Open home' });
    // Three starts are drawn; the least used one is in the row's More menu.
    await user().click(screen.getByRole('button', { name: kit['action.more'] }));
    await user().click(await screen.findByRole('menuitem', { name: strings['pick.start.etc'] }));
    await waitFor(() => expect(seen).toContain('/etc'));
    await user().click(screen.getByRole('button', { name: strings['pick.start.top'] }));
    expect(await screen.findByRole('button', { name: 'Open home' })).toBeInTheDocument();
  });
});
