// The vault edit drawer. A browser that cannot encrypt here (no secure context) says so on the
// Encrypt box and cannot tick it, before any password is typed; and the Why's links follow its answer's order (value,
// encrypting, metadata).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

afterEach(() => vi.unstubAllGlobals());

describe('vault edit drawer: no secure context, and the realm it writes to', () => {
  it('without a secure context, the Encrypt box says why and cannot be ticked', async () => {
    vi.stubGlobal('isSecureContext', false);
    await renderPage(page, { path: '/vault?edit=replace:github-token' });
    const dlg = await screen.findByRole('dialog');
    const box = await within(dlg).findByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) });
    expect(box).toBeDisabled();
    expect(within(dlg).getByText(strings['edit.encryptNoCrypto'])).toBeInTheDocument();
  }, 30000);

  it('with a secure context, the box is offered as before', async () => {
    vi.stubGlobal('isSecureContext', true);
    await renderPage(page, { path: '/vault?edit=replace:github-token' });
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByRole('checkbox', { name: new RegExp(strings['edit.encrypt']) })).toBeEnabled();
  }, 30000);

  it("the Why's links come in its answer's order: value, encrypting, metadata", async () => {
    await renderPage(page, { path: '/vault?edit=replace:github-token' });
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: strings['edit.why.q'] }));
    const want = [strings['edit.valueMore'], strings['edit.encryptMore'], strings['edit.metaMore']];
    const got = within(dlg)
      .getAllByRole('link')
      .map((l) => l.textContent ?? '')
      .filter((x) => want.includes(x));
    expect(got).toEqual(want);
  }, 30000);
});
