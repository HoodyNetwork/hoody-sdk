// Keys > SSH key banners: a Check again whose read fails says so (as the API keys tab does), and a banner that
// only reports (the save failed, or nothing was sent) can be hidden.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b';

const saveKey = async (state: string, open: string) => {
  await renderPage(page, { state });
  await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
  await userEvent.click(await screen.findByRole('button', { name: strings[open as keyof typeof strings] }, { timeout: 8000 }));
  await userEvent.click(screen.getByLabelText(strings['ssh.field']));
  await userEvent.paste(KEY);
  const save = open === 'ssh.set' ? strings['ssh.save'] : strings['ssh.saveReplace'];
  await userEvent.click(screen.getByRole('button', { name: save }));
};

describe('keys: SSH key banners', () => {
  it('a Check again whose read fails says it could not read the computer, and the change stays tracked', async () => {
    await saveKey('sshCheckReadFails', 'ssh.replace');
    await screen.findByText(strings['ssh.pendingTitle']);
    await userEvent.click(screen.getByRole('button', { name: strings['action.checkAgain'] }));
    const said = strings['op.readFailed'].replace('{{name}}', 'atlas');
    expect(await screen.findByText(said, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(strings['ssh.pendingTitle'])).toBeInTheDocument();
  }, 40000);

  it('a failed save banner can be hidden', async () => {
    await saveKey('sshFailsThenHeld', 'ssh.set');
    const failed = strings['ssh.failed'].replace('{{name}}', 'atlas');
    expect(await screen.findByText(failed)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide this note' }));
    await waitFor(() => expect(screen.queryByText(failed)).toBeNull());
  }, 40000);
});
