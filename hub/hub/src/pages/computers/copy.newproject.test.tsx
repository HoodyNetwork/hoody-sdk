// The Copy drawer offers "New project in this realm" where a realm has no project for the copy; New project
// then returns to the same computer's Copy, which reads the new list. A name the person typed is asked about first.
import { fixtureWorld } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computers, copySends, projectSends } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

const ACME = fixtureWorld.projects[1];
const c = computers.find((x) => x.project_id === ACME?.id);
if (!c) throw new Error('fixture computer in Acme');
const copyTitle = strings['copyd.title'].replace('{{name}}', c.name);

const openCopy = async () => {
  await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}&tab=ports`, state: 'projectOutsideOnly' });
  // The first render of a run also loads the page's parts; on a busy host that alone can pass 8 s.
  await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', c.name) }, { timeout: 30000 }));
  await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
  const d = await screen.findByRole('dialog', { name: copyTitle });
  await within(d).findByText(strings['copyd.noProject'], {}, { timeout: 8000 });
  return d;
};

beforeEach(() => {
  copySends.length = 0;
  projectSends.length = 0;
});

describe('computers: a project for the copy, made from the Copy drawer', () => {
  it('no project here: New project opens, and closing it brings back the same computer\'s Copy; nothing sent', async () => {
    const d = await openCopy();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.newProject'] }));
    const p = await screen.findByRole('dialog', { name: strings['projd.newTitle'] });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: strings['projd.newTitle'] })).toBeNull());
    expect(p).not.toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: copyTitle })).toBeInTheDocument();
    expect(copySends).toHaveLength(0);
  }, 60000);

  it('while the copy is being sent, New project is not offered (the copy\'s close would dismiss it)', async () => {
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}&tab=ports`, state: 'copySlow' });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', c.name) }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
    const d = await screen.findByRole('dialog', { name: copyTitle });
    const projectButton = await within(d).findByRole('button', { name: new RegExp(`${strings['field.project']}$`) }, { timeout: 8000 });
    await userEvent.click(projectButton);
    expect(await screen.findByRole('button', { name: new RegExp(`^(${strings['create.newProject']}|${strings['proj.new']})$`) })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(d).getByRole('button', { name: strings['copyd.go'] }));
    await waitFor(() => expect(copySends).toHaveLength(1));
    await userEvent.click(projectButton);
    expect(screen.queryByRole('button', { name: new RegExp(`^(${strings['create.newProject']}|${strings['proj.new']})$`) })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: copyTitle })).toBeNull(), { timeout: 5000 });
    expect(copySends).toHaveLength(1);
  }, 30000);

  it('a project made in New project: the Copy comes back, lists it, and one copy is sent into it', async () => {
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}&tab=ports`, state: 'projectOutsideOnlyCreates' });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', c.name) }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
    const d = await screen.findByRole('dialog', { name: copyTitle });
    await userEvent.click(await within(d).findByRole('button', { name: strings['create.newProject'] }, { timeout: 8000 }));
    const p = await screen.findByRole('dialog', { name: strings['projd.newTitle'] });
    await userEvent.type(within(p).getByRole('textbox', { name: strings['projd.name'] }), 'Copies');
    await userEvent.click(within(p).getByRole('button', { name: strings['projd.create'] }));
    const back = await screen.findByRole('dialog', { name: copyTitle }, { timeout: 8000 });
    expect(projectSends.filter((x) => x.method === 'POST')).toHaveLength(1);
    await userEvent.click(await within(back).findByRole('button', { name: new RegExp(`${strings['field.project']}$`) }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('radio', { name: /Copies/ }));
    await userEvent.click(within(back).getByRole('button', { name: strings['copyd.go'] }));
    await waitFor(() => expect(copySends).toHaveLength(1));
    expect((copySends[0] as { target_project_id?: string }).target_project_id).toBe(`e${'0'.repeat(23)}`);
  }, 40000);

  it('in All realms the offer is plain New project (no realm to name)', async () => {
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}&tab=ports`, state: 'copySlow', realm: 'all' });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', c.name) }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
    const d = await screen.findByRole('dialog', { name: copyTitle });
    await userEvent.click(await within(d).findByRole('button', { name: new RegExp(`${strings['field.project']}$`) }, { timeout: 8000 }));
    expect(await screen.findByRole('button', { name: strings['proj.new'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['create.newProject'] })).toBeNull();
  }, 30000);

  it('a typed name is asked about before leaving; Cancel keeps the Copy and its name', async () => {
    const d = await openCopy();
    const field = within(d).getByRole('textbox', { name: strings['field.name'] });
    await userEvent.clear(field);
    await userEvent.type(field, 'my-copy');
    await userEvent.click(within(d).getByRole('button', { name: strings['create.newProject'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['create.newProjectAskTitle'] });
    expect(ask).toHaveTextContent(strings['copyd.newProjectAskBody'].replace('{{name}}', c.name));
    await userEvent.click(within(ask).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog', { name: strings['projd.newTitle'] })).toBeNull();
    expect(within(screen.getByRole('dialog', { name: copyTitle })).getByRole('textbox', { name: strings['field.name'] })).toHaveValue('my-copy');
  });
});
