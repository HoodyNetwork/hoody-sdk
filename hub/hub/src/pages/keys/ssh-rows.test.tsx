// Keys > SSH key: the computer, its key and the connect line are rows of one kit SettingGroup; Replace sits on the key's
// row, and Remove is the danger group's (it still asks first, in the confirm dialog, before anything is sent).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const openSsh = async () => {
  await renderPage(page);
  await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
};

describe('keys: the SSH tab rows', () => {
  it('the rows are one setting group, Replace on the key row, Remove alone in the danger group', async () => {
    await openSsh();
    const replace = await screen.findByRole('button', { name: strings['ssh.replace'] }, { timeout: 8000 });
    const group = screen.getByRole('group', { name: strings['ssh.group'] });
    expect(group).toContainElement(replace);
    expect(within(group).getByText(strings['ssh.current'])).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: strings['ssh.remove'] })).toBeNull();
    const remove = screen.getByRole('button', { name: strings['ssh.remove'] });
    expect(remove.closest('[data-sg-tone="danger"]')).not.toBeNull();
    // Pressing Remove only asks; nothing is sent before the confirm.
    await userEvent.click(remove);
    expect(await screen.findByRole('button', { name: strings['ssh.rmGo'] })).toBeInTheDocument();
  }, 30000);

  it('while the key is being replaced, Remove is out of the way', async () => {
    await openSsh();
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.replace'] }, { timeout: 8000 }));
    expect(screen.getByRole('textbox', { name: new RegExp(strings['ssh.field']) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['ssh.remove'] })).toBeNull();
  }, 30000);

  it('Replace hands the focus to the key field; Cancel comes before the save, as in every form', async () => {
    await openSsh();
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.replace'] }, { timeout: 8000 }));
    const field = screen.getByRole('textbox', { name: new RegExp(strings['ssh.field']) });
    expect(field).toHaveFocus();
    const cancel = screen.getByRole('button', { name: strings['ssh.cancel'] });
    const save = screen.getByRole('button', { name: strings['ssh.saveReplace'] });
    expect(cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, 30000);
});
