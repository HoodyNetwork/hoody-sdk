// Vitest: the Bot page's wiring of the key drawer. `?drawer=key:<id>` opens the drawer for that key and no other: an id
// that is not among the link's keys (revoked elsewhere, an old address) shows "not on the link any more" and offers no
// "Make key". The page must pass the id it was opened for: the drawer alone cannot tell "no key" from "that key is gone".
// While the link's keys are not read (the read still out, or failed) the drawer says "not read yet", never "gone": the
// page must also pass whether the keys are read. Neither state can send anything: Save is off and pressing it does nothing.
// Controls: an id that is there edits it; `?drawer=key` is New key.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = (drawer: string) => `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link&drawer=${drawer}`;

/** The drawer opened for a key it does not have: "Edit key", the notice, Save off, nothing that makes a key, nothing sent. */
async function lostDrawer(notice: string) {
  const dialog = await screen.findByRole('dialog', { name: strings['keyForm.editTitle'] });
  expect(await within(dialog).findByText(notice)).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: strings['keyForm.newTitle'] })).toBeNull();
  expect(screen.queryByRole('button', { name: strings['keyForm.create'] })).toBeNull();
  expect(within(dialog).queryByLabelText(strings['keyForm.name'])).toBeNull();
  const save = within(dialog).getByRole('button', { name: strings['ui.save'] }) as HTMLButtonElement;
  expect(save.disabled || save.getAttribute('aria-disabled') === 'true').toBe(true);
  await userEvent.click(save).catch(() => undefined);
  // Nothing went out: no key was made (its secret would be shown), no outcome is said, the drawer is as it was.
  expect(screen.queryByRole('button', { name: strings['secret.done'] })).toBeNull();
  expect(dialog.querySelector('[data-outcome]')).toBeNull();
  expect(within(dialog).getByText(notice)).toBeInTheDocument();
  return dialog;
}

describe('the Bot page opens the key drawer for the key in the address', () => {
  beforeAll(async () => {
    await import('./view');
  }, 30000);

  it('an id that is not among the keys: the drawer says so and offers no new key', async () => {
    await renderPage(page, { state: 'idle', path: at('key:k-not-there') });
    const dialog = await lostDrawer(strings['keyForm.gone']);
    expect(within(dialog).queryByText(strings['keyForm.unread'])).toBeNull();
  }, 30000);

  it.each(['linkReadPending', 'linkReadFailed'])('the keys are not read (%s): the drawer says not read yet, never gone, and offers no new key', async (state) => {
    await renderPage(page, { state, path: at('key:k1a2b3c4d5e6') });
    const dialog = await lostDrawer(strings['keyForm.unread']);
    expect(within(dialog).queryByText(strings['keyForm.gone'])).toBeNull();
  }, 30000);

  it('an id that is there: its form, to save', async () => {
    await renderPage(page, { state: 'idle', path: at('key:k1a2b3c4d5e6') });
    const dialog = await screen.findByRole('dialog', { name: strings['keyForm.editTitle'] });
    expect((within(dialog).getByLabelText(strings['keyForm.name']) as HTMLInputElement).value).toBe('website widget');
    expect(within(dialog).queryByText(strings['keyForm.gone'])).toBeNull();
    expect(within(dialog).getByRole('button', { name: strings['ui.save'] })).toBeInTheDocument();
  }, 30000);

  it('no id: New key', async () => {
    await renderPage(page, { state: 'idle', path: at('key') });
    const dialog = await screen.findByRole('dialog', { name: strings['keyForm.newTitle'] });
    expect(within(dialog).getByRole('button', { name: strings['keyForm.create'] })).toBeInTheDocument();
  }, 30000);
});
