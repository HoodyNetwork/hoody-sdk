// Vitest: in a schedule's Advanced section, Show swaps itself for Hide and back. Focus follows the swap,
// so a keyboard user stays on the control they pressed instead of falling back to the page.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { opsStore } from './parts/ops';
import page from './page';
import strings from './strings.en.json';

afterEach(() => opsStore.reset());

describe('Advanced: Show and Hide keep focus', () => {
  it('moves focus to Hide after the reveal and back to Show after hiding', async () => {
    await renderPage(page, { state: 'act-pending', path: '/schedules?sel=loop%3Asess_02%2Floop_5e6f7a8b' });
    const inspector = await screen.findByRole('region', { name: 'Details' });
    const show = await within(inspector).findByRole('button', { name: strings['a.showPrompt'] }, { timeout: 5000 });
    show.focus();
    await userEvent.keyboard('{Enter}');
    const hide = await within(inspector).findByRole('button', { name: strings['adv.hide'] });
    await waitFor(() => expect(document.activeElement).toBe(hide));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(within(inspector).getByRole('button', { name: strings['a.showPrompt'] })));
  });
});
