// Keys follow-ups: an unnamed key's Delete question names it "Unnamed key" in its body too, and an SSH
// Check again whose computer read throws still ends: "checking" clears and Dismiss comes back. A remove whose Check
// finds the key still there says the removal is not confirmed (not the Save's "does not hold this key yet").
import { describe, expect, it, vi } from 'vitest';
import { isOff, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import type * as Data from './data';

const armed = vi.hoisted(() => ({ on: false }));
vi.mock('./data', async (importOriginal) => {
  const real = await importOriginal<typeof Data>();
  return {
    ...real,
    useFreshComputer: () => {
      const read = real.useFreshComputer();
      return (id: string) => (armed.on ? Promise.reject(new Error('read threw')) : read(id));
    },
  };
});

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 a@b';

describe('keys: follow-ups', () => {
  it('an unnamed key\'s Delete question names it "Unnamed key" in its body as well as its title', async () => {
    await renderPage(page, { state: 'unnamedKey' });
    const name = new RegExp(strings.unnamed);
    await screen.findByRole('row', { name }, { timeout: 8000 });
    await waitFor(
      async () => {
        if (screen.getByRole('row', { name }).getAttribute('aria-selected') !== 'true') await userEvent.click(screen.getByRole('row', { name }));
        expect(screen.getByRole('row', { name })).toHaveAttribute('aria-selected', 'true');
      },
      { timeout: 10000, interval: 300 },
    );
    await userEvent.click(await screen.findByRole('button', { name: strings['act.delete'] }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(new RegExp(strings['del.plain'].replace('{{name}}', strings.unnamed).replace(/\./g, '\\.')))).toBeInTheDocument();
  }, 40000);

  it('a Check again whose computer read throws clears checking: Dismiss is usable again', async () => {
    armed.on = false;
    await renderPage(page, { state: 'sshCheckReadFails' });
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.replace'] }, { timeout: 8000 }));
    await userEvent.click(screen.getByLabelText(strings['ssh.field']));
    await userEvent.paste(KEY);
    await userEvent.click(screen.getByRole('button', { name: strings['ssh.saveReplace'] }));
    await screen.findByText(strings['ssh.pendingTitle'], {}, { timeout: 8000 });
    armed.on = true;
    await userEvent.click(screen.getByRole('button', { name: strings['action.checkAgain'] }));
    await new Promise((r) => setTimeout(r, 300));
    await waitFor(() => expect(isOff(screen.getByRole('button', { name: strings['dismiss.act'] }))).toBe(false), { timeout: 5000 });
    armed.on = false;
  }, 40000);

  it('a remove whose Check finds the key still there says the removal is not confirmed', async () => {
    await renderPage(page, { state: 'pendingOps' });
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.remove'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.rmGo'] }));
    // The banner's Check again (the last one; the dialog's comes first).
    await userEvent.click((await screen.findAllByRole('button', { name: strings['action.checkAgain'] }, { timeout: 8000 })).at(-1)!);
    const said = strings['ssh.checkedNotRemoved'].replace('{{name}}', 'atlas');
    expect((await screen.findAllByText(said, {}, { timeout: 8000 })).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['ssh.checkedNot'].replace('{{name}}', 'atlas'))).toBeNull();
  }, 40000);
});
