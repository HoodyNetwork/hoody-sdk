// Get a computer, SSH key field: a line under the field says the key is optional, because the
// terminal is always reachable in the browser (Hoody Terminal) without one. That terminal comes with the Hoody kit, so
// with the kit off the line is gone (create.copy-choice: no help line promises a browser terminal without the kit).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

async function openMore() {
  await renderPage(page, { path: '/computers' });
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
  const d = await screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
  await userEvent.click(within(d).getByRole('button', { name: new RegExp(`^${strings['create.more']}`) }));
  return d;
}

describe('create: the SSH key is optional', () => {
  it('the field says so: the browser terminal works without a key', async () => {
    const d = await openMore();
    expect(strings['create.sshOptional']).toMatch(/optional/i);
    expect(strings['create.sshOptional']).toMatch(/Hoody Terminal/);
    const field = within(d).getByRole('textbox', { name: strings['create.ssh'] });
    expect(field).toHaveAccessibleDescription(expect.stringContaining(strings['create.sshOptional']));
  }, 40000);

  it('with the Hoody kit off there is no browser terminal, so the line is gone', async () => {
    const d = await openMore();
    await userEvent.click(within(d).getByRole('switch', { name: new RegExp(strings['create.hoodyKit']) }));
    const ask = await screen.findByRole('alertdialog', {}, { timeout: 4000 });
    await userEvent.click(within(ask).getByRole('button', { name: strings['create.kitOffGo'] }));
    const field = within(d).getByRole('textbox', { name: strings['create.ssh'] });
    expect(field).not.toHaveAccessibleDescription(expect.stringContaining('Hoody Terminal'));
    expect(within(d).queryByText(strings['create.sshOptional'])).toBeNull();
  }, 40000);
});
