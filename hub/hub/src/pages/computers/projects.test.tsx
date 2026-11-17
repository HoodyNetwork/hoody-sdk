// Projects: a third view beside Computers and Servers. Each project shows its colour, its computer count
// (a link to them), its realms and its access padlock; New and Rename send name and colour; Delete is offered only
// for an empty project and is sent only after the API's own count says none. Each change is sent once.
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { interpolate } from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers, projectSends } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import { routes } from './routes';
import strings from './strings.en.json';
import kitStates from '@kit/states/strings.en.json';

const [HOME, ACME, LAB] = fixtureWorld.projects;
if (!HOME || !ACME || !LAB) throw new Error('fixture projects');
const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
const menuOf = async (name: string) => {
  const row = await rowOf(name);
  await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
  return screen.findByRole('menu');
};

beforeEach(() => {
  projectSends.length = 0;
});

describe('computers: projects', () => {
  it('the switch opens Projects: each row has its count (a link to its computers), realm and the first-project tag', async () => {
    await renderPage(page, { path: '/computers' });
    await userEvent.click(await screen.findByRole('tab', { name: strings['views.projects'] }, { timeout: 8000 }));
    const home = await rowOf(HOME.name);
    expect(within(home).getByText(strings['proj.default'])).toBeInTheDocument();
    const n = computers.filter((c) => c.project_id === HOME.id).length;
    const link = within(home).getByRole('link', { name: new RegExp(interpolate(strings['count.computers_other'], { count: n })) });
    expect(link.getAttribute('href')).toContain(`project=${encodeURIComponent(handleOf(HOME))}`);
    expect(link.getAttribute('href')).not.toContain(HOME.id);
    expect(home).toHaveTextContent(fixtureWorld.realms.find((r) => r.id === HOME.realm)?.name ?? '');
  });

  it('the count link lands on the computers list with that project picked', async () => {
    await renderPage(page, { path: `/computers?project=${encodeURIComponent(handleOf(ACME))}` });
    const inAcme = computers.filter((c) => c.project_id === ACME.id).map((c) => c.name);
    const other = computers.find((c) => c.project_id !== ACME.id)?.name ?? '';
    await screen.findAllByText(inAcme[0] ?? '', {}, { timeout: 8000 });
    expect(screen.queryByText(other, { selector: 'strong' })).toBeNull();
  });

  it('New project sends its name and colour once', async () => {
    await renderPage(page, { path: '/computers/projects' });
    await userEvent.click(await screen.findByRole('button', { name: strings['proj.new'] }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: strings['projd.newTitle'] });
    await userEvent.type(within(d).getByLabelText(strings['projd.name']), 'Night jobs');
    await userEvent.click(within(d).getByRole('button', { name: strings['projd.create'] }));
    await waitFor(() => expect(projectSends).toHaveLength(1));
    expect(projectSends[0]?.method).toBe('POST');
    expect(projectSends[0]?.body).toMatchObject({ alias: 'Night jobs', color: expect.stringMatching(/^#[0-9A-F]{6}$/) });
  });

  it('a name already used is refused in the form, before anything is sent', async () => {
    await renderPage(page, { path: '/computers/projects' });
    await userEvent.click(await screen.findByRole('button', { name: strings['proj.new'] }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: strings['projd.newTitle'] });
    await userEvent.type(within(d).getByLabelText(strings['projd.name']), ACME.name);
    expect(d).toHaveTextContent(strings['projd.nameTaken']);
    await userEvent.click(within(d).getByRole('button', { name: strings['projd.create'] }));
    expect(projectSends).toHaveLength(0);
  });

  it("the API's name-in-use refusal shows on the name field", async () => {
    await renderPage(page, { path: '/computers/projects', state: 'failedOps' });
    await userEvent.click(await screen.findByRole('button', { name: strings['proj.new'] }, { timeout: 8000 }));
    const d = await screen.findByRole('dialog', { name: strings['projd.newTitle'] });
    await userEvent.type(within(d).getByLabelText(strings['projd.name']), 'Night jobs');
    await userEvent.click(within(d).getByRole('button', { name: strings['projd.create'] }));
    await waitFor(() => expect(d).toHaveTextContent(strings['projd.nameTaken']));
    expect(projectSends).toHaveLength(1);
    // The footer says it too, in the page's words, with the API's answer under Details; editing the name clears it.
    expect(within(d).queryByText(kitStates['err.conflict'])).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: kitStates['err.details'] }));
    expect(await screen.findByText('DUPLICATE_ALIAS', {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.type(within(d).getByLabelText(strings['projd.name']), ' 2');
    await waitFor(() => expect(within(d).queryByRole('button', { name: kitStates['err.details'] })).toBeNull());
    expect(d).not.toHaveTextContent(strings['projd.nameTaken']);
  });

  it('Rename opens with the name filled and sends the new name with the colour', async () => {
    await renderPage(page, { path: '/computers/projects' });
    await userEvent.click(within(await menuOf(ACME.name)).getByRole('menuitem', { name: new RegExp(strings['proj.rename']) }));
    const d = await screen.findByRole('dialog', { name: interpolate(strings['projd.editTitle'], { name: ACME.name }) });
    const field = within(d).getByLabelText(strings['projd.name']);
    expect(field).toHaveValue(ACME.name);
    await userEvent.clear(field);
    await userEvent.type(field, 'Acme shop');
    await userEvent.click(within(d).getByRole('button', { name: strings['projd.save'] }));
    await waitFor(() => expect(projectSends).toHaveLength(1));
    expect(projectSends[0]).toMatchObject({ method: 'PUT', body: { alias: 'Acme shop', color: expect.stringMatching(/^#[0-9A-F]{6}$/) } });
    expect(projectSends[0]?.path).toContain(ACME.id);
  });

  it('Enter in the Name field saves a rename, once; Enter on an unchanged or empty name sends nothing', async () => {
    await renderPage(page, { path: '/computers/projects' });
    await userEvent.click(within(await menuOf(ACME.name)).getByRole('menuitem', { name: new RegExp(strings['proj.rename']) }));
    const d = await screen.findByRole('dialog', { name: interpolate(strings['projd.editTitle'], { name: ACME.name }) });
    const field = within(d).getByLabelText(strings['projd.name']);
    // Unchanged: nothing to save, Enter sends nothing.
    await userEvent.type(field, '{Enter}');
    await userEvent.clear(field);
    await userEvent.type(field, '{Enter}');
    expect(projectSends).toHaveLength(0);
    await userEvent.type(field, 'Acme shop{Enter}');
    await waitFor(() => expect(projectSends).toHaveLength(1));
    expect(projectSends[0]).toMatchObject({ method: 'PUT', body: { alias: 'Acme shop', color: expect.stringMatching(/^#[0-9A-F]{6}$/) } });
    expect(projectSends[0]?.path).toContain(ACME.id);
  });

  it('Delete is off for a project with computers and for the first project, each saying why', async () => {
    await renderPage(page, { path: '/computers/projects' });
    const acme = within(await menuOf(ACME.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) });
    expect(acme).toHaveAttribute('aria-disabled', 'true');
    const n = computers.filter((c) => c.project_id === ACME.id).length;
    expect(acme).toHaveTextContent(interpolate(n === 1 ? strings['proj.deleteHas_one'] : strings['proj.deleteHas_other'], { count: n }));
    await userEvent.keyboard('{Escape}');
    const home = within(await menuOf(HOME.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) });
    expect(home).toHaveAttribute('aria-disabled', 'true');
    expect(home).toHaveTextContent(strings['proj.deleteDefault']);
  });

  it("an empty project: the dialog reads the API's count first, then Delete sends one DELETE", async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectEmpty' });
    await userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d = await screen.findByRole('alertdialog');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.body'], { name: LAB.name })));
    await userEvent.click(within(d).getByRole('button', { name: strings['projx.go'] }));
    await waitFor(() => expect(projectSends).toHaveLength(1));
    expect(projectSends[0]?.method).toBe('DELETE');
    expect(projectSends[0]?.path).toContain(LAB.id);
  });

  it('the API still counts computers the list does not show: Delete stays off and nothing is sent', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectHidden' });
    await userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d = await screen.findByRole('alertdialog');
    const n = computers.filter((c) => c.project_id === LAB.id).length;
    await waitFor(() => expect(d).toHaveTextContent(interpolate(n === 1 ? strings['projx.has_one'] : strings['projx.has_other'], { name: LAB.name, count: n })));
    expect(within(d).getByRole('button', { name: strings['projx.go'] })).toBeDisabled();
    expect(projectSends).toHaveLength(0);
  });

  it("the API refuses a project whose computers this account cannot list: the dialog points to support, sends once and never with the opt-in", async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectRefused' });
    await userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d = await screen.findByRole('alertdialog');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.body'], { name: LAB.name })));
    await userEvent.click(within(d).getByRole('button', { name: strings['projx.go'] }));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.hidden'], { name: LAB.name })));
    expect(within(d).getByRole('button', { name: strings['projx.go'] })).toBeDisabled();
    expect(projectSends).toHaveLength(1);
    expect(projectSends[0]?.method).toBe('DELETE');
    expect(projectSends[0]?.path).not.toContain('?');
    expect(JSON.stringify(projectSends[0]?.query ?? {})).toBe('{}');
  });

  it('the API refuses because a computer landed meanwhile: the count after the refusal shows it, and the dialog says to delete or move it', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectRefusedListed' });
    await userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d = await screen.findByRole('alertdialog');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.body'], { name: LAB.name })));
    await userEvent.click(within(d).getByRole('button', { name: strings['projx.go'] }));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.refused'], { name: LAB.name })));
    await new Promise((r) => setTimeout(r, 300));
    expect(d).toHaveTextContent(interpolate(strings['projx.refused'], { name: LAB.name }));
    expect(projectSends.filter((x) => x.method === 'DELETE')).toHaveLength(1);
  });

  it('leaving the view while the count before sending is out sends nothing when it answers 0', async () => {
    const { router } = await renderPage(page, { path: '/computers/projects', state: 'projectCountSlowSend' });
    await userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d = await screen.findByRole('alertdialog');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.body'], { name: LAB.name })));
    await userEvent.click(within(d).getByRole('button', { name: strings['projx.go'] }));
    await act(async () => { await router.navigate({ to: '/computers' as never }); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await new Promise((r) => setTimeout(r, 1000));
    expect(projectSends.filter((x) => x.method === 'DELETE')).toHaveLength(0);
  });

  it('a create whose answer was lost is held: reopening New shows it and offers no second send', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'pendingOps' });
    await userEvent.click(await screen.findByRole('button', { name: strings['proj.new'] }, { timeout: 8000 }));
    let d = await screen.findByRole('dialog', { name: strings['projd.newTitle'] });
    await userEvent.type(within(d).getByLabelText(strings['projd.name']), 'Night jobs');
    await userEvent.click(within(d).getByRole('button', { name: strings['projd.create'] }));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['held.projectCreate'], { name: 'Night jobs' })));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: strings['proj.new'] }));
    d = await screen.findByRole('dialog', { name: strings['projd.newTitle'] });
    expect(d).toHaveTextContent(interpolate(strings['held.projectCreate'], { name: 'Night jobs' }));
    expect(within(d).queryByLabelText(strings['projd.name'])).toBeNull();
    expect(projectSends).toHaveLength(1);
  });

  // A lost delete answer (C9): held, never resent; Check again reads the project itself on the base host.
  const sendLostDelete = async (state: string) => {
    await renderPage(page, { path: '/computers/projects', state });
    await userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d = await screen.findByRole('alertdialog');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.body'], { name: LAB.name })));
    await userEvent.click(within(d).getByRole('button', { name: strings['projx.go'] }));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['held.projectRemove'], { name: LAB.name })));
    return d;
  };
  const deletes = () => projectSends.filter((x) => x.method === 'DELETE');
  const reads = () => projectSends.filter((x) => x.method === 'GET');

  it('a lost delete answer is held: reopening shows the hold and offers no second send', async () => {
    let d = await sendLostDelete('projectPendingThere');
    expect(within(d).getByRole('button', { name: strings['projx.go'] })).toBeDisabled();
    await userEvent.click(d.querySelector<HTMLElement>('[data-dialog-cancel]')!);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    d = await screen.findByRole('alertdialog');
    expect(d).toHaveTextContent(interpolate(strings['held.projectRemove'], { name: LAB.name }));
    expect(within(d).getByRole('button', { name: strings['projx.go'] })).toBeDisabled();
    expect(deletes()).toHaveLength(1);
  });

  it('Check again on a lost delete: the API answers the project is gone, so the hold ends and the dialog closes', async () => {
    const d = await sendLostDelete('projectPending');
    await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deletes()).toHaveLength(1);
    expect(reads()).toHaveLength(1);
    expect(reads()[0]?.path).toMatch(new RegExp(`/projects/${LAB.id}$`));
  });

  for (const [state, what] of [
    ['projectPendingThere', 'the project is still there'],
    ['projectPendingDown', 'the read does not answer'],
    ['projectPendingOutOfView', "this realm's list no longer shows it but the project is still there"],
  ] as const) {
    it(`Check again on a lost delete keeps the hold when ${what}, and sends nothing again`, async () => {
      const d = await sendLostDelete(state);
      await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
      await waitFor(() => expect(reads()).toHaveLength(1));
      await new Promise((r) => setTimeout(r, 50));
      expect(d).toHaveTextContent(interpolate(strings['held.projectRemove'], { name: LAB.name }));
      expect(screen.getByRole('alertdialog')).toBe(d);
      expect(deletes()).toHaveLength(1);
    });
  }

  it('a lost delete offers no Dismiss until a read shows the project still there, and a failed read never offers it', async () => {
    const d = await sendLostDelete('projectPendingDown');
    const dismiss = () => within(d).queryByRole('button', { name: strings['held.dismiss'] });
    expect(dismiss()).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(reads()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(dismiss()).toBeNull();
    expect(within(d).getByRole('button', { name: strings['projx.go'] })).toBeDisabled();
    expect(deletes()).toHaveLength(1);
  });

  it('after a read finds the project still there, the warned Dismiss is offered with that said', async () => {
    const d = await sendLostDelete('projectPendingThere');
    expect(within(d).queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['held.projectThere'], { name: LAB.name })));
    expect(within(d).getByRole('button', { name: strings['held.dismiss'] })).toBeInTheDocument();
    expect(deletes()).toHaveLength(1);
  });

  it('after a warned Dismiss and a second lost delete, Dismiss waits for a read of that second send', async () => {
    const d = await sendLostDelete('projectPendingThere');
    await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
    await userEvent.click(await within(d).findByRole('button', { name: strings['held.dismiss'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    const go = await within(d).findByRole('button', { name: strings['projx.go'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(deletes()).toHaveLength(2));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['held.projectRemove'], { name: LAB.name })));
    expect(within(d).queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
    expect(d).not.toHaveTextContent(interpolate(strings['held.projectThere'], { name: LAB.name }));
    await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
    expect(await within(d).findByRole('button', { name: strings['held.dismiss'] })).toBeInTheDocument();
    expect(deletes()).toHaveLength(2);
  });

  it("a second send's Check again waits for a read of its own, never an earlier send's read still out", async () => {
    const d = await sendLostDelete('projectPendingThereSlow');
    const check = () => within(d).getByRole('button', { name: strings['held.check'] });
    await userEvent.click(check());
    const dismiss = await within(d).findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 });
    // A second read of the first send goes out and is still out while that send is dismissed and the second goes.
    await userEvent.click(check());
    await waitFor(() => expect(reads()).toHaveLength(2));
    await userEvent.click(dismiss);
    await userEvent.click(await screen.findByRole('button', { name: strings['held.dismissGo'] }));
    const go = await within(d).findByRole('button', { name: strings['projx.go'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(deletes()).toHaveLength(2));
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['held.projectRemove'], { name: LAB.name })));
    await userEvent.click(check());
    expect(await within(d).findByRole('button', { name: strings['held.dismiss'] }, { timeout: 12000 })).toBeInTheDocument();
    // Dismiss came back only once a read that began after the second send answered, never on the one still out.
    expect(reads()).toHaveLength(3);
    expect(deletes()).toHaveLength(2);
  }, 30000);

  it('a late check from an earlier opening ends that hold but leaves the dialog now open for another project', async () => {
    const d = await sendLostDelete('projectPendingSlowGone');
    await userEvent.click(within(d).getByRole('button', { name: strings['held.check'] }));
    await userEvent.click(d.querySelector<HTMLElement>('[data-dialog-cancel]')!);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await userEvent.click(within(await menuOf(ACME.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d2 = await screen.findByRole('alertdialog');
    await waitFor(() => expect(d2).toHaveTextContent(interpolate(strings['projx.body'], { name: ACME.name })));
    await new Promise((r) => setTimeout(r, 900));
    expect(reads()).toHaveLength(1);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(interpolate(strings['projx.body'], { name: ACME.name }));
    expect(deletes()).toHaveLength(1);
  });

  it("the API's count does not answer: Delete stays off, says so, and nothing is sent", async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectCountDown' });
    await userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    const d = await screen.findByRole('alertdialog');
    await waitFor(() => expect(d).toHaveTextContent(interpolate(strings['projx.unknown'], { name: LAB.name })));
    expect(within(d).getByRole('button', { name: strings['projx.go'] })).toBeDisabled();
    expect(projectSends).toHaveLength(0);
  });

  it('a late count from an earlier opening changes nothing: Delete stays off', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectCountLate' });
    const open = async () => userEvent.click(within(await menuOf(LAB.name)).getByRole('menuitem', { name: new RegExp(strings['proj.delete']) }));
    await open();
    let d = await screen.findByRole('alertdialog');
    await userEvent.click(d.querySelector<HTMLElement>('[data-dialog-cancel]')!);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await open();
    d = await screen.findByRole('alertdialog');
    const n = computers.filter((c) => c.project_id === LAB.id).length;
    const has = interpolate(n === 1 ? strings['projx.has_one'] : strings['projx.has_other'], { name: LAB.name, count: n });
    await waitFor(() => expect(d).toHaveTextContent(has));
    await new Promise((r) => setTimeout(r, 900));
    expect(d).toHaveTextContent(has);
    expect(within(d).getByRole('button', { name: strings['projx.go'] })).toBeDisabled();
    expect(projectSends).toHaveLength(0);
  });

  it('the count and the check are account-wide: both read the base host, never one realm', () => {
    expect(routes.projectComputers.scope).toBe('base');
    expect(routes.project.scope).toBe('base');
  });

  it("Overview: the Project fact links to the project's row", async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const link = await screen.findByRole('link', { name: HOME.name }, { timeout: 8000 });
    expect(link.getAttribute('href')).toContain(`/computers/projects?psel=${encodeURIComponent(handleOf(HOME))}`);
  });
});
