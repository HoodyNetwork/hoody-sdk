// Keys > SSH key, a key made here ("Make one here" sits right under the key it makes). The flow ends in
// using it: after the private half is downloaded, "Use this key on this computer" sends the public line through the
// tab's own save (its C9 outcome), and once it went through the tab says the computer uses it and keeps the steps to
// put the private key in place and connect (ssh -i). Nothing is sent before that press.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { setTarget } from '@core/shell';
import { interpolate } from '@kit';
import kitSsh from '@kit/forms/SshKeyHelp.strings.en.json';
import { sent, sshSetBodies } from './fixtures';
import page from './page';
import strings from './strings.en.json';

/** A key is pasted, as people do: one input event (typing ~100 characters one by one re-renders the page per key,
 *  which under host load alone outlasts the test timeout). */
const pasteInto = async (el: HTMLElement, text: string) => {
  await userEvent.click(el);
  await userEvent.paste(text);
};

const openMade = async (state: string) => {
  await renderPage(page, { state });
  await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
  await userEvent.click(await screen.findByRole('button', { name: strings['ssh.set'] }));
  await userEvent.click(screen.getByRole('button', { name: kitSsh['sshhelp.title'] }));
  await userEvent.click(screen.getByRole('button', { name: kitSsh['sshhelp.make.go'] }));
  await userEvent.click(await screen.findByRole('button', { name: kitSsh['sshhelp.made.download'] }));
};
const useButton = () => screen.getByRole('button', { name: kitSsh['sshhelp.saved.useSet'] });

describe('keys: a key made here ends in using it', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() }));
    sshSetBodies.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('before Use, the key is said to be unused and nothing was sent; the button names the computer', async () => {
    const before = sent.setSsh;
    await openMade('sshMakeUse');
    expect(screen.getByText(interpolate(kitSsh['sshhelp.saved.notYetOn'], { computer: 'atlas' }))).toBeInTheDocument();
    expect(useButton()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: kitSsh['sshhelp.saved.use'] })).toBeNull();
    expect(sent.setSsh).toBe(before);
  }, 30000);

  it('Use sends the made public line once; the tab then shows it as the current key, with the steps to finish', async () => {
    const before = sent.setSsh;
    await openMade('sshMakeUse');
    await userEvent.click(useButton());
    expect(await screen.findByText(interpolate(strings['ssh.made.title'], { name: 'atlas' }))).toBeInTheDocument();
    expect(sent.setSsh).toBe(before + 1);
    const line = sshSetBodies[0];
    expect(line).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5\S+ hoody-atlas-[a-z0-9]{4}$/);
    const file = line!.split(' ')[2]!;
    // The editor closed: the current key row shows the made key (its comment), the finish block its file.
    expect(screen.queryByLabelText(strings['ssh.field'])).toBeNull();
    const done = screen.getByRole('region', { name: interpolate(strings['ssh.made.title'], { name: 'atlas' }) });
    // The steps are coloured shell lines (in parts): read each line whole.
    const lines = [...done.querySelectorAll('pre > span, code')].map((l) => l.textContent ?? '');
    const sshLine = new RegExp(`ssh -i \\S*${file}\\S* -o IdentitiesOnly=yes atlas\\.ssh\\.hoody\\.example`);
    expect(lines.some((l) => sshLine.test(l))).toBe(true);
    expect(lines.some((l) => new RegExp(`Downloads\\S*${file}`).test(l))).toBe(true);
    // The current key row (outside the finish block) names the made key.
    expect(screen.getAllByText(new RegExp(file)).filter((el) => !done.contains(el)).length).toBeGreaterThan(0);
    await userEvent.click(within(done).getByRole('button', { name: strings['ssh.made.dismiss'] }));
    expect(screen.queryByRole('region', { name: interpolate(strings['ssh.made.title'], { name: 'atlas' }) })).toBeNull();
  }, 30000);

  it('a later save of the computer takes the finished block away', async () => {
    await openMade('sshMakeUse');
    await userEvent.click(useButton());
    const title = interpolate(strings['ssh.made.title'], { name: 'atlas' });
    expect(await screen.findByText(title)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.replace'] }));
    await pasteInto(screen.getByLabelText(strings['ssh.field']), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000002 a@b');
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.saveReplace'] }));
    await waitFor(() => expect(sshSetBodies).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText(title)).toBeNull());
  }, 30000);

  it('the finished block belongs to its computer: another computer on screen does not show it', async () => {
    await openMade('sshMakeUse');
    await userEvent.click(useButton());
    const title = interpolate(strings['ssh.made.title'], { name: 'atlas' });
    expect(await screen.findByText(title)).toBeInTheDocument();
    act(() => setTarget({ project: { id: 'p1' }, container: { id: 'c0a7150000000000000000b2' } }));
    expect(await screen.findByText('zephyr')).toBeInTheDocument();
    expect(screen.queryByText(title)).toBeNull();
  }, 30000);

  it('a Use whose answer may have gone through shows the pending banner, never the finished block', async () => {
    await openMade('sshNonePending');
    await userEvent.click(useButton());
    expect(await screen.findByText(strings['ssh.pendingTitle'])).toBeInTheDocument();
    expect(screen.queryByText(interpolate(strings['ssh.made.title'], { name: 'atlas' }))).toBeNull();
  }, 30000);

  it('the made key saved by hand through Save, its answer unknown: the help no longer says nothing was sent', async () => {
    await openMade('sshNonePending');
    const line = screen.getByText(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5\S+ hoody-atlas-[a-z0-9]{4}$/).textContent ?? '';
    const notYet = interpolate(kitSsh['sshhelp.saved.notYetOn'], { computer: 'atlas' });
    expect(screen.getByText(notYet)).toBeInTheDocument();
    await pasteInto(screen.getByLabelText(strings['ssh.field']), line);
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.save'] }));
    expect(await screen.findByText(strings['ssh.pendingTitle'])).toBeInTheDocument();
    expect(screen.queryByText(notYet)).toBeNull();
    expect(screen.queryByText(kitSsh['sshhelp.saved.notYet'])).toBeNull();
  }, 30000);

  it('once the made key was sent, a later send of another key never brings back "nothing was sent"', async () => {
    await openMade('sshNonePending');
    const line = screen.getByText(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5\S+ hoody-atlas-[a-z0-9]{4}$/).textContent ?? '';
    const notYet = interpolate(kitSsh['sshhelp.saved.notYetOn'], { computer: 'atlas' });
    const field = screen.getByLabelText(strings['ssh.field']);
    await pasteInto(field, line);
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.save'] }));
    expect(await screen.findByText(strings['ssh.pendingTitle'])).toBeInTheDocument();
    // The person dismisses the unknown outcome (that proves nothing), then saves another key.
    await userEvent.click(screen.getByRole('button', { name: strings['dismiss.act'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['dismiss.go'] }));
    await waitFor(() => expect(screen.queryByText(strings['ssh.pendingTitle'])).toBeNull());
    await userEvent.clear(field);
    await pasteInto(field, 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000004 a@b');
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.save'] }));
    expect(await screen.findByText(strings['ssh.pendingTitle'])).toBeInTheDocument();
    expect(screen.queryByText(notYet)).toBeNull();
  }, 30000);

  it('another key saved by hand leaves the made key\'s line: that key was not sent', async () => {
    await openMade('sshNonePending');
    const notYet = interpolate(kitSsh['sshhelp.saved.notYetOn'], { computer: 'atlas' });
    await pasteInto(screen.getByLabelText(strings['ssh.field']), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000003 a@b');
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.save'] }));
    expect(await screen.findByText(strings['ssh.pendingTitle'])).toBeInTheDocument();
    expect(screen.getByText(notYet)).toBeInTheDocument();
  }, 30000);

  it('a key pasted and saved by hand shows no finished block', async () => {
    await renderPage(page, { state: 'sshMakeUse' });
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.set'] }));
    await pasteInto(screen.getByLabelText(strings['ssh.field']), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000001 a@b');
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.save'] }));
    // Saved: the editor closes and the current key row shows the pasted key.
    expect(await screen.findByRole('button', { name: strings['ssh.replace'] })).toBeInTheDocument();
    expect(sshSetBodies).toHaveLength(1);
    expect(screen.queryByText(interpolate(strings['ssh.made.title'], { name: 'atlas' }))).toBeNull();
  }, 30000);

  it('with no key set, no connect command is offered (it could not work)', async () => {
    await renderPage(page, { state: 'sshNone' });
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
    expect(await screen.findByRole('button', { name: strings['ssh.set'] })).toBeInTheDocument();
    expect(screen.queryByText(strings['ssh.connect'])).toBeNull();
  }, 30000);

  it('with a key set, the connect command is there', async () => {
    await renderPage(page);
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
    expect(await screen.findByRole('button', { name: strings['ssh.replace'] })).toBeInTheDocument();
    expect(screen.getByText(strings['ssh.connect'])).toBeInTheDocument();
  }, 30000);
});
