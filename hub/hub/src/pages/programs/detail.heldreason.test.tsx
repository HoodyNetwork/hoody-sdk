// The open program's Restart and Stop while its last change may have gone through: off, and each says why (the same
// words its row actions and its ports give), never greyed with no reason.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

describe('program details: a held change turns the header actions off with a reason', () => {
  it('Restart and Stop say they wait for the last action', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    // The details' own controls: the ones outside the list's rows.
    const head = (name: string) => {
      const b = screen.getAllByRole('button', { name }).find((x) => x.closest('[role="row"]') === null);
      if (!b) throw new Error(`no details ${name}`);
      return b;
    };
    await waitFor(() => head('Restart web'));
    await userEvent.click(head('Restart web'));
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    for (const name of ['Restart web', 'Stop web']) expect(head(name)).toHaveAccessibleDescription(expect.stringContaining(strings['ports.held']));
  });

  it('Start with the computer stays reachable and says the same reason', async () => {
    await renderPage(page, { state: 'press-pending', path: '/programs?sel=prog%3A1' });
    const restart = await waitFor(() => {
      const b = screen.getAllByRole('button', { name: 'Restart web' }).find((x) => x.closest('[role="row"]') === null);
      if (!b) throw new Error('no details Restart web');
      return b;
    });
    await userEvent.click(restart);
    await waitFor(() => expect(document.querySelector('[data-outcome="pending"]')).not.toBeNull());
    const boot = screen.getByRole('switch', { name: strings.bootSwitch });
    expect(boot).not.toBeDisabled();
    expect(boot).toHaveAttribute('aria-disabled', 'true');
    expect(boot).toHaveAccessibleDescription(expect.stringContaining(strings['ports.held']));
  });
});
