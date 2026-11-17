// The SSH key help (now kit/forms/SshKeyHelp, tested there for its steps and the key made in the browser) as
// Computers uses it: offered in the SSH key drawer, and the browser's system picked first.
import { within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen as pageScreen, userEvent as pageUser } from '@app/testing';
import { interpolate } from '@kit';
import { guessKeyOs } from './parts/SshKeyHelp';
import page from './page';
import strings from './strings.en.json';
import kitSsh from '@kit/forms/SshKeyHelp.strings.en.json';

describe('computers: help to make an SSH key', () => {
  it('the system is guessed from the browser, Linux when unknown', () => {
    expect(guessKeyOs('Win32')).toBe('windows');
    expect(guessKeyOs('MacIntel')).toBe('mac');
    expect(guessKeyOs('Linux x86_64')).toBe('linux');
    expect(guessKeyOs('')).toBe('linux');
  });

  it('the SSH key drawer offers the help', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2&tab=connect' });
    const btn = await pageScreen.findByRole('button', { name: /^(Replace key|Add a key)$/ }, { timeout: 8000 });
    await pageUser.click(btn);
    const d = await pageScreen.findByRole('dialog', { name: interpolate(strings['sshd.title'], { name: 'borealis' }) });
    expect(within(d).getByRole('button', { name: kitSsh['sshhelp.title'] })).toBeInTheDocument();
  });
  // "Use this key" puts the key in the field and folds the help; opening it again still shows the key.
  describe('after "Use this key"', () => {
    const useIn = async (d: HTMLElement) => {
      const title = () => within(d).getByRole('button', { name: kitSsh['sshhelp.title'] });
      await pageUser.click(title());
      await pageUser.click(within(d).getByRole('button', { name: kitSsh['sshhelp.make.go'] }));
      await pageUser.click(await within(d).findByRole('button', { name: kitSsh['sshhelp.made.download'] }));
      const line = within(d).getByText(/^ssh-ed25519 /, { ignore: 'textarea, script, style' }).textContent;
      await pageUser.click(within(d).getByRole('button', { name: kitSsh['sshhelp.saved.use'] }));
      await vi.waitFor(() => expect(title()).toHaveAttribute('aria-expanded', 'false'));
      await pageUser.click(title());
      expect(within(d).getByText(/^ssh-ed25519 /, { ignore: 'textarea, script, style' }).textContent).toBe(line);
      return line;
    };
    const stubUrl = () => vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() }));

    it('the SSH key drawer folds the help once the key is in the field', async () => {
      stubUrl();
      try {
        await renderPage(page, { path: '/computers?sel=borealis.00b2&tab=connect' });
        await pageUser.click(await pageScreen.findByRole('button', { name: /^(Replace key|Add a key)$/ }, { timeout: 8000 }));
        const d = await pageScreen.findByRole('dialog', { name: interpolate(strings['sshd.title'], { name: 'borealis' }) });
        const line = await useIn(d);
        expect(within(d).getAllByDisplayValue(line!).length).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    }, 40000);

    it('the create drawer folds the help once the key is in the field', async () => {
      stubUrl();
      try {
        await renderPage(page);
        await pageUser.click((await pageScreen.findAllByRole('button', { name: strings['action.get'] }, { timeout: 8000 }))[0] as HTMLElement);
        const d = await pageScreen.findByRole('dialog');
        await pageUser.click(within(d).getByRole('button', { name: new RegExp(strings['create.more'] ?? 'More') }));
        const line = await useIn(d);
        expect((within(d).getByLabelText(strings['create.ssh']) as HTMLTextAreaElement).value).toBe(line);
      } finally {
        vi.unstubAllGlobals();
      }
    }, 40000);
  });
});
