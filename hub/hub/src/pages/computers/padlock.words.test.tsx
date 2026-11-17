// Vitest: the padlock describes the setting, never safety. A computer whose scope says rules exist
// reads "Has access rules", never Private or Locked, since the list cannot prove who the rules let in; its popover
// opens the access drawer when this session may see access rules, and offers no such button otherwise.
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { interpolate } from '@kit';
import { computers } from './fixtures';
import { access } from './logic';
import page from './page';
import strings from './strings.en.json';
import accessStrings from './parts/AccessDrawer.strings.en.json';
import { permissionsTesting } from './permissions.testing';

const { landedOnPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const ruled = computers.find((c) => access(c).state === 'set');
if (!ruled) throw new Error('fixture computer with access rules');
const lockOf = (state: string) => screen.findByRole('button', { name: interpolate(strings['access.aria'], { name: ruled.name, state }) }, { timeout: 8000 });

describe('computers: the padlock says what is set, never Private or Locked', () => {
  it('the words never claim privacy', () => {
    const words = Object.entries(strings).filter(([k]) => /^(access\.set|access\.short\.set|filter\.access\.set)/.test(k)).map(([, v]) => v);
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) expect(w).not.toMatch(/\b(Private|Locked|Only people you allow)\b/);
  });

  it('a row with rules reads "Has access rules", and its popover lands on the Permissions tab', async () => {
    await renderPage(page, { path: '/computers' });
    const lock = await lockOf(strings['access.set']);
    const row = lock.closest('[data-row-id]') as HTMLElement;
    expect(within(row).getByText(strings['access.short.set'])).toBeInTheDocument();
    expect(row).not.toHaveTextContent(/Private|Locked/);
    await userEvent.click(lock);
    const pop = await screen.findByRole('dialog', { name: strings['access.title'] });
    await userEvent.click(within(pop).getByRole('button', { name: strings['access.view'] }));
    await landedOnPermissions(strings, accessStrings['perm.who.title']);
  }, 40000);

  it('the Permissions tab follows the list: a row that leaves the list takes its rules off the page', async () => {
    const r = await renderPage(page, { path: '/computers' });
    await userEvent.click(await lockOf(strings['access.set']));
    const pop = await screen.findByRole('dialog', { name: strings['access.title'] });
    await userEvent.click(within(pop).getByRole('button', { name: strings['access.view'] }));
    await landedOnPermissions(strings, accessStrings['perm.who.title']);
    // The page's list query holds the selected rows.
    type Row = { id: string; name: string };
    const lists = r.queryClient.getQueryCache().getAll().filter((q) => Array.isArray(q.state.data) && (q.state.data as Row[]).some((c) => c?.id === ruled.id && c.name === ruled.name));
    expect(lists.length).toBeGreaterThan(0);
    const edit = (f: (cs: Row[]) => Row[]) => act(() => { for (const q of lists) r.queryClient.setQueryData(q.queryKey, (d: Row[]) => f(d)); });
    edit((cs) => cs.filter((c) => c.id !== ruled.id));
    await waitFor(() => expect(screen.queryByText(accessStrings['perm.who.title'])).toBeNull());
    expect(screen.queryByRole('radiogroup', { name: accessStrings['acc.choice'] })).toBeNull();
  }, 40000);

  it('a session that may not see access rules gets no button to open them', async () => {
    await renderPage(page, { path: '/computers', state: 'limited' });
    await userEvent.click(await lockOf(strings['access.set']));
    const pop = await screen.findByRole('dialog', { name: strings['access.title'] });
    expect(within(pop).queryByRole('button', { name: strings['access.view'] })).toBeNull();
  }, 40000);
});
