// A live computer whose delete lost its answer, and the delete went through: Check again reads the computers list,
// the list no longer holds the computer, so the delete is proved and the dialog closes. A proved delete must not leave
// the dialog open with the typed name and an armed button: a press there would send a second delete for a computer
// that is gone.
import userEvent from '@testing-library/user-event';
import { answers, containersRoute, reply, type FixtureRule } from '@core';
import { describe, expect, it } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import { computers, removeSends } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
// The list still holds the computer while the delete is in flight on the API's side; once it has landed the list
// answers without every computer a sent delete took away.
const api = { landed: false };
const listLessRemoved: FixtureRule = reply(containersRoute, () => answers.ok({ data: { computers: computers.filter((c) => !api.landed || !removeSends.some((x) => x.id === c.id)) } }), { when: (r) => r.query.include_expired !== 'true' });

describe('computers: a held delete of a live computer that went through', () => {
  it('Check again proves it from the list and closes the dialog; nothing is sent again', async () => {
    api.landed = false;
    const c = computers.find((x) => x.status === 'running') ?? computers[0]!;
    await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}&tab=ports`, state: 'removeLost', rules: [listLessRemoved] });
    await userEvent.click(await screen.findByRole('button', { name: fill(strings['menu.actions'], { name: c.name }) }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.delete'] }));
    await userEvent.type(await screen.findByLabelText(`Type ${c.name} to confirm`), c.name);
    await userEvent.click(screen.getByRole('button', { name: strings['delete.go'] }));
    const title = fill(strings['delete.title'], { name: c.name });
    const dlg = await screen.findByRole('alertdialog', { name: title });
    expect(await within(dlg).findByText(fill(strings['held.remove'], { name: c.name }), {}, { timeout: 8000 })).toBeInTheDocument();
    expect(removeSends).toHaveLength(1);
    api.landed = true;
    await userEvent.click(within(dlg).getByRole('button', { name: strings['held.check'] }));
    // Proved: the dialog is gone, so no armed Delete is left to press.
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: title })).not.toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByRole('button', { name: strings['delete.go'] })).not.toBeInTheDocument();
    expect(removeSends).toHaveLength(1);
  }, 40000);
});
