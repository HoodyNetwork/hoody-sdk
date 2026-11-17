// Vitest: Run now on an errored loop also turns it back on. When that run may have gone
// through, neither the row nor the inspector shows a switch (it would read "off" while the loop may be on).
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

afterEach(() => opsStore.reset());

const KEY = 'loop%3Asess_02%2Floop_5e6f7a8b';

describe('Run now on an errored loop that may have gone through', () => {
  it('shows on-or-off as not known in the row and the inspector', async () => {
    await renderPage(page, { state: 'act-pending', path: `/schedules?sel=${KEY}` });
    const row = () => document.querySelector<HTMLElement>('tbody tr[data-row-id="loop:sess_02/loop_5e6f7a8b"]')!;
    await waitFor(() => expect(row()).not.toBeNull());
    const inspector = await screen.findByRole('region', { name: 'Details' });
    // Before: the errored loop reads off, with a switch, in both places.
    await waitFor(() => expect(within(inspector).getByRole('switch')).toBeTruthy());
    expect(within(row()).getByRole('switch')).toBeTruthy();
    await userEvent.click(within(inspector).getAllByRole('button', { name: new RegExp(strings['action.runNow']) })[0]!);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(strings['c.loop.resume'])).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['action.runNow'] }));
    await waitFor(() => expect(within(inspector).getByText(strings['on.unknown'])).toBeTruthy());
    expect(within(inspector).queryByRole('switch')).toBeNull();
    expect(within(row()).queryByRole('switch')).toBeNull();
    expect(within(row()).getByLabelText(strings['on.unknown'])).toBeTruthy();
  });
});
