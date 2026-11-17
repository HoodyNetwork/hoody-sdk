// Keys > API keys: while a row's Check again is reading, that row's Check again shows it is busy and its Dismiss is
// off, in the row and in the inspector (a Dismiss now could free a change the read is about to settle).
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';
import { slowGate } from './fixtures';

afterEach(() => slowGate.reset());

describe('keys: a row Check again that is out', () => {
  it('marks its Check again busy and turns its Dismiss off until the read answers', async () => {
    await renderPage(page, { state: 'readSlow' });
    const row = () => screen.getByRole('row', { name: /ci-deploy/ });
    await screen.findByRole('row', { name: /ci-deploy/ }, { timeout: 8000 });
    await userEvent.click(row());
    await userEvent.click(await screen.findByRole('button', { name: strings['act.pause'] }));
    const check = await within(row()).findByRole('button', { name: strings['state.checkAgain'] }, { timeout: 8000 });
    const dismiss = () => within(row()).getByRole('button', { name: strings['dismiss.act'] });
    expect(dismiss()).toBeEnabled();
    slowGate.hold();
    await userEvent.click(check);
    await waitFor(() => expect(slowGate.arrived).toBeGreaterThan(0));
    await waitFor(() => expect(within(row()).getByRole('button', { name: strings['state.checkAgain'] })).toHaveAttribute('data-pending'));
    expect(dismiss()).toBeDisabled();
    // The inspector's Dismiss is off too.
    const insp = screen.getByRole('region', { name: 'Details' });
    expect(within(insp).getByRole('button', { name: strings['dismiss.act'] })).toBeDisabled();
    slowGate.release();
    await waitFor(() => expect(dismiss()).toBeEnabled(), { timeout: 8000 });
  }, 40000);
});
