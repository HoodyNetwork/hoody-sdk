// Vitest: the new-command form says who the command runs as: the main account can use sudo without a
// password, so most commands never need Root. The line follows the choice and is read with the group; the InfoTip
// on "Run as" names what the setting is.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

async function openCommandForm() {
  await renderPage(page, { path: '/schedules?edit=new' });
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['new.cmd']) }));
  return screen.getByRole('radiogroup', { name: strings['e.user'] });
}

describe('schedules: Run as', () => {
  it('starts on the main account and says it can use sudo without a password', async () => {
    const group = await openCommandForm();
    expect(screen.getByText(strings['e.userMainHelp'])).toBeInTheDocument();
    expect(strings['e.userMainHelp']).toMatch(/sudo without a password/);
    expect(group).toHaveAccessibleDescription(strings['e.userMainHelp']);
    expect(screen.queryByText(strings['e.userRootHelp'])).toBeNull();
  });

  it('follows the choice: Root says it runs as root', async () => {
    const group = await openCommandForm();
    await userEvent.click(screen.getByRole('radio', { name: strings['ed.runAsRoot'] }));
    expect(screen.getByText(strings['e.userRootHelp'])).toBeInTheDocument();
    expect(group).toHaveAccessibleDescription(strings['e.userRootHelp']);
    expect(screen.queryByText(strings['e.userMainHelp'])).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: strings['e.userMain'] }));
    expect(group).toHaveAccessibleDescription(strings['e.userMainHelp']);
  });

  it('shows a visible Run as name with an InfoTip that explains it', async () => {
    await openCommandForm();
    const tip = screen.getByRole('button', { name: new RegExp(strings['e.user']) });
    await userEvent.click(tip);
    expect(await screen.findByText(strings['e.userTip'])).toBeInTheDocument();
  });

  it('drops the unused cron-users note', () => {
    expect(strings).not.toHaveProperty('n.cronUsers');
  });
});
