// Shared folders on real core (fixture transport): the computer's two lists, each share's state in the
// Hub's words with links into Files, a list that cannot be read shown as such (never as "nothing shared"), the switch
// to every computer's shares in Files only, and the section under Files' Storage tab (the Shared folders switch is on).
import { bootFixtureCore, queryClient, type FixtureRule } from '@core';
import kitStrings from '@kit/strings.en.json';
// eslint-disable-next-line no-restricted-imports -- a test harness for the section, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness: the tables read the URL; not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage } from '@app/testing';
import filesPage from '../page';
import storageStrings from '../storage/strings.en.json';
import { ATLAS_ID, CEDAR_ID, GRANITE_ID, listAnswer, shareRules, shareStates, shareWire, sharedWithAtlas } from './fixtures';
import { shareRoutes } from './routes';
import { SharesSection } from './SharesSection';
import strings from './strings.en.json';
import { answers, containersRoute, fixtureWorld, reply } from '@core';

let history = createMemoryHistory({ initialEntries: ['/'] });
const routed = (node: ReactElement) => {
  history = createMemoryHistory({ initialEntries: ['/'] });
  return <RouterProvider router={createRouter({ routeTree: createRootRoute({ component: () => node }), history })} />;
};
/** Where the last action went: the computer handle and folder of the Files link. */
const landed = () => {
  const q = new URLSearchParams(history.location.search);
  return { at: history.location.pathname, computer: q.get('computer'), path: q.get('path') };
};
const show = (node: ReactElement, rules: FixtureRule[]) => {
  bootFixtureCore({ rules });
  return render(routed(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>));
};
const toCedar = (w: Record<string, unknown>) => ({ ...w, target_computer_id: CEDAR_ID });
const ATLAS = { id: ATLAS_ID };
const table = (name: string) => screen.findByRole('table', { name }, { timeout: 8000 });
const rowOf = async (name: string, text: string) => (await within(await table(name)).findAllByText(text))[0]!.closest('tr') as HTMLElement;
async function menuOf(row: HTMLElement): Promise<string[]> {
  await userEvent.click(within(row).getByRole('button', { name: kitStrings['table.rowActions'] }));
  const items = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent ?? '');
  await userEvent.keyboard('{Escape}');
  return items;
}

async function pick(row: HTMLElement, label: string): Promise<void> {
  await userEvent.click(within(row).getByRole('button', { name: kitStrings['table.rowActions'] }));
  await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: label }));
}
const cedarRow = fixtureWorld.computers.find((c) => c.id === CEDAR_ID)!;
/** Another cedar whose id ends like cedar's: the same handle (cedar.00c3), so Files could not tell them apart. */
const twinCedar = reply(containersRoute, () => ({ status: 200, body: { data: { computers: [{ ...cedarRow, id: 'dddddddd00000000000000c3' }, ...fixtureWorld.computers] } } }));

afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); });

describe('SharesSection: this computer', () => {
  it('lists what atlas shares and what is shared with it, each with its own state and words', async () => {
    show(<SharesSection computer={ATLAS} />, shareRules({ shares: [{ ...shareStates.on, target_computer_id: GRANITE_ID }, toCedar(shareStates.readWrite), sharedWithAtlas] }));
    const given = await table(strings['given.title']);
    // cedar is stopped: the share is paused while it is (state.ts targetStopped), said with its name.
    const rw = await rowOf(strings['given.title'], '/srv/data');
    expect(within(rw).getByText(strings['access.readwrite'])).toBeInTheDocument();
    expect(within(rw).getByText(strings['pill.targetStopped'])).toBeInTheDocument();
    expect(within(rw).getByText('Paused while cedar is stopped.')).toBeInTheDocument();
    // granite is in another realm: named as not listed, never as stopped, and not claimed to work (the server said active).
    const other = await rowOf(strings['given.title'], '/home/ada/projects');
    expect(within(other).getByText(strings['computer.unknown'])).toBeInTheDocument();
    expect(within(other).getByText(strings['pill.on'])).toBeInTheDocument();
    expect(within(given).queryByText(strings['pill.targetStopped'], { selector: '*' })).not.toBeNull();
    const received = await table(strings['received.title']);
    expect(within(received).getByText('/data/photos')).toBeInTheDocument();
    expect(within(received).getByText('cedar')).toBeInTheDocument();
  }, 40000);

  it('links into Files: the folder, and where it appears only on a listed computer with a path the servers mount', async () => {
    show(<SharesSection computer={ATLAS} />, shareRules({ shares: [toCedar(shareStates.readWrite), toCedar(shareStates.legacy), { ...shareStates.on, target_computer_id: GRANITE_ID }] }));
    // The folder itself is the row's inline button; the rest are in its menu.
    const rw = await rowOf(strings['given.title'], '/srv/data');
    expect(within(rw).getByRole('button', { name: strings['act.open'] })).toBeInTheDocument();
    expect(await menuOf(rw)).toEqual(['Open on cedar', 'Copy where it appears on cedar']);
    // An older share's stored path is not one the servers mount: no "Open on", the copy keeps what the API said.
    expect(await menuOf(await rowOf(strings['given.title'], '/home/ada/old'))).toEqual(['Copy where it appears on cedar']);
    // A receiver the Hub does not list has no link.
    expect(await menuOf(await rowOf(strings['given.title'], '/home/ada/projects'))).toEqual([`Copy where it appears on ${strings['computer.unknown']}`]);
  }, 40000);

  it('each action opens the folder on the computer that holds it: source and target never mixed', async () => {
    const rwAt = String(shareStates.readWrite.mount_path);
    show(<SharesSection computer={ATLAS} />, shareRules({ shares: [toCedar(shareStates.readWrite), sharedWithAtlas] }));
    const given = await rowOf(strings['given.title'], '/srv/data');
    await userEvent.click(within(given).getByRole('button', { name: strings['act.open'] }));
    await waitFor(() => expect(landed()).toEqual({ at: '/files', computer: 'atlas.00a1', path: '/srv/data' }));
    await pick(await rowOf(strings['given.title'], '/srv/data'), 'Open on cedar');
    await waitFor(() => expect(landed()).toEqual({ at: '/files', computer: 'cedar.00c3', path: rwAt }));
    const received = await rowOf(strings['received.title'], '/data/photos');
    await userEvent.click(within(received).getByRole('button', { name: strings['act.open'] }));
    await waitFor(() => expect(landed()).toEqual({ at: '/files', computer: 'atlas.00a1', path: String(sharedWithAtlas.mount_path) }));
    await pick(await rowOf(strings['received.title'], '/data/photos'), 'Open the original on cedar');
    await waitFor(() => expect(landed()).toEqual({ at: '/files', computer: 'cedar.00c3', path: '/data/photos' }));
  }, 40000);

  it('gives no link to a computer whose handle another listed computer shares (Files would open the first)', async () => {
    show(<SharesSection computer={ATLAS} />, [twinCedar, ...shareRules({ shares: [toCedar(shareStates.readWrite), sharedWithAtlas] })]);
    // atlas is unique: its links stay; both cedars read cedar.00c3, so nothing opens on cedar. The copy stays.
    const given = await rowOf(strings['given.title'], '/srv/data');
    expect(within(given).getByRole('button', { name: strings['act.open'] })).toBeInTheDocument();
    expect(await menuOf(given)).toEqual(['Copy where it appears on cedar']);
    const received = await rowOf(strings['received.title'], '/data/photos');
    expect(within(received).getByRole('button', { name: strings['act.open'] })).toBeInTheDocument();
    const more = within(received).queryByRole('button', { name: kitStrings['table.rowActions'] });
    if (more) {
      await userEvent.click(more);
      expect(screen.queryByRole('menuitem', { name: 'Open the original on cedar' })).toBeNull();
      await userEvent.keyboard('{Escape}');
    }
  }, 40000);

  it('says what each stored state means, and that writes may have been lost where the server says so', async () => {
    show(<SharesSection computer={ATLAS} />, shareRules({ shares: [toCedar(shareStates.failed), toCedar(shareStates.off), toCedar(shareStates.waiting), toCedar(shareStates.ownerDown), toCedar(shareStates.legacy)] }));
    const given = await table(strings['given.title']);
    for (const k of ['failed', 'off', 'waiting', 'ownerDown', 'legacy'] as const) {
      expect(within(given).getByText(strings[`pill.${k}`]), k).toBeInTheDocument();
    }
    expect(within(given).getByText('Recent changes made on cedar may have been lost.')).toBeInTheDocument();
    // The API's own instruction text never shows.
    expect(within(given).queryByText(/set enabled to true/)).toBeNull();
  }, 40000);

  it('a share whose answer leaves out where it appears is "not clear", never "on"', async () => {
    const { mount_path: _m, ...noPath } = shareStates.on;
    show(<SharesSection computer={ATLAS} />, shareRules({ shares: [{ ...noPath, target_computer_id: GRANITE_ID }] }));
    const row = await rowOf(strings['given.title'], '/home/ada/projects');
    expect(within(row).getByText(strings['pill.unclear'])).toBeInTheDocument();
    expect(within(row).queryByText(strings['pill.on'])).toBeNull();
    expect(within(row).getByText(strings['at.unknown'])).toBeInTheDocument();
  }, 40000);

  it('a list that cannot be read shows its error with Retry, never "nothing shared"', async () => {
    show(<SharesSection computer={ATLAS} />, shareRules({ listFails: true }));
    expect((await screen.findAllByRole('button', { name: /retry|try again/i }, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['given.empty'])).toBeNull();
    expect(screen.queryByText(strings['received.empty'])).toBeNull();
  }, 40000);

  it('an answer that is not a list is an error too, and rows it could not read are counted', async () => {
    show(<SharesSection computer={ATLAS} />, [
      reply(shareRoutes.list, () => answers.ok({ data: { not: 'a list' } })),
      reply(shareRoutes.incoming, () => answers.ok(listAnswer(sharedWithAtlas, { id: 'broken' }))),
    ]);
    expect((await screen.findAllByRole('button', { name: /retry|try again/i }, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['given.empty'])).toBeNull();
    expect(await screen.findByText('1 shared folder could not be read and is not shown.')).toBeInTheDocument();
  }, 40000);

  it('says so when nothing is shared, from a list read whole', async () => {
    show(<SharesSection computer={ATLAS} />, shareRules({ shares: [] }));
    expect(await screen.findByText(strings['given.empty'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText(strings['received.empty'])).toBeInTheDocument();
  }, 40000);
});

describe('SharesSection: every computer (Files only)', () => {
  it('has no switch on the computer page', async () => {
    show(<SharesSection computer={ATLAS} />, shareRules());
    await table(strings['given.title']);
    expect(screen.queryByRole('radiogroup', { name: strings['scope.label'] })).toBeNull();
  }, 40000);

  it('shows every share once, with both ends, when switched to all my computers', async () => {
    const elsewhere = shareWire({ id: 'sh_0902', source_computer_id: CEDAR_ID, target_computer_id: GRANITE_ID, source_path: '/var/www' });
    show(<SharesSection computer={ATLAS} scopes />, shareRules({ shares: [toCedar(shareStates.readWrite), sharedWithAtlas, elsewhere] }));
    await table(strings['given.title']);
    await userEvent.click(screen.getByRole('radio', { name: strings['scope.all'] }));
    const all = await table(strings['all.title']);
    await waitFor(() => expect(within(all).getAllByRole('row').length).toBe(4)); // header + 3 shares, none twice
    expect(within(all).getByText('/var/www')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: strings['given.title'] })).toBeNull();
  }, 40000);
});

describe('Files: the section is under the Storage tab', () => {
  const PATH = `/files?a=atlas.00a1&tab=storage`;
  it('under the storage lists, with the every-computer switch and, with nothing shared, both lists saying so', async () => {
    await renderPage(filesPage, { path: PATH });
    expect(await screen.findByText(storageStrings['backends.empty'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText(strings.title, undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: strings['scope.all'] })).toBeInTheDocument();
    // The page's default state has no share: each list read whole says so, never a failed read.
    expect(await screen.findByText(strings['given.empty'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText(strings['received.empty'])).toBeInTheDocument();
  }, 40000);
});
