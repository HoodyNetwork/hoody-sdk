// Keys > SSH key: the kit SshKeyHelp sits under the key field. A key made in the browser is named
// for the computer, and "Use this key on this computer" puts its public line in the field and sends it (the
// rest of that flow is ssh-make.test.tsx). A key another computer already uses is refused with words that say so and
// what to do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent } from '@app/testing';
import { interpolate } from '@kit';
import kitSsh from '@kit/forms/SshKeyHelp.strings.en.json';
import page from './page';
import strings from './strings.en.json';

/** A key is pasted, as people do: one input event (typing ~100 characters one by one re-renders the page per key,
 *  which under host load alone outlasts the test timeout). */
const pasteInto = async (el: HTMLElement, text: string) => {
  await userEvent.click(el);
  await userEvent.paste(text);
};

const openSsh = async () => {
  await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
  await userEvent.click(await screen.findByRole('button', { name: strings['ssh.set'] }));
};

describe('keys: SSH key help', () => {
  beforeEach(() => {
    // jsdom has no object URLs: the download goes nowhere, which is all these tests need.
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a key made in the browser, once downloaded and used, goes in the field named for the computer and is sent (refused here: in use)', async () => {
    await renderPage(page, { state: 'sshInUse' });
    await openSsh();
    await userEvent.click(screen.getByRole('button', { name: kitSsh['sshhelp.title'] }));
    expect(screen.getByText(/this key's file is named hoody-atlas-[a-z0-9]{4}\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: kitSsh['sshhelp.make.go'] }));
    await userEvent.click(await screen.findByRole('button', { name: kitSsh['sshhelp.made.download'] }));
    await userEvent.click(screen.getByRole('button', { name: kitSsh['sshhelp.saved.useSet'] }));
    expect(await screen.findByText(interpolate(strings['ssh.inUse'], { name: 'atlas' }))).toBeInTheDocument();
    expect((screen.getByLabelText(strings['ssh.field']) as HTMLTextAreaElement).value).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5\S+ hoody-atlas-[a-z0-9]{4}$/);
  }, 30000);

  it('a key another computer uses: the banner says so and points to making a new one', async () => {
    await renderPage(page, { state: 'sshInUse' });
    await openSsh();
    await pasteInto(screen.getByLabelText(strings['ssh.field']), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b');
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.save'] }));
    expect(await screen.findByText(interpolate(strings['ssh.inUse'], { name: 'atlas' }))).toBeInTheDocument();
  }, 30000);
});
