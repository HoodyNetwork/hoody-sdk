// Realms are managed from the computer's Overview too: the Realms fact has a Manage button that opens
// the same Realms drawer Advanced opens (realm names are a one-line summary; with several
// realms their list, with the ids, opens from the line and ends in Manage realms, overview.realms.test.tsx). A computer in no realm says so ("Not in a realm · Add to a
// realm"), and its warning icon opens a note on what no realm means (verified: a realm host lists and reads only that
// realm's computers, the API's own rule). Advanced keeps its entry and shows
// the note too. A session that can't change realms gets none of the new controls.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import page from './page';
import strings from './strings.en.json';

const drawerName = (name: string) => interpolate(strings['realmsd.title'], { name });
const factRow = async () => {
  const label = await screen.findByText(strings['fact.realms'], { selector: 'dt' }, { timeout: 8000 });
  return label.parentElement as HTMLElement;
};

describe('computers: managing realms from the Overview', () => {
  it('Manage on the Realms fact opens the Realms drawer for this computer', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const row = await factRow();
    await userEvent.click(within(row).getByRole('button', { name: strings['realm.manage'] }));
    expect(await screen.findByRole('dialog', { name: drawerName('atlas') })).toBeInTheDocument();
  }, 40000);

  it('a computer in one realm shows its name and id on the line, with no list to open', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const row = await factRow();
    expect(row).toHaveTextContent('Personal');
    expect(within(row).getByText('f1f1…f1f1')).toBeInTheDocument();
    expect(within(row).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).not.toContain(strings['realm.ids']);
  }, 40000);

  // atlas is the fixtures' current computer; borealis is not, so a drawer bound to the top-bar computer would fail here.
  it('after the selection moves to another computer, Manage opens that computer\'s drawer and the line shows its realm', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await factRow();
    const row = (await screen.findByText('borealis', { selector: 'strong' })).closest('[data-row-id]') as HTMLElement;
    await userEvent.click(row);
    await screen.findByRole('heading', { name: 'borealis', level: 2 }, { timeout: 8000 });
    const fact = await factRow();
    await userEvent.click(within(fact).getByRole('button', { name: strings['realm.manage'] }));
    expect(await screen.findByRole('dialog', { name: drawerName('borealis') })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: drawerName('atlas') })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await factRow()).toHaveTextContent('Acme client');
  }, 40000);

  it('Enter and Space on Manage open the drawer, and closing it returns focus to the button', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    const manage = within(await factRow()).getByRole('button', { name: strings['realm.manage'] });
    manage.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: drawerName('atlas') })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(document.body).getByRole('button', { name: strings['realm.manage'] })));
    within(await factRow()).getByRole('button', { name: strings['realm.manage'] }).focus();
    await userEvent.keyboard(' ');
    expect(await screen.findByRole('dialog', { name: drawerName('atlas') })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(document.body).getByRole('button', { name: strings['realm.manage'] })));
  }, 40000);

  it('a computer in no realm reads "Not in a realm · Add to a realm"; the warning explains; Add opens the drawer', async () => {
    await renderPage(page, { state: 'noRealm', realm: 'all', path: '/computers?sel=atlas.00a1' });
    const row = await factRow();
    expect(row.querySelector('dd')?.textContent).toBe(`${strings['realm.noneHere']}·${strings['realm.add']}`);
    const why = within(row).getByRole('button', { name: strings['realm.noneWhy'] });
    await userEvent.click(why);
    expect(await screen.findByText(interpolate(strings['realm.noneBody'], { name: 'atlas' }))).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(why));
    await userEvent.click(within(row).getByRole('button', { name: strings['realm.add'] }));
    expect(await screen.findByRole('dialog', { name: drawerName('atlas') })).toBeInTheDocument();
  }, 40000);

  it('a session that cannot change realms gets no Manage or Add to a realm (the realms still show)', async () => {
    const r = await renderPage(page, { state: 'limited', path: '/computers?sel=atlas.00a1' });
    const row = await factRow();
    expect(row).toHaveTextContent('Personal');
    expect(within(row).queryByRole('button', { name: strings['realm.manage'] })).toBeNull();
    r.unmount();
    await renderPage(page, { state: 'noRealmLimited', realm: 'all', path: '/computers?sel=atlas.00a1' });
    const empty = await factRow();
    expect(empty).toHaveTextContent(strings['realm.noneHere']);
    expect(within(empty).queryByRole('button', { name: strings['realm.add'] })).toBeNull();
    expect(empty).not.toHaveTextContent('·');
    expect(within(empty).getByRole('button', { name: strings['realm.noneWhy'] })).toBeInTheDocument();
  }, 40000);

  it('Overview\'s "No realm" note says what it means, and Realms in the header menu opens the same drawer', async () => {
    await renderPage(page, { state: 'noRealm', realm: 'all', path: '/computers?sel=atlas.00a1&tab=overview' });
    await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'atlas') }, { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: strings['realm.noneWhy'] }));
    const note = await screen.findByRole('dialog', { name: strings['realm.noneWhy'] });
    expect(note).toHaveTextContent(interpolate(strings['realm.noneBody'], { name: 'atlas' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'atlas') }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.realms'] }));
    expect(await screen.findByRole('dialog', { name: drawerName('atlas') })).toBeInTheDocument();
  }, 40000);
});
