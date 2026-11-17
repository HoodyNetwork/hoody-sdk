// A drawer reopened on a held change offers nothing to send: the Held band replaces the form, so the footer
// says no "Unsaved changes" and its primary is disabled (the runner would refuse it anyway).
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import page from './page';
import strings from './strings.en.json';

describe('computers: a held change leaves nothing to send', () => {
  it('copy: after an unknown answer the footer is not dirty and Make copy is disabled', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=cedar.00c3&tab=ports' });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', 'cedar') }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['copyd.go'] }));
    expect(await within(dlg).findByRole('button', { name: strings['held.dismiss'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(within(dlg).queryByText(kitStrings['form.unsaved'])).toBeNull();
    expect(within(dlg).getByRole('button', { name: strings['copyd.go'] })).toBeDisabled();
  });
});
