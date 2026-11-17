// Get a computer makes a project right there. The offer is there whatever the list holds; making one keeps the
// computer's form as typed, sends one project create, and picks the new project once the list shows it. A taken name
// says so on the field; another refusal shows with its details; a lost answer is "may have been made" (Check again,
// never sent again). Enter in the name makes the project, never the computer.
import { fixtureWorld, queryClient } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { held, projectSends } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const openCreate = async (state?: string) => {
  await renderPage(page, { path: '/computers', ...(state ? { state } : {}) });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
};
const offer = (d: HTMLElement) => within(d).findByRole('button', { name: new RegExp(`^(${strings['create.newProject']}|${strings['proj.new']})$`) }, { timeout: 8000 });
const nameField = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['newp.name'] });
const posts = () => projectSends.filter((x) => x.method === 'POST');
const projectButton = (d: HTMLElement) => within(d).getByRole('button', { name: new RegExp(`${strings['field.project']}$`) });

beforeEach(() => {
  projectSends.length = 0;
  held.release();
});

describe('Get a computer: New project right there', () => {
  it('with projects listed, makes one in place: the computer name stays, one create is sent, and the new project is picked', async () => {
    const d = await openCreate('projectsCreate');
    const computer = within(d).getByLabelText(strings['field.name']) as HTMLInputElement;
    await userEvent.clear(computer);
    await userEvent.type(computer, 'kept-name');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Side work');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((posts()[0]!.body as { alias?: string }).alias).toBe('Side work');
    expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBe(d);
    expect((within(d).getByLabelText(strings['field.name']) as HTMLInputElement).value).toBe('kept-name');
    await waitFor(() => expect(projectButton(d).textContent).toContain('Side work'), { timeout: 8000 });
    expect(within(d).queryByRole('textbox', { name: strings['newp.name'] })).toBeNull();
    expect(screen.queryByRole('dialog', { name: strings['projd.newTitle'] })).toBeNull();
  }, 40000);

  it('Enter in the name makes the project and sends no computer', async () => {
    const d = await openCreate('projectsCreate');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Quick{Enter}');
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBe(d);
    await waitFor(() => expect(projectButton(d).textContent).toContain('Quick'), { timeout: 8000 });
  }, 40000);

  it('Cancel closes it and sends nothing; an empty or listed name cannot be sent', async () => {
    const d = await openCreate();
    await userEvent.click(await offer(d));
    const make = within(d).getByRole('button', { name: strings['newp.make'] });
    expect(make).toBeDisabled();
    await userEvent.type(nameField(d), fixtureWorld.projects[0]!.name);
    expect(within(d).getByText(strings['projd.nameTaken'])).toBeInTheDocument();
    expect(make).toBeDisabled();
    await userEvent.click(within(within(d).getByRole('group', { name: strings['create.newProject'] })).getByRole('button', { name: strings['newp.cancel'] }));
    expect(within(d).queryByRole('textbox', { name: strings['newp.name'] })).toBeNull();
    expect(posts()).toHaveLength(0);
  }, 40000);

  it('a name the API says is taken says so on the field; nothing picked', async () => {
    const d = await openCreate('failedOps');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Twice');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    expect(await within(d).findByText(strings['projd.nameTaken'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(nameField(d)).toBeInTheDocument();
  }, 40000);

  it('another refusal shows as failed with its details; the name stays to try again', async () => {
    const d = await openCreate('projectCreateRefused');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Nope');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    expect(await within(d).findByRole('button', { name: /details/i }, { timeout: 8000 })).toBeInTheDocument();
    expect(nameField(d)).toHaveValue('Nope');
    expect(posts()).toHaveLength(1);
  }, 40000);

  it('a lost answer is "may have been made": the held band with Check again, and nothing is sent again', async () => {
    const d = await openCreate('pendingOps');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Maybe');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    const check = await within(d).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    expect(within(d).queryByRole('textbox', { name: strings['newp.name'] })).toBeNull();
    await userEvent.click(check);
    expect(posts()).toHaveLength(1);
  }, 40000);

  it('a lost create that the read-back proves says it was created and changes nothing until Select', async () => {
    const d = await openCreate('projectCreateLostMade');
    const before = projectButton(d).textContent;
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Proven');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    expect(await within(d).findByText('Project Proven was created.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['held.check'] })).toBeNull();
    expect(projectButton(d).textContent).toBe(before);
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.select'] }));
    await waitFor(() => expect(projectButton(d).textContent).toContain('Proven'), { timeout: 8000 });
    expect(within(d).queryByText('Project Proven was created.')).toBeNull();
    expect(posts()).toHaveLength(1);
  }, 40000);

  it('while the project is sent the drawer neither closes nor sends the computer; a late answer picks it there', async () => {
    const d = await openCreate('projectCreateSlow');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Slow one');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(within(d).getByRole('button', { name: strings['create.go'] })).toBeDisabled();
    expect(within(d).getByRole('radio', { name: new RegExp(strings['create.fromCopy']) })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBe(d);
    await waitFor(() => expect(projectButton(d).textContent).toContain('Slow one'), { timeout: 8000 });
    expect(within(d).getByRole('button', { name: strings['create.go'] })).toBeEnabled();
  }, 40000);

  it('a project picked by hand while the create is out stays picked when the create comes back done', async () => {
    const d = await openCreate('projectCreateSlow');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Too late');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const other = fixtureWorld.projects.map((p) => p.name).find((x) => !(projectButton(d).textContent ?? '').includes(x))!;
    await userEvent.click(projectButton(d));
    await userEvent.click(within(await screen.findByRole('dialog', { name: strings['field.project'] })).getByText(other));
    await waitFor(() => expect(within(d).queryByRole('textbox', { name: strings['newp.name'] })).toBeNull(), { timeout: 8000 });
    await userEvent.click(projectButton(d));
    expect(await within(await screen.findByRole('dialog', { name: strings['field.project'] })).findByText('Too late', {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(projectButton(d).textContent).toContain(other);
  }, 40000);

  it('a project picked by hand while the create is out stays picked when the create, held, is proved later', async () => {
    const d = await openCreate('projectCreateLostSlow');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Held late');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const other = fixtureWorld.projects.map((p) => p.name).find((x) => !(projectButton(d).textContent ?? '').includes(x))!;
    await userEvent.click(projectButton(d));
    await userEvent.click(within(await screen.findByRole('dialog', { name: strings['field.project'] })).getByText(other));
    const check = await within(d).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    held.release();
    await userEvent.click(check);
    await waitFor(() => {
      held.release();
      expect(within(d).queryByRole('button', { name: strings['held.check'] })).toBeNull();
    }, { timeout: 20000 });
    expect(await within(d).findByText('Project Held late was created.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(projectButton(d).textContent).toContain(other);
  }, 40000);

  it('a same-named project listed while the create is out is not picked when the create is refused', async () => {
    const d = await openCreate('projectCreateTakenSlow');
    const before = projectButton(d).textContent;
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Raced');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await queryClient.invalidateQueries();
    await userEvent.click(projectButton(d));
    expect(await within(await screen.findByRole('dialog', { name: strings['field.project'] })).findByText('Raced', {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(await within(d).findByText(strings['projd.nameTaken'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(projectButton(d).textContent).toBe(before);
  }, 40000);

  it('a held create proved after the drawer was closed and opened again offers Select in the new opening, which picks it', async () => {
    const d = await openCreate('projectCreateLostHeld');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Comes back');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    expect(await within(d).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(held.waiting).toBeGreaterThan(0), { timeout: 8000 });
    await userEvent.click(within(d).getByRole('button', { name: /^Cancel$/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['create.title'] })).toBeNull(), { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: strings['action.get'] }));
    const again = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
    // Check again in the new opening (the first opening's read-back may have ended with it); every held read goes.
    const check = await within(again).findByRole('button', { name: strings['held.check'] }, { timeout: 8000 });
    held.release();
    await userEvent.click(check);
    const before = projectButton(again).textContent;
    await waitFor(() => {
      held.release();
      expect(within(again).getByText('Project Comes back was created.')).toBeInTheDocument();
    }, { timeout: 20000 });
    expect(projectButton(again).textContent).toBe(before);
    await userEvent.click(within(again).getByRole('button', { name: strings['newp.select'] }));
    await waitFor(() => {
      held.release();
      expect(projectButton(again).textContent).toContain('Comes back');
    }, { timeout: 20000 });
    expect(posts()).toHaveLength(1);
  }, 40000);

  it('a project picked by hand while the new one is still to be listed stays picked', async () => {
    const d = await openCreate('projectCreateListHeld');
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'Later');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    await waitFor(() => expect(held.waiting).toBeGreaterThan(0), { timeout: 8000 });
    const other = fixtureWorld.projects.map((p) => p.name).find((x) => !(projectButton(d).textContent ?? '').includes(x))!;
    await userEvent.click(projectButton(d));
    const list = await screen.findByRole('dialog', { name: strings['field.project'] });
    await userEvent.click(within(list).getByText(other));
    await waitFor(() => expect(projectButton(d).textContent).toContain(other));
    held.release();
    // The held list now answers with the new project: it is listed, and the person's own pick stays.
    await userEvent.click(projectButton(d));
    expect(await within(await screen.findByRole('dialog', { name: strings['field.project'] })).findByText('Later', {}, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(projectButton(d).textContent).toContain(other);
    expect(projectButton(d).textContent).not.toContain('Later');
  }, 40000);

  it('with no project in the realm, the band says why and New project sits under it, in place', async () => {
    const d = await openCreate('projectOutsideOnlyCreates');
    expect(within(d).getByRole('alert')).toHaveTextContent(strings['create.error.noProject']);
    await userEvent.click(await offer(d));
    await userEvent.type(nameField(d), 'First');
    await userEvent.click(within(d).getByRole('button', { name: strings['newp.make'] }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(within(d).queryByRole('alert')).toBeNull(), { timeout: 8000 });
    expect(screen.queryByRole('dialog', { name: strings['projd.newTitle'] })).toBeNull();
  }, 40000);
});
