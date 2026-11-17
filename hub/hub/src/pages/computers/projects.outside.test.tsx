// A realm's projects list holds only projects tagged with that realm, while a computer's realms are its own.
// A realm showing computers whose project it does not list must still show that project (named from the account's
// whole list, marked "Not in this realm", with no Rename or Delete), and a computer's Project fact shows its name.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureWorld } from '@core';
import { definePage } from '@kit';
import { CopyDrawer } from './parts/Drawers';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers, copySends, projectSends } from './fixtures';
import { handleOf, missingProjectIds, projectsInView } from './logic';
import page from './page';
import strings from './strings.en.json';
import type { Project } from './types';

const [HOME, ACME, LAB] = fixtureWorld.projects;
if (!HOME || !ACME || !LAB) throw new Error('fixture projects');
const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
/** The row's action menu items (closed again after). */
const actionsOf = async (row: HTMLElement) => {
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  const items = within(await screen.findByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent ?? '');
  await userEvent.keyboard('{Escape}');
  return items;
};
const wholeListReads = () => projectSends.filter((x) => x.method === 'GET' && x.path.endsWith('/projects'));
const oneReads = () => projectSends.filter((x) => x.method === 'GET' && /\/projects\/[^/]+$/.test(x.path));

beforeEach(() => {
  projectSends.length = 0;
});

describe('computers: projects outside the shown realm', () => {
  it('projectsInView adds only the listed computers\' projects the realm lacks, marked outside', () => {
    const home: Project = { id: 'p1', name: 'Home' };
    const acme: Project = { id: 'p2', name: 'Acme' };
    const lab: Project = { id: 'p3', name: 'Lab' };
    const cs = [{ project_id: 'p1' }, { project_id: 'p2' }, { project_id: 'p2' }, { project_id: 'p9' }] as never;
    expect(missingProjectIds([home], cs)).toEqual(['p2', 'p9']);
    expect(missingProjectIds(undefined, cs)).toEqual([]);
    const acmeR = { ...acme, realm_ids: ['rA'] };
    expect(projectsInView([home], [acmeR, lab], cs, 'rH')).toEqual([home, { ...acmeR, outside: true, readOnly: true }]);
    // A project that names the shown realm was only past the list's page: shown, not outside. In All realms nothing is.
    expect(projectsInView([home], [{ ...acme, realm_ids: ['rH'] }], cs, 'rH')).toEqual([home, { ...acme, realm_ids: ['rH'], outside: false, readOnly: true }]);
    expect(projectsInView([home], [acmeR], cs, undefined)).toEqual([home, { ...acmeR, outside: false, readOnly: true }]);
    // Not read (yet): the realm's own list alone; the realm's list loading: nothing.
    expect(projectsInView([home], undefined, cs, 'rH')).toEqual([home]);
    expect(projectsInView(undefined, [acmeR], cs, 'rH')).toBeUndefined();
  });

  it('Projects shows every project of this realm\'s computers, the outside ones tagged, with a note and no Rename or Delete', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectOutside' });
    const acme = await rowOf(ACME.name);
    expect(within(acme).getByText(strings['proj.outside'])).toBeInTheDocument();
    expect(await rowOf(LAB.name)).toHaveTextContent(strings['proj.outside']);
    const home = await rowOf(HOME.name);
    expect(within(home).queryByText(strings['proj.outside'])).toBeNull();
    expect(screen.getByText(strings['proj.outsideNote'])).toBeInTheDocument();
    // An outside row offers only Permissions (it reads), never Rename or Delete.
    expect(await actionsOf(acme)).toEqual([strings['pp.open'] + '…']);
    expect(within(home).getByRole('button', { name: 'Row actions' })).toBeInTheDocument();
    expect(screen.queryByText(strings['proj.empty'])).toBeNull();
    // Its Permissions drawer says it is outside this realm.
    await userEvent.click(within(acme).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: new RegExp(strings['pp.open']) }));
    const d = await screen.findByRole('dialog', { name: strings['pp.title'].replace('{{name}}', ACME.name) }, { timeout: 8000 });
    expect(within(d).getByText(strings['proj.outside'])).toBeInTheDocument();
  });

  it('a computer whose project is outside the realm shows the project\'s name in its Overview', async () => {
    const c = computers.find((x) => x.project_id === ACME.id);
    if (!c) throw new Error('fixture computer in Acme');
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}`, state: 'projectOutside' });
    const dt = await screen.findByText(strings['fact.project'], { selector: 'dt' }, { timeout: 8000 });
    const fact = dt.nextElementSibling as HTMLElement;
    await waitFor(() => expect(within(fact).getByRole('link', { name: ACME.name })).toBeInTheDocument(), { timeout: 8000 });
  });

  it('a missing project is read by id, only when a computer\'s project is missing from the realm\'s list', async () => {
    await renderPage(page, { path: '/computers/projects' });
    await rowOf(ACME.name);
    expect(screen.queryByText(strings['proj.outsideNote'])).toBeNull();
    expect(oneReads()).toHaveLength(0);
    expect(wholeListReads()).toHaveLength(0);
  });

  it('a realm with no project of its own shows its computers\' projects, read by id, never "No projects"', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectOutsideOnly' });
    expect(await rowOf(ACME.name)).toHaveTextContent(strings['proj.outside']);
    // Home names this realm itself (only missing from the list's answer): shown, not tagged outside, and read only
    // like every project read by id (the realm's list, which lacks it, is what proves a rename or delete).
    const home = await rowOf(HOME.name);
    expect(home).not.toHaveTextContent(strings['proj.outside']);
    expect(await actionsOf(home)).toEqual([strings['pp.open'] + '…']);
    expect(screen.queryByText(strings['proj.empty'])).toBeNull();
    expect(oneReads().map((x) => x.path.split('/').pop()).sort()).toEqual([HOME.id, ACME.id, LAB.id].sort());
    expect(wholeListReads()).toHaveLength(0);
  });

  it('while a missing project\'s read has not answered, Projects keeps loading and never says "No projects"', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectOutsideOnlyHangs' });
    await waitFor(() => expect(oneReads().length).toBeGreaterThan(0), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(strings['proj.empty'])).toBeNull();
    expect(screen.queryByText(ACME.name, { selector: 'strong' })).toBeNull();
  });

  it('a failed missing-project read is an error with a retry that reads it again, never "No projects"', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectOutsideOnlyDown' });
    const retry = await screen.findByRole('button', { name: /try again|retry/i }, { timeout: 8000 });
    expect(screen.queryByText(strings['proj.empty'])).toBeNull();
    const before = oneReads().length;
    await userEvent.click(retry);
    await waitFor(() => expect(oneReads().length).toBeGreaterThan(before), { timeout: 8000 });
  });

  it('a fresh by-id answer for the same project is shown: its realms moved, it is tagged outside after Refresh', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectOutsideMoves' });
    expect(await rowOf(ACME.name)).not.toHaveTextContent(strings['proj.outside']);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(async () => expect(await rowOf(ACME.name)).toHaveTextContent(strings['proj.outside']), { timeout: 8000 });
    expect(await actionsOf(await rowOf(ACME.name))).toEqual([strings['pp.open'] + '…']);
  });

  it('while an empty realm list is read again, Projects loads instead of saying "No projects"', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectNoneRefreshing' });
    expect(await screen.findByText(strings['proj.empty'], {}, { timeout: 8000 })).toBeInTheDocument();
    // A new project reads the realm's list again (its proof), and that read does not answer.
    await userEvent.click(screen.getByRole('button', { name: strings['proj.new'] }));
    const d = await screen.findByRole('dialog', { name: strings['projd.newTitle'] });
    await userEvent.type(within(d).getByLabelText(strings['projd.name']), 'Night jobs');
    await userEvent.click(within(d).getByRole('button', { name: strings['projd.create'] }));
    await waitFor(() => expect(screen.queryByText(strings['proj.empty'])).toBeNull(), { timeout: 8000 });
  });

  it('while the computers list is unread or failed, Projects never says "No projects"', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'error' });
    await screen.findByRole('button', { name: /try again|retry/i }, { timeout: 8000 });
    expect(screen.queryByText(strings['proj.empty'])).toBeNull();
  });

  describe('Copy makes the copy in this realm', () => {
    const openCopy = async (c: (typeof computers)[number], state: string) => {
      await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}&tab=ports`, state });
      await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', c.name) }, { timeout: 8000 }));
      await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
      return screen.findByRole('dialog');
    };
    beforeEach(() => {
      copySends.length = 0;
    });

    it('a computer whose project is outside the realm (one realm project) sends nothing until a realm project is picked', async () => {
      const c = computers.find((x) => x.project_id === ACME.id);
      if (!c) throw new Error('fixture computer in Acme');
      const dlg = await openCopy(c, 'projectOutside');
      expect(await within(dlg).findByText(strings['copyd.projectOutside'], {}, { timeout: 8000 })).toBeInTheDocument();
      const go = within(dlg).getByRole('button', { name: strings['copyd.go'] });
      expect(go).toBeDisabled();
      await userEvent.click(go);
      expect(copySends).toHaveLength(0);
      await userEvent.click(within(dlg).getByRole('button', { name: new RegExp(strings['field.project']) }));
      await userEvent.click(await screen.findByRole('radio', { name: new RegExp(`^${HOME.name}`) }));
      await userEvent.click(within(dlg).getByRole('button', { name: strings['copyd.go'] }));
      await waitFor(() => expect(copySends).toHaveLength(1), { timeout: 8000 });
      expect(copySends[0]).toMatchObject({ target_project_id: HOME.id });
    });

    it('a realm with no project of its own says so and never sends a copy', async () => {
      const c = computers.find((x) => x.project_id === ACME.id);
      if (!c) throw new Error('fixture computer in Acme');
      const dlg = await openCopy(c, 'projectOutsideOnly');
      expect(await within(dlg).findByText(strings['copyd.noProject'], {}, { timeout: 8000 })).toBeInTheDocument();
      const go = within(dlg).getByRole('button', { name: strings['copyd.go'] });
      expect(go).toBeDisabled();
      await userEvent.click(go);
      expect(copySends).toHaveLength(0);
    });

    it('while the realm\'s list is read again, Make copy is disabled and sends nothing (a kept list may be stale)', async () => {
      const c = computers.find((x) => x.project_id === HOME.id);
      if (!c) throw new Error('fixture computer in Home');
      const done = vi.fn();
      const room = [{ id: c.server_id, name: 'room', place: 'here', capacity: { used: 0, total: 9 } }] as never;
      const Harness = () => <CopyDrawer c={c} projects={[{ id: HOME.id, name: HOME.name }]} projectsBusy servers={room} onClose={() => undefined} onDone={done} />;
      const harness = definePage({ id: 'computers', path: '/computers', title: 'title', description: 'harness', nav: { group: 'main', order: 20, icon: 'computer', label: 'nav' }, layout: 'list-detail', load: async () => ({ default: Harness }), status: 'preview', sensitive: false, strings });
      await renderPage(harness, { path: '/computers' });
      const dlg = await screen.findByRole('dialog', {}, { timeout: 8000 });
      expect(within(dlg).getByText(strings['create.projectsLoading'])).toBeInTheDocument();
      const go = within(dlg).getByRole('button', { name: strings['copyd.go'] });
      expect(go).toBeDisabled();
      await userEvent.click(go);
      expect(copySends).toHaveLength(0);
    });

    it('a computer whose project is in the realm copies into that project', async () => {
      const c = computers.find((x) => x.project_id === HOME.id);
      if (!c) throw new Error('fixture computer in Home');
      const dlg = await openCopy(c, 'many');
      const go = await within(dlg).findByRole('button', { name: strings['copyd.go'] });
      await waitFor(() => expect(go).toBeEnabled(), { timeout: 8000 });
      await userEvent.click(go);
      await waitFor(() => expect(copySends).toHaveLength(1), { timeout: 8000 });
      expect(copySends[0]).toMatchObject({ target_project_id: HOME.id });
    });
  });
});
