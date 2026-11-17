// Keys > SSH key: a Remove left unconfirmed, then checked from its dialog, may find the computer now held by another
// page's change. The tab then shows that change read-only, and the remove dialog has nothing left to check: it closes,
// as it does when the send itself is refused under another page's hold (HELD_BY_OTHER).
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import type * as Data from './data';

vi.mock('./data', async (importOriginal) => {
  const real = await importOriginal<typeof Data>();
  // The computer's fresh read finds it gone, so the Check goes straight to settling the change.
  return { ...real, useFreshComputer: () => async () => ({ gone: true }) };
});

describe('keys: SSH remove checked into another page\'s hold', () => {
  it('closes the remove dialog', async () => {
    const data = await import('./data');
    await renderPage(page, { state: 'pendingOps' });
    await userEvent.click(await screen.findByRole('tab', { name: new RegExp(strings['tab.ssh']) }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ssh.remove'] }));
    const ask = await screen.findByRole('alertdialog');
    await userEvent.click(within(ask).getByRole('button', { name: strings['ssh.rmGo'] }));
    const check = await within(ask).findByRole('button', { name: /Check/ }, { timeout: 8000 });
    // Settling finds the computer held by another page's change.
    vi.spyOn(data.useSettleChange(), 'ssh').mockResolvedValue({ from: null });
    await userEvent.click(check);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  }, 40000);
});
